# ダイジェスト: Claude Codeチームはレビュー完了の基準を「人が読んだか」から外した

元記事: [claude-code-claude-dev-solving-p1_20261018.md](../../../../../articles/claude-code-claude-dev-solving-p1_20261018.md)

## ひとことで言うと

Claude Code チームは、レビュー完了を「人が読んだか」から「何が壊れ、どの検査が捕まえるか」へ移した。人の承認はリスクと信頼リストで残り、公開の Code Review は指摘を付けるだけでマージは止めない。

## 核心ポイント

- 完了の問いは、人がコードを読んだか、から、その変更で何が壊れ、自動と人のどちらが捕まえるべきか、へ移したと本文が書いている。
- 段階は変更の内容が決め、職位は入力にしない。段階上は不要でも人を要する別の分類器があり、エージェントの承認は人の枠に入らない。
- 2026年6月から9月の「マージが2倍超、revert 割合が40%超減」は自己申告で、件数の始点と終点、revert の定義、インシデント率が無い。小さい変更、低リスクの docs や copy の増加、戻さずに後から直して済ますこと、戻しを速くしたこととは分かれておらず、レビュー方式だけの成果にはしない。
- 公開の Code Review は指摘と、失敗で終わらないチェックを付ける。止めるなら、自前の CI が `bughunter-severity` の `normal`（Important の件数で、未解決の過去の指摘も含む）を見て失敗させる。
- 2026年10月15日時点では、revert やインシデントが動いたときに承認を厳しくする仕組みはまだ無い。本文は、ゼロ人マージをこれ以上広げる前にその仕組みが欲しい、と書いている。

## メンタルモデル

![レビュー完了を判断する4列](images/structure.png)

持ち帰る単位は4列である。壊れうること、それを捕まえる自動検査、人の枠、戻し方。

段階の表で不要でも、別の分類器が人を要ると判断することがある。公開の Code Review は、人を省いた行を輸入しない。

## 具体例

公式の3段階を4列に落とした例。

| 壊れうること | 自動検査 | 人の枠 | 戻し方 |
| --- | --- | --- | --- |
| docs、copy、社内限定、flag の背後の追加 | 自動レビューとセキュリティが緑 | Low かつ信頼リスト内なら不要。リスト外は人2人目 | 再マージ。flag が無い変更は戻し方を PR に書く |
| 通常の製品変更。caching、auto-updater、system prompts | テスト、ビルド、自動レビュー | 人1人。指示した人がその一人に数える | flag、revert、段階公開。数分で戻せる前提 |
| 課金、CI の workflow、所有者が敏感と列挙したパス | セキュリティレビューを含む自動検査 | 常に人。High のパスは人2人 | 承認は新しいコミットで破棄する |

## 適用と判断

向く場面:

- 人のレビューを、全件を読む既定から、自動検査が捕まえない種類へ移すとき。
- 公開の Code Review を、指摘を PR に付ける層として入れ、マージ停止は自前の CI に置くとき。
- 低リスクを自動検査だけで通すかを、信頼リストと戻し方とセットで決めるとき。

確認すること:

- 職位を段階の入力にせず、段階上は不要でも人を要する判断を残しているか。
- エージェントの承認を、必要な人の承認に数えていないか。
- 6月から9月の倍率と revert 割合を、レビュー方式だけの成果にしていないか。
- `bughunter-severity` の行が無い完了を、指摘ゼロではなく判定無しとしているか。
- revert とインシデントが動いたときに承認を戻す仕組みが無い間、無承認の範囲を広げていないか。

## 限界・注意点

- 図の説明にある、収束の変更の前後の数（1ラウンドで通る内部 PR が65%から78%、5ラウンド以上が8.9%から1.5%、通るまでの平均レビューが2.08から1.32）は本文に無く、計測期間も無いので、revert 割合と足し合わせない。
- ホスト型レビューは diff と周囲のコードを読むだけで、ビルドも実行もしない。実行で確かめる層は、テストかビルドかスクリーンショットとして製品の外に置く。
- Zero Data Retention、HIPAA（米国の医療情報の規則）に合わせた構成、顧客管理の暗号鍵では使えず、BAA（医療情報を預かる契約）の対象でもない。レビューの処理は Anthropic の管理環境で動き、セルフホスト環境では動かない。
- 記事が埋めていないのは、revert の定義と絶対数、6月から9月のインシデント率と、戻さずに後から直して済ませた件数、ゼロ人承認の割合と分類器の誤分類、収束率の計測窓、一般提供後の1回あたりの費用である。

## 参考

- 元記事: [claude-code-claude-dev-solving-p1_20261018.md](../../../../../articles/claude-code-claude-dev-solving-p1_20261018.md)
- Addy Osmani, Morgan Westlee Lunt, Qing Wang. [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/). 2026-10-15.
- Anthropic. [Code Review is now generally available](https://claude.com/resources/articles/code-review-is-now-generally-available). 2026-10-15.
- Anthropic. [Code Review](https://code.claude.com/docs/en/code-review). Claude Code Docs. 2026-10-18 取得.
- Anthropic. [Code Review costs and usage](https://code.claude.com/docs/en/code-review-costs). Claude Code Docs. 2026-10-18 取得.
