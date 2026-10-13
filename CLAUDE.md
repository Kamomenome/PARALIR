# PARALIR — 作業の決まり（旧名は docs/GLOSSARY.md）

## 必ず守る順番（SDD, GitHub Spec Kit）

利用者の新しい要望・参考画像・評価は、コードに触る前に次の順で扱う。

1. 言葉の確認: 利用者の言葉を [docs/GLOSSARY.md](docs/GLOSSARY.md) で引く。載っていない言葉・取り違えた言葉はまず用語集に書く
2. 仕様: `specs/<NNN>-<name>/spec.md` に FR・SC を書く（既存の機能なら追記）。評価は `decision.md` に記録する
3. 計画・調査: `plan.md`・`research.md`（依存を足すなら必要性を書く）
4. タスク: `tasks.md`
5. テストを先に書き、失敗を確かめる
6. 実装 → 全テスト（Vitest・Playwright）→ 比較画像 → コミット（push は利用者の確認後）

調査のために過去のコードを戻したり試作したりするのは構わないが、仕様とテストより先にコミットしない。
覚えておくことはメモリだけでなく、この CLAUDE.md・用語集・仕様のどれかに書く。

## 利用者の方針

- 返答は日本語
- 画質とコンセプトが速さより優先
- 画像処理は端末内だけ。外部へ送らない（アプリは外部への通信を起動時に止める: `src/app/offline.ts`）
- 利用者の写真は `samples/`・`out/`（git 対象外）にだけ置き、作業が終わったら途中の写真データは消す。`out/latest`・`out/liked` は残す
- 気に入った絵は `out/liked/` に残し、再現できるようにする
- 版は `package.json` の version（画面は「ver 1.31」）。利用者に渡すたびに上げる
- 公開リポジトリは https://github.com/Kamomenome/PARALIR（`origin` の `main`）。`main` は写真を含まない履歴から始めた（2026-10-13、009 FR-923）。
  手元のブランチ `002-spatial-world` には実在の写真を含む古い履歴があるので、**push しない**。コミットのメールは GitHub の非公開用アドレス（このリポジトリの設定）
- 配るのは Web 版だけ（`npm run build`、GitHub Pages）。HTML 1 枚の版（`npm run build:single`）は手元の確認用で公開しない。バックエンドは作らない（009 decision.md）
- 計算は `src/engine/`（画面を知らない）。世界の足し方・描き方の版の上げ方（凍結）は [CONTRIBUTING.md](CONTRIBUTING.md)
- 使っていないコードは残さない（`npx tsx tools/unused.ts` が 0 件。残すものは `tools/unused-allow.json` に理由つきで）
