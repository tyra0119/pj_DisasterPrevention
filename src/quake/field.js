// 「この座標はどれくらい揺れたか」を答える層。
// 駅・空港・宿の座標を渡して、路線ごとの停止推定や滞在地の判断に使う。
//
// 補間はしない。震度は表層地盤で数百 m 単位に変わるので、観測点の間を滑らかに
// 埋めた値は精度があるように見えて根拠がない。ここが返すのは
// 「半径内で実際に観測された最大震度」と、その観測点までの距離だけ。

import { SHINDO_ORDER } from './types.js'
import { createGrid } from './grid.js'

/** @typedef {import('./types.js').ShindoLevel} ShindoLevel */
/** @typedef {import('./types.js').Observation} Observation */
/** @typedef {import('./types.js').QuakeEvent} QuakeEvent */
/** @typedef {import('./types.js').Station} Station */
/** @typedef {import('./stations.js').StationIndex} StationIndex */

const EARTH_RADIUS_KM = 6371
/** @param {number} deg */
const toRad = (deg) => (deg * Math.PI) / 180

/**
 * @param {number} aLat @param {number} aLon @param {number} bLat @param {number} bLon
 * @returns {number}
 */
export function distanceKm(aLat, aLon, bLat, bLon) {
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/**
 * 'reported'        半径内に震度1以上の観測があった。level は実測値。
 * 'below-threshold' 半径内に観測点はあるが、どれも報告されなかった = 震度1未満。
 * 'unknown'         半径内に観測点がない、または区域単位の速報しか出ていない。
 * @typedef {'reported'|'below-threshold'|'unknown'} Confidence
 */

/**
 * @typedef {object} Sample
 * @property {ShindoLevel|null} level
 * @property {Confidence} confidence
 * @property {(Observation & {distanceKm: number})|null} source  'reported' のときだけ入る。
 * @property {number} stationsInRadius  半径内にあるマスタ上の観測点数。0 なら判断材料がない。
 * @property {number} reportedInRadius
 */

/**
 * 1 イベントを何千回も引くので、格子索引を張った状態を先に作る。
 * 観測点マスタの索引はイベントをまたいで使い回す。
 * @typedef {object} Field
 * @property {QuakeEvent} event
 * @property {import('./grid.js').Grid<Observation>} observations
 * @property {import('./grid.js').Grid<Station>} stations
 */

/** @type {WeakMap<StationIndex, import('./grid.js').Grid<Station>>} */
const stationGridCache = new WeakMap()

/**
 * @param {QuakeEvent} event
 * @param {StationIndex} index
 * @returns {Field}
 */
export function prepareField(event, index) {
  let stations = stationGridCache.get(index)
  if (!stations) {
    stations = createGrid(index.stations, (s) => [s.lat, s.lon])
    stationGridCache.set(index, stations)
  }
  const reported = event.observations.filter((o) => o.kind === 'station')
  return { event, observations: createGrid(reported, (o) => [o.lat, o.lon]), stations }
}

/**
 * 指定座標の周囲 radiusKm で観測された最大震度を返す。
 *
 * 報告がないことは欠測ではなく「震度1未満」を意味する
 * (気象庁の各地の震度は震度1以上を全点掲載するため)。ただしそれが言えるのは
 * 観測点単位の詳細情報が出てからなので、速報段階では 'unknown' に倒す。
 *
 * @param {Field} field
 * @param {number} lat
 * @param {number} lon
 * @param {number} [radiusKm]
 * @returns {Sample}
 */
export function sampleAt(field, lat, lon, radiusKm = 20) {
  /** @type {(Observation & {distanceKm: number})|null} */
  let best = null
  let reportedInRadius = 0

  for (const o of field.observations.candidates(lat, lon, radiusKm)) {
    const d = distanceKm(lat, lon, o.lat, o.lon)
    if (d > radiusKm) continue
    reportedInRadius++
    if (!best || SHINDO_ORDER[o.level] > SHINDO_ORDER[best.level]) {
      best = { ...o, distanceKm: d }
    } else if (SHINDO_ORDER[o.level] === SHINDO_ORDER[best.level] && d < best.distanceKm) {
      // 同震度なら近い方を代表にする。表示上「どこの観測点か」が納得しやすい。
      best = { ...o, distanceKm: d }
    }
  }

  let stationsInRadius = 0
  for (const s of field.stations.candidates(lat, lon, radiusKm)) {
    if (distanceKm(lat, lon, s.lat, s.lon) <= radiusKm) stationsInRadius++
  }

  if (best) {
    return {
      level: best.level,
      confidence: 'reported',
      source: best,
      stationsInRadius,
      reportedInRadius,
    }
  }
  if (field.event.resolution === 'station' && stationsInRadius > 0) {
    return {
      level: null,
      confidence: 'below-threshold',
      source: null,
      stationsInRadius,
      reportedInRadius,
    }
  }
  return { level: null, confidence: 'unknown', source: null, stationsInRadius, reportedInRadius }
}

/**
 * @typedef {object} SegmentPoint
 * @property {number} lat
 * @property {number} lon
 * @property {string} [label]  駅名など。どこが一番揺れたかを提示するために使う。
 */

/**
 * @typedef {object} SegmentSample
 * @property {ShindoLevel|null} level  区間内の最大震度。再開判断は区間の最大値で決まる。
 * @property {Confidence} confidence
 * @property {SegmentPoint|null} at  最大震度を記録した地点。
 * @property {(Observation & {distanceKm: number})|null} source
 * @property {number} unknownPoints  判断材料が取れなかった地点の数。多いなら結論を弱める。
 * @property {number} totalPoints
 */

/**
 * 地点の並び (= 路線・区間) に対して最大震度を求める。
 * 鉄道の運転見合わせは区間内の最大震度で決まるので、平均ではなく最大を取る。
 *
 * @param {Field} field
 * @param {readonly SegmentPoint[]} points
 * @param {number} [radiusKm]
 * @returns {SegmentSample}
 */
export function sampleSegment(field, points, radiusKm = 20) {
  /** @type {{sample: Sample, point: SegmentPoint}|null} */
  let best = null
  let unknownPoints = 0
  let sawBelowThreshold = false

  for (const p of points) {
    const s = sampleAt(field, p.lat, p.lon, radiusKm)
    if (s.confidence === 'unknown') unknownPoints++
    if (s.confidence === 'below-threshold') sawBelowThreshold = true
    if (!s.level) continue
    if (!best || SHINDO_ORDER[s.level] > SHINDO_ORDER[/** @type {ShindoLevel} */ (best.sample.level)]) {
      best = { sample: s, point: p }
    }
  }

  if (best) {
    return {
      level: best.sample.level,
      confidence: 'reported',
      at: best.point,
      source: best.sample.source,
      unknownPoints,
      totalPoints: points.length,
    }
  }
  return {
    level: null,
    confidence: sawBelowThreshold ? 'below-threshold' : 'unknown',
    at: null,
    source: null,
    unknownPoints,
    totalPoints: points.length,
  }
}
