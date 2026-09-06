// 一時滞在施設（帰宅困難者向け）を生成する。
//
// 指定緊急避難場所とは別物。あちらは「建物が危ないときに逃げる先」、
// こちらは **「帰れない人が一時的に休む場所」**。このアプリのゴールに直結する。
// → vault/ゴール.md
//
// 出典は東京都オープンデータカタログ。全国で揃うデータは無く、
// 機械可読で出しているのは都と一部の区だけ。**関東しか埋まらない。**
// 揃っていないことは画面で言う。黙って空にすると「近くに無い」と読まれる。
//
// 座標は都のデータに入っていないので、国土地理院のジオコーダで補う。
// ビルド時に一度引いて同梱する。実行時に 200 回叩かせない。
// https://msearch.gsi.go.jp/

import { writeFile, mkdir, readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readSheet } from './lib/xlsx.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'data')
const cacheDir = join(root, '.cache')

const GEOCODER = 'https://msearch.gsi.go.jp/address-search/AddressSearch'

/**
 * 取得元。機械可読で座標か住所が付いているものだけ。
 * 区の多くは HTML か PDF でしか出しておらず、そこは拾えない。
 */
const SOURCES = [
  {
    id: 'tokyo-metro',
    name: '東京都（都立の一時滞在施設）',
    url: 'https://www.opendata.metro.tokyo.lg.jp/soumu/130001_temporary_public_evacuation.xlsx',
    kind: 'xlsx',
    // 番号 / 施設名称 / 所在地
    columns: { name: 1, address: 2 },
    prefix: '東京都',
  },
  {
    id: 'shinagawa',
    name: '品川区',
    url: 'https://www.opendata.metro.tokyo.lg.jp/shinagawa/ichijitaizaishisetsuichiran.csv',
    kind: 'csv',
    encoding: 'shift_jis',
    columns: { name: '施設名称', address: '住所', lat: '緯度', lon: '経度' },
    prefix: '東京都',
  },
]

async function fetchBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

/** 住所 → 座標。引けた結果は貯めて、作り直しのたびに叩かない。 */
async function loadGeocodeCache() {
  try {
    return JSON.parse(await readFile(join(cacheDir, 'geocode.json'), 'utf8'))
  } catch {
    return {}
  }
}

async function geocode(address, cache) {
  if (cache[address] !== undefined) return cache[address]
  try {
    const res = await fetch(`${GEOCODER}?q=${encodeURIComponent(address)}`)
    if (!res.ok) throw new Error(String(res.status))
    const hits = await res.json()
    const coords = hits?.[0]?.geometry?.coordinates
    cache[address] = Array.isArray(coords) ? { lat: coords[1], lon: coords[0] } : null
  } catch {
    // 引けなかったものは null で覚えず、次回また試す。
    return null
  }
  // 相手は公共のサービス。連続で叩かない。
  await new Promise((r) => setTimeout(r, 120))
  return cache[address]
}

/**
 * CSV を読む。引用符の中のカンマを割らない。
 * 素朴に split(',') したら「"品川区広町2丁目1番36号"」で行がずれ、
 * 住所の途中が施設名になっていた。
 */
function parseCsv(text) {
  const LF = 10
  const CR = 13
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const code = text.charCodeAt(i)

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }

    if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (code === LF || code === CR) {
      if (field !== '' || row.length) {
        row.push(field)
        rows.push(row)
        row = []
        field = ''
      }
      if (code === CR && text.charCodeAt(i + 1) === LF) i++
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }

  const header = (rows.shift() ?? []).map((h) => h.trim())
  return rows.map((cells) => Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()])))
}

/** 日本の範囲に収まるか。空欄は Number('') が 0 になるので、有限かどうかでは足りない。 */
const inJapan = (lat, lon) =>
  Number.isFinite(lat) && Number.isFinite(lon) && lat > 20 && lat < 46 && lon > 122 && lon < 154

async function collect(source) {
  const buf = await fetchBuffer(source.url)
  const out = []

  if (source.kind === 'xlsx') {
    const rows = readSheet(buf)
    for (const row of rows) {
      const name = (row[source.columns.name] ?? '').trim()
      const address = (row[source.columns.address] ?? '').trim()
      // 見出し行や注記行を弾く。住所は必ず数字を含む。
      if (!name || !address || !/\d/.test(address)) continue
      if (name.includes('施設名')) continue
      out.push({ name, address })
    }
  } else {
    const text = new TextDecoder(source.encoding ?? 'utf-8').decode(buf)
    for (const row of parseCsv(text)) {
      const name = row[source.columns.name]
      const address = row[source.columns.address]
      if (!name || !address) continue
      const lat = Number(row[source.columns.lat])
      const lon = Number(row[source.columns.lon])
      out.push({ name, address, ...(inJapan(lat, lon) ? { lat, lon } : {}) })
    }
  }
  return out
}

async function main() {
  const cache = await loadGeocodeCache()
  const shelters = []
  const sources = []

  for (const source of SOURCES) {
    let rows = []
    try {
      rows = await collect(source)
    } catch (err) {
      console.log(`  ${source.name}: 取得に失敗 (${err.message})`)
      sources.push({ id: source.id, name: source.name, count: 0, failed: true })
      continue
    }

    let located = 0
    for (const row of rows) {
      let { lat, lon } = row
      if (!inJapan(lat, lon)) {
        // 住所しか無いものは地理院のジオコーダで引く。
        const hit = await geocode(`${source.prefix}${row.address}`, cache)
        if (!hit || !inJapan(hit.lat, hit.lon)) continue
        lat = hit.lat
        lon = hit.lon
      }
      located++
      shelters.push({
        name: row.name,
        address: `${source.prefix}${row.address}`.replace(/^東京都東京都/, '東京都'),
        lat: Number(lat.toFixed(5)),
        lon: Number(lon.toFixed(5)),
        source: source.id,
      })
    }
    console.log(`  ${source.name}: ${located}/${rows.length}`)
    sources.push({ id: source.id, name: source.name, count: located })
  }

  if (shelters.length === 0) throw new Error('一時滞在施設を 1 件も取得できなかった')

  await mkdir(cacheDir, { recursive: true })
  await writeFile(join(cacheDir, 'geocode.json'), JSON.stringify(cache, null, 1))

  // どこまで覆えているかを画面で言うために、収録範囲を持たせる。
  const prefectures = [...new Set(shelters.map((s) => s.address.slice(0, 3)))]

  await mkdir(outDir, { recursive: true })
  await writeFile(
    join(outDir, 'temp-shelters.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      note: '帰宅困難者向けの一時滞在施設。開設状況は含まない。収録は東京都の公開分のみ。',
      sources,
      coverage: prefectures,
      count: shelters.length,
      shelters,
    }),
  )

  console.log(`一時滞在施設 ${shelters.length} 件  収録: ${prefectures.join(' ')}`)
  console.log(`out: ${join(outDir, 'temp-shelters.json')}`)
}

await main()
