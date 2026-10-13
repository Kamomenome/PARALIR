# Data Model: 空間表現への拡張（space-v1）

## SpaceComposition（出力解像度に依存しない）

| 要素 | 内容 |
|---|---|
| engineVersion | `space-v1` |
| algorithms | 現在 `{ flame: 'flame-v3', growth: 'growth-v4', parts: 'parts-v4', composite: 'composite-v4' }`（当初は各 v1） |
| layout | 空間の型（Phase 6）: 部品の並べ方（tunnel / helix / shell / strata / scatter）、有機構造の形（arches / radial / hanging / spiral）、対称性（mirror / rotational（3〜6 回）/ none）、光の方向（halo / above / side）、空洞の中心・光の中心・消失点（画面上、半高さ単位）、カメラのロール（上下反転を含む）。`camera` ストリームの `layout/main` から 14 回 |
| camera | 視野角、ロール角（layout に従う）、主点のずれ（消失点＝空洞の位置） |
| pipeline | 背景（light / sphere / droste / box）・前景（structures）・合わせ方（depth / otherworld）の seed の選択（Phase 8、`look` ストリームの `pipeline/main` から 3 回）。画面での固定はレシピの `pipeline`（各 'auto' または値、schemaVersion 4）に保存し、描画時に上書きする |
| backgrounds | 天球（極の傾き・回転・正立／倒立／地平線で鏡映／裏返し・写真の繰り返し数・地平線の行）と再帰（不動点＝写真の細部の多い所・縮小率 2.2〜4・螺旋の向き・入れ子ごとの回転・ズーム）。`look` ストリームから固定回数 |
| foregrounds | 前景の型ごとの seed の値（Phase 9、`look` ストリームから固定回数）: 輪郭線（写真の中心点＝細部の多い所・倍率・螺旋）、洞窟（半径・明暗の起伏・ひだの数と深さ・ねじれ・写真の繰り返し）、万華鏡（鏡の数 3〜7・輪の鏡の比・3 層の奥行き・倍率・回転・写真の中心点）、ロールシャッハ（4 つのしみの奥行き・写真の中心点・倍率・濃淡の閾値の分位・濃い塊か明るい塊か・大きさ・上下位置） |
| surreal | 異界の色（Phase 7、Phase 8 以降は合わせ方「異界の色」で使う）: 世界の異界度（0〜1、自然寄りに偏る）、色の規則 3 つ（色相の回転／チャンネルの入れ替え／補色／ネガ）、背景の光・Flame・管の帯 16 本・部品の枠 123 個それぞれの「改変が始まる順位」と従う規則。`color` ストリームから固定回数 |
| lightWindow / haloReach | 光の写真のどの範囲を使うか、光の輪の広がり（`look/light` から 4 回） |
| palette | 写真から作った 256 色（Phase 5 以降は描画に使わない。色はすべて写真の画素から） |
| flame | 変換群（アフィン係数・variation の重み・色座標・選択確率）、最終変換、対称の次数、初期点の分布 |
| growth | アーチの本数・奥行き間隔・縮小率、分岐の線分列（始点・終点・太さ・深さ）、膜の三角形 |
| parts | 板の列（写真上の切出し矩形・3D の中心・向き・大きさ・反転・リング番号）、縁の不規則さ |
| look | 霧の濃さ、発光の強さ、空洞の大きさ、露出、各層の不透明度 |

乱数は `compose` の中でだけ、固定 ID のサブ系列から固定回数引く。Flame の点列だけは描画時に
`flame/chunk/NN`（固定 64 チャンク）から引く。

## Controls（space 用スライダー、0〜1、seed を変えない）

| 名前 | 意味 |
|---|---|
| depth | 奥行きの深さ（反復の数と縮小率） |
| organic | 有機構造（アーチ）の強さ |
| glow | 発光（Flame とブルーム）の強さ |
| shapeRetention | 部品が読める手前の領域の大きさ |
| fog | 霧と光の減衰 |
| featureInfluence | 画像特徴の影響 |

## 空間レシピ

world-v3 のレシピと同じ識別情報（fileSha256・pixelHash・寸法）・作品日時・別案番号・seed に加え、
`engineVersion: 'space-v1'`、`algorithm`（flame / growth / parts / composite）と各版（`algorithms`: flame・growth・parts・composite・foregrounds）、
`pipeline`（背景・前景・合わせ方。各 'auto' または値）、Controls、出力サイズを持つ。現在の schemaVersion は 5（Phase 8 で `pipeline` を追加し
Phase 7 の `controls.otherworld` を削除＝4、Phase 13 で背景「箱の部屋」を追加＝5）。契約は [contracts/space-recipe.schema.json](contracts/space-recipe.schema.json)。
読込時は schemaVersion 3・4 を 5 へ移行し（3 は `pipeline` を全部 'auto'・`otherworld` を除去、4 の値はそのまま有効）、seed を再計算して照合し、未知の版・古いアルゴリズム版は
理由を示して拒否する（古い版の絵を新しい式で黙って描かない）。
