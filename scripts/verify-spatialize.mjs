// 震度の空間化が実データで成立するかを確かめる。
//   1. 直近の地震情報の points[] が何割ぐらい座標に解決できるか(辞書の網羅性)
//   2. 実際の地点(駅・空港)に対して sampleAt が何を返すか
// 事前登録も UI もない段階で、方式そのものの実現性を見るための足場。

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildIndex } from '../src/quake/stations.js'
import { normalize } from '../src/quake/p2p.js'
import { prepareField, sampleAt, sampleSegment } from '../src/quake/field.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const readJson = async (p) => JSON.parse(await readFile(join(root, p), 'utf8'))
const index = buildIndex(
  await readJson('data/shindo-stations.json'),
  await readJson('data/shindo-areas.json'),
)
console.log(`index: ${index.stations.length} stations / ${index.areaByCode.size} areas`)

// --- 1. 辞書の網羅性 -------------------------------------------------------
const PAGES = 3
const raw = []
for (let i = 0; i < PAGES; i++) {
  const res = await fetch(`https://api.p2pquake.net/v2/history?codes=551&limit=100&offset=${i * 100}`)
  if (!res.ok) throw new Error(`p2pquake: ${res.status}`)
  raw.push(...(await res.json()))
}
const events = raw.map((r) => normalize(r, index))

const totalPoints = raw.reduce((n, r) => n + (r.points?.length ?? 0), 0)
const resolved = events.reduce((n, e) => n + e.observations.length, 0)
const unresolved = events.flatMap((e) => e.unresolved)
console.log(`\nevents: ${events.length}  points: ${totalPoints}  resolved: ${resolved}  unresolved: ${unresolved.length}`)
if (unresolved.length) console.log('  unresolved names:', [...new Set(unresolved)].slice(0, 20))

// --- 2. 実地点への当てはめ -------------------------------------------------
const SITES = [
  { label: '東京駅', lat: 35.681, lon: 139.767 },
  { label: '新宿駅', lat: 35.690, lon: 139.700 },
  { label: '羽田空港', lat: 35.549, lon: 139.780 },
  { label: '成田空港', lat: 35.772, lon: 140.393 },
  { label: '仙台駅', lat: 38.260, lon: 140.882 },
  { label: '新大阪駅', lat: 34.733, lon: 135.500 },
]

const order = { '1': 1, '2': 2, '3': 3, '4': 4, '5-': 5, '5+': 6, '6-': 7, '6+': 8, '7': 9 }
const strongest = events
  .filter((e) => e.resolution === 'station' && e.maxLevel)
  .sort((a, b) => order[b.maxLevel] - order[a.maxLevel])[0]

if (!strongest) {
  console.log('\nno station-resolution event in this window')
} else {
  console.log(
    `\nstrongest: ${strongest.hypocenter.name} M${strongest.magnitude} 最大震度${strongest.maxLevel}` +
      `  ${strongest.occurredAt}  観測点 ${strongest.observations.length} 点`,
  )
  const field = prepareField(strongest, index)
  for (const s of SITES) {
    const r = sampleAt(field, s.lat, s.lon, 20)
    const src = r.source ? `${r.source.label} ${r.source.distanceKm.toFixed(1)}km` : '-'
    console.log(
      `  ${s.label.padEnd(6)} level=${(r.level ?? '-').padEnd(2)} ${r.confidence.padEnd(15)}` +
        ` stations=${String(r.stationsInRadius).padStart(3)} reported=${String(r.reportedInRadius).padStart(3)}  ${src}`,
    )
  }

  // 区間サンプル: 東海道新幹線 東京〜新大阪 の主要駅
  const tokaido = [
    { label: '東京', lat: 35.681, lon: 139.767 },
    { label: '新横浜', lat: 35.507, lon: 139.617 },
    { label: '静岡', lat: 34.972, lon: 138.389 },
    { label: '名古屋', lat: 35.171, lon: 136.882 },
    { label: '京都', lat: 34.985, lon: 135.758 },
    { label: '新大阪', lat: 34.733, lon: 135.500 },
  ]
  const seg = sampleSegment(field, tokaido, 20)
  console.log(
    `\n  東海道新幹線: level=${seg.level ?? '-'} ${seg.confidence} at=${seg.at?.label ?? '-'}` +
      ` unknown=${seg.unknownPoints}/${seg.totalPoints}`,
  )
}
