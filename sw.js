// オフライン対応。
//
// 地震のあとは回線が細る。同梱データ (観測点 4,360 点・路線 596・対応表・場所) は
// 全部で gzip 400KB ほどなので、最初の 1 回で端末に置いてしまう。
// そうすれば圏外でも「最後に取れた地震の情報で、どの路線が止まっている見込みか」は出せる。
//
// 地震情報 (P2P) はキャッシュしない。古い地震を新しい情報として見せる方が、
// 「取れなかった」と言うより危ない。画面側が最終取得時刻を必ず出す。
//
// 取得はすべて cache: 'no-cache' で行う。GitHub Pages が max-age=600 を返すので、
// 素の fetch はブラウザの HTTP キャッシュから古いものを受け取る。
// Service Worker のキャッシュを消しても、その手前で古いものが返ってくる。
// no-cache は「取得しない」ではなく「必ずサーバに確かめる」なので、
// 変わっていなければ 304 で済む。

// ビルド工程が無いのでファイル名に版が振れない。ここを上げることが唯一の
// キャッシュ無効化手段になる。**コードを変えたら必ず上げること。**
// 上げ忘れると、一度アクセスした利用者に古い画面が出続ける (v1 で実際に起きた)。
const VERSION = 'v10'
const SHELL = `shell-${VERSION}`
const DATA = `data-${VERSION}`

/** 画面の骨格。これが無いと何も出せない。 */
const SHELL_FILES = ['./', 'index.html', 'diagnostics.html', 'test.html', 'sw.js']

/** 同梱データ。大きいので別キャッシュに置き、更新時も捨てない。 */
const DATA_FILES = [
  'data/shindo-stations.json',
  'data/shindo-areas.json',
  'data/rail-lines.json',
  'data/line-map.json',
  'data/places.json',
  'data/scenarios.json',
]

/** 取得は必ずサーバに確かめる。HTTP キャッシュの古い応答を掴まないため。 */
const fetchFresh = (request) => fetch(request, { cache: 'no-cache' })

/** 1 件ずつ入れる。addAll は cache オプションを取れず、1 つ失敗すると全滅する。 */
async function fill(cache, files) {
  await Promise.all(
    files.map(async (file) => {
      try {
        const res = await fetchFresh(file)
        if (res.ok) await cache.put(file, res)
      } catch {
        // 取れなければオンライン時に取り直す。
      }
    }),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await fill(await caches.open(SHELL), SHELL_FILES)
      await fill(await caches.open(DATA), DATA_FILES)
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
      // 版が変わったことを開いている画面に伝える。画面側が 1 度だけ読み直す。
      for (const client of await self.clients.matchAll({ type: 'window' })) {
        client.postMessage({ type: 'sw-updated', version: VERSION })
      }
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
  const res = await fetchFresh(request)
  if (res.ok) cache.put(request, res.clone())
  return res
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetchFresh(request)
    if (res.ok) cache.put(request, res.clone())
    return res
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true })
    if (hit) return hit
    throw err
  }
}
