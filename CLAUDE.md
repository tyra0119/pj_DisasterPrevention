# DisasterPrevention

訪日外国人向けの地震時移動判断アプリ。単体 Web アプリで、GitHub Pages の
リポジトリ直下をそのまま配信する。

## 作業ルール

**修正したら必ず Obsidian に反映する。** vault は `vault/`。

書き分けはこう決めてある。二重に書かない。

- `vault/` … 経緯・決定・宿題・作業ログ（「なぜそう決めたか」「いつ何をしたか」）
- `NOTES.md` … 検証結果・数値・ファイル構成（技術記録）

vault のノートは `[[wikilink]]` で繋ぐ。入口は `vault/DisasterPrevention.md`。
コードや構成を変えたら、該当するノート（[[設計判断]] / [[データ源]] / [[宿題]]）を
更新し、その日の `vault/作業ログ/YYYY-MM-DD.md` に何をしたか追記する。

## ビルドしない

Pages がリポジトリ直下をそのまま配信するので、ビルド工程を持たない。

- `src/` はブラウザが直接読む ES モジュール。**TypeScript は使えない**
- 型は JSDoc で持つ。検査は `npx tsc`（`jsconfig.json`）
- 依存ゼロ。`npm i` は要らない
- `index.html` の `<base href="./">` を基準に URL を解決する

## データ

`data/*.json` は生成物だがコミットする（生成に N02 の 15MB zip が要るため）。

```bash
npm run data:build     # 観測点マスタ + 路線マスタを再生成
npm run verify:shindo  # 震度の空間化を実データで検証
npm run verify:rail    # 路線への割り当てを実データで検証
```

出典表示が要る。国土数値情報（鉄道データ）は CC BY 4.0。
