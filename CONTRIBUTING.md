# 開発の手引き

## 準備

```sh
npm install
npx tsx tools/fetch-models.ts      # AI のモデル（git に入れていない）を取得し、SHA-256 を確かめる
npm run dev                        # http://localhost:5173
```

## テストとビルド

| コマンド | 内容 |
|---|---|
| `npm run typecheck` | 型チェック（使っていない変数・引数も見つける） |
| `npm test` | Vitest（unit・integration。描かれる絵を画素で確かめるテストを含む） |
| `npm run build` | Web 版 → `dist/` |
| `npm run build:single` | ダウンロード版（HTML 1 枚）→ `dist-single/index.html` |
| `npx playwright test` | e2e（開発サーバー、Web 版、ダウンロード版。先に 2 つのビルドが要る） |
| `npx tsx tools/unused.ts` | 使われていないファイル・書き出しを探す（残すものは `tools/unused-allow.json` に理由つきで） |
| `npx tsx tools/notices.ts` | `THIRD_PARTY_NOTICES.md` を作り直す（依存を変えたとき） |

作業の順番（用語集 → 仕様 → 計画 → タスク → テスト → 実装）は [CLAUDE.md](CLAUDE.md) にあります。

## 作りの全体

```
src/
  engine/              計算だけ（画面・ブラウザ・Worker・AI を知らない。tests/unit/boundary.test.ts が守る）
    common/            どの版でも使う土台：画像・数学・乱数・ハッシュ・時刻・特徴・AI の部品の形
    space-v2/          描き方（エンジン）の今の版
      shared/          世界どうしで共有：光・カメラ・HDR・炎・色・背景
      worlds/<名前>/   世界 1 つ分（index.ts に名前・出やすさ・組み立て・描き方）
      p9/              気に入った Phase 9 の絵を再現するための凍結したコード（変えない）
    engines.ts         エンジンの一覧（凍結した古い版は、古いレシピのときだけ読み込む）
    recipe.ts          レシピの形と検証
  app/                 状態・Worker の管理・写真の読み込み・書き出し・外への通信の遮断
  worker/              描画の Worker（protocol.ts がやりとりの型）
  ai/                  端末内の AI（MediaPipe）
  ui/                  画面
```

## 世界を 1 つ足す

1. `src/engine/space-v2/worlds/<名前>/` を作り、`index.ts` に `WorldDef`（`type`・`label`・`note`・`version`・`odds`・`build`・`render`）を書く
2. `src/engine/space-v2/worlds/index.ts` の `WORLDS` の**最後に** 1 行足す（途中に入れると、おまかせのくじの順が変わって既存の絵が変わる）
3. `npx tsx tools/world-hashes.ts` で画素の記録を作り直し、既存の世界の記録が変わっていないことを差分で確かめる
4. 版の組が変わるので、既存のレシピのために、先に「描き方の版を上げる」の 1〜3 を行う

## 描き方の版を上げる（絵が変わる直しをするとき）

保存したレシピが、いつでも同じ絵で開けるようにするための手順です（[docs/REPRODUCIBILITY.md](docs/REPRODUCIBILITY.md)）。

1. 今のエンジンを凍結する: `src/engine/space-v2/` を `src/engine/frozen/<id>/`（例 `space-v2-1`）へ丸ごと写す（import のパスは写した先に合わせる）
2. `src/engine/engines.ts` の一覧に、写したエンジンを `load: () => import('./frozen/<id>').then((m) => m.engine)` で足す（id は写した先の名前）
3. 写したエンジンの画素の記録を、今の記録と同じものとして残す（凍結したエンジンが同じ絵を描くことの確認）
4. `space-v2/` の中で直し、変わる世界の `version`（背景なら `ATMOSPHERE_VERSION`）を上げる
5. `npx tsx tools/world-hashes.ts` で記録し直す。変えるつもりのない世界の記録が変わっていたら、直しが広がりすぎている

## 公開

- `.github/workflows/ci.yml`: push のたびに型チェック・テスト・ビルド・e2e
- `.github/workflows/pages.yml`: `main` への push で Web 版を GitHub Pages に公開（リポジトリの Settings → Pages で「GitHub Actions」を選ぶ）
- 版は `package.json` の version（画面では「ver 1.27」）。利用者に渡すたびに上げる
