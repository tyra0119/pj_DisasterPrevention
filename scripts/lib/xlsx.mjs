// XLSX から表を読む最小実装。
//
// 東京都の一時滞在施設は XLSX でしか配られていない。そのために依存を増やしたくない。
// XLSX は ZIP + XML なので、既にある unzip.mjs で開けば読める。
//
// ふりがなに注意。<si> の中には本文の <t> と、ふりがなの <rPh><t> が並ぶ。
// 素朴に全部の <t> をつなぐと「千代田都税事務所チヨダトゼイジムショ」になる。
// <rPh> を先に落としてから読む。

import { listEntries, readEntry } from './unzip.mjs'

const decodeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

/** 列参照 (A, B, ... AA) を 0 始まりの添字に。 */
function columnIndex(ref) {
  let n = 0
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * 最初のシートを行の配列として返す。空セルは undefined のまま残す。
 * @param {Buffer} buf  xlsx のバイト列
 * @returns {string[][]}
 */
export function readSheet(buf) {
  const entries = listEntries(buf)
  const read = (name) => {
    const entry = entries.find((e) => e.name === name)
    return entry ? readEntry(buf, entry).toString('utf8') : ''
  }

  // 共有文字列。ふりがな (<rPh>) は本文ではないので先に落とす。
  const sharedXml = read('xl/sharedStrings.xml')
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decodeXml(
      [...m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
        .map((x) => x[1])
        .join(''),
    ),
  )

  const sheetName =
    entries.map((e) => e.name).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)) ?? ''
  const sheet = read(sheetName)

  const rows = []
  for (const rowMatch of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = []
    for (const cellMatch of rowMatch[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1]
      const body = cellMatch[2] ?? ''
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1]
      const type = /t="(\w+)"/.exec(attrs)?.[1]
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
      const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1]

      const value =
        type === 's' && v != null ? (shared[Number(v)] ?? '') : (inline ?? v ?? '')
      if (ref) cells[columnIndex(ref)] = decodeXml(String(value))
    }
    rows.push(cells)
  }
  return rows
}
