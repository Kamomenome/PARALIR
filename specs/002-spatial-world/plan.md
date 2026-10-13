# Implementation Plan: 空間表現への拡張（space-v1）

**Branch**: `002-spatial-world` | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-spatial-world/spec.md`

## Summary

元写真を素材に、①Fractal Flame、②成長構造＋管、③部品の空間反復の 3 方式と組み合わせを、同じ seed で描く CPU レンダラーを
`src/core/space/` に追加する。まず描画コアと比較ツールを作り、出力を見て方式を選び、その後 UI・レシピに統合する。
既存の world-v3・reference-v1 は変更しない。詳細は [research.md](research.md)。

**Phase 6〜11 の設計（2026-10-12 更新）**: 比較の結果と利用者の指摘を受け、組み合わせ画像を次の構成に改めた。
seed がまず空間の型（`layout.ts`: 並べ方・対称性・空洞と消失点・カメラの傾き・光の方向）を決め、続いて
**背景**（写真の光の場／写真の天球／写真の再帰、`background.ts`）・**前景**（写真の断片／切り抜き／輪郭線の押し出し／洞窟／万華鏡／
ロールシャッハ、`foregrounds.ts`）・**合わせ方**（奥行きと霧／異界の色、`surreal.ts`）をそれぞれ選ぶ。選択は写真の特徴で重み付けし
（全種類はどの写真でも出うる）、画面で固定でき、レシピに保存する。合わせ方の最後に明暗の整え（`hdr.ts` の chiaroscuro）を置き、
どの組み合わせでも暗い空洞と発光を保つ。形はすべて写真から生まれる（設計した骨組みは比較用にだけ残す）。

## Technical Context

**Language/Version**: TypeScript（既存と同じ）

**Primary Dependencies**: 追加なし（既存の vite・vitest・playwright・pngjs・temporal-polyfill）

**Storage**: なし（PNG・JSON は利用者が保存）

**Testing**: Vitest（決定性・分割非依存・色の追従・空洞と発光・粒度・異常画像）、Playwright（UI 統合後）

**Target Platform**: 既存と同じ（Windows 11 の Edge / Chrome、端末内処理）

**Project Type**: 既存の単一フロントエンドアプリへの追加

**Performance Goals**: 目標値は置かない（利用者の方針: 速さより画質）。2400×1800 の描画時間を方式ごとに測定・報告する

**Constraints**: 決定性（同条件で画素一致、分割・順序に非依存）、端末内処理、乱数の消費回数は特徴・スライダーに依存しない

**Scale/Scope**: 3 方式＋組み合わせ、1 モード追加。Phase 8〜10 で 背景 3 × 前景 6（＋旧構造）× 合わせ方 2 に拡張

## Constitution Check

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テストファースト | ✅ | tasks で各描画コアの前に決定性・指標のテストを置く |
| II. ロジックと UI の分離 | ✅ | `src/core/space` は DOM 非依存。Node の比較ツールとテストで動く |
| III. 端末内のブラウザアプリ | ✅ | 追加の通信なし。Worker で描画 |
| IV. ユーザーデータの保護 | ✅ | レシピは版付き。space 用の版を追加し、未知の版は拒否 |
| V. シンプルさ | ⚠️ 正当化あり | 依存追加なし。アルゴリズムは背景 3・前景 7・合わせ方 2 と多いが、利用者が「全部採用」と判断し、乱数ごとに型の違う世界を出すことが要件（FR-221）。それぞれ独立した関数で、共通の Layer／光の受け渡しだけでつながる。旧「断片と枝の構造」は比較用で seed は選ばない（Complexity Tracking） |
| VI. 決定性と基準の保護 | ✅ | 既存モードの描画は変更しない（既存テストで確認）。Flame は整数加算で順序非依存。入力の縮小（FR-223）は自前の決定的な面積平均で、ブラウザーの縮小処理に依存しない。reference-v1 の基準写真は上限内なので影響しない |

再評価（2026-10-12、Phase 11 着手前）: 原則 I は Phase 6 以降もテストを先に書いて失敗を確認してから実装している。一方で、Phase 6〜10 は
tasks.md への直接追記で進め、plan.md・research.md の更新と整合確認（analyze）を省いていた。Phase 11 からは、spec → plan/research → tasks →
整合確認 → 実装の順に戻す。

## Project Structure

```text
src/core/space/
├── seeds.ts        # space-v1 の seedInput・用途別系列
├── camera.ts       # 透視投影
├── hdr.ts          # HDR バッファ、霧・ブルーム・周辺減光・トーンマップ
├── palette.ts      # 写真からパレットと部品の切出し候補
├── flame.ts        # ① Fractal Flame（flame-v1）
├── growth.ts       # ② 成長構造＋管（growth-v1）
├── parts.ts        # ③ 部品の空間反復（parts-v1）
├── composite.ts    # compose（構成の決定）と 背景 → 前景 → 合わせ方 の描画
├── layout.ts       # 空間の型（Phase 6）
├── background.ts   # 背景（光の場・天球・再帰）と選択（Phase 8・10）
├── foregrounds.ts  # 写真から生まれる前景 6 種（Phase 9）
├── surreal.ts      # 異界の色の規則（Phase 7、合わせ方で使う）
├── photo.ts        # 写真の標本化・光の写真（Phase 5）
├── recipe.ts       # 空間レシピ（schemaVersion 4、pipeline）
└── types.ts
tools/space-compare.ts       # 比較画像・設定・時間の記録（out/space/）
tests/integration/space-*.test.ts
specs/002-spatial-world/decision.md   # 採用方式と理由（比較後）
```

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 描画方式を 3 つ実装する | 利用者が 3 方式の比較と採用理由の説明を求めている | 1 方式に絞ると比較の要件を満たせない。採用後に不要な方式を整理する |
| 試作で画像モデルの実行環境（@huggingface/transformers、ONNX Runtime）を開発用の依存に追加する（FR-230） | 部品ごとの分解には画像を理解するモデルが要る。色の差による推定（Phase 13）では人物の肌しか取れない | 自前の学習・実装は不可能な規模。アプリへの組み込みは試作の評価後に別途 plan を更新して判断する |
| 背景 3・前景 7・合わせ方 2 を持つ | 利用者が全種類を採用し、乱数と写真の条件で型の違う世界が出ることを求めた（FR-221） | 1 種類に絞ると「どの別案も同じ型」という指摘（Phase 6）に戻る。旧「断片と枝の構造」は比較用として残し、seed は選ばない |
