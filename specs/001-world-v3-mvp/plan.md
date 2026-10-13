# Implementation Plan: 変貌世界アプリ MVP（world-v3）

**Branch**: `001-world-v3-mvp` | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-world-v3-mvp/spec.md`

## Summary

写真1枚と作品日時・別案番号から seed を作り、用途別の擬似乱数と画像解析で構成（粒度場・粗い断片・
渦変形・色）を決め、粗C／中M／細F を一枚に混在させた画像を生成する、端末内処理のブラウザアプリ。
乱数なしの基準変換 reference-v1 は別モードとして移植し、承認画像との誤差を報告する。

技術方針: TypeScript + Vite の素の DOM アプリ。中核（`src/core`）は DOM 非依存の純関数群で Vitest で
テストし、描画は CPU（倍精度）を行帯ごとに Web Worker へ分割する。配布は単一 HTML ファイル。
詳細は [research.md](research.md)。

## Technical Context

**Language/Version**: TypeScript 5.x（strict）、ES2022。基準検証のみ Python 3.12（`.venv`）

**Primary Dependencies**: 実行時 `temporal-polyfill`。開発時 `vite`、`vite-plugin-singlefile`、`vitest`、
`@playwright/test`、`pngjs`、`tsx`

**Storage**: なし（レシピ JSON と PNG は利用者がファイルとして保存・読込）

**Testing**: Vitest（`src/core` の単体・結合、Node 環境）、Playwright Chromium（ブラウザ一致・通し・性能）

**Target Platform**: Windows 11 上のデスクトップ版 Chromium 系ブラウザ（Edge / Chrome）。他ブラウザは対象外

**Project Type**: 単一のフロントエンド Web アプリ（サーバーなし）

**Performance Goals**: 960×720 プレビュー 250ms 以内、2400×1800 書き出し 10 秒以内（仮目標・実測して報告）

**Constraints**: 端末内処理のみ（外部送信なし）、入力 ≤20MiB かつ ≤1200万画素（仮）、描画結果は Worker 数・
行帯分割・出力解像度に依存しない、`Math.random`・現在時刻を描画処理で使わない

**Scale/Scope**: 1 画面、操作項目 8 個前後、入力画像 1 枚、利用者 1 人

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テストファースト | ✅ | Vitest/Playwright を用意し、tasks では各実装の前にテストタスクを置く。A01〜A11 を自動テスト化、A12 は比較シート＋利用者評価 |
| II. ロジックと UI の分離 | ✅ | `src/core` は DOM・Worker 非依存。UI と Worker は core を呼ぶだけ |
| III. 端末内で完結するブラウザアプリ | ✅ | サーバーなし・外部送信なし。単一 HTML をダブルクリックで起動（file:// での Worker 動作は Q13 で確認） |
| IV. ユーザーデータの保護 | ✅ | 画像は端末内のみ。保存はブラウザのダウンロード（一括書き込み）。レシピは版付きで、未知の版は拒否 |
| V. シンプルさ | ✅ | UI フレームワークなし。依存はそれぞれ理由を research に記載（R-01〜R-03, R-08, R-12） |
| VI. 決定的な再現性と基準の保護 | ⚠️ 条件付き ✅ | 乱数は seed 由来・消費回数固定。基準コード・承認画像は変更しない。ただし JS 版 reference-v1 は Python とビット一致できないため誤差報告とする（下記 Complexity Tracking と research R-05） |

**Post-design re-check**: data-model・contracts でも上記は維持されている。`compose` だけが乱数を消費し、
描画は行範囲に依存しない純関数（contracts/core-api.md）。ゲート通過。

## Project Structure

### Documentation (this feature)

```text
specs/001-world-v3-mvp/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── recipe.schema.json
│   ├── core-api.md
│   └── worker-messages.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks で作成
```

### Source Code (repository root)

```text
index.html
package.json / tsconfig.json / vite.config.ts / vitest.config.ts / playwright.config.ts
src/
├── core/                 # DOM 非依存。すべてここでテストする
│   ├── image/            # 白合成・crop・サイズ検査
│   ├── hash/             # SHA-256、pixelHash
│   ├── seed/             # seedInput、用途別 seed、サブ系列
│   ├── prng/             # seeded32-v1
│   ├── time/             # TimeSnapshot（temporal-polyfill）
│   ├── analysis/         # analysis-v1（縮小・全体統計・局所マップ）
│   ├── math/             # mirror、positiveMod、bilinear(reflect)、smoothstep
│   ├── reference/        # reference-v1
│   ├── world/            # compose・粒度場・粗C・中M・細F・色・renderWorldRows・samplePoint
│   ├── recipe/           # 生成・検証・読込
│   └── presets/          # world-v3-draft.json（unevaluated）
├── worker/render.worker.ts
├── app/                  # controller（ジョブ管理・snapshot・キャンセル）、decode（createImageBitmap）
└── ui/                   # main.ts、controls、比較表示、診断表示、進捗・エラー
tests/
├── unit/                 # core の各モジュール
├── integration/          # determinism・resolution・composition・grain・edge-images・recipe
├── e2e/                  # prng（ブラウザ一致）・jobs・recipe・perf
└── fixtures/             # prng-vectors.json、合成テスト画像の生成関数
tools/
├── reference-diff.ts     # JS reference-v1 と approved.png の誤差
└── compare-sheet.ts      # A12 比較シート
docs/                     # 正本と参照一式（変更しない）
```

**Structure Decision**: 単一プロジェクト。正本 §9 のモジュール分割（image-input / analysis / seed /
composition / renderer / controller / recipe / ui）を `src/core/*`・`src/app`・`src/ui` に対応させた。
`docs/reference/` の基準コード・画像は読み取り専用で参照する。

## Implementation Order

正本 docs/TASKS.md の T01〜T10 に従う。

1. T01: 同梱 verify の実行結果を記録（済: Windows では誤差あり）。JS 版 reference-v1 を移植し誤差を報告
2. T02〜T03: 正規化 RGB・解析・時刻・seed・PRNG（テストベクトル固定）
3. T04〜T05: 基準ワープのパラメーター化（基準値で reference-v1 の出力が不変）→ 粗C・中M・細F を個別表示
4. T06〜T07: 粒度場と合成 → 比較シートで利用者評価（A12）
5. T08〜T09: UI・ジョブ管理・レシピ・書き出し
6. T10: 性能測定・必要なら高速化・統合確認・報告

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| アプリ版 reference-v1 を承認画像との完全一致ではなく誤差報告（平均≤1・p99≤3 の暫定目標）で評価する | JS の倍精度・`Math.sin` 等は NumPy float32 の実装と一致せず、同梱 Python ですら Windows では完全一致しない（最大誤差 1）。正本 §10 も「画素一致は同一数値環境内の要件」とする | 完全一致を必須にすると達成不能。float32 を JS で模倣しても超越関数の実装差は残る。承認画像を差し替える方法は憲法 VI で禁止 |
| 実行時依存 `temporal-polyfill` の追加 | 夏時間の gap/ambiguous を正しく解決し、ブラウザと Node で同じ結果を得るため | `Intl` からの自前解決は境界条件の誤りリスクが高く、そのテストのほうが大きくなる |
