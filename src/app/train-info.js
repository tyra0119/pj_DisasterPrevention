// 運行情報。推定を終わらせるためのもの。
//
// アプリは震度から「止まっている見込み・再開まで 1〜5 時間」と出す。
// だが実際に再開したことを知る術が無く、推定の上限まで「止まっている」と言い続ける。
// 逆向きの失敗で、不要な宿を取らせる。→ vault/シミュレーション.md
//
// 鉄道会社の運行情報が「平常」と言っているなら、推定は捨てる。
// 「見合わせ」と言っているなら、推定は裏付けられる。
//
// ODPT の鍵は静的サイトに置けないので、proxy/worker.js が中継する。
// 中継先が未設定なら何もしない。アプリは推定だけで動く。

import { ODPT_PROXY } from './endpoints.js'

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
 * 言い回しは会社ごとに違うが、見合わせ / 遅れ / 平常 の 3 語はほぼ共通。
 * @param {string|null} status
 * @param {string|null} text
 * @returns {OperatorStatus}
 */
export function classify(status, text) {
  const t = `${status ?? ''} ${text ?? ''}`
  if (/見合わせ|運休|運転を中止|不通/.test(t)) return 'stopped'
  if (/遅れ|遅延|ダイヤが乱れ/.test(t)) return 'delayed'
  if (/平常|通常/.test(t)) return 'normal'
  return 'unknown'
}

/**
 * 中継先から運行情報を取る。中継先が無いか失敗したら空。
 * 失敗を投げない。運行情報は補助で、無くてもアプリは推定で動く。
 *
 * @returns {Promise<Map<string, TrainInfo>>}
 */
export async function loadTrainInfo() {
  /** @type {Map<string, TrainInfo>} */
  const out = new Map()
  if (!ODPT_PROXY) return out
  try {
    const res = await fetch(`${ODPT_PROXY.replace(/\/$/, '')}/train-info`)
    if (!res.ok) return out
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
  } catch {
    // 圏外か中継先が落ちている。推定だけで動く。
  }
  return out
}
