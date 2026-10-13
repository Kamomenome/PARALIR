---
description: "Task list for 004 写真の部品を AI で見分ける"
---

# Tasks: 写真の部品を AI で見分ける（parts-v1）

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md)

## Phase 1: 準備

- [X] T401 依存 `@mediapipe/tasks-vision` を加え、`tools/fetch-models.ts` でモデル 3 つを取得・SHA-256 を記録（models/ は git 対象外）

## Phase 2: 部品の型と生成側 (US1・US2、P1) 🎯

- [X] T402 [P] 部品の型・要約・問い合わせのテストを書く: SC-405 の決定性・要約（tests/unit/parts.test.ts）
- [X] T403 [P] 部品を使う被写体と素材選びのテストを書く: SC-401〜SC-403（tests/integration/space2-parts.test.ts）
- [X] T404 PhotoParts の型・要約・問い合わせ（src/core/parts/types.ts）
- [X] T405 mainObject を部品対応に（人物 → 物 → 推定）、自分で埋めるに顔と目の列、矩形の組み替えの拡大の素材（src/core/space/object.ts・echo.ts・mosaic.ts）

## Phase 3: AI 本体とアプリ (US1〜US3)

- [X] T406 [P] e2e のテストを書く: SC-404・SC-406（tests/e2e/parts.spec.ts）
- [X] T407 同梱と MediaPipe の呼び出し（src/ai/assets.ts・src/ai/parts.ts）
- [X] T408 読み込み時に部品を作り、描画の依頼とレシピに添える。失敗時の知らせ（src/app・src/worker・src/ui・レシピの契約）

- [X] T410 外部への通信を止める（src/app/offline.ts、tests/unit/offline.test.ts）: FR-409・SC-408（実装中に判明した MediaPipe の利用ログ送信への対処）

## Phase 5: 矩形の組み替えの範囲を画像認識で安定させる（利用者の希望、2026-10-12）

- [X] T411 [P] テストを書く: SC-409（tests/unit/parts-choice.test.ts・tests/integration/space2-parts.test.ts）
- [X] T412 部品に候補の切り抜きをすべて持たせる（parts-v2: src/core/parts/types.ts・serialize.ts・src/ai/parts.ts、レシピの契約）
- [X] T413 候補の選び方と矩形の組み替えの範囲（src/core/parts/choice.ts・src/core/space/object.ts・world.ts、版 mosaic-v2）
- [X] T414 気に入った版と並べた比較画像を作り、評価を受ける（SC-410）

## Phase 4: 確かめる

- [ ] T409 `tools/parts-extract.ts` と `space-compare --parts`、利用者の写真で比較画像を作り評価を受ける（SC-407）
