// 表示文言。遅延レーダーと同じ 4 言語（日本語 / English / 中文 / 한국어）。
//
// 震度の数値は前面に出さない。「震度5弱」と言われても、それが自分にとって
// 何を意味するかは分からない。「点検のため止まっている見込み」と言う。
//
// 断定もしない。鉄道会社は自前の沿線地震計で判断していて、ここの数値とは別物。
// どの言語でも「見込み」であることが落ちないようにする。

/** @typedef {'ja'|'en'|'zh'|'ko'} Lang */

/** 言語切替に出す並びと名札。遅延レーダーに合わせてある。 */
export const LANGS = /** @type {{code: Lang, label: string}[]} */ ([
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'EN' },
  { code: 'zh', label: '中文' },
  { code: 'ko', label: '한국어' },
])

export const LANG_CODES = LANGS.map((l) => l.code)

const STRINGS = {
  ja: {
    appName: '動くか、待つか',
    tagline: '地震のあと、日本の電車は動くか',

    checking: '確認中…',
    lastChecked: '最終取得',
    offline: 'オフライン — 保存していた内容',
    reload: '再確認',

    calmTitle: '平常どおり動いています',
    calmBody: '電車を止めるほどの地震は起きていません。',

    quakeAt: (place, time) => `${place} ${time}`,
    magnitude: (m) => `M${m}`,

    hereTitle: 'いまいる場所',
    homeTitle: '宿',
    flightTitle: '出国便',
    shelterTitle: '近くの避難場所',

    setLocation: '現在地を使う',
    recheckLocation: '現在地を取り直す',
    locating: '現在地を取得中…',
    locationDenied: '現在地が取れません。駅を選んでください。',
    nearStation: (name) => `${name} の近く`,
    coordsOnly: (lat, lon) => `緯度 ${lat} / 経度 ${lon}`,
    pickStation: '駅を検索',
    setHome: 'いまいる場所にする',
    clear: '消す',
    noHome: '未設定。',
    homeHelp: '泊まっている場所の近くの駅を検索してください。そこにいる必要はありません。',
    searchHome: '宿の近くの駅',
    chooseAirport: '出発空港',
    departureTime: '出発時刻',
    save: '保存',
    share: '設定つきリンクをコピー',
    copied: 'コピーしました',
    showMap: '地図で見る',
    hideMap: '地図を閉じる',
    epicentre: '震源',
    youAreHere: 'ここ',
    openInMaps: '経路を開く',
    resumeBy: (from, to) => `${from}〜${to} ごろ`,
    backTonight: '今夜のうちに戻れる見込みです。',
    notBackTonight: '今夜は電車で戻れないかもしれません。',
    hotelsFill: '宿を取るなら早い方がいい。地震のあと、駅の近くはすぐ埋まります。',
    decideNow: 'いま決めること',
    decideWait: '待つ',
    decideBed: '今夜の寝場所を確保する',
    stoppedAt: (place) => `${place} 付近`,
    detMax: '線内で最も強い揺れ',
    detSource: (label, km) => `気象庁の観測点 ${label}（${km}km）`,
    detInspect: '点検が要る区間',
    detResume: '再開まで',
    detParts: '対応する線路',
    detPartial: '対応表がこの系統の全駅を覆えていません。覆えていない区間の揺れは見えていません。',
    detUncertain: '近くの観測が少なく、根拠が弱い推定です。',
    detBasis: '高浜・翠川 (2011) の徒歩点検モデルによる推定。鉄道会社の判断とは別です。',
    detNone: 'この路線の近くで、電車を止めるほどの揺れは観測されていません。',
    shindo: (v) => `震度 ${v}`,
    stayTitle: '帰れないときに休める場所',
    stayHelp: '帰宅困難者のために開放される施設です。ここまで来れば、電車が動くまで座って待てます。',
    stayNone: 'この場所の近くに登録がありません。',
    stayUncovered: 'この地域はまだ収録できていません。近くに無いという意味ではありません。',
    stayCoverage: (where) => `収録は ${where} の公開分のみ`,
    refugeTitle: '危険から逃げる場所',
    mapZoomIn: '拡大',
    mapZoomOut: '縮小',
    mapRecenter: '現在地に戻す',
    statusPending: '強い揺れを観測 — 詳細を待っています',
    leadPending: '近くの電車は止まっている可能性が高いです。数分で詳しい見込みが出ます。',
    actPending: 'まず動かず、安全を確保してください。',
    chipPending: '速報',
    statusQuake: '地震が発生しました',
    statusMayResume: '再開しているかもしれません',
    leadMayResume: '推定した点検時間は過ぎました。',
    actMayResume: '駅の案内か運行情報で確認してから動いてください。',
    altTransport: '空港バスやタクシーは動いていることがあります。',
    fetchFailed: '地震情報を取得できません。回線を確認してください。',
    chipCheck: '要確認',
    language: '言語',
    shareLabel: '共有',
    noResults: '見つかりません',

    statusNormal: '平常どおり',
    statusDelay: '遅れている見込み',
    statusWait: '止まっている見込み',
    statusAvoid: '鉄道は使えない見込み',

    leadNormal: '電車を止めるほどの地震は起きていません。',
    leadDelay: '線路を確認しながら、徐行で動いています。',
    leadWait: '再開の前に、鉄道会社が線路を点検しています。',
    leadAvoid: '被害が出ている可能性。復旧に日単位かかることがあります。',

    chipNormal: '平常',
    chipDelay: '遅れ',
    chipWait: '停止',
    chipAvoid: '不通',
    chipUnknown: '不明',

    noPlaces: 'いる場所を教えてください。その周りの電車が動くかを出します。',
    tapToSet: 'タップして設定',
    notSet: '未設定',

    expectWait: (range) => `再開まで ${range}`,
    expectDelay: '30分ほどの遅れ',
    noEstimate: '見通し不明 — 日単位になりうる',
    inspectionPassed: '推定した点検時間は過ぎています。運行情報を確認してください。',
    unknownHere: 'この場所の近くに観測がありません',
    pastEvent: (when) => `過去の地震（${when} JST）を表示しています。いまの状況ではありません。`,

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

    shelterHelp: '建物が危ないときや火災から逃げるときに向かう場所です。市区町村が指定しています。',
    shelterUnverified: '開設しているかどうかは、ここでは分かりません。',
    shelterStayPut: 'いま安全な建物の中にいるなら、まず動かないこと。日本では地震のあと一斉に移動しないよう求められています。',
    shelterOpen: '避難場所を見る',
    shelterNone: 'この場所の近くに登録された避難場所がありません。',
    shelterLoading: '避難場所を探しています…',
    shelterDistance: (km) => `約 ${km} km`,
    shelterMapNote: '地理院タイル（国土地理院）',

    caveatTitle: 'これは推定です',
    caveat:
      '鉄道会社は自前の沿線地震計で判断していて、ここで使っている数値とは別物です。動く前に必ず事業者か駅係員に確認してください。',
    sources: '出典',

    settings: '設定',
    close: '閉じる',
    minutes: (n) => `${n}分`,
    hours: (h, m) => (m ? `${h}時間${m}分` : `${h}時間`),

    testBanner: 'テストデータ — 実際の地震ではありません',
    testBannerBody: '動作確認用の作り物です。これを元に行動したり、本物として共有したりしないでください。',
    exitTest: 'テスト表示をやめる',
  },

  en: {
    appName: 'Move or Wait',
    tagline: 'Trains in Japan after an earthquake',

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
    shelterTitle: 'Evacuation sites nearby',

    setLocation: 'Use my location',
    recheckLocation: 'Update my location',
    locating: 'Finding you…',
    locationDenied: 'Location unavailable. Pick a station instead.',
    nearStation: (name) => `Near ${name}`,
    coordsOnly: (lat, lon) => `${lat}, ${lon}`,
    pickStation: 'Search for a station',
    setHome: 'Use where I am now',
    clear: 'Clear',
    noHome: 'Not set.',
    homeHelp: 'Search for a station near where you are staying. You do not need to be there.',
    searchHome: 'Station near your accommodation',
    chooseAirport: 'Departure airport',
    departureTime: 'Departure time',
    save: 'Save',
    share: 'Copy link with my settings',
    copied: 'Link copied',
    showMap: 'Show map',
    hideMap: 'Hide map',
    epicentre: 'Epicentre',
    youAreHere: 'You',
    openInMaps: 'Directions',
    resumeBy: (from, to) => `around ${from}–${to}`,
    backTonight: 'You should be able to get back tonight.',
    notBackTonight: 'You may not get back by train tonight.',
    hotelsFill: 'If you want a room, act early. Places near stations fill up fast after a quake.',
    decideNow: 'Decide now',
    decideWait: 'Wait it out',
    decideBed: 'Secure a bed for tonight',
    stoppedAt: (place) => `near ${place}`,
    detMax: 'Strongest shaking on the line',
    detSource: (label, km) => `JMA station ${label} (${km} km)`,
    detInspect: 'Section needing inspection',
    detResume: 'Back in',
    detParts: 'Track sections used',
    detPartial: 'The mapping does not cover every station on this line. Shaking on the uncovered part is invisible here.',
    detUncertain: 'Few readings nearby — this estimate is weakly grounded.',
    detBasis: 'Estimated with the walking-inspection model of Takahama & Midorikawa (2011). Not the operator’s own decision.',
    detNone: 'No shaking strong enough to stop trains was recorded near this line.',
    shindo: (v) => `JMA intensity ${v}`,
    stayTitle: 'Where you can rest if stranded',
    stayHelp: 'Facilities opened for people who cannot get home. You can sit and wait here until trains run again.',
    stayNone: 'None registered near this place.',
    stayUncovered: 'This area is not covered yet. It does not mean there is none nearby.',
    stayCoverage: (where) => `Covers only what ${where} publishes`,
    refugeTitle: 'Where to escape danger',
    mapZoomIn: 'Zoom in',
    mapZoomOut: 'Zoom out',
    mapRecenter: 'Back to my location',
    statusPending: 'STRONG SHAKING — DETAILS PENDING',
    leadPending: 'Trains nearby are probably stopped. A detailed estimate follows within minutes.',
    actPending: 'Do not move yet. Make sure you are safe first.',
    chipPending: 'Pending',
    statusQuake: 'AN EARTHQUAKE HAS OCCURRED',
    statusMayResume: 'MAY HAVE RESUMED',
    leadMayResume: 'The estimated inspection window has passed.',
    actMayResume: 'Check station signs or the operator’s status before moving.',
    altTransport: 'Airport buses and taxis are often still running.',
    fetchFailed: 'Could not fetch earthquake data. Check your connection.',
    chipCheck: 'Check',
    language: 'Language',
    shareLabel: 'Share',
    noResults: 'No match',

    statusNormal: 'RUNNING NORMALLY',
    statusDelay: 'LIKELY DELAYED',
    statusWait: 'LIKELY STOPPED',
    statusAvoid: 'LIKELY OUT OF SERVICE',

    leadNormal: 'No recent earthquake strong enough to stop trains.',
    leadDelay: 'Trains are moving slowly while crews check the line.',
    leadWait: 'Railways are inspecting the track before restarting.',
    leadAvoid: 'Damage is likely. Services can be out for days.',

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
    noEstimate: 'No estimate — this can take days',
    inspectionPassed: 'The estimated inspection time has passed. Check with the operator.',
    unknownHere: 'No reading near this place',
    pastEvent: (when) => `Showing a past earthquake (${when} JST), not the current situation.`,

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

    shelterHelp: 'Where to go if your building is unsafe or you need to escape a fire. Designated by the city.',
    shelterUnverified: 'Whether a site is actually open cannot be confirmed here.',
    shelterStayPut: 'If you are in a safe building, stay put first. Japan asks people not to all move at once after a quake.',
    shelterOpen: 'Show evacuation sites',
    shelterNone: 'No registered evacuation site near this place.',
    shelterLoading: 'Looking for evacuation sites…',
    shelterDistance: (km) => `about ${km} km`,
    shelterMapNote: 'GSI Tiles (Geospatial Information Authority of Japan)',

    caveatTitle: 'This is an estimate',
    caveat:
      'Railways decide using their own trackside sensors, not the figure used here. Always confirm with the operator or station staff before acting.',
    sources: 'Sources',

    settings: 'Settings',
    close: 'Close',
    minutes: (n) => `${n} min`,
    hours: (h, m) => (m ? `${h} h ${m} min` : `${h} h`),

    testBanner: 'TEST DATA — this is not a real earthquake',
    testBannerBody: 'A synthetic scenario for checking the app. Do not act on it or share it as real.',
    exitTest: 'Leave test mode',
  },

  zh: {
    appName: '走还是等',
    tagline: '地震之后，日本的电车还开吗',

    checking: '正在确认…',
    lastChecked: '最后获取',
    offline: '离线 — 显示已保存的内容',
    reload: '重新确认',

    calmTitle: '运行正常',
    calmBody: '近期没有强到会让电车停运的地震。',

    quakeAt: (place, time) => `${place} ${time}`,
    magnitude: (m) => `M${m}`,

    hereTitle: '你所在的位置',
    homeTitle: '住宿地点',
    flightTitle: '回程航班',
    shelterTitle: '附近的避难场所',

    setLocation: '使用当前位置',
    recheckLocation: '重新获取当前位置',
    locating: '正在获取位置…',
    locationDenied: '无法获取位置，请改为选择车站。',
    nearStation: (name) => `${name} 附近`,
    coordsOnly: (lat, lon) => `${lat}, ${lon}`,
    pickStation: '搜索车站',
    setHome: '设为当前位置',
    clear: '清除',
    noHome: '未设置。',
    homeHelp: '搜索住处附近的车站即可。你不需要人在那里。',
    searchHome: '住处附近的车站',
    chooseAirport: '出发机场',
    departureTime: '出发时间',
    save: '保存',
    share: '复制带设置的链接',
    copied: '已复制',
    showMap: '查看地图',
    hideMap: '收起地图',
    epicentre: '震源',
    youAreHere: '你',
    openInMaps: '打开路线',
    resumeBy: (from, to) => `${from}～${to} 左右`,
    backTonight: '今晚应该还能回去。',
    notBackTonight: '今晚可能无法坐电车回去。',
    hotelsFill: '要订住处就趁早。地震后车站附近很快就满了。',
    decideNow: '现在要决定的事',
    decideWait: '等待恢复',
    decideBed: '先确保今晚的住处',
    stoppedAt: (place) => `${place} 附近`,
    detMax: '线路上最强的震动',
    detSource: (label, km) => `气象厅观测点 ${label}（${km} 公里）`,
    detInspect: '需要检查的区间',
    detResume: '恢复还需',
    detParts: '对应的线路',
    detPartial: '对照表未覆盖该系统的全部车站。未覆盖区间的震动在此看不到。',
    detUncertain: '附近观测点少，此推测依据较弱。',
    detBasis: '依据高浜・翠川 (2011) 的徒步检查模型推算。与铁路公司的判断不同。',
    detNone: '这条线路附近没有观测到足以让电车停运的震动。',
    shindo: (v) => `震度 ${v}`,
    stayTitle: '回不去时可以休息的地方',
    stayHelp: '为无法回家的人开放的设施。到了这里就能坐着等电车恢复。',
    stayNone: '这附近没有登记的设施。',
    stayUncovered: '该地区尚未收录，并不表示附近没有。',
    stayCoverage: (where) => `仅收录 ${where} 公开的部分`,
    refugeTitle: '躲避危险的场所',
    mapZoomIn: '放大',
    mapZoomOut: '缩小',
    mapRecenter: '回到当前位置',
    statusPending: '观测到强烈震动 — 等待详情',
    leadPending: '附近的电车很可能已停运。几分钟内会有详细预估。',
    actPending: '先不要移动，确保自身安全。',
    chipPending: '速报',
    statusQuake: '发生了地震',
    statusMayResume: '可能已经恢复',
    leadMayResume: '预估的检查时间已过。',
    actMayResume: '请先确认车站指示或运行信息再行动。',
    altTransport: '机场巴士和出租车可能仍在运行。',
    fetchFailed: '无法获取地震信息，请检查网络。',
    chipCheck: '待确认',
    language: '语言',
    shareLabel: '分享',
    noResults: '没有找到',

    statusNormal: '运行正常',
    statusDelay: '可能延误',
    statusWait: '可能已停运',
    statusAvoid: '铁路可能无法使用',

    leadNormal: '近期没有强到会让电车停运的地震。',
    leadDelay: '一边确认线路，一边减速运行。',
    leadWait: '恢复运行前，铁路公司正在检查线路。',
    leadAvoid: '可能已有损坏，恢复或需数日。',

    chipNormal: '正常',
    chipDelay: '延误',
    chipWait: '停运',
    chipAvoid: '不通',
    chipUnknown: '不明',

    noPlaces: '请告诉我们你在哪里，我们会显示附近的电车是否还开。',
    tapToSet: '点击设置',
    notSet: '未设置',

    expectWait: (range) => `预计 ${range} 后恢复`,
    expectDelay: '延误约 30 分钟',
    noEstimate: '无法预估 — 可能需要数日',
    inspectionPassed: '预估的检查时间已过。请确认运行信息。',
    unknownHere: '这一带没有观测数据',
    pastEvent: (when) => `显示的是过去的地震（${when} JST），不是当前情况。`,

    linesAffected: (n) => `${n} 条线路`,
    showLines: '查看线路',
    hideLines: '收起',

    flightIn: (d) => `距起飞 ${d}`,
    flightPassed: '已过起飞时间',
    flightOk: '应该来得及，但请比原计划提早出发。',
    flightTight: '时间很紧。请考虑现在出发或改签。',
    flightUnlikely: '坐电车可能赶不上，请联系航空公司。',

    whatNow: '现在该做什么',
    actWait: '如果所在位置安全就先待着。检查结束后会恢复运行。',
    actMove: '电车在运行。请留出充裕时间。',
    actShelter: '找地方过夜。不要在车站等。',

    shelterHelp: '当建筑物不安全或需要躲避火灾时前往的场所。由市区町村指定。',
    shelterUnverified: '这里无法确认该场所是否已经开放。',
    shelterStayPut: '如果你现在在安全的建筑物内，请先不要移动。日本要求地震后不要一齐外出。',
    shelterOpen: '查看避难场所',
    shelterNone: '这一带没有登记的避难场所。',
    shelterLoading: '正在查找避难场所…',
    shelterDistance: (km) => `约 ${km} 公里`,
    shelterMapNote: '地理院瓦片（日本国土地理院）',

    caveatTitle: '这只是推测',
    caveat:
      '铁路公司依据自己沿线的地震仪判断，与这里使用的数值不同。行动前请务必向运营公司或车站工作人员确认。',
    sources: '数据来源',

    settings: '设置',
    close: '关闭',
    minutes: (n) => `${n} 分钟`,
    hours: (h, m) => (m ? `${h} 小时 ${m} 分` : `${h} 小时`),

    testBanner: '测试数据 — 并非真实地震',
    testBannerBody: '这是用于确认功能的模拟数据。请勿据此行动，也不要当作真实信息分享。',
    exitTest: '退出测试显示',
  },

  ko: {
    appName: '갈까, 기다릴까',
    tagline: '지진 후 일본의 전철은 움직이나',

    checking: '확인 중…',
    lastChecked: '마지막 확인',
    offline: '오프라인 — 저장된 내용 표시 중',
    reload: '다시 확인',

    calmTitle: '정상 운행 중입니다',
    calmBody: '전철을 멈출 만큼 강한 지진은 없었습니다.',

    quakeAt: (place, time) => `${place} ${time}`,
    magnitude: (m) => `M${m}`,

    hereTitle: '현재 위치',
    homeTitle: '숙소',
    flightTitle: '출국 항공편',
    shelterTitle: '가까운 대피 장소',

    setLocation: '현재 위치 사용',
    recheckLocation: '현재 위치 다시 받기',
    locating: '위치를 확인하는 중…',
    locationDenied: '위치를 가져올 수 없습니다. 역을 선택해 주세요.',
    nearStation: (name) => `${name} 부근`,
    coordsOnly: (lat, lon) => `${lat}, ${lon}`,
    pickStation: '역 검색',
    setHome: '현재 위치로 지정',
    clear: '지우기',
    noHome: '미설정.',
    homeHelp: '묵는 곳 근처의 역을 검색하세요. 그곳에 있을 필요는 없습니다.',
    searchHome: '숙소 근처 역',
    chooseAirport: '출발 공항',
    departureTime: '출발 시각',
    save: '저장',
    share: '설정이 담긴 링크 복사',
    copied: '복사했습니다',
    showMap: '지도 보기',
    hideMap: '지도 닫기',
    epicentre: '진원',
    youAreHere: '현재',
    openInMaps: '길찾기',
    resumeBy: (from, to) => `${from}~${to}쯤`,
    backTonight: '오늘 밤 안에 돌아갈 수 있을 것으로 보입니다.',
    notBackTonight: '오늘 밤에는 전철로 돌아가지 못할 수 있습니다.',
    hotelsFill: '숙소를 잡으려면 서두르세요. 지진 후 역 근처는 금방 찹니다.',
    decideNow: '지금 정할 것',
    decideWait: '기다린다',
    decideBed: '오늘 밤 잘 곳을 확보한다',
    stoppedAt: (place) => `${place} 부근`,
    detMax: '노선에서 가장 강한 흔들림',
    detSource: (label, km) => `기상청 관측점 ${label}(${km}km)`,
    detInspect: '점검이 필요한 구간',
    detResume: '재개까지',
    detParts: '해당 선로',
    detPartial: '대조표가 이 계통의 모든 역을 덮지 못했습니다. 덮지 못한 구간의 흔들림은 보이지 않습니다.',
    detUncertain: '주변 관측이 적어 근거가 약한 추정입니다.',
    detBasis: '다카하마·미도리카와(2011)의 도보 점검 모델에 따른 추정. 철도 회사의 판단과는 다릅니다.',
    detNone: '이 노선 부근에서 전철을 멈출 만한 흔들림은 관측되지 않았습니다.',
    shindo: (v) => `진도 ${v}`,
    stayTitle: '돌아갈 수 없을 때 쉴 수 있는 곳',
    stayHelp: '귀가가 어려운 사람을 위해 개방하는 시설입니다. 여기까지 오면 전철이 재개될 때까지 앉아서 기다릴 수 있습니다.',
    stayNone: '이 부근에 등록된 곳이 없습니다.',
    stayUncovered: '이 지역은 아직 수록되지 않았습니다. 근처에 없다는 뜻은 아닙니다.',
    stayCoverage: (where) => `${where}가 공개한 분량만 수록`,
    refugeTitle: '위험에서 피하는 장소',
    mapZoomIn: '확대',
    mapZoomOut: '축소',
    mapRecenter: '현재 위치로',
    statusPending: '강한 흔들림 관측 — 상세 대기 중',
    leadPending: '주변 전철은 멈췄을 가능성이 큽니다. 몇 분 안에 상세 전망이 나옵니다.',
    actPending: '우선 움직이지 말고 안전을 확보하세요.',
    chipPending: '속보',
    statusQuake: '지진이 발생했습니다',
    statusMayResume: '재개되었을 수 있습니다',
    leadMayResume: '예상 점검 시간이 지났습니다.',
    actMayResume: '역 안내나 운행 정보를 확인한 뒤 움직이세요.',
    altTransport: '공항버스나 택시는 운행 중일 수 있습니다.',
    fetchFailed: '지진 정보를 가져올 수 없습니다. 연결을 확인하세요.',
    chipCheck: '확인 필요',
    language: '언어',
    shareLabel: '공유',
    noResults: '결과 없음',

    statusNormal: '정상 운행',
    statusDelay: '지연 예상',
    statusWait: '운행 중단 예상',
    statusAvoid: '철도 이용 어려움',

    leadNormal: '전철을 멈출 만큼 강한 지진은 없었습니다.',
    leadDelay: '선로를 확인하며 서행 운행 중입니다.',
    leadWait: '재개 전에 철도 회사가 선로를 점검하고 있습니다.',
    leadAvoid: '피해가 있을 수 있습니다. 복구에 며칠이 걸릴 수 있습니다.',

    chipNormal: '정상',
    chipDelay: '지연',
    chipWait: '중단',
    chipAvoid: '불통',
    chipUnknown: '불명',

    noPlaces: '어디에 있는지 알려주시면 주변 전철이 움직이는지 알려드립니다.',
    tapToSet: '눌러서 설정',
    notSet: '미설정',

    expectWait: (range) => `재개까지 ${range}`,
    expectDelay: '30분 정도 지연',
    noEstimate: '전망 불명 — 며칠이 걸릴 수 있음',
    inspectionPassed: '예상한 점검 시간이 지났습니다. 운행 정보를 확인하세요.',
    unknownHere: '이 부근에 관측 자료가 없습니다',
    pastEvent: (when) => `과거의 지진(${when} JST)을 표시 중입니다. 현재 상황이 아닙니다.`,

    linesAffected: (n) => `${n}개 노선`,
    showLines: '노선 보기',
    hideLines: '닫기',

    flightIn: (d) => `출발까지 ${d}`,
    flightPassed: '출발 시각이 지났습니다',
    flightOk: '늦지 않을 것으로 보이지만, 예정보다 일찍 나서세요.',
    flightTight: '상당히 빠듯합니다. 지금 출발하거나 항공편 변경을 고려하세요.',
    flightUnlikely: '철도로는 시간에 맞추기 어렵습니다. 항공사에 연락하세요.',

    whatNow: '지금 할 일',
    actWait: '안전한 곳이라면 그대로 기다리세요. 점검이 끝나면 재개됩니다.',
    actMove: '전철은 움직이고 있습니다. 시간을 넉넉히 잡으세요.',
    actShelter: '오늘 밤 묵을 곳을 찾으세요. 역에서 기다리지 마세요.',

    shelterHelp: '건물이 위험하거나 화재를 피해야 할 때 가는 장소입니다. 지자체가 지정합니다.',
    shelterUnverified: '실제로 개설되어 있는지는 여기서 확인할 수 없습니다.',
    shelterStayPut: '안전한 건물 안에 있다면 우선 움직이지 마세요. 일본에서는 지진 후 한꺼번에 이동하지 않도록 요청하고 있습니다.',
    shelterOpen: '대피 장소 보기',
    shelterNone: '이 부근에 등록된 대피 장소가 없습니다.',
    shelterLoading: '대피 장소를 찾는 중…',
    shelterDistance: (km) => `약 ${km} km`,
    shelterMapNote: '지리원 타일(일본 국토지리원)',

    caveatTitle: '이것은 추정입니다',
    caveat:
      '철도 회사는 자체 선로 지진계로 판단하며, 여기서 쓰는 수치와는 다릅니다. 움직이기 전에 반드시 운영사나 역무원에게 확인하세요.',
    sources: '출처',

    settings: '설정',
    close: '닫기',
    minutes: (n) => `${n}분`,
    hours: (h, m) => (m ? `${h}시간 ${m}분` : `${h}시간`),

    testBanner: '테스트 데이터 — 실제 지진이 아닙니다',
    testBannerBody: '동작 확인용 모의 데이터입니다. 이를 근거로 행동하거나 실제 정보로 공유하지 마세요.',
    exitTest: '테스트 표시 끄기',
  },
}

/**
 * @param {Lang} lang
 * @returns {typeof STRINGS.en}
 */
export const t = (lang) => STRINGS[lang] ?? STRINGS.en

/**
 * ブラウザの設定から言語を選ぶ。対応外なら英語。
 * @returns {Lang}
 */
export function detectLang() {
  const list = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : []
  for (const raw of list) {
    if (typeof raw !== 'string') continue
    const l = raw.toLowerCase()
    if (l.startsWith('ja')) return 'ja'
    if (l.startsWith('zh')) return 'zh'
    if (l.startsWith('ko')) return 'ko'
    if (l.startsWith('en')) return 'en'
  }
  return 'en'
}

/** Intl に渡すロケール。 */
export const locale = (lang) =>
  ({ ja: 'ja-JP', zh: 'zh-CN', ko: 'ko-KR', en: 'en-GB' })[lang] ?? 'en-GB'

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
