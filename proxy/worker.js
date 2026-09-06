// ODPT の運行情報を中継する Cloudflare Worker。
//
// なぜ要るか: アプリは GitHub Pages の静的配信で、ODPT の鍵を同梱すると露出する。
// この Worker が鍵を持ち、アプリには鍵抜きの JSON だけを返す。
//
// 何に使うか: 「推定を終わらせる」ため。→ vault/シミュレーション.md
// アプリは震度から「止まっている見込み・再開まで 1〜5 時間」と出すが、
// 実際に再開したことを知る術が無い。運行情報が「平常」なら推定を捨てる。
//
// ── 置き方 ──
//   1. Cloudflare Workers で新しい Worker を作り、この内容を貼る
//   2. Settings → Variables で ODPT_KEY と ODPT_CHALLENGE_KEY を Secret として登録
//   3. デプロイ後の URL (https://xxx.workers.dev) を src/app/endpoints.js の ODPT_PROXY に書く
//
// 無料枠は 1 日 10 万リクエスト。応答は 60 秒キャッシュするので、
// 同時に 1 万人が開いても ODPT への呼び出しは毎分 2 回で済む。

const SOURCES = [
  { env: 'ODPT_KEY', base: 'https://api.odpt.org/api/v4' },
  { env: 'ODPT_CHALLENGE_KEY', base: 'https://api-challenge.odpt.org/api/v4' },
]

/** アプリを置いている場所だけに返す。 */
const ALLOWED_ORIGINS = ['https://tyra0119.github.io', 'http://localhost:8080']

const CACHE_SECONDS = 60

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') ?? ''
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    }
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
    if (url.pathname !== '/train-info') {
      return new Response('not found', { status: 404, headers: cors })
    }

    // 60 秒は同じ応答を返す。ODPT を叩く回数を利用者数から切り離す。
    const cache = caches.default
    const cacheKey = new Request(`${url.origin}/train-info`, { method: 'GET' })
    const hit = await cache.match(cacheKey)
    if (hit) {
      const res = new Response(hit.body, hit)
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
      return res
    }

    const items = new Map()
    for (const s of SOURCES) {
      const key = env[s.env]
      if (!key) continue
      try {
        const r = await fetch(
          `${s.base}/odpt:TrainInformation?acl:consumerKey=${encodeURIComponent(key)}`,
          { cf: { cacheTtl: CACHE_SECONDS } },
        )
        if (!r.ok) continue
        for (const it of await r.json()) {
          const railway = it['odpt:railway']
          if (!railway || items.has(railway)) continue
          // 鍵や内部 ID は返さない。アプリが要るものだけに削る。
          items.set(railway, {
            railway,
            operator: it['odpt:operator'] ?? null,
            status: it['odpt:trainInformationStatus']?.ja ?? null,
            text: {
              ja: it['odpt:trainInformationText']?.ja ?? null,
              en: it['odpt:trainInformationText']?.en ?? null,
            },
            updated: it['dc:date'] ?? null,
          })
        }
      } catch {
        // 片方が落ちていても、もう片方の分は返す。
      }
    }

    const body = JSON.stringify({
      fetchedAt: new Date().toISOString(),
      count: items.size,
      items: [...items.values()],
    })
    const res = new Response(body, {
      headers: {
        ...cors,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      },
    })
    await cache.put(cacheKey, res.clone())
    return res
  },
}
