---
title: "deepwiki-to-md: DeepWikiの情報をMarkdownで手軽にエクスポート"
emoji: "📥"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [deepwiki, markdown, cli, docker, python]
published: true
published_at: 2025-05-11
---

DeepWikiすごいですね！OSSを使いはじめるときの取っ掛かりは、もう探す必要がなくなったように思います。
とくに図解が優秀で、wikiに出力済みの図解も、チャットで問い合わせて出力された図解も、調査結果として再利用したくなります。が、ダウンロードできないんですよね、、、

そこで「`deepwiki-to-md`」を公開しました。この記事では、`deepwiki-to-md`の魅力と使い方をご紹介します。

### `deepwiki-to-md`とは？

`deepwiki-to-md`は、DeepWikiのコンテンツをMarkdown形式でローカル環境に簡単にエクスポートし、管理・活用できるようにするためのCLIツールです。

このツールを使うことで、以下のことができるようになります。

  * DeepWikiのWikiコンテンツをMarkdown形式で取得する
    * ![](https://share.cleanshot.com/xMPxJ3Y5+)
  * DeepWikiのチャットログをMarkdown形式で取得する
    * ![](https://share.cleanshot.com/C0hDGqv6+)
  * Wikiやチャットログに含まれるMermaid記法で書かれた図も、適切に変換・保存して再利用する

### さっそく使ってみましょう (Getting Started)

#### インストール

1.  **前提条件**:
      * お使いのコンピューターにDockerがインストールされている必要があります。

2.  **スクリプトのダウンロード**:
      * `deepwiki-to-md`のラッパースクリプトをダウンロードし、実行権限を付与します。
      * 変換結果を残すディレクトリに、スクリプトを配置してください。

        ```bash
        # 例: ホームディレクトリ直下の ~/my_deepwiki_exports に配置する場合
        mkdir -p ~/my_deepwiki_exports
        curl -Lo ~/my_deepwiki_exports/deepwiki-to-md https://raw.githubusercontent.com/suwa-sh/deepwiki-to-md/refs/heads/main/bin/deepwiki-to-md
        chmod +x ~/my_deepwiki_exports/deepwiki-to-md
        cd ~/my_deepwiki_exports/
        ```

#### ツールの実行

スクリプトの準備ができたら、早速DeepWikiのコンテンツを取得してみましょう。
<https://deepwiki.com/langchain-ai/langchain> をサンプルに、リポジトリWikiとチャットログをそれぞれ取得してみます。

* **リポジトリWikiの取得例**:

  ```bash
  ./deepwiki-to-md wiki https://deepwiki.com/langchain-ai/langchain
  ```

* **チャットログの取得例**:

  ```bash
  ./deepwiki-to-md chat https://deepwiki.com/search/c4_a06e7db5-c0b8-4899-a80a-84cf8f36347d
  ```

### 結果

- 出力ディレクトリ

  ```txt
  ~/my_deepwiki_exports/
  ├── deepwiki-to-md
  ├── chat/
  │   └── c4_a06e7db5-c0b8-4899-a80a-84cf8f36347d/
  │       ├── chat.md
  │       └── images/
  │           ├── 0__diagram_0.svg
  │           ├── :
  │           └── 1__diagram_7.svg
  └── wiki/
      └── langchain-ai/
          └── langchain/
              ├── index.md
              ├── 1-langchain-overview.md
              ├── 2-core-architecture.md
              ├── 3-package-structure.md
              ├── 4-runnable-interface-&-lcel.md
              ├── 5-message-system.md
              ├── 6-provider-integrations.md
              ├── 7-model-interfaces.md
              ├── 8-provider-specific-implementations.md
              ├── 9-retrieval-and-vector-stores.md
              ├── 10-chains-and-agents.md
              ├── 11-chain-types-and-implementation.md
              ├── 12-agent-system.md
              ├── 13-tools-and-evaluation.md
              ├── 14-tool-system.md
              ├── 15-evaluation-and-testing.md
              ├── 16-developer-tools.md
              ├── 17-cli-and-templates.md
              ├── 18-cicd-and-release-process.md
              ├── 19-documentation-system.md
              ├── 20-user-documentation.md
              ├── 21-api-reference-generation.md
              └── images/
                  ├── 1__diagram_0.svg
                  ├── :
                  └── 21__diagram_5.svg
  ```

- 見え方
  - wiki
    - ![](https://share.cleanshot.com/xmBWN3zR+)
  - chat
    - deepwikiでの右ペインの参考コードは、回答の下にリンクとして出力されます。
    - ![](https://share.cleanshot.com/dYRJP975+)


### おわりに

`deepwiki-to-md` を利用することで、DeepWikiのわかりやすい情報を手軽にローカル環境へエクスポートできるようになります。バックアップとしてはもちろん、オフラインでの閲覧や他のドキュメントへの再利用など、様々な活用が考えられます。ぜひ一度お試しください。
