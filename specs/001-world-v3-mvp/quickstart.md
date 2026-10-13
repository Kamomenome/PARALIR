# Quickstart / 検証ガイド: 変貌世界アプリ MVP

各シナリオは spec の受け入れ条件と docs/SPEC.md の A01〜A12 に対応する。
ここに書くのは実行・確認の手順だけで、実装の中身は tasks.md と実装で扱う。

## 前提

- Windows 11、Node.js 24 系、npm
- 基準検証用: `.venv`（Python 3.12 + `docs/reference/requirements.txt`）
- E2E 用: `npx playwright install chromium`（初回のみ）

## セットアップ

```powershell
npm install
npm test            # Vitest（単体・結合）
npm run test:e2e    # Playwright（ブラウザ一致・画面の通し確認）
npm run dev         # 開発サーバー
npm run build       # dist/index.html（単一ファイル）を生成
```

## シナリオ

| # | 対応 | 手順 | 期待結果 |
|---|---|---|---|
| Q1 | A01 | `.venv\Scripts\python.exe docs\reference\verify_reference.py` | 作成環境同等の Linux で `identical_rgb: true`。Windows では誤差を記録する（research R-05） |
| Q2 | R02 | `npx tsx tools/reference-diff.ts` | JS 版 reference-v1 の平均・p99・最大誤差を出力。暫定目標: 平均≤1、p99≤3 |
| Q3 | A02 | `npm test -- determinism` | 同じ入力で 2 回描画して不一致 0 画素 |
| Q4 | A03 | `npm test -- prng` と `npm run test:e2e -- prng` | 固定 seed の先頭列が `tests/fixtures/prng-vectors.json` と一致。サブ列追加で layout 列が不変 |
| Q5 | A04〜A06 | `npm test -- composition` | 日時・別案で構成が変化。特徴の影響 0/1 と画素配置違いで局所変形が異なる |
| Q6 | A07, A08 | 画面で診断表示を開く／`npm test -- grain` | 粗中細マスクと切出し元を表示。形を残す割合を上げると粗の面積比が単調増加 |
| Q7 | A09 | `npm test -- resolution` | 960 と 2400 で共通の正規化座標の層重み・サンプル座標・RGB が一致 |
| Q8 | A10 | 画面でレシピ保存 → 再読込 → 書き出し／`npm run test:e2e -- recipe` | 書き出し PNG が元と不一致 0 画素 |
| Q9 | A11 | `npm test -- edge-images` | 黒・白・単色・無彩色・1×1・壊れたファイルで NaN と未処理例外なし |
| Q10 | A12 | `npx tsx tools/compare-sheet.ts <写真>` | `out/compare/` に seed 違い・粗比率違いの比較シート。利用者が採用案を選ぶまで preset は `unevaluated` |
| Q11 | R11, R12 | `npm run test:e2e -- jobs` | 書き出し中の操作が結果に影響しない。キャンセル可能。連続操作で古い結果が出ない |
| Q12 | 性能 | `npm run test:e2e -- perf` | `perf-report.md` に 960px プレビュー時間・2400px 書き出し時間と測定環境を記録 |
| Q13 | 起動 | `dist/index.html` をダブルクリック | ブラウザで開き、写真の読込・生成・書き出しができる（file:// での Worker 動作を確認） |
