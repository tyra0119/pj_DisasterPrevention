// 観測点マスタの読み込みと索引。
// scripts/build-shindo-data.mjs が出力した 2 ファイルを読み、
// P2P の (pref, addr) / 区域名 から座標を引けるようにする。

import { dataUrl } from '../data-url.js'

/** @typedef {import('./types.js').Station} Station */
/** @typedef {import('./types.js').Area} Area */

/**
 * @typedef {object} StationIndex
 * @property {Station[]} stations
 * @property {Map<string, Station>} byKey  `${pref}\0${name}` → 観測点。
 * @property {Map<string, Area>} areaByName  区域名 → 細分区域。速報の addr は区域名で来る。
 * @property {Map<string, Area>} areaByCode
 * @property {string} generatedAt
 */

/**
 * @param {string} pref
 * @param {string} name
 */
export const stationKey = (pref, name) => `${pref}\u0000${name}`

/**
 * @param {{generatedAt: string, stations: Station[]}} stationsFile
 * @param {{areas: Area[]}} areasFile
 * @returns {StationIndex}
 */
export function buildIndex(stationsFile, areasFile) {
  /** @type {Map<string, Station>} */
  const byKey = new Map()
  for (const s of stationsFile.stations) byKey.set(stationKey(s.pref, s.name), s)

  /** @type {Map<string, Area>} */
  const areaByName = new Map()
  /** @type {Map<string, Area>} */
  const areaByCode = new Map()
  for (const a of areasFile.areas) {
    areaByName.set(a.name, a)
    areaByCode.set(a.code, a)
  }

  return {
    stations: stationsFile.stations,
    byKey,
    areaByName,
    areaByCode,
    generatedAt: stationsFile.generatedAt,
  }
}

/**
 * 観測点マスタを取得する。
 * Service Worker のプリキャッシュ対象なので、fetch はキャッシュ優先で構わない。
 * @param {string} [baseUrl]
 * @returns {Promise<StationIndex>}
 */
export async function loadIndex(baseUrl) {
  const [stationsFile, areasFile] = await Promise.all([
    fetch(dataUrl('shindo-stations.json', baseUrl)).then((r) => {
      if (!r.ok) throw new Error(`shindo-stations.json: ${r.status}`)
      return r.json()
    }),
    fetch(dataUrl('shindo-areas.json', baseUrl)).then((r) => {
      if (!r.ok) throw new Error(`shindo-areas.json: ${r.status}`)
      return r.json()
    }),
  ])
  return buildIndex(stationsFile, areasFile)
}
