// 事前登録の値。URL クエリに入れて共有できるようにする。
//
// 端末に閉じた設定ではなく URL に置くのは、同行者に「私の設定で見て」と
// 渡せるようにするため。プッシュ通知を前提にしない代わりに、
// リンクを送るのが共有手段になる。
//
//   ?lang=en&home=35.6812,139.7671&homeName=Tokyo&flight=NRT&dep=2026-09-06T09:40

import { detectLang, LANG_CODES } from './i18n.js'

/**
 * @typedef {object} Config
 * @property {import('./i18n.js').Lang} lang
 * @property {{lat:number, lon:number, name:string, en?:string}|null} home
 *   宿。name は日本語、en は英語。共有リンクには両方載せる。
 * @property {string|null} flightAirport  IATA コード。
 * @property {string|null} flightDeparture  出発時刻 (ISO8601 のローカル表記)。
 * @property {string|null} eventId
 *   過去の地震を指定して見るときの ID。指定すると 12 時間の窓を無視する。
 *   「あのときどうだったか」を人に見せるのと、画面の確認に使う。
 * @property {string|null} scenarioId
 *   テスト用の作り物の地震を表示するときの ID。実データが無い震度6弱以上を
 *   確かめるのに要る。表示中は消せないテスト表示を出す。
 */

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * @param {string} [search]
 * @returns {Config}
 */
export function readConfig(search = location.search) {
  const q = new URLSearchParams(search)

  const langParam = q.get('lang')
  const lang = LANG_CODES.includes(/** @type {any} */ (langParam))
    ? /** @type {import('./i18n.js').Lang} */ (langParam)
    : detectLang()

  /** @type {Config['home']} */
  let home = null
  const raw = q.get('home')
  if (raw) {
    const [lat, lon] = raw.split(',').map(num)
    // 日本の範囲外の座標はクエリの壊れとみなす。
    if (lat != null && lon != null && lat > 20 && lat < 46 && lon > 122 && lon < 154) {
      home = { lat, lon, name: q.get('homeName') || '', en: q.get('homeNameEn') || '' }
    }
  }

  return {
    lang,
    home,
    flightAirport: q.get('flight'),
    flightDeparture: q.get('dep'),
    eventId: q.get('event'),
    scenarioId: q.get('scenario'),
  }
}

/**
 * 設定を URL に書き戻す。履歴は積まない (戻るボタンが設定変更で埋まるのを避ける)。
 * @param {Config} config
 */
export function writeConfig(config) {
  const q = new URLSearchParams()
  q.set('lang', config.lang)
  if (config.home) {
    q.set('home', `${config.home.lat.toFixed(4)},${config.home.lon.toFixed(4)}`)
    if (config.home.name) q.set('homeName', config.home.name)
    if (config.home.en) q.set('homeNameEn', config.home.en)
  }
  if (config.flightAirport) q.set('flight', config.flightAirport)
  if (config.flightDeparture) q.set('dep', config.flightDeparture)
  if (config.eventId) q.set('event', config.eventId)
  if (config.scenarioId) q.set('scenario', config.scenarioId)

  const url = `${location.pathname}?${q}`
  history.replaceState(null, '', url)
  return new URL(url, location.href).href
}
