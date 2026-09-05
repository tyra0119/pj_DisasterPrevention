// オフライン対応。
//
// 地震のあとは回線が細る。同梱データ (観測点 4,360 点・路線 596・対応表・場所) は
// 全部で gzip 400KB ほどなので、最初の 1 回で端末に置いてしまう。
// そうすれば圏外でも「最後に取れた地震の情報で、どの路線が止まっている見込みか」は出せる。
//
// 地震情報 (P2P) はキャッシュしない。古い地震を新しい情報として見せる方が、
// 「取れなかった」と言うより危ない。画面側が最終取得時刻を必ず出す。

const VERSION = 'v1'
const SHELL = `shell-${VERSION}`
const DATA = `data-${VERSION}`

/** 画面の骨格。これが無いと何も出せない。 */
const SHELL_FILES = ['./', 'index.html', 'diagnostics.html', 'sw.js']

/** 同梱データ。大きいので別キャッシュに置き、更新時も捨てない。 */
const DATA_FILES = [
  'data/shindo-stations.json',
  'data/shindo-areas.json',
  'data/rail-lines.json',
  'data/line-map.json',
  'data/places.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL)
      await shell.addAll(SHELL_FILES)
      const data = await caches.open(DATA)
      // データは 1 つ失敗しても残りを入れる (addAll は 1 つでも落ちると全滅する)。
      await Promise.all(
        DATA_FILES.map(async (f) => {
          try {
            await data.add(f)
          } catch {
            // 取れなければオンライン時に取り直す。
          }
        }),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, DATA])
      for (const key of await caches.keys()) {
        if (!keep.has(key)) await caches.delete(key)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // 地震情報は必ず取りに行く。古いものを黙って返さない。
  if (url.hostname.endsWith('p2pquake.net') || url.hostname.endsWith('jma.go.jp')) return

  // 同一オリジンだけ扱う。
  if (url.origin !== self.location.origin) return

  const isData = url.pathname.includes('/data/') && url.pathname.endsWith('.json')

  if (isData) {
    // 同梱データはキャッシュ優先。大きく、変わるのはデータ再生成のときだけ。
    event.respondWith(cacheFirst(request, DATA))
    return
  }

  // 画面とコードは新しい方を優先し、取れなければキャッシュに落とす。
  // ビルド工程が無く版が振れないので、キャッシュ優先にすると更新が届かない。
  event.respondWith(networkFirst(request, SHELL))
})

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request, { ignoreSearch: true })
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) cache.put(request, res.clone())
  return res
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(request)
    if (res.ok) cache.put(request, res.clone())
    return res
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true })
    if (hit) return hit
    throw err
  }
}
