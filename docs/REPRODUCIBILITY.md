# 再現の約束（同じ写真・日時・設定から同じ絵）

PARALIR の絵は、写真の画素・作品日時・別案番号から決まる乱数で作る。ここに書いた計算を変えると、保存したレシピが同じ絵にならなくなる。
変えるときはエンジンを凍結してから版を上げる（[CONTRIBUTING.md](../CONTRIBUTING.md)）。

> 2026-10-13（009）: 旧 `docs/SPEC.md`（001 の仕様）から、今も使っている部分（§3.2〜3.3・§4・§6・§7 の一部）をここへ移した。
> 旧資料は削除した（git の履歴に残る）。

## 1. 写真の画素のハッシュ（pixelHash）

1. EXIF の向きを正し、透過 PNG は白へ合成し、8bit の RGB にする（色管理の変換はしない）
2. 1200 万画素を超える写真は、決まった計算（面積平均）で縮める（ブラウザの縮小には任せない）
3. `pixelHash = SHA256(widthBE32 || heightBE32 || 行優先の RGB8)`（16 進は小文字）

ファイルの bytes のハッシュ（`fileSha256`）とは分ける。ファイル名や EXIF だけが違っても、画素が同じなら同じ seed になる。

## 2. seed（種）

```text
seedInput = ["space-v2", pixelHashHex,
             instantEpochMs（10 進の文字列）, localDateTime（ミリ秒まで）,
             timeZone, offsetMinutes（整数）, variationIndex（整数）]
rootSeed  = SHA256(UTF8(JSON.stringify(seedInput)))
```

- 配列の順と形は固定。浮動小数の特徴量やスライダーの値は入れない（スライダーで別の配置にならないよう、同じ乱数列のまま係数だけ変える）
- コード: `src/engine/common/seed/seeds.ts`、`src/engine/space-v2/seeds.ts`

## 3. 乱数の流れを用途ごとに分ける

```text
streamSeed(name) = SHA256(rootSeedBytes || UTF8(name))
name = "type" | "camera" | "atmos" | 登録した世界の名前（copies, dark, …）
subStream(id)    = SHA256(streamSeed || UTF8(id))      // 例 "mosaic/000"
```

- 世界ごとに自分の流れを持つので、世界を足しても他の世界の乱数は変わらない（009）
- 処理の順・解像度・Worker の数で、乱数を使う位置が変わらない。描画の中で `Math.random()` や現在時刻を使わない

## 4. 擬似乱数 seeded32-v1

各流れの seed の先頭 16 bytes を 4 つの UInt32BE（s0〜s3）として読む。全部 0 なら s3 = 1。演算は mod 2^32。

```text
rotl(x,k) = ((x << k) | (x >>> (32-k))) unsigned32
next():
    result = rotl(s1*5,7)*9      # 32bit の積（JS では Math.imul）
    t = s1 << 9
    s2 ^= s0;  s3 ^= s1;  s1 ^= s2;  s0 ^= s3
    s2 ^= t
    s3 = rotl(s3,11)
    return unsigned32(result) / 4294967296
```

描画用であり、暗号には使わない。試験のベクトルは `tests/fixtures/prng-vectors.json`（`tools/py/prng_vectors.py` の独立した実装で作る）。コード: `src/engine/common/prng/seeded32.ts`

## 5. 画像の特徴（analysis-v1）

向きを正した RGB 全体を、長辺 256px の解析画像へ面積平均で縮める（小さい写真は拡大しない。短辺は `max(1, floor(256*short/long + 0.5))`）。

| 特徴 | 計算 |
|---|---|
| 明るさ L | Y = 0.299R + 0.587G + 0.114B の平均 |
| コントラスト K | clip(2·std(Y), 0, 1)（母標準偏差） |
| 平均彩度 S | HSV の S の平均 |
| 色相 | S で重みを付けた 36 ビン（無彩色は 0）。円周平均 hx = mean(S·cos 2πHue), hy = mean(S·sin 2πHue)、集中度 D、角度 P（D < 1e-6 なら P = 0） |
| 明度のエントロピー H | Y の 64 ビン、−Σp log2 p / 6 |
| エッジ量 E | 中央差分の勾配 G = clip(4·√(gx² + gy²), 0, 1) の平均（端は端の画素を複製） |

HSV は max/min の標準の定義（Δ = 0 なら Hue = 0, S = 0。max = 0 でも S = 0）。ヒストグラムの 1.0 は最後のビン、0·log 0 は 0。
コード: `src/engine/common/analysis/`

## 6. 作品日時

- 日時は seed の入力。少し変えるだけで構成は大きく変わる（別案として扱う）
- タイムゾーンは端末から取り、変えられる。存在しない時刻・2 回ある時刻は、どう解決したかを画面に出す
- 再現には、保存した instant・ローカルの日時・offset を使う（タイムゾーンの定義が更新されても seedInput は黙って変わらない）
- コード: `src/engine/common/time/snapshot.ts`

## 7. 写真の大きさの上限

ファイル 20 MiB、読み込み 5000 万画素、縦横それぞれ 32767 px。作業用には 1200 万画素まで縮める（008 FR-813）。コード: `src/engine/common/image/normalize.ts`

## 8. 守り

- 画素のハッシュで固定したテスト: Phase 9 の 16 枚（`tests/fixtures/phase9-hashes.json`）、7 つの世界の 43 枚（`tests/fixtures/world-hashes.json`）
- レシピの形: `specs/003-space-worlds/contracts/space-v2-recipe.schema.json`
