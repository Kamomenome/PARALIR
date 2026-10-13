# Implementation Plan: 処理中を見せる

## 設計

- 画面: 絵の場所に `div.busy`（`data-testid="busy"`）。中に回る印と文。`ui/busy.ts` が「理由の集まり」（読み込み・AI・描画）を持ち、いちばん先の理由の文を 0.15 秒遅れて出す
- 写真の読み込み（`ui/photoInput.ts`）: 読み込みの間は「読み込み」、読み込めたら `update` で写真を先に入れる（`withPhoto`: 世界を組まずに `showing: 'photo'`）。そのあと AI と世界の組み立てを `update` で続ける（`withSource`）。
  その間の理由は「AI」。順番待ちの列の中で行うので、008 の順番の守りは変わらない
- 描画（`ui/preview.ts`）: 描いている間は「描画」
- 状態（`app/state.ts`）: `withPhoto(s, source)` を足す（世界・seed は空、`showing: 'photo'`）。保存と書き出しは世界がないので押せない（011 と同じ）

## テスト

- e2e `tests/e2e/busy.spec.ts`（SC-1201〜SC-1203）、unit `tests/unit/busy.test.ts`（理由の優先と遅れ）、unit（`withPhoto`）
