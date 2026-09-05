// 地図。地理院タイルを並べるだけの小さな部品。
//
// 地図ライブラリは入れない。ビルド工程が無いので CDN から読むことになり、
// 圏外だと読めずに地図ごと消える。地震のあとに一番効いてほしい場面で消える。
// 必要なのは「震源はどっちか」「避難場所はどっちか」であって、
// 自由に動かせる地図ではない。タイルを並べて印を置けば足りる。
//
// タイルは地理院タイル（国土地理院）。出典表示が要る。
// https://maps.gsi.go.jp/development/ichiran.html
//
// 幅は描いてからでないと分からない。文字列を組み立てる時点で決め打つと、
// 画面が狭い端末で右側が切れて、肝心の印が画面外に出る。
// 先に枠だけ置き、描画後に実寸を測ってから中身を入れる。

const TILE = 256
const TILE_URL = (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/pale/${z}/${x}/${y}.png`

/** 経度 → ワールド座標(px)。 */
const lonToX = (lon, size) => ((lon + 180) / 360) * size

/** 緯度 → ワールド座標(px)。メルカトル。 */
function latToY(lat, size) {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * size
}

/**
 * @typedef {object} Marker
 * @property {number} lat
 * @property {number} lon
 * @property {string} kind  CSS クラスになる。'quake' | 'me' | 'shelter'
 * @property {string} [label]  印に添える短い文字。
 */

/**
 * 地図の枠だけを返す。中身は paintMaps が入れる。
 *
 * @param {object} spec
 * @param {{lat:number, lon:number}} spec.center
 * @param {Marker[]} spec.markers
 * @param {string} spec.note  出典表示。
 * @param {number} [spec.height]
 * @param {{lat:number, lon:number}[]} [spec.fit]  全部が入る縮尺を選ぶ。
 * @param {number} [spec.zoom]  fit を渡さないときの縮尺。
 */
export function mapFrame(spec) {
  const height = spec.height ?? 220
  const config = {
    center: spec.center,
    markers: spec.markers,
    fit: spec.fit ?? null,
    zoom: spec.zoom ?? 12,
    height,
  }
  // 属性に入れるので " を潰しておく。中身は自前のデータで、外から来ない。
  const json = JSON.stringify(config).replace(/"/g, '&quot;')
  return `<div class="map" style="height:${height}px" data-map="${json}">
    <div class="map-inner"></div>
    <span class="map-note">${spec.note}</span>
  </div>`
}

/** 全部の点が入る縮尺。端に貼りつかないよう内側に余白を取る。 */
function zoomToFit(points, width, height) {
  for (let z = 15; z >= 4; z--) {
    const size = TILE * 2 ** z
    const xs = points.map((p) => lonToX(p.lon, size))
    const ys = points.map((p) => latToY(p.lat, size))
    const dx = Math.max(...xs) - Math.min(...xs)
    const dy = Math.max(...ys) - Math.min(...ys)
    if (dx < width * 0.72 && dy < height * 0.72) return z
  }
  return 4
}

/** 点の集まりの中心。 */
function centerOf(points) {
  return {
    lat: (Math.min(...points.map((p) => p.lat)) + Math.max(...points.map((p) => p.lat))) / 2,
    lon: (Math.min(...points.map((p) => p.lon)) + Math.max(...points.map((p) => p.lon))) / 2,
  }
}

/** 描画後に呼ぶ。枠の実寸を測ってタイルと印を入れる。 */
export function paintMaps(root = document) {
  for (const el of root.querySelectorAll('.map[data-map]')) {
    const spec = JSON.parse(el.dataset.map)
    const width = el.clientWidth
    const height = spec.height
    if (!width) continue

    const points = spec.fit && spec.fit.length ? spec.fit : [spec.center]
    const zoom = spec.fit && spec.fit.length > 1 ? zoomToFit(points, width, height) : spec.zoom
    const center = spec.fit && spec.fit.length > 1 ? centerOf(points) : spec.center

    const size = TILE * 2 ** zoom
    const left = lonToX(center.lon, size) - width / 2
    const top = latToY(center.lat, size) - height / 2

    const x0 = Math.floor(left / TILE)
    const x1 = Math.floor((left + width) / TILE)
    const y0 = Math.floor(top / TILE)
    const y1 = Math.floor((top + height) / TILE)
    const max = 2 ** zoom

    const parts = []
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        // 縦は世界の外に出たら描かない。横は一周するので回り込ませる。
        if (y < 0 || y >= max) continue
        const wrapped = ((x % max) + max) % max
        parts.push(
          `<img src="${TILE_URL(zoom, wrapped, y)}" alt="" loading="lazy" draggable="false"` +
            ` style="left:${x * TILE - left}px;top:${y * TILE - top}px">`,
        )
      }
    }

    for (const m of spec.markers) {
      const px = lonToX(m.lon, size) - left
      const py = latToY(m.lat, size) - top
      // 画面の外の印は描かない。端に潰れて意味を失う。
      if (px < -20 || py < -20 || px > width + 20 || py > height + 20) continue
      parts.push(
        `<span class="pin pin-${m.kind}" style="left:${px}px;top:${py}px">` +
          `${m.label ? `<b>${m.label}</b>` : ''}</span>`,
      )
    }

    el.querySelector('.map-inner').innerHTML = parts.join('')
  }
}
