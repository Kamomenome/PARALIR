---
description: "Task list for 006 paraller"
---

# Tasks: paraller — 空間モードだけのシンプルなアプリ（版 1.24）

**Input**: [spec.md](spec.md), [plan.md](plan.md)

- [X] T601 用語集に paraller と版を書く（docs/GLOSSARY.md）
- [X] T602 [P] e2e を書く: SC-601〜SC-603（tests/e2e/paraller.spec.ts）。失敗を確かめる
- [X] T603 共通部品を移す（effective・toUnitFloat・書き出しの大きさと品質）。Phase 9 の再現テストが通ることを確かめる
- [X] T604 状態・書き出し・ワーカー・画面から world-v3・reference-v1 を外し、開いたら空間・名前と版・古いレシピの理由を入れる
- [X] T605 world-v3・reference-v1 のコード・テスト・道具を削除し、残りの e2e（書き出し・file://・通信 0 件など）を空間モードで書き直す
- [X] T606 全テスト・ビルド。README・CLAUDE.md・docs の冒頭を paraller に（SC-604）
