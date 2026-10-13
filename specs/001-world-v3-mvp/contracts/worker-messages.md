# Contract: 描画 Worker メッセージ

メインスレッド（controller）と描画 Worker の間のメッセージ。Worker は `src/core` を呼ぶだけで、
状態は持たない（画像と解析マップは `setSource` でキャッシュするのみ）。

## main → worker

| type | フィールド | 説明 |
|---|---|---|
| `setSource` | `sourceId`, `img: RgbImage`, `features` | 入力画像の登録（転送可能な ArrayBuffer で渡す） |
| `render` | `jobId`, `sourceId`, `mode: "world-v3" \| "reference-v1"`, `composition?`, `controls?`, `W`, `H`, `rowStart`, `rowEnd`, `diagnostics: boolean` | 行帯の描画 |
| `cancel` | `jobId` | 指定ジョブの残り行帯を中止 |

## worker → main

| type | フィールド | 説明 |
|---|---|---|
| `rows` | `jobId`, `rowStart`, `rowEnd`, `pixels: Uint8ClampedArray`, `diag?` | 描画済み行帯 |
| `error` | `jobId`, `message` | 失敗。controller は設定を保持したまま表示する（R12） |

## 規則

- controller は 1 ジョブを行帯（例: 64 行）に分け、複数 Worker へ配る。結果は行範囲で書き戻すので
  到着順に依存しない。
- 新しい preview ジョブを出したら、古い preview の `rows` は jobId で破棄する（R12）。
- export ジョブは開始時の snapshot を固定して送り、以後の UI 操作を反映しない（R11）。
  キャンセル時は `cancel` を送り、到着済みの行帯も破棄する。
