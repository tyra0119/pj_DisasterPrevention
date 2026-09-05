// 表示文言。訪日外国人が主な読み手なので英語を先に置く。
//
// 震度の数値は前面に出さない。「震度5弱」と言われても、それが自分にとって
// 何を意味するかは分からない。「点検のため止まっている見込み」と言う。

/** @typedef {'en'|'ja'} Lang */

export const LANGS = /** @type {Lang[]} */ (['en', 'ja'])

const STRINGS = {
  en: {
    appName: 'Move or Wait',
    tagline: 'Trains in Japan after an earthquake',
    langName: 'English',

    checking: 'Checking…',
    lastChecked: 'Last checked',
    offline: 'Offline — showing what was saved',
    reload: 'Check again',

    calmTitle: 'Trains are running normally',
    calmBody: 'No recent earthquake strong enough to stop trains.',

    quakeAt: (place, time) => `${place}, ${time}`,
    magnitude: (m) => `M${m}`,

    hereTitle: 'Where you are',
    homeTitle: 'Your accommodation',
    flightTitle: 'Your flight',

    setLocation: 'Use my location',
    locating: 'Finding you…',
    locationDenied: 'Location unavailable. Pick a station instead.',
    pickStation: 'Search for a station',
    setHome: 'Use where I am now',
    clear: 'Clear',
    noHome: 'Not set.',
    homeHelp: 'Search for a station near where you are staying. You do not need to be there.',
    searchHome: 'Station near your accommodation',
    noFlight: 'Not set.',
    chooseAirport: 'Departure airport',
    departureTime: 'Departure time',
    save: 'Save',
    share: 'Copy link with my settings',
    copied: 'Link copied',

    adviceNormal: 'Running normally',
    adviceDelay: 'Running, but delayed',
    adviceWait: 'Likely stopped for track inspection',
    adviceAvoid: 'Do not count on trains',

    // 判定帯の見出し。2 秒で読める長さに切る。断定はしない。
    statusNormal: 'RUNNING NORMALLY',
    statusDelay: 'LIKELY DELAYED',
    statusWait: 'LIKELY STOPPED',
    statusAvoid: 'LIKELY OUT OF SERVICE',

    // 見出しの下、なぜそうなのかを 1 行で。
    leadNormal: 'No recent earthquake strong enough to stop trains.',
    leadDelay: 'Trains are moving slowly while crews check the line.',
    leadWait: 'Railways are inspecting the track before restarting.',
    leadAvoid: 'Damage is likely. Services can be out for days.',

    // 場所の行につける短い印。
    chipNormal: 'Running',
    chipDelay: 'Delayed',
    chipWait: 'Stopped',
    chipAvoid: 'No trains',
    chipUnknown: 'No reading',

    noPlaces: 'Tell us where you are to see whether your trains are running.',
    tapToSet: 'Tap to set',
    notSet: 'Not set',

    expectWait: (range) => `Service back in ${range}`,
    expectDelay: 'Around 30 minutes of delay',
    noEstimate: 'No estimate — damage is likely, this can take days',
    inspectionPassed: 'The estimated inspection time has passed. Check with the operator.',
    pastEvent: (when) => `Showing a past earthquake (${when} JST), not the current situation.`,
    testBanner: 'TEST DATA — this is not a real earthquake',
    testBannerBody: 'A synthetic scenario for checking the app. Do not act on it or share it as real.',
    exitTest: 'Leave test mode',
    unknownHere: 'No reading near this place',

    linesAffected: (n) => (n === 1 ? '1 line' : `${n} lines`),
    showLines: 'Show lines',
    hideLines: 'Hide lines',

    flightIn: (d) => `departs in ${d}`,
    flightPassed: 'departure time has passed',
    flightOk: 'You should still make it, but leave earlier than planned.',
    flightTight: 'This is tight. Consider leaving now or rebooking.',
    flightUnlikely: 'You are unlikely to make it by train. Contact your airline.',

    whatNow: 'What to do now',
    actWait: 'Stay where you are if it is safe. Trains resume after the inspection finishes.',
    actMove: 'Trains are moving. Allow extra time.',
    actShelter: 'Find somewhere to stay tonight. Do not wait at the station.',

    caveatTitle: 'This is an estimate',
    caveat:
      'Railways decide using their own trackside sensors, not the figure used here. Always confirm with the operator or station staff before acting.',
    sources: 'Sources',

    settings: 'Settings',
    close: 'Close',
    minutes: (n) => `${n} min`,
    hours: (h, m) => (m ? `${h} h ${m} min` : `${h} h`),
  },

  ja: {
    appName: '動くか、待つか',
    tagline: '地震のあと、日本の電車は動くか',
    langName: '日本語',

    checking: '確認中…',
    lastChecked: '最終取得',
    offline: 'オフライン — 保存していた内容を表示中',
    reload: '再確認',

    calmTitle: '平常どおり動いています',
    calmBody: '電車を止めるほどの地震は起きていません。',

    quakeAt: (place, time) => `${place} ${time}`,
    magnitude: (m) => `M${m}`,

    hereTitle: 'いまいる場所',
    homeTitle: '宿',
    flightTitle: '出国便',

    setLocation: '現在地を使う',
    locating: '現在地を取得中…',
    locationDenied: '現在地が取れません。駅を選んでください。',
    pickStation: '駅を検索',
    setHome: 'いまいる場所にする',
    clear: '消す',
    noHome: '未設定。',
    homeHelp: '泊まっている場所の近くの駅を検索してください。そこにいる必要はありません。',
    searchHome: '宿の近くの駅',
    noFlight: '未設定。',
    chooseAirport: '出発空港',
    departureTime: '出発時刻',
    save: '保存',
    share: '設定つきリンクをコピー',
    copied: 'コピーしました',

    adviceNormal: '平常どおり',
    adviceDelay: '動いているが遅れる',
    adviceWait: '点検のため止まっている見込み',
    adviceAvoid: '鉄道は当てにしない',

    // 判定帯の見出し。2 秒で読める長さに切る。断定はしない。
    statusNormal: '平常どおり',
    statusDelay: '遅れている見込み',
    statusWait: '止まっている見込み',
    statusAvoid: '鉄道は使えない見込み',

    // 見出しの下、なぜそうなのかを 1 行で。
    leadNormal: '電車を止めるほどの地震は起きていません。',
    leadDelay: '線路を確認しながら、徐行で動いています。',
    leadWait: '再開の前に、鉄道会社が線路を点検しています。',
    leadAvoid: '被害が出ている可能性。復旧に日単位かかることがあります。',

    // 場所の行につける短い印。
    chipNormal: '平常',
    chipDelay: '遅れ',
    chipWait: '停止',
    chipAvoid: '不通',
    chipUnknown: '不明',

    noPlaces: 'いる場所を教えてください。その周りの電車が動くかを出します。',
    tapToSet: 'タップして設定',
    notSet: '未設定',

    expectWait: (range) => `再開まで ${range} の見込み`,
    expectDelay: '30分ほどの遅れ',
    noEstimate: '見通し不明 — 被害が出ている可能性。日単位になりうる',
    inspectionPassed: '推定した点検時間は過ぎています。運行情報を確認してください。',
    pastEvent: (when) => `過去の地震（${when} JST）を表示しています。いまの状況ではありません。`,
    testBanner: 'テストデータ — 実際の地震ではありません',
    testBannerBody: '動作確認用の作り物です。これを元に行動したり、本物として共有したりしないでください。',
    exitTest: 'テスト表示をやめる',
    unknownHere: 'この場所の近くに観測がない',

    linesAffected: (n) => `${n} 路線`,
    showLines: '路線を見る',
    hideLines: '閉じる',

    flightIn: (d) => `出発まで ${d}`,
    flightPassed: '出発時刻を過ぎています',
    flightOk: '間に合う見込みですが、予定より早めに出てください。',
    flightTight: 'かなり厳しい。いま動くか、便の変更を検討してください。',
    flightUnlikely: '鉄道では間に合わない見込み。航空会社に連絡を。',

    whatNow: 'いますること',
    actWait: '安全な場所にいるならそのまま待つ。点検が終われば再開します。',
    actMove: '電車は動いています。時間に余裕を持って。',
    actShelter: '今夜泊まれる場所を探す。駅で待たないこと。',

    caveatTitle: 'これは推定です',
    caveat:
      '鉄道会社は自前の沿線地震計で判断していて、ここで使っている数値とは別物です。動く前に必ず事業者か駅係員に確認してください。',
    sources: '出典',

    settings: '設定',
    close: '閉じる',
    minutes: (n) => `${n}分`,
    hours: (h, m) => (m ? `${h}時間${m}分` : `${h}時間`),
  },
}

/**
 * @param {Lang} lang
 * @returns {typeof STRINGS.en}
 */
export const t = (lang) => STRINGS[lang] ?? STRINGS.en

/**
 * ブラウザの設定から言語を選ぶ。日本語圏でなければ英語。
 * @returns {Lang}
 */
export function detectLang() {
  const list = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : []
  for (const l of list) {
    if (typeof l === 'string' && l.toLowerCase().startsWith('ja')) return 'ja'
  }
  return 'en'
}

/**
 * 分を読める長さにする。
 * @param {number} minutes
 * @param {Lang} lang
 */
export function formatDuration(minutes, lang) {
  const s = t(lang)
  if (minutes < 60) return s.minutes(Math.round(minutes))
  return s.hours(Math.floor(minutes / 60), Math.round(minutes % 60))
}
