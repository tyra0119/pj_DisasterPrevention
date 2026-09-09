// 緯度経度の格子索引。
//
// 「この座標の半径 20km に観測点はいくつあるか」を全国 4,360 点の総当たりで解くと
// 1 クエリ 4,360 回。全国の駅 1 万点に当てると 4,000 万回になり、
// 地震直後にブラウザで回す処理としては重すぎる。格子で候補を絞る。

const KM_PER_DEG_LAT = 111.32
/** @param {number} deg */
const toRad = (deg) => (deg * Math.PI) / 180

/**
 * @template T
 * @typedef {object} Grid
 * @property {number} cellDeg
 * @property {Map<string, T[]>} cells
 * @property {(lat: number, lon: number, radiusKm: number) => T[]} candidates
 *   半径内に入りうる候補を返す。厳密な距離判定は呼び出し側で行う。
 */

/**
 * @param {number} latIdx
 * @param {number} lonIdx
 */
const cellKey = (latIdx, lonIdx) => `${latIdx}:${lonIdx}`

/**
 * @template T
 * @param {readonly T[]} items
 * @param {(item: T) => [number, number]} latLon
 * @param {number} [cellDeg]
 * @returns {Grid<T>}
 */
export function createGrid(items, latLon, cellDeg = 0.25) {
  /** @type {Map<string, T[]>} */
  const cells = new Map()
  for (const item of items) {
    const [lat, lon] = latLon(item)
    const key = cellKey(Math.floor(lat / cellDeg), Math.floor(lon / cellDeg))
    const bucket = cells.get(key)
    if (bucket) bucket.push(item)
    else cells.set(key, [item])
  }

  return {
    cellDeg,
    cells,
    candidates(lat, lon, radiusKm) {
      const dLat = radiusKm / KM_PER_DEG_LAT
      // 高緯度ほど経度 1 度が短くなるので、緯度で割り戻す。
      // cos が 0 に近づく極付近は考えないが、日本国内なら十分。
      const dLon = radiusKm / (KM_PER_DEG_LAT * Math.max(0.1, Math.cos(toRad(lat))))

      const latMin = Math.floor((lat - dLat) / cellDeg)
      const latMax = Math.floor((lat + dLat) / cellDeg)
      const lonMin = Math.floor((lon - dLon) / cellDeg)
      const lonMax = Math.floor((lon + dLon) / cellDeg)

      /** @type {T[]} */
      const out = []
      for (let a = latMin; a <= latMax; a++) {
        for (let o = lonMin; o <= lonMax; o++) {
          const bucket = cells.get(cellKey(a, o))
          if (bucket) out.push(...bucket)
        }
      }
      return out
    },
  }
}
