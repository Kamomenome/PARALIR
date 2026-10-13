# Contract: 中核モジュール API（`src/core`）

`src/core` は DOM・Worker・時刻・`Math.random` に依存しない純粋なモジュール群とする（憲法 II・VI）。
非同期なのは SHA-256 を使う関数だけ。型は [data-model.md](../data-model.md) を参照。

## image

```ts
compositeWhite(rgba: Uint8ClampedArray, w: number, h: number): RgbImage   // 透過を白へ合成
crop(img: RgbImage, px: CropPx): RgbImage                                  // reference-v1 専用で使用
validateSize(fileBytes: number, w: number, h: number): SizeCheck           // 上限: 20MiB / 12MP（仮）
```

## hash / seed

```ts
pixelHash(img: RgbImage): Promise<Hex64>
buildSeedInput(pixelHash, time: TimeSnapshot, variationIndex): SeedInput
deriveSeeds(seedInput): Promise<SeedSet>                                   // root + 5 streams
subStreamSeed(streamSeed: Uint8Array, id: string): Promise<Uint8Array>     // "patch/000" 等
```

## prng（seeded32-v1）

```ts
class Seeded32 { constructor(seed16: Uint8Array); next(): number /* [0,1) */ }
uniform(r, a, b): number          // a+(b-a)*u
intIn(r, a, b): number            // a+floor((b-a+1)*u)
```

テストベクトル: `tests/fixtures/prng-vectors.json`（Node とブラウザで同一であること。A03）。

## time

```ts
snapshotFromLocal(local: string, timeZone: string): TimeSnapshot   // gap/ambiguous を resolution に記録
snapshotNow(nowMs: number, timeZone: string): TimeSnapshot         // 現在時刻は呼び出し側が渡す
```

## analysis（analysis-v1）

```ts
analyze(img: RgbImage): ImageFeatures
neutralFeatures(f: ImageFeatures): ImageFeatures                    // featureInfluence=0 用の中立値
```

## reference-v1

```ts
renderReferenceRows(src: RgbImage /* crop 済み */, W: number, phase: number,
                    rowStart: number, rowEnd: number, out: Uint8ClampedArray): void
```

REFERENCE_METHOD §4 の式をそのまま移植する（負数 mod、epsilon の加算、v2 に phase なし、
floor による uint8 化）。双線形補間は `mode='reflect'` 相当。

## world-v3

```ts
compose(seeds: SeedSet, features: ImageFeatures, controls: Controls, preset: Preset): Promise<Composition>
renderWorldRows(src: RgbImage, features: ImageFeatures, comp: Composition, controls: Controls,
                W: number, H: number, rowStart: number, rowEnd: number,
                out: Uint8ClampedArray, diag?: DiagnosticsOut): void
samplePoint(comp, features, controls, x: number, y: number): PointSample   // 正規化座標 → 層重み・サンプル座標・RGB（A09 検証用）
```

規則:
- `compose` だけが乱数を消費する。消費回数は `features`・`controls` に依存しない。
- `renderWorldRows` は乱数を使わず、結果は行範囲の分け方に依存しない。
- `controls` の変更は `compose` の乱数列を変えない（同じ seeds なら同じ一様乱数を引く）。

## recipe

```ts
toRecipe(state: AppSnapshot): Recipe
parseRecipe(json: string): Result<Recipe, RecipeError>              // schema + 有限値 + 整数検査
verifyRecipe(r: Recipe, img: RgbImage, fileSha256): Promise<VerifyResult>  // pixelHash / rootSeed / 解析値
```
