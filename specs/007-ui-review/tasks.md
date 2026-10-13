---
description: "Task list for 007 ui-review"
---

# Tasks: 画面の見直し（PC 前提、版 1.25）

**Input**: [spec.md](spec.md), [plan.md](plan.md), [decision.md](decision.md)

- [X] T701 用語集にデザインスキル・画面・PC 前提・別の世界／ひとつ戻す／別案を書く（docs/GLOSSARY.md）
- [X] T702 [P] e2e を書く: SC-701〜SC-707（tests/e2e/ui-review.spec.ts）。unit: キーを奪ってよいか（tests/unit/keys.test.ts）。失敗を確かめる
- [X] T703 既存の e2e で作品日時を触る前に「詳しい設定」を開く（tests/e2e/helpers.ts の openDetails）。版の確認を package.json に合わせる
- [X] T704 配置と写真の入れ方: layout.ts・main.ts（FR-701, FR-702, FR-704）
- [X] T705 パネルの順番と言葉: spacePanel.ts・controls.ts・exportPanel.ts・recipePanel.ts・timeControls.ts（FR-703, FR-705）
- [X] T706 色・文字・手応え・キーボード・動きを減らす: style.css・keys.ts・main.ts（FR-706〜FR-709）
- [X] T707 版 1.25。全テスト（Vitest・Playwright）・型・ビルド（SC-708）。1280×720・1440×900 の比較画像（前後）を撮って確かめる
