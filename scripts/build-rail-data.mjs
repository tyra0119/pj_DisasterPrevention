// 路線マスタを生成する。
//
// 震度を路線に割り当てるには、路線ごとに「どこを通っているか」の座標列が要る。
// 国土数値情報 鉄道データ (N02) から、路線単位で駅と線形をまとめる。
//
// 出典: 国土数値情報（鉄道データ）国土交通省 — CC BY 4.0
// https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2024.html

import { writeFile, mkdir, readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extract } from './lib/unzip.mjs'

const EDITION = 'N02-25'
const SOURCE = `https://nlftp.mlit.go.jp/ksj/gml/data/N02/${EDITION}/${EDITION}_GML.zip`
const LICENSE = '国土数値情報（鉄道データ）国土交通省 CC BY 4.0'

// 事業者種別コード (InstitutionTypeCd)。添字がコード値。
const OPERATOR_TYPES = ['', 'JRの新幹線', 'JR在来線', '公営鉄道', '民営鉄道', '第三セクター']

// 線形の間引き幅。約 2km 相当のセルに落として 1 点だけ残す。
// 震度の判定半径が 20km なので、これ以上細かく持っても結論は変わらない。
const TRACK_CELL_DEG = 0.02

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, '.cache')
const outDir = join(root, 'data')

const round = (n) => Number(n.toFixed(4))

// 徒歩点検の所要時間は点検区間長に比例する (高浜・翠川 2011)。
// 路線長を持っておかないと待ち時間が出せないので、間引く前の頂点から測る。
const EARTH_RADIUS_KM = 6371
const toRad = (deg) => (deg * Math.PI) / 180
function segmentKm(aLat, aLon, bLat, bLon) {
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRad(aLat)) * Math.cos(toRad(bLat))
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** 路線 ID。路線が増減しても他の ID がずれないよう、名前から決める。 */
function lineId(operator, name) {
  let h = 0x811c9dc5
  for (const ch of `${operator}|${name}`) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

async function loadZip() {
  const cached = join(cacheDir, `${EDITION}_GML.zip`)
  try {
    await stat(cached)
    return readFile(cached)
  } catch {
    // 未取得のときだけ落とす。15MB あるので毎回は取りに行かない。
  }
  console.log(`downloading ${SOURCE}`)
  const res = await fetch(SOURCE)
  if (!res.ok) throw new Error(`N02 fetch failed: ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await mkdir(cacheDir, { recursive: true })
  await writeFile(cached, buf)
  return buf
}

const readGeoJson = (zip, kind) =>
  JSON.parse(extract(zip, `${EDITION}_GML/UTF-8/${EDITION}_${kind}.geojson`).toString('utf8'))

/** LineString / MultiLineString から座標を平坦に取り出す。 */
function* vertices(geometry) {
  if (!geometry) return
  if (geometry.type === 'LineString') yield* geometry.coordinates
  else if (geometry.type === 'MultiLineString') for (const part of geometry.coordinates) yield* part
}

async function main() {
  const zip = await loadZip()
  const stationFeatures = readGeoJson(zip, 'Station').features
  const sectionFeatures = readGeoJson(zip, 'RailroadSection').features
  console.log(`source: ${stationFeatures.length} station features, ${sectionFeatures.length} sections`)

  /** @type {Map<string, {operator:string,name:string,operatorType:number,stations:Map<string,{name:string,lats:number[],lons:number[]}>,track:Map<string,[number,number]>}>} */
  const lines = new Map()

  const lineOf = (props) => {
    const operator = props.N02_004
    const name = props.N02_003
    const key = `${operator}\u0000${name}`
    let line = lines.get(key)
    if (!line) {
      line = {
        operator,
        name,
        operatorType: Number(props.N02_002) || 0,
        stations: new Map(),
        track: new Map(),
        lengthKm: 0,
      }
      lines.set(key, line)
    }
    return line
  }

  // --- 駅 ---------------------------------------------------------------
  // N02 の駅はホーム中心線の LineString で、同じ駅が番線ごとに複数入っている。
  // 駅コード (N02_005c) でまとめ、全頂点の重心を代表点にする。
  for (const f of stationFeatures) {
    const p = f.properties
    const line = lineOf(p)
    const code = p.N02_005c
    let st = line.stations.get(code)
    if (!st) {
      st = { name: p.N02_005, lats: [], lons: [] }
      line.stations.set(code, st)
    }
    for (const [lon, lat] of vertices(f.geometry)) {
      st.lats.push(lat)
      st.lons.push(lon)
    }
  }

  // --- 線形 -------------------------------------------------------------
  // 駅だけだと、駅間が数十 km ある路線 (北海道・山陰など) で判定に穴が空く。
  // 区間の頂点を約 2km 格子に間引いて足しておく。
  for (const f of sectionFeatures) {
    const line = lineOf(f.properties)
    let prev = null
    for (const [lon, lat] of vertices(f.geometry)) {
      // 路線長は間引く前の頂点で測る。区間が複数レコードに分かれていても、
      // レコードごとに足し合わせれば全長になる。
      if (prev) line.lengthKm += segmentKm(prev[0], prev[1], lat, lon)
      prev = [lat, lon]

      const key = `${Math.round(lat / TRACK_CELL_DEG)}:${Math.round(lon / TRACK_CELL_DEG)}`
      if (!line.track.has(key)) line.track.set(key, [round(lat), round(lon)])
    }
  }

  const out = [...lines.values()]
    .map((line) => {
      const stations = [...line.stations.entries()]
        .map(([code, s]) => ({
          code,
          name: s.name,
          lat: round(s.lats.reduce((a, b) => a + b, 0) / s.lats.length),
          lon: round(s.lons.reduce((a, b) => a + b, 0) / s.lons.length),
        }))
        .sort((a, b) => a.code.localeCompare(b.code))

      return {
        id: lineId(line.operator, line.name),
        operator: line.operator,
        name: line.name,
        operatorType: line.operatorType,
        lengthKm: Number(line.lengthKm.toFixed(1)),
        stations,
        track: [...line.track.values()],
      }
    })
    // 駅のない「路線」は N02 側の事業者名と路線名が入れ替わった行などの残骸で、
    // 乗客に提示できないので落とす。
    .filter((l) => l.stations.length > 0)
    .sort((a, b) => a.operator.localeCompare(b.operator, 'ja') || a.name.localeCompare(b.name, 'ja'))

  const ids = new Set(out.map((l) => l.id))
  if (ids.size !== out.length) throw new Error('line id collision — change the hash')

  const totalStations = out.reduce((n, l) => n + l.stations.length, 0)
  const totalTrack = out.reduce((n, l) => n + l.track.length, 0)
  if (out.length < 500 || totalStations < 8000) {
    throw new Error(`only ${out.length} lines / ${totalStations} stations — source likely changed`)
  }

  await mkdir(outDir, { recursive: true })
  await writeFile(
    join(outDir, 'rail-lines.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: SOURCE,
      edition: EDITION,
      license: LICENSE,
      operatorTypes: OPERATOR_TYPES,
      count: out.length,
      lines: out,
    }),
  )

  const totalKm = out.reduce((n, l) => n + l.lengthKm, 0)
  console.log(
    `lines: ${out.length}  stations: ${totalStations}  track points: ${totalTrack}` +
      `  total: ${Math.round(totalKm).toLocaleString()}km`,
  )
  console.log(`out:   ${join(outDir, 'rail-lines.json')}`)
}

await main()
