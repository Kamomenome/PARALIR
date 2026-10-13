# Implementation Plan: 信頼性と堅牢性（版 1.26）

**Branch**: `008-reliability` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

## Summary

まず再現の守り（世界の画素ハッシュ）を入れ、以後の直しで絵が変わらないことをそれで確かめながら進める。
描画の数値は変えない。変えるのは、Worker の管理（`src/app/controller.ts`・`workers.ts`・`src/worker/handler.ts`）、
写真とレシピの読み込みの順番（`src/ui/main.ts`・`src/app/state.ts`）、入力の検証（`src/app/decode.ts`・`src/core/image/normalize.ts`・`src/core/space/recipe.ts`）、
ビルド（`vite.config.ts` に CSP と commit）。

## Technical Context

**Dependencies**: 追加なし。source-map-js は lock の更新だけ（`npm audit fix` の範囲）
**Testing**: 先に書いて失敗を確かめる。unit（controller・handler・recipe・decode の検証・世界の記録）と e2e（写真の連続選択・ドロップ・CSP の file://）

## Constitution Check

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テストファースト | ✅ | FR ごとにテストを先に書く。世界の記録は道具で作り、テストで確かめる |
| II. ロジックと UI の分離 | ✅ | レシピの読み込みの判断を `app` 側の関数にし、unit で試す |
| データを外へ送らない | ✅ | CSP で二重にする。e2e の通信 0 件はそのまま |

## 設計

### 世界の記録（FR-801）
- `tests/helpers/worlds.ts`: 決まった写真・日時（2026-10-11T12:00 Asia/Tokyo）・160×120・AI なしで、Worker と同じ描画関数（`getRenderer('space-v2')`）を通して描き、SHA-256 を返す
- `tools/world-hashes.ts`: 上を使って `tests/fixtures/world-hashes.json`（`versions` と `cells`）を書く
- `tests/integration/world-hashes.test.ts`: `versions` が今と同じなら全セル一致を求める。違えば「記録し直して」で失敗

### Worker（FR-804〜FR-808）
- `chooseWorkers` の数は `min(2, CPU − 1)`（最低 1）
- `RenderController`: Worker ごとに今の仕事の種類を持ち、プレビューの仕事を同時に持てる Worker は `max(1, 数 − 1)` まで
- `WorkerLike` に `onerror`・`onmessageerror` を足す。落ちたら: 仕事を失敗にし、Worker を作り直し、覚えている写真（最大 2 枚）を送り直す
- `handler`: 写真を 2 枚まで持つ（古い方から捨てる）。`cancelled` は 256 件を超えたら古いものを捨てる
- `partsFor`: 60 秒の時間切れ（`withTimeout`）。時間切れもその写真の結果として覚える（覚えないと、操作のたびに 60 秒待つことになる）

### 順番（FR-809〜FR-811）
- 写真: 読み込みごとに番号を振り、最新でなければ捨てる。`controller.setSource` は `update` の中で行う
- レシピ: `loadRecipeText(state, text)`（app）が「断る理由」か「当てはめる手順」を返す。当てはめは `update` の中で写真の番号を確かめてから

### 入力（FR-812〜FR-816）
- CSP（ビルドだけ、`transformIndexHtml`）: `default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob: data:; worker-src blob: data:; connect-src data: blob:; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'`
  （MediaPipe の wasm と単一 HTML のインラインのため。e2e で file:// の描画・AI・通信 0 件を確かめる）
- `decodeFile`: `file.size` を読む前に確かめる。読み込み後に `validateSize` をもう一度。`MAX_SIDE = 32767`
- レシピ: 1 MiB、`JSON.parse` の後の入れ子の深さ 32 まで（再帰でなく繰り返しで数える）
- ドロップ: `window` の `dragover`・`drop` の既定動作を止める
- 囲み: `button === 0` のときだけ。`pointercancel`・`lostpointercapture` で捨てる。外接の対角が絵の幅の 1% 未満なら捨てる

## 片付け（FR-817〜FR-819）
- `exportQuality`・`DEFAULT_QUALITY`・`samplesFor` をなくし、レシピは `standard`
- 使われていないもの: `seeds.ts` の world-v3 の部分（`seedInputJson` など使われているものは残す）、`p9/palette.ts`（使われていなければ）、`renderers.ts` の `source`、`tests/fixtures/reference-points.json`、`docs/reference/__pycache__`
- 古い文書（`docs/CLAUDE_CODE_START.md`・`implementation_guide.md`・`TASKS.md`・`SPEC.md`）の冒頭に取り下げの注記。README の版
- 消す前に grep で使われていないことを確かめ、全テストで確かめる
