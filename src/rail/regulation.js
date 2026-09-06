// 震度から「どれくらい止まるか」を見積もる。
//
// ここが [[DisasterPrevention]] の核心。震度の数値ではなく
// 「待つべきか動くべきか」を出すために、震度を運転規制の段階と待ち時間に翻訳する。
//
// ── 根拠 ────────────────────────────────────────────────────
// 高浜勉・翠川三郎「地震時の鉄道運休時間の推定方法」
// 日本地震工学会論文集 第11巻第2号 (2011) 表1
// https://www.jaee.gr.jp/stack/submit-j/v11n02/hon/110203_Paper.pdf
//
//   基準値 震度4    注意運転点検・重要箇所の点検   30分            + 再開まで5分
//   基準値 震度5弱  徒歩点検                     max(6.0×L, 30)分 + 再開まで5分
//   L = 点検区間の長さ(km)。T = 6.0×L ± 30 (分)。ばらつきは ±30分。
//
// 首都圏の鉄道事業者 24 社への聞き取り (2005年千葉県北西部地震) が元になっている。
// 国土交通省「大規模地震発生時における首都圏鉄道の運転再開のあり方に関する協議会」
// 報告書 (2012) の実施基準の例とも整合する
// (震度4で55km/h以下の注意運転、5弱で25km/h以下、5強以上は点検まで運転中止)。
// https://www.mlit.go.jp/common/000208774.pdf
//
// ── この見積もりの限界 ──────────────────────────────────────
// **事業者は気象庁の震度で判断していない。** 各社は自前の沿線地震計の
// 加速度(gal)や SI 値で規制をかける。ここで使う震度は最大 20km 離れた
// 気象庁の観測点の値なので、あくまで代理指標。断定に使ってはいけない。
// 実際に止まっているかは ODPT の運行情報で確定させる。
//
// 震度6弱以上は構造物の被害が出る領域で、点検だけでは終わらない。
// 同論文の被害モデルは被害率を入力に要るため、発災直後には使えない。
// この関数は「日単位になりうる」とだけ言って、時間を出さない。

import { SHINDO_ORDER } from '../quake/types.js'
import { distanceKm, sampleAt } from '../quake/field.js'
import { createGrid } from '../quake/grid.js'
import { trackFractionAtOrAbove } from './assign.js'

/** @typedef {import('../quake/types.js').ShindoLevel} ShindoLevel */
/** @typedef {import('./assign.js').LineImpact} LineImpact */

/** 徒歩点検の所要時間 (分) = 6.0 × 点検区間長(km)。 */
const WALK_MINUTES_PER_KM = 6.0
/** 上式のばらつき (分)。論文の図1 で ±30分。 */
const WALK_SCATTER_MINUTES = 30
/** 点検の下限。短い区間でも 30分 を下回らない。 */
const MIN_INSPECTION_MINUTES = 30
/** 注意運転点検の所要時間 (分)。 */
const CAUTION_INSPECTION_MINUTES = 30
/** 点検終了から運転再開まで (分)。徒歩点検を行った8路線の平均。 */
const RESUME_MINUTES = 5

/**
 * 'none'            規制なし。動いているはず。
 * 'caution'         注意運転点検。徐行で遅れるが動く。
 * 'walk-inspection' 徒歩点検。終わるまで動かない。
 * 'damage-likely'   被害が出る領域。点検だけでは終わらない。
 * @typedef {'none'|'caution'|'walk-inspection'|'damage-likely'} Stage
 */

/**
 * 'normal'      平常どおり使える見込み
 * 'delay'       動くが遅れる
 * 'wait'        止まる。待てば再開する見込み
 * 'avoid-rail'  鉄道での移動を当てにしない
 * @typedef {'normal'|'delay'|'wait'|'avoid-rail'} Advice
 */

/**
 * @typedef {object} Suspension
 * @property {Stage} stage
 * @property {Advice} advice
 * @property {ShindoLevel|null} level  判断に使った線内最大震度。
 * @property {number|null} inspectionLengthKm  徒歩点検が要ると見込む区間長。
 * @property {{typical:number, min:number, max:number}|null} waitMinutes
 *   運転再開までの目安 (分)。openEnded のときは null。
 * @property {boolean} openEnded  点検モデルでは説明できない (被害が出る領域)。
 * @property {boolean} uncertain  震度の根拠が弱い。結論を弱める材料。
 * @property {{lat:number, lon:number, label:string|null}|null} [at]
 *   最も揺れた地点。「どこで止まっているか」を言うのに要る。
 *   東海道新幹線は東京駅を通るが、大阪で止まっていても東京の電車は動く。
 * @property {{label:string, distanceKm:number}|null} [source]
 *   その震度を与えた気象庁の観測点と、判定地点からの距離。
 *   推定の根拠なので、内訳を見せるときに要る。
 */

/**
 * 線内で震度5弱以上だった長さを見積もる。
 *
 * 線形点は約 2km 間隔で路線に沿って並んでいるので、そのうち何割が
 * 震度5弱以上だったかを路線長に掛ければ、点検が要る区間の長さになる。
 * 駅は都市部に密集していて一様でないので使わない。
 *
 * @param {LineImpact} impact
 * @returns {number}
 */
export function inspectionLengthKm(impact) {
  const { line, trackSample } = impact
  // 線形点が無い路線は割合が出せない。全線点検と見て安全側に倒す。
  if (!trackSample || trackSample.total === 0) return line.lengthKm
  return line.lengthKm * trackFractionAtOrAbove(trackSample, '5-')
}

/**
 * 1 路線の運転見合わせを見積もる。
 *
 * @param {LineImpact} impact
 * @returns {Suspension}
 */
export function estimateSuspension(impact) {
  const uncertain = impact.confidence !== 'reported' || impact.unknownPoints > 0
  return {
    ...estimateFromLevel(impact.level, inspectionLengthKm(impact), uncertain),
    at: impact.at ? { lat: impact.at.lat, lon: impact.at.lon, label: impact.at.label ?? null } : null,
    source: impact.source ?? null,
  }
}

// ── 運転系統としての見積もり ────────────────────────────────
//
// 運転系統は N02 路線の一部しか走らないことがある。山手線が使う東北線は
// 田端〜東京の数 km だけなのに、東北線は全長 606km ある。
// 路線側の点検区間長をそのまま拾うと、山手線の待ち時間が 11 時間になってしまう。
//
// そこで、系統の駅の近くにある線形点だけを「この系統が走っている区間」として数える。

/**
 * 系統の駅からこの距離までの線形点を、その系統の区間とみなす。
 * 都市部の駅間は 1〜2km なので、3km あれば駅間の線形を拾える。
 * 広げすぎると、系統が走らない支線まで入る。
 */
const CORRIDOR_KM = 3

/**
 * 線形点を地理的に重複排除する格子の粗さ (度)。
 * 線形点の生成と同じ 0.02 度 (約 2km)。
 *
 * 山手線は品川〜東京で東北線・東海道線と並走していて、N02 では別の路線として
 * 記録されている。同じ場所を 3 本ぶん数えると点検区間長が 3 倍になるので、
 * 同じ格子に落ちる線形点は 1 度しか数えない。
 */
const CORRIDOR_CELL_DEG = 0.02

/**
 * 格子 1 セルあたりの営業キロ。
 *
 * N02 の路線長は並走・支線ぶんを含むので、そのまま系統に按分できない。
 * 代わりにセル数から測る。営業キロが分かっている 7 系統で較正した平均値。
 * 山手線 2.30 / 中央線快速 2.12 / 埼京線 1.63 / 総武各停 1.63 /
 * 成田線空港支線 1.54 / 京浜東北 1.33 / 京急空港線 1.08 → 平均 1.66
 */
const KM_PER_CELL = 1.7

/**
 * 上の較正のばらつき。直線的な系統ほどセルあたりが長く、
 * 山手線のように折り返す系統ほど短い。実測で ±40% 程度。
 * 待ち時間の幅にそのまま乗せる — 精度を装うより幅で言う方が判断に使える。
 */
const LENGTH_UNCERTAINTY = 0.4

/**
 * @typedef {import('./systems.js').SystemImpact} SystemImpact
 * @typedef {import('../quake/field.js').Field} Field
 */

/**
 * @typedef {Suspension & {
 *   systemLengthKm: number|null,
 *   corridorKnown: boolean
 * }} SystemSuspension
 *   systemLengthKm: 系統がこの区間で走っていると推定した長さ。
 *   corridorKnown: 系統の駅座標が分かり、走行区間を絞れたか。
 *   false のときは路線側の値をそのまま使っているので過大に出る。
 */

/**
 * 運転系統としての運転見合わせを見積もる。
 *
 * 震度は系統自身の駅から取り直す。構成路線の最大値を使うと、
 * 系統が走らない区間の揺れを拾ってしまうため。
 *
 * @param {SystemImpact} systemImpact
 * @param {Field} field
 * @param {{radiusKm?: number}} [options]
 * @returns {SystemSuspension}
 */
export function estimateSystemSuspension(systemImpact, field, { radiusKm = 20 } = {}) {
  const geo = systemImpact.system.geo ?? []

  if (geo.length === 0) {
    // 系統の位置が分からない。構成路線のうち最も長い見積もりに倒しておく。
    return { ...worstOfLines(systemImpact), systemLengthKm: null, corridorKnown: false }
  }

  // 系統の駅で震度を取り直す。どこが一番揺れたかも覚えておく。
  /** @type {import('../quake/types.js').ShindoLevel|null} */
  let level = null
  let confidence = 'unknown'
  let unknownPoints = 0
  /** @type {{lat:number, lon:number, label:string|null}|null} */
  let at = null
  /** @type {{label:string, distanceKm:number}|null} */
  let source = null
  for (const [lat, lon] of geo) {
    const sample = sampleAt(field, lat, lon, radiusKm)
    if (sample.confidence === 'unknown') unknownPoints++
    if (sample.confidence === 'below-threshold' && confidence === 'unknown') {
      confidence = 'below-threshold'
    }
    if (!sample.level) continue
    confidence = 'reported'
    if (!level || SHINDO_ORDER[sample.level] > SHINDO_ORDER[level]) {
      level = sample.level
      at = { lat, lon, label: sample.source?.label ?? null }
      source = sample.source
        ? { label: sample.source.label, distanceKm: sample.source.distanceKm }
        : null
    }
  }

  // 系統が走っている区間の長さと、そのうち震度5弱以上だった長さ。
  const corridor = createGrid(geo, (g) => [g[0], g[1]], 0.05)
  const near = (lat, lon) =>
    corridor
      .candidates(lat, lon, CORRIDOR_KM)
      .some(([a, b]) => distanceKm(lat, lon, a, b) <= CORRIDOR_KM)

  let systemLengthKm = 0
  let inspectedKm = 0
  /** @type {Set<string>} 同じ場所を並走路線ぶん重ねて数えないための印。 */
  const seen = new Set()

  for (const lineImpact of systemImpact.lines) {
    const track = lineImpact.line.track
    if (track.length === 0) continue
    for (let i = 0; i < track.length; i++) {
      const [lat, lon] = track[i]
      if (!near(lat, lon)) continue
      const cell = `${Math.round(lat / CORRIDOR_CELL_DEG)}:${Math.round(lon / CORRIDOR_CELL_DEG)}`
      if (seen.has(cell)) continue
      seen.add(cell)

      systemLengthKm += KM_PER_CELL
      const pointLevel = lineImpact.trackLevels?.[i]
      if (pointLevel && SHINDO_ORDER[pointLevel] >= SHINDO_ORDER['5-']) inspectedKm += KM_PER_CELL
    }
  }

  // ODPT が数駅しか公開していない系統がある (東海道新幹線は 5 駅)。
  // 駅の周りしか回廊にならず、区間長が実際より大幅に短く出る。
  // 駅を結ぶ経路は少なくとも端から端までの直線距離より長いはずなので、
  // それを下回ったら回廊が穴だらけだと判断する。
  //
  // 短く言って足止めされる方が、長く言って早く動けるより悪い。
  // 信用できないときは路線側の見積もり (安全側) に倒す。
  if (systemLengthKm < spanKm(geo)) {
    const worst = worstOfLines(systemImpact)
    return {
      ...worst,
      at: worst.at ?? at,
      source: worst.source ?? source,
      systemLengthKm: Number(systemLengthKm.toFixed(1)),
      corridorKnown: false,
    }
  }

  const base = estimateFromLevel(
    level,
    inspectedKm,
    confidence !== 'reported' || unknownPoints > 0,
    LENGTH_UNCERTAINTY,
  )
  return {
    ...base,
    at,
    source,
    systemLengthKm: Number(systemLengthKm.toFixed(1)),
    corridorKnown: true,
  }
}

/**
 * 系統の端から端までの直線距離。駅を結ぶ経路はこれより短くならない。
 * @param {[number, number][]} geo
 * @returns {number}
 */
function spanKm(geo) {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lat, lon] of geo) {
    if (lat < south) south = lat
    if (lat > north) north = lat
    if (lon < west) west = lon
    if (lon > east) east = lon
  }
  return distanceKm(south, west, north, east)
}

/**
 * 構成路線のうち最も長い見積もり。回廊が信用できないときの安全側の答え。
 * @param {SystemImpact} systemImpact
 * @returns {Suspension}
 */
function worstOfLines(systemImpact) {
  const rank = (s) => (s.openEnded ? Infinity : (s.waitMinutes?.typical ?? 0))
  return systemImpact.lines
    .map((l) => estimateSuspension(l))
    .sort((a, b) => rank(b) - rank(a))[0]
}

/**
 * 震度と点検区間長から段階と待ち時間を出す共通部分。
 * @param {import('../quake/types.js').ShindoLevel|null} level
 * @param {number} lengthKm
 * @param {boolean} uncertain
 * @param {number} [lengthUncertainty]  区間長そのものの相対誤差 (0〜1)。幅に乗せる。
 * @returns {Suspension}
 */
function estimateFromLevel(level, lengthKm, uncertain, lengthUncertainty = 0) {
  if (!level || SHINDO_ORDER[level] < SHINDO_ORDER['4']) {
    return {
      stage: 'none',
      advice: 'normal',
      level,
      inspectionLengthKm: null,
      waitMinutes: null,
      openEnded: false,
      uncertain,
    }
  }
  if (SHINDO_ORDER[level] >= SHINDO_ORDER['6-']) {
    return {
      stage: 'damage-likely',
      advice: 'avoid-rail',
      level,
      inspectionLengthKm: Number(lengthKm.toFixed(1)),
      waitMinutes: null,
      openEnded: true,
      uncertain,
    }
  }
  if (SHINDO_ORDER[level] === SHINDO_ORDER['4']) {
    const typical = CAUTION_INSPECTION_MINUTES + RESUME_MINUTES
    return {
      stage: 'caution',
      advice: 'delay',
      level,
      inspectionLengthKm: null,
      waitMinutes: { typical, min: typical, max: typical },
      openEnded: false,
      uncertain,
    }
  }
  const walk = (km) => Math.max(WALK_MINUTES_PER_KM * km, MIN_INSPECTION_MINUTES)
  const typical = walk(lengthKm)
  // 区間長の誤差と、式そのものの ±30分 のばらつきを重ねる。
  const low = walk(lengthKm * (1 - lengthUncertainty)) - WALK_SCATTER_MINUTES
  const high = walk(lengthKm * (1 + lengthUncertainty)) + WALK_SCATTER_MINUTES

  return {
    stage: 'walk-inspection',
    advice: 'wait',
    level,
    inspectionLengthKm: Number(lengthKm.toFixed(1)),
    waitMinutes: {
      typical: Math.round(typical + RESUME_MINUTES),
      min: Math.round(Math.max(low, MIN_INSPECTION_MINUTES) + RESUME_MINUTES),
      max: Math.round(high + RESUME_MINUTES),
    },
    openEnded: false,
    uncertain,
  }
}
