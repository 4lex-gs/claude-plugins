# claude-plugins

Claude Code の mod（プラグイン）をまとめたマーケットプレイスです。

## 一覧

| 名前 | 内容 |
| --- | --- |
| [session-memo](plugins/session-memo) | セッションごとに複数のメモ欄を持ち、欄の全文をプロンプトへ転記できる |

## 入れ方

ターミナルの Claude Code のプロンプトで:

```
/plugin install session-memo --marketplace 4lex-gs/claude-plugins
```

マーケットプレイスの追加を聞かれたら `y`、続けてスコープを選びます。

シェルから:

```bash
claude plugin install session-memo --marketplace 4lex-gs/claude-plugins
```

デスクトップアプリ（`/plugin` が使えない場合）: プロンプト欄の横の「＋」→「Plugins」→「Add marketplace」で `4lex-gs/claude-plugins` を追加し、「Add plugin」から session-memo を入れます。

## session-memo

- 入力欄の上の帯に、中身のあるメモ欄の件数が出ます。「メモを開く」か `/memo` でペインを開きます。
- ペインには複数のメモ欄を持てます。書いたそばから保存されます（改行は Shift+Enter）。
- 欄ごとの「転記」で、その欄の全文を Claude の入力欄へ入れます。
- 「広げる」「縮める」で欄の高さを変え、「この欄を消す」で欄を消します。
- `/memo <内容>` で新しい欄として追加、`/memo raw` で Markdown ファイルを直接開きます（macOS）。
- メモはプロジェクトの `.session-memo/<セッションID>.md` に保存されます。このフォルダには `*` だけの `.gitignore` が置かれ、git には入りません。

## 出典

session-memo は次の記事のアイデアを元にしています。

- https://zenn.dev/yesodco/articles/da634d752874b2
