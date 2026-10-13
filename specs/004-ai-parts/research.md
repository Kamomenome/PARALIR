# Research: 写真の部品を AI で見分ける

## R-401 どの AI を使うか

- **Decision**: MediaPipe Tasks Vision。人物の部品分け `selfie_multiclass_256x256`（背景・髪・体の肌・顔の肌・服・その他）、顔の特徴点 `face_landmarker`（478 点）、
  指定点の切り抜き `magic_touch`（interactive segmenter）。いずれも Apache-2.0、CPU で動かす
- **Rationale**: ブラウザで動く公式の実行環境があり、部品の種類（顔の肌・体の肌・服）が「顔の列」「目の列」「手の拡大」にそのまま使える。指定点の切り抜きは、
  これまでの推定（主役の位置の判断）と組み合わせて人以外の写真の輪郭を正確にできる
- **Alternatives**: ONNX Runtime Web と U²-Net（目立つ物の切り抜き）— 人物の部品と顔の点が得られない。自前の推論 — 実装と検証の量が大きい。
  外部の API — 方針（端末内）に反する

## R-402 file:// で動かす

- **Decision**: 実行環境（`vision_wasm_internal.js` と `.wasm`）とモデルをビルドで HTML に埋め込み、実行時に Blob にして blob URL / バイト列で渡す
  （`WasmFileset` に blob URL、各タスクに `modelAssetBuffer`）。GPU は使わない（`delegate: 'CPU'`）
- **Rationale**: file:// では隣のファイルを fetch できない。blob URL とバイト列なら読める
- **Alternatives**: 利用者がモデルを毎回選ぶ — 手間。IndexedDB に保存 — file:// の保存先が不安定

## R-403 決定性と記録

- **Decision**: マスクは 8 ビットに丸め、点は 1/4096 に丸める。要約は丸めた値の SHA-256 の先頭 16 桁。レシピに `parts: { version, digest }` を任意項目として加える
- **Rationale**: 同じブラウザ・同じ CPU 実行なら同じ結果。丸めで細かな差を吸収し、違えば読み込み時に知らせる

## R-404 モデルの置き場

- **Decision**: リポジトリに入れない。`tools/fetch-models.ts` が固定の URL から取得し SHA-256 を確かめて `models/` に置く（git 対象外）。ビルドは無ければ止めて案内する
- **Rationale**: 26MB の二進ファイルで履歴を重くしない。SHA-256 で同じモデルであることを保証する

## R-406 ライブラリの利用ログ（実装中に判明）

- **Finding**: `@mediapipe/tasks-vision` 1.1.0 は各タスクの生成時に利用ログの送信機を必ず作り、`fetch` で `https://odml.pa.googleapis.com/v1/log` へ 60 秒ごとと終了時に送る。
  無効にする設定は公開されていない。開発サーバーの e2e（空間モード）で 3 件の送信を検出した
- **Decision**: アプリの起動時に、別の出どころの http(s) への fetch・XMLHttpRequest・sendBeacon をネットワークに出る前に止める（`src/app/offline.ts`）。
  ライブラリを書き換えない（版を上げても同じ守りが効く）
- **Alternatives**: 依存の書き換え（patch）— 版ごとに追従が要る。CSP の connect-src — file:// の単一 HTML では meta CSP が data:/blob: の扱いと衝突しやすい

## R-405 テストの分け方

- **Decision**: Vitest は部品を与えて生成側を確かめる（合成の部品）。AI 本体は Playwright（file:// のビルドで動く・通信 0 件・人のいない基準写真で人物なし）。
  利用者の写真での見た目は比較画像で確かめる（`tools/parts-extract.ts` → `tools/space-compare.ts --parts`）

## R-407 試してわかったこと（2026-10-12、利用者の写真 5 枚）

- 人物の部品分けは、人のいない部屋でも画面の 0.9% を人物とした → 人物は「3% 以上、または顔があって 0.5% 以上」（`isPerson`）
- 指定点の切り抜きは、点の下の小さな物（夜の街の看板 2.4%）だけを切ることがある → 推定の主役の中心と箱の四分の一の中心の 5 点で切り、
  画面の半分以下で最大のものを選ぶ（`chooseObject`）。夜の街はホテルの建物、店は建物全体、部屋は絵のある壁になった
- 人物の確信度は人物の外でも 0 にならない（背景の確信度が 1 にならない）。低いしきい値で被写体を消すと画面全体が消えて真っ黒になった →
  部品のマスクは 0.25 以下を 0 に、消す範囲は 0.25 超、画面全体のときは写真を大きくぼかしたものを使う
- 部品づくりの時間: 1 枚 0.5〜3 秒（モデルの準備を除く）。比較画像: `out/latest/sheet-ai-{echo,mosaic,portal}.png`、切り出しの比較 `out/latest/ai-subject-overlay.png`
