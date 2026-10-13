---
description: "Task list for 009 open-and-extensible"
---

# Tasks: 第三者が使えるアプリと、直しやすく足しやすい作り（版 1.27）

**Input**: [spec.md](spec.md), [plan.md](plan.md), [decision.md](decision.md)

## Phase 1: 部品ごとのソース
- [X] T901 用語集（第三者・Web 版／ダウンロード版・エンジン・部品ごとのソース・バックエンド）
- [X] T902 テスト: 境界（engine は app・ui・worker・ai・DOM を使わない）。失敗を確かめる
- [X] T903 `core` → `engine` へ移す（中身は変えない）。型・全 unit・画素の記録が通る
- [X] T904 テスト: 世界の一覧・版の組・画面の選択肢・レシピの検証が登録から作られる。失敗を確かめる
- [X] T905 世界を登録式にする（`WorldDef`・`worlds/index.ts`・`shared/backdrop.ts`）。画素の記録が一致する

## Phase 2: エンジンの版
- [X] T906 テスト: 試験用のエンジンの版の組を持つレシピはそのエンジンで組み立てて描かれる。一覧にない版は断られる。Worker も一覧から描く。失敗を確かめる
- [X] T907 `engine/engines.ts`・状態の `engineId`・Worker の読み込み

## Phase 3: 保守性
- [X] T908 Worker のメッセージの型（`worker/protocol.ts`）と帯分割の除去（controller のテストを書き直す）
- [X] T909 `ui/main.ts` を分ける。`noUnusedLocals`・`noUnusedParameters`

- [X] T915 使っていないものの整理: `tools/unused.ts` で洗い出し → 利用者に一覧を見せる → 消す（FR-921, SC-907）

## Phase 4: 第三者が使える
- [X] T910 テスト: ライセンス表示に実行時の依存すべて、「このアプリについて」の e2e。失敗を確かめる
- [X] T911 `LICENSE`・`tools/notices.ts`・`THIRD_PARTY_NOTICES.md`・画面・`README.md`・`CONTRIBUTING.md`

## Phase 5: Web 公開
- [X] T912 テスト: Web 版の e2e（静的に配信・AI・通信 0 件・CSP）、ダウンロード版の e2e を `dist-single/` へ。失敗を確かめる
- [X] T913 ビルドの分割・CSP・ワークフロー
- [X] T914 版 1.27。全テスト・型・ビルド 2 種

## Phase 6: 公開前の写真の除去
- [X] T916 テスト: git が管理する画像は合成した試験用の絵だけ。失敗を確かめる
- [X] T917 合成画像の道具、テストの入力の切り替え、世界の記録の取り直し、Phase 9 の再現は写真が手元にあるときだけ
- [X] T918 公開する履歴から写真を除く（利用者と方法を決める）
