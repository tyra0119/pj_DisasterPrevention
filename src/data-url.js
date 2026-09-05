// 同梱データの URL 解決。
//
// GitHub Pages のプロジェクトページは https://<user>.github.io/<repo>/ に載るので、
// '/data/...' と絶対パスで書くとリポジトリ名の分だけ外れる。
// かといってページ相対にすると、階層の違うページから読んだときにずれる。
// <base href> を基準に解決すれば両方避けられる。
//
// index.html に次の 1 行を入れること:
//   <base href="./">
// リポジトリ名を書かずに済むので、ローカルの http-server でもそのまま動く。
// (パスで画面を分けるようになったら絶対パスに変えること。今は URL クエリだけなので './' で足りる)

const DEFAULT_DIR = 'data/'

/** @returns {string} */
export function dataBase() {
  if (typeof document !== 'undefined') return new URL(DEFAULT_DIR, document.baseURI).href
  return DEFAULT_DIR
}

/**
 * 同梱データ 1 ファイルの URL。base を渡せば上書きできる (テスト用)。
 * @param {string} file
 * @param {string} [base]
 * @returns {string}
 */
export function dataUrl(file, base) {
  return new URL(file, base ? ensureSlash(base) : dataBase()).toString()
}

/** @param {string} s */
const ensureSlash = (s) => (s.endsWith('/') ? s : `${s}/`)
