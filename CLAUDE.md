# CLAUDE.md — 火星往還ボードゲーム「REDLINE TO MARS」

1990年代のアメリカで火星往還を目指す、ローポリ3Dの戦略ボードゲーム。このリポジトリはこのゲーム専用。
持ち主はプログラミング初心者。**説明は日本語で、専門用語には短い説明を付ける。**

- 持ち主のパソコンには Node.js が入っていない。公開は Render の Blueprint(`render.yaml`、静的サイト)。手順は README.md
- ビルドツールを入れない。素の HTML / CSS / JavaScript。Three.js 0.170.0 を CDN(jsdelivr)から import map で読む
- サーバー・APIキー・外部への送信は使わない。保存はブラウザの localStorage だけ
- ルールの数字は `js/data.js`、ルールの計算は `js/game.js`(DOM を使わない。Node でも動く)
- ルールを変えたら `node tests/check-rules.mjs` で点検する
- 会社名・人物名は架空。実在の企業名・ロゴ・ゲーム名は使わない
- 画面の文字・エラー表示は日本語
- `?debug` を URL に付けたときだけ `window.__dbg` が出る(動作確認用)
- ほかのアプリ(ゆきのアプリ、レースゲームなど)のファイルを持ち込まない
