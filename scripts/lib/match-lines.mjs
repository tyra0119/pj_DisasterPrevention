// 運転系統 → N02 路線 の照合。
//
// ODPT の運行情報は運転系統単位、N02 は線路名称単位で、名前は一致しない
// (ODPT「三田線」/ N02「6号線三田線」、ODPT「山手線」は N02 の 3 路線にまたがる)。
// 路線名では突き合わないので、駅の並びから機械的に決める。
//
// 手で対応表を書くと N02 の改版で静かに腐るが、駅から導けば
// 被覆率という形で壊れたことが分かる。

/** 駅名の表記ゆれを吸収する。全角半角・中黒・末尾の「駅」。 */
export const normalizeStationName = (s) =>
  s.normalize('NFKC').replace(/[\s・･]/g, '').replace(/駅$/, '')

const EARTH_RADIUS_KM = 6371
const toRad = (deg) => (deg * Math.PI) / 180

export function distanceKm(aLat, aLon, bLat, bLon) {
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRad(aLat)) * Math.cos(toRad(bLat))
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/**
 * N02 の駅を駅名で引ける索引にする。
 * @param {{lines: Array<{id:string,operator:string,name:string,stations:Array<{name:string,lat:number,lon:number}>}>}} railData
 */
export function indexStationsByName(railData) {
  /** @type {Map<string, Array<{name:string,lat:number,lon:number,lineId:string,operator:string,lineName:string}>>} */
  const byName = new Map()
  for (const line of railData.lines) {
    for (const st of line.stations) {
      const key = normalizeStationName(st.name)
      const bucket = byName.get(key)
      const entry = {
        name: st.name,
        lat: st.lat,
        lon: st.lon,
        lineId: line.id,
        operator: line.operator,
        lineName: line.name,
      }
      if (bucket) bucket.push(entry)
      else byName.set(key, [entry])
    }
  }
  return byName
}

/** 同名駅を全国から拾わないための距離上限。座標がある系統にだけ効く。 */
const MAX_MATCH_KM = 2.0
/** 貪欲被覆で 1 路線が新たに覆うべき最小駅数。1 にすると同名駅の偶然一致を拾う。 */
const MIN_GAIN = 2

/**
 * 1 つの運転系統に対応する N02 路線の集合を求める。
 *
 * 駅名で候補を挙げ、路線ごとに「この系統の駅を何駅覆うか」で投票し、
 * 貪欲に被覆を広げる。山手線のように 1 系統が複数の線路名称にまたがっても、
 * 覆う駅が多い順に必要な分だけ選ばれる。
 *
 * @param {{title:string, operator?:string, stations:Array<{name:string,lat?:number,lon?:number}>}} system
 * @param {ReturnType<typeof indexStationsByName>} byName
 */
export function matchSystem(system, byName) {
  /** @type {Map<string, Set<number>>} lineId → 覆った系統駅の添字 */
  const votes = new Map()
  /** @type {Array<Array<{lineId:string,operator:string,lineName:string}>>} */
  const perStation = system.stations.map(() => [])

  system.stations.forEach((s, i) => {
    for (const cand of byName.get(normalizeStationName(s.name)) ?? []) {
      // 事業者が分かっているなら、それ以外は見ない。同名駅の誤爆が一番減る。
      if (system.operator && cand.operator !== system.operator) continue
      if (s.lat != null && s.lon != null && distanceKm(s.lat, s.lon, cand.lat, cand.lon) > MAX_MATCH_KM) {
        continue
      }
      perStation[i].push(cand)
      const set = votes.get(cand.lineId)
      if (set) set.add(i)
      else votes.set(cand.lineId, new Set([i]))
    }
  })

  const chosen = []
  const covered = new Set()
  for (;;) {
    let best = null
    for (const [lineId, set] of votes) {
      if (chosen.some((c) => c.lineId === lineId)) continue
      let gain = 0
      for (const i of set) if (!covered.has(i)) gain++
      if (!best || gain > best.gain) best = { lineId, gain, set }
    }
    if (!best || best.gain < MIN_GAIN) break
    for (const i of best.set) covered.add(i)
    const sample = perStation[[...best.set][0]].find((x) => x.lineId === best.lineId)
    chosen.push({
      lineId: best.lineId,
      operator: sample.operator,
      lineName: sample.lineName,
      stations: best.gain,
    })
  }

  return {
    lineIds: chosen.map((c) => c.lineId),
    chosen,
    matchedStations: covered.size,
    totalStations: system.stations.length,
    // 覆えなかった駅は黙って捨てない。名前の改称や N02 の改版はここに出る。
    unmatched: system.stations.filter((_, i) => !covered.has(i)).map((s) => s.name),
  }
}
