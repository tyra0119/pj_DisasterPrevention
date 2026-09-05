// 運転系統 → N02 路線 の対応表を生成する。
//
// ODPT の運行情報は運転系統 (odpt:Railway) 単位で来るが、N02 は線路名称単位。
// 名前では突き合わないので、ODPT が持つ駅の並びを N02 の駅に当てて対応を導く。
// 詳細は scripts/lib/match-lines.mjs。
//
// 鍵の扱い: これは**ビルド時**のスクリプトなので、トークンは手元に置いたまま
// 生成物 (data/line-map.json) だけを配る。Pages にトークンは載らない。
// 実行時に運行情報を取りに行く部分は別問題 (→ vault/宿題.md)。
//
//   .env.local に ODPT_TOKEN=... を書くか、環境変数で渡す。
//   .env.local は .gitignore 済み。絶対にコミットしないこと。
//
// トークンが無い場合は公開エンドポイントにだけ当たる (都営 6 路線のみ)。

import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { indexStationsByName, matchSystem } from './lib/match-lines.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'data')

const PUBLIC_ENDPOINT = 'https://api-public.odpt.org/api/v4'
// 鍵の発行元によって当たる先が違う。両方試して、返ってきた方を使う。
const KEYED_ENDPOINTS = ['https://api.odpt.org/api/v4', 'https://api-challenge.odpt.org/api/v4']

async function readToken() {
  if (process.env.ODPT_TOKEN) return process.env.ODPT_TOKEN.trim()
  try {
    const text = await readFile(join(root, '.env.local'), 'utf8')
    const m = text.match(/^\s*ODPT_TOKEN\s*=\s*(.+)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  } catch {
    // .env.local が無いのは異常ではない。公開分だけで動く。
  }
  return null
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

/** トークンが通るエンドポイントを 1 つ選ぶ。 */
async function resolveEndpoint(token) {
  if (!token) return { base: PUBLIC_ENDPOINT, keyed: false }
  for (const base of KEYED_ENDPOINTS) {
    try {
      const probe = await getJson(`${base}/odpt:Operator?acl:consumerKey=${encodeURIComponent(token)}`)
      if (Array.isArray(probe) && probe.length > 0) return { base, keyed: true, operators: probe.length }
    } catch {
      // このエンドポイントでは通らなかった。次を試す。
    }
  }
  throw new Error('ODPT_TOKEN がどのエンドポイントでも通らなかった。鍵を確認すること。')
}

const withKey = (url, token) =>
  token ? `${url}${url.includes('?') ? '&' : '?'}acl:consumerKey=${encodeURIComponent(token)}` : url

async function main() {
  const token = await readToken()
  const { base, keyed, operators } = await resolveEndpoint(token)
  console.log(
    keyed
      ? `ODPT: ${base} (トークンあり, 事業者 ${operators} 社)`
      : `ODPT: ${base} (トークンなし — 公開分の都営のみ)`,
  )

  const [railways, stations] = await Promise.all([
    getJson(withKey(`${base}/odpt:Railway`, token)),
    getJson(withKey(`${base}/odpt:Station`, token)),
  ])
  console.log(`odpt:Railway ${railways.length} / odpt:Station ${stations.length}`)

  // 駅の座標。ODPT の stationOrder は駅 ID しか持たないので引き当てる。
  const coord = new Map()
  for (const s of stations) {
    if (typeof s['geo:lat'] === 'number' && typeof s['geo:long'] === 'number') {
      coord.set(s['owl:sameAs'], [s['geo:lat'], s['geo:long']])
    }
  }

  const railData = JSON.parse(await readFile(join(outDir, 'rail-lines.json'), 'utf8'))
  const byName = indexStationsByName(railData)

  const systems = []
  for (const rw of railways) {
    const order = rw['odpt:stationOrder'] ?? []
    if (order.length === 0) continue // 駅の並びが無い系統は当てようがない。

    const stationsIn = order.map((s) => {
      const c = coord.get(s['odpt:station'])
      return {
        name: s['odpt:stationTitle']?.ja ?? s['dc:title'] ?? '',
        lat: c?.[0],
        lon: c?.[1],
      }
    })

    const result = matchSystem({ title: rw['dc:title'], stations: stationsIn }, byName)
    systems.push({
      id: rw['owl:sameAs'],
      title: rw['dc:title'] ?? rw['odpt:railwayTitle']?.ja ?? '',
      titleEn: rw['odpt:railwayTitle']?.en ?? null,
      operator: rw['odpt:operator'] ?? null,
      lineCode: rw['odpt:lineCode'] ?? null,
      lineIds: result.lineIds,
      matched: result.matchedStations,
      total: result.totalStations,
      unmatched: result.unmatched,
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
      source: base,
      keyed,
      railEdition: railData.edition,
      count: systems.length,
      coverage: { full, partial, none, stationMatched, stationTotal },
      systems,
    }),
  )

  console.log(`系統 ${systems.length}: 全駅一致 ${full} / 一部 ${partial} / 不一致 ${none}`)
  console.log(`駅の被覆 ${stationMatched}/${stationTotal} (${((stationMatched / stationTotal) * 100).toFixed(1)}%)`)
  console.log(`out: ${join(outDir, 'line-map.json')}`)
}

await main()
