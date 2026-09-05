// 運転系統 → N02 路線 の対応表を生成する。
//
// ODPT の運行情報は運転系統 (odpt:Railway) 単位で来るが、N02 は線路名称単位。
// 名前では突き合わないので、ODPT が持つ駅の並びを N02 の駅に当てて対応を導く。
// 詳細は scripts/lib/match-lines.mjs。
//
// 鍵の扱い: これは**ビルド時**のスクリプトなので、鍵は手元に置いたまま
// 生成物 (data/line-map.json) だけを配る。Pages に鍵は載らない。
// 実行時に運行情報を取りに行く部分は別問題 (→ vault/宿題.md)。
//
//   .env.local に書く。.gitignore 済みで、絶対にコミットしないこと。
//     ODPT_KEY=...            → api.odpt.org
//     ODPT_CHALLENGE_KEY=...  → api-challenge.odpt.org
//
// 2 つは配信されるデータが違うので、両方あるなら両方から取って統合する。
// どちらも無ければ公開エンドポイントにだけ当たる (都営 6 路線のみ)。

import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { indexStationsByName, matchSystem, normalizeStationName } from './lib/match-lines.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'data')

// 鍵の種類ごとに当たり先が決まっている。ODPT_TOKEN は別名として両方に試す。
const SOURCES = [
  { env: 'ODPT_KEY', base: 'https://api.odpt.org/api/v4' },
  { env: 'ODPT_CHALLENGE_KEY', base: 'https://api-challenge.odpt.org/api/v4' },
]
const PUBLIC_SOURCE = { env: '(公開)', base: 'https://api-public.odpt.org/api/v4', token: null }

/** .env.local と環境変数から鍵を読む。値はログに出さない。 */
async function readEnv() {
  const env = {}
  try {
    const text = await readFile(join(root, '.env.local'), 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
      if (m && m[2].trim()) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    // .env.local が無いのは異常ではない。公開分だけで動く。
  }
  for (const key of ['ODPT_KEY', 'ODPT_CHALLENGE_KEY', 'ODPT_TOKEN']) {
    if (process.env[key]) env[key] = process.env[key].trim()
  }
  return env
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

// path 側に既にクエリが付いていることがある (odpt:Station?odpt:operator=...)。
const endpoint = (base, path, token) => {
  if (!token) return `${base}/${path}`
  const sep = path.includes('?') ? '&' : '?'
  return `${base}/${path}${sep}acl:consumerKey=${encodeURIComponent(token)}`
}

/**
 * 使える取得元を決める。鍵が通らないものは落とす
 * (片方だけ持っている場合が普通にあるため、1 つ失敗しても止めない)。
 */
async function resolveSources(env) {
  const candidates = []
  for (const s of SOURCES) {
    const token = env[s.env] ?? env.ODPT_TOKEN ?? null
    if (token) candidates.push({ ...s, token })
  }

  const usable = []
  for (const c of candidates) {
    try {
      const operators = await getJson(endpoint(c.base, 'odpt:Operator', c.token))
      if (Array.isArray(operators) && operators.length > 0) {
        usable.push({ ...c, operators: operators.length })
      } else {
        console.log(`  ${c.env}: 通ったが事業者 0 件。使わない`)
      }
    } catch (err) {
      console.log(`  ${c.env}: 使えない (${err.message})`)
    }
  }

  if (usable.length === 0) {
    console.log('  鍵が 1 つも通らなかった。公開エンドポイントに落とす')
    return [PUBLIC_SOURCE]
  }
  return usable
}

async function main() {
  const env = await readEnv()
  console.log('ODPT:')
  const sources = await resolveSources(env)

  // 複数の取得元から集めて owl:sameAs で重複を除く。先に読んだ方を残す。
  const railways = new Map()
  const stations = new Map()
  const perSource = []

  for (const s of sources) {
    try {
      const rw = await getJson(endpoint(s.base, 'odpt:Railway', s.token))
      let newRailways = 0
      for (const r of rw) {
        const id = r['owl:sameAs']
        if (id && !railways.has(id)) {
          railways.set(id, r)
          newRailways++
        }
      }

      // odpt:Station は 1 回の応答が 1000 件で頭打ちになる。
      // 事業者ごとに引けば上限に当たらない。
      const operators = [...new Set(rw.map((r) => r['odpt:operator']).filter(Boolean))]
      let newStations = 0
      let failedOperators = 0
      for (const op of operators) {
        try {
          const st = await getJson(
            endpoint(s.base, `odpt:Station?odpt:operator=${encodeURIComponent(op)}`, s.token),
          )
          for (const x of st) {
            const id = x['owl:sameAs']
            if (id && !stations.has(id)) {
              stations.set(id, x)
              newStations++
            }
          }
        } catch {
          failedOperators++ // 事業者単位の欠落は珍しくない。全体は止めない。
        }
      }

      console.log(
        `  ${s.env}: 系統 ${rw.length} (新規 ${newRailways}) / 事業者 ${operators.length}` +
          ` / 新規駅 ${newStations}` +
          (failedOperators ? ` (取得できなかった事業者 ${failedOperators})` : ''),
      )
      perSource.push({
        endpoint: s.base,
        railways: rw.length,
        newRailways,
        operators: operators.length,
        newStations,
      })
    } catch (err) {
      console.log(`  ${s.env}: 取得に失敗 (${err.message})`)
    }
  }

  if (railways.size === 0) throw new Error('ODPT から系統を 1 つも取得できなかった')
  console.log(`統合: 系統 ${railways.size} / 駅 ${stations.size}`)

  // 駅の座標。stationOrder は駅 ID しか持たないので引き当てる。
  const coord = new Map()
  // 系統に属する駅。stationOrder を公開していない事業者はこちらから復元する。
  const stationsByRailway = new Map()
  for (const s of stations.values()) {
    const id = s['owl:sameAs']
    if (typeof s['geo:lat'] === 'number' && typeof s['geo:long'] === 'number') {
      coord.set(id, [s['geo:lat'], s['geo:long']])
    }
    const railway = s['odpt:railway']
    if (!railway) continue
    const bucket = stationsByRailway.get(railway)
    if (bucket) bucket.push(s)
    else stationsByRailway.set(railway, [s])
  }
  console.log(`座標が取れた駅: ${coord.size}/${stations.size}`)

  const railData = JSON.parse(await readFile(join(outDir, 'rail-lines.json'), 'utf8'))
  const byName = indexStationsByName(railData)

  const systems = []
  let noStationData = 0

  for (const rw of railways.values()) {
    const id = rw['owl:sameAs']
    const order = rw['odpt:stationOrder'] ?? []

    // stationOrder があればそれを使う。無ければ odpt:Station から集める。
    // 照合は駅の集合しか見ないので、並び順が失われても結果は変わらない。
    let stationsIn
    let stationSource
    if (order.length > 0) {
      stationSource = 'stationOrder'
      stationsIn = order.map((s) => {
        const c = coord.get(s['odpt:station'])
        return { name: s['odpt:stationTitle']?.ja ?? s['dc:title'] ?? '', lat: c?.[0], lon: c?.[1] }
      })
    } else {
      const members = stationsByRailway.get(id) ?? []
      if (members.length === 0) {
        noStationData++ // 駅を 1 つも公開していない系統。当てようがない。
        continue
      }
      stationSource = 'stations'
      stationsIn = members.map((s) => ({
        name: s['odpt:stationTitle']?.ja ?? s['dc:title'] ?? '',
        lat: typeof s['geo:lat'] === 'number' ? s['geo:lat'] : undefined,
        lon: typeof s['geo:long'] === 'number' ? s['geo:long'] : undefined,
      }))
    }

    stationsIn = stationsIn.filter((s) => s.name)
    if (stationsIn.length === 0) {
      noStationData++
      continue
    }

    // 事業者名は ODPT と N02 で表記が違うので絞り込みには使わない。
    // 代わりに座標で足切りする (matchSystem 側)。
    const result = matchSystem({ title: rw['dc:title'], stations: stationsIn }, byName)

    // 系統の駅座標。運転系統は N02 路線の一部しか走らないことがある
    // (山手線は東北線の田端〜東京しか使わない)。徒歩点検の区間長を出すとき、
    // 系統がどこを通っているかを知らないと路線全長を拾ってしまう。
    //
    // ODPT は 2 割の駅に座標を持たない (東海道新幹線・成田スカイアクセス線など
    // 空港アクセスの系統が丸ごと欠ける)。当てた N02 の駅から埋める。
    const chosen = new Set(result.lineIds)
    const geo = []
    for (const st of stationsIn) {
      if (typeof st.lat === 'number' && typeof st.lon === 'number') {
        geo.push([Number(st.lat.toFixed(4)), Number(st.lon.toFixed(4))])
        continue
      }
      const fallback = (byName.get(normalizeStationName(st.name)) ?? []).find((c) =>
        chosen.has(c.lineId),
      )
      if (fallback) geo.push([fallback.lat, fallback.lon])
    }

    systems.push({
      id,
      title: rw['dc:title'] ?? rw['odpt:railwayTitle']?.ja ?? '',
      titleEn: rw['odpt:railwayTitle']?.en ?? null,
      operator: rw['odpt:operator'] ?? null,
      lineCode: rw['odpt:lineCode'] ?? null,
      stationSource,
      lineIds: result.lineIds,
      matched: result.matchedStations,
      total: result.totalStations,
      unmatched: result.unmatched,
      geo,
    })
  }

  systems.sort((a, b) => a.id.localeCompare(b.id))

  const full = systems.filter((s) => s.matched === s.total).length
  const partial = systems.filter((s) => s.matched > 0 && s.matched < s.total).length
  const none = systems.filter((s) => s.matched === 0).length
  const stationTotal = systems.reduce((n, s) => n + s.total, 0)
  const stationMatched = systems.reduce((n, s) => n + s.matched, 0)

  await mkdir(outDir, { recursive: true })
  await writeFile(
    join(outDir, 'line-map.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      sources: perSource,
      railEdition: railData.edition,
      railwaysSeen: railways.size,
      count: systems.length,
      skippedNoStationData: noStationData,
      coverage: { full, partial, none, stationMatched, stationTotal },
      systems,
    }),
  )

  console.log(
    `系統 ${systems.length}/${railways.size}: 全駅一致 ${full} / 一部 ${partial} / 不一致 ${none}` +
      (noStationData ? `  (駅データが無く除外 ${noStationData})` : ''),
  )
  console.log(
    `駅の被覆 ${stationMatched}/${stationTotal} (${((stationMatched / stationTotal) * 100).toFixed(1)}%)`,
  )
  console.log(`out: ${join(outDir, 'line-map.json')}`)
}

await main()
