---
description: "Task list for 005 主題の世界と、ざっくり囲む範囲"
---

# Tasks: 主題の世界と、ざっくり囲む範囲（theme-v1）

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md)

## Phase 1: 言葉と手順

- [X] T501 用語集（docs/GLOSSARY.md）に「基準画像」などを書き、CLAUDE.md に SDD の手順と用語集の参照を書く

## Phase 2: Phase 9 の描画を戻す（FR-501）

- [X] T502 [P] 気に入った 16 枚の画素の SHA-256 を記録し（tests/fixtures/phase9-hashes.json）、再現のテストを書く: SC-501（tests/integration/p9-reproduce.test.ts）
- [X] T503 src/core/space/p9/ に 002 Phase 9 を元のまま戻す

## Phase 3: 主題の世界 (US1, P1) 🎯

- [X] T504 [P] 主題の世界のテストを書く: SC-502（tests/integration/space2-theme.test.ts）
- [X] T505 主題の世界（src/core/space/theme.ts・mosaic.ts の下地・world.ts・seeds・types・契約・画面の型の一覧）

## Phase 4: ざっくり囲む (US2, P1)

- [X] T506 [P] 囲みの範囲のテストを書く: SC-503（tests/unit/lasso.test.ts・tests/integration/space2-lasso.test.ts）
- [X] T507 囲み → 範囲（src/core/parts/lasso.ts）、囲みの中の点で切り出す（src/ai/parts.ts）
- [X] T508 [P] e2e のテストを書く: SC-504（tests/e2e/lasso.spec.ts）
- [X] T509 囲みの操作・状態・レシピ・描画の依頼（src/ui・src/app・src/worker・レシピの契約）

## Phase 6: 主題の世界にも円以外の光の形（利用者の指摘、2026-10-12）

- [X] T511 [P] テストを書く: SC-506（tests/integration/space2-theme.test.ts）
- [X] T512 p9 の描画に光の形を入れる（形の指定がなければ元のまま）。主題の世界で seed が形を選ぶ（src/core/space/p9/composite.ts・theme.ts、版 theme-v2）
- [ ] T513 比較画像を作り、評価を受ける

## Phase 5: 確かめる

- [ ] T510 利用者の写真で比較画像（自動の範囲・囲んだ範囲）を作り、評価を受ける: SC-505
