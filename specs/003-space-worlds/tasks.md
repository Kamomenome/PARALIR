---

description: "Task list for 空間モードの作り直し（space-v2）"
---

# Tasks: 空間モードの作り直し（space-v2: 四つの世界）

**Input**: spec.md, plan.md, research.md
**Tests**: 憲法 原則 I により、各実装の前にテストを書き、失敗を確認してから実装する。

## Phase 1: 整理（削除と共通部品）

- [X] T301 002 の選ばれなかった型のコードとテスト、試作ツールを削除し、共通部品（plates.ts・photo.ts・subject.ts・display.ts）に整える
- [X] T302 [P] 共通部品のテストを書く: space-v2 の seedInput、写真の板の描画（剛体・マスク）、静かな舞台が写真由来（黒 → 黒）、表示の変換が色相を保つ（tests/unit/space2-common.test.ts）
- [X] T303 共通部品と seeds・types を space-v2 に合わせる

## Phase 2: User Story 1 - 四つの世界 (P1) 🎯

- [X] T304 [P] [US1] 世界の選択のテストを書く: SC-303（四つと各変化の出現、構図の差）、SC-309（条件で傾く）、被写体なしで解体を選ばない（tests/integration/space2-world.test.ts）
- [X] T305 [P] [US1] 物の複製のテストを書く: SC-304、SC-305、決定性、写真由来（tests/integration/space2-copies.test.ts）
- [X] T306 [P] [US1] 闇と光のテストを書く: SC-306、決定性、写真由来（tests/integration/space2-dark.test.ts）
- [X] T307 [P] [US1] 数式の場のテストを書く: SC-307、決定性、写真由来（tests/integration/space2-formula.test.ts）
- [X] T308 [P] [US1] 被写体の解体のテストを書く: SC-308、SC-305、決定性、写真由来（tests/integration/space2-split.test.ts）
- [X] T309 [US1] 構成と振り分けを実装する（src/core/space/world.ts）
- [X] T310 [US1] 物の複製（src/core/space/copies.ts）
- [X] T311 [US1] 闇と光（src/core/space/dark.ts）
- [X] T312 [US1] 数式の場（src/core/space/formula.ts）
- [X] T313 [US1] 被写体の解体（src/core/space/split.ts）

## Phase 3: User Story 2・3 - 画面・保存 (P2)

- [X] T314 [P] [US2] [US3] 状態とレシピのテストを書く: 型の固定で構成が変わらない、スライダーで seed が変わらない、保存 → 読込で画素一致、space-v1 は理由つき拒否、未知の版を拒否、契約
  （tests/unit/space2-state.test.ts）
- [X] T315 [P] [US2] E2E を書き直す: 空間モードで画像が出る、型の固定と おまかせ への復帰、スライダー、書き出し、レシピ、外部通信 0 件（tests/e2e/space-mode.spec.ts）
- [X] T316 [US2] [US3] 状態・Worker・レシピ・画面を space-v2 にする（src/app/, src/worker/, src/ui/, src/core/space/recipe.ts, contracts/space-v2-recipe.schema.json）
- [X] T317 比較ツールを作り直す（tools/space-compare.ts）

## Phase 4: 仕上げ

- [X] T318 全テスト（world-v3・reference-v1 を含む）・E2E を通し、2400×1800 の時間を世界ごとに測る（SC-310、verification-report.md）
- [ ] T319 基準写真と利用者の写真でおまかせ 12 例を作り、利用者の評価を受けて decision.md に記録する（SC-312）— 比較画像と開発者の所見は記録済み。利用者の評価待ち

## Phase 5: 分解して組み直した背景（利用者の指摘、2026-10-12）

- [X] T323 数式の場の世界を削除する（src/core/space/formula.ts, world.ts, 画面, レシピ, テスト）。利用者の評価で NG（FR-304）
- [X] T320 [P] 背景のテストを書く: SC-313、SC-305（物の複製・解体で背景が主役の半分以下の明るさ）を保つ（tests/integration/space2-backdrop.test.ts）
- [X] T321 背景を実装する（src/core/space/backdrop.ts）。物の複製・被写体の解体・闇と光で使う。seed の系列 backdrop を加える
- [ ] T322 版を上げ（backdrop-v1 を algorithms に追加し、レシピの契約を更新）、比較画像を作り、利用者の評価を受ける — 版・契約・比較画像は済み。利用者の評価待ち

## Phase 6: 基準画像の計算による背景（利用者の指示、2026-10-12）

- [X] T324 [P] 背景のテストを書き直す: SC-313（改訂）、SC-305 を保つ（tests/integration/space2-backdrop.test.ts）
- [X] T325 数式の場を戻し（src/core/space/formula.ts）、背景を数式の場から作る（src/core/space/backdrop.ts）。切り貼りの背景は削除
- [ ] T326 版を上げ、比較画像を作り、利用者の評価を受ける — 版・比較画像は済み。利用者の評価待ち

## Phase 7: 002 Phase 9 の背景（利用者の指示、2026-10-12）

- [X] T327 [P] 背景のテストを書き直す: SC-313（再改訂）（tests/integration/space2-atmosphere.test.ts）。SC-305 のテストは取りやめ
- [X] T328 002 Phase 9 の背景を戻し（src/core/space/atmosphere.ts と hdr.ts・layout.ts・flame.ts・env.ts）、手前の世界を層として合成する。数式の場と切り貼りの背景は削除
- [ ] T329 版を上げ、比較画像を作り、利用者の評価を受ける — 版・比較画像は済み。利用者の評価待ち

## Phase 8: 背景の光の形を丸以外にも（利用者の指摘、2026-10-12）

- [X] T330 [P] 形のテストを書く: SC-314（tests/integration/space2-atmosphere.test.ts）
- [X] T331 光の形（丸・縁・帯）を実装する（src/core/space/atmosphere.ts）
- [ ] T332 版を上げ、比較画像を作り、利用者の評価を受ける — 版・比較画像は済み。利用者の評価待ち

## Phase 9: 世界の型「門」（利用者の参考画像、2026-10-12）

- [X] T333 [P] 門のテストを書く: SC-315（tests/integration/space2-portal.test.ts）
- [X] T334 門を実装する（src/core/space/portal.ts）。世界の選択・画面・レシピの契約・版に加える
- [ ] T335 比較画像を作り、利用者の評価を受ける

## Phase 10: 写真を残して被写体だけを作り替える（利用者の参考画像 2 枚、2026-10-12）

- [X] T336 [P] 矩形の組み替えのテストを書く: SC-316（tests/integration/space2-mosaic.test.ts）
- [X] T337 [P] 自分で埋めるのテストを書く: SC-317（tests/integration/space2-echo.test.ts）
- [X] T338 写真を画面に置く・被写体の領域・被写体を消した写真（src/core/space/inplace.ts）
- [X] T339 矩形の組み替えを実装する（src/core/space/mosaic.ts）
- [X] T340 自分で埋めるを実装する（src/core/space/echo.ts）。世界の選択・画面・レシピの契約・版に加える
- [ ] T341 比較画像を作り、利用者の評価を受ける

## Dependencies

Phase 1 → Phase 2（テスト T304〜T308 は並行可、実装 T309 → T310〜T313）→ Phase 3 → Phase 4。
