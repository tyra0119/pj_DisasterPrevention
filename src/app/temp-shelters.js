// 一時滞在施設（帰宅困難者向け）。
//
// 指定緊急避難場所とは用途が違う。あちらは「建物が危ないときに逃げる先」、
// こちらは **「帰れない人が一時的に休む場所」**。このアプリのゴールに直結する。
//
// 全国で揃うデータは無い。機械可読で出しているのは東京都と一部の区だけなので、
// 収録は東京都のみ。**揃っていないことは画面で言う。**
// 黙って空にすると「近くに無い」と読まれる。命に関わる読み違いになる。

import { dataUrl } from '../data-url.js'

/**
 * @typedef {object} TempShelter
 * @property {string} name
 * @property {string} address
 * @property {number} lat
 * @property {number} lon
 * @property {string} source
 * @property {number} [distanceKm]
 */

/**
 * @typedef {object} TempShelterFile
 * @property {string} generatedAt
 * @property {string} note
 * @property {{id:string, name:string, count:number}[]} sources
 * @property {string[]} coverage  収録できている都道府県。
 * @property {number} count
 * @property {TempShelter[]} shelters
 */

/** @param {string} [baseUrl] @returns {Promise<TempShelterFile>} */
export async function loadTempShelters(baseUrl) {
  const res = await fetch(dataUrl('temp-shelters.json', baseUrl))
  if (!res.ok) throw new Error(`temp-shelters.json: ${res.status}`)
  return res.json()
}

const EARTH_RADIUS_KM = 6371
const toRad = (deg) => (deg * Math.PI) / 180
function distanceKm(aLat, aLon, bLat, bLon) {
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRad(aLat)) * Math.cos(toRad(bLat))
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/**
 * 収録できている範囲の中にいるか。
 *
 * 範囲の外なら「近くに無い」ではなく「まだ収録できていない」と言う必要がある。
 * 収録済みの施設からの距離で見る。県境で線を引くより、実際に出せるかどうかで判断できる。
 */
const COVERED_KM = 60

/**
 * その場所の近くの一時滞在施設を、近い順に返す。
 *
 * @param {TempShelterFile} file
 * @param {{lat:number, lon:number}} place
 * @param {number} [limit]
 * @returns {{covered: boolean, list: TempShelter[]}}
 */
export function tempSheltersNear(file, place, limit = 5) {
  const withDistance = file.shelters
    .map((s) => ({ ...s, distanceKm: distanceKm(place.lat, place.lon, s.lat, s.lon) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)

  const nearest = withDistance[0]
  // 一番近いものが遠すぎるなら、この場所は収録範囲の外。
  const covered = Boolean(nearest && nearest.distanceKm <= COVERED_KM)
  return { covered, list: covered ? withDistance.slice(0, limit) : [] }
}
