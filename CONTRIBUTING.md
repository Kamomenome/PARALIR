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
| `npm run build:single` | HTML 1 枚の版 → `dist-single/index.html`（手元で file:// の動きを確かめる用。公開はしない） |
| `npx playwright test` | e2e（開発サーバー、Web 版、HTML 1 枚の版。先に 2 つのビルドが要る） |
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
    engines.ts         エンジンの形と、今のエンジン（描き方は 1 つだけ、020）
  app/                 状態・Worker の管理・写真の読み込み・書き出し・外への通信の遮断
  worker/              描画の Worker（protocol.ts がやりとりの型）
  ai/                  端末内の AI（MediaPipe）
  ui/                  画面
```

## 世界を 1 つ足す

1. `src/engine/space-v2/worlds/<名前>/` を作り、`index.ts` に `WorldDef`（`type`・`label`・`note`・`version`・`odds`・`build`・`render`）を書く
2. `src/engine/space-v2/worlds/index.ts` の `WORLDS` の**最後に** 1 行足す（途中に入れると、おまかせのくじの順が変わって既存の絵が変わる）
3. `npx tsx tools/world-hashes.ts` で画素の記録を作り直し、既存の世界の記録が変わっていないことを差分で確かめる

## 描き方の版を上げる（絵が変わる直しをするとき）

同じ写真・作品日時・設定から同じ絵になる約束（[docs/REPRODUCIBILITY.md](docs/REPRODUCIBILITY.md)）を、わざと変えるときの手順です。
レシピはない（020）ので、古い描き方を残す（凍結する）必要はありません。

1. `space-v2/` の中で直し、変わる世界の `version`（背景なら `ATMOSPHERE_VERSION`）を上げる
2. `npx tsx tools/world-hashes.ts` で記録し直す。変えるつもりのない世界の記録が変わっていたら、直しが広がりすぎている

## 公開

- `.github/workflows/ci.yml`: push のたびに型チェック・テスト・ビルド・e2e
- `.github/workflows/pages.yml`: `main` への push で Web 版を GitHub Pages に公開（リポジトリの Settings → Pages で「GitHub Actions」を選ぶ）
- 版は `package.json` の version（画面では「ver 1.33」）。利用者に渡すたびに上げる
