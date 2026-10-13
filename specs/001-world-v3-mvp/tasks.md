---

description: "Task list for 変貌世界アプリ MVP（world-v3）"
---

# Tasks: 変貌世界アプリ MVP（world-v3）

**Input**: Design documents from `/specs/001-world-v3-mvp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 憲法 原則I（テストファースト・必須）により、各ストーリーでテストタスクを実装タスクより先に置く。
テストは書いた時点で失敗することを確認してから実装に進む。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**正本**: 数値の定義は docs/SPEC.md・docs/REFERENCE_METHOD.md。`docs/` 配下（特に `docs/reference/` の
基準コード・承認画像）は変更しない（憲法 VI）。係数は `unevaluated` のまま扱い、US5 で利用者が選ぶまで固定しない。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 `package.json` を作成し、scripts（`dev`=vite、`build`=vite build、`test`=vitest run、`test:e2e`=playwright test）と依存（実行時 `temporal-polyfill`、開発時 `vite`・`typescript`・`vite-plugin-singlefile`・`vitest`・`@playwright/test`・`pngjs`・`@types/pngjs`・`tsx`）を定義して `npm install` する（package.json）
- [X] T002 `tsconfig.json` を strict・ES2022・`lib: ["ES2022","DOM","WebWorker"]`・`moduleResolution: "bundler"` で作成する（tsconfig.json）
- [X] T003 [P] `vite.config.ts` に `vite-plugin-singlefile` と `worker: { format: "es" }` を設定し、Worker を inline で同梱する（vite.config.ts）
- [X] T004 [P] `vitest.config.ts` を Node 環境・対象 `tests/unit/**` と `tests/integration/**` で作成する（vitest.config.ts）
- [X] T005 [P] `playwright.config.ts` を Chromium のみ・`webServer: npm run dev`・対象 `tests/e2e/**` で作成し、`npx playwright install chromium` を実行する（playwright.config.ts）
- [X] T006 [P] `index.html` と空の `src/ui/main.ts` を作成し、`.gitignore` に `node_modules/`・`dist/`・`out/`・`test-results/`・`playwright-report/` を追加する（index.html, src/ui/main.ts, .gitignore）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 全ストーリーが使う数値基盤・入力正規化・基準の変形計算（パラメーター化）・描画 Worker・ジョブ管理・画面の骨組み

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundational（先に書いて失敗を確認）

- [X] T007 [P] 数値ユーティリティのテストを書く: `positiveMod(t,2)=t-2*floor(t/2)` が負数でも [0,2)、`mirror(t)=1-abs(positiveMod(t,2)-1)` の値域 0〜1・周期 2、`clip`、`smoothstep f(t)=t²(3-2t)`、双線形補間（重み `(1-dx)(1-dy), dx(1-dy), (1-dx)dy, dx*dy`、範囲外は `mode='reflect'` 相当）（tests/unit/math.test.ts）
- [X] T008 [P] 入力正規化のテストを書く: 透過の白合成（α=0 → 白、α=255 → 元色、中間 α は `round(c*a/255 + 255*(1-a/255))`）、crop（四辺 px、0 は不変）、サイズ検査（「≤ 20 MiB」かつ「width×height ≤ 12,000,000」を超えると拒否、width/height「1 以上」）（tests/unit/image.test.ts）
- [X] T009 [P] ハッシュのテストを書く: `pixelHash = SHA256(widthBE32 ‖ heightBE32 ‖ rowMajorRGB8)`・hex 小文字 64 桁を、Node の `crypto.createHash` で独立に計算した期待値と照合（2×1 などの小画像）（tests/unit/hash.test.ts）
- [X] T010 [P] 基準の変形場を Python から書き出すスクリプトを作る。`docs/reference/numerical_metamorphosis.py` は変更せず、同じ式を NumPy float32 で別ファイルに書き、固定の 200 点（中心近傍・枝切り近傍を含む）の rho・theta・flow・spiral・u・v・u2・v2・m・hue・solar を JSON に出力する。`.venv\Scripts\python.exe` で実行して fixture を生成する（tools/py/dump_reference_points.py, tests/fixtures/reference-points.json）
- [X] T011 [P] 基準の変形場・色変換のテストを書く: T010 の fixture と既定パラメーターの JS 実装が絶対誤差 1e-4 以内（float32 と倍精度の差を許容）。角度反復数に非整数を渡すと例外。中心と完全一致する点の角度は 0（NaN なし）（tests/unit/reference-warp.test.ts）
- [X] T012 [P] ジョブ管理のテストを書く（偽 Worker を注入）: 行帯 64 行への分割、到着順が逆でも同じ出力、新しい preview を出すと古い preview の行帯を破棄、cancel で残りを中止、Worker の error で状態 `failed` になり設定は保持（tests/unit/controller.test.ts）
- [X] T013 [P] テスト用画像を作るスクリプトを書いて実行し（Pillow: EXIF Orientation=6 の 40×20 JPEG、半透明を含む PNG、上限超過を模した巨大寸法ヘッダの PNG、画素が同じでメタデータ（tEXt）だけ違う PNG 2 枚）、読込の E2E を書く: EXIF Orientation=6 の JPEG が 20×40 に正立する、半透明 PNG で白合成の通知が出る、上限超過は理由つきで拒否される（tools/py/make_fixtures.py, tests/fixtures/images/, tests/e2e/decode.spec.ts）

### Implementation for Foundational

- [X] T014 [P] `positiveMod`・`mirror`・`clip`・`smoothstep`・`bilinearReflect` を実装する（src/core/math/index.ts）
- [X] T015 [P] `RgbImage` 型、`compositeWhite`、`crop`、`validateSize` を data-model.md の規則どおり実装する（src/core/image/normalize.ts）
- [X] T016 [P] Web Crypto の `sha256(bytes)` と `pixelHash(img)` を実装する（src/core/hash/sha256.ts）
- [X] T017 REFERENCE_METHOD §4.1〜4.5 の変形場をパラメーター化して実装する。`ReferenceWarpParams`（3 中心・log 係数 1、-0.82、0.25・epsilon 0.012/0.012/0.020・swirl 0.78・angularRepeats=8（整数）・radialRepeats=3・状態2のオフセット 0.38/-0.28/0.8/0.9・phase）と既定値 `REFERENCE_PARAMS` を定義し、v2 に phase 項を入れない（src/core/reference/warp.ts）
- [X] T018 REFERENCE_METHOD §4.6 の YIQ 回転・ソラリゼーション・トーン曲線・`floor(clip(T*255,0,255))` を実装する。ICC や線形化はしない（src/core/reference/color.ts）
- [X] T019 ブラウザでの読込を実装する: ファイルの SHA-256、`createImageBitmap(blob, { imageOrientation: "from-image", colorSpaceConversion: "none", premultiplyAlpha: "none" })` → OffscreenCanvas で RGBA → `compositeWhite`、サイズ検査、透過があったかどうかのフラグ（src/app/decode.ts）
- [X] T020 contracts/worker-messages.md のとおり描画 Worker を実装する（`setSource`・`render`・`cancel`、`rows`・`error`）。モードごとの描画関数はレジストリで差し込む（src/worker/render.worker.ts）
- [X] T021 ジョブ管理を実装する: 単調増加 jobId、行帯分割、Worker プール（`max(1, hardwareConcurrency-1)`）、最新 preview 以外の結果を破棄、cancel、失敗時に設定を保持（src/app/controller.ts）
- [X] T022 画面の骨組みを作る: 写真の選択、960×720 プレビュー用キャンバス、進捗表示、エラー・通知の表示領域（src/ui/main.ts, src/ui/layout.ts, src/ui/style.css）

**Checkpoint**: 数値基盤と描画の仕組みが揃い、T013 の読込 E2E が通る。各ストーリーの実装を始められる

---

## Phase 3: User Story 1 - 写真から変貌世界を生成し、同じ条件で呼び戻す (Priority: P1) 🎯 MVP

**Goal**: アプリを開いた時点の現在日時（以後固定）と別案番号 0 から seed を作り、画像特徴を反映した粗C・中M・細F 混在の変貌世界をプレビュー表示する。同じ条件なら同じ画像になる。

**Independent Test**: 任意の写真を固定日時・別案番号で2回生成して画素一致を確認し、診断表示で粗中細マスクと粗い断片の切出し元を確認する（quickstart Q3〜Q7, Q9）。

### Tests for User Story 1（先に書いて失敗を確認）

- [X] T023 [P] [US1] 仕様の PRNG を Python で独立に実装し、固定 seed（全 0・全 0xFF・`SHA256("test")`）の先頭 16 個を出力して fixture を作る（tools/py/prng_vectors.py, tests/fixtures/prng-vectors.json）
- [X] T024 [P] [US1] PRNG のテストを書く: fixture と完全一致、seed 先頭 16 bytes を UInt32BE×4 で読む、全 0 なら最後の状態を 1、`uniform(a,b)=a+(b-a)*u`、`intIn(a,b)=a+floor((b-a+1)*u)`（tests/unit/prng.test.ts）
- [X] T025 [P] [US1] seed のテストを書く: `seedInput = ["world-v3", pixelHash, instantEpochMs, localDateTime, timeZone, offsetMinutes, variationIndex]` の `JSON.stringify` 文字列が期待どおり、rootSeed・5 用途 seed（`SHA256(rootSeedBytes ‖ UTF8(name))`）が Node crypto による独立計算と一致、サブ系列 `patch/000` 等を追加しても layout 系列が変わらない、T013 の「画素が同じでメタデータだけ違う PNG 2 枚」で fileSha256 は異なり pixelHash と rootSeed は同じ（FR-006）（tests/unit/seed.test.ts）
- [X] T026 [P] [US1] 日時のテストを書く: `localDateTime` は `YYYY-MM-DDTHH:mm:ss.SSS` 固定桁、`instantEpochMs` は 10 進整数文字列、`Asia/Tokyo` の通常時刻、`America/New_York` の 2026-03-08 02:30（gap）と 2026-11-01 01:30（ambiguous）が `compatible` で解決され `resolution` が記録される、`snapshotNow(nowMs, tz)` は渡された時刻だけを使う（tests/unit/time.test.ts）
- [X] T027 [P] [US1] 画像解析のテストを書く（docs/SPEC.md §4）: 解析サイズ（長辺 256、短辺 `max(1,floor(256*short/long+0.5))`、小さい入力は拡大しない）、L・K（母標準偏差、`clip(2*std,0,1)`）・S・36 ビン色相（S 重み、1.0 は最後のビン）・H（64 ビン、`-Σp log2 p / 6`、0log0=0）・`E = mean(G)`（data-model.md の解釈）・D<1e-6 で P=0・HSV の最大値同点は R→G→B、勾配マップの境界は端画素複製、黒・白・単色・1×1 で全値が有限（tests/unit/analysis.test.ts）
- [X] T028 [P] [US1] 構成のテストを書く: 同じ入力で `compose` が deepEqual（A02）、variationIndex または日時を変えると patches・粒度格子が変わる（A04）、Controls を変えても乱数から引いた値の列が同じ（FR-021）、角度反復数がすべて整数（FR-017）、`featureInfluence` 0 と 1 で変形パラメーターが変わる（A05）（tests/integration/composition.test.ts）
- [X] T029 [P] [US1] 粒度のテストを書く: 既定で粗/中/細の面積比が 40/35/25% に ±5% 以内、`shapeRetention` を 0.2→0.5→0.8 と上げると粗の面積比が単調増加（A08）、`grainVariation=0` でゼロ除算せず一層または隣接二層に割当て、粒度の境界帯以外は一層の重みが 1、粗い領域の勾配エネルギー（`mean(sqrt(gx²+gy²))`）が元写真の対応する切出し元の 0.7 倍以上（ぼかし・低解像度化でないこと。0.7 は暫定値）（FR-015）（tests/integration/grain.test.ts）
- [X] T030 [P] [US1] 決定性と解像度独立のテストを書く: 同じ入力で 2 回描画して不一致 0 画素（A02）、行帯 1 個と 7 個で同じ出力、960×720 と 2400×1800 のどの画素も `samplePoint(その画素の正規化座標)` と層重み・サンプル座標・RGB が一致（A09）（tests/integration/determinism.test.ts, tests/integration/resolution.test.ts）
- [X] T031 [P] [US1] 画像特徴の効果のテストを書く: 同じ画素を並べ替えて同じヒストグラムにした 2 画像で、同じ日時・別案でも局所変位が異なる（A06）（tests/integration/features-effect.test.ts）
- [X] T032 [P] [US1] 異常画像のテストを書く: 黒・白・単色・無彩色グレー・1×1・2×1・極端な縦長で、解析・構成・描画の全段で NaN なし・例外なし（A11）（tests/integration/edge-images.test.ts）
- [X] T033 [P] [US1] ブラウザでの PRNG 一致の E2E を書く: ページ内で T023 の seed から先頭 16 個を計算し fixture と一致（A03）（tests/e2e/prng.spec.ts）
- [X] T034 [P] [US1] 生成の通し E2E を書く: 写真を読み込むとプレビューが表示され、診断表示に粗中細マスクと切出し元の枠が出る、写真を読み込み直しても作品日時はアプリを開いた時の値のまま（tests/e2e/us1-generate.spec.ts）
- [X] T035 [P] [US1] 外部送信がないことの E2E を書く: `page.on("request")` で全リクエストを記録し、読込・生成・診断表示の間に開発サーバー以外のホストへのリクエストが 0 件（FR-002）（tests/e2e/no-network.spec.ts）

### Implementation for User Story 1

- [X] T036 [P] [US1] `Seeded32`（seeded32-v1、`Math.imul` と `>>> 0`）と `uniform`・`intIn` を実装する（src/core/prng/seeded32.ts）
- [X] T037 [P] [US1] `TimeSnapshot` 型、`snapshotFromLocal`、`snapshotNow` を `temporal-polyfill` で実装する（src/core/time/snapshot.ts）
- [X] T038 [US1] `buildSeedInput`・`deriveSeeds`・`subStreamSeed` を実装する（T016, T036 に依存）（src/core/seed/seeds.ts）
- [X] T039 [P] [US1] 面積平均の縮小と解析サイズの計算を実装する（src/core/analysis/downsample.ts）
- [X] T040 [US1] 全体統計（L,K,S,色相36ビン,H,`E = mean(G)`,D,P）と局所マップ（Y,S,gx,gy,G）と `neutralFeatures` を実装する（src/core/analysis/features.ts）
- [X] T041 [P] [US1] 未評価の係数一式を作る: 粒度比 0.40/0.35/0.25、粗い断片の幅 画面幅の 10〜35%、種点 5×4=20、格子 4×4 と 9×9（重み 0.7/0.3）、`raw = 0.55N + 0.25G + 0.20S`、細F の反復倍率 1.5〜2、`status: "unevaluated"`（src/core/presets/world-v3-draft.json, src/core/presets/types.ts）
- [X] T042 [US1] 粒度場を実装する: grainSeed の格子座標 ID ごとのサブ系列、smoothstep 補間、固定解析グリッド（出力平面 256×192）での分位しきい値、短い smoothstep 帯のなじませ、`grainVariation=0` の分岐規則（src/core/world/grainField.ts）
- [X] T043 [US1] 粗C を実装する: 5×4 ジッター種点の重み付きボロノイ領域、各パッチのサブ系列（`patch/000`〜）で切出し中心（G・K 重み付き候補、静かな領域の下限重みあり）・倍率・回転・反転、等方座標での回転、弱い変位、画像外にはみ出す場合の中心・倍率の調整、内部に鏡面折返しを入れない（src/core/world/coarsePatches.ts）
- [X] T044 [US1] 中M・細F を実装する: T017 の `ReferenceWarpParams` を warpSeed で小さく揺らし、角度反復数を `4+8H` を中央値とする整数候補から選ぶ。細F は M の 1.5〜2 倍（整数）にし、局所勾配 gx・gy に比例した変位を加える（src/core/world/warpLayers.ts）
- [X] T045 [US1] 色を実装する: T018 を基に、色相位相を P・D に偏らせて colorSeed から選び、振幅を S で調整し、粗C では弱め、`colorChange` で元色と混合する（src/core/world/colorLayer.ts）
- [X] T046 [US1] `compose` を実装する（乱数を消費するのはここだけ。消費回数は features・controls に依存させない）（src/core/world/compose.ts）
- [X] T047 [US1] `renderWorldRows`・`samplePoint`・診断出力（層マスク・粗パッチの ID と切出し元座標）を実装する。乱数を使わず、行範囲に依存しない（src/core/world/render.ts）
- [X] T048 [US1] Worker に world-v3 モードを登録し、controller から 960×720 プレビュージョブを出せるようにする（src/worker/render.worker.ts, src/app/controller.ts）
- [X] T049 [US1] アプリ状態を作る: **アプリを開いた時**に `snapshotNow(Date.now(), 端末TZ)` で作品日時を作って固定する（写真の読込では変えない）。variationIndex=0、既定 Controls、写真読込時に解析 → seed → compose → プレビュー（src/app/state.ts, src/ui/main.ts）
- [X] T050 [US1] 透過 PNG を白で合成したことの通知と、読込エラー（形式・破損・サイズ超過）の理由表示を作る（src/ui/notices.ts）
- [X] T051 [US1] 診断表示を作る: 粗中細マスクの色分け表示、粗パッチの切出し元を元写真上に枠で表示（A07）（src/ui/diagnostics.ts）

**Checkpoint**: 写真から変貌世界を生成・再現・診断でき、US1 単独で価値がある

---

## Phase 4: User Story 2 - 承認済み基準画像を再現する (Priority: P2)

**Goal**: 同梱 Python で A01 を記録し、アプリの基準再現モード（reference-v1）で承認画像との誤差を測って報告する。

**Independent Test**: `tools/reference-diff.ts` で JS 版の誤差が暫定目標（平均≤1・p99≤3）内であること、同一環境で 2 回の実行が一致することを確認する（quickstart Q1, Q2）。

### Tests for User Story 2（先に書いて失敗を確認）

- [X] T052 [P] [US2] 基準描画のテストを書く: `docs/reference/decoded-source.png` を pngjs で読み、上5px・下6px を crop、2400×1800 を描画して `docs/reference/approved.png` との 8bit 誤差が平均≤1・p99≤3、同じ入力で 2 回描画して不一致 0 画素（tests/integration/reference-render.test.ts）
- [X] T053 [P] [US2] crop が基準モードだけに適用されるテストを書く: world-v3 の Preprocess は四辺 0、reference-v1 は top=5・bottom=6（FR-004）（tests/unit/reference-mode.test.ts）
- [X] T054 [P] [US2] モード切替の E2E を書く: 基準再現モードに切り替えると crop 上5px・下6px・出力 2400×1800 の設定が表示され、レシピ保存ボタンが無効になる。world-v3 に戻すと crop が四辺 0 になる（tests/e2e/mode-switch.spec.ts）

### Implementation for User Story 2

- [X] T055 [US2] 同梱 verify の結果を記録する: Windows 11 / Python 3.12.15 での出力（identical_rgb=false、最大 1、平均 0.0022）と、Linux 同等環境での確認が未実施であることを書く（specs/001-world-v3-mvp/reference-verification.md）
- [X] T056 [US2] `renderReferenceRows` を T017・T018 を使って実装する（`map_coordinates(order=1, mode='reflect')` 相当の補間、linspace 両端を含む座標、160 行の分割に依存しない）（src/core/reference/render.ts）
- [X] T057 [US2] 誤差レポートのツールを作る: 平均・p99・最大・誤差>3 画素率・両者の RGB SHA-256 を JSON で `out/reference-diff.json` に出力し、結果を reference-verification.md に追記する（tools/reference-diff.ts）
- [X] T058 [US2] Worker に reference-v1 モードを登録し、画面にモード切替を作る。基準モードでは `docs/presets/approved-v1.json` の crop・出力設定を読み取り専用で使い、レシピ保存を無効にする（FR-027）（src/worker/render.worker.ts, src/ui/modeSwitch.ts）

**Checkpoint**: 基準再現の状態（A01 の記録と JS 版の誤差）が数値で示されている

---

## Phase 5: User Story 3 - 別の世界を探し、調整する (Priority: P3)

**Goal**: 「別の世界」・日時/タイムゾーン変更・6 つのスライダー・元画像比較・リセット・直前のレシピ復元・古い描画の破棄を提供する。

**Independent Test**: 「別の世界」で構成が変わり、スライダーでは配置が保たれることを画面で確認する（quickstart Q11）。

### Tests for User Story 3（先に書いて失敗を確認）

- [X] T059 [P] [US3] 状態遷移のテストを書く: 「別の世界」で variationIndex+1・写真と日時は不変、スライダー変更で seeds 不変、「現在に合わせる」でのみ日時が変わる、日時/TZ 変更で seeds が変わる、「構成のリセット」で Controls が preset の既定値に戻り seeds は不変、「直前のレシピ」で構成 seed が変わる直前の状態（seed 入力と操作値）へ 1 段戻る（FR-022）（tests/unit/state.test.ts）
- [X] T060 [P] [US3] ジョブの E2E を書く: スライダーを素早く連続操作しても最後の値の結果だけが表示される、描画失敗（テスト用フックで注入）後も設定が残る（R12）（tests/e2e/jobs.spec.ts）
- [X] T061 [P] [US3] 操作画面の E2E を書く: `America/New_York` で 2026-03-08 02:30 を入力すると解決後の日時とオフセットが表示される、「現在に合わせる」で日時表示が更新される、元画像比較に切り替えると元写真が表示される、「別の世界」で別案番号の表示が 1 増える（tests/e2e/controls.spec.ts）

### Implementation for User Story 3

- [X] T062 [US3] 状態遷移（別の世界、日時/TZ 変更、現在に合わせる、スライダー、構成のリセット、直前のレシピを 1 段保持）を FR-022 の定義どおり実装する（src/app/state.ts）
- [X] T063 [P] [US3] 作品日時の入力・タイムゾーン選択・「現在に合わせる」・gap/ambiguous 時の解決結果表示を作る（src/ui/timeControls.ts）
- [X] T064 [P] [US3] 6 つのスライダー（分解の細かさ・粒度のばらつき・形を残す割合・変形の強さ・色の変容・画像特徴の影響）と「別の世界」「構成のリセット」「直前のレシピ」ボタンを作る（src/ui/controls.ts）
- [X] T065 [P] [US3] 元画像との比較表示（切替または左右分割）を作る（src/ui/compare.ts）
- [X] T066 [US3] 操作を controller に接続し、操作ごとに preview ジョブを出し、古い結果を破棄する（src/ui/main.ts）

**Checkpoint**: 別案の探索と調整ができる

---

## Phase 6: User Story 4 - 高解像度で書き出し、レシピで保存・復元する (Priority: P4)

**Goal**: 2400×1800 PNG の書き出し（snapshot 固定・キャンセル可）と、版付きレシピの保存・検証付き読込。

**Independent Test**: レシピ保存 → 同じ写真と復元 → 書き出しが元と画素一致する（quickstart Q8）。

### Tests for User Story 4（先に書いて失敗を確認）

- [X] T067 [P] [US4] レシピ検証のテストを書く（contracts/recipe.schema.json）: 正しいレシピは通る、`schemaVersion` が 3 以外・`engineVersion` が `world-v3` 以外などの未知の版を拒否、`1e999`（parse 後 Infinity）を拒否、非整数の `angularRepeats`・`patchCount` を拒否、`unit` 値の範囲外を拒否、hex64 でない pixelHash を拒否（tests/unit/recipe.test.ts）
- [X] T068 [P] [US4] レシピ往復のテストを書く: 状態 → レシピ → parse → verify → 2400×1800 描画が元と不一致 0 画素（A10）、別画像では pixelHash 不一致で「同一再現ではない」、seedInput 改ざんで rootSeed 不一致を拒否、解析値だけ改ざんした場合は警告つきで読込が続く（tests/integration/recipe-roundtrip.test.ts）
- [X] T069 [P] [US4] 書き出しの E2E を書く: 書き出し開始後にスライダーを動かしても結果は開始時の設定どおり（R11）、キャンセルで PNG が出ない、プレビューと書き出しで同じ構成、書き出しとレシピ保存の間も外部ホストへのリクエストが 0 件（FR-002）（tests/e2e/export.spec.ts）

### Implementation for User Story 4

- [X] T070 [US4] 依存ライブラリなしの検証関数を contracts/recipe.schema.json に沿って実装する（src/core/recipe/validate.ts）
- [X] T071 [US4] `toRecipe`・`parseRecipe`・`verifyRecipe`（pixelHash・rootSeed の不一致は拒否または「同一再現ではない」表示、解析値の不一致は警告として表示し読込を続けて再計算値を使う）を実装する（src/core/recipe/recipe.ts）
- [X] T072 [US4] 書き出しを実装する: 開始時の snapshot を複製して export ジョブ（2400×1800）、進捗、キャンセル、`OffscreenCanvas.convertToBlob({type:"image/png"})` で保存（src/app/export.ts）
- [X] T073 [US4] 書き出しパネルとレシピの保存（JSON ダウンロード）・読込（ファイル選択、検証結果と拒否理由・警告の表示）を作る（src/ui/exportPanel.ts, src/ui/recipePanel.ts）

**Checkpoint**: 作品を書き出し、後日同じ作品を呼び戻せる

---

## Phase 7: User Story 5 - 見た目を比較してプリセットを決める (Priority: P5)

**Goal**: seed 違い・粗い領域比率違いの比較シートを出し、利用者が選んだ値をプリセットとして記録する。

**Independent Test**: 比較シートが出力され、利用者の選択がプリセット（`adopted`）として記録される（quickstart Q10）。

### Tests for User Story 5（先に書いて失敗を確認）

- [X] T074 [P] [US5] 比較シートのテストを書く: seed 違い 4 案 × 粗比率 3 段（例 0.25/0.40/0.55）のグリッドが決定的に生成され、各セルにラベル（variationIndex・粗比率・preset id・`unevaluated`）が付く（tests/integration/compare-sheet.test.ts）
- [X] T075 [P] [US5] 比較ツールのテストを書く: 64×48 の小さな PNG を入力にツールを実行すると、一時ディレクトリに比較シート 1 枚と各案の PNG が出力され、2 回の実行で同じ画素になる（tests/integration/compare-tool.test.ts）
- [X] T076 [P] [US5] 比較画面の E2E を書く: 比較シートを生成すると 12 セルが表示され、プリセットの状態が「未評価」と表示される（tests/e2e/compare-panel.spec.ts）

### Implementation for User Story 5

- [X] T077 [US5] 比較シートの生成関数を作る（src/core/world/compareSheet.ts）
- [X] T078 [P] [US5] PNG 入力から指定ディレクトリ（既定 `out/compare/`）に比較シートと各案の 2400×1800 を出すツールを作る（既定入力は `docs/reference/decoded-source.png`）（tools/compare-sheet.ts）
- [X] T079 [P] [US5] 画面に比較シートの表示・保存と、プリセットの評価状態（未評価/採用）の表示を作る（src/ui/comparePanel.ts）
- [ ] T080 [US5] 比較シートを利用者に見せ、選ばれた値を `status: "adopted"` のプリセットとして保存し、選択理由と比較画像のパスを記録する。利用者が選ぶまでこのタスクは完了にしない（src/core/presets/world-v3-v1.json, specs/001-world-v3-mvp/preset-decisions.md）

**Checkpoint**: 見た目の合格（A12）が利用者の判断として記録されている

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 性能測定・配布・最終検証と報告

- [X] T081 性能測定の E2E を作って実行し、960×720 プレビュー時間・2400×1800 書き出し時間を CPU・ブラウザ版・Worker 数とともに記録する。仮目標（250ms / 10s）の達否をそのまま書く（tests/e2e/perf.spec.ts, specs/001-world-v3-mvp/perf-report.md）
- [X] T082 必要な場合だけ高速化する（構成と結果を変えない範囲。前後で determinism・resolution・reference-render テストが通ること）（src/core/world/render.ts）
- [X] T083 単一 HTML の E2E を書く: `npm run build` 後の `dist/index.html` を Playwright で `file://` から開き、写真の読込でプレビューが描画される、HTTP(S) リクエストが 0 件（FR-002）（tests/e2e/build-file.spec.ts）
- [X] T084 `npm run build` で単一の `dist/index.html` を作り、T083 を通す。Worker が動かなければ research R-03 の代替に切り替える（vite.config.ts）
- [X] T085 [P] 開発者でない利用者向けの起動手順と、開発者向けのテスト手順を書く（README.md）
- [X] T086 quickstart.md の Q1〜Q13 を通しで実行し、Windows 上の Edge または Chrome で主要操作を手で確認する（憲法の完了条件 3）（specs/001-world-v3-mvp/quickstart.md）
- [X] T087 R01〜R12・A01〜A12 ごとの検証結果、基準との差、性能測定環境、未実施・残課題（A01 の Linux 確認など）を区別して報告書にまとめる（specs/001-world-v3-mvp/verification-report.md）

---

## Phase 9: 見た目の改善（利用者の選択 A、2026-10-11）

**Purpose**: verification-report.md の調整点 1〜3（必要なら 4）を、採用案の決定（T080）の前に直す。
利用者の方針は「速さより画質とコンセプトの実現」。数値の指標は見た目の代理であり、最終判断は比較シートで利用者が行う。

**基準値（変更前、`npx tsx tools/quality-metrics.ts`）**: 粒度境界の密度 0.0590、
色の残り方（出力/元の彩度ベクトル長）赤 0.16・青 0.43・緑 0.13、色相のずれ 1〜13°。

### Tests for Phase 9（先に書いて失敗を確認）

- [X] T088 [P] 粗い断片の縁が直線にならないことのテストを書く: 低周波のゆがみを加えた断片の割当てが、ゆがみなしの重み付きボロノイと 3〜30% の面積で異なる（縁だけが動き、断片の同一性は保つ）。断片の縁付近の変位は中心付近の 2 倍以上（縁が溶ける）（tests/integration/coarse-edges.test.ts）
- [X] T089 [P] 粒度境界のテストを書く: 基準写真 480×360 で粒度境界の密度が 0.03 以下（変更前 0.059 の約半分。大きなまとまりの場、docs/SPEC.md §5.3）。既定の面積比 40/35/25 ±5% は維持（tests/integration/grain-coherence.test.ts）
- [X] T090 [P] 色の残り方のテストを書く: 赤・青・緑に色かぶりした画像で、出力の彩度ベクトル長が元の 0.4 倍以上、色相のずれ 30° 以下（「原画像の色分布との関係を残し、一様な虹色化を避ける」docs/SPEC.md §3.1）（tests/integration/color-retention.test.ts）

### Implementation for Phase 9

- [X] T091 粗い断片の割当てに低周波のゆがみ（layout 系列の格子から作る）を加え、縁付近で変位を強める（src/core/world/coarsePatches.ts, src/core/world/render.ts）
- [X] T092 粒度場の G・S に低域通過（平滑化）したマップを使う（src/core/world/effective.ts, src/core/world/grainField.ts）
- [X] T093 色相の空間的な振れ幅と全体の回転量を抑え、写真の色かぶりが残るようにする（係数はプリセットに置く）（src/core/world/colorLayer.ts, src/core/presets/world-v3-draft.json）
- [X] T094 品質指標・全テストを再実行し、比較シートを作り直して見た目を確認する。必要なら調整点 4（高周波のちらつき）の対策を検討する（tools/quality-metrics.ts, out/compare/）
- [X] T095 verification-report.md と research.md R-10 を更新する（specs/001-world-v3-mvp/verification-report.md, specs/001-world-v3-mvp/research.md）

---

## Phase 10: 書き出しの高品質化と縁の曲げの強化（利用者の選択 A、2026-10-11）

**Purpose**: 調整点 4（細層の高周波のちらつき）と、Phase 9 後も残る直線に近い縁を直す。速さより質を優先する。

**基準値（変更前）**: 断片の縁の直線からのずれ（`edgeStraightness` の中央値、平面単位）: ゆがみなし 0.0016、
Phase 9 のゆがみ 0.0023〜0.0035（ほぼ直線のまま）。

### Tests for Phase 10（先に書いて失敗を確認）

- [X] T096 [P] 縁の曲がりのテストを書く: 基準写真・別案 0〜2 で縁の直線からのずれの中央値が 0.010 以上（tests/integration/coarse-edges.test.ts）
- [X] T097 [P] 高品質書き出しのテストを書く: 3×3 スーパーサンプリングの各画素が、画素中心の周りの 9 点の `samplePoint` の平均を量子化した値と一致する。細層の画素の高周波エネルギー（ラプラシアン）が標準より 25% 以上小さい。行帯の分け方に依存しない（tests/integration/supersample.test.ts）
- [X] T098 [P] レシピの品質モードのテストを書く: `output.qualityMode` は `standard` と `supersample-3` を受け付け、未知の値を拒否する。往復で品質モードが保たれる（tests/unit/recipe.test.ts）
- [X] T099 [P] 書き出し画面の E2E を書く: 既定は高品質で、標準を選ぶと画素が異なる 2400×1800 の PNG になる（tests/e2e/export-quality.spec.ts）

### Implementation for Phase 10

- [X] T100 縁のゆがみを 3 段（5×5・11×11・23×23 の格子、新しいサブ系列 `layout/warp1`・`layout/warp2`）にする（src/core/world/coarsePatches.ts, src/core/world/compose.ts, src/core/presets/world-v3-draft.json）
- [X] T101 `renderWorldRows` に画素あたりの標本数（1 または 3×3）を加え、Worker・書き出し・状態・レシピ・契約（contracts/recipe.schema.json）・画面に品質モードを通す（src/core/world/render.ts, src/app/export.ts, src/app/state.ts, src/core/recipe/, src/ui/exportPanel.ts）
- [X] T102 全テスト・品質指標・比較シートを再実行し、性能（書き出し時間）と記録を更新する（specs/001-world-v3-mvp/verification-report.md, specs/001-world-v3-mvp/perf-report.md）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: なし
- **Foundational (Phase 2)**: Setup 完了後。全ストーリーをブロックする
- **US1 (Phase 3)**: Foundational 完了後
- **US2 (Phase 4)**: Foundational 完了後。US1 とは独立（基準の変形計算は Phase 2 にある）
- **US3 (Phase 5)**: US1 の状態・プレビューに依存
- **US4 (Phase 6)**: US1 に依存（US3 の状態遷移があれば「直前のレシピ」と連携するが、なくてもテスト可能）
- **US5 (Phase 7)**: US1 に依存。T080 は利用者の判断待ち
- **Polish (Phase 8)**: 対象のストーリー完了後

### User Story Dependencies

```text
Setup → Foundational ─┬→ US1 ─┬→ US3
                      │       ├→ US4
                      │       └→ US5
                      └→ US2
```

### Within Each User Story

- テストを先に書き、失敗を確認してから実装する（憲法 I）
- 型・純関数 → 構成 → 描画 → Worker/controller 接続 → UI の順
- 各チェックポイントで、そのストーリーの quickstart シナリオを実行する

### Parallel Opportunities

- Setup: T003〜T006
- Foundational のテスト: T007〜T013。実装: T014〜T016
- US1 のテスト: T023〜T035。実装: T036・T037・T039・T041
- Foundational 完了後は US1 と US2 を並行できる
- US3 のテスト: T059〜T061、UI: T063〜T065。US4 のテスト: T067〜T069。US5 のテスト: T074〜T076

---

## Parallel Example: User Story 1

```bash
# US1 のテストをまとめて書く:
Task: "PRNG のテスト in tests/unit/prng.test.ts"
Task: "seed のテスト in tests/unit/seed.test.ts"
Task: "日時のテスト in tests/unit/time.test.ts"
Task: "画像解析のテスト in tests/unit/analysis.test.ts"
Task: "外部送信なしの E2E in tests/e2e/no-network.spec.ts"

# 依存のない実装を並行する:
Task: "Seeded32 in src/core/prng/seeded32.ts"
Task: "TimeSnapshot in src/core/time/snapshot.ts"
Task: "縮小 in src/core/analysis/downsample.ts"
Task: "未評価プリセット in src/core/presets/world-v3-draft.json"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup
2. Phase 2: Foundational
3. Phase 3: US1
4. **STOP and VALIDATE**: quickstart Q3〜Q7・Q9 を実行し、生成画像を利用者に見てもらう
5. 係数は未評価のままなので、見た目の完成とは扱わない

### Incremental Delivery

1. Setup + Foundational → 基盤
2. US2（基準の誤差を先に確定させると、中M の土台の正しさが分かる。docs/TASKS.md の T01 に相当）
3. US1 → MVP
4. US3 → 探索と調整
5. US4 → 書き出しと保存
6. US5 → 見た目の評価とプリセット確定
7. Polish → 性能・配布・最終報告

---

## Notes

- [P] tasks = different files, no dependencies
- `docs/` 配下は変更しない。承認画像を差し替えてテストを通さない
- 未測定の性能、未評価の見た目を合格と書かない
- 各タスクまたは論理的なまとまりごとにコミットする
