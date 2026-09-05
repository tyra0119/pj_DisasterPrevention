// ZIP から必要なエントリだけ取り出す最小実装。
// 国土数値情報は ZIP でしか配られないが、そのために依存を増やしたくない。
// deflate と無圧縮だけ扱う (国土数値情報の配布物はこの 2 つで足りる)。

import { inflateRawSync } from 'node:zlib'

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50

function findEocd(buf) {
  // コメント長は最大 65535。末尾から署名を探す。
  const start = Math.max(0, buf.length - 65535 - 22)
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i
  }
  throw new Error('not a zip: end-of-central-directory not found')
}

/** ZIP 内のエントリ一覧を返す。 */
export function listEntries(buf) {
  const eocd = findEocd(buf)
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)

  const entries = []
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error(`corrupt central directory at ${p}`)
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    entries.push({ name, method, size, compressedSize, localOffset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/** 1 エントリを展開して Buffer で返す。 */
export function readEntry(buf, entry) {
  const p = entry.localOffset
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error(`corrupt local header for ${entry.name}`)
  const nameLen = buf.readUInt16LE(p + 26)
  const extraLen = buf.readUInt16LE(p + 28)
  const start = p + 30 + nameLen + extraLen
  const raw = buf.subarray(start, start + entry.compressedSize)

  if (entry.method === 0) return Buffer.from(raw)
  if (entry.method === 8) return inflateRawSync(raw)
  throw new Error(`unsupported compression method ${entry.method} for ${entry.name}`)
}

/** 名前で 1 エントリを取り出す。 */
export function extract(buf, name) {
  const entry = listEntries(buf).find((e) => e.name === name)
  if (!entry) throw new Error(`entry not found: ${name}`)
  return readEntry(buf, entry)
}
