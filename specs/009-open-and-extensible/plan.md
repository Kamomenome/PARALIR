# Implementation Plan: 第三者が使えるアプリと、直しやすく足しやすい作り（版 1.27）

**Branch**: `009-open-and-extensible` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

## Summary

まずファイルを移すだけ（中身は変えない）で `src/engine/` を作り、画素の記録で絵が変わらないことを確かめる。次に世界を登録式にし、エンジンを一覧から選べるようにする。
そのあと保守性の直し、第三者向けの文書と画面、Web 版のビルドと自動化の順に進める。どの段階でも画素の記録（43 枚・16 枚）が守りになる。

## Technical Context

**Dependencies**: 追加なし（ライセンス表示は node_modules の LICENSE を読む道具で作る。lint は型チェックの設定で行う）
**Testing**: 境界のテスト・登録・エンジンの選択・ライセンス表示は unit。Web 版とダウンロード版は e2e（静的に配信して開く）

## Constitution Check

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テストファースト | ✅ | 新しい振る舞い（境界・登録・エンジン選択・このアプリについて・Web 版）はテストを先に書く。移動は既存のテストと画素の記録で守る |
| II. ロジックと UI の分離 | ✅ | engine の境界をテストで強制する（FR-903） |
| III. 端末内で完結するブラウザアプリ | ✅ | Web 版も静的なファイルだけ。写真は外へ出ない。「開発者でない利用者でも起動できる」は URL を開くだけで満たす |
| IV. ユーザーデータの保護 | ✅ | レシピの形式は変えない。古い版のレシピは凍結したエンジンで開ける（今までの「断るだけ」より原則 IV に近づく） |
| V. シンプルさ | ✅ | npm パッケージ・monorepo・lint の道具は入れない（decision.md）。エンジンの一覧は今は 1 つだが、互換の方針（利用者の決定）に要る |
| VI. 再現性 | ✅ | 移動と登録化の前後で画素の記録が一致することを確かめる |

## 移す先

| 今 | 移す先 |
|---|---|
| `core/{analysis,hash,image,math,prng,seed,time,parts}` | `engine/common/…`（同じ名前） |
| `core/space/output.ts` | `engine/common/output.ts` |
| `core/space/{atmosphere,camera,color,env,flame,hdr,inplace,layout,object,photo,plates,subject}.ts` | `engine/space-v2/shared/` |
| `core/space/{copies,dark,split,portal,mosaic,echo,theme}.ts` | `engine/space-v2/worlds/<名前>/<名前>.ts` |
| `core/space/p9/` | `engine/space-v2/p9/`（凍結のまま） |
| `core/space/{types,seeds,world}.ts` | `engine/space-v2/` |
| `core/space/recipe.ts` | `engine/recipe.ts`（エンジンをまたぐ） |

移動は道具（一時的な Python）で `git mv` と import の書き換えを行う。

## 登録（FR-902）

```ts
// engine/space-v2/worlds/<名前>/index.ts
export const copies: WorldDef<'copies', CopiesParams> = {
  type: 'copies', label: '物の複製', note: '主役を環・扇・列・格子・螺旋に並べる', version: 'copies-v4',
  odds: () => 1.0,
  build: (seeds, ctx) => buildCopies(seeds.streams.copies, ctx.fov),
  render: (ctx) => overBackdrop(ctx, …),   // 背景の上に描く世界は共通の手順（shared/backdrop.ts）
};
// engine/space-v2/worlds/index.ts
export const WORLDS = [copies, dark, split, portal, mosaic, echo, theme] as const;   // 登録はここに 1 行
```

- 並び順は今の `WORLD_TYPES` と同じ（おまかせのくじの順番が変わると絵が変わる）
- 版の組（`SPACE_ALGORITHM_VERSIONS`）・種の流れ（`SPACE_STREAMS`）・画面の選択肢・レシピの検証を `WORLDS` から作る
- 背景の上に描く世界（物の複製・闇と光・解体）の手順は、今の `renderWorld` の計算順をそのまま `shared/backdrop.ts` に移す（画素の記録で確かめる）

## エンジンの一覧（FR-904, FR-905）

```ts
// engine/engines.ts
export interface Engine { id: string; algorithms: Record<string, string>; worlds: readonly WorldDef[]; compose(…): Promise<World>; render(…): WorldRender }
export interface EngineEntry { id: string; algorithms: Record<string, string>; load(): Promise<Engine> }
```

- `space-v2` はいつも読み込む。凍結したエンジンは `load: () => import('./frozen/<id>')`（Web 版では別のファイルになり、必要なときだけ読まれる）
- 状態に `engineId` を持つ。レシピを読むと、`algorithms` が一致するエンジンを選ぶ。新しい写真では今のエンジンに戻る
- Worker の仕事の `mode` はエンジンの id。Worker も一覧から読み込む
- 試験用のエンジンを一覧に足せる（`registerEngine`、テストだけで使う）

## 保守性（FR-907〜FR-910）

- `worker/protocol.ts`: `ToWorker`（ping・setSource・cancel・render）と `FromWorker`（pong・frame・error）の判別共用体
- 帯分割をなくし、1 つの仕事 = 1 枚まるごと（controller のテストを書き直す）
- `ui/main.ts` を `ui/photoInput.ts`・`ui/lassoInput.ts`・`ui/recipeActions.ts`・`ui/exportActions.ts`・`ui/keyboard.ts` に分ける
- `tsconfig.json`: `noUnusedLocals`・`noUnusedParameters`

## 第三者向け（FR-911〜FR-914）

- `LICENSE`（MIT、著作権者 kamom）
- `tools/notices.ts` → `THIRD_PARTY_NOTICES.md`（依存の LICENSE を node_modules から読み、モデルと wasm の部品は手で書いた表を足す）。unit: 実行時の依存すべてが載っている
- 画面: 詳しい設定の中に「このアプリについて」（`<details>`）。表示の文は `THIRD_PARTY_NOTICES.md` を `?raw` で読み込む
- `README.md`（利用者向け）・`CONTRIBUTING.md`（開発者向け）

## Web 公開（FR-915〜FR-918）

- `vite.config.ts` をビルドの種類で分ける: 既定は Web 版（`base: './'`、Worker は ES モジュール、モデルと wasm は別ファイル）、`--mode single` はダウンロード版（今の単一ファイル、`dist-single/`）
- CSP: Web 版 `default-src 'none'; script-src 'self' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; connect-src 'self' blob: data:; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'`
- e2e: `vite preview` で `dist/` を配信して開く（Web 版）。ダウンロード版は今の file:// のテストを `dist-single/` に向ける
- `.github/workflows/ci.yml`（モデルの取得 → 型チェック → Vitest → ビルド 2 種 → Playwright）、`.github/workflows/pages.yml`（main で `dist/` を Pages へ）
