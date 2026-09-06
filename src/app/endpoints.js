// 外部の接続先。ここだけ書き換えれば済むようにまとめてある。

/**
 * ODPT の鍵。ブラウザから直接叩く。
 *
 * **公開リポジトリと公開サイトに載る。** 誰でも読めて、誰でも使える。
 * 主にテストで使うアプリなので、中継を置く手間より直接を選んだ (2026-09-06)。
 * 本番で人に配るなら proxy/worker.js に戻し、ここを空にする。
 *
 * api.odpt.org と api-challenge.odpt.org は配信されるデータが違うので両方持つ。
 * 鍵は .env.local の ODPT_KEY / ODPT_CHALLENGE_KEY と同じ値を、それぞれ key: に貼る。
 * (秘密情報を自動で写すのは止めているので、ここは手で入れる)
 */
export const ODPT_KEYS = [
  { base: 'https://api.odpt.org/api/v4', key: '' },
  { base: 'https://api-challenge.odpt.org/api/v4', key: '' },
].filter((k) => k.key)

/**
 * 中継先 (proxy/worker.js)。使うならここに URL を書き、上の鍵を空にする。
 * 空なら ODPT_KEYS で直接叩く。両方空なら運行情報は取らず、推定だけで動く。
 */
export const ODPT_PROXY = ''
