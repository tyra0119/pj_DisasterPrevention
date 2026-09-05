// 震度とイベントの型。型は JSDoc で持つ (ビルド無しで配信するため)。

/**
 * 気象庁震度階級。P2P の scale 値ではなく、表示・比較に使う正規化済みの形。
 * @typedef {'1'|'2'|'3'|'4'|'5-'|'5+'|'6-'|'6+'|'7'} ShindoLevel
 */

/**
 * 強い順に並べるための序数。震度は 5弱/5強 があるので数値そのものでは比較できない。
 * @type {Record<ShindoLevel, number>}
 */
export const SHINDO_ORDER = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5-': 5,
  '5+': 6,
  '6-': 7,
  '6+': 8,
  '7': 9,
}

/**
 * @typedef {object} Station
 * @property {string} pref
 * @property {string} name  P2P の points[].addr と一致する観測点名。(pref, name) で一意。
 * @property {number} lat
 * @property {number} lon
 * @property {string|null} cityCode
 * @property {string|null} cityName
 * @property {string|null} areaCode  細分区域コード。速報(区域単位)と詳細(観測点単位)を繋ぐ。
 * @property {string|null} areaName
 * @property {number} affi  affiliations 配列への添字。0=気象庁 1=地方公共団体 2=防災科学技術研究所
 */

/**
 * @typedef {object} Area
 * @property {string} code
 * @property {string} name
 * @property {string} pref
 * @property {number} lat  所属観測点の重心。区域ポリゴンの代わり。
 * @property {number} lon
 * @property {[number, number, number, number]} bbox  [west, south, east, north]
 * @property {number} stationCount
 */

/**
 * 座標が付いた 1 観測点の震度。震度データを空間に載せた後の単位。
 * @typedef {object} Observation
 * @property {ShindoLevel} level
 * @property {number} lat
 * @property {number} lon
 * @property {string} label  観測点名(詳細情報)または細分区域名(速報)。
 * @property {string} pref
 * @property {'station'|'area'} kind  速報の区域代表点は実測地点ではないので区別する。
 */

/**
 * 1 回の地震。P2P / 気象庁いずれの経路でもこの形に正規化する。
 * @typedef {object} QuakeEvent
 * @property {string} id
 * @property {string} occurredAt  発生時刻 (ISO8601, +09:00)。
 * @property {string} issuedAt    情報の発表時刻 (ISO8601, +09:00)。
 * @property {{name: string, nameEn?: string|null, lat: number|null, lon: number|null, depthKm: number|null}} hypocenter
 *   name は日本語。nameEn は想定シナリオだけが持つ。実データの英語名は
 *   気象庁の一覧から引く (src/quake/jma.js)。
 * @property {number|null} magnitude
 * @property {ShindoLevel|null} maxLevel
 * @property {'area'|'station'} resolution  詳細が出るまでは 'area' 止まり。
 * @property {Observation[]} observations
 * @property {string[]} unresolved  座標を引けなかった観測点名。辞書の劣化を検知するため捨てない。
 */

export {}
