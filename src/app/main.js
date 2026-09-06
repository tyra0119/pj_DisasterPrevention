// アプリ本体。震度ではなく「待つべきか動くべきか」を出す。

import { loadIndex } from '../quake/stations.js'
import { fetchRecent } from '../quake/p2p.js'
import { prepareField } from '../quake/field.js'
import { SHINDO_ORDER } from '../quake/types.js'
import { loadRailData } from '../rail/lines.js'
import { assignToLines } from '../rail/assign.js'
import { composeSystems, loadLineMap } from '../rail/systems.js'
import { dataUrl } from '../data-url.js'
import { formatDuration, LANGS, locale, t } from './i18n.js'
import { readConfig, writeConfig } from './config.js'
import { buildLookup, situationAt } from './situation.js'
import { buildScenarioEvent, loadScenarios } from './scenario.js'
import { hypocenterName, refreshHypocenterNames } from '../quake/jma.js'
import { mapFrame, paintMaps } from './map.js'
import { sheltersNear } from './shelters.js'
import { loadTempShelters, tempSheltersNear } from './temp-shelters.js'
import { addressAt } from './address.js'

/** これより前の地震は、いま動くかどうかの判断には効かない。 */
const RELEVANT_HOURS = 12
/** これ未満なら運転規制がかからない (高浜・翠川 2011 の第1段階が震度4)。 */
const RELEVANT_LEVEL = '4'
/** 空港へ向かうのに見ておく移動時間。これを引いて間に合うかを判断する。 */
const TRAVEL_BUFFER_MIN = 120
/** 宿へ戻るのに見ておく移動時間。空港ほど遠くない。 */
const RIDE_HOME_MIN = 60
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
  /** 避難場所は開いたときに取りに行く。取れたら覚えておく。 */
  shelters: /** @type {{key: string, list: any[]|null}} */ ({ key: '', list: null }),
  /** 現在地の住所。逆ジオコーディングで引く。 */
  address: /** @type {{key: string, text: string|null}} */ ({ key: '', text: null }),
}
let data = null
let analysis = null

/**
 * 日本語以外はすべて英語に寄せる。中国語・韓国語の対訳が無いものが多く、
 * 日本語のまま出すより英語の方が読める人が多い。
 * @param {string} ja @param {string|null|undefined} en @param {string} lang
 */
const pick = (ja, en, lang) => (lang === 'ja' ? ja || en || '' : en || ja || '')

const $ = (id) => document.getElementById(id)
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )

// ── データ ────────────────────────────────────────────────

async function loadAll() {
  const [index, rail, lineMap, places, scenarios, tempShelters] = await Promise.all([
    loadIndex(),
    loadRailData(),
    loadLineMap(),
    fetch(dataUrl('places.json')).then((r) => {
      if (!r.ok) throw new Error(`places.json: ${r.status}`)
      return r.json()
    }),
    // テスト用の想定。読めなくてもアプリは動く。
    loadScenarios().catch(() => null),
    // 一時滞在施設。収録は東京都のみ。読めなくてもアプリは動く。
    loadTempShelters().catch(() => null),
  ])
  return { index, rail, lineMap, places, scenarios, tempShelters, lookup: buildLookup(rail, lineMap) }
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
      // 窓の中で最も強いもの。同じ強さなら新しい方。
      //
      // 最初は「最新」を取っていた。すると震度5弱の本震のあとに震度4の余震が来た
      // 時点で判定が「遅れ・30分」に格下げされる。本震の点検はまだ続いている。
      // 小さい余震で判定を下げてはいけない。大きい余震なら新しい方が勝つ。
      .sort(
        (a, b) =>
          SHINDO_ORDER[b.maxLevel] - SHINDO_ORDER[a.maxLevel] ||
          Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
      )[0] ?? null
  )
}

async function refresh() {
  state.error = null

  // テスト表示中は実データを取りに行かない。混ざるのが一番危ない。
  const scenario = currentScenario()
  if (scenario) {
    state.fetchedAt = new Date()
    state.stale = false
    analysis = analyse(buildScenarioEvent(scenario, data.index))
    render()
    return
  }

  // 震源地名の対訳を拾っておく。失敗しても日本語名で動く。
  refreshHypocenterNames()

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
    // 生のエラー文字列 (Failed to fetch) は読み手の言葉ではない。
    if (!analysis) state.error = t(config.lang).fetchFailed
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

/**
 * 現在地に名前をつける。緯度経度だけ出されても、そこがどこか分からない。
 * 最寄り駅の名前を借りる。2km 以内に駅が無ければ座標を出す。
 */
function nameForCoords(lat, lon, lang) {
  const s = t(lang)

  // 住所を出す。駅名より正確で、人に見せて伝えられる。
  //
  // 取得はここで促す。行を開いたときに初めて引くようにしていたら、
  // 閉じているあいだは緯度経度で、タップした瞬間に住所へ入れ替わっていた。
  // 表示が操作で変わるのは、こちらの都合が漏れているだけ。
  const address = addressFor({ lat, lon, geo: true })
  if (address) return address

  if (!data?.places) return s.coordsOnly(lat.toFixed(3), lon.toFixed(3))

  let best = null
  for (const st of data.places.stations) {
    // 粗く絞ってから距離を測る。全駅に haversine をかける必要はない。
    if (Math.abs(st.lat - lat) > 0.05 || Math.abs(st.lon - lon) > 0.05) continue
    const d = (st.lat - lat) ** 2 + (st.lon - lon) ** 2
    if (!best || d < best.d) best = { d, st }
  }
  if (!best) return s.coordsOnly(lat.toFixed(3), lon.toFixed(3))
  return s.nearStation(pick(best.st.ja, best.st.en, lang))
}

/**
 * 現在地の住所。引けていなければ引きに行き、取れたら描き直す。
 * 住所は人に見せられる。言葉が通じないとき、これが一番効く。
 */
function addressFor(place) {
  if (!place?.geo || !data?.places) return null
  const key = `${place.lat.toFixed(4)},${place.lon.toFixed(4)}`
  if (state.address.key === key) return state.address.text

  state.address = { key, text: null }
  addressAt(place.lat, place.lon, data.places.municipalities).then((text) => {
    if (state.address.key !== key || !text) return
    state.address = { key, text }
    render()
  })
  return null
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

/** 待ち時間の値だけ。見出しがある場所ではこちらを使う。 */
function waitValue(suspension, event, lang) {
  const s = t(lang)
  if (suspension.openEnded) return s.noEstimate
  if (suspension.stage === 'caution') return s.expectDelay
  if (!suspension.waitMinutes) return ''
  const rem = remaining(suspension, event)
  if (rem && rem.over) return s.inspectionPassed

  const span = `${formatDuration(rem.min, lang)}–${formatDuration(rem.max, lang)}`
  // 時刻も添える。「5時間35分」だけだと、その場で引き算をさせることになる。
  // 過去の地震を見ているときは、いまから数えても意味がないので出さない。
  if (isPastView()) return span
  const from = jstTime(new Date(Date.now() + rem.min * 60000).toISOString(), lang)
  const to = jstTime(new Date(Date.now() + rem.max * 60000).toISOString(), lang)
  return `${span} · ${s.resumeBy(from, to)}`
}

/** 見出しの無い場所で使う。「再開まで」を頭に付ける。 */
function waitText(suspension, event, lang) {
  const s = t(lang)
  const value = waitValue(suspension, event, lang)
  if (!value) return ''
  // 幅を出せていないとき (見通し不明・遅れのみ・点検時間を過ぎた) は、
  // その文言だけで意味が通っているので「再開まで」を付けない。
  if (!suspension.waitMinutes || suspension.openEnded || suspension.stage === 'caution') return value
  const rem = remaining(suspension, event)
  if (rem && rem.over) return value
  return s.expectWait(value)
}

/**
 * いまから終電までの分。日本の鉄道はおおむね 5:00〜24:00。
 * 深夜 0〜5 時はすでに終電のあとなので 0 を返す。
 */
function minutesUntilLastTrain() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  }).formatToParts(new Date())
  const h = Number(parts.find((p) => p.type === 'hour').value)
  const m = Number(parts.find((p) => p.type === 'minute').value)
  if (h < 5) return 0
  return 24 * 60 - (h * 60 + m)
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

/** 震度速報しか無い段階か。観測点単位の震度が来るまで、場所ごとの推定は出せない。 */
const isPromptStage = () => analysis?.event?.resolution === 'area'

/** 画面全体の判定。いちばん重い場所に合わせ、待ち時間は代表値を使う。 */
function overall(lang) {
  const s = t(lang)
  if (!analysis.event) {
    return { advice: 'normal', status: s.statusNormal, lead: s.leadNormal, wait: '', lead2: '', note: '' }
  }

  // 発生から数分は震度速報 (区域単位) しか無く、観測点単位の推定が出せない。
  // ここで場所ごとの計算をすると、全部 unknown → 「平常どおり」と出てしまう。
  // 強い地震の直後に「平常」は最悪の誤り。速報段階だと言い切る。
  if (isPromptStage()) {
    return {
      advice: 'pending',
      status: s.statusPending,
      lead: s.leadPending,
      wait: '',
      lead2: s.actPending,
      note: '',
    }
  }

  const known = places(lang).filter((p) => p.place)
  if (known.length === 0) {
    // 場所が無くても、地震が起きたことと重さは見せる。
    // 「いる場所を教えてください」だけだと、何が起きたか分からない。
    return { advice: 'unset', status: s.statusQuake, lead: s.noPlaces, wait: '', lead2: '', note: '' }
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
  const decided = decision(lang, representative)

  // 推定の上限を過ぎたら「止まっている見込み」とは言わない。
  // 実際の再開を知る術が無いので、再開しているかもしれないと言う。
  const rem = advice === 'wait' ? remaining(representative, analysis.event) : null
  const expired = Boolean(rem && rem.over)

  return {
    // 上限を過ぎたら見た目も「止まっている」から落とす。赤のままだと言葉と色が食い違う。
    advice: expired ? 'expired' : advice,
    status: expired ? s.statusMayResume : s[STATUS_KEY[advice]],
    lead: expired ? s.leadMayResume : s[LEAD_KEY[advice]],
    // 待ち時間は代表値。いちばん長い路線に引きずられると、
    // 数駅戻るだけの人にまで長い時間を言うことになる。
    //
    // 平常時は出さない。被害の領域でも出さない
    // (「見通し不明」はリード文がすでに言っていて、二度言うと読み飛ばされる)。
    // 上限を過ぎた後も出さない (リード文が言っている)。
    wait:
      advice === 'normal' || advice === 'avoid-rail' || expired
        ? ''
        : waitText(representative, analysis.event, lang),
    // decision の lead は「今夜戻れるか」。上の lead (なぜ止まっているか) とは別。
    lead2: decided.lead,
    note: decided.note,
  }
}

/**
 * 決めるべきことは 1 つ。**待つか、今夜の寝場所を確保するか。**
 *
 * 大地震のあと、駅周辺の宿は数時間で埋まる。1 時間目に決めるか
 * 4 時間目に決めるかで結果が変わる。だから、待ち時間そのものではなく
 * 「今夜戻れるかどうか」に翻訳して出す。
 *
 * @returns {{lead: string, note: string}}
 */
function decision(lang, representative) {
  const s = t(lang)
  if (!analysis.event) return { lead: '', note: '' }

  const advices = places(lang)
    .filter((p) => p.place)
    .map((p) => situation(p.place, p.hint).worst.advice)

  if (advices.includes('avoid-rail')) {
    return { lead: s.notBackTonight, note: s.hotelsFill }
  }
  if (!advices.includes('wait')) return { lead: s.actMove, note: '' }

  // 止まっている。再開の最も遅い見込みに、宿までの移動を足して終電と比べる。
  const rem = remaining(representative, analysis.event)
  if (!rem) return { lead: s.actWait, note: '' }
  // 推定の上限を過ぎた。「そのまま待て」と言い続けてはいけない。
  // 再開していれば、待っている人は無駄に足止めされている。
  if (rem.over) return { lead: s.actMayResume, note: '' }

  const untilLast = minutesUntilLastTrain()
  const backBy = rem.max + RIDE_HOME_MIN
  if (untilLast > 0 && backBy < untilLast) {
    return { lead: s.backTonight, note: s.actWait }
  }
  return { lead: s.notBackTonight, note: s.hotelsFill }
}

function verdictBlock(lang) {
  const v = overall(lang)
  if (v.advice === 'unset') {
    return `<section class="verdict v-unset">
      ${v.status ? `<p class="v-status">${esc(v.status)}</p>` : ''}
      <p class="v-lead">${esc(v.lead)}</p>
    </section>`
  }
  return `<section class="verdict v-${v.advice}">
    <p class="v-status">${esc(v.status)}</p>
    <p class="v-lead">${esc(v.lead)}</p>
    ${v.wait ? `<p class="v-eta">${esc(v.wait)}</p>` : ''}
    ${v.lead2 || v.note
      ? `<div class="v-act">
           ${v.lead2 ? `<strong>${esc(v.lead2)}</strong>` : ''}
           ${v.note ? `<span>${esc(v.note)}</span>` : ''}
         </div>`
      : ''}
  </section>`
}

function lineList(sit, placeId, lang) {
  const s = t(lang)
  return sit.lines
    .map((l, i) => {
      const name = pick(l.title, l.titleEn, lang)
      const advice = l.suspension.advice
      const id = `ln:${placeId}:${i}`
      const open = state.showLines.has(id)
      // 遠くで止まっている路線は、どこで止まっているかを添える。
      // 東海道新幹線は東京駅を通るが、大阪で止まっていても東京の電車は動く。
      const where =
        !l.nearby && l.suspension.at?.label
          ? `<span class="ln-where">${esc(s.stoppedAt(l.suspension.at.label))}</span>`
          : ''
      return `<li>
        <button class="lnrow" data-toggle="${esc(id)}" aria-expanded="${open}">
          <span class="ln">${esc(name)}${where}</span>
          <span class="chip c-${advice}">${esc(s[CHIP_KEY[advice]])}</span>
          <span class="chev" aria-hidden="true">${open ? '−' : '+'}</span>
        </button>
        ${open ? lineDetail(l, lang) : ''}
      </li>`
    })
    .join('')
}

/**
 * 路線ごとの推定の内訳。
 *
 * 数字を出す以上、どこから来た数字かを見せる。
 * 「あとどれくらい」がこのアプリの中身なので、根拠が見えないと使えない。
 */
function lineDetail(entry, lang) {
  const s = t(lang)
  const sus = entry.suspension
  const rows = []

  if (!sus.level) {
    rows.push(`<p class="hint">${esc(s.detNone)}</p>`)
  } else {
    rows.push(
      row(
        s.detMax,
        `${esc(shindoLabel(sus.level, lang))}${sus.at?.label ? ` · ${esc(sus.at.label)}` : ''}`,
      ),
    )
    if (sus.source) {
      // 空の見出しを作ると grid の行が崩れる。値の続きとして同じ dd に入れる。
      rows[rows.length - 1] = rows[rows.length - 1].replace(
        '</dd>',
        `<span class="muted src">${esc(s.detSource(sus.source.label, sus.source.distanceKm.toFixed(1)))}</span></dd>`,
      )
    }
    if (sus.inspectionLengthKm) {
      rows.push(row(s.detInspect, `${sus.inspectionLengthKm} km`))
    }
    const wait = waitValue(sus, analysis.event, lang)
    if (wait) rows.push(row(s.detResume, esc(wait)))
  }

  if (entry.parts?.length > 1) {
    rows.push(row(s.detParts, entry.parts.map(esc).join(' / ')))
  }

  const notes = []
  if (entry.partial) notes.push(s.detPartial)
  if (sus.uncertain) notes.push(s.detUncertain)
  if (sus.level) notes.push(s.detBasis)

  return `<div class="lndetail">
    <dl>${rows.join('')}</dl>
    ${notes.map((n) => `<p class="hint">${esc(n)}</p>`).join('')}
  </div>`
}

const row = (label, value) => `<dt>${esc(label)}</dt><dd>${value}</dd>`

/**
 * 震度は画面の表では前面に出さないが、内訳では根拠として出す。
 * 5弱/5強 は日本語圏の書き方なので、それ以外は 5- / 5+ のまま置く。
 */
function shindoLabel(level, lang) {
  const v = lang === 'ja' || lang === 'zh' ? level.replace('-', '弱').replace('+', '強') : level
  return t(lang).shindo(v)
}

/**
 * 駅を選ぶ欄。遅延レーダーと同じ作りにしてある。
 * 候補は読む結果ではなく選ぶメニューなので、カードを並べず、
 * 欄の真下に 1 枚の面を浮かせて罫線で区切る。
 */
function picker(inputId, listId, placeholder) {
  return `<div class="hitwrap">
    <input id="${esc(inputId)}" type="search" placeholder="${esc(placeholder)}" autocomplete="off"
      autocapitalize="off" spellcheck="false">
    <div class="hits" id="${esc(listId)}"></div>
  </div>`
}

/**
 * 行を開いたときの中身。
 *
 * その場所の設定と内訳を、同じところに置く。
 * 設定だけ別画面に飛ばすと「タップして設定 → さらに設定を押す」になり、
 * しかも関係のない項目まで一緒に出てしまう。
 */
function rowPanel(entry, lang) {
  const s = t(lang)
  const parts = []

  if (entry.id === 'here') {
    if (entry.place?.geo) {
      // 住所は行の見出しに出ている。ここは座標だけ。二度書くと読み飛ばされる。
      parts.push(
        `<p class="addr"><span class="addr-sub">${esc(s.coordsOnly(entry.place.lat.toFixed(4), entry.place.lon.toFixed(4)))}</span></p>`,
      )
    }
    parts.push(`<div class="rowacts">
      <button class="pill" data-locate="1">${esc(entry.place ? s.recheckLocation : s.setLocation)}</button>
    </div>`)
    parts.push(picker('here-search', 'here-results', s.pickStation))
  } else if (entry.id === 'home') {
    parts.push(`<p class="hint">${esc(s.homeHelp)}</p>`)
    parts.push(picker('home-search', 'home-results', s.searchHome))
    if (entry.place) {
      parts.push(`<div class="rowacts"><button class="pill" data-clearhome="1">${esc(s.clear)}</button></div>`)
    }
  } else if (entry.id === 'flight') {
    const options = data.places.airports
      .map(
        (a) =>
          `<option value="${esc(a.iata)}"${config.flightAirport === a.iata ? ' selected' : ''}>${esc(airportName(a, lang))} (${esc(a.iata)})</option>`,
      )
      .join('')
    parts.push(`<div class="field">
        <label for="airport">${esc(s.chooseAirport)}</label>
        <select id="airport"><option value="">—</option>${options}</select>
      </div>
      <div class="field">
        <label for="dep">${esc(s.departureTime)}</label>
        <input id="dep" type="datetime-local" value="${esc(config.flightDeparture ?? '')}">
      </div>
      <div class="rowacts">
        <button class="pill primary" data-savefl="1">${esc(s.save)}</button>
        ${config.flightAirport ? `<button class="pill" data-clearfl="1">${esc(s.clear)}</button>` : ''}
      </div>`)
  }

  if (entry.place && analysis.event) {
    const sit = situation(entry.place, entry.hint)
    parts.push(
      sit.lines.length
        ? `<ul class="lines">${lineList(sit, entry.id, lang)}</ul>`
        : `<p class="hint">${esc(s.unknownHere)}</p>`,
    )
  }

  return `<div class="panel">${parts.join('')}</div>`
}

const airportName = (a, lang) => pick(a.ja, a.en, lang)

/** 地図の操作ボタンの読み上げ名。 */
const mapLabels = (lang) => ({
  zoomIn: esc(t(lang).mapZoomIn),
  zoomOut: esc(t(lang).mapZoomOut),
  recenter: esc(t(lang).mapRecenter),
})

/** 現在地は座標で持つ。表示名は言語が変われば変わるので、その都度作る。 */
/**
 * その座標にある駅。共有リンクは日本語名しか運ばないので、
 * 英語名が要るときは座標から引き直す。約 400m まで同じ駅とみなす。
 */
function stationAt(lat, lon) {
  if (!data?.places) return null
  return (
    data.places.stations.find(
      (st) => Math.abs(st.lat - lat) < 0.004 && Math.abs(st.lon - lon) < 0.004,
    ) ?? null
  )
}

function placeName(place, lang) {
  if (!place) return ''
  if (place.geo) return nameForCoords(place.lat, place.lon, lang)
  // 片方しか無いときは座標から補う。日本語以外は英語に寄せる。
  const st = place.name && place.en ? null : stationAt(place.lat, place.lon)
  return pick(place.name || st?.ja, place.en || st?.en, lang) || '—'
}

function placeRow(entry, lang) {
  const s = t(lang)
  const open = state.showLines.has(entry.id)
  const chevron = `<span class="chev" aria-hidden="true">${open ? '−' : '+'}</span>`

  if (!entry.place) {
    return `<li class="place${open ? ' open' : ''}">
      <button class="prow" data-toggle="${esc(entry.id)}" aria-expanded="${open}">
        <span class="p-label">${esc(entry.label)}</span>
        <span class="p-name muted">${esc(s.tapToSet)}</span>
        <span class="chip c-unset">${esc(s.notSet)}</span>
        ${chevron}
      </button>
      ${open ? rowPanel(entry, lang) : ''}
    </li>`
  }

  // 対象の地震が無いときは場所ごとの計算そのものが無い (震度の場が作られない)。
  if (!analysis.event) {
    return `<li class="place${open ? ' open' : ''}">
      <button class="prow" data-toggle="${esc(entry.id)}" aria-expanded="${open}">
        <span class="p-label">${esc(entry.label)}</span>
        <span class="p-name">${esc(placeName(entry.place, lang))}</span>
        <span class="chip c-normal">${esc(s.chipNormal)}</span>
        ${chevron}
      </button>
      ${open ? rowPanel(entry, lang) : ''}
    </li>`
  }

  const sit = situation(entry.place, entry.hint)
  const unknown = sit.worst.stage === 'none' && sit.confidence === 'unknown'
  const advice = sit.worst.advice
  // 推定の上限を過ぎた路線は「停止」と言い切らない。
  // 判定帯と同じく代表値で見る。最も重い路線で見ると、新幹線の 10 時間に引きずられて
  // 帯は「再開しているかも」なのに行は「停止」のまま、という食い違いが出る。
  const expired = advice === 'wait' && Boolean(remaining(sit.typical, analysis.event)?.over)
  // 速報段階は「不明」ではなく「速報」。数分待てば出る、という意味が伝わる。
  const chip = isPromptStage()
    ? s.chipPending
    : expired
      ? s.chipCheck
      : unknown
        ? s.chipUnknown
        : s[CHIP_KEY[advice]]
  const chipClass = isPromptStage() || expired ? 'pending' : unknown ? 'unset' : advice

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
      // 間に合わなさそうなときだけ、鉄道以外の手段に触れる。
      // 空港バスやタクシーは震度5弱程度なら動いていることが多い。
      const alt = verdict === s.flightOk ? '' : ` ${esc(s.altTransport)}`
      extra = `<p class="p-extra">${esc(s.flightIn(formatDuration(untilMin, lang)))} · ${esc(verdict)}${alt}</p>`
    }
  }

  return `<li class="place${open ? ' open' : ''}">
    <button class="prow" data-toggle="${esc(entry.id)}" aria-expanded="${open}">
      <span class="p-label">${esc(entry.label)}</span>
      <span class="p-name">${esc(placeName(entry.place, lang))}</span>
      <span class="chip c-${chipClass}">${esc(chip)}</span>
      ${chevron}
    </button>
    ${extra}
    ${open ? rowPanel(entry, lang) : ''}
  </li>`
}

/**
 * 設定はダイアログ。中身は画面全体にかかるものだけに絞る。
 * 場所ごとの設定はその場所の行の中にある。
 */
/** 判断の材料になる場所。現在地が無ければ宿で代用する。 */
const anchor = () => state.here ?? config.home ?? null

/**
 * 震源の地図。補足情報なので既定では畳んでおく。
 * 自分のいる場所も一緒に描く。震源だけ出されても、遠いのか近いのか分からない。
 */
function quakeMap(lang) {
  const s = t(lang)
  const e = analysis.event
  if (!e || e.hypocenter.lat == null || e.hypocenter.lon == null) return ''

  const open = state.showLines.has('quakemap')
  const label = open ? s.hideMap : s.showMap
  if (!open) return `<button class="link mapbtn" data-toggle="quakemap">${esc(label)}</button>`

  const me = anchor()
  const epi = { lat: e.hypocenter.lat, lon: e.hypocenter.lon }
  const markers = [{ ...epi, kind: 'quake', label: esc(s.epicentre) }]
  if (me) markers.push({ lat: me.lat, lon: me.lon, kind: 'me', label: esc(s.youAreHere) })

  return `<button class="link mapbtn" data-toggle="quakemap">${esc(label)}</button>
    ${mapFrame({
      id: 'quake',
      center: epi,
      // 震源と自分が両方入る縮尺にする。震源だけ出されても遠近が分からない。
      fit: me ? [epi, me] : null,
      zoom: 8,
      markers,
      note: esc(s.shelterMapNote),
      labels: mapLabels(lang),
    })}`
}

/**
 * 近くの避難場所。
 *
 * 電車が動かないと分かった人が次に要るのは、どこへ行けばよいかの当て。
 * 地震で使える場所だけを出す。洪水専用の高台を地震のときに案内しない。
 */
/**
 * 逃げ場と休み場。
 *
 * **一時滞在施設が主。** 電車が動かないと分かった人が次に要るのは、
 * 座って待てる場所。指定緊急避難場所は「建物が危ないときに逃げる先」で用途が違うので、
 * その下に別の見出しで置く。
 */
function shelterSection(lang) {
  const s = t(lang)
  const me = anchor()
  const open = state.showLines.has('shelter')

  const head = `<button class="prow" data-toggle="shelter" aria-expanded="${open}">
    <span class="p-label">${esc(s.stayTitle)}</span>
    <span class="p-name${me ? '' : ' muted'}">${esc(me ? placeName(me, lang) : s.tapToSet)}</span>
    <span class="chev" aria-hidden="true">${open ? '−' : '+'}</span>
  </button>`

  if (!open) return `<li class="place">${head}</li>`
  if (!me) {
    return `<li class="place open">${head}
      <div class="panel"><p class="hint">${esc(s.noPlaces)}</p></div>
    </li>`
  }

  const parts = [`<p class="hint">${esc(s.stayHelp)}</p>`]

  // ── 一時滞在施設 ──
  const temp = data.tempShelters ? tempSheltersNear(data.tempShelters, me) : { covered: false, list: [] }
  if (!temp.covered) {
    parts.push(`<p class="hint warn-note">${esc(s.stayUncovered)}</p>`)
  } else if (temp.list.length === 0) {
    parts.push(`<p class="hint">${esc(s.stayNone)}</p>`)
  } else {
    parts.push(
      mapFrame({
        id: 'stay',
        center: me,
        fit: [me, ...temp.list.map((x) => ({ lat: x.lat, lon: x.lon }))],
        markers: [
          { lat: me.lat, lon: me.lon, kind: 'me', label: esc(s.youAreHere) },
          ...temp.list.map((x, i) => ({ lat: x.lat, lon: x.lon, kind: 'stay', label: String(i + 1) })),
        ],
        note: esc(s.shelterMapNote),
        labels: mapLabels(lang),
      }),
    )
    parts.push(`<ul class="shelters">${shelterRows(temp.list, 'stay', lang)}</ul>`)
    parts.push(
      `<p class="hint">${esc(s.stayCoverage((data.tempShelters.coverage ?? []).join('・')))}</p>`,
    )
  }

  // ── 指定緊急避難場所 ──
  parts.push(`<h3 class="subhead">${esc(s.refugeTitle)}</h3>`)
  parts.push(`<p class="hint">${esc(s.shelterHelp)}</p>`)
  parts.push(`<p class="hint warn-note">${esc(s.shelterStayPut)}</p>`)

  const key = `${me.lat.toFixed(3)},${me.lon.toFixed(3)}`
  if (state.shelters.key !== key) {
    // 開いたときに取りに行く。取れたら描き直す。
    state.shelters = { key, list: null }
    sheltersNear(me).then((list) => {
      if (state.shelters.key !== key) return
      state.shelters = { key, list }
      render()
    })
  }
  const list = state.shelters.list
  if (!list) parts.push(`<p class="hint">${esc(s.shelterLoading)}</p>`)
  else if (list.length === 0) parts.push(`<p class="hint">${esc(s.shelterNone)}</p>`)
  else {
    parts.push(`<ul class="shelters">${shelterRows(list, 'shelter', lang)}</ul>`)
    parts.push(`<p class="hint">${esc(s.shelterUnverified)}</p>`)
  }

  return `<li class="place open">${head}<div class="panel">${parts.join('')}</div></li>`
}

/** 避難先の一覧。番号は地図の印と対応させる。 */
function shelterRows(list, kind, lang) {
  const s = t(lang)
  return list
    .map(
      (x, i) => `<li>
        <span class="sh-no sh-${kind}">${i + 1}</span>
        <span class="sh-body">
          <span class="sh-name">${esc(x.name)}</span>
          <span class="sh-sub">${esc(x.address)} · ${esc(s.shelterDistance(x.distanceKm.toFixed(1)))}</span>
        </span>
        <a class="sh-go" target="_blank" rel="noopener"
           href="https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lon}">${esc(s.openInMaps)}</a>
      </li>`,
    )
    .join('')
}

function settingsDialog(lang) {
  const s = t(lang)
  const langs = LANGS.map(
    (l) =>
      `<button class="pill${l.code === lang ? ' on' : ''}" data-lang="${esc(l.code)}">${esc(l.label)}</button>`,
  ).join('')

  return `<dialog id="settings">
    <form method="dialog" class="dlg-head">
      <h2>${esc(s.settings)}</h2>
      <button class="x" aria-label="${esc(s.close)}">&times;</button>
    </form>
    <div class="dlg-body">
      <label>${esc(s.language)}</label>
      <div class="rowacts">${langs}</div>
      <label>${esc(s.shareLabel)}</label>
      <div class="rowacts"><button class="pill" data-share="1">${esc(s.share)}</button></div>
    </div>
  </dialog>`
}

function body(lang) {
  const s = t(lang)
  if (state.error && !analysis) return `<section class="verdict v-unset"><p class="v-lead">${esc(state.error)}</p></section>`
  if (!analysis) return `<section class="verdict v-unset"><p class="v-lead">${esc(s.checking)}</p></section>`

  const e = analysis.event
  const quakeLine = e
    ? `<p class="quake${config.eventId === e.id ? ' past' : ''}">
         ${e.magnitude ? `${esc(s.magnitude(e.magnitude))} · ` : ''}${esc(hypocenterName(e.hypocenter, lang))} · ${esc(jstTime(e.occurredAt, lang))}
         ${config.eventId === e.id ? `<span class="past-note">${esc(s.pastEvent(jstFull(new Date(e.occurredAt), lang)))}</span>` : ''}
       </p>`
    : ''

  return `${verdictBlock(lang)}
    ${quakeLine}
    ${e ? quakeMap(lang) : ''}
    <ul class="places">
      ${places(lang).map((p) => placeRow(p, lang)).join('')}
      ${shelterSection(lang)}
    </ul>`
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
        <button class="lang" data-opensettings="1" aria-label="${esc(s.language)}">${esc(LANGS.find((l) => l.code === lang)?.label ?? lang)}</button>
        <button class="link" data-opensettings="1">${esc(s.settings)}</button>
      </div>
    </header>
    ${body(lang)}
    <p class="stamp">
      ${state.fetchedAt ? `${esc(s.lastChecked)} ${esc(jstFull(state.fetchedAt, lang))} JST` : esc(s.checking)}
      ${state.stale ? `<span class="warn">${esc(s.offline)}</span>` : ''}
      <button class="link" data-refresh="1">${esc(s.reload)}</button>
    </p>
    ${data ? settingsDialog(lang) : ''}
    <section class="caveat">
      <h2>${esc(s.caveatTitle)}</h2>
      <p>${esc(s.caveat)}</p>
      <p class="src">${esc(s.sources)}: 気象庁 / P2P地震情報 / 国土数値情報（鉄道データ）CC BY 4.0 / 公共交通オープンデータセンター / 高浜・翠川 (2011) 日本地震工学会論文集 11(2)</p>
      <p class="src"><a href="test.html">test</a> · <a href="diagnostics.html">diagnostics</a></p>
    </section>`
  wire()
  // 幅が決まってからでないとタイルの位置が出せない。
  paintMaps($('app'))
}

// ── 操作 ──────────────────────────────────────────────────

function wire() {
  const all = (sel, fn) => {
    for (const el of document.querySelectorAll(sel)) el.onclick = fn
  }
  const on = (sel, fn) => {
    const el = document.querySelector(sel)
    if (el) el.onclick = fn
  }

  all('[data-toggle]', (ev) => {
    const id = ev.currentTarget.dataset.toggle
    if (state.showLines.has(id)) state.showLines.delete(id)
    else state.showLines.add(id)
    render()
  })

  // 設定はダイアログ。開いても画面の内容は消えない。
  all('[data-opensettings]', () => $('settings')?.showModal())
  all('[data-lang]', (ev) => {
    config.lang = ev.currentTarget.dataset.lang
    writeConfig(config)
    const wasOpen = $('settings')?.open
    render()
    if (wasOpen) $('settings')?.showModal()
  })

  on('[data-refresh]', refresh)
  on('[data-exittest]', () => {
    config.scenarioId = null
    writeConfig(config)
    refresh()
  })
  on('[data-locate]', locate)
  on('[data-clearhome]', () => {
    config.home = null
    writeConfig(config)
    render()
  })
  on('[data-savefl]', () => {
    config.flightAirport = $('airport').value || null
    config.flightDeparture = $('dep').value || null
    writeConfig(config)
    render()
  })
  on('[data-clearfl]', () => {
    config.flightAirport = null
    config.flightDeparture = null
    writeConfig(config)
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
  if (!input) return
  input.oninput = () => renderResults(input, listId, onPick)
  // 外を触ったら候補を畳む。開きっぱなしだと下の内容を覆い続ける。
  input.onblur = () => setTimeout(() => closeHits(input, listId), 150)
}

function closeHits(input, listId) {
  const list = $(listId)
  if (!list) return
  list.innerHTML = ''
  input.classList.remove('hasHits')
}

function renderResults(input, listId, onPick) {
  const list = $(listId)
  if (!list) return
  const trimmed = input.value.trim()
  if (trimmed.length < 1) return closeHits(input, listId)

  const q = trimmed.toLowerCase()
  const hits = data.places.stations
    .filter((s) => s.en.toLowerCase().includes(q) || s.ja.includes(trimmed))
    .slice(0, 12)

  if (hits.length === 0) {
    list.innerHTML = `<p class="hit-empty">${esc(t(config.lang).noResults)}</p>`
    input.classList.add('hasHits')
    return
  }

  // 読む結果ではなく選ぶメニュー。1 枚の面に罫線で区切って並べる。
  list.innerHTML = hits
    .map(
      (s) =>
        `<button class="hit" data-lat="${s.lat}" data-lon="${s.lon}">
          <span class="hit-main">${esc(pick(s.ja, s.en, config.lang))}</span>
          <span class="hit-sub">${esc(config.lang === 'ja' ? s.en : s.ja)}</span>
        </button>`,
    )
    .join('')
  input.classList.add('hasHits')

  for (const b of list.querySelectorAll('button.hit')) {
    // blur より先に拾う。指を離す前に決まっていないと、畳まれてから click が来る。
    b.onmousedown = (ev) => ev.preventDefault()
    b.onclick = () => {
      const st = data.places.stations.find(
        (x) => x.lat === Number(b.dataset.lat) && x.lon === Number(b.dataset.lon),
      )
      closeHits(input, listId)
      onPick({ lat: Number(b.dataset.lat), lon: Number(b.dataset.lon), name: st ? st.ja : '' , en: st ? st.en : '' })
    }
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
      // 座標のまま持つ。表示名は言語によって変わるので描画のたびに作る。
      state.here = { lat: pos.coords.latitude, lon: pos.coords.longitude, geo: true }
      saveHere()
      render()
    },
    () => {
      if (btn) btn.textContent = s.locationDenied
    },
    // 取り直しなので、前回の位置を使い回さない。
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
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
