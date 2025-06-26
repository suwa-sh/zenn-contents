---
title: "技術調査 - ストアドプロシージャ駆動型システムのデータフロー分析"
emoji: "🔍"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["DataLineage", "SQL", "StoredProcedure", "LegacyModernization", "Database"]
published: true
published_at: 2025-06-25
---

## ■はじめに：データフローの不透明性という根深い課題

### ●レガシーシステムの現状

現代のエンタープライズシステム、特に長年稼働してきたレガシーシステムでは、複雑なビジネスロジックが多数のストアドプロシージャ内に実装されています。これらのシステムは組織の根幹を支える一方で、内部構造がブラックボックス化し、データの流れが極めて不透明になっています。この不透明性は、システムの保守、近代化（モダナイゼーション）、クラウド移行において深刻なリスクです。たった一つの変更が予期せぬ障害を引き起こす可能性があるため、システム内部のデータフローを正確に把握し、可視化する能力が不可欠となります。

### ●課題解決のための主要な分析手法

この複雑な課題の解決には、主に二つの分析手法を用います。

1.  **データリネージ**
    データがどこで発生し、どのように変換され、最終的にどこで利用されるかを追跡する技術です。データの出所を明確にし、信頼性を保証します。根本原因の分析を迅速化するだけでなく、GDPRのようなデータ保護規制への遵守や、データ品質の維持にも極めて重要です。

2.  **影響分析（依存関係分析）**
    特定のオブジェクト（テーブル、ビュー、プロシージャなど）への変更が、他にどのオブジェクトへ影響を及ぼすかを特定するプロセスです。開発者や管理者は、変更に伴う潜在的なリスクを事前に評価し、安全な開発と保守を計画できます。

### ●記事の構成

- **第I部：商用ソリューション**
    - 高度な自動化機能と専門的なサポートを提供する、市場で実績のあるツールを解説します。
- **第II部：オープンソースエコシステム**
    - 柔軟性とカスタマイズ性に優れるツール群を組み合わせるアプローチを探求します。
- **第III部：ネイティブデータベース機能**
    - 各データベースが標準で提供する機能に焦点を当て、その可能性と限界を明らかにします。
- **第IV部：戦略的なツール選択フレームワーク**
    - これまでの知見を統合し、最適なツールを選択するための具体的な指針を整理します。


## ■第I部：自動データリネージおよび影響分析のための商用ソリューション

本章では、複雑なデータフロー分析に対し、最も直接的で効果的な解決策を提供する商用ツールを深掘りします。

### ●概要

商用ツールは、専門的なサポート、洗練されたUI、そして特定のビジネス課題解決に特化して開発されています。手動での解析が非現実的な大規模システムにおいて、特にその価値を発揮します。

### ●詳細分析：Gudu SQLFlow

https://www.gudusoft.com/jp/sqlflow-クラウド/

#### ▷コア技術：高度なSQL解析エンジン

Gudu SQLFlowの最大の強みは、10年以上にわたり開発された独自の**SQL解析エンジン**にあります。このエンジンは、SQLスクリプトの実行ロジックを深く解析し、**カラムレベルのデータリネージ**を導き出します。Oracle、SQL Server、Snowflakeなど20を超える主要なデータベースのSQL方言をサポートし、多様な環境で高い汎用性を発揮します。

#### ▷主要な機能

  - **カラムレベルリネージ**
      - ソースカラムからターゲットカラムへのデータの流れを非常に詳細に追跡します。
      - 直接的なデータの流れ（direct data flow）と、`WHERE`句の条件などが結果に影響する間接的なデータの流れ（indirect data flow）を明確に区別して表示可能です。
  - **強力な可視化とUI**
      - 複雑なデータリレーションシップを、技術者以外にも理解しやすいインタラクティブなグラフィカルUIで提供します。
      - SQLエディタ、サンプルクエリ、スキーマやリネージグラフの探索機能も含まれます。
      - JavaScriptベースの「ウィジェット」を利用して、可視化機能を他のアプリケーションに容易に組み込めます。
  - **多様なコネクタとデータソース**
      - ローカルのSQLファイル、データベースへの直接接続、GitHubのようなコードリポジトリからのソースコード取得に対応します。
      - Amazon RedshiftやSnowflakeなどのクエリ履歴ログも解析対象にできます。

#### ▷高度なロジックの取り扱い

Gudu SQLFlowは、複雑なストアドプロシージャや**動的SQL（Dynamic SQL）** の解析を明確にサポートしています。動的SQLは実行時にSQL文が構築されるため、静的解析ツールでは追跡が困難ですが、Gudu SQLFlowはこの課題に対応します。`CASE-WHEN`文のような複雑なロジックも、特殊な関数として扱い、依存関係を正確に追跡します。

#### ▷導入モデルと価格体系

クラウド（SaaS）、オンプレミス、Javaライブラリの3つの導入モデルを提供します。

  - **価格体系**
      - **クラウド版:** 無料のベーシックティアと、月額\$49.99からのプレミアムティアが存在します。最大30日間の無料プレミアムトライアルを利用できます。
      - **オンプレミス版:** 月額\$500から、または一括払い\$4,800から。サポートするデータベースの種類に応じて料金が変動します。
      - **エンタープライズ版（Javaライブラリ）:** カスタム価格設定です。

#### ▷Gudu SQLFlowの市場戦略：開発者起点のボトムアップアプローチ

Gudu SQLFlowは、GitHub上で機能的な「Lite」バージョン（Python/Java）を無料で提供し、低価格のクラウド版を用意することで、開発者が気軽に試せる環境を整えています。この戦略は、以下の段階的なプロセスを想定しています。

https://github.com/sqlparser/python_data_lineage

1.  開発者が個人的な課題解決のため、無料または低コストでツールを導入・評価する。
2.  ツールの強力な解析能力が実証され、組織内での価値が認識される。
3.  チーム利用やガバナンスの必要性が生じ、高価格帯のオンプレミス版やエンタープライズ版の契約へと繋がる。

この「ボトムアップ」戦略は、製品のコア技術に対する強い自信の表れと言えるでしょう。

### ●詳細分析：Visual Expert

https://www.visual-expert.com/JA/

#### ▷コア技術：静的コードおよび影響分析

Visual Expertは、アプリケーションとデータベースのソースコードを解析し、オブジェクト間の依存関係をマッピングする**静的コードアナライザ**です。コードの変更がもたらす影響を予測し、システムの安定性を維持します。特に、PowerBuilder製のフロントエンドとOracleやSQL Serverバックエンド間の依存関係を解析する、**言語横断的な分析能力**が最大の特長です。

#### ▷主要な機能

  - **影響分析と依存関係の可視化**
      - 「呼び出しの連鎖」やオブジェクト間の依存関係を、ダイアグラムやコールツリーで直感的に可視化します。
      - 「このテーブルのカラムを変更した場合、どのコードが影響を受けるか？」といった問いに、明確な答えを提供します。
  - **CRUDマトリックス**
      - どのプログラムが、どのテーブルに対してCRUD（Create, Read, Update, Delete）操作を行っているかを自動で生成し、一覧表示します。
  - **コード品質とセキュリティスキャン**
      - 数百のルールに基づきコードをスキャンし、品質問題（未使用オブジェクトなど）やセキュリティ脆弱性（SQLインジェクションリスクなど）を検出します。
  - **AIによる機能強化（ベータ版）**
      - AIを活用してコードの最適化提案やコメントの自動生成を行う、先進的な機能が追加されています。

#### ▷高度なロジックの取り扱い

静的アナライザとして、コード構造の理解に優れています。**再帰的共通テーブル式（Recursive CTE）** のような複雑な構造も、コード内の参照を追跡することで解析可能と推測されます。
一方で、静的分析の弱点として、実行時に文字列として動的に構築される**動的SQLは解析できません**。`sp_executesql`のようなコマンドの呼び出しは認識できても、その引数となる変数の内容までは解析できないため、データリネージに盲点が生じる可能性があります。

#### ▷導入モデルと価格体系

開発者のPCへのローカル導入、またはチームで共有するサーバー導入が可能です。デスクトップ版とWeb版のUIを提供します。

  - **価格体系**
      - ライセンスは年間サブスクリプションまたは永久ライセンスで販売されます。
      - 価格は機能とコード行数に基づきます。「スタンドアロンライセンス」は年間約\$495から、または一括払い\$1,435から。日本の詳細価格では、「ベーシック」永久ライセンスが279,000円、「プロフェッショナル」が570,000円で、初年度のサポート契約が必須です。

#### ▷Visual Expertの位置づけ：「レガシーモダナイゼーション」の強力な専門ツール

Visual Expertは、特定の目的に高度に最適化されたツールです。

1.  **PowerBuilderの強力なサポート:** 製品資料では、OracleやSQL Serverと並び、レガシーなクライアント/サーバー開発ツールであるPowerBuilderのサポートが繰り返し強調されています。
2.  **モダナイゼーションに特化した機能:** アプリケーション層とデータベース層を横断する影響分析やCRUDマトリックスは、まさにレガシーシステムの移行プロジェクトで必要不可欠な機能です。
3.  **ユーザーからの高い評価:** 古く複雑なコードベースを理解し、変更の影響を判断する上での価値が高く評価されています。

これらの点から、Visual Expertは **「レガシーモダナイゼーション」という専門的でリスクの高いシナリオにおいて、その価値を最大限に発揮するツール** と結論付けられます。

### ●市場の概観と比較分析

商用ツール市場には、本稿で紹介した専門ツールの他に、Alation、Collibra、Informatica、Octopaiといった広範なデータガバナンスプラットフォームも存在します。これらのプラットフォームでは、データリネージは数ある機能の一つであり、価格帯が高く、導入も大規模になる傾向があります。

https://www.alation.com/ja/

**比較表**

| 特徴 | Gudu SQLFlow | Visual Expert | Alation（代表的なエンタープライズプラットフォーム） |
| :--- | :--- | :--- | :--- |
| **コア技術** | SQL実行ロジック解析 | 静的コード解析 | メタデータ集約・カタログ化 |
| **カラムレベルリネージ** | ◎（直接・間接フローを区別） | ○ | ○（コネクタ依存） |
| **動的SQLサポート** | ◎ | ×（解析不可） | △（限定的） |
| **再帰的CTEサポート** | ◎ | ○（静的追跡） | ○（コネクタ依存） |
| **言語横断分析 (PB/SQL)** | × | ◎ | × |
| **データベースサポート** | 20種類以上 | SQL Server, Oracle | 幅広いコネクタ群 |
| **導入形態** | クラウド, オンプレミス, Javaライブラリ | ローカル, サーバー (Web/Desktop) | 主にクラウド/オンプレミス |
| **主なユースケース** | データ中心のリネージ分析 | アプリケーション影響分析 | エンタープライズデータガバナンス |
| **価格モデル** | サブスクリプション, 永久ライセンス | サブスクリプション, 永久ライセンス | 高額なエンタープライズ契約 |


## ■第II部：データリネージのためのオープンソースエコシステム

本章では、商用ツールに代わる強力で柔軟な選択肢として、オープンソース（OSS）のコンポーネントを組み合わせるアプローチを探ります。

### ●概要

OSSは、単一のツールではなく、複数のコンポーネントを組み合わせて「スタック」を構築するアプローチです。高度なカスタマイズを必要とし、強力な社内エンジニアリング能力を持つ組織に最適と言えます。

### ●OpenLineage標準：相互運用性の基盤

https://openlineage.io/

  - **概要:** データリネージメタデータを収集するための**オープンスタンダード**およびAPI仕様です。
  - **目的:** 異なるシステム（スケジューラ、DWH、SQLエンジンなど）が、リネージイベントを報告するための統一フォーマットを確立すること。
  - **コアコンセプト:** `Jobs`（ジョブ）、`Runs`（実行）、`Datasets`（データセット）というシンプルなモデルを定義し、`Facets`（ファセット）と呼ばれるメタデータの断片で拡張可能です。
  - **重要性:** ツール間のシームレスな相互運用を可能にし、LF AI & Data Foundationの卒業プロジェクトとして、その成熟度とコミュニティの支持を示しています。
  - **統合:** Spark、Airflow、dbtなど、成長を続けるエコシステムと統合できます。

### ●Marquez：リネージの保存と可視化

https://marquezproject.ai/

  - **役割:** OpenLineage APIの公式なリファレンス実装です。リネージメタデータを受信、保存、可視化するバックエンドサービスとして機能します。
  - **主要機能:** REST API、PostgreSQLバックエンド、そしてリネージグラフを可視化するWeb UIを提供します。
  - **カラムレベルリネージ:** UI上で個々のカラムがデータフローをどのように通過するかを追跡する機能を持ちます。

### ●Apache Atlas：広範なガバナンスフレームワーク

https://atlas.apache.org/

  - **役割:** リネージを主要な構成要素とする、より包括的なメタデータ管理およびデータガバナンスのフレームワークです。Marquezの代替バックエンドとしても機能します。
  - **主要機能:** リネージ機能に加え、メタデータのための型システム、データ分類機能（例：PII）、独自の検索用DSLなどを提供します。
  - **リネージ機能:** Hive、Impala、Sparkなどのソースからリネージグラフを構築できます。

### ●実践的な実装：セルフホスト型リネージスタックの構築

#### ▷課題：ストアドプロシージャの解析

OSSエコシステムはデータパイプラインツールとの統合は強力ですが、ベンダー固有の複雑なストアドプロシージャを直接解析する、すぐに使えるサポートはまだ成熟していません。

#### ▷解決策：SQLパーサーの活用

ストアドプロシージャの分析には、専用のSQLパーサーライブラリが不可欠です。OpenLineageプロジェクトはRustベースのSQLパーサー（`openlineage-sql`）を提供していますが、その能力はまだ発展途上であり、Guduのような成熟した商用パーサーと比較すると機能範囲が限定的な可能性があります。

#### ▷構築ステップ

OSSコンポーネントでストアドプロシージャのリネージ分析システムを構築するには、以下のエンジニアリング作業が必要です。

1.  **デプロイ:** MarquezやApache AtlasなどのバックエンドサービスをDockerやKubernetesでデプロイします。
2.  **抽出:** 対象データベースからストアドプロシージャのソースコードを抽出するカスタムスクリプトを開発します。
3.  **解析:** `openlineage-sql`やGudu SQLFlowのLite版などのライブラリを使い、抽出したSQLを解析します。
4.  **イベント生成:** 解析結果をOpenLineage仕様のJSONイベントとしてフォーマットします。
5.  **取り込み:** 生成したJSONイベントをMarquezやAtlasのAPIに送信します。
6.  **可視化:** MarquezやAtlasのUIでリネージグラフを確認します。

#### ▷オープンソースの本質：「完成した城」ではなく「レゴブロック」

OSSは、すぐに使える単一のツールではなく、モジュール化されたコンポーネント群、いわば「レゴブロック」です。ユーザー自身がインテグレーターとなり、パーサーとバックエンドをカスタムコードで接続する必要があります。このことから、OSSの選択は、単なるコスト削減策ではなく、**大規模な社内エンジニアリングプロジェクトへのコミットメント**を意味することを理解する必要があります。


## ■第III部：ネイティブデータベース機能とその限界

本章では、データベースベンダー自身が提供する、最も手軽なアプローチである組み込みツールやシステムビューを探求します。

### ●概要

これは最も低コストで導入が容易ですが、機能は限定的です。迅速な確認には役立ちますが、本格的なデータフロー分析には向いていません。

### ●SQL Server

  - **ツール:** `sys.dm_sql_referencing_entities`および`sys.dm_sql_referenced_entities`という動的管理関数（DMF）を提供します。SQL Server Management Studio (SSMS) のUIでも依存関係を可視化できます。
  - **限界:**
      - **オブジェクトレベル**の依存関係のみ追跡します。カラムレベルのリネージは提供しません。
      - 動的SQL内の依存関係は追跡が困難です。

### ●Oracle

  - **ツール:** `DBA_DEPENDENCIES`というデータディクショナリビューで依存関係を追跡します。階層問い合わせで依存ツリーを表示できます。
  - **限界:**
      - **オブジェクトレベル**の依存関係のみ追跡します。カラムレベルのリネージは提供しません。
      - データベースリンクを介してアクセスされるテーブルへの依存関係は追跡されません。

### ●PostgreSQL

  - **ツール:** `pg_depend`システムカタログテーブルに依存関係情報を保存します。
  - **限界:**
      - PL/pgSQLなどで書かれた関数本体の**内部で参照されるオブジェクトへの依存関係を追跡しません**。
      - 追跡されるのは関数のシグネチャ（引数型など）に対する依存関係のみであり、データフロー分析において大きな盲点となります。

### ●分析：ネイティブツールの有効性と限界

  - **有効な場合:**
      - 「このテーブルを削除したら、どのプロシージャがエラーになるか？」といった単純な影響分析には、高速かつ無料で十分です。
  - **限界がある場合:**
      - **真のデータフロー分析には全く不十分です**。カラムレベルのリネージを提供できず、複雑な変換や動的SQLの流れを追跡できません。
      - これらのツールは「何が何にリンクしているか？」には答えますが、「Aのデータがどのように変換されBに入るのか？」という問いには答えられません。

ネイティブ機能のこの限界こそが、Gudu SQLFlowやVisual Expertのような高度な専門分析ツールの需要を生み出しているのです。


## ■第IV部：戦略的なツール選択フレームワーク

本章では、これまでの分析を基に、ユーザーが自身の状況に応じて適切なツールを選択するための構造化されたプロセスを提供します。

### ●コア要件の定義：選択前のチェックリスト

ツールを評価する前に、以下の要件を明確にすることが不可欠です。

  - **技術環境**
      - サポート必須のデータベースは何か？ (SQL Server, Oracleなど)
      - 動的SQLはどの程度使用されているか？
      - 言語横断的な分析（例: PowerBuilder）は必要か？
  - **分析の深度**
      - オブジェクトレベルの依存関係で十分か、**カラムレベルのリネージ**が必須か？
  - **ユースケース**
      - 主な目的は何か？（迅速な影響分析、大規模なレガシー移行、全社的なデータガバナンスなど）
  - **自動化と統合**
      - CI/CDパイプラインとの統合は必要か？
      - データカタログと統合するためのREST APIは必要か？
  - **組織的文脈**
      - 予算はどの程度か？
      - ソリューションを導入・維持するための社内エンジニアリング専門知識のレベルは？

### ●ユースケース深掘り：レガシーシステム移行

データリネージツールは、レガシーシステム移行のような高リスクのプロジェクトで決定的な役割を果たします。

1.  **現状（As-Is）の把握:** 移行開始前に、依存関係とデータフローの包括的なマップを作成し、「予期せぬ発見」を未然に防ぎます。
2.  **影響分析:** スキーマ変更やリファクタリングの際に、下流への影響を正確に予測し、システムの破壊を防ぎます。
3.  **コード変換:** 異なるデータベース方言への移行において、データリネージの理解は、ビジネスロジックを正しく書き換える上で極めて重要です。
4.  **検証とテスト:** 移行後、データリネージマップを使い、新システムのデータフローが旧システムと一致していることを検証し、データの完全性を保証します。

データリネージツールは、当て推量のシステム移行を、**管理され、十分に理解されたエンジニアリングプロジェクトへと変革します**。

### ●意思決定マトリックス

| 評価基準 | 商用ツール (例: Gudu, VE) | オープンソーススタック (例: OL+Marquez) | ネイティブDBツール |
| :--- | :--- | :--- | :--- |
| **価値実現までの時間** | **最速** | 最遅 | 高速 |
| **総所有コスト (TCO)** | 高 | 低（ただし高いエンジニアリングコストを内包） | **最低** |
| **機能の深度** | **最深** | 可変（構築次第） | 最浅 |
| **カスタマイズ性** | 中 | **最高** | 最低 |
| **サポートと保守** | **専門サポートあり** | コミュニティ/自己責任 | ベンダー/なし |
| **理想的なユーザー** | エンタープライズ/開発チーム | 専門的なエンジニアリングチーム | DBAによる迅速な確認 |


## ■まとめ

データフロー分析ツール市場は、主に**静的コードアナライザ**と**SQLパーサー**という二つのアプローチに大別されます。OSSは柔軟性を提供しますが導入には複雑さが伴い、ネイティブツールは手軽ですが機能は限定的です。

### ●アーキタイプ別の提案

  - **多様な環境を持つ、コンプライアンス重視の大規模企業**
      - **提案:** **AlationやInformaticaのような商用エンタープライズプラットフォーム**、または**Gudu SQLFlowのような専門的なオンプレミスツール**。サポート体制、セキュリティ、信頼性がコストを上回る価値を提供します。
  - **重要なレガシーアプリ（例：PowerBuilder + Oracle）を移行中の中規模企業**
      - **提案:** **Visual Expert**。この特定のシナリオに特化した機能セットは、他に類を見ない価値とリスク軽減をもたらします。
  - **強力なエンジニアリング能力を持つ、データ先進的なテクノロジー企業**
      - **提案:** **オープンソーススタック（OpenLineage + Marquez/Atlas + カスタムロジック）**。最大限のコントロールとカスタマイズ性を提供し、ベンダーロックインを回避できます。
  - **予算が限られている個人開発者または小規模チーム**
      - **提案:** **Gudu SQLFlowの無料版、Lite版、またはクラウド版**。低い参入障壁で強力なカラムレベルリネージ分析にアクセスできます。よりシンプルな要件であれば、ネイティブデータベースツールが現実的な選択肢です。

### ●考察

ストアドプロシージャシステムでのデータフロー分析は、もはや乗り越えられない壁ではありません。問題は、どのツールの哲学、機能、ビジネスモデルが、組織の特定の技術的および戦略的ニーズに最も適合するかという、**戦略的な問い**へと移行しています。適切なツールを選択することは、ブラックボックス化したシステムに光を当て、未来の変更に対する自信と統制を取り戻すための、最も重要な第一歩です。


この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！


## ■参考リンク

### ●Gudu SQLFlow

-   **公式ドキュメント**
    -   [Data Lineage Basics | Gudu SQLFlow Product Docs](https://docs.gudusoft.com/2.-concepts/data-lineage)
    -   [Widget Get started | Gudu SQLFlow Product Docs](https://docs.gudusoft.com/4.-sqlflow-widget/get-started)
    -   [Data lineage visualization: analyzing complex SQL queries - gudusoft.com](https://www.gudusoft.com/sqlflow-data-lineage-visualization-tool-by-analyzing-complex-sql-queries/)
    -   [Pricing - Data lineage visualization: analyzing complex SQL queries - gudusoft.com](https://www.gudusoft.com/pricing/)
    -   [SQL Data Lineage Tool, automated data lineage analysis - gudusoft.com](https://www.gudusoft.com/)
    -   [データ系列の視覚化: 複雑な SQL クエリの分析 - gudusoft.com](https://www.gudusoft.com/jp/sqlflow-data-lineage-visualization-tool-by-analyzing-complex-sql-queries/)
    -   [複雑な SQL ステートメントのデータ系統を 1 分で取得する方法| | Gudu SQLFlow - gudusoft.com](https://www.gudusoft.com/jp/%E8%A4%87%E9%9B%91%E3%81%AA-sql-%E3%82%B9%E3%83%86%E3%83%BC%E3%83%88%E3%83%A1%E3%83%B3%E3%83%88%E3%81%AE%E3%83%87%E3%83%BC%E3%82%BF%E7%B3%BB%E7%B5%B1%E3%81%AE%E5%8F%96%E5%BE%97/)
    -   [SQLFlow オンプレミス バージョン - gudusoft.com](https://www.gudusoft.com/jp/sqlflow-%E3%82%AA%E3%83%B3%E3%83%97%E3%83%AC%E3%83%9F%E3%82%B9-%E3%83%90%E3%83%BC%E3%82%B8%E3%83%A7%E3%83%B3/)
-   **GitHub**
    -   [sqlparser/java\_data\_lineage: Analyze SQL and stored procedure data lineage using Java](https://github.com/sqlparser/java_data_lineage)
    -   [sqlparser/python\_data\_lineage: Data lineage tools in python](https://github.com/sqlparser/python_data_lineage)
-   **記事**
    -   [About Gudu SQLFlow - ComponentSource](https://www.componentsource.com/product/gudu-sql-flow/about)
    -   [Gudu SQLFlow - ComponentSource](https://www.componentsource.com/product/gudu-sql-flow)
    -   [Free SQLFlow Premium Account Trial - SQL Pretty Printer](https://www.dpriver.com/blog/2023/12/free-sqlflow-premium-account-trial/)
    -   [Gudu SQLFlow : What's it and why it is important? - SQL Pretty Printer](https://www.dpriver.com/blog/2022/05/gudu-sqlflow-whats-it-why-it-important/)
    -   [Gudu SQLFlow Data Lineage Analysis Level Introduction - SQL Pretty Printer](https://www.dpriver.com/blog/2022/05/gudu-sqlflow-data-lineage-analysis-level-introduction/)
    -   [How to use Gudu SQLFlow data lineage tool to analyze case-when statement？ - SQL Pretty Printer](https://www.dpriver.com/blog/2022/05/how-to-use-gudu-sqlflow-data-lineage-tool/)
    -   [Introduction of Gudu SQLFlow - SQL Pretty Printer](https://www.dpriver.com/blog/2022/08/introduction-of-gudu-sqlflow/)
    -   [SQLFlow Reviews in 2025 - SourceForge](https://sourceforge.net/software/product/SQLFlow/)
    -   [Determining Impact and Data Lineage - sqlparser.com](https://sqlparser.com/determining-impact-data-lineage.php)

### ●Visual Expert

-   **公式ドキュメント**
    -   [Static Code Analysis Rules | Visual Expert](https://rules.visual-expert.com/)
    -   [Object Dependencies Analysis Tool for PL/SQL & T-SQL - Visual Expert](https://www.visual-expert.com/EN/visual-expert-documentation/code-cross-references/object-dependencies-ve-web.html)
    -   [PowerBuilder, Oracle PL/SQL, and SQL Server T-SQL Static Code Analyzer - Visual Expert](https://www.visual-expert.com/EN/support-question-example-powerbuilder-pl-sql-tsql-stored-procedure/visual-expert-5.html)
    -   [PowerBuilder / Oracle Stored Procedures Dependencies with Visual Expert - Visual Expert](https://www.visual-expert.com/EN/visual-expert-resources/visual-expert-video/ve-pb-pl-dependencies.html)
    -   [Static Code Analysis Tool for Oracle and PL/SQL - Visual Expert](https://www.visual-expert.com/EN/stored-procedure-pl-sql-oracle-plsql/code-function-analysis-impact.html)
    -   [Static Code Analysis Tool for PowerBuilder - Visual Expert](https://www.visual-expert.com/EN/powerbuilder-code-pb/function-source-analysis-documentation-impact.html)
    -   [Visual Expert Pricing | PowerBuilder - Oracle - SQL Server - Visual Expert](https://www.visual-expert.com/EN/visual-expert-price-euro.html)
    -   [Visual Expert: Static Code Analyzer for Quality & Security - Visual Expert](https://www.visual-expert.com/)
    -   [ビジュアルエキスパート価格｜PowerBuilder - Oracle - SQL Server - Visual Expert](https://www.visual-expert.com/JA/visual-expert-price.html)
    -   [SQL ServerおよびTransact-SQLのための静的コード解析ツール - Visual Expert](https://www.visual-expert.com/JA/stored-procedure-t-sql-server-mssql-tsql/sqlserver-code-function-impact-analysis.html)
-   **記事**
    -   [Visual Expert Reviews: Pricing & Software Features 2025 | B2Saas](https://b2saas.com/visual-expert)
    -   [Visual Expert Pricing 2025 - G2](https://www.g2.com/products/visual-expert/pricing)
    -   [Visual Expert Reviews 2025: Details, Pricing, & Features - G2](https://www.g2.com/products/visual-expert/reviews)
    -   [Novalys Visual Expert Reviews, Ratings & Features 2025 | Gartner Peer Insights](https://www.gartner.com/reviews/market/application-development-life-cycle-management/vendor/novalys/product/visual-expert)
    -   [How to Conduct Impact Analysis for Code Changes? - YouTube](https://www.youtube.com/watch?v=PAdfJ9yPed8)
    -   [How Does Visual Expert Conduct Static Code Analysis? - YouTube](https://www.youtube.com/watch?v=3655EAvIv9A)
    -   [Impact Analysis for PowerBuilder - YouTube](https://www.youtube.com/watch?v=tgZQVqdW6MQ)
    -   [Visual Expert Offers - Shop Novalys](https://shop.novalys.net/EN/Visual-Expert/)

### ●OpenLineage

-   **公式ドキュメント**
    -   [Getting Started - OpenLineage](https://openlineage.io/getting-started/)
    -   [Getting Started with Apache Airflow® and OpenLineage+Marquez - OpenLineage](https://openlineage.io/docs/guides/airflow-quickstart/)
    -   [OpenLineage Integrations - OpenLineage](https://openlineage.io/docs/integrations/about/)
    -   [OpenLineage: Home - OpenLineage](https://openlineage.io/)
-   **GitHub**
    -   [OpenLineage/integration/sql/README.md at main](https://github.com/OpenLineage/OpenLineage/blob/main/integration/sql/README.md)
    -   [OpenLineage/OpenLineage: An Open Standard for lineage metadata collection](https://github.com/OpenLineage/OpenLineage)
-   **記事**
    -   [Exploring data lineage with OpenLineage | Hightouch](https://hightouch.com/blog/exploring-data-lineage-with-open-lineage)

### ●Marquez

-   **公式ドキュメント**
    -   [Integrate OpenLineage and Airflow with Marquez | Astronomer Documentation](https://www.astronomer.io/docs/learn/marquez/)
    -   [Marquez - CrateDB: Guide](https://cratedb.com/docs/guide/integrate/marquez/index.html)
    -   [Marquez Project | Marquez Project](https://marquezproject.ai/)
    -   [Record a single lineage event - Marquez Project](https://marquezproject.ai/docs/api/record-lineage/)
-   **記事**
    -   [Marquez by WeWork: Architecture, Features & Use Cases (2025) - Atlan](https://atlan.com/marquez-wework-open-source/)
    -   [Demo: Marquez + dbt - YouTube](https://www.youtube.com/watch?v=7caHXLDKacg)

### ●Apache Atlas

-   **公式ドキュメント**
    -   [Apache Atlas – Data Governance and Metadata framework for Hadoop](https://atlas.apache.org/)
    -   [Atlas Lineage - Cloudera Documentation](https://docs.cloudera.com/runtime/7.3.1/atlas-exploring-using-lineage/atlas-lineage.pdf)
-   **記事**
    -   [Metadata classification, lineage, and discovery using Apache Atlas on Amazon EMR - AWS](https://aws.amazon.com/blogs/big-data/metadata-classification-lineage-and-discovery-using-apache-atlas-on-amazon-emr/)
    -   [Data Governance with Apache Atlas: Introduction to Atlas (Part 1 of 3) - ClearPeaks](https://www.clearpeaks.com/data-governance-with-apache-atlas-introduction-to-atlas/)
    -   [Using Apache Atlas to view Data Lineage - Cloudera Community](https://community.cloudera.com/t5/Community-Articles/Using-Apache-Atlas-to-view-Data-Lineage/ta-p/246305)

### ●Alation

-   **公式ドキュメント**
    -   [Lineage for Stored Procedures (Beta) — Alation User Guide](https://www.alation.com/docs/en/latest/sources/Lineage/StoredProcedureLineage.html)

### ●SQL Server

-   **公式ドキュメント**
    -   [Dynamic SQL performance in ODBC - ODBC API Reference | Microsoft Learn](https://learn.microsoft.com/en-us/sql/odbc/reference/dynamic-sql?view=sql-server-ver17)
    -   [Using dynamic SQL - Azure Synapse Analytics - Learn Microsoft](https://learn.microsoft.com/en-us/azure/synapse-analytics/sql-data-warehouse/sql-data-warehouse-develop-dynamic-sql)
    -   [オブジェクトの依存関係 - Learn Microsoft](https://learn.microsoft.com/ja-jp/ssms/object/object-dependencies)
    -   [テーブルの依存関係を表示する - SQL Server | Microsoft Learn](https://learn.microsoft.com/ja-jp/sql/relational-databases/tables/view-the-dependencies-of-a-table?view=sql-server-ver17)
-   **記事**
    -   [Recursive CTE in SQL Server | GeeksforGeeks](https://www.geeksforgeeks.org/recursive-cte-in-sql-server/)
-   **QA**
    -   [How to extract lineage from on-prem sql server ? - Microsoft Q\&A](https://learn.microsoft.com/en-us/answers/questions/1279263/how-to-extract-lineage-from-on-prem-sql-server)
    -   [How to find all the dependencies of a table in sql server - Stack Overflow](https://stackoverflow.com/questions/22005698/how-to-find-all-the-dependencies-of-a-table-in-sql-server)
    -   [How to find out the dependencies of stored procedure using sql - Stack Overflow](https://stackoverflow.com/questions/52070058/how-to-find-out-the-dependencies-of-stored-procedure-using-sql)

### ●Oracle

-   **QA**
    -   [How to find object dependencies using the DBA\_DEPENDENCIES - Oracle Forums](https://forums.oracle.com/ords/apexds/post/how-to-find-object-dependencies-using-the-dba-dependencies-1493)
    -   [Oracle database dependencies in PL/SQL - Stack Overflow](https://stackoverflow.com/questions/28044294/oracle-database-dependencies-in-pl-sql)
    -   [Why Oracle does not include in DBA\_dependencies, the objects views created with any database links? - Stack Overflow](https://stackoverflow.com/questions/57440888/why-oracle-does-not-include-in-dba-dependencies-the-objects-views-created-with)

### ●PostgreSQL

-   **公式ドキュメント**
    -   [Documentation: 9.0: Dependency Tracking - PostgreSQL](https://www.postgresql.org/docs/current/ddl-depend.html)
-   **記事**
    -   [Tracking view dependencies in PostgreSQL - cybertec-postgresql.com](https://www.cybertec-postgresql.com/en/tracking-view-dependencies-in-postgresql/)
    -   [Pg depend display - PostgreSQL wiki](https://wiki.postgresql.org/wiki/Pg_depend_display)
-   **QA**
    -   [Is it possible to find dependency between PostgreSQL functions? - Stack Overflow](https://stackoverflow.com/questions/36287000/is-it-possible-to-find-dependency-between-postgresql-functions)
    -   [Where to find object dependencies in Postgresql ? (pg\_depend) - Stack Overflow](https://stackoverflow.com/questions/25003531/where-to-find-object-dependencies-in-postgresql-pg-depend)

### ●製品共通 / その他の製品

-   **GitHub**
    -   [aws-samples/database-dependency-analyzer](https://github.com/aws-samples/database-dependency-analyzer)
-   **記事**
    -   [What Is Data Lineage? Examples, Tools, and Use Cases - Ardoq](https://www.ardoq.com/knowledge-hub/data-lineage)
    -   [Data Lineage Tools: Critical Features, Use Cases & Innovations (2024) - Atlan](https://atlan.com/data-lineage-tools/)
    -   [Recursive SQL Expression Visually Explained - Built In](https://builtin.com/data-science/recursive-sql)
    -   [How To Choose The Right Data Lineage Tool? - CastorDoc Blog](https://www.castordoc.com/blog/how-to-choose-the-right-data-lineage-tool)
    -   [Legacy Data Migration: Tackling Challenges Head-On - Datafold](https://www.datafold.com/blog/legacy-data-migration)
    -   [How to Use a Recursive CTE in SQL - DbVisualizer](https://www.dbvis.com/thetable/how-to-use-a-recursive-cte-in-sql/)
    -   [Automated Data Lineage: Key Benefits & Tools Evaluation Guide for 2024 | Decube](https://www.decube.io/post/automated-data-lineage)
    -   [Data Lineage Best Practices | Decube](https://www.decube.io/post/data-lineage-best-practices)
    -   [10 Best Data Lineage Tools in 2024 - SQL Pretty Printer](https://www.dpriver.com/blog/2023/12/best-data-lineage-tools/)
    -   [DataHub Column Level Lineage Live Demo - YouTube](https://www.youtube.com/watch?v=Coi7SQ3Epkk)
    -   [Lineage | Ilum Documentation - Managed Spark Cluster](https://ilum.cloud/docs/features/lineage/)
    -   [Top 5 Open Source Data Lineage Tools (With User Reviews) - MonteCarlo](https://www.montecarlodata.com/blog-open-source-data-lineage-tools/)
    -   [The Ultimate Guide to Data Lineage Best Practices - Number Analytics](https://www.numberanalytics.com/blog/data-lineage-best-practices-production-engineering)
    -   [Ensuring Cloud Migration Success with Data Lineage | Octopai](https://www.octopai.com/wp-content/uploads/2023/12/eBook-Ensuring-Cloud-Migration-Success-with-Data-Lineage.pdf)
    -   [Column-Level Lineage 101: A Guide for Modern Data Management - Select Star](https://www.selectstar.com/resources/column-level-lineage-101-a-guide-for-modern-data-management)
    -   [The Curse and Blessings of Dynamic SQL - sommarskog.se](https://www.sommarskog.se/dynamic_sql.html)
    -   [Detect Bad SQL with Static & Dynamic Code Analysis - A Guide - Sonra](https://sonra.io/sql-code-analysis-guide/)
    -   [Learn to Use a Recursive CTE in SQL Query - StrataScratch](https://www.stratascratch.com/blog/learn-to-use-a-recursive-cte-in-sql-query/)
    -   [データリネージとは？ 意味、例、手法 ☝️ - Wallarm](https://www.wallarm.com/jp/what/what-is-data-lineage)
-   **QA**
    -   [Self hosted open source lineage tools that actually just... do it across databases and models? : r/dataengineering - Reddit](https://www.reddit.com/r/dataengineering/comments/1iplukv/self_hosted_open_source_lineage_tools_that/)
