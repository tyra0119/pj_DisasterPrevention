# 生成スクリプト

スクリーンショット・スライド・動画・サムネイルを作ったスクリプト。
**素材を作り直すときはここから。手で作り直さない。**

いずれも作業用の一時フォルダに置いたまま session が終わると消えるので、
応募資料と一緒に残した (2026-09-10)。

## 走らせる順

```bash
# 1. スクリーンショット 10 枚 → 素材/*.png
#    先にローカルサーバを立てておく (python -m http.server 8080)
node 生成スクリプト/shoot.mjs "$(pwd)/公共交通オープンデータチャレンジ2026/素材"

# 2. サムネイル → 素材/サムネイル.png  (1 の 01_verdict_en.png を使う)
python 生成スクリプト/thumb.py

# 3. スライド → 紹介スライド.pptx (動画版 11 枚) と 紹介スライド_詳細版.pptx (14 枚)
python 生成スクリプト/build_deck.py
```

```powershell
# 4. ナレーションを合成して動画 → 紹介動画.mp4
#    3 の 紹介スライド.pptx のノートを読み上げる。PowerPoint と Windows 音声合成が要る
.\生成スクリプト\make_video.ps1
```

## 直すときにどこを触るか

| 直したいもの | ファイル | 場所 |
|---|---|---|
| スライドの文言・構成 | `build_deck.py` | 各スライドの `text(...)` / `heading(...)` |
| **動画のナレーション（長い版）** | `build_deck.py` | 各スライドの `notes(s, '…')` |
| **動画のナレーション（120 秒版）** | `build_deck.py` | 末尾の `SHORT = {…}` |
| 動画に入れるスライドを増減 | `build_deck.py` | `SHORT` のキー（ここに無い番号は動画版から落ちる） |
| 読み上げ速度・切替の間 | `make_video.ps1` | `$tts.Rate` / `AdvanceTime` |
| 撮る画面・URL | `shoot.mjs` | `SHOTS` |
| サムネイルの文言 | `thumb.py` | 下半分の `d.text(...)` |

長さの目安: 読み上げは約 7 文字/秒（`$tts.Rate = 3`）。
`build_deck.py` が `video narration chars:` を出すので、**780 文字なら約 120 秒**。

## 環境に依存するところ

このマシン向けに直書きしてある。別のマシンで走らせるなら直す。

- `build_deck.py` / `thumb.py` … 冒頭の `ROOT`（リポジトリのパス）
- `shoot.mjs` … `CHROME`（Chrome の実行ファイル）、`BASE`（`http://localhost:8080/`）
- `thumb.py` … `C:\Windows\Fonts\YuGothB.ttc` と `malgunbd.ttf`（한국어 は游ゴシックに無い）
- `make_video.ps1` … PowerPoint (COM) と `Microsoft Haruka Desktop`

`make_video.ps1` は **UTF-8 BOM 付きで保存する**。BOM が無いと Windows PowerShell 5.1 が
Shift-JIS として読み、日本語のパスが壊れて `Presentations.Open` が落ちる。

## 依存

`python-pptx`、`Pillow`。Node は標準のみ（`shoot.mjs` は Node 22 の `WebSocket` で
Chrome の DevTools Protocol を直接叩いている）。
