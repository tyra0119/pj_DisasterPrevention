// 運転系統への合成。
//
// 震度は N02 の線路名称単位で割り当てるが、乗客が見るのも ODPT の運行情報も
// 運転系統単位。対応表 (data/line-map.json) を使って、系統の値を
// 構成する N02 路線の最大として合成する。
//
// 最大を取るのは [[設計判断]] と同じ理由で、事業者が区間ごと止めるから。
// 山手線は N02 の山手線・東北線・東海道線にまたがるので、
// そのどれかが強く揺れていれば系統としては止まる。

import { SHINDO_ORDER } from '../quake/types.js'
import { dataUrl } from '../data-url.js'

/** @typedef {import('../quake/types.js').ShindoLevel} ShindoLevel */
/** @typedef {import('../quake/field.js').Confidence} Confidence */
/** @typedef {import('../quake/field.js').SegmentPoint} SegmentPoint */
/** @typedef {import('./assign.js').LineImpact} LineImpact */

/**
 * @typedef {object} RailSystem
 * @property {string} id  ODPT の odpt.Railway ID。運行情報と突き合わせるキー。
 * @property {string} title
 * @property {string|null} titleEn  訪日外国人向けの表示に使う。
 * @property {string|null} operator  ODPT の odpt.Operator ID。
 * @property {string|null} lineCode
 * @property {string[]} lineIds  対応する N02 路線 ID。
 * @property {number} matched  対応付けできた駅数。
 * @property {number} total  系統の駅数。
 * @property {string[]} unmatched
 */

/**
 * @typedef {object} LineMap
 * @property {string} generatedAt
 * @property {string} source
 * @property {boolean} keyed
 * @property {string} railEdition
 * @property {number} count
 * @property {{full:number,partial:number,none:number,stationMatched:number,stationTotal:number}} coverage
 * @property {RailSystem[]} systems
 */

/**
 * @param {string} [baseUrl]
 * @returns {Promise<LineMap>}
 */
export async function loadLineMap(baseUrl) {
  const res = await fetch(dataUrl('line-map.json', baseUrl))
  if (!res.ok) throw new Error(`line-map.json: ${res.status}`)
  return res.json()
}

/**
 * @typedef {object} SystemImpact
 * @property {RailSystem} system
 * @property {ShindoLevel|null} level  系統内の最大震度。
 * @property {Confidence} confidence
 * @property {SegmentPoint|null} at  最大震度を記録した地点。
 * @property {{label:string, distanceKm:number}|null} source
 * @property {LineImpact[]} lines  合成元の N02 路線。内訳を出せるように持ち回る。
 * @property {boolean} partial  対応表が系統の全駅を覆えていない。結論を弱める材料。
 */

/**
 * N02 路線ごとの結果を運転系統に畳む。
 *
 * @param {readonly LineImpact[]} impacts  assignToLines の結果
 * @param {LineMap} lineMap
 * @returns {SystemImpact[]}  強い順
 */
export function composeSystems(impacts, lineMap) {
  const byLineId = new Map(impacts.map((i) => [i.line.id, i]))

  /** @type {SystemImpact[]} */
  const out = []
  for (const system of lineMap.systems) {
    const lines = system.lineIds.map((id) => byLineId.get(id)).filter((i) => i != null)
    if (lines.length === 0) continue // 対応表にあっても N02 側が無ければ何も言えない。

    let best = null
    let sawBelowThreshold = false
    let sawUnknown = false
    for (const line of lines) {
      if (line.confidence === 'below-threshold') sawBelowThreshold = true
      if (line.confidence === 'unknown') sawUnknown = true
      if (!line.level) continue
      if (!best || SHINDO_ORDER[line.level] > SHINDO_ORDER[best.level]) best = line
    }

    out.push({
      system,
      level: best?.level ?? null,
      confidence: best ? 'reported' : sawBelowThreshold ? 'below-threshold' : 'unknown',
      at: best?.at ?? null,
      source: best?.source ?? null,
      lines,
      // 全駅を覆えていない系統は、覆えていない区間で強く揺れていても気づけない。
      partial: system.matched < system.total,
      // 一部の路線しか判定できていないなら、それも弱める材料になる。
      ...(sawUnknown ? { hasUnknownLine: true } : {}),
    })
  }

  return out.sort((a, b) => {
    const d = (b.level ? SHINDO_ORDER[b.level] : 0) - (a.level ? SHINDO_ORDER[a.level] : 0)
    if (d !== 0) return d
    return a.system.title.localeCompare(b.system.title, 'ja')
  })
}
