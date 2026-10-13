# Research: 主題の世界と、ざっくり囲む範囲

## R-501 Phase 9 の描画を戻す方法

- **Decision**: commit `6842075` の `src/core/space/{background,camera,composite,flame,foregrounds,growth,hdr,layout,palette,parts,photo,seeds,surreal,types}.ts` を
  `src/core/space/p9/` に元のまま置く（`'../` → `'../../` の読み込み先だけ変える）。試しに置いたところ型チェックは通った（2026-10-12、この調査でだけ。コミットはテストの後）
- **Rationale**: 「全部いいな」の絵は前景 6 種・背景・合成の組み合わせで、一部だけ移すと絵が変わる。元のままなら気に入った 16 枚と画素で照合できる
- **Alternatives**: 003 の背景（atmosphere.ts、Phase 9 の背景だけを移したもの）に前景を足す — 前景の依存（growth・parts・surreal・layout）が多く、移すたびに絵がずれる

- **確認（2026-10-12）**: 気に入った 16 枚と画素の SHA-256 が一致（SC-501）。気に入った絵は、合成（merge）を depth に固定して作られていた
  （seed の既定は otherworld になることがある）。背景は seed のまま（sphere・droste）、前景は種類ごとに固定

## R-502 主題の世界の seed

- **Decision**: 世界の型は space-v2 の seed が選ぶ。Phase 9 の部分は、同じ写真・日時・別案から 002 の seed 入力（先頭 'space-v1'）を作って 002 の手順で引く
- 合成は気に入った絵と同じ depth に固定する。前景 6 種は 002 の seed の値ではなく、005 の seed（space-v2 の主題の流れ）で均等に選ぶ（気に入った絵は種類を固定して作られたため）
- **Rationale**: 別案ごとに Phase 9 の比較画像と同じ方式の絵が下地になる

## R-503 囲みの扱い

- **Decision**: 囲み（点の列）→ 部品の格子のマスク（多角形の内側）。AI は囲みの重心と囲みの箱の四分の一の中心のうち囲みの内側の点で切り出す（`hintPoints` と同じ考え方）。
  候補（部品の頭・人物全体・切り抜き）のうち囲みに 7 割以上収まるものの最大、なければ IoU 0.5 以上、なければ囲みそのもの（`chooseCircled`）。
  IoU 最大（004 `chooseByOverlap`）は、頭をざっくり囲んだとき人物全体を選んでしまう（囲みが対象より大きいため。計算で確認）
- **Rationale**: 利用者「ざっくり囲んで詳細はAIで認識」。囲みは狙い、輪郭は AI
- 切り抜きは画面側（AI のある所）で行い、決まった範囲のマスク（8 ビット）を描画の依頼に添える。ワーカーは AI を持たない

## R-504 利用者の写真での確認（2026-10-12）

- 主題の世界（自動の範囲）: `out/latest/sheet-theme.png`。囲んだ範囲: `out/latest/sheet-theme-lasso.png`（囲み: 店は看板のあたり、舞台は屏風、人物は顔、部屋は絵、夜の街は建物）
- 5 枚とも囲みの中の物を AI が切り出して範囲にした（lasso+ai）: 看板のあたり → ロゴ、屏風のあたり → 屏風（自動では赤い枠だった）
