// 指定緊急避難場所。
//
// 出典は国土地理院の指定緊急避難場所データ。市区町村が指定したものを
// 地理院が集約していて、災害種別ごとに分かれている。地震はレイヤ 4。
// https://www.gsi.go.jp/bousaichiri/hinanbasho.html
//
// 国土数値情報の避難施設データ (P20) も同じものを扱うが、最新が 2012 年度で
// 非商用限定。命に関わる案内に 14 年前のデータは使わない。
//
// 地理院のタイルは CORS 開放で、ズーム 10 だけに配信されている。
// 1 枚で数十 km 四方を覆うので、居場所の周りの数枚を取れば足りる。

const ZOOM = 10
const LAYER = 'skhb04' // 地震
const TILE_URL = (x, y) => `https://cyberjapandata.gsi.go.jp/xyz/${LAYER}/${ZOOM}/${x}/${y}.geojson`

/**
 * @typedef {object} Shelter
 * @property {string} name
 * @property {string} address
 * @property {number} lat
 * @property {number} lon
 * @property {number} distanceKm
 */

const lonToTile = (lon) => Math.floor(((lon + 180) / 360) * 2 ** ZOOM)
const latToTile = (lat) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** ZOOM)
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

/** 取ったタイルは覚えておく。同じ場所を開き直すたびに取りに行かない。 */
const cache = new Map()

async function tile(x, y) {
  const key = `${x}/${y}`
  if (cache.has(key)) return cache.get(key)

  const promise = fetch(TILE_URL(x, y))
    .then((r) => (r.ok ? r.json() : { features: [] }))
    // 海の上など、データが無いタイルは 404 が返る。異常ではない。
    .catch(() => ({ features: [] }))
  cache.set(key, promise)
  return promise
}

/**
 * その場所の近くの避難場所を、近い順に返す。
 *
 * タイル境界のすぐ向こうにある避難場所を落とさないよう、
 * 自分のタイルと周囲 8 枚を見る。
 *
 * @param {{lat:number, lon:number}} place
 * @param {number} [limit]
 * @returns {Promise<Shelter[]>}
 */
export async function sheltersNear(place, limit = 5) {
  const tx = lonToTile(place.lon)
  const ty = latToTile(place.lat)

  const around = []
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) around.push(tile(tx + dx, ty + dy))
  }

  const found = []
  for (const geo of await Promise.all(around)) {
    for (const f of geo.features ?? []) {
      // 地震で使える場所だけ。洪水専用の高台などを地震のときに案内しない。
      if (f.properties?.disaster4 !== 1) continue
      const [lon, lat] = f.geometry?.coordinates ?? []
      if (typeof lat !== 'number' || typeof lon !== 'number') continue
      found.push({
        name: f.properties.name ?? '',
        address: f.properties.address ?? '',
        lat,
        lon,
        distanceKm: distanceKm(place.lat, place.lon, lat, lon),
      })
    }
  }

  return found.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit)
}
