// 震度 → 路線への割り当てを実データで確かめる。
// 直近で一番強かった地震を取り、全 596 路線に当てて上位を出す。

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildIndex } from '../src/quake/stations.js'
import { normalize } from '../src/quake/p2p.js'
import { prepareField } from '../src/quake/field.js'
import { SHINDO_ORDER } from '../src/quake/types.js'
import { assignToLines } from '../src/rail/assign.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = async (p) => JSON.parse(await readFile(join(root, p), 'utf8'))

const index = buildIndex(
  await readJson('data/shindo-stations.json'),
  await readJson('data/shindo-areas.json'),
)
const rail = await readJson('data/rail-lines.json')
const points = rail.lines.reduce((n, l) => n + l.stations.length + l.track.length, 0)
console.log(
  `rail: ${rail.count} lines / ${rail.lines.reduce((n, l) => n + l.stations.length, 0)} stations` +
    ` / ${points} sample points (${rail.edition})`,
)

const raw = []
for (let i = 0; i < 3; i++) {
  const res = await fetch(`https://api.p2pquake.net/v2/history?codes=551&limit=100&offset=${i * 100}`)
  if (!res.ok) throw new Error(`p2pquake: ${res.status}`)
  raw.push(...(await res.json()))
}
const events = raw
  .map((r) => normalize(r, index))
  .filter((e) => e.resolution === 'station' && e.maxLevel)
  .sort((a, b) => SHINDO_ORDER[b.maxLevel] - SHINDO_ORDER[a.maxLevel])

const event = events[0]
console.log(
  `\nevent: ${event.hypocenter.name} M${event.magnitude} 最大震度${event.maxLevel}` +
    `  ${event.occurredAt}  観測点 ${event.observations.length} 点`,
)

const t0 = performance.now()
const field = prepareField(event, index)
const impacts = assignToLines(field, rail.lines, { radiusKm: 20 })
const ms = performance.now() - t0
console.log(`assigned ${impacts.length} lines in ${ms.toFixed(0)}ms (${points} point samples)`)

const shaken = impacts.filter((i) => i.level)
const byLevel = {}
for (const i of shaken) byLevel[i.level] = (byLevel[i.level] ?? 0) + 1
console.log('揺れた路線:', shaken.length, byLevel)
console.log('揺れなかった路線 (震度1未満):', impacts.filter((i) => i.confidence === 'below-threshold').length)
console.log('判定不能:', impacts.filter((i) => i.confidence === 'unknown').length)

console.log('\n--- 強い順 上位 20 路線 ---')
for (const i of shaken.slice(0, 20)) {
  const at = i.at?.label ?? (i.at ? `${i.at.lat},${i.at.lon}` : '-')
  console.log(
    `  震度${(i.level ?? '-').padEnd(2)} ${i.line.operator} ${i.line.name}`.padEnd(38) +
      `  最大: ${at}  (${i.source?.label} ${i.source?.distanceKm.toFixed(1)}km)`,
  )
}

console.log('\n--- 空港アクセス ---')
const AIRPORT_LINES = [
  ['京成電鉄', '成田空港線'],
  ['東日本旅客鉄道', '成田線'],
  ['東京モノレール', '東京モノレール羽田空港線'],
  ['京浜急行電鉄', '空港線'],
  ['南海電気鉄道', '空港線'],
  ['西日本旅客鉄道', '関西空港線'],
]
for (const [op, name] of AIRPORT_LINES) {
  const i = impacts.find((x) => x.line.operator === op && x.line.name === name)
  if (!i) {
    console.log(`  ${op} ${name}: 見つからない`)
    continue
  }
  console.log(
    `  ${op} ${name}`.padEnd(34) +
      ` 震度${(i.level ?? '-').padEnd(2)} ${i.confidence.padEnd(15)} 最大: ${i.at?.label ?? '-'}`,
  )
}
