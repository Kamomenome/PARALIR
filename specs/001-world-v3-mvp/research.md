# Research: 変貌世界アプリ MVP（world-v3）

正本は [docs/SPEC.md](../../docs/SPEC.md)・[docs/REFERENCE_METHOD.md](../../docs/REFERENCE_METHOD.md)。
本書は技術選定と、正本が「案」として残している点の実装上の決定を記録する。

## R-01 言語・ビルド

- **Decision**: TypeScript（strict）+ Vite。UI フレームワークは使わず、素の DOM で書く。
- **Rationale**: 端末内処理のブラウザアプリ（憲法 III）。画面はスライダー・ボタン・キャンバス数枚で、
  状態管理ライブラリを要する規模ではない（憲法 V）。TypeScript の型で数値契約（整数の反復数、版文字列）を表す。
- **Alternatives**: React/Svelte（画面規模に対して過剰）、素の JavaScript（数値契約の型検査がない）。

## R-02 テスト

- **Decision**: 単体・結合は Vitest（Node 環境で `src/core` を直接テスト）。ブラウザでの一致確認と
  画面の通し確認は Playwright（Chromium）で少数のみ。
- **Rationale**: 中核は DOM 非依存なので画面起動なしでテストできる（憲法 II）。A03 の「CPU/ブラウザーで
  一致」は実ブラウザでの実行が必要なため Playwright を最小限使う。
- **Alternatives**: Jest（ESM/TS 設定が重い）、ブラウザテストなし（A03・R11・R12 を検証できない）。

## R-03 配布と起動

- **Decision**: `vite-plugin-singlefile` で JS・Worker を 1 つの `dist/index.html` に同梱し、
  ダブルクリックで開けるようにする。開発時は `npm run dev`。
- **Rationale**: 開発者でない利用者でも起動できること（憲法 III）。サーバー不要で外部送信もない。
- **Alternatives**: `npm run preview`（Node が必要）、Electron/Tauri（ユーザーがブラウザアプリを選択済み）。
- **Risk**: `file://` で inline Worker（blob URL）が動くことを quickstart で実機確認する。動かない場合は
  Worker なし（メインスレッド・行帯ごとに await で譲る）へ切り替え可能な構成にしておく。

## R-04 描画方式

- **Decision**: CPU（JavaScript の倍精度）で描画し、行帯単位で複数の Web Worker に分割する。GPU は使わない。
- **Rationale**: 正本 §9「CPU 参照版で正しさを確立し、必要な場合に GPU 化」。描画は構成（乱数で決定済み）
  と画素座標だけの純関数にし、Worker 分割・行帯の順序が結果に影響しないようにする（憲法 VI）。
- **Alternatives**: WebGL/WebGPU（演算精度が環境依存で、A02・A09 の画素一致検証が難しい）。

## R-05 reference-v1 の一致基準（要ユーザー確認）

- **事実**:
  - 同梱 Python を Windows 11 + Python 3.12.15 + 記載依存版で実行すると、承認画像と完全一致しない
    （最大誤差 1、平均 0.0022 / 8bit）。JPEG デコードは `decoded-source.png` と一致。差は float32 の
    超越関数・行列積の実装差（作成環境は Linux）と推定。
  - アプリ（JavaScript）は倍精度で、`Math.sin` 等の実装も NumPy と異なるため、ビット一致は原理的に保証できない。
- **Decision**:
  1. A01（正本の定義どおり）は「同梱 Python を作成環境同等の Linux で実行して完全一致」とする。
     この PC では未達として記録し、合格とは書かない。
  2. アプリの reference-v1（R02）は、`decoded-source.png`（ロスレス）を入力として 2400×1800 を描画し、
     承認画像との 8bit 誤差の平均・p99・最大・誤差>3 画素率を報告する。暫定目標は正本 §10 の移植目標
     「平均 1 以下・p99 3 以下」を準用する。目標を満たさない場合は閾値を緩めず差分原因を調べる。
  3. JS 版自身については、同一環境での 2 回実行の完全一致（A02 相当）を必須にする。
- **Rationale**: 正本 §10「画素一致は同一の数値/描画環境内の要件」。異なる数値環境への移植には
  誤差報告型の基準が正本自身に用意されている。
- **確定（2026-10-11）**: 利用者が上記の扱いで `/speckit-tasks` へ進めたため、spec の FR-003・SC-001・
  US2 の受け入れ条件を上記に合わせて修正した。

## R-06 入力のデコードと色

- **Decision**: `createImageBitmap(blob, { imageOrientation: 'from-image', colorSpaceConversion: 'none',
  premultiplyAlpha: 'none' })` → OffscreenCanvas で RGBA を取得 → 白合成で RGB8 にする。
- **Rationale**: EXIF 正立（R01）と、ICC 変換なしの「基準 RGB 契約」（REFERENCE_METHOD §4.6）に合わせる。
- **Note**: JPEG のデコード結果はブラウザ間で異なり得るので、pixelHash もブラウザ間で変わり得る。
  レシピ読込で pixelHash 不一致なら「同一再現ではない」と表示する（正本 §3.2）。

## R-07 SHA-256

- **Decision**: Web Crypto（`crypto.subtle.digest`）。ブラウザと Node 24 の両方で同じ API。
- **Alternatives**: 自前実装・ライブラリ（不要な依存）。

## R-08 日時とタイムゾーン

- **Decision**: `temporal-polyfill` の `Temporal.ZonedDateTime`（disambiguation: `compatible`）で
  ローカル日時→瞬間・オフセットを解決する。保存時はスナップショット（瞬間・ローカル日時・TZ・オフセット）
  を固定し、再現時は再解決せずスナップショットをそのまま seedInput に使う。
- **Rationale**: 存在しない/二義的な時刻の解決（spec Edge Cases）を自作すると誤りやすい。
  ネイティブ Temporal はブラウザ・Node 間で提供状況が揃わないため、ポリフィルで統一する。
- **Alternatives**: `Intl.DateTimeFormat` からの自前解決（夏時間境界の誤りリスク）。

## R-09 PRNG と乱数の消費規則

- **Decision**: 正本 §3.3 の `seeded32-v1`（xoshiro128** 型）をそのまま実装。用途 seed から、
  さらに固定 ID（`patch/000`、`grain/coarse/03-07` など）で `SHA256(streamSeed || UTF8(id))` の
  サブ系列を作る。**乱数の消費回数は画像特徴・スライダー値に依存させない**（特徴は「引いた u を値へ
  写す関数」だけを変える）。
- **Rationale**: A03（サブ列追加が既存列に影響しない）、FR-021（スライダーで配置が変わらない）、
  A05（特徴の影響 0/1 で同じ乱数のまま写像だけ変わる）を同時に満たすため。
- **Test vector**: 実装時に固定 seed の先頭 16 個を `tests/fixtures/prng-vectors.json` に記録し、
  Node とブラウザの両方で照合する。

## R-10 world-v3 の構成と描画（初期案。係数は未評価）

正本 §3〜5 を次の形で実装する。係数はすべて `presets/world-v3-draft.json` に集め、US5 の比較で調整する。

- **出力平面**: reference と同じ正規化座標（x∈[-1.55,1.55]、y∈[-1.1625,1.1625]、両端を含む）。
  描画は「構成 + 正規化座標 → RGB」の純関数なので、解像度が違っても同じ正規化座標では同じ値になる（A09）。
- **粒度場**: 4×4 と 9×9 の格子（grainSeed のサブ系列）を smoothstep 補間し 0.7/0.3 で合成 → N。
  `raw = 0.55N + 0.25G + 0.20S`（G,S は解析マップを出力平面に対応させて参照）。分位点は固定解析グリッド
  （256×192 の出力平面サンプル）で求める。境界は短い smoothstep 帯でなじませる。
- **粗C**: 5×4 ジッター種点（20 個、各自のサブ系列）による重み付きボロノイ領域。各領域に切出し中心・倍率・
  回転・反転を割当て、等方座標で回転し、弱い変位を加える。切出し中心は G と K で重み付けした候補から選び、
  静かな領域にも下限の重みを残す。画像外にはみ出す場合は中心・倍率を内側へ調整する。
- **中M**: reference の三中心対数渦を基に、中心位置・渦の強さ・混合オフセットを warpSeed で小さく揺らす。
  角度反復数は `4+8H` を中央値とする整数候補から選ぶ。
- **細F**: M の角度反復を 1.5〜2 倍（整数）にし、解析マップの勾配（gx,gy）に比例した局所変位を加える。
- **色**: reference の YIQ 回転・ソラリゼーションを基に、色相位相を P・D に偏らせて colorSeed から選ぶ。
  振幅は S に応じて変える。粗C は色変換を弱めて部品を読みやすく残す。「色の変容」で元色と混合する。
- **Phase 9 の改訂（2026-10-11）**: 粗C の割当てを `layout/warp/y-x` の 5×5 格子でゆがめ、縁付近の変位を強める。
  粒度場の G・S は平滑化マップを使う。色は空間的な振れ幅と全体回転を抑え、変形の位相を色相に加えない。
  いずれも新しいサブ系列 ID か既存乱数の写像の変更で、既存系列の消費は変えていない。
- **画像特徴の影響（0〜1）**: 0 のとき特徴量を中立値（L=0.5、K=0.5、S=0.5、H=0.5、G・gx・gy=0）へ置換する。
  乱数の消費は同じなので、0/1 比較で特徴量の効果だけを切り出せる（A05）。

## R-11 性能目標の測定

- **Decision**: Playwright で 960×720 プレビュー時間と 2400×1800 書き出し時間を計測し、CPU・ブラウザ版・
  Worker 数とともに `specs/001-world-v3-mvp/perf-report.md` に記録する。仮目標（250ms / 10s）は未達でも
  測定値をそのまま報告する（憲法 VI）。

## R-12 開発時の補助ツール

- **Decision**: `tools/` に Node スクリプトを置く。PNG 入出力は `pngjs`（開発依存）。
  - `reference-diff.ts`: JS 版 reference-v1 と approved.png の誤差を報告（R-05）
  - `compare-sheet.ts`: seed 違い・粗い領域比率違いの比較シートを出力（A12）
- **Python 環境**: `.venv`（Python 3.12）に `docs/reference/requirements.txt` を導入済み。同梱 verify 専用。
