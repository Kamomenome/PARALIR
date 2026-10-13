# Implementation Plan: paraller（版 1.24）

**Branch**: `006-paraller` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

## Summary

空間モードだけを残し、world-v3・reference-v1 を削除する。空間モードが借りている小さな部品だけを共通の場所に移す:
`src/core/world/effective.ts`（特徴量の効き方）→ `src/core/analysis/effective.ts`、`toUnitFloat`（`src/core/reference/render.ts`）→ `src/core/image/float.ts`、
書き出しの大きさと品質（`src/core/recipe/recipe.ts` の EXPORT_SIZE・samplesFor・QualityMode）→ `src/core/space/output.ts`。
Phase 9 の復元コード（`src/core/space/p9/`）は読み込み先のパスだけ変える（気に入った 16 枚の再現テストで確認）。

## Technical Context

**Language/Version**: TypeScript（既存と同じ） / **Dependencies**: 変更なし
**Testing**: 削除するモードのテストは削除。空間モードのテストは全部残す。e2e は「開いたら空間」「名前と版」「古いレシピの理由」を先に書く

## Constitution Check

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テストファースト | ✅ | 新しい振る舞い（名前・版・空間だけ・古いレシピ）の e2e を先に書く。削除の安全は空間モードの既存テストで確かめる |
| II. ロジックと UI の分離 | ✅ | 変更なし |
| データを外へ送らない | ✅ | 変更なし（e2e で確認） |

## 削除するもの

- `src/core/world/`（effective.ts を除く）、`src/core/reference/`（toUnitFloat を移した後）、`src/core/presets/`、`src/core/recipe/`
- `src/ui/{controls(古いスライダー部分),compare,comparePanel,diagnostics,modeSwitch}.ts`、`src/worker/modes.ts` の world-v3・reference-v1
- `src/app/state.ts`・`export.ts` の world-v3 の状態と書き出し
- テスト: world-v3・reference-v1 の unit・integration・e2e、道具: `tools/{compare-sheet,reference-diff,quality-metrics}.ts`、`tools/py`（基準再現用）
- 残す文書: `docs/`（001 の正本・基準再現の方法は履歴として残し、冒頭に「006 で取り下げ」と書く）
