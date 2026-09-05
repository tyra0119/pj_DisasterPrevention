// 震度を路線に割り当てる。
//
// 鉄道の運転見合わせは区間内の最大震度で決まるので、路線ごとに
// 「線内のどこかで観測された最大震度」と「それがどこか」を出す。
// ここまでが地震データ側からの推定で、実際に止まっているかは運行情報で確定させる。

import { SHINDO_ORDER } from '../quake/types.js'
import { sampleSegment } from '../quake/field.js'

/** @typedef {import('../quake/types.js').ShindoLevel} ShindoLevel */
/** @typedef {import('../quake/field.js').Confidence} Confidence */
/** @typedef {import('../quake/field.js').Field} Field */
/** @typedef {import('../quake/field.js').SegmentPoint} SegmentPoint */
/** @typedef {import('./types.js').RailLine} RailLine */

/**
 * @typedef {object} LineImpact
 * @property {RailLine} line
 * @property {ShindoLevel|null} level  線内で観測された最大震度。
 * @property {Confidence} confidence
 * @property {SegmentPoint|null} at  最大震度を記録した地点。駅なら駅名が入る。
 * @property {{label: string, distanceKm: number}|null} source  その値を与えた観測点と距離。
 * @property {number} sampledPoints
 * @property {number} unknownPoints
 */

/**
 * 路線の判定に使う地点。駅を優先し、駅間の穴を線形で埋める。
 * @param {RailLine} line
 * @returns {SegmentPoint[]}
 */
function samplePoints(line) {
  /** @type {SegmentPoint[]} */
  const points = line.stations.map((s) => ({ lat: s.lat, lon: s.lon, label: s.name }))
  for (const [lat, lon] of line.track) points.push({ lat, lon })
  return points
}

/**
 * 全路線に震度を割り当て、強い順に返す。
 * 揺れていない路線も結果に含む (「動いている経路」を示すのに要る)。
 *
 * @param {Field} field
 * @param {readonly RailLine[]} lines
 * @param {{radiusKm?: number, minLevel?: ShindoLevel}} [options]
 *   radiusKm: 地点からこの距離までの観測点を見る。路線は事業者が区間まるごと止めるので
 *   広め (既定 20km) に取る。「今いる場所」を答えるときは同じ半径を使わないこと。
 *   minLevel: この震度未満の路線を落とす。既定は落とさない。
 * @returns {LineImpact[]}
 */
export function assignToLines(field, lines, { radiusKm = 20, minLevel } = {}) {
  const floor = minLevel ? SHINDO_ORDER[minLevel] : 0

  /** @type {LineImpact[]} */
  const impacts = []
  for (const line of lines) {
    const seg = sampleSegment(field, samplePoints(line), radiusKm)
    if (floor > 0 && (!seg.level || SHINDO_ORDER[seg.level] < floor)) continue

    impacts.push({
      line,
      level: seg.level,
      confidence: seg.confidence,
      at: seg.at,
      source: seg.source ? { label: seg.source.label, distanceKm: seg.source.distanceKm } : null,
      sampledPoints: seg.totalPoints,
      unknownPoints: seg.unknownPoints,
    })
  }

  return impacts.sort((a, b) => {
    const d = (b.level ? SHINDO_ORDER[b.level] : 0) - (a.level ? SHINDO_ORDER[a.level] : 0)
    if (d !== 0) return d
    return a.line.name.localeCompare(b.line.name, 'ja')
  })
}
