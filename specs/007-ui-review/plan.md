# Implementation Plan: 画面の見直し（PC 前提、版 1.25）

**Branch**: `007-ui-review` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

## Summary

`src/ui/` の画面だけを変える。描画（`src/core`・`src/worker`・`src/app`）は変えない。
配置を「左に絵の場所・右にパネル、画面の高さちょうど」にし、写真の入れ方・パネルの順番・言葉・色・手応え・キーボードを仕様どおりにする。

## Technical Context

**Language/Version**: TypeScript（既存と同じ） / **Dependencies**: 変更なし（外部フォントも読まない。アプリは外部通信を止めている）
**Testing**: 新しい e2e `tests/e2e/ui-review.spec.ts`（SC-701〜SC-707）を先に書いて失敗を確かめる。既存の e2e は、作品日時を触る前に「詳しい設定」を開く（helpers の `openDetails`）

## Constitution Check

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テストファースト | ✅ | SC ごとの e2e を先に書く |
| II. ロジックと UI の分離 | ✅ | 変えるのは `src/ui` だけ。キーボードの判定（奪ってよい場面か）は小さな関数にして unit テストする |
| データを外へ送らない | ✅ | 変更なし（既存の e2e で確認）。ドラッグで入れた写真も端末内で読む |

## デザインの決まり（トークン）

| 名前 | 値 | 使う場所 |
|---|---|---|
| 壁 `--wall` | `#1f1f1f` | 絵の場所の背景（無彩色。作品の色を引っ張らない） |
| パネル `--panel` | `#292929` | 操作パネル |
| 線 `--line` | `#3d3d3d` | 区切り・ボタンの縁・空のときの枠 |
| 文字 `--ink` | `#e8e8e8` | 本文 |
| 控えめ `--muted` | `#a3a3a3` | 補足・案内（パネルとの比 約 5.8） |
| 主な操作 `--key` | `#f0f0f0` 地に `#1f1f1f` 文字 | 「別の世界」だけ |
| 失敗 `--error` | `#ff8a7a` | 失敗の文だけ（色を持つ唯一の部品） |

- 文字: `system-ui, 'Yu Gothic UI', 'Meiryo UI', sans-serif`。名前 20px/600、本文 14px、補足 12px。数値は `tabular-nums`
- 見出しは「詳しい設定」の開閉だけ。まとまりは間隔と細い線で分ける（飾りの見出し・番号・全部大文字のラベルは使わない）
- 角丸は 4px（ボタン・選択）と 0（絵）。影は使わない
- 動き: 描いている間の絵の暗さ（opacity 0.72、0.15s）だけ。`prefers-reduced-motion: reduce` で 0s

## 配置

```
┌────────────────────────────────────────┬──────────────────┐
│ .stage（壁）                              │ .panel（320px）    │
│  .frame（container: size）                │ paraller ver 1.25 │
│    canvas: width = min(100cqw, 100cqh*4/3) │ 世界 [おまかせ ▾]   │
│    svg.lasso（canvas の上）                 │ 説明一行            │
│    .drop（写真がないとき）                   │ [ 別の世界  Space ] │
│    progress（描いている間だけ、絵の下端）       │ ひとつ戻す  別案 0   │
│  .caption                                │ スライダー ×5       │
│    名前 大きさ・部品の状態 | 囲みの案内 消す 別の写真 │ 書き出す・レシピを保存 │
│    notices / errors                      │ ▸ 詳しい設定 日時    │
└────────────────────────────────────────┴──────────────────┘
```

- `#app`: `grid-template-columns: 1fr 320px; height: 100vh; overflow: hidden`
- 囲みの重ね（svg）は `.frame` の中に置き、canvas の大きさの変化を `ResizeObserver` で追う

## 変えるファイル

- `src/ui/layout.ts`: 絵の場所（frame・drop・caption）とパネルの骨組み、ドラッグで入れる
- `src/ui/spacePanel.ts`: 世界の短い名前と説明、部品の状態・囲みの案内を caption へ出せるように分ける
- `src/ui/controls.ts`: 別の世界（主）・ひとつ戻す・別案 N、キーを添える
- `src/ui/exportPanel.ts`・`recipePanel.ts`・`timeControls.ts`: 置き場所と言葉、キャンセルは書き出し中だけ、読み込みはボタン
- `src/ui/keys.ts`（新）: Space・Ctrl+Z を奪ってよいかの判定（unit テスト）
- `src/ui/main.ts`: 組み立て、進み具合・暗さ・カーソル、写真の読み込みを 1 つの関数に（選ぶ・ドラッグ・別の写真）
- `src/ui/style.css`: 上のトークンで書き直す
- `package.json`: 1.25.0
