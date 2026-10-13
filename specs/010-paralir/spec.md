# Feature Specification: 名前を PARALIR にする（版 1.27）

**Feature Branch**: `010-paralir`
**Created**: 2026-10-13
**Status**: Draft
**Input**: 利用者「てか名前は PARALIR にしたい～～～反映して～～～」（009 の公開準備の途中）。言葉は [docs/GLOSSARY.md](../../docs/GLOSSARY.md)（PARALIR）。

## Requirements *(mandatory)*

- **FR-1001**: アプリの名前を **PARALIR** にする（画面の見出し・ページの名前・「このアプリについて」・README・ライセンス表示の文）。旧名 paraller は用語集と履歴にだけ残す
- **FR-1002**: ファイル名とパッケージ名は小文字の **paralir**: 書き出しの PNG とレシピ（`paralir-<seed>-v<別案>-<世界>`）、ダウンロード版（`paralir.html`）、npm のパッケージ名
- **FR-1003**: 名前が変わっても、描かれる絵・レシピの形式と読み込み・版は変えない（レシピにアプリ名は入っていない）。版は 1.27 のまま（1.27 はまだ利用者に渡していない）

## Success Criteria *(mandatory)*

- **SC-1001**: e2e: 見出しとページの名前が「PARALIR」、書き出しのファイル名が「paralir-」で始まる
- **SC-1002**: src・tests・tools・README・CLAUDE.md・公開の設定に「paraller」が残らない（用語集の旧名と、過去の仕様 specs/001〜009 を除く）。既存のテストがすべて通る
