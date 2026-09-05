// 震度観測点マスタを生成する。
//
// P2P地震情報 API v2 の points[] は (pref, addr) の文字列しか持たないため、
// 座標を与える辞書がないと震度を地図にも路線にも載せられない。
// ここで作る 2 ファイルがその辞書になる。
//
//   shindo-stations.json : 観測点 4,360 点 (addr → 緯度経度)   … DetailScale 用
//   shindo-areas.json    : 細分区域 188 区域 (代表点は所属観測点の重心) … ScalePrompt 用
//
// 出典は気象庁「震度観測点一覧表」。現状は更新の追従が楽な公開ミラー(JSON)から取るが、
// 一覧表そのものが一次情報なので、ミラーが止まったら気象庁 CSV から作り直せばよい。
// https://www.data.jma.go.jp/eqev/data/kyoshin/jma-shindo.html

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SOURCE =
  'https://gist.githubusercontent.com/iku55/79005d1896631ad6117bbe327b8162c1/raw/stations.json'
const SOURCE_NOTE = '気象庁「震度観測点一覧表」由来の公開ミラー'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

// affi は 3 種類しかないので、配列に落として 1 文字で持つ。
const AFFILIATIONS = ['気象庁', '地方公共団体', '防災科学技術研究所']

const round = (n, digits) => Number(n.toFixed(digits))

async function main() {
  const res = await fetch(SOURCE)
  if (!res.ok) throw new Error(`source fetch failed: ${res.status} ${res.statusText}`)
  const raw = await res.json()
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('source is not a non-empty array')

  const stations = []
  const seen = new Set()

  for (const s of raw) {
    const pref = s.pref?.name
    const name = s.name
    const lat = Number(s.lat)
    const lon = Number(s.lon)

    // 座標を持たない行は辞書として使えないので落とす。落とした数は最後に報告する。
    if (!pref || !name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    // 緯度経度が日本の範囲外なら出典側の壊れた行とみなす。
    if (lat < 20 || lat > 46 || lon < 122 || lon > 154) continue

    // P2P の points[] は (pref, addr) で引くので、この組が一意でないと辞書が成立しない。
    const key = `${pref}\u0000${name}`
    if (seen.has(key)) throw new Error(`duplicate station key: ${pref} ${name}`)
    seen.add(key)

    stations.push({
      pref,
      name,
      lat: round(lat, 4),
      lon: round(lon, 4),
      cityCode: s.city?.code ?? null,
      cityName: s.city?.name ?? null,
      areaCode: s.area?.code ?? null,
      areaName: s.area?.name ?? null,
      affi: Math.max(0, AFFILIATIONS.indexOf(s.affi)),
    })
  }

  if (stations.length < 4000) {
    throw new Error(`only ${stations.length} usable stations — source likely changed`)
  }

  // 細分区域の代表点。区域ポリゴンは配布サイズが大きいので、
  // 所属観測点の重心と bbox で代用する。速報(ScalePrompt)は区域単位でしか来ないため、
  // 「この区域のどこか」を示せれば足りる。
  const areaMap = new Map()
  for (const s of stations) {
    if (!s.areaCode) continue
    let a = areaMap.get(s.areaCode)
    if (!a) {
      a = { code: s.areaCode, name: s.areaName, pref: s.pref, lats: [], lons: [] }
      areaMap.set(s.areaCode, a)
    }
    a.lats.push(s.lat)
    a.lons.push(s.lon)
  }

  const areas = [...areaMap.values()]
    .map((a) => ({
      code: a.code,
      name: a.name,
      pref: a.pref,
      lat: round(a.lats.reduce((x, y) => x + y, 0) / a.lats.length, 4),
      lon: round(a.lons.reduce((x, y) => x + y, 0) / a.lons.length, 4),
      bbox: [
        round(Math.min(...a.lons), 4),
        round(Math.min(...a.lats), 4),
        round(Math.max(...a.lons), 4),
        round(Math.max(...a.lats), 4),
      ],
      stationCount: a.lats.length,
    }))
    .sort((x, y) => x.code.localeCompare(y.code))

  // 区域名は P2P の isArea:true の addr と突き合わせる唯一のキーなので、重複は致命的。
  const areaNames = new Set(areas.map((a) => a.name))
  if (areaNames.size !== areas.length) throw new Error('area names are not unique')

  const generatedAt = new Date().toISOString()
  const meta = { generatedAt, source: SOURCE, sourceNote: SOURCE_NOTE, affiliations: AFFILIATIONS }

  await mkdir(outDir, { recursive: true })
  await writeFile(
    join(outDir, 'shindo-stations.json'),
    JSON.stringify({ ...meta, count: stations.length, stations }),
  )
  await writeFile(
    join(outDir, 'shindo-areas.json'),
    JSON.stringify({ ...meta, count: areas.length, areas }),
  )

  console.log(`stations: ${stations.length} (dropped ${raw.length - stations.length})`)
  console.log(`areas:    ${areas.length}`)
  console.log(`out:      ${outDir}`)
}

await main()
