// 路線マスタの読み込み。

import { dataUrl } from '../data-url.js'

/** @typedef {import('./types.js').RailData} RailData */

/**
 * @param {string} [baseUrl]
 * @returns {Promise<RailData>}
 */
export async function loadRailData(baseUrl) {
  const res = await fetch(dataUrl('rail-lines.json', baseUrl))
  if (!res.ok) throw new Error(`rail-lines.json: ${res.status}`)
  return res.json()
}
