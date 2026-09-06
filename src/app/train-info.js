// 運行情報。推定を終わらせるためのもの。
//
// アプリは震度から「止まっている見込み・再開まで 1〜5 時間」と出す。
// だが実際に再開したことを知る術が無く、推定の上限まで「止まっている」と言い続ける。
// 逆向きの失敗で、不要な宿を取らせる。→ vault/シミュレーション.md
//
// 鉄道会社の運行情報が「平常」と言っているなら、推定は捨てる。
// 「見合わせ」と言っているなら、推定は裏付けられる。
//
// 取り方は 2 つ。ODPT_KEYS があればブラウザから直接、ODPT_PROXY があれば中継経由。
// どちらも無ければ何もしない。アプリは推定だけで動く。
// 直接叩くと鍵が公開されるが、テスト用途なのでそれを選んだ。→ endpoints.js

import { ODPT_KEYS, ODPT_PROXY } from './endpoints.js'

/**
 * 'stopped'  運転見合わせ・運休
 * 'delayed'  遅れ
 * 'normal'   平常
 * 'unknown'  文面から読めない
 * @typedef {'stopped'|'delayed'|'normal'|'unknown'} OperatorStatus
 */

/**
 * @typedef {object} TrainInfo
 * @property {string} railway  odpt.Railway ID。対応表の系統 ID と一致する。
 * @property {OperatorStatus} status
 * @property {string|null} text  事業者の文面 (日本語)。
 * @property {string|null} textEn
 * @property {string|null} updated
 */

/**
 * 事業者の文面を 4 つに分ける。
 *
 * ODPT の trainInformationStatus は無いことが多く、文面で判断するしかない。
 * 語を拾うだけでは足りない。実データで 2 つ間違えた。
 *
 * - 「大雨予報に伴い、運休が発生する可能性があります」を「止まっている」と読んだ。
 *   予報であって現在の状態ではない。地震の推定をこれで上書きしたら事故になる
 * - 「１５分以上の遅延はありません」を「遅れ」と読んだ。否定を見ていなかった
 *
 * **現在形の事実だけを拾う。** 予報・可能性・否定は事実ではない。
 * 読めないものは unknown にして、推定を上書きしない。上書きしない方が安全側。
 *
 * @param {string|null} status
 * @param {string|null} text
 * @returns {OperatorStatus}
 */
export function classify(status, text) {
  const t = `${status ?? ''} ${text ?? ''}`

  // 否定。「遅延はありません」「見合わせはありません」は平常。
  if (/(遅延|遅れ|運休|見合わせ)(は|も)(ありません|ございません|発生していません)/.test(t)) return 'normal'

  // 予報・可能性。いまの状態を言っていない。
  // ただし「平常」と明言していればそれを取る (注意喚起を添えた平常運転がある)。
  if (/可能性|場合があります|おそれ|予報|見込み|予定です|ご注意ください/.test(t)) {
    return /平常|通常/.test(t) ? 'normal' : 'unknown'
  }

  // 現在形の事実。
  if (/見合わせ(てい|ており|中)|運休(してい|しており|中)|運転を中止し|不通/.test(t)) return 'stopped'
  if (/遅れ(が出|てい|ており)|遅延(が発生|してい|しており)|乱れ(てい|ており)/.test(t)) return 'delayed'
  if (/平常|通常/.test(t)) return 'normal'
  return 'unknown'
}

/** ODPT の生データ 1 件を、アプリが要る形に削る。 */
function pack(it) {
  const railway = it['odpt:railway']
  if (!railway) return null
  return {
    railway,
    status: classify(it['odpt:trainInformationStatus']?.ja, it['odpt:trainInformationText']?.ja),
    text: it['odpt:trainInformationText']?.ja ?? null,
    textEn: it['odpt:trainInformationText']?.en ?? null,
    updated: it['dc:date'] ?? null,
  }
}

/**
 * 運行情報を取る。取れなければ空。
 * 失敗を投げない。運行情報は補助で、無くてもアプリは推定で動く。
 *
 * @returns {Promise<Map<string, TrainInfo>>}
 */
export async function loadTrainInfo() {
  /** @type {Map<string, TrainInfo>} */
  const out = new Map()

  // 中継経由。鍵はあちら側にある。
  if (ODPT_PROXY) {
    try {
      const res = await fetch(`${ODPT_PROXY.replace(/\/$/, '')}/train-info`)
      if (res.ok) {
        const { items } = await res.json()
        for (const it of items ?? []) {
          out.set(it.railway, {
            railway: it.railway,
            status: classify(it.status, it.text?.ja),
            text: it.text?.ja ?? null,
            textEn: it.text?.en ?? null,
            updated: it.updated ?? null,
          })
        }
      }
    } catch {
      // 圏外か中継先が落ちている。
    }
    return out
  }

  // 直接。2 つのエンドポイントを並行して取り、先に見た方を残す。
  await Promise.all(
    ODPT_KEYS.map(async ({ base, key }) => {
      try {
        const res = await fetch(
          `${base}/odpt:TrainInformation?acl:consumerKey=${encodeURIComponent(key)}`,
        )
        if (!res.ok) return
        for (const it of await res.json()) {
          const packed = pack(it)
          if (packed && !out.has(packed.railway)) out.set(packed.railway, packed)
        }
      } catch {
        // 片方が落ちていても、もう片方の分は使う。
      }
    }),
  )
  return out
}
