// テスト用の作り物の地震を組み立てる。
//
// 実際の地震を待たないと画面が確かめられないので、想定を入れて動かせるようにする。
// 震度6弱以上は直近の実データに無く、そこが一番判断の重い領域なので、
// 何らかの形で確かめられる必要がある。
//
// **地震動の予測ではない。** 震央からの距離で機械的に震度を振っているだけ。
// 表層地盤も断層の広がりも見ていない。画面と推定の動きを確かめるための足場。
//
// 危ないので、これを表示するときは画面に消せないテスト表示を出すこと。
// 作り物のスクリーンショットが本物として出回るのが最悪の事故になる。

import { SHINDO_ORDER } from '../quake/types.js'
import { distanceKm } from '../quake/field.js'
import { dataUrl } from '../data-url.js'

/** @typedef {import('../quake/types.js').ShindoLevel} ShindoLevel */
/** @typedef {import('../quake/types.js').QuakeEvent} QuakeEvent */
/** @typedef {import('../quake/stations.js').StationIndex} StationIndex */

/** 序数から震度階級に戻すための並び。 */
const LEVELS = /** @type {ShindoLevel[]} */ (['1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'])

/** これより遠いところは計算しない。震度1に届かない。 */
const MAX_RADIUS_KM = 400

/**
 * @typedef {object} Scenario
 * @property {string} id
 * @property {{ja:string, en:string}} title
 * @property {{ja:string, en:string, lat:number, lon:number}} hypocenter
 * @property {number} magnitude
 * @property {ShindoLevel} maxLevel
 * @property {number} falloffKm  この距離ごとに震度が 1 段下がる。
 * @property {number} minutesAgo  何分前に起きたことにするか。
 * @property {'prompt'} [stage]
 *   'prompt' なら震度速報の段階を再現する。観測点単位の震度は無く、
 *   細分区域の代表点だけ。発生から数分間の画面を確かめるのに要る。
 */

/**
 * @typedef {object} ScenarioFile
 * @property {string} note
 * @property {string} noteEn
 * @property {Scenario[]} scenarios
 */

/** @param {string} [baseUrl] @returns {Promise<ScenarioFile>} */
export async function loadScenarios(baseUrl) {
  const res = await fetch(dataUrl('scenarios.json', baseUrl))
  if (!res.ok) throw new Error(`scenarios.json: ${res.status}`)
  return res.json()
}

/**
 * 想定から QuakeEvent を作る。実データと同じ形にするので、
 * 以降の割り当て・合成・停止推定はそのまま通る。
 *
 * @param {Scenario} scenario
 * @param {StationIndex} index
 * @returns {QuakeEvent}
 */
export function buildScenarioEvent(scenario, index) {
  const top = SHINDO_ORDER[scenario.maxLevel]
  const occurredAt = new Date(Date.now() - scenario.minutesAgo * 60000).toISOString()

  const observations = []

  // 速報段階: 区域の代表点にだけ震度を振る。観測点単位はまだ無い。
  if (scenario.stage === 'prompt') {
    for (const area of index.areaByCode.values()) {
      const d = distanceKm(scenario.hypocenter.lat, scenario.hypocenter.lon, area.lat, area.lon)
      if (d > MAX_RADIUS_KM) continue
      const order = top - Math.floor(d / scenario.falloffKm)
      if (order < 1) continue
      observations.push({
        level: LEVELS[Math.min(order, LEVELS.length) - 1],
        lat: area.lat,
        lon: area.lon,
        label: area.name,
        pref: area.pref,
        kind: 'area',
        occurredAt,
      })
    }
  }

  for (const station of scenario.stage === 'prompt' ? [] : index.stations) {
    const d = distanceKm(scenario.hypocenter.lat, scenario.hypocenter.lon, station.lat, station.lon)
    if (d > MAX_RADIUS_KM) continue

    // 距離で 1 段ずつ落とすだけ。地盤も断層の広がりも見ていない。
    const order = top - Math.floor(d / scenario.falloffKm)
    if (order < 1) continue

    observations.push({
      level: LEVELS[Math.min(order, LEVELS.length) - 1],
      lat: station.lat,
      lon: station.lon,
      label: station.name,
      pref: station.pref,
      kind: 'station',
      occurredAt,
    })
  }

  return {
    id: `scenario:${scenario.id}`,
    occurredAt,
    issuedAt: occurredAt,
    hypocenter: {
      name: scenario.hypocenter.ja,
      nameEn: scenario.hypocenter.en,
      lat: scenario.hypocenter.lat,
      lon: scenario.hypocenter.lon,
      depthKm: null,
    },
    magnitude: scenario.magnitude,
    maxLevel: scenario.maxLevel,
    resolution: scenario.stage === 'prompt' ? 'area' : 'station',
    observations,
    unresolved: [],
  }
}
