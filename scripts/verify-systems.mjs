// 運転系統への合成を実データで確かめる。
// 対応表の被覆率と、直近で一番強かった地震を系統単位に畳んだ結果を出す。

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildIndex } from '../src/quake/stations.js'
import { normalize } from '../src/quake/p2p.js'
import { prepareField } from '../src/quake/field.js'
import { SHINDO_ORDER } from '../src/quake/types.js'
import { assignToLines } from '../src/rail/assign.js'
import { composeSystems } from '../src/rail/systems.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = async (p) => JSON.parse(await readFile(join(root, p), 'utf8'))

const index = buildIndex(
  await readJson('data/shindo-stations.json'),
  await readJson('data/shindo-areas.json'),
)
const rail = await readJson('data/rail-lines.json')
const lineMap = await readJson('data/line-map.json')

const c = lineMap.coverage
const srcs = (lineMap.sources ?? []).map((s) => s.endpoint.replace('https://', '')).join(' + ')
console.log(`対応表: ${lineMap.count}/${lineMap.railwaysSeen} 系統  [${srcs}]`)
console.log(`  全駅一致 ${c.full} / 一部 ${c.partial} / 不一致 ${c.none}`)
console.log(`  駅の被覆 ${c.stationMatched}/${c.stationTotal} (${((c.stationMatched / c.stationTotal) * 100).toFixed(1)}%)`)

const worst = lineMap.systems
  .filter((s) => s.unmatched.length > 0)
  .sort((a, b) => b.unmatched.length - a.unmatched.length)
  .slice(0, 10)
if (worst.length) {
  console.log('\n--- 覆えていない駅が多い系統 ---')
  for (const s of worst) {
    console.log(`  ${s.title} (${s.matched}/${s.total})  未一致: ${s.unmatched.slice(0, 8).join(' ')}`)
  }
}

console.log('\n--- 系統への分解 (N02 路線を複数またぐもの) ---')
const multi = lineMap.systems.filter((s) => s.lineIds.length > 1)
console.log(`  複数路線にまたがる系統: ${multi.length} / ${lineMap.count}`)
for (const s of multi.slice(0, 12)) {
  const names = s.lineIds
    .map((id) => rail.lines.find((l) => l.id === id))
    .filter(Boolean)
    .map((l) => `${l.operator} ${l.name}`)
  console.log(`  ${s.title} → ${names.join(' / ')}`)
}

const raw = []
for (let i = 0; i < 3; i++) {
  const res = await fetch(`https://api.p2pquake.net/v2/history?codes=551&limit=100&offset=${i * 100}`)
  if (!res.ok) throw new Error(`p2pquake: ${res.status}`)
  raw.push(...(await res.json()))
}
const event = raw
  .map((r) => normalize(r, index))
  .filter((e) => e.resolution === 'station' && e.maxLevel)
  .sort((a, b) => SHINDO_ORDER[b.maxLevel] - SHINDO_ORDER[a.maxLevel])[0]

console.log(
  `\nevent: ${event.hypocenter.name} M${event.magnitude} 最大震度${event.maxLevel}  ${event.occurredAt}`,
)

const impacts = assignToLines(prepareField(event, index), rail.lines, { radiusKm: 20 })
const systems = composeSystems(impacts, lineMap)
const shaken = systems.filter((s) => s.level)
console.log(`揺れた系統: ${shaken.length} / ${systems.length}`)

for (const s of shaken.slice(0, 20)) {
  const breakdown = s.lines.map((l) => `${l.line.name}:${l.level ?? '-'}`).join(' ')
  console.log(
    `  震度${String(s.level).padEnd(2)} ${s.system.title.padEnd(18)} 最大: ${(s.at?.label ?? '-').padEnd(12)} [${breakdown}]${s.partial ? ' ※対応表が一部' : ''}`,
  )
}
