# Data Model: 変貌世界アプリ MVP（world-v3）

数値の定義は [docs/SPEC.md](../../docs/SPEC.md) を正本とし、ここでは型・検証規則・状態遷移を定める。
型名は `src/core` の TypeScript 型に対応する。

## RgbImage（正規化済み入力画像）

| フィールド | 型 | 規則 |
|---|---|---|
| width, height | 整数 | 1 以上。width×height ≤ 12,000,000（仮） |
| data | Uint8Array | 長さ width×height×3、行優先 RGB8。EXIF 正立・白合成済み、crop 前 |

## SourceInfo（入力画像の識別）

| フィールド | 型 | 規則 |
|---|---|---|
| fileSha256 | hex64 | 元ファイル bytes の SHA-256（小文字） |
| pixelHash | hex64 | `SHA256(widthBE32 ‖ heightBE32 ‖ rowMajorRGB8)`（正本 §3.2） |
| width, height | 整数 | RgbImage と一致 |
| fileBytes | 整数 | ≤ 20 MiB（仮） |
| preprocess | Preprocess | 下記 |

**Preprocess**: `orientation: "exif"`、`alpha: "white"`、`colorPolicy: "reference-rgb"`、
`cropPx: {left,top,right,bottom}`（整数 ≥0。world-v3 は全て 0、reference-v1 は top=5, bottom=6）。

## TimeSnapshot（作品日時）

| フィールド | 型 | 規則 |
|---|---|---|
| instantEpochMs | string | 10 進整数文字列（UTC ミリ秒） |
| localDateTime | string | `YYYY-MM-DDTHH:mm:ss.SSS` 固定桁 |
| timeZone | string | IANA 名（例 `Asia/Tokyo`） |
| offsetMinutes | 整数 | 解決済みオフセット |
| resolution | `"exact" \| "gap" \| "ambiguous"` | 表示用。seedInput には含めない |

状態: アプリ開始時に「現在」で作成 → 固定。利用者の入力または「現在に合わせる」でのみ置換。
レシピ読込時は保存値をそのまま使い、再解決しない。

## SeedSet

| フィールド | 型 | 規則 |
|---|---|---|
| seedInput | tuple | `["world-v3", pixelHash, instantEpochMs, localDateTime, timeZone, offsetMinutes, variationIndex]` |
| rootSeed | hex64 | `SHA256(UTF8(JSON.stringify(seedInput)))` |
| streams | 5 個 | layout / patch / warp / color / grain（`SHA256(rootSeedBytes ‖ UTF8(name))`） |

variationIndex: 整数 ≥0。「別の世界」で +1。PRNG 版 `seeded32-v1`。

## ImageFeatures（analysis-v1）

| フィールド | 型 | 規則 |
|---|---|---|
| analysisWidth, analysisHeight | 整数 | 長辺 256（入力が小さければ原寸）、短辺 `max(1, floor(256*short/long+0.5))` |
| L, K, S, H, E | 数値 | 0〜1。有限値 |
| hueHistogram | 数値[36] | S 重み。合計が 0 のこともある |
| hueConcentration D, huePhase P | 数値 | D<1e-6 なら P=0 |
| maps | Float32Array×5 | Y, S, gx, gy, G（解析サイズ） |

**エッジ量 E の定義（正本 §4 の解釈）**: 正本は「中央差分勾配の大きさ」とだけ定めているため、
本実装では `E = mean(G)`（局所マップ G＝`clip(4*sqrt(gx²+gy²),0,1)` の解析画像全体での平均、0〜1）とする。
変更する場合は analysisVersion を上げる。

## Controls（操作値）

全て 0〜1 の有限値。構成 seed を変えない。

| 名前 | 意味 |
|---|---|
| fineness | 分解の細かさ（grainBase） |
| grainVariation | 粒度のばらつき |
| shapeRetention | 形を残す割合（粗C の目標面積） |
| warpStrength | 変形の強さ |
| colorChange | 色の変容（元色↔変換色） |
| featureInfluence | 画像特徴の影響（0 で中立値） |

## Preset（係数一式）

`id`、`status: "unevaluated" | "adopted"`、`grainRatio {coarse, medium, fine}`（合計 1、初期 0.40/0.35/0.25）、
各層の係数（粗い断片の幅範囲、反復倍率など）。`status` は US5 で利用者が採用したときだけ `adopted` にする。
reference-v1 用には同梱 `docs/presets/approved-v1.json` を読み取り専用で使う。

## Composition（構成。出力解像度に依存しない）

| 要素 | 内容 |
|---|---|
| grainLattice | 4×4 と 9×9 の格子値、分位しきい値 2 個、なじませ幅 |
| patches[20] | 種点中心・重み・切出し中心・倍率・回転角・反転・弱変位パラメーター |
| warpM, warpF | 3 中心の位置・渦強度・角度反復数（**整数**）・放射反復・混合オフセット |
| color | 色相位相・振幅・ソラリゼーション量（層ごと） |

Composition = f(SeedSet, ImageFeatures, Controls, Preset)。同じ入力からは同じ値（A02）。

## Recipe（保存形式）

[contracts/recipe.schema.json](contracts/recipe.schema.json) を参照。schemaVersion=3、engineVersion=`world-v3`、
analysisVersion=`analysis-v1`、prngVersion=`seeded32-v1`。

**読込時の検証**（FR-028, FR-029）:
1. JSON Schema に適合しない／未知の版／NaN・Infinity／非整数の反復数 → 拒否
2. 現在の画像の pixelHash ≠ レシピの pixelHash → 「同一再現ではない」表示（拒否または別作品として読込）
3. seedInput から rootSeed を再計算して不一致 → 拒否
4. 解析値を再計算して保存値と不一致 → 警告として表示し、読込は続ける（描画には再計算値を使う）

## RenderJob（描画ジョブ）

| フィールド | 規則 |
|---|---|
| jobId | 単調増加の整数 |
| kind | `"preview" \| "export"` |
| snapshot | 開始時の SourceInfo・TimeSnapshot・variationIndex・Controls・Preset・出力サイズの複製（R11） |
| state | 下図 |

```text
queued → running → done
           ├─→ cancelled（キャンセル、または新しい preview が来た旧 preview）
           └─→ failed（エラー。Controls 等の設定は保持）
```

完了時、`jobId` が最新の preview でなければ結果を捨てる（R12）。export は preview に置き換えられない。
