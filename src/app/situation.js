// 「この場所はどうなっているか」を組み立てる層。
//
// 画面に出すのは震度ではなく、乗客にとっての結論。
// 場所ごとに、近くの路線が止まっている見込みかどうかと、待ち時間の幅を出す。

import { SHINDO_ORDER } from '../quake/types.js'
import { sampleAt } from '../quake/field.js'
import { createGrid } from '../quake/grid.js'
import { estimateSuspension, estimateSystemSuspension } from '../rail/regulation.js'

/** @typedef {import('../quake/field.js').Field} Field */
/** @typedef {import('../rail/assign.js').LineImpact} LineImpact */
/** @typedef {import('../rail/systems.js').SystemImpact} SystemImpact */
/** @typedef {import('../rail/regulation.js').Suspension} Suspension */

/**
 * 「今いる場所がどれくらい揺れたか」を見る半径。
 *
 * 路線は 20km で見る (事業者が区間まるごと止めるため) が、同じ半径で
 * 「私がいる場所」を答えると 12km 先の観測点の値を返してしまい悲観的すぎる。
 * 地点は近傍だけを見る。
 */
export const PLACE_RADIUS_KM = 5

/** 「この場所で使う路線」とみなす距離。徒歩で行ける駅の範囲。 */
const NEARBY_LINE_KM = 2

/**
 * 運転系統がこの場所を通っているとみなす距離。
 *
 * N02 の路線が近いだけでは足りない。中央本線辰野支線は N02 の中央線に
 * 対応づくので、東京駅の近くに中央線があるだけで長野の支線が出てしまう。
 * 系統自身の駅が近くにあるかで確かめる。
 */
const SYSTEM_HERE_KM = 5

/**
 * その路線の揺れが「この場所の話」と言える距離。
 *
 * 東海道新幹線は東京駅を通るが、大阪で震度6弱を観測しても
 * 東京の電車が止まるわけではない。路線の最大震度をそのまま
 * 場所の判定にすると、400km 先の揺れで「不通」と出てしまう。
 *
 * 路線の中で最も揺れた地点がここから離れているなら、
 * その路線は一覧には出すが、この場所の判定には使わない。
 */
const LOCAL_KM = 50

/**
 * @typedef {object} Situation
 * @property {import('../quake/types.js').ShindoLevel|null} level  その場所の揺れ。
 * @property {import('../quake/field.js').Confidence} confidence
 * @property {Suspension} worst  近くの路線のうち最も重い見込み。判断 (待つ/動く) はこれで決める。
 * @property {Suspension} typical  近くの路線の中央値。待ち時間の見出しはこれで出す。
 * @property {Array<{title:string, titleEn:string|null, suspension:Suspension, systemId:string|null}>} local
 *   そのうち、揺れた地点がこの場所の近く (50km 以内) のもの。判定はこれで決める。
 * @property {Array<{title:string, titleEn:string|null, suspension:Suspension, systemId:string|null}>} lines
 *   乗客に見せる単位。運転系統があれば系統名、無ければ N02 の路線名。
 */

/**
 * 路線・系統を座標から引くための索引。イベントをまたいで使い回す。
 * @param {{lines: import('../rail/types.js').RailLine[]}} rail
 * @param {import('../rail/systems.js').LineMap} lineMap
 */
export function buildLookup(rail, lineMap) {
  /** @type {{lat:number, lon:number, lineId:string}[]} */
  const points = []
  for (const line of rail.lines) {
    for (const st of line.stations) points.push({ lat: st.lat, lon: st.lon, lineId: line.id })
  }

  /** @type {Map<string, SystemImpact['system'][]>} N02 路線 → その路線を使う運転系統 */
  const systemsByLine = new Map()
  for (const system of lineMap.systems) {
    for (const id of system.lineIds) {
      const bucket = systemsByLine.get(id)
      if (bucket) bucket.push(system)
      else systemsByLine.set(id, [system])
    }
  }

  return {
    stationGrid: createGrid(points, (p) => [p.lat, p.lon], 0.05),
    systemsByLine,
  }
}

/**
 * 1 つの場所の状況を組み立てる。
 *
 * @param {{lat:number, lon:number}} place
 * @param {Field} field
 * @param {ReturnType<typeof buildLookup>} lookup
 * @param {Map<string, LineImpact>} impactsByLine
 * @param {Map<string, SystemImpact>} systemImpactsById
 * @param {{lineIds?: string[], systemIds?: string[]}} [hint]
 *   空港のように、どの路線・系統で行くかが分かっている場合に渡す。
 * @param {Map<string, import('./train-info.js').TrainInfo>} [trainInfo]
 *   事業者の運行情報。あれば推定を上書きする。「平常」なら推定を捨てる。
 * @returns {Situation}
 */
export function situationAt(place, field, lookup, impactsByLine, systemImpactsById, hint = {}, trainInfo) {
  const here = sampleAt(field, place.lat, place.lon, PLACE_RADIUS_KM)

  // 近くの路線。空港のように分かっているなら、それを使う。
  let lineIds = hint.lineIds
  if (!lineIds || lineIds.length === 0) {
    const near = new Set()
    for (const p of lookup.stationGrid.candidates(place.lat, place.lon, NEARBY_LINE_KM)) {
      const d = haversine(place.lat, place.lon, p.lat, p.lon)
      if (d <= NEARBY_LINE_KM) near.add(p.lineId)
    }
    lineIds = [...near]
  }

  // 乗客が見る単位に寄せる。運転系統があれば系統、無ければ路線。
  /** @type {Map<string, {title:string, titleEn:string|null, suspension:Suspension, systemId:string|null}>} */
  const shown = new Map()

  for (const lineId of lineIds) {
    const impact = impactsByLine.get(lineId)
    if (!impact) continue

    const systems = lookup.systemsByLine.get(lineId) ?? []
    if (systems.length === 0) {
      shown.set(`line:${lineId}`, {
        title: `${impact.line.operator} ${impact.line.name}`,
        titleEn: null,
        suspension: estimateSuspension(impact),
        systemId: null,
        parts: [],
        partial: false,
      })
      continue
    }
    for (const system of systems) {
      if (shown.has(system.id)) continue
      const systemImpact = systemImpactsById.get(system.id)
      if (!systemImpact) continue
      // その系統が本当にこの場所を通っているか。通っていなければ出さない。
      if (!systemPasses(system, place)) continue
      shown.set(system.id, {
        title: system.title,
        titleEn: system.titleEn,
        suspension: estimateSystemSuspension(systemImpact, field),
        systemId: system.id,
        // 内訳。この系統がどの線路名称を使っているか。
        parts: systemImpact.lines.map((x) => `${x.line.operator} ${x.line.name}`),
        partial: systemImpact.system.matched < systemImpact.system.total,
      })
    }
  }

  // 空港のように「この系統で行く」と分かっているぶんを足す。
  for (const systemId of hint.systemIds ?? []) {
    if (shown.has(systemId)) continue
    const systemImpact = systemImpactsById.get(systemId)
    if (!systemImpact) continue
    shown.set(systemId, {
      title: systemImpact.system.title,
      titleEn: systemImpact.system.titleEn,
      suspension: estimateSystemSuspension(systemImpact, field),
      systemId,
    })
  }

  // 事業者が運行情報を出しているなら、それが推定に勝つ。
  //
  // 「平常」と言っているのに「止まっている見込み」と出し続けるのが、
  // このアプリの一番の弱点だった (推定を終わらせる手段が無かった)。
  // 「見合わせ」なら推定は裏付けられる。見込みではなく事実として出せる。
  if (trainInfo) {
    for (const entry of shown.values()) {
      const info = entry.systemId ? trainInfo.get(entry.systemId) : null
      if (!info || info.status === 'unknown') continue
      entry.confirmed = info.status
      entry.operatorText = info.text
      entry.operatorTextEn = info.textEn
      entry.operatorUpdated = info.updated
      if (info.status === 'normal') {
        entry.suspension = {
          ...entry.suspension,
          stage: 'none',
          advice: 'normal',
          waitMinutes: null,
          openEnded: false,
          uncertain: false,
        }
      } else if (info.status === 'delayed' && entry.suspension.advice === 'normal') {
        entry.suspension = { ...entry.suspension, stage: 'caution', advice: 'delay' }
      } else if (info.status === 'stopped' && entry.suspension.advice === 'normal') {
        // 推定では揺れていないが、事業者は止めている。理由は分からないが事実は事実。
        entry.suspension = { ...entry.suspension, stage: 'walk-inspection', advice: 'wait' }
      }
    }
  }

  const lines = [...shown.values()].sort((a, b) => rank(b.suspension) - rank(a.suspension))

  /** @type {Suspension} */
  const none = {
    stage: 'none',
    advice: 'normal',
    level: here.level,
    inspectionLengthKm: null,
    waitMinutes: null,
    openEnded: false,
    uncertain: here.confidence !== 'reported',
  }

  // この場所の判定に使う路線。遠くで揺れているだけのものは外す。
  // 外したものも一覧には出す。ただし「どこで止まっているか」を添えて、
  // 判定が平常なのに一覧に不通が並ぶ理由が分かるようにする。
  for (const l of lines) {
    l.nearby =
      !l.suspension.at ||
      haversine(place.lat, place.lon, l.suspension.at.lat, l.suspension.at.lon) <= LOCAL_KM
  }
  const local = lines.filter((l) => l.nearby)

  // 判断は最も重い路線に合わせる。1 本でも止まっていれば経路は崩れる。
  const worst = local[0]?.suspension ?? none

  // 待ち時間の見出しは中央値にする。東京駅には東北新幹線も来ていて、
  // 全長の点検で 10 時間と出る。それを見出しにすると、
  // 地下鉄で数駅戻るだけの人にまで「10 時間」と言うことになる。
  // どの路線がどれだけかは一覧で見せる。
  const waiting = local.filter((l) => l.suspension.waitMinutes)
  const typical = waiting.length ? waiting[Math.floor(waiting.length / 2)].suspension : worst

  return { level: here.level, confidence: here.confidence, worst, typical, lines, local }
}

/** 重い順に並べるための順位。見通し不明が一番重い。 */
const rank = (s) => {
  if (s.openEnded) return Number.MAX_SAFE_INTEGER
  if (s.waitMinutes) return s.waitMinutes.typical
  return s.level ? SHINDO_ORDER[s.level] : 0
}

const EARTH_RADIUS_KM = 6371
const toRad = (deg) => (deg * Math.PI) / 180
function haversine(aLat, aLon, bLat, bLon) {
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRad(aLat)) * Math.cos(toRad(bLat))
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/**
 * 系統がその場所を通っているか。
 * 座標を持たない系統は判定できないので、通っている側に倒す
 * (出しすぎる方が、必要な路線を落とすより安全)。
 *
 * @param {SystemImpact['system']} system
 * @param {{lat:number, lon:number}} place
 */
function systemPasses(system, place) {
  const geo = system.geo
  if (!geo || geo.length === 0) return true
  return geo.some(([lat, lon]) => haversine(place.lat, place.lon, lat, lon) <= SYSTEM_HERE_KM)
}
