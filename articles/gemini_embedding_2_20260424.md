---
title: "Gemini Embedding 2 調査まとめ: 仕様・ベンチマーク・採用判断"
emoji: "🧭"
type: "tech"
topics: ["GeminiEmbedding", "RAG", "Embedding", "MachineLearning", "GoogleCloud"]
published: true
published_at: 2026-04-25
---

## はじめに

Googleが2026年4月22日にGemini Embedding 2をGA（一般提供）としてリリースしました。初のネイティブ・マルチモーダル埋め込みモデルで、テキスト・画像・動画・音声・PDFを単一のベクトル空間に埋め込めます。

本記事では、このモデルの仕様・ベンチマーク・競合比較・日本語性能を公開情報から整理し、採用可否の判断材料を提供します。

想定読者は、RAGや検索システムの設計・実装に関わるエンジニアです。

本記事は、採用判断に必要な情報を以下の順で提供します。

| 要素名         | 説明                                              |
| -------------- | ------------------------------------------------- |
| 仕様把握       | モデル識別子、入出力、モダリティ、Task typeの整理 |
| v1との差分     | 既存ユーザー向けの移行インパクト                  |
| ベンチマーク   | 公式値・第三者値・独立ベンチの三視点              |
| 日本語性能     | JMTEB、fp16ベンチ、実務での評判                   |
| 価格と提供形態 | Gemini API／Vertex AIそれぞれの制約               |
| 競合比較       | OpenAI、Cohere、Voyage、OSSとの比較表             |
| 採用判断       | 採用・見送りの判断基準と次のアクション            |

## サマリー

採用可否を先に整理します。

| 用途                                                       | 推奨                                |
| ---------------------------------------------------------- | ----------------------------------- |
| マルチモーダルRAG（画像・音声・動画・PDFを単一空間で検索） | 即採用                              |
| 日本語テキストRAG                                          | 第一候補                            |
| コスト最優先の純テキスト用途                               | OpenAI 3-small、Voyage-3-liteを検討 |
| 既存v1運用中の移行                                         | PoCで性能差を確認してから判断       |

主な落とし穴は以下のとおりです。

- PDF 6ページ、動画120秒、画像6枚、音声180秒の入力制限
- Vertex AIでBatch prediction、Provisioned Throughputが非対応
- STS系タスクの絶対性能は相対的に弱い
- 独立レイテンシベンチマークは不在

## モデル仕様

Gemini Embedding 2の主要仕様は以下のとおりです。

| 項目               | 値                                                       |
| ------------------ | -------------------------------------------------------- |
| 識別子             | `gemini-embedding-2`（GA）、`gemini-embedding-2-preview` |
| GA日               | 2026-04-22                                               |
| Preview            | 2026-03-10                                               |
| ナレッジカットオフ | 2025-11                                                  |
| 最大入力           | 8,192 tokens（v1は2,048）                                |
| 出力次元           | デフォルト3,072、MRLで128から3,072                       |
| 推奨次元           | 768、1,536、3,072                                        |
| 対応言語           | 100言語超                                                |
| モダリティ         | text、image、video、audio、PDF                           |

入力モダリティごとの制限値は以下のとおりです。

| モダリティ | 制限                                                               |
| ---------- | ------------------------------------------------------------------ |
| 画像       | 1リクエストあたり最大6枚（PNG、JPEG、WebP、BMP、HEIC、HEIF、AVIF） |
| 動画       | 最大120秒（MP4、MOV）                                              |
| 音声       | 最大180秒（ネイティブ、文字起こし不要）                            |
| PDF        | 最大6ページ、1ファイル／プロンプト                                 |

Task typeパラメータは以下のように用意されています。

- 非対称タスク用: `search result`、`question answering`、`fact checking`、`code retrieval`
- 対称タスク用: `classification`、`clustering`、`sentence similarity`
- カスタムタスク命令もサポート

## v1からの差分

`gemini-embedding-001`（v1）と`gemini-embedding-2`（v2）の差分は以下のとおりです。

| 項目         | gemini-embedding-001 | gemini-embedding-2             |
| ------------ | -------------------- | ------------------------------ |
| モダリティ   | テキストのみ         | text、image、video、audio、PDF |
| 最大入力     | 2,048 tokens         | 8,192 tokens                   |
| 次元         | MRL対応              | 3,072（MRL 128から3,072）      |
| 音声処理     | 文字起こし必須       | ネイティブ埋め込み             |
| PDF          | 非対応               | OCR内蔵、直接入力              |
| 埋め込み空間 | v1と非互換           | 移行時は全件再埋め込み必須     |
| Text価格     | $0.15/1M tok         | $0.20/1M tok                   |

移行判断の要点は以下のとおりです。

- v1とv2の埋め込み空間は非互換
- 既存データの全件再エンベッドが必要
- テキスト単価は上昇（$0.15→$0.20）
- マルチモーダルが不要な場合は移行メリットが薄い

## ベンチマーク性能

### 公式発表値

DeepMindモデルページで公表されているスコアは以下のとおりです。

| ベンチマーク                        | スコア |
| ----------------------------------- | ------ |
| MTEB Multilingual 平均              | 69.9   |
| MTEB Code 平均                      | 84.0   |
| Text → Image（TextCaps）R@1         | 89.6   |
| Image → Text（TextCaps）R@1         | 97.4   |
| Text → Video（Vatex）nDCG@10        | 68.8   |
| Speech → Text（MSEB）MRR@10         | 73.9   |
| Text → Document（ViDoRe v2）nDCG@10 | 64.9   |

### 第三者集計（参考値）

第三者記事ではMTEB Multilingualで68.32（Mean Task）、MTEB English v2で73.30、MTEB Codeで74.66と報告されています。

公式値69.9と第三者値68.32の差の主な原因は以下と推定されます。

- MTEBのタスク集計方法（Mean Task／Mean Type）の差異
- ベンチマークのバージョン差（MTEB v1／v2）
- v1（68.32）とv2のスコアを混同して転記した可能性

比較対象を評価するときは、公式値を優先してください。

### 独立ベンチマーク

Chen Zhang氏が2026年3月に実施した10モデル比較では、Gemini Embedding 2は以下の結果を示しました。

| タスク                              | 結果                                                |
| ----------------------------------- | --------------------------------------------------- |
| 中英クロスリンガル hard（idiom）R@1 | 1.000（唯一満点）                                   |
| Needle-in-Haystack 32K              | 1.000（唯一32Kまで検証済み）                        |
| 画像↔テキスト R@1 hard              | 0.928（2位、1位はQwen3-VL-Embedding-2B OSSの0.945） |
| STS-B（ρ、MRL 256 dim）             | 0.689（同条件下でテスト対象中最下位）               |

このベンチマークからわかる特徴は以下のとおりです。

- クロスリンガル検索では単独首位
- 長文検索（32K）でも満点を維持
- 画像単独タスクではOSSのQwen3-VL-2Bに僅差で敗北
- STSタスクでは絶対値が弱い

## 日本語性能

日本語圏での評価を整理します。

| 観点                           | 状況                            |
| ------------------------------ | ------------------------------- |
| JMTEB公式スコア                | 日本語圏で未公表                |
| fp16の2000問日本語RAGベンチ    | P@1=0.588、MRR=0.724で全指標1位 |
| クロスリンガル安定性           | 日英韓中の言語分散が最小        |
| 日本語トークン消費目安         | 1,000文字で約500 tokens         |
| テキスト10万件×500 tokのコスト | 約$10                           |

音声ネイティブ処理は、日本語の文字起こし精度の低さを回避できる利点があります。帳票やスクショ検索は、日本企業の業務系SaaS文脈で好評を得ています。

## 価格・提供形態

### Gemini Developer API（paid tier）

価格体系は以下のとおりです。

| 入力  | 単価               |
| ----- | ------------------ |
| Text  | $0.20 / 1M tokens  |
| Image | $0.45 / 1M tokens  |
| Audio | $6.50 / 1M tokens  |
| Video | $12.00 / 1M tokens |

- Free tier: 全入力タイプで無料枠あり
- Batch API: 約50%オフ

### Vertex AI

Vertex AIでの提供形態は以下のとおりです。

| 項目                   | 状況                                     |
| ---------------------- | ---------------------------------------- |
| 課金形態               | Standard PayGoのみ                       |
| Batch prediction       | 非対応                                   |
| Provisioned Throughput | 非対応                                   |
| Flex PayGo             | 非対応                                   |
| Priority PayGo         | 非対応                                   |
| リージョン             | Global、US multi-region、EU multi-region |

### 提供経路

以下の経路で利用できます。

- Gemini API（AI Studio経由、Developer API）
- Vertex AI
- Gemini Enterprise Agent Platform
- サードパーティ統合: LangChain、LlamaIndex、Haystack、Weaviate、Qdrant、ChromaDB、Vertex AI Vector Search

### APIコード例

Gemini APIでの最小呼び出し例は以下のとおりです。

```python
from google import genai

client = genai.Client()

result = client.models.embed_content(
    model="gemini-embedding-2",
    contents="日本語の埋め込み対象テキスト",
    config={
        "task_type": "retrieval_document",
        "output_dimensionality": 1536,
    },
)

print(len(result.embeddings[0].values))  # 1536
```

公式ドキュメントのQuickstartとCookbookには、マルチモーダル入力（画像・音声・PDF）のサンプルが掲載されています。

### コスト試算式

日本語テキストのRAGでのコスト試算式は以下のとおりです。

```
月間コスト = (ドキュメント件数 × 平均文字数 ÷ 2) × $0.20 / 1,000,000
```

- 係数2は「日本語1000文字≒500トークン」を根拠
- Batch APIで処理する場合は半額

具体例を示します。

| ドキュメント件数 | 平均文字数 | 月間トークン | 月間コスト |
| ---------------- | ---------- | ------------ | ---------- |
| 10,000           | 1,000      | 5M           | $1.00      |
| 100,000          | 1,000      | 50M          | $10.00     |
| 100,000          | 5,000      | 250M         | $50.00     |
| 1,000,000        | 1,000      | 500M         | $100.00    |

## 競合比較

主要な埋め込みモデルとの比較表は以下のとおりです。

| モデル                        | Text価格 ($/1M)   | 最大入力  | マルチモーダル           | MTEB Avg     | 備考                          |
| ----------------------------- | ----------------- | --------- | ------------------------ | ------------ | ----------------------------- |
| Gemini Embedding 2            | 0.20              | 8,192 tok | text+img+video+audio+PDF | 69.9（公式） | マルチモーダル最強、Batch半額 |
| OpenAI text-embedding-3-large | 0.13              | 8,191 tok | textのみ                 | 64.60        | 安定の定番                    |
| OpenAI text-embedding-3-small | 0.02              | 8,191 tok | textのみ                 | 62.26        | 最安                          |
| Cohere Embed v4               | 0.10              | 128K tok  | text+image               | 65.20        | 超長文に強み                  |
| Voyage-3-large                | 0.06              | 32K tok   | text（限定画像）         | 66.80        | コスパ良好                    |
| Voyage-3-lite                 | 0.02              | 32K tok   | text                     | —            | 最安クラス                    |
| Qwen3-Embedding-8B（OSS）     | 0（セルフホスト） | —         | text                     | 70.58        | Apache 2.0、MTEB 2位級        |
| BGE-M3（OSS）                 | 0                 | —         | text                     | 63.00        | 定番OSS                       |

## 実採用事例

Googleが発表している採用事例は以下のとおりです。

| 企業       | 用途                    | 評価                                                        |
| ---------- | ----------------------- | ----------------------------------------------------------- |
| Everlaw    | 法務discovery 140万文書 | 87% accuracy（Voyage 84%、OpenAI 73%を上回る）、recall +20% |
| Box        | 文書QA                  | 正解率81%超、recall +3.6%                                   |
| Mindlid    | AIウェルネス            | Top-3 recall 82%（OpenAI 3-small +4pt）、median 420ms       |
| Poke       | AIメール                | 100 emails埋め込み21.45秒（Voyage-2比 -90.4%）              |
| Sparkonomy | クリエイター検索        | レイテンシ-70%、similarity score 2倍                        |

これらの数値はすべてGoogle発表ベースであり、独立した対照条件下の再現検証は存在しません。採用判断時は自前のPoC実施を推奨します。

## 反証・制限事項

### モデル自体の制限

- v1とv2の埋め込み空間は非互換（移行時は全件再埋め込み必須）
- PDF 6ページ以下、動画120秒以下、音声180秒以下、画像6枚／リクエスト以下
- Vertex AIでBatch prediction、Provisioned Throughputが非対応
- ナレッジカットオフは2025-11

### 性能面の弱点

- STS（文類似度）の絶対性能は相対的に弱い（MRL 256次元でVoyage、Jina、OpenAIより下）
- 画像↔テキスト単独タスクではQwen3-VL-Embedding-2B（OSS、2B）に敗北（0.928 vs 0.945）
- 集約エンベディングの分解能が低い傾向

### 運用面の懸念

- 独立レイテンシベンチマークは不在（Google発表値のみ）
- JMTEB公式スコア未公表
- 価格はOpenAI 3-largeの1.5倍、Cohere v4の2倍、OpenAI 3-smallの10倍

## 未解決の問い

現時点で判明していない項目は以下のとおりです。

| 問い                                    | 重要度 | 対処                           |
| --------------------------------------- | ------ | ------------------------------ |
| MTEB v2 Leaderboardの正式エントリー有無 | 中     | HuggingFace MTEB Spaceで要確認 |
| Voyage-4とのhead-to-head                | 中     | 2026-Q3以降の第三者ベンチ待ち  |
| 実運用レイテンシ（独立計測）            | 中     | 自前PoC必須                    |
| JMTEB公式スコア                         | 低     | SB Intuitions発表待ち          |
| 具体的レート制限（RPM、TPM）            | 中     | 公式Rate Limitsページ要確認    |

## 採用判断

### 採用すべきケース

1. マルチモーダルRAGが必要（画像、音声、動画、PDFを単一空間で検索）→ 即採用
2. 日本語、多言語RAG（日本語と英中韓の混在コンテンツ）→ 第一候補
3. 長文ドキュメント検索（8Kトークン級の議事録、契約書）→ 有力
4. コード検索（MTEB Code 84.0）→ 有力

### 採用を見送るべきケース

1. コスト最優先の純テキスト用途（個人PoCで無料枠を超える規模）→ OpenAI 3-small、Voyage-3-lite、OSSを検討
2. STS、クラスタリング中心のタスク（低次元圧縮重視）→ Voyage Multimodal 3.5、Jina v4の方が有利
3. 画像↔テキストのみ（他モダリティ不要）→ Qwen3-VL-Embedding-2B（OSS）で代替可
4. 既存v1で安定稼働中、マルチモーダル不要 → 移行コスト（再埋め込み）に見合うメリット薄

### 次のアクション

採用判断の流れは以下のとおりです。

1. 手元の用途がマルチモーダル要素を含むかを棚卸し
2. 含むならFree tierでPoC、日本語RAGの実データで比較実施
3. 含まないならOpenAI 3-small、Voyage-3-liteと並走比較し、コスト×性能で判断
4. 本番採用時はGemini API（paid tier）かVertex AIを選択。大量Batch処理が必要ならGemini API Batch（50%オフ）

## まとめ

Gemini Embedding 2は、マルチモーダルRAGが必要な用途では他社に代替のない選択肢です。日本語・多言語RAGでも第一候補となりますが、コスト最優先の純テキスト用途ではOpenAI 3-smallやVoyage-3-liteに分があります。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！

## 参考リンク

- 公式ドキュメント
  - [Gemini Embedding 2 GA (blog.google)](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-embedding-2-generally-available/)
  - [Gemini Embedding 2 Preview announcement](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-embedding-2/)
  - [DeepMind Embedding model page](https://deepmind.google/models/gemini/embedding/)
  - [Gemini API Embeddings docs](https://ai.google.dev/gemini-api/docs/embeddings)
  - [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
  - [Vertex AI model page](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/embedding-2)
  - [Gemini Embedding: Powering RAG and context engineering](https://developers.googleblog.com/gemini-embedding-powering-rag-context-engineering/)
- 記事
  - [Which Embedding Model Should You Actually Use in 2026? - dev.to / Chen Zhang](https://dev.to/chen_zhang_bac430bc7f6b95/which-embedding-model-should-you-actually-use-in-2026-i-benchmarked-10-models-to-find-out-58bc)
  - [Qdrant Meets Google Gemini Embedding 2](https://qdrant.tech/blog/qdrant-gemini-embedding-2/)
  - [New embedding model leaderboard shakeup - VentureBeat](https://venturebeat.com/ai/new-embedding-model-leaderboard-shakeup-google-takes-1-while-alibabas-open-source-alternative-closes-gap)
  - [Gemini Embedding 2 Review 2026 - ComputerTech](https://computertech.co/gemini-embedding-2-review/)
  - [Embedding Model Leaderboard MTEB March 2026 - awesomeagents](https://awesomeagents.ai/leaderboards/embedding-model-leaderboard-mteb-march-2026/)
  - [Embedding Models Pricing - April 2026](https://awesomeagents.ai/pricing/embedding-models-pricing/)
  - [日本語RAGのEmbeddingモデル、結局どれが最強なのか？（Zenn/fp16）](https://zenn.dev/fp16/articles/aa48dcae23974e)
  - [gemini embedding 2 で資料単位のナレッジ化が容易に（Zenn/bekku）](https://zenn.dev/bekku/articles/5fcbeae4ec5afb)
  - [Gemini Embedding 2（GMO次世代開発室）](https://recruit.group.gmo/engineer/jisedai/blog/gemini-embedding-2/)
  - [Gemini Embedding 2 ガイド（AQUA）](https://www.aquallc.jp/gemini-embedding-2-guide/)
  - [Gemini Embedding 2入門（Qiita/kai_kou）](https://qiita.com/kai_kou/items/4b72d4365a813ca1565f)
  - [Gemini Embedding 2 概要（note/npaka）](https://note.com/npaka/n/n1e39b1e67561)
