# Implementation Plan: 主題の世界と、ざっくり囲む範囲（theme-v1）

**Branch**: `005-theme-world` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

## Summary

002 Phase 9 の描画を `src/core/space/p9/` に元のまま戻し（FR-501）、世界「主題」は画面全体をそれで描いてから、主題の範囲に矩形の組み替えを重ねる（FR-502, FR-503）。
範囲は囲みを狙いにして AI の候補から選ぶ（FR-504）。囲みの AI 処理（指定点の切り抜き）は画面側で行い、決まった範囲のマスクを描画の依頼に添える。根拠は [research.md](research.md)。

## Technical Context

**Language/Version**: TypeScript（既存と同じ）
**Primary Dependencies**: 追加なし（MediaPipe は 004 で導入済み）
**Testing**: Vitest（Phase 9 の再現のハッシュ、主題の世界、囲みの範囲）、Playwright（ドラッグで囲む・消す・レシピ・外部通信 0 件）
**Constraints**: 決定性、端末内処理、外部通信 0 件、主題の画素は元写真だけ

## Constitution Check

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テストファースト | ✅ | tasks で各実装の前にテスト（Phase 9 の再現はハッシュの記録を先に作る） |
| II. ロジックと UI の分離 | ✅ | 範囲の決め方・主題の描画は `src/core`、囲みの操作は `src/ui`、AI 呼び出しは `src/ai` |
| データを外へ送らない | ✅ | 004 の遮断のまま。e2e で確認 |

## Project Structure

```text
docs/GLOSSARY.md                  利用者の言葉（「基準画像」など）
src/core/space/p9/*.ts            002 Phase 9（commit 6842075）を元のまま（読み込み先のパスだけ変更）
src/core/space/theme.ts           主題の世界: Phase 9 の絵 + 範囲の矩形の組み替え
src/core/space/mosaic.ts          下地を差し替えられるように（既定は被写体を消した写真）
src/core/parts/lasso.ts           囲み → マスク、囲みを狙いにした範囲の選び方
src/ai/parts.ts                   囲みの中の点で切り出す
src/ui, src/app, src/worker       囲みの操作・状態・レシピ・描画の依頼
tests/fixtures/phase9-hashes.json 気に入った 16 枚の画素の SHA-256（写真は含まない）
```
