# ダイジェスト: Borderless LakehouseをGeminiの入口にするときの到達範囲

元記事: [google-cloud-cloud-google-p7_20261017.md](../../../../../articles/google-cloud-cloud-google-p7_20261017.md)

## ひとことで言うと

Gemini の Data agent が読めるのは、連合したカタログと明示した knowledge source の内側だけ。読んだデータはカタログのリージョンに複製が残る。提供段階はブログでなく各ドキュメントで確かめる。

## 核心ポイント

1. 発見時に取りにいくのはメタデータだけだが、読んだブロックはカタログのリージョンにキャッシュとして残る。「データを動かさない」はデータの所在地の保証にならない。
2. キャッシュには CMEK (顧客管理の暗号鍵) を使えない。CMEK 必須の組織ポリシーが効くと、キャッシュだけが無効になりクエリは走る。
3. ブログは GA と書くが、cross-cloud data access・caching・Iceberg V3 のドキュメントは 2026-10-15 時点で Preview。本番の前提にはドキュメントの表記を使う。
4. 到達範囲は問題設定より狭い。連合できるカタログの一覧にオンプレミスの表を読むコネクタは無く、Gemini の画面からカタログを作る手順も見つかっていない。

## メンタルモデル

![会話から読んだデータはどこに残るか](images/structure.png)

上段はメタデータの流れで、クエリは BigQuery からリモートカタログへ進む。下段はデータの流れで、相手クラウドの正本から読んだブロックがカタログのリージョンへ複製される。同じブロックの再読はこのキャッシュを使う。

## 具体例

EU の Amazon S3 のデータを、`us-east4` に作ったカタログ経由で BigQuery から読む (元記事が引くドキュメントの例)。キャッシュは `us-east4` に置かれる。正本は EU に残るが、複製は `us-east4` にもある。

## 適用と判断

向く場面:

- Databricks Unity Catalog・AWS Glue・Snowflake Horizon などにある Iceberg の表を、BigQuery の会話分析から読ませたい
- 取り込みパイプラインを作らずに、エージェントの参照先を増やしたい

エージェントに渡す前に決めること:

| 決めること | 目安・制約 |
|---|---|
| 連合するカタログ・namespace・表 | カタログあたり table 10,000、namespace あたり table 300 |
| Data agent の knowledge source | 上限 100。BigQuery のクエリは 500 GB of bytes processed まで |
| キャッシュを置くリージョン | CMEK 必須の組織ポリシーと衝突しないか |
| 会話プロンプトの分析 | 既定で有効。2026-11-23 以降は組織ポリシーで止める |
| 使う機能の提供段階 | ブログの一覧でなく、各ドキュメントのページ先頭で見る |

## 限界・注意点

- Iceberg V3 は BigQuery からは読み取りのみ。
- Delta Lake のコンソール取り込みはデータのコピーで、Amazon S3 上のソースは扱えない。
- リモート連合カタログに列単位の制御を掛ける記述は見つかっていない (確認できたのはテーブル単位)。
- 帯域・性能・顧客事例の数値はベンダーの自己記述で、測定条件は公開されていない。
- クロスクラウドクエリとキャッシュに固有の公開単価は見つかっていない。

## 参考

- 元記事 (詳細と全出典): [google-cloud-cloud-google-p7_20261017.md](../../../../../articles/google-cloud-cloud-google-p7_20261017.md)
- [Bringing the borderless Lakehouse into the agentic era with innovations for Gemini](https://cloud.google.com/blog/products/data-analytics/borderless-lakehouse-integrates-with-gemini/) (Google Cloud Blog、2026-10-16)
- [About cross-cloud data access](https://docs.cloud.google.com/lakehouse/docs/about-cross-cloud-data-access)
- [Conversational analytics](https://docs.cloud.google.com/bigquery/docs/conversational-analytics)
- [Quotas](https://docs.cloud.google.com/lakehouse/docs/quotas)
