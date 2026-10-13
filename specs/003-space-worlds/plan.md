# Implementation Plan: 空間モードの作り直し（space-v2: 四つの世界）

**Branch**: `003-space-worlds` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

## Summary

空間モードを四つの世界（物の複製・闇と光・数式の場・被写体の解体）だけで作り直す。各世界は一つの描画関数で、共通部品
（写真の板を遠近法で描く・被写体の推定・静かな舞台・表示用の色の変換）だけを共有する。002 の層の重ね合わせ（背景 × 前景 × 合わせ方・明暗の整え）はやめる。
002 の他の型のコードとテストは削除する。設計の根拠は [research.md](research.md)。

## Technical Context

**Language/Version**: TypeScript（既存と同じ）
**Primary Dependencies**: 追加なし
**Testing**: Vitest（世界ごとの規則・決定性・写真由来・闇と光の明暗・選ばれ方）、Playwright（型の固定・スライダー・保存と読込・外部通信 0 件）
**Target Platform**: 既存と同じ（Windows 11 の Edge / Chrome、端末内処理）
**Performance Goals**: 目標値は置かない（利用者の方針: 速さより画質）。2400×1800 の時間を世界ごとに記録する
**Constraints**: 決定性、端末内処理、乱数は構成の決定でだけ固定の回数、写真にない図形を足さない

## Constitution Check

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テストファースト | ✅ | tasks で各世界の描画の前に規則・決定性・明暗のテストを置く |
| II. ロジックと UI の分離 | ✅ | `src/core/space` は DOM 非依存 |
| III. 端末内のブラウザアプリ | ✅ | 追加の通信なし |
| IV. ユーザーデータの保護（形式変更時の移行） | ⚠️ 正当化あり | space-v1 → space-v2 は描画の中身が別物で、同じ作品を再現する移行はできない。移行の代わりに、理由を示して拒否する処理とそのテストを用意する（黙って別の絵を描かない＝原則 VI）。world-v3 のレシピは変わらない |
| V. シンプルさ | ✅ | 002 の型の大半と層の重ね合わせを削除し、四つの独立した描画関数にする。依存追加なし |
| VI. 決定性と基準の保護 | ✅ | world-v3・reference-v1 は変更しない（既存テストで確認）。space-v1 の作品は版で区別して拒否する |

## Project Structure

```text
src/core/space/
├── seeds.ts       # space-v2 の seedInput（先頭 'space-v2'）・用途別系列（type, copies, dark, formula, split, look）
├── types.ts       # SpaceControls（五つ）、版
├── camera.ts      # 透視投影
├── photo.ts       # 写真の標本化（双線形・足跡に応じた解像度）、光の写真
├── plates.ts      # 写真の板を遠近法で描く（002 parts.ts の描画部分）とマスク
├── subject.ts     # 被写体の推定（AI なし）と主役の切り抜き
├── display.ts     # 線形の色 → 表示（明部の肩、静かな舞台、やわらかな明かり）
├── world.ts       # 構成（型の選択と各世界の値）と描画の振り分け
├── copies.ts      # 物の複製（002 arrays.ts の幾何を整理）
├── dark.ts        # 闇と光（光の筋・群れ）
├── formula.ts     # 数式の場（002 から移す）
├── split.ts       # 被写体の解体（002 fragments.ts を整理）
└── recipe.ts      # space-v2 レシピ（space-v1 は拒否）
tools/space-compare.ts   # 世界ごと・おまかせの比較画像と時間
```

削除: flame.ts・growth.ts・parts.ts（描画部分は plates.ts へ）・layout.ts・palette.ts・surreal.ts・background.ts・foregrounds.ts・composite.ts・arrays.ts・fragments.ts と、
対応するテスト、tools/prototype-calm.ts。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| space-v1 のレシピを移行せず拒否する | 描画の中身が別物で、同じ作品を再現できない | 新しい式で読み替えると、黙って別の絵を描くことになる（原則 VI 違反） |
