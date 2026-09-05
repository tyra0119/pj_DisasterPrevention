// 路線マスタの型。国土数値情報 鉄道データ (N02) 由来。

/**
 * 路線。
 *
 * 注意: N02 の路線名は「線路名称」であって「運転系統」ではない。
 * 例えば N02 の山手線は品川〜新宿〜田端の 17 駅で、乗客が思う一周ではない
 * (東京〜品川は東海道線、田端〜東京は東北線として入っている)。
 * ODPT の運行情報は運転系統単位なので、突き合わせるときは
 * 運転系統 1 本 ↔ N02 路線 複数 の対応表が要る。
 *
 * @typedef {object} RailLine
 * @property {string} id  事業者名+路線名から決まる安定 ID。
 * @property {string} operator  運営会社 (N02_004)。
 * @property {string} name  路線名 (N02_003)。
 * @property {number} operatorType  operatorTypes への添字。1=JRの新幹線 2=JR在来線 3=公営鉄道 4=民営鉄道 5=第三セクター
 * @property {RailStation[]} stations
 * @property {[number, number][]} track  線形を約 2km 間隔に間引いた [lat, lon]。駅間が長い路線の穴を埋める。
 */

/**
 * @typedef {object} RailStation
 * @property {string} code  N02 の駅コード (N02_005c)。同一路線内で一意。
 * @property {string} name
 * @property {number} lat
 * @property {number} lon
 */

/**
 * @typedef {object} RailData
 * @property {string} generatedAt
 * @property {string} source
 * @property {string} edition
 * @property {string} license
 * @property {string[]} operatorTypes
 * @property {number} count
 * @property {RailLine[]} lines
 */

export {}
