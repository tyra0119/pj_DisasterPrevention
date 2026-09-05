// 震度を路線に割り当てる。
//
// 鉄道の運転見合わせは区間内の最大震度で決まるので、路線ごとに
// 「線内のどこかで観測された最大震度」と「それがどこか」を出す。
// ここまでが地震データ側からの推定で、実際に止まっているかは運行情報で確定させる。

import { SHINDO_ORDER } from '../quake/types.js'
import { sampleAt } from '../quake/field.js'

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
 * @property {{label:string, distanceKm:number}|null} source  その値を与えた観測点と距離。
 * @property {number} sampledPoints
 * @property {number} unknownPoints
 * @property {TrackSample} trackSample
 * @property {(ShindoLevel|null)[]} trackLevels
 *   line.track と同じ並びの震度。運転系統が使う区間だけを数えるのに要る。
 */

/**
 * 線形点だけを見た震度の分布。
 *
 * 徒歩点検の所要時間は点検区間の長さに比例するので、線内のどれだけが
 * 強く揺れたかを知りたい。駅は都市部に密集していて路線に沿って一様ではないため、
 * 長さの推定には約 2km 間隔で並ぶ線形点だけを使う。
 *
 * @typedef {object} TrackSample
 * @property {number} total  線形点の数。
 * @property {Record<string, number>} counts  震度階級ごとの点数。
 */

/**
 * @param {TrackSample} sample
 * @param {ShindoLevel} level
 * @returns {number} その震度以上だった線形点の割合 (0〜1)。線形点が無ければ 0。
 */
export function trackFractionAtOrAbove(sample, level) {
  if (sample.total === 0) return 0
  const floor = SHINDO_ORDER[level]
  let n = 0
  for (const [key, count] of Object.entries(sample.counts)) {
    if (SHINDO_ORDER[/** @type {ShindoLevel} */ (key)] >= floor) n += count
  }
  return n / sample.total
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
    /** @type {{sample: import('../quake/field.js').Sample, point: SegmentPoint}|null} */
    let best = null
    let unknownPoints = 0
    let sawBelowThreshold = false
    /** @type {Record<string, number>} */
    const trackCounts = {}
    /** @type {(ShindoLevel|null)[]} */
    const trackLevels = []

    // 鉄道の運転見合わせは区間内の最大震度で決まるので、平均ではなく最大を取る。
    const consider = (sample, point) => {
      if (sample.confidence === 'unknown') unknownPoints++
      if (sample.confidence === 'below-threshold') sawBelowThreshold = true
      if (!sample.level) return
      if (!best || SHINDO_ORDER[sample.level] > SHINDO_ORDER[best.sample.level]) {
        best = { sample, point }
      }
    }

    for (const st of line.stations) {
      consider(sampleAt(field, st.lat, st.lon, radiusKm), {
        lat: st.lat,
        lon: st.lon,
        label: st.name,
      })
    }
    // 駅間が数十 km ある路線 (北海道・山陰) は駅だけだと穴が空くので線形も見る。
    for (const [lat, lon] of line.track) {
      const sample = sampleAt(field, lat, lon, radiusKm)
      consider(sample, { lat, lon })
      trackLevels.push(sample.level)
      if (sample.level) trackCounts[sample.level] = (trackCounts[sample.level] ?? 0) + 1
    }

    const level = best?.sample.level ?? null
    if (floor > 0 && (!level || SHINDO_ORDER[level] < floor)) continue

    impacts.push({
      line,
      level,
      confidence: best ? 'reported' : sawBelowThreshold ? 'below-threshold' : 'unknown',
      at: best?.point ?? null,
      source: best?.sample.source
        ? { label: best.sample.source.label, distanceKm: best.sample.source.distanceKm }
        : null,
      sampledPoints: line.stations.length + line.track.length,
      unknownPoints,
      trackSample: { total: line.track.length, counts: trackCounts },
      trackLevels,
    })
  }

  return impacts.sort((a, b) => {
    const d = (b.level ? SHINDO_ORDER[b.level] : 0) - (a.level ? SHINDO_ORDER[a.level] : 0)
    if (d !== 0) return d
    return a.line.name.localeCompare(b.line.name, 'ja')
  })
}
