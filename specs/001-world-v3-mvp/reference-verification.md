# 基準再現の検証記録（A01 / R02）

## A01: 同梱 Python の再実行（`docs/reference/verify_reference.py`）

| 項目 | 値 |
|---|---|
| 実行日 | 2026-10-11 |
| 環境 | Windows 11 Home 10.0.26300 / Python 3.12.15 / numpy 2.3.5・scipy 1.17.0・Pillow 12.3.0（`.venv`） |
| identical_rgb | **false** |
| 平均絶対誤差（8bit） | 0.002215 |
| p99 | 0 |
| 最大 | 1 |
| 誤差>3 の画素率 | 0 |
| actual_rgb_sha256 | `3e597c02978579a9434bdeb663788e60c624dc7916112139f3d61f7c0e18844a` |
| expected_rgb_sha256 | `adce40e2a70d3655e33d943f72bb33c69741f121b986aeb3e5ef84c80760258f` |

- JPEG デコード結果は同梱の `decoded-source.png` と完全一致（画像入力の差ではない）。
- 作成環境は Linux（`environment.json`）。差は float32 の超越関数・行列積の実装差と推定する。
- **A01 は未達**: 作成環境と同等の Linux 環境での完全一致確認は **未実施**。基準コードと承認画像は変更していない。

## R02: アプリの reference-v1（JavaScript）

`npx tsx tools/reference-diff.ts` の結果（`out/reference-diff.json`）。

| 項目 | 値 |
|---|---|
| 入力 | `docs/reference/decoded-source.png`（上 5px・下 6px を crop） |
| 実行環境 | Node v24.18.0 win32 x64（倍精度、出力平面と中心は float32 に丸め） |
| identical | false |
| 平均絶対誤差（8bit） | 0.003733 |
| p99 | 0 |
| 最大 | 1 |
| 誤差>3 の画素率 | 0 |
| actual_rgb_sha256 | `87a023edc62275347ee4d46f10f80f6bdf21b32b08dbba96bd4a4c9671600500` |
| 描画時間（単一スレッド） | 3.3 秒 |

- 暫定目標（平均 ≤ 1・p99 ≤ 3）を満たす。誤差の大きさは同梱 Python を Windows で実行した場合と同程度。
- 同一環境での 2 回の実行と、行帯分割の違いで完全一致（`tests/integration/reference-render.test.ts`）。
- 変形場・色変換は NumPy float32 で計算した 200 点と照合済み（`tests/unit/reference-warp.test.ts`）。
  NumPy 2 は Python の複素数の中心座標を complex64 に丸めて計算するため、JS 版でも中心を float32 に丸めた。
