# Plan: レシピとスライダーを減らす

## レシピ（FR-2001）

- 消すもの: `src/engine/recipe.ts`・`src/app/recipeLoad.ts`・`src/ui/recipePanel.ts`・`src/ui/recipeActions.ts`、状態の `applySpaceRecipe`、`APP_RECORD`、画面のボタンと案内、レシピの単体テスト（recipe-app・recipe-load・parts-recipe）と e2e の保存・読み込みの部分
- 残すもの: 書き出し（PNG）。ファイル名の `paralir-…` はそのまま

## エンジン（FR-2002）

- `src/engine/frozen/` を丸ごと消す。`engines.ts` は `Engine` の形と今のエンジン（`ENGINE`・`CURRENT_ENGINE`）だけにする（一覧・版から探す・あとから読み込む・テスト用の登録口を消す）
- 状態の `engineId` を消し、組み立ては `ENGINE` で行う。Worker は今のエンジンと元の写真だけを登録する（`loadRenderer` を消す）
- 画素の記録の道具（`tests/helpers/worlds.ts`）は今のエンジンだけを描く。凍結エンジンの記録（`world-hashes-space-v2-*.json`）を消す
- 文書: CONTRIBUTING.md の「凍結してから版を上げる」を「版を上げて記録し直す」に、docs/REPRODUCIBILITY.md からレシピを外す

## スライダー（FR-2003・2004）

- `SpaceControls` を `size`・`count`・`lightShape?` にする。消した 3 つは `FIXED_LOOK = { light: 0.5, darkness: 0.5, featureInfluence: 0.75 }` の定数として、使っていた所（背景の明るさ・暗さ、仕上げの光、世界の出やすさの重み）で使う
- `composeWorld` と `Engine.compose` から controls を外す（写真に合わせる強さだけが組み立てに効いていたため）
- 画面: GROUPS を「背景: 光の形」「主役: 主役の大きさ・長方形の数」に

## 調べたこと（research）

- 3 つのスライダーは、どれも係数として使われているだけで、乱数の位置を変えない。初期値の定数にすれば画素は 1 つも変わらない（画素の記録で確かめる、FR-2005）
- 凍結エンジンを使う所は、レシピの読み込み（版からエンジンを探す）と、古い作品の描き直しだけだった。レシピをなくすと、どこからも使われない
- レシピがなくなっても、同じ写真・作品日時・設定から同じ絵になること（共鳴パターン化）は変わらない。作品日時は写真を入れた時刻なので、あとから同じ作品を開き直す手段はなくなる（利用者の判断: レシピは余計な機能）
- 依存は足さない
