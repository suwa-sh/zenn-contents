---
title: "エアギャップ環境のレガシーコード分析を加速する。VS CodeとLSPでシーケンス図を自動生成しよう"
emoji: "🗺️"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [VSCode, レガシーコード, LSP, シーケンス図, 開発効率化]
published: true
publish_at: 2025-06-11
---

広大なレガシーシステムのコードベースを前に、機能の全体像が掴めず途方に暮れた経験はありませんか？特に、外部サービスの利用が制限される**エアギャップ環境**では、情報収集や分析ツールに頼れず、孤軍奮闘を強いられます。「便利なAI分析ツールが使えれば…」「ローカルLLMを試しても精度が出ない…」そんなジレンマを抱える開発者は少なくないはずです。

### AIは不要！身近な環境で分析の第一歩を

もし、AIのような先進技術に頼らずとも、今お使いの環境で分析の第一歩を劇的に効率化できるとしたらどうでしょう。

私たちがまず知りたいのは、特定の機能が「どのような処理の流れで動いているか」です。つまり、**機能全体のコールスタックを把握する**こと。コードを追いながら「この関数はどこから呼ばれている？」「この処理の全体像は？」と何度も確認するのは、骨の折れる作業です。

この地道な追跡作業のヒントは、普段何気なく使っているVS Codeの **「定義へ移動 (F12)」機能**に隠されていました。

### LSP (Language Server Protocol) の力で、呼び出し関係を視覚化する

実は、「定義へ移動」や「参照の検索」といったコードナビゲーション機能は、**LSP (Language Server Protocol)** という言語サーバーの仕組みによって支えられています。LSPは、エディタとサーバー間でコード情報をやり取りするための共通規格で、その中には**呼び出し階層（Call Hierarchy）を特定する強力なAPI**が含まれています。

このAPIを活用すれば、関数やメソッドの呼び出し関係を芋づる式に辿り、コールスタック全体を明らかにできるのです。

このコンセプトを元にした先行事例として、Python向けの素晴らしいツール [PySequenceReverse](https://github.com/gusztavj/PySequenceReverse) があります。このアイデアに触発され、Pythonに追加でTypeScriptとJavaにも対応したVS Code拡張機能として開発したのが、**[MultiLangSequenceReverse](https://github.com/suwa-sh/multilang-sequence-reverse)** です。

https://marketplace.visualstudio.com/items?itemName=suwa-sh.multilang-sequence-reverse

### 今すぐVS Codeでレガシー分析を始めよう！

あなたがVS Codeを使っているなら、準備は数分で完了します。

#### 導入はわずか1ステップ
1.  VS Codeのマーケットプレイスで「**MultiLangSequenceReverse**」と検索し、インストールします。

![インストール](https://share.cleanshot.com/b2Ty0ltw+)
*インストール*

#### 使い方も驚くほどシンプル
1.  分析したい機能の**エントリーポイント（起点）となるメソッド**をコード上で見つけます。
2.  そのメソッド名を**右クリック**します。
3.  コンテキストメニューから **「Create diagram for this function」** を選択するだけです。

![起動方法](https://share.cleanshot.com/Q2pYHM3T+)
*起動方法*

すると、複雑に絡み合った呼び出し関係が、 **mermaid形式のシーケンス図ファイル(.mmd)** として自動生成されます。

![単純なサンプル](https://share.cleanshot.com/BJx9L8TK+)
*単純なサンプル*

![複雑なサンプル](https://share.cleanshot.com/jwHpvvxg+)
*複雑なサンプル*


生成されたシーケンス図を見れば、関数間の呼び出し関係や処理の流れが一目瞭然。コードの理解度を飛躍的に高め、エアギャップという制約の中でも効率的な分析を可能にします。

### 分析の「第一歩」を力強くサポート

MultiLangSequenceReverseは、あくまで分析の「第一歩」を支援するツールです。動的な呼び出しや、リフレクションを用いた処理までは追跡できないといった限界もあります。

しかし、大規模な改修前の影響範囲調査や、新規メンバーが既存コードを理解する際の強力な足がかりとなるはずです。複雑なレガシーコードの森を歩き始めるための「地図」として、ぜひこのツールをお試しください。あなたの分析作業をきっと加速させてくれるはずです。

もし使ってみて、「こんな機能が欲しい」「ここが分かりにくい」といったご意見やご感想がありましたら、[GitHubのIssue](https://github.com/suwa-sh/multilang-sequence-reverse/issues)や記事のコメント、SNSでお気軽にお知らせいただけると大変嬉しいです。

https://marketplace.visualstudio.com/items?itemName=suwa-sh.multilang-sequence-reverse
