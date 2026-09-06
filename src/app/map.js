// 地図。地理院タイルを並べる小さな部品。
//
// 地図ライブラリは入れない。ビルド工程が無いので CDN から読むことになり、
// 圏外だと読めずに地図ごと消える。地震のあとに一番効いてほしい場面で消える。
// タイルを並べて印を置き、指で動かせれば足りる。
//
// タイルは地理院タイル（国土地理院）。出典表示が要る。
// https://maps.gsi.go.jp/development/ichiran.html
//
// 幅は描いてからでないと分からない。文字列を組み立てる時点で決め打つと、
// 画面が狭い端末で右側が切れて、肝心の印が画面外に出る。
// 先に枠だけ置き、描画後に実寸を測ってから中身を入れる。

const TILE = 256
const TILE_URL = (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/pale/${z}/${x}/${y}.png`
const MIN_ZOOM = 4
const MAX_ZOOM = 17

/** 経度 → ワールド座標(px)。 */
const lonToX = (lon, size) => ((lon + 180) / 360) * size

/** 緯度 → ワールド座標(px)。メルカトル。 */
function latToY(lat, size) {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * size
}

/** ワールド座標(px) → 経度。 */
const xToLon = (x, size) => (x / size) * 360 - 180

/** ワールド座標(px) → 緯度。 */
function yToLat(y, size) {
  const n = Math.PI - 2 * Math.PI * (y / size)
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

/**
 * 動かした後の位置。地図ごとに覚えておく。
 * 画面を描き直しても消えないよう、部品の外に置く。
 * @type {Map<string, {center:{lat:number,lon:number}, zoom:number}>}
 */
const views = new Map()

/**
 * @typedef {object} Marker
 * @property {number} lat
 * @property {number} lon
 * @property {string} kind  CSS クラスになる。'quake' | 'me' | 'shelter' | 'stay'
 * @property {string} [label]  印に添える短い文字。
 */

/**
 * 地図の枠だけを返す。中身は paintMaps が入れる。
 *
 * @param {object} spec
 * @param {string} spec.id  動かした位置を覚えるための名前。画面をまたいで同じものに同じ名前を。
 * @param {{lat:number, lon:number}} spec.center
 * @param {Marker[]} spec.markers
 * @param {string} spec.note  出典表示。
 * @param {{zoomIn:string, zoomOut:string, recenter:string}} spec.labels  操作ボタンの読み上げ名。
 * @param {number} [spec.height]
 * @param {{lat:number, lon:number}[]} [spec.fit]  全部が入る縮尺を選ぶ。
 * @param {number} [spec.zoom]  fit を渡さないときの縮尺。
 */
export function mapFrame(spec) {
  const height = spec.height ?? 220
  const config = {
    id: spec.id,
    center: spec.center,
    markers: spec.markers,
    fit: spec.fit ?? null,
    zoom: spec.zoom ?? 12,
    height,
  }
  // 属性に入れるので " を潰しておく。中身は自前のデータで、外から来ない。
  const json = JSON.stringify(config).replace(/"/g, '&quot;')
  const l = spec.labels
  return `<div class="map" style="height:${height}px" data-map="${json}">
    <div class="map-inner"></div>
    <div class="map-ctl">
      <button type="button" data-mapzoom="1" aria-label="${l.zoomIn}">+</button>
      <button type="button" data-mapzoom="-1" aria-label="${l.zoomOut}">−</button>
      <button type="button" data-maphome="1" aria-label="${l.recenter}">◎</button>
    </div>
    <span class="map-note">${spec.note}</span>
  </div>`
}

/** 全部の点が入る縮尺。端に貼りつかないよう内側に余白を取る。 */
function zoomToFit(points, width, height) {
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const size = TILE * 2 ** z
    const xs = points.map((p) => lonToX(p.lon, size))
    const ys = points.map((p) => latToY(p.lat, size))
    const dx = Math.max(...xs) - Math.min(...xs)
    const dy = Math.max(...ys) - Math.min(...ys)
    if (dx < width * 0.72 && dy < height * 0.72) return z
  }
  return MIN_ZOOM
}

/** 点の集まりの中心。 */
const centerOf = (points) => ({
  lat: (Math.min(...points.map((p) => p.lat)) + Math.max(...points.map((p) => p.lat))) / 2,
  lon: (Math.min(...points.map((p) => p.lon)) + Math.max(...points.map((p) => p.lon))) / 2,
})

/** 既定の見え方。fit があればそれに合わせる。 */
function defaultView(spec, width) {
  const points = spec.fit && spec.fit.length ? spec.fit : [spec.center]
  if (points.length > 1) {
    return { center: centerOf(points), zoom: zoomToFit(points, width, spec.height) }
  }
  return { center: spec.center, zoom: spec.zoom }
}

/** 1 枚を描く。 */
function paintOne(el) {
  const spec = JSON.parse(el.dataset.map)
  const width = el.clientWidth
  const height = spec.height
  if (!width) return

  const view = views.get(spec.id) ?? defaultView(spec, width)
  views.set(spec.id, view)

  const size = TILE * 2 ** view.zoom
  const left = lonToX(view.center.lon, size) - width / 2
  const top = latToY(view.center.lat, size) - height / 2

  const x0 = Math.floor(left / TILE)
  const x1 = Math.floor((left + width) / TILE)
  const y0 = Math.floor(top / TILE)
  const y1 = Math.floor((top + height) / TILE)
  const max = 2 ** view.zoom

  const parts = []
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      // 縦は世界の外に出たら描かない。横は一周するので回り込ませる。
      if (y < 0 || y >= max) continue
      const wrapped = ((x % max) + max) % max
      parts.push(
        `<img src="${TILE_URL(view.zoom, wrapped, y)}" alt="" draggable="false"` +
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

  const inner = el.querySelector('.map-inner')
  inner.style.transform = ''
  inner.innerHTML = parts.join('')
}

/** 縮尺を変える。画面の中心を保ったまま寄る・引く。 */
function zoomBy(el, delta) {
  const spec = JSON.parse(el.dataset.map)
  const view = views.get(spec.id) ?? defaultView(spec, el.clientWidth)
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom + delta))
  views.set(spec.id, { ...view, zoom })
  paintOne(el)
}

/** 既定の見え方に戻す。「現在地」の印があればそこを中心にする。 */
function recenter(el) {
  const spec = JSON.parse(el.dataset.map)
  const me = spec.markers.find((m) => m.kind === 'me')
  if (me) {
    const view = views.get(spec.id) ?? defaultView(spec, el.clientWidth)
    views.set(spec.id, { center: { lat: me.lat, lon: me.lon }, zoom: view.zoom })
  } else {
    views.delete(spec.id)
  }
  paintOne(el)
}

/** 指でずらす。離した時点で描き直す。動かしている間は面ごと動かす。 */
function enableDrag(el) {
  const inner = el.querySelector('.map-inner')
  let start = null

  inner.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.map-ctl')) return
    start = { x: ev.clientX, y: ev.clientY }
    inner.setPointerCapture(ev.pointerId)
    el.classList.add('dragging')
  })

  inner.addEventListener('pointermove', (ev) => {
    if (!start) return
    inner.style.transform = `translate(${ev.clientX - start.x}px, ${ev.clientY - start.y}px)`
  })

  const end = (ev) => {
    if (!start) return
    const dx = ev.clientX - start.x
    const dy = ev.clientY - start.y
    start = null
    el.classList.remove('dragging')

    const spec = JSON.parse(el.dataset.map)
    const view = views.get(spec.id) ?? defaultView(spec, el.clientWidth)
    const size = TILE * 2 ** view.zoom
    // 指で動かした分だけ、中心を逆に動かす。
    const cx = lonToX(view.center.lon, size) - dx
    const cy = latToY(view.center.lat, size) - dy
    views.set(spec.id, {
      zoom: view.zoom,
      center: { lat: yToLat(cy, size), lon: xToLon(cx, size) },
    })
    paintOne(el)
  }
  inner.addEventListener('pointerup', end)
  inner.addEventListener('pointercancel', end)
}

/** 描画後に呼ぶ。枠の実寸を測ってタイルと印を入れ、操作を繋ぐ。 */
export function paintMaps(root = document) {
  for (const el of root.querySelectorAll('.map[data-map]')) {
    paintOne(el)
    // 画面を描き直すたびに繋ぎ直さない。
    if (el.dataset.wired) continue
    el.dataset.wired = '1'
    enableDrag(el)
    for (const b of el.querySelectorAll('[data-mapzoom]')) {
      b.onclick = () => zoomBy(el, Number(b.dataset.mapzoom))
    }
    const home = el.querySelector('[data-maphome]')
    if (home) home.onclick = () => recenter(el)
  }
}
