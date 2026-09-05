// アプリが使う「場所」を生成する。
//
// 訪日外国人が日本語で駅名を打つのは無理なので、英語名の索引が要る。
// ODPT の odpt:Station は全駅に英語名を持っている。
//
// 出力: data/places.json
//   stations       … 日英の駅名 + 座標 + その駅を通る運転系統 / N02 路線
//   airports       … 主要空港と、そこへ行く運転系統 / N02 路線
//   municipalities … 市区町村コード → 都道府県+市区町村名
//
// 市区町村表は現在地を住所で出すために要る。国土地理院の逆ジオコーディングは
// 市区町村コードと町名しか返さないので、コードを名前に直す表を手元に持つ。
//
// ODPT が収録しているのはほぼ関東の事業者なので、関西以西では運転系統が付かない。
// N02 の路線 ID も持たせておけば、運行情報での確定はできなくても停止推定はできる。
//
// 空港の座標は手で書かない。アクセス駅の座標が N02 にあるので、そこから取る。
// (ODPT は空港駅を 3 つしか持っていない。関東の一部事業者しか収録されていないため)

import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'data')

const SOURCES = [
  { env: 'ODPT_KEY', base: 'https://api.odpt.org/api/v4' },
  { env: 'ODPT_CHALLENGE_KEY', base: 'https://api-challenge.odpt.org/api/v4' },
]
const PUBLIC_BASE = 'https://api-public.odpt.org/api/v4'

// 地理院地図が使っている市区町村コード表。
// 1 行が「都道府県コード,都道府県名,市区町村コード,市区町村名」。
const MUNI_URL = 'https://maps.gsi.go.jp/js/muni.js'

/**
 * 出国便の起点になる空港。訪日外国人が実際に発つところに絞る。
 * stations は N02 の駅名。座標もそこから取るので、ここに緯度経度は書かない。
 */
const AIRPORTS = [
  { iata: 'HND', ja: '羽田空港', en: 'Haneda Airport', stations: ['羽田空港第1ターミナル', '羽田空港第2ターミナル', '羽田空港第3ターミナル', '羽田空港第1・第2ターミナル'] },
  { iata: 'NRT', ja: '成田空港', en: 'Narita Airport', stations: ['成田空港', '空港第2ビル'] },
  { iata: 'KIX', ja: '関西国際空港', en: 'Kansai Airport', stations: ['関西空港'] },
  { iata: 'ITM', ja: '大阪国際空港（伊丹）', en: 'Osaka Itami Airport', stations: ['大阪空港'] },
  { iata: 'NGO', ja: '中部国際空港', en: 'Chubu Centrair Airport', stations: ['中部国際空港'] },
  { iata: 'FUK', ja: '福岡空港', en: 'Fukuoka Airport', stations: ['福岡空港'] },
  { iata: 'CTS', ja: '新千歳空港', en: 'New Chitose Airport', stations: ['新千歳空港'] },
  { iata: 'OKA', ja: '那覇空港', en: 'Naha Airport', stations: ['那覇空港'] },
  { iata: 'SDJ', ja: '仙台空港', en: 'Sendai Airport', stations: ['仙台空港'] },
  { iata: 'UKB', ja: '神戸空港', en: 'Kobe Airport', stations: ['神戸空港'] },
  { iata: 'KMI', ja: '宮崎空港', en: 'Miyazaki Airport', stations: ['宮崎空港'] },
]

async function readEnv() {
  const env = {}
  try {
    const text = await readFile(join(root, '.env.local'), 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
      if (m && m[2].trim()) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    // 鍵が無ければ公開分だけで作る。
  }
  for (const k of ['ODPT_KEY', 'ODPT_CHALLENGE_KEY']) {
    if (process.env[k]) env[k] = process.env[k].trim()
  }
  return env
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

const withKey = (base, path, token) =>
  token
    ? `${base}/${path}${path.includes('?') ? '&' : '?'}acl:consumerKey=${encodeURIComponent(token)}`
    : `${base}/${path}`

async function collectStations() {
  const env = await readEnv()
  const stations = new Map()

  const sources = SOURCES.filter((s) => env[s.env]).map((s) => ({ ...s, token: env[s.env] }))
  if (sources.length === 0) sources.push({ env: '(公開)', base: PUBLIC_BASE, token: null })

  for (const s of sources) {
    try {
      const railways = await getJson(withKey(s.base, 'odpt:Railway', s.token))
      const operators = [...new Set(railways.map((r) => r['odpt:operator']).filter(Boolean))]
      let added = 0
      for (const op of operators) {
        try {
          // 1 応答 1,000 件の上限があるので事業者ごとに引く。
          const list = await getJson(
            withKey(s.base, `odpt:Station?odpt:operator=${encodeURIComponent(op)}`, s.token),
          )
          for (const st of list) {
            const id = st['owl:sameAs']
            if (id && !stations.has(id)) {
              stations.set(id, st)
              added++
            }
          }
        } catch {
          // 事業者単位の欠落は珍しくない。
        }
      }
      console.log(`  ${s.env}: 駅 ${added}`)
    } catch (err) {
      console.log(`  ${s.env}: 取得に失敗 (${err.message})`)
    }
  }
  return [...stations.values()]
}

async function main() {
  console.log('ODPT:')
  const raw = await collectStations()
  const lineMap = JSON.parse(await readFile(join(outDir, 'line-map.json'), 'utf8'))
  const rail = JSON.parse(await readFile(join(outDir, 'rail-lines.json'), 'utf8'))
  const knownSystems = new Set(lineMap.systems.map((s) => s.id))

  // 座標から近くの N02 路線を引くための格子。
  const NEAR_CELL_DEG = 0.05
  const nearGrid = new Map()
  for (const line of rail.lines) {
    for (const st of line.stations) {
      const key = `${Math.floor(st.lat / NEAR_CELL_DEG)}:${Math.floor(st.lon / NEAR_CELL_DEG)}`
      const bucket = nearGrid.get(key)
      if (bucket) bucket.push([st.lat, st.lon, line.id])
      else nearGrid.set(key, [[st.lat, st.lon, line.id]])
    }
  }
  const EARTH_RADIUS_KM = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const distKm = (aLat, aLon, bLat, bLon) => {
    const dLat = toRad(bLat - aLat)
    const dLon = toRad(bLon - aLon)
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.sin(dLon / 2) ** 2 * Math.cos(toRad(aLat)) * Math.cos(toRad(bLat))
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
  }
  /** その座標の近くを通る N02 路線。運転系統が無い地域でも停止推定はできる。 */
  const linesNear = (lat, lon, radiusKm) => {
    const found = new Set()
    const span = Math.ceil(radiusKm / 4)
    const a0 = Math.floor(lat / NEAR_CELL_DEG)
    const o0 = Math.floor(lon / NEAR_CELL_DEG)
    for (let a = a0 - span; a <= a0 + span; a++) {
      for (let o = o0 - span; o <= o0 + span; o++) {
        for (const [sLat, sLon, id] of nearGrid.get(`${a}:${o}`) ?? []) {
          if (distKm(lat, lon, sLat, sLon) <= radiusKm) found.add(id)
        }
      }
    }
    return [...found].sort()
  }

  // 同じ駅が路線ぶん重複するので、日英名でまとめて系統だけ足していく。
  const byName = new Map()
  let skipped = 0
  for (const st of raw) {
    const ja = st['odpt:stationTitle']?.ja ?? st['dc:title']
    const en = st['odpt:stationTitle']?.en
    const lat = st['geo:lat']
    const lon = st['geo:long']
    // 英語名か座標が無い駅は、探す手段にも判定にも使えない。
    if (!ja || !en || typeof lat !== 'number' || typeof lon !== 'number') {
      skipped++
      continue
    }

    const key = `${ja}\u0000${en}`
    let entry = byName.get(key)
    if (!entry) {
      entry = { ja, en, lat, lon, systems: new Set() }
      byName.set(key, entry)
    }
    const railway = st['odpt:railway']
    if (railway && knownSystems.has(railway)) entry.systems.add(railway)
  }

  const round = (n) => Number(n.toFixed(4))
  const stations = [...byName.values()]
    .map((s) => ({
      ja: s.ja,
      en: s.en,
      lat: round(s.lat),
      lon: round(s.lon),
      systems: [...s.systems].sort(),
      // 駅そのものに紐づく路線。1.2km あれば同じ駅の別事業者ぶんを拾える。
      lines: linesNear(s.lat, s.lon, 1.2),
    }))
    .sort((a, b) => a.en.localeCompare(b.en))

  // 空港はアクセス駅の重心。座標もアクセス系統も N02 側から取る。
  const systemsByLineId = new Map()
  for (const sys of lineMap.systems) {
    for (const id of sys.lineIds) {
      const bucket = systemsByLineId.get(id)
      if (bucket) bucket.add(sys.id)
      else systemsByLineId.set(id, new Set([sys.id]))
    }
  }

  /** @type {Map<string, {lat:number, lon:number, systems:Set<string>}>} */
  const n02ByName = new Map()
  for (const line of rail.lines) {
    for (const st of line.stations) {
      let entry = n02ByName.get(st.name)
      if (!entry) {
        entry = { lat: st.lat, lon: st.lon, systems: new Set() }
        n02ByName.set(st.name, entry)
      }
      for (const sysId of systemsByLineId.get(line.id) ?? []) entry.systems.add(sysId)
    }
  }

  const airports = []
  for (const a of AIRPORTS) {
    const found = a.stations.map((n) => n02ByName.get(n)).filter(Boolean)
    if (found.length === 0) {
      console.log(`  空港 ${a.iata}: アクセス駅が N02 に無いので除外`)
      continue
    }
    const systems = [...new Set(found.flatMap((s) => [...s.systems]))].sort()
    airports.push({
      iata: a.iata,
      ja: a.ja,
      en: a.en,
      lat: round(found.reduce((n, s) => n + s.lat, 0) / found.length),
      lon: round(found.reduce((n, s) => n + s.lon, 0) / found.length),
      stations: a.stations.filter((n) => n02ByName.has(n)),
      systems,
      lines: linesNear(
        found.reduce((n, s) => n + s.lat, 0) / found.length,
        found.reduce((n, s) => n + s.lon, 0) / found.length,
        3,
      ),
    })
  }

  // 市区町村コード → 「都道府県名 + 市区町村名」。
  const municipalities = {}
  try {
    const text = await (await fetch(MUNI_URL)).text()
    for (const [, code, row] of text.matchAll(/GSI\.MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']*)'/g)) {
      const cols = row.split(',')
      if (cols.length < 4) continue
      // 「札幌市　中央区」のように全角空白が入る行がある。詰める。
      municipalities[code] = (cols[1] + cols[3]).replace(/[\s　]/g, '')
    }
    console.log(`市区町村: ${Object.keys(municipalities).length}`)
  } catch (err) {
    console.log(`市区町村表を取得できなかった (${err.message})。住所表示は町名だけになる`)
  }

  if (stations.length < 1000) throw new Error(`駅が ${stations.length} 件しかない。取得に失敗している`)

  await mkdir(outDir, { recursive: true })
  await writeFile(
    join(outDir, 'places.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      stationCount: stations.length,
      airportCount: airports.length,
      stations,
      airports,
      municipalities,
    }),
  )

  console.log(`駅 ${stations.length} (英語名か座標が無く除外 ${skipped})`)
  for (const a of airports) {
    console.log(
      `  ${a.iata} ${a.en.padEnd(24)} 系統 ${String(a.systems.length).padStart(2)} / 路線 ${String(a.lines.length).padStart(2)}  ${a.stations.join('/')}`,
    )
  }
  console.log(`out: ${join(outDir, 'places.json')}`)
}

await main()
