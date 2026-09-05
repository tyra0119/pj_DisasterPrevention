// 停止推定を実データで確かめる。
// 直近で一番強かった地震について、運転系統ごとに
// 「どの段階の規制がかかり、どれくらい待つことになるか」を出す。

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildIndex } from '../src/quake/stations.js'
import { normalize } from '../src/quake/p2p.js'
import { prepareField } from '../src/quake/field.js'
import { SHINDO_ORDER } from '../src/quake/types.js'
import { assignToLines } from '../src/rail/assign.js'
import { composeSystems } from '../src/rail/systems.js'
import { estimateSuspension, estimateSystemSuspension } from '../src/rail/regulation.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = async (p) => JSON.parse(await readFile(join(root, p), 'utf8'))

const index = buildIndex(
  await readJson('data/shindo-stations.json'),
  await readJson('data/shindo-areas.json'),
)
const rail = await readJson('data/rail-lines.json')
const lineMap = await readJson('data/line-map.json')

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
  `event: ${event.hypocenter.name} M${event.magnitude} 最大震度${event.maxLevel}  ${event.occurredAt}`,
)

const field = prepareField(event, index)
const impacts = assignToLines(field, rail.lines, { radiusKm: 20 })
const byLineId = new Map(impacts.map((i) => [i.line.id, i]))

const ADVICE = { normal: '平常', delay: '遅れる', wait: '待つ', 'avoid-rail': '鉄道以外' }
const STAGE = {
  none: '規制なし',
  caution: '注意運転点検',
  'walk-inspection': '徒歩点検',
  'damage-likely': '被害の領域',
}

const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`)

// --- 路線ごと ---
const stages = {}
for (const i of impacts) {
  const s = estimateSuspension(i)
  stages[s.stage] = (stages[s.stage] ?? 0) + 1
}
console.log(`\n路線 ${impacts.length}:`, stages)

console.log('\n--- 徒歩点検が要る路線 (待ち時間の長い順 上位 15) ---')
const waiting = impacts
  .map((i) => ({ i, s: estimateSuspension(i) }))
  .filter((x) => x.s.stage === 'walk-inspection')
  .sort((a, b) => b.s.waitMinutes.typical - a.s.waitMinutes.typical)
console.log(`  該当 ${waiting.length} 路線`)
for (const { i, s } of waiting.slice(0, 15)) {
  console.log(
    `  震度${s.level}  ${(i.line.operator + ' ' + i.line.name).padEnd(26)}` +
      ` 点検 ${String(s.inspectionLengthKm).padStart(6)}km / 全長 ${String(i.line.lengthKm).padStart(6)}km` +
      `  → ${fmt(s.waitMinutes.typical).padStart(8)} (${fmt(s.waitMinutes.min)}〜${fmt(s.waitMinutes.max)})`,
  )
}

// --- 運転系統ごと ---
console.log('\n--- 運転系統で見る (空港アクセスと主要系統) ---')
const systems = composeSystems(impacts, lineMap)
const PICK = ['山手線', '京浜東北線・根岸線', '中央線快速', '成田スカイアクセス線', '羽田空港線', '空港線', '成田線空港支線', '東海道新幹線', '関西空港線']
for (const sys of systems) {
  if (!PICK.includes(sys.system.title)) continue
  const s = estimateSystemSuspension(sys, field, { radiusKm: 20 })
  const wait = s.openEnded
    ? '見通し不明'
    : s.waitMinutes
      ? `${fmt(s.waitMinutes.min)}〜${fmt(s.waitMinutes.max)}`
      : '—'
  const len = s.corridorKnown ? `系統 ${s.systemLengthKm}km / 点検 ${s.inspectionLengthKm ?? 0}km` : '区間不明'
  console.log(
    `  ${sys.system.title.padEnd(20)} 震度${(s.level ?? '—').padEnd(2)}` +
      `  ${ADVICE[s.advice].padEnd(5)} ${STAGE[s.stage].padEnd(7)} ${wait.padStart(9)}  ${len}` +
      `${sys.partial ? '  ※対応表が一部' : ''}`,
  )
}
