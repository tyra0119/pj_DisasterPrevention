// アプリ本体。震度ではなく「待つべきか動くべきか」を出す。

import { loadIndex } from '../quake/stations.js'
import { fetchRecent } from '../quake/p2p.js'
import { prepareField } from '../quake/field.js'
import { SHINDO_ORDER } from '../quake/types.js'
import { loadRailData } from '../rail/lines.js'
import { assignToLines } from '../rail/assign.js'
import { composeSystems, loadLineMap } from '../rail/systems.js'
import { dataUrl } from '../data-url.js'
import { formatDuration, t } from './i18n.js'
import { readConfig, writeConfig } from './config.js'
import { buildLookup, situationAt } from './situation.js'
import { buildScenarioEvent, loadScenarios } from './scenario.js'

/** これより前の地震は、いま動くかどうかの判断には効かない。 */
const RELEVANT_HOURS = 12
/** これ未満なら運転規制がかからない (高浜・翠川 2011 の第1段階が震度4)。 */
const RELEVANT_LEVEL = '4'
/** 空港へ向かうのに見ておく移動時間。これを引いて間に合うかを判断する。 */
const TRAVEL_BUFFER_MIN = 120
/** 取り直す間隔。数分で状況が変わる。プッシュは前提にしない。 */
const REFRESH_MS = 60000
/** 1 回の取得件数。API の上限。 */
const PAGE = 100
/** 過去の地震を指定されたときに遡るページ数。 */
const MAX_PAGES = 5

let config = readConfig()
const state = {
  /** @type {{lat:number, lon:number, name:string}|null} */
  here: null,
  /** @type {Date|null} */
  fetchedAt: null,
  stale: false,
  /** @type {string|null} */
  error: null,
  /** @type {Set<string>} */
  showLines: new Set(),
  settingsOpen: false,
}
let data = null
let analysis = null

const $ = (id) => document.getElementById(id)
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )

// ── データ ────────────────────────────────────────────────

async function loadAll() {
  const [index, rail, lineMap, places, scenarios] = await Promise.all([
    loadIndex(),
    loadRailData(),
    loadLineMap(),
    fetch(dataUrl('places.json')).then((r) => {
      if (!r.ok) throw new Error(`places.json: ${r.status}`)
      return r.json()
    }),
    // テスト用の想定。読めなくてもアプリは動く。
    loadScenarios().catch(() => null),
  ])
  return { index, rail, lineMap, places, scenarios, lookup: buildLookup(rail, lineMap) }
}

/** テスト用の作り物を表示しているか。表示中は消せないテスト表示を出す。 */
const isTestMode = () => Boolean(config.scenarioId && currentScenario())

function currentScenario() {
  return data?.scenarios?.scenarios.find((s) => s.id === config.scenarioId) ?? null
}

/**
 * いまの判断に効く地震を 1 つ選ぶ。
 *
 * 直近で震度4以上のもの。より強い古い地震ではなく最新を取るのは、
 * 余震が来れば点検がやり直しになるため。経過時間は別に見せて、
 * 「あとどれくらいか」を利用者が引き算しなくて済むようにする。
 */
function pickRelevant(events) {
  // 過去の地震を指定されているなら、窓を無視してそれを見る。
  if (config.eventId) {
    const found = events.find((e) => e.id === config.eventId)
    if (found) return found
  }
  const cutoff = Date.now() - RELEVANT_HOURS * 3600 * 1000
  return (
    events
      .filter((e) => e.maxLevel && SHINDO_ORDER[e.maxLevel] >= SHINDO_ORDER[RELEVANT_LEVEL])
      .filter((e) => Date.parse(e.occurredAt) >= cutoff)
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0] ?? null
  )
}

async function refresh() {
  state.error = null

  // テスト表示中は実データを取りに行かない。混ざるのが一番危ない。
  const scenario = currentScenario()
  if (scenario) {
    state.fetchedAt = new Date()
    state.stale = false
    analysis = analyse(buildScenarioEvent(scenario, data.index, config.lang))
    render()
    return
  }

  try {
    let events = await fetchRecent(data.index, { limit: PAGE })
    // 過去の地震を名指しされている場合だけ遡る。通常は 1 ページで足りる。
    for (let page = 1; config.eventId && page < MAX_PAGES; page++) {
      if (events.some((e) => e.id === config.eventId)) break
      events = events.concat(
        await fetchRecent(data.index, { limit: PAGE, offset: page * PAGE }),
      )
    }
    state.fetchedAt = new Date()
    state.stale = false
    const event = pickRelevant(events)
    analysis = event ? analyse(event) : { event: null }
  } catch (err) {
    // オフラインでも最後に見た内容は残す。取得時刻を必ず添えるので誤解しない。
    state.stale = true
    if (!analysis) state.error = err.message
  }
  render()
}

function analyse(event) {
  const field = prepareField(event, data.index)
  const impacts = assignToLines(field, data.rail.lines, { radiusKm: 20 })
  const systems = composeSystems(impacts, data.lineMap)
  return {
    event,
    field,
    impactsByLine: new Map(impacts.map((i) => [i.line.id, i])),
    systemImpactsById: new Map(systems.map((s) => [s.system.id, s])),
  }
}

const situation = (place, hint) =>
  situationAt(
    place,
    analysis.field,
    data.lookup,
    analysis.impactsByLine,
    analysis.systemImpactsById,
    hint,
  )

// ── 表示 ──────────────────────────────────────────────────

const locale = (lang) => (lang === 'ja' ? 'ja-JP' : 'en-GB')

const jstTime = (iso, lang) =>
  new Intl.DateTimeFormat(locale(lang), {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(iso))

const jstFull = (d, lang) =>
  new Intl.DateTimeFormat(locale(lang), {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Asia/Tokyo',
  }).format(d)

/** 過去の地震を見ているか。経過時間を引くと意味が変わるので分ける。 */
const isPastView = () => Boolean(config.eventId && analysis?.event && config.eventId === analysis.event.id)

/**
 * 発生からの経過を引いた「あとどれくらい」。過ぎていれば over。
 * 過去の地震を見ているときは引かない (「もう過ぎています」しか出なくなるため)。
 */
function remaining(suspension, event) {
  if (!suspension.waitMinutes) return null
  const elapsed = isPastView() ? 0 : (Date.now() - Date.parse(event.occurredAt)) / 60000
  const max = suspension.waitMinutes.max - elapsed
  if (max <= 0) return { over: true, min: 0, max: 0 }
  return { over: false, min: Math.max(suspension.waitMinutes.min - elapsed, 0), max }
}

function waitText(suspension, event, lang) {
  const s = t(lang)
  if (suspension.openEnded) return s.noEstimate
  if (suspension.stage === 'caution') return s.expectDelay
  if (!suspension.waitMinutes) return ''
  const rem = remaining(suspension, event)
  if (rem && rem.over) return s.inspectionPassed
  return s.expectWait(`${formatDuration(rem.min, lang)}–${formatDuration(rem.max, lang)}`)
}

const ADVICE_KEY = {
  normal: 'adviceNormal',
  delay: 'adviceDelay',
  wait: 'adviceWait',
  'avoid-rail': 'adviceAvoid',
}
const STATUS_KEY = {
  normal: 'statusNormal',
  delay: 'statusDelay',
  wait: 'statusWait',
  'avoid-rail': 'statusAvoid',
}
const LEAD_KEY = {
  normal: 'leadNormal',
  delay: 'leadDelay',
  wait: 'leadWait',
  'avoid-rail': 'leadAvoid',
}
const CHIP_KEY = {
  normal: 'chipNormal',
  delay: 'chipDelay',
  wait: 'chipWait',
  'avoid-rail': 'chipAvoid',
}

/** 重い順。判定はいちばん重い場所に合わせる。 */
const ADVICE_RANK = { normal: 0, delay: 1, wait: 2, 'avoid-rail': 3 }

/**
 * 登録されている場所を、画面に出す順に並べて返す。
 * 未設定のものも行として出す。設定していないことが分かる必要があるため。
 */
function places(lang) {
  const s = t(lang)
  const out = [
    { id: 'here', label: s.hereTitle, place: state.here, hint: {} },
    { id: 'home', label: s.homeTitle, place: config.home, hint: {} },
  ]

  const airport = config.flightAirport
    ? data.places.airports.find((a) => a.iata === config.flightAirport)
    : null
  if (airport) {
    out.push({
      id: 'flight',
      label: s.flightTitle,
      place: { ...airport, name: `${lang === 'en' ? airport.en : airport.ja} (${airport.iata})` },
      hint: { lineIds: airport.lines, systemIds: airport.systems },
      airport,
    })
  } else {
    out.push({ id: 'flight', label: s.flightTitle, place: null, hint: {} })
  }
  return out
}

/** 画面全体の判定。いちばん重い場所に合わせ、待ち時間は代表値を使う。 */
function overall(lang) {
  const s = t(lang)
  if (!analysis.event) {
    return { advice: 'normal', status: s.statusNormal, lead: s.leadNormal, wait: '', action: '' }
  }

  const known = places(lang).filter((p) => p.place)
  if (known.length === 0) {
    return { advice: 'unset', status: '', lead: s.noPlaces, wait: '', action: '' }
  }

  let worst = null
  let representative = null
  for (const p of known) {
    const sit = situation(p.place, p.hint)
    if (!worst || ADVICE_RANK[sit.worst.advice] > ADVICE_RANK[worst.advice]) worst = sit.worst
    if (!representative || ADVICE_RANK[sit.typical.advice] > ADVICE_RANK[representative.advice]) {
      representative = sit.typical
    }
  }

  const advice = worst.advice
  return {
    advice,
    status: s[STATUS_KEY[advice]],
    lead: s[LEAD_KEY[advice]],
    // 待ち時間は代表値。いちばん長い路線に引きずられると、
    // 数駅戻るだけの人にまで長い時間を言うことになる。
    //
    // 平常時は出さない。被害の領域でも出さない
    // (「見通し不明」はリード文がすでに言っていて、二度言うと読み飛ばされる)。
    wait:
      advice === 'normal' || advice === 'avoid-rail'
        ? ''
        : waitText(representative, analysis.event, lang),
    action: whatNow(lang),
  }
}

function whatNow(lang) {
  const s = t(lang)
  if (!analysis.event) return ''
  const advices = places(lang)
    .filter((p) => p.place)
    .map((p) => situation(p.place, p.hint).worst.advice)
  if (advices.includes('avoid-rail')) return s.actShelter
  if (advices.includes('wait')) return s.actWait
  return s.actMove
}

function verdictBlock(lang) {
  const v = overall(lang)
  if (v.advice === 'unset') {
    return `<section class="verdict v-unset">
      <p class="v-lead">${esc(v.lead)}</p>
    </section>`
  }
  return `<section class="verdict v-${v.advice}">
    <p class="v-status">${esc(v.status)}</p>
    <p class="v-lead">${esc(v.lead)}</p>
    ${v.wait ? `<p class="v-eta">${esc(v.wait)}</p>` : ''}
    ${v.action ? `<p class="v-act">${esc(v.action)}</p>` : ''}
  </section>`
}

function lineList(sit, lang) {
  return sit.lines
    .map((l) => {
      const name = lang === 'en' && l.titleEn ? l.titleEn : l.title
      const advice = l.suspension.advice
      return `<li><span class="ln">${esc(name)}</span><span class="chip c-${advice}">${esc(t(lang)[CHIP_KEY[advice]])}</span></li>`
    })
    .join('')
}

/** 未設定の場所を、その場で設定できる欄。 */
function setupPanel(entry, lang) {
  const s = t(lang)
  if (entry.id === 'here') {
    return `<div class="panel">
      <button class="primary" data-locate="1">${esc(s.setLocation)}</button>
      <div class="picker">
        <input id="here-search" type="search" placeholder="${esc(s.pickStation)}" autocomplete="off">
        <ul id="here-results"></ul>
      </div>
    </div>`
  }
  if (entry.id === 'home') {
    return `<div class="panel">
      <p class="hint">${esc(s.homeHelp)}</p>
      <div class="picker">
        <input id="home-search" type="search" placeholder="${esc(s.searchHome)}" autocomplete="off">
        <ul id="home-results"></ul>
      </div>
    </div>`
  }
  return `<div class="panel">
    <p class="hint">${esc(s.chooseAirport)}</p>
    <button class="primary" data-settings="1">${esc(s.settings)}</button>
  </div>`
}

function placeRow(entry, lang) {
  const s = t(lang)
  const open = state.showLines.has(entry.id)

  if (!entry.place) {
    return `<li class="place">
      <button class="prow" data-toggle="${esc(entry.id)}" aria-expanded="${open}">
        <span class="p-label">${esc(entry.label)}</span>
        <span class="p-name muted">${esc(s.tapToSet)}</span>
        <span class="chip c-unset">${esc(s.notSet)}</span>
      </button>
      ${open ? setupPanel(entry, lang) : ''}
    </li>`
  }

  // 対象の地震が無いときは場所ごとの計算そのものが無い (震度の場が作られない)。
  // 設定した場所は名前だけ出す。
  if (!analysis.event) {
    return `<li class="place">
      <div class="prow">
        <span class="p-label">${esc(entry.label)}</span>
        <span class="p-name">${esc(entry.place.name || '—')}</span>
        <span class="chip c-normal">${esc(s.chipNormal)}</span>
      </div>
    </li>`
  }

  const sit = situation(entry.place, entry.hint)
  const unknown = sit.worst.stage === 'none' && sit.confidence === 'unknown'
  const advice = sit.worst.advice
  const chip = unknown ? s.chipUnknown : s[CHIP_KEY[advice]]

  // 出国便だけは「間に合うか」を行に出す。ここが判断の分かれ目になる。
  let extra = ''
  if (entry.id === 'flight' && config.flightDeparture && !isPastView()) {
    const untilMin = (new Date(config.flightDeparture).getTime() - Date.now()) / 60000
    if (untilMin <= 0) {
      extra = `<p class="p-extra">${esc(s.flightPassed)}</p>`
    } else {
      const rem = remaining(sit.worst, analysis.event)
      // 再開してから空港まで移動する時間も要る。最悪側で見る。
      const worstCase = (rem && !rem.over ? rem.max : 0) + TRAVEL_BUFFER_MIN
      const verdict = sit.worst.openEnded
        ? s.flightUnlikely
        : worstCase <= untilMin
          ? s.flightOk
          : worstCase <= untilMin * 1.5
            ? s.flightTight
            : s.flightUnlikely
      extra = `<p class="p-extra">${esc(s.flightIn(formatDuration(untilMin, lang)))} · ${esc(verdict)}</p>`
    }
  }

  return `<li class="place">
    <button class="prow" data-toggle="${esc(entry.id)}" aria-expanded="${open}">
      <span class="p-label">${esc(entry.label)}</span>
      <span class="p-name">${esc(entry.place.name || '—')}</span>
      <span class="chip c-${unknown ? 'unset' : advice}">${esc(chip)}</span>
    </button>
    ${extra}
    ${open && sit.lines.length
      ? `<ul class="lines">${lineList(sit, lang)}</ul>`
      : open
        ? `<div class="panel"><p class="hint">${esc(s.unknownHere)}</p></div>`
        : ''}
  </li>`
}

function settingsPanel(lang) {
  const s = t(lang)
  const options = data.places.airports
    .map(
      (a) =>
        `<option value="${esc(a.iata)}"${config.flightAirport === a.iata ? ' selected' : ''}>${esc(lang === 'en' ? a.en : a.ja)} (${esc(a.iata)})</option>`,
    )
    .join('')

  return `<section class="settings">
    <h2>${esc(s.settings)}</h2>
    <label>${esc(s.homeTitle)}</label>
    <p class="value">${config.home ? esc(config.home.name || `${config.home.lat}, ${config.home.lon}`) : esc(s.noHome)}</p>
    <p class="hint">${esc(s.homeHelp)}</p>
    <div class="picker">
      <input id="home-search" type="search" placeholder="${esc(s.searchHome)}" autocomplete="off">
      <ul id="home-results"></ul>
    </div>
    <div class="row">
      ${state.here ? `<button class="link" data-sethome="1">${esc(s.setHome)}</button>` : ''}
      ${config.home ? `<button class="link" data-clearhome="1">${esc(s.clear)}</button>` : ''}
    </div>
    <label for="airport">${esc(s.chooseAirport)}</label>
    <select id="airport"><option value="">—</option>${options}</select>
    <label for="dep">${esc(s.departureTime)}</label>
    <input id="dep" type="datetime-local" value="${esc(config.flightDeparture ?? '')}">
    <div class="row">
      <button class="primary" data-savefl="1">${esc(s.save)}</button>
      <button class="link" data-share="1">${esc(s.share)}</button>
      <button class="link" data-settings="0">${esc(s.close)}</button>
    </div>
  </section>`
}

function body(lang) {
  const s = t(lang)
  if (state.error && !analysis) return `<section class="verdict v-unset"><p class="v-lead">${esc(state.error)}</p></section>`
  if (!analysis) return `<section class="verdict v-unset"><p class="v-lead">${esc(s.checking)}</p></section>`

  const e = analysis.event
  const quakeLine = e
    ? `<p class="quake${config.eventId === e.id ? ' past' : ''}">
         ${e.magnitude ? `${esc(s.magnitude(e.magnitude))} · ` : ''}${esc(e.hypocenter.name)} · ${esc(jstTime(e.occurredAt, lang))}
         ${config.eventId === e.id ? `<span class="past-note">${esc(s.pastEvent(jstFull(new Date(e.occurredAt), lang)))}</span>` : ''}
       </p>`
    : ''

  return `${verdictBlock(lang)}
    ${quakeLine}
    <ul class="places">${places(lang).map((p) => placeRow(p, lang)).join('')}</ul>`
}

function render() {
  const lang = config.lang
  const s = t(lang)
  document.documentElement.lang = lang
  document.title = `${s.appName} — ${s.tagline}`

  const testBanner = isTestMode()
    ? `<div class="testbar" role="alert">
         <strong>${esc(s.testBanner)}</strong>
         <span>${esc(s.testBannerBody)}</span>
         <button class="link" data-exittest="1">${esc(s.exitTest)}</button>
       </div>`
    : ''

  $('app').innerHTML = testBanner + `
    <header class="top">
      <div class="brand">
        <h1>${esc(s.appName)}</h1>
        <p>${esc(s.tagline)}</p>
      </div>
      <div class="controls">
        <button class="lang" data-lang="${lang === 'en' ? 'ja' : 'en'}">${lang === 'en' ? '日本語' : 'EN'}</button>
        <button class="link" data-settings="1">${esc(s.settings)}</button>
      </div>
    </header>
    ${body(lang)}
    ${state.settingsOpen && data ? settingsPanel(lang) : ''}
    <p class="stamp">
      ${state.fetchedAt ? `${esc(s.lastChecked)} ${esc(jstFull(state.fetchedAt, lang))} JST` : esc(s.checking)}
      ${state.stale ? `<span class="warn">${esc(s.offline)}</span>` : ''}
      <button class="link" data-refresh="1">${esc(s.reload)}</button>
    </p>
    <section class="caveat">
      <h2>${esc(s.caveatTitle)}</h2>
      <p>${esc(s.caveat)}</p>
      <p class="src">${esc(s.sources)}: 気象庁 / P2P地震情報 / 国土数値情報（鉄道データ）CC BY 4.0 / 公共交通オープンデータセンター / 高浜・翠川 (2011) 日本地震工学会論文集 11(2)</p>
      <p class="src"><a href="test.html">test</a> · <a href="diagnostics.html">diagnostics</a></p>
    </section>`
  wire()
}

// ── 操作 ──────────────────────────────────────────────────

function wire() {
  for (const el of document.querySelectorAll('[data-toggle]')) {
    el.onclick = () => {
      const id = el.dataset.toggle
      if (state.showLines.has(id)) state.showLines.delete(id)
      else state.showLines.add(id)
      render()
    }
  }
  for (const el of document.querySelectorAll('[data-settings]')) {
    el.onclick = () => {
      state.settingsOpen = el.dataset.settings === '1'
      render()
    }
  }

  const on = (sel, fn) => {
    const el = document.querySelector(sel)
    if (el) el.onclick = fn
  }
  on('[data-lang]', (ev) => {
    config.lang = ev.currentTarget.dataset.lang
    writeConfig(config)
    render()
  })
  on('[data-refresh]', refresh)
  on('[data-exittest]', () => {
    config.scenarioId = null
    writeConfig(config)
    refresh()
  })
  on('[data-locate]', locate)
  on('[data-sethome]', () => {
    config.home = { ...state.here }
    writeConfig(config)
    render()
  })
  on('[data-clearhome]', () => {
    config.home = null
    writeConfig(config)
    render()
  })
  on('[data-savefl]', () => {
    config.flightAirport = $('airport').value || null
    config.flightDeparture = $('dep').value || null
    writeConfig(config)
    state.settingsOpen = false
    render()
  })
  on('[data-share]', async (ev) => {
    const url = writeConfig(config)
    try {
      await navigator.clipboard.writeText(url)
      ev.currentTarget.textContent = t(config.lang).copied
    } catch {
      // クリップボードが使えない環境でも、URL はアドレスバーに入っている。
    }
  })

  wireSearch('here-search', 'here-results', (place) => {
    state.here = place
    saveHere()
    render()
  })
  // 宿は「そこにいるうちに」ではなく、いつでも駅から選べる必要がある。
  wireSearch('home-search', 'home-results', (place) => {
    config.home = place
    writeConfig(config)
    render()
  })
}

function wireSearch(inputId, listId, onPick) {
  const input = $(inputId)
  if (input) input.oninput = () => renderResults(input.value, listId, onPick)
}

function renderResults(query, listId, onPick) {
  const list = $(listId)
  if (!list) return
  const trimmed = query.trim()
  if (trimmed.length < 2) {
    list.innerHTML = ''
    return
  }
  const q = trimmed.toLowerCase()
  const hits = data.places.stations
    .filter((s) => s.en.toLowerCase().includes(q) || s.ja.includes(trimmed))
    .slice(0, 8)

  list.innerHTML = hits
    .map(
      (s) =>
        `<li><button data-lat="${s.lat}" data-lon="${s.lon}" data-name="${esc(config.lang === 'en' ? s.en : s.ja)}">${esc(s.en)} · ${esc(s.ja)}</button></li>`,
    )
    .join('')

  for (const b of list.querySelectorAll('button')) {
    b.onclick = () =>
      onPick({ lat: Number(b.dataset.lat), lon: Number(b.dataset.lon), name: b.dataset.name })
  }
}

function locate() {
  const s = t(config.lang)
  const btn = document.querySelector('[data-locate]')
  if (!navigator.geolocation) {
    if (btn) btn.textContent = s.locationDenied
    return
  }
  if (btn) btn.textContent = s.locating
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.here = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: '' }
      saveHere()
      render()
    },
    () => {
      if (btn) btn.textContent = s.locationDenied
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  )
}

/** 現在地は端末に閉じた利便。消えても困らないので localStorage で足りる。 */
function saveHere() {
  try {
    localStorage.setItem('here', JSON.stringify(state.here))
  } catch {
    // プライベートウィンドウなどでは書けない。動作に必須ではない。
  }
}

function restoreHere() {
  try {
    const raw = localStorage.getItem('here')
    if (raw) state.here = JSON.parse(raw)
  } catch {
    // 読めなくても初期状態で動く。
  }
}

// ── 起動 ──────────────────────────────────────────────────

export async function start() {
  restoreHere()
  render()
  try {
    data = await loadAll()
  } catch (err) {
    state.error = err.message
    render()
    return
  }
  await refresh()
  setInterval(refresh, REFRESH_MS)
}
