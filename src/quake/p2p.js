// P2P地震情報 API v2 → QuakeEvent への正規化。
// https://www.p2pquake.net/develop/json_api_v2/
//
// この API は CORS 開放 & 鍵不要なので、静的ホスティングのままブラウザから直接叩ける。
// 返ってくる points[] は座標を持たないため、stations.js の索引で緯度経度を補う。

import { stationKey } from './stations.js'

/** @typedef {import('./types.js').ShindoLevel} ShindoLevel */
/** @typedef {import('./types.js').Observation} Observation */
/** @typedef {import('./types.js').QuakeEvent} QuakeEvent */
/** @typedef {import('./stations.js').StationIndex} StationIndex */

const ENDPOINT = 'https://api.p2pquake.net/v2/history'

/**
 * P2P の scale (震度×10) → 震度階級。
 * @type {Record<number, ShindoLevel>}
 */
const SCALE_TO_LEVEL = {
  10: '1',
  20: '2',
  30: '3',
  40: '4',
  45: '5-',
  // 46 は「震度5弱以上」の推定値。速報段階で観測点が飽和したときに来る。
  // 下限として扱うのが安全側なので 5弱 に寄せる。
  46: '5-',
  50: '5+',
  55: '6-',
  60: '6+',
  70: '7',
}

/**
 * @param {number} scale
 * @returns {ShindoLevel|null}
 */
export const scaleToLevel = (scale) => SCALE_TO_LEVEL[scale] ?? null

/**
 * P2P の "2026/09/05 17:26:00" は JST。ISO8601 に直す。
 * @param {string} jst
 */
function toIso(jst) {
  const m = jst.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
  if (!m) return jst
  const [, y, mo, d, h, mi, s] = m
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`
}

/**
 * 震度データを空間化する。
 * points[] の一つ一つに座標を与え、引けなかったものは unresolved に残す
 * (観測点マスタが古くなると静かに欠落するので、黙って捨てない)。
 * @param {any} raw  P2P の 1 レコード
 * @param {StationIndex} index
 * @returns {QuakeEvent}
 */
export function normalize(raw, index) {
  /** @type {Observation[]} */
  const observations = []
  /** @type {string[]} */
  const unresolved = []
  let sawStation = false

  for (const p of raw.points ?? []) {
    const level = scaleToLevel(p.scale)
    if (!level) continue // 震度不明(-1)。位置を持たせても意味がないので落とす。

    if (p.isArea) {
      const area = index.areaByName.get(p.addr)
      if (!area) {
        unresolved.push(p.addr)
        continue
      }
      observations.push({
        level,
        lat: area.lat,
        lon: area.lon,
        label: area.name,
        pref: p.pref,
        kind: 'area',
      })
    } else {
      const station = index.byKey.get(stationKey(p.pref, p.addr))
      if (!station) {
        unresolved.push(`${p.pref} ${p.addr}`)
        continue
      }
      sawStation = true
      observations.push({
        level,
        lat: station.lat,
        lon: station.lon,
        label: station.name,
        pref: station.pref,
        kind: 'station',
      })
    }
  }

  const h = raw.earthquake.hypocenter
  // 震源未確定のとき緯度経度は 0 / -200 などで来る。数値として通さない。
  const hasCoord = Number.isFinite(h.latitude) && h.latitude > 0 && h.longitude > 0

  return {
    id: raw.id,
    occurredAt: toIso(raw.earthquake.time),
    issuedAt: toIso(raw.issue.time),
    hypocenter: {
      name: h.name,
      lat: hasCoord ? h.latitude : null,
      lon: hasCoord ? h.longitude : null,
      depthKm: h.depth > 0 ? h.depth : null,
    },
    magnitude: h.magnitude > 0 ? h.magnitude : null,
    maxLevel: scaleToLevel(raw.earthquake.maxScale),
    resolution: sawStation ? 'station' : 'area',
    observations,
    unresolved,
  }
}

/**
 * 直近の地震情報を新しい順に取得する。
 * @param {StationIndex} index
 * @param {{limit?: number, offset?: number, signal?: AbortSignal}} [options]
 * @returns {Promise<QuakeEvent[]>}
 */
export async function fetchRecent(index, { limit = 20, offset = 0, signal } = {}) {
  const res = await fetch(`${ENDPOINT}?codes=551&limit=${limit}&offset=${offset}`, { signal })
  if (!res.ok) throw new Error(`p2pquake: ${res.status} ${res.statusText}`)
  const raw = await res.json()
  return raw.map((/** @type {any} */ r) => normalize(r, index))
}
