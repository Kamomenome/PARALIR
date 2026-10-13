# Implementation Plan: 写真の部品を AI で見分ける（parts-v1）

**Branch**: `004-ai-parts` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

## Summary

写真を読み込んだら端末内で MediaPipe を一度動かし、部品（人物の部品・顔の特徴点・人以外の主役の切り抜き）を 8 ビットのマスクと点にまとめる（PhotoParts）。
空間モードの被写体と、「自分で埋める」「矩形の組み替え」の素材選びだけがそれを使う。生成は数式のまま。根拠は [research.md](research.md)。

## Technical Context

**Language/Version**: TypeScript（既存と同じ）
**Primary Dependencies**: `@mediapipe/tasks-vision`（追加。Apache-2.0）。必要性: 人物の部品・顔の特徴点・指定点の切り抜きを端末内で得る手段で、
同等の精度を数式だけで得る方法がない（003 の推定の限界は decision.md の比較画像で確認済み）。モデル 3 つ（同 Apache-2.0）はビルド時に同梱
**Testing**: Vitest（部品を与えたときの被写体・素材選び・決定性・要約）、Playwright（file:// で AI が動き通信 0 件、失敗時の代替）
**Target Platform**: 既存と同じ（Windows 11 の Edge / Chrome、端末内処理）
**Performance Goals**: 置かない（速さより質）。部品づくりの時間は記録する
**Constraints**: 外部通信 0 件、file:// で動く、生成は数式、決定性（同じブラウザで同じ部品）

## Constitution Check

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テストファースト | ✅ | 生成側は部品を与えるテストを先に書く。AI はブラウザのテストを先に書く |
| II. ロジックと UI の分離 | ✅ | 部品の型と使い方は `src/core/parts`（DOM 非依存）。MediaPipe を呼ぶのは `src/ai` だけ |
| データを外へ送らない | ✅ | 実行環境とモデルを HTML に同梱。通信 0 件を e2e で確認 |
| 依存の追加は plan に必要性を書く | ✅ | 上の Primary Dependencies |

## Project Structure

```text
src/core/parts/types.ts     PhotoParts（版・解像度・部品マスク・物のマスク・顔の点・要約）、要約の計算、部品の問い合わせ（領域・顔の範囲・目の範囲）
src/ai/assets.ts            同梱した実行環境とモデルを blob URL / バイト列にする
src/ai/parts.ts             MediaPipe で PhotoParts を作る（ブラウザのみ）
src/core/space/object.ts    mainObject に部品を渡せるように（人物 → 物 → 推定）
src/core/space/echo.ts      顔の列・目の列
src/core/space/mosaic.ts    拡大の素材を顔・目・体の肌から
src/app, src/worker         部品を読み込み時に作り、描画の依頼に添える。レシピに版と要約
tools/fetch-models.ts       モデルを取得して SHA-256 を確かめる（モデルはリポジトリに入れない）
tools/parts-extract.ts      Playwright で写真の部品を作り out/parts に保存（比較画像用）
```

## Complexity Tracking

| 増えるもの | 理由 | より単純な案を退けた理由 |
|---|---|---|
| 単一 HTML が 40〜60MB | file:// で通信 0 件のまま AI を動かすには同梱しかない | 別ファイルのモデルは file:// で読めない |
| 部品をワーカーへ渡す | 描画はワーカーで行う | ワーカー内で AI を動かすと file:// のワーカー制約（classic・blob）で複雑になる |
