---
description: "Task list for 008 reliability"
---

# Tasks: 信頼性と堅牢性（版 1.26）

**Input**: [spec.md](spec.md), [plan.md](plan.md), [decision.md](decision.md)

## Phase 1: 再現の守り
- [X] T801 用語集に「信頼性・堅牢性のチェック」「再現の守り」を書く
- [X] T802 世界の記録: helpers・道具・テスト（FR-801）。記録し、描画の数値を 1 か所変えて失敗することを確かめて戻す（SC-801）
- [X] T803 [P] テスト: レシピの `app`（版と commit）と断るときの案内（FR-802）。失敗を確かめる → 実装（vite の define で commit）

## Phase 2: Worker とメモリ
- [X] T804 テスト: controller（2 つまで・プレビュー 1 つまで・落ちたら作り直し・写真の送り直し）、handler（写真 2 枚）、partsFor の時間切れ。失敗を確かめる
- [X] T805 実装（FR-804〜FR-808）

## Phase 3: 写真を替えたときの順番
- [X] T806 テスト: e2e（2 枚続けて選ぶ・替えた直後に失敗なし）、unit（レシピの読み込みの判断）。失敗を確かめる
- [X] T807 実装（FR-809〜FR-811）

## Phase 4: セキュリティの細かい点
- [X] T808 テスト: decode の大きさ・辺、レシピの大きさ・深さ、枠の外へのドロップ、右ボタンの囲み、ビルドの CSP（file://）。失敗を確かめる
- [X] T809 実装（FR-812〜FR-816）

## Phase 5: 片付け
- [X] T810 qualityMode を standard に、exportQuality をなくす（FR-817）
- [X] T811 使われていないコード・資料を消す、古い文書の注記、README の版（FR-818）
- [X] T812 npm audit fix（source-map-js）（FR-819）
- [ ] T813 版 1.26。全テスト（Vitest・Playwright）・型・ビルド（SC-806）
