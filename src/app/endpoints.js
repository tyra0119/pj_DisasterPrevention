// 外部の接続先。ここだけ書き換えれば済むようにまとめてある。

/**
 * ODPT 運行情報の中継先 (proxy/worker.js をデプロイした URL)。
 *
 * 空なら運行情報は取りに行かず、震度からの推定だけで動く。
 * 中継先を置いたら、例えば 'https://move-or-wait.example.workers.dev' を入れる。
 * 鍵はここには書かない。鍵は Worker 側の Secret に置く。
 */
export const ODPT_PROXY = ''
