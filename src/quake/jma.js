// 震源地名の英語表記。
//
// P2P地震情報は震源地名を日本語でしか持たない。読み手は訪日外国人なので、
// 「千葉県北西部」と出しても意味が通らない。
//
// 気象庁が自サイト向けに出している一覧が `anm`（日本語）と `en_anm`（英語）を
// 両方持っている。鍵なし・CORS 開放・max-age=60。ここから対訳を拾う。
// https://www.jma.go.jp/bosai/quake/data/list.json
//
// 一覧に載るのは直近 400 件ほどなので、古い地震の震源地名は入っていないことがある。
// ただし地名そのものは繰り返し出てくるので、**見かけた対訳は貯めておく**。
// 使うほど当たるようになる。引けなければ日本語のまま出す。

const ENDPOINT = 'https://www.jma.go.jp/bosai/quake/data/list.json'
const STORE_KEY = 'hypocenter-en'
/** 貯めすぎても意味がないので上限を切る。地震情報の細分地名は 700 ほど。 */
const MAX_ENTRIES = 1000

/** @type {Map<string, string>} 日本語の震源地名 → 英語 */
let names = new Map()

function restore() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) names = new Map(Object.entries(JSON.parse(raw)))
  } catch {
    // 読めなくても、取得できれば埋まる。
  }
}

function persist() {
  try {
    const trimmed = [...names].slice(-MAX_ENTRIES)
    localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(trimmed)))
  } catch {
    // 書けない環境ではその場限りの辞書になる。動作に必須ではない。
  }
}

/**
 * 気象庁の一覧から対訳を拾って貯める。
 * 失敗しても投げない。英語名が無いだけで、アプリは日本語名で動く。
 */
export async function refreshHypocenterNames(signal) {
  if (names.size === 0) restore()
  try {
    const res = await fetch(ENDPOINT, { signal })
    if (!res.ok) return names
    let added = 0
    for (const entry of await res.json()) {
      const ja = entry.anm
      const en = entry.en_anm
      if (!ja || !en || names.get(ja) === en) continue
      names.set(ja, en)
      added++
    }
    if (added > 0) persist()
  } catch {
    // 圏外なら貯めてある分で足りる。
  }
  return names
}

/**
 * 表示に使う震源地名。
 *
 * 日本語以外はすべて英語に寄せる。中国語・韓国語の対訳は手に入らないので、
 * 日本語のまま出すより英語の方が読める人が多い。
 *
 * @param {{name: string, nameEn?: string|null}} hypocenter
 * @param {'ja'|'en'|'zh'|'ko'} lang
 */
export function hypocenterName(hypocenter, lang) {
  if (lang === 'ja') return hypocenter.name
  return hypocenter.nameEn || names.get(hypocenter.name) || hypocenter.name
}
