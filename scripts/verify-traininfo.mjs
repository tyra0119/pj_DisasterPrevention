// 運行情報の取得と分類を確かめる。
//   1. 2 つのエンドポイントから何系統ぶん取れるか
//   2. 文面の分類 (平常 / 遅れ / 見合わせ / 不明) の分布
//   3. 対応表の系統 ID とどれだけ突き合うか
//
// 鍵は .env.local から読む (ビルド系のスクリプトと同じ)。
// ブラウザ側は src/app/endpoints.js に貼った鍵で同じことをする。

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { classify } from '../src/app/train-info.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const env = {}
try {
  for (const line of (await readFile(join(root, '.env.local'), 'utf8')).split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m && m[2].trim()) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {
  console.log('.env.local が無い。鍵無しでは運行情報は取れない')
  process.exit(1)
}

const SOURCES = [
  { name: 'api.odpt.org', base: 'https://api.odpt.org/api/v4', key: env.ODPT_KEY },
  { name: 'api-challenge.odpt.org', base: 'https://api-challenge.odpt.org/api/v4', key: env.ODPT_CHALLENGE_KEY },
].filter((s) => s.key)

const lineMap = JSON.parse(await readFile(join(root, 'data/line-map.json'), 'utf8'))
const known = new Set(lineMap.systems.map((s) => s.id))

const items = new Map()
for (const s of SOURCES) {
  const res = await fetch(`${s.base}/odpt:TrainInformation?acl:consumerKey=${encodeURIComponent(s.key)}`)
  const list = res.ok ? await res.json() : []
  let added = 0
  for (const it of list) {
    const railway = it['odpt:railway']
    if (!railway || items.has(railway)) continue
    items.set(railway, it)
    added++
  }
  console.log(`${s.name.padEnd(26)} HTTP ${res.status}  ${list.length} 件 (新規 ${added})`)
}

const dist = {}
let matched = 0
const samples = {}
for (const [railway, it] of items) {
  const st = classify(it['odpt:trainInformationStatus']?.ja, it['odpt:trainInformationText']?.ja)
  dist[st] = (dist[st] ?? 0) + 1
  if (known.has(railway)) matched++
  if (!samples[st]) samples[st] = { railway, text: it['odpt:trainInformationText']?.ja }
}

console.log(`\n運行情報 ${items.size} 系統  対応表と突き合う ${matched}`)
console.log('分類:', dist)
console.log('\n--- 分類ごとの文面の例 ---')
for (const [st, ex] of Object.entries(samples)) {
  console.log(`  ${st.padEnd(8)} ${ex.railway.padEnd(40)} ${(ex.text ?? '').slice(0, 60)}`)
}
if (dist.unknown) {
  console.log('\n--- 不明に落ちた文面 (分類の語彙を増やす材料) ---')
  for (const [railway, it] of items) {
    const st = classify(it['odpt:trainInformationStatus']?.ja, it['odpt:trainInformationText']?.ja)
    if (st === 'unknown') console.log(`  ${railway.padEnd(40)} ${(it['odpt:trainInformationText']?.ja ?? '(文面なし)').slice(0, 70)}`)
  }
}
