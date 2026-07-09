---
title: "dbt MCPでBI数字不整合を追う意味層・検証層アーキテクチャ"
emoji: "🧭"
type: "tech"
topics: ["dbt", "MCP", "Databricks", "SemanticLayer", "BI"]
published: false
---

> 起点: dbt Labs ブログ「How MCP connects your AI agent to dbt and Databricks」(Databricks Data + AI Summit 2026 発表、Integral Ad Science 事例)。
> dbt MCP サーバがエージェントに dbt の意味層・リネージ・compiled SQL を渡し、Databricks を統制されたクエリ実行基盤、Looker などの BI をエントリポイントとして、三層で BI 数字不整合を解析する運用パターンを扱います。
> 検証日: 2026-07-09 / dbt-mcp PyPI 最新版: 1.21.2（本文中のバージョン確認時点）

## 対象読者

この記事は、dbt と Databricks を使い、BI ダッシュボードの数字不整合を AI エージェントに調査させたいデータエンジニア・Analytics Engineer 向けです。

読み終えると、次の判断材料を得られます。

- dbt MCP が AI エージェントへ渡す意味層・リネージ・compiled SQL の範囲
- Databricks SQL / Unity Catalog を検証層に置く理由
- 生データ直叩き型 text-to-SQL と比べたときの権限・監査・保守性の違い
- ローカル / リモート MCP サーバの最小設定と運用上の注意点

## 概要

### dbt MCP サーバとは

dbt MCP サーバは、AI アプリケーションと dbt が管理するデータ資産をつなぐ標準化されたフレームワークです。

- モデル定義・メトリクス・リネージ・データ鮮度への一貫したアクセスを、クライアントを問わず提供します。
- MCP (Model Context Protocol) は、エージェントがツールの内部 API を知らなくてもツールと対話できる共通プロトコルです。
- エージェント側のコードは、接続先ツール (dbt / Databricks / Looker) が入れ替わっても変更不要です。

### なぜ「AI にデータの意味を渡す」ために MCP を使うか

BI ダッシュボードの数字が食い違ったとき、原因究明には「どのモデルがどう定義され、どこから来た値か」という意味情報が要ります。この意味情報は、dbt のモデル定義・テスト・リネージグラフにすでに存在します。

課題は、この情報を AI エージェントへ安全かつ動的に渡す手段でした。MCP は、意味情報を API クライアントの自作なしにエージェントへ渡す標準経路になります。dbt Labs のブログ (Databricks Data + AI Summit 2026 発表) は、Integral Ad Science (IAS) の事例で次のように説明しています。

- 課題: あるモデルが人気飲料を food カテゴリに誤分類していました。IAS のエージェントは BI ダッシュボードの数字から source table まで遡り、原因を特定しました。
- 主張: 「upstream の列を変えると、エージェントは downstream で何が壊れるかを教えられます。各 downstream モデルのロジックを読むため、構造的な影響だけでなく意味的な影響も推論できます」。
- 主張: 「エージェントはグラフを一から再構築しません。ドキュメントが実態に追いつくことも期待しません。dbt のテスト済み・バージョン管理されたグラフと、compiled SQL そのものを読みます」。

MCP サーバはツール露出を絞り込むことで、権限範囲の限定・監査・生 API 資格情報の非開示を実現します。

### 三層構成: 意味層・検証層・エントリポイント

IAS の実装は、役割の異なる MCP サーバを組み合わせます。

```mermaid
flowchart LR
    User["利用者の問い<br/>この数字は<br/>なぜ違うのか"]
    subgraph Entry["エントリポイント層"]
        Looker["Looker MCP<br/>BI on-ramp<br/>SQL parsing"]
    end
    subgraph Semantic["意味層"]
        DbtMCP["dbt MCP<br/>semantic + lineage<br/>compiled SQL"]
    end
    subgraph Validation["検証層"]
        DbxMCP["Databricks SQL MCP<br/>read-only 実行<br/>Unity Catalog 統制"]
    end
    Warehouse["Databricks<br/>source table"]
    User --> Looker
    Looker --> DbtMCP
    DbtMCP --> DbxMCP
    DbxMCP --> Warehouse
```

| 層 | 担当ツール | 役割 |
|---|---|---|
| エントリポイント | Looker などの BI (MCP) | 利用者が最初に触れる BI。ダッシュボードの数字から調査を起点する |
| 意味層 | dbt MCP | テスト済み・バージョン管理されたモデル定義・リネージ・compiled SQL を提供する。「何が」「なぜ」を説明する |
| 検証層 | Databricks SQL (MCP) | read-only クエリ実行と Unity Catalog によるガバナンスを提供する。「実際にどの値が入っているか」を確認する |

dbt が意味とリネージを提供し、Databricks が検証済みの実行基盤を提供します。エージェントは両方を往復し、ダッシュボードのタイル 1 つから source table まで数字を追跡し、その過程で見つけた値を信頼できます。

新しい接続先を追加する場合も、カスタム API クライアントを書く代わりに新しい MCP サーバを指すだけで済みます。dbt Labs のブログは、これによって接続追加が「days not weeks」、問題解決が「hours to minutes」に短縮されたと述べています。

## 特徴

- **テスト済み・バージョン管理された lineage グラフを読む**: エージェントはドキュメントの陳腐化を前提とせず、dbt が保守する実際のデータフローグラフを参照します。
- **compiled SQL を直接読む**: リネージが「どこを見るか」を示し、compiled SQL が「そこで何が起きているか」を示します。両方が揃って初めて、構造的な影響と意味的な影響の両方を推論できます。
- **read-only 検証と生データ丸投げの違い**: 検証層はガバナンスされた read-only 実行に閉じます。エージェントに生の DB 資格情報や無制限のクエリ権限を渡しません。
- **truth layer を権限分離して引かせる**: dbt MCP サーバは公開ツール数を絞り込み、ツール露出そのものを権限境界として扱います。エージェントの行動範囲を、意味層を経由する読み取りに限定します。
- **Unity Catalog 権限をそのまま継承する**: Databricks 管理の MCP サーバは Unity Catalog の権限設定を尊重します。エージェントは利用者本人がアクセスできるテーブルのみ参照でき、マスク済み列はマスクされたままです。
- **接続追加がプラガブル**: 新しいデータソースや BI ツールを増やすとき、カスタムクライアントの実装ではなく MCP サーバの追加で対応できます。エージェント側のコードは変更不要です。
- **共有コンテキスト基盤による context drift の抑制**: すべてのエージェントが同じ意味層に MCP 経由で問い合わせるため、エージェントごとに定義がずれる「コンテキストのずれ」を、事後検知ではなく構造として防げます。

### 情報源の渡し方の比較

BI 数字の不整合を調べる AI エージェントに、どう情報源を渡すかで 3 つのアプローチがあります。

| 観点 | 生データ丸投げ (text-to-SQL 直叩き) | 意味層 + 検証層を分離 (dbt MCP) | RAG でドキュメントを渡す |
|---|---|---|---|
| 精度 | 低い。生スキーマ直叩きは精度が伸びにくい | 高い。意味層でグラウンディングすると対応クエリの精度が上がる | 中程度。文書の鮮度と網羅性に依存し、決定論的でない |
| ガバナンス | 弱い。エージェントが生の DB 資格情報とスキーマ全体に触れる | 強い。ツール露出の絞り込み + read-only 実行 + Unity Catalog 権限継承の多層防御 | 弱い。検索対象文書へのアクセス制御はあるが、クエリ実行時の統制は別途必要 |
| 保守性 | 低い。スキーマ変更のたびにプロンプトやスキーマ説明を手動更新 | 高い。dbt のモデル定義・テストが単一の正本になり、更新は dbt 側の変更に追従 | 低い。ドキュメントの陳腐化を検知・更新する仕組みが別途必要 |
| 権限制御 | 実質なし。SQL 生成後の実行を止める仕組みがないと危険 | ツール単位・カタログ単位で分離可能 (意味層は読み取り専用、検証層も read-only) | 文書単位のアクセス制御に留まり、実データへの権限とは別管理になりやすい |
| 意味の伝達 | スキーマ名・型情報のみ。ビジネスロジックは伝わらない | メトリクス定義・エンティティ・compiled SQL・リネージまで伝わる | 自然文の説明は伝わるが、実行可能な定義としては保証されない |


筆者の見立てでは、BI 障害解析では「RAG で説明文を渡す」よりも「dbt のテスト済みグラフと compiled SQL を読ませる」方が再現性を出しやすいです。説明文は補助情報に留め、原因特定の正本を dbt の成果物へ寄せる構成を推奨します。

## 構造

dbt MCP を介した意味層と検証層をつなぐ BI 障害解析アーキテクチャを、C4 model の 3 段階で図解します。

### システムコンテキスト図

調査対象システムを中心に、周囲のアクターと外部システムとの関係を示します。アクターは役割名で表現しています。

```mermaid
graph TB
    Analyst["アナリスト"]
    Engineer["データエンジニア"]
    Agent["AIエージェント"]
    System["dbt MCPが仲介する<br/>意味層 検証層 BI三層"]
    DbtPlatform["dbt Platform<br/>意味層とリネージ層"]
    Databricks["Databricks<br/>統制されたクエリ実行層"]
    BITool["BIツール<br/>エントリ層"]
    Analyst -->|"数字の不整合に気づく"| BITool
    Analyst -->|"調査を依頼する"| Engineer
    Engineer -->|"調査を指示する"| Agent
    Agent -->|"調査を実行する"| System
    System -->|"意味層とリネージを参照する"| DbtPlatform
    System -->|"統制されたクエリを実行する"| Databricks
    System -->|"数字の根拠を確認する"| BITool
```

#### 要素一覧

| 要素名 | 説明 |
|---|---|
| アナリスト | BI ツール上で数字を見ており、不整合や違和感に最初に気づく人 |
| データエンジニア | アナリストからの報告を受け、根本原因の特定と修正を AI エージェントに指示する人 |
| AIエージェント | dbt MCP を介した調査対象システムを操作し、意味層・検証層・BI を横断して不整合の原因を調査する主体 |
| dbt MCPが仲介する意味層検証層BI三層 | 調査対象。dbt MCP をハブとして、意味層・検証層・エントリ層を横断的に調査可能にするアーキテクチャ全体 |
| dbt Platform | 意味層 (メトリクス定義) とリネージ層 (モデル間の依存関係) を保持する外部 SaaS |
| Databricks | 統制された権限のもとで検証用 SQL を実行する外部クエリ実行基盤 |
| BIツール | アナリストが日常的に数字を確認するエントリポイントとなる外部ダッシュボード製品 |

### コンテナ図

調査対象システムをドリルダウンし、AI エージェントと dbt MCP サーバが、どの外部システムのどのコンテナと接続するかを示します。

```mermaid
graph TB
    AIAgent["AIエージェント<br/>MCPクライアント"]
    subgraph AgentSide["調査対象システム エージェント側"]
        MCPServer["dbt MCPサーバ"]
    end
    subgraph DbtPlatformBox["dbt Platform"]
        SemanticLayer["dbt Semantic Layer<br/>意味層"]
        Discovery["dbt Discovery<br/>メタデータ リネージ"]
    end
    subgraph DatabricksBox["Databricks"]
        SQLWarehouse["SQL warehouse<br/>統制クエリ実行"]
    end
    subgraph BIBox["BIツール"]
        BI["BI<br/>エントリ層"]
    end
    BI -->|"数字の不整合を提示する"| AIAgent
    AIAgent -->|"ツールを呼び出す"| MCPServer
    MCPServer -->|"結果を返す"| AIAgent
    MCPServer -->|"メトリクス定義を問い合わせる"| SemanticLayer
    MCPServer -->|"lineageを取得する"| Discovery
    MCPServer -->|"検証SQLを実行する"| SQLWarehouse
```

#### 調査対象システム エージェント側

| 要素名 | 説明 |
|---|---|
| AIエージェント | MCP クライアントを内蔵し、BI で発見した不整合を起点に調査を進める主体。システムコンテキスト図の AIエージェントと同一 |
| dbt MCPサーバ | AI エージェントからのツール呼び出しを受け、意味層・検証層・BI の各外部システムへの問い合わせに変換する調査対象の中核コンテナ |

#### dbt Platform

| 要素名 | 説明 |
|---|---|
| dbt Semantic Layer | メトリクス・ディメンション・エンティティの定義を保持し、テスト済みの意味層クエリを提供するコンテナ |
| dbt Discovery | モデルのメタデータと lineage (親子関係) を保持し、compiled SQL やモデル間依存を返すコンテナ |

#### Databricks

| 要素名 | 説明 |
|---|---|
| SQL warehouse | dbt MCP サーバから発行された検証用 SQL を、統制された権限のもとで実行するコンテナ |

#### BIツール

| 要素名 | 説明 |
|---|---|
| BI エントリ層 | アナリストと AI エージェントの双方が最初に数字を確認する、調査の起点となるダッシュボードコンテナ |

### コンポーネント図

dbt MCP サーバ内部を構成するツール群コンポーネントの関係を示します。Transport 層がどの通信方式で呼び出しを受けるか、Config がどのツール群の有効・無効を切り替えるかを併せて表現します。

```mermaid
graph TB
    AIAgent["AIエージェント<br/>MCPクライアント"]
    subgraph MCPServerBox["dbt MCPサーバ"]
        Transport["Transport層<br/>stdio streamable HTTP"]
        Config["設定<br/>DbtMcpSettings"]
        SemanticTools["Semantic Layer<br/>tools"]
        DiscoveryTools["Discovery<br/>tools"]
        SQLTools["SQL tools"]
        CLITools["dbt CLI tools"]
        AdminTools["Admin API<br/>tools"]
    end
    AIAgent -->|"ツール呼び出し"| Transport
    Transport --> SemanticTools
    Transport --> DiscoveryTools
    Transport --> SQLTools
    Transport --> CLITools
    Transport --> AdminTools
    Config --> SemanticTools
    Config --> DiscoveryTools
    Config --> SQLTools
    Config --> CLITools
    Config --> AdminTools
```

#### dbt MCPサーバ

| 要素名 | 説明 |
|---|---|
| Transport層 | AI エージェントからのツール呼び出しを受信する通信面。ローカル実行 (`uvx dbt-mcp`) では stdio、dbt Platform 上のリモート実行では streamable HTTP を使う |
| 設定 | Pydantic ベースの DbtMcpSettings。環境変数 (`DBT_TOKEN`、`DBT_HOST`、`DISABLE_SEMANTIC_LAYER` 等) を読み込み、各ツール群の有効・無効と接続先を制御する |
| Semantic Layer tools | メトリクス定義の探索とクエリ実行を担うツール群。内訳は次項参照 |
| Discovery tools | モデルのメタデータと lineage を返すツール群。内訳は次項参照 |
| SQL tools | dbt Platform インフラ上で SQL を実行・生成するツール群。内訳は次項参照 |
| dbt CLI tools | build / run / test / compile など、ローカル dbt プロジェクトに対する dbt コマンド相当の操作を提供するツール群 |
| Admin API tools | trigger_job_run / list_jobs など、dbt Platform 上のジョブ実行を管理するツール群 |
| AIエージェント | コンテナ図と同一の外部要素。Transport 層を経由してツールを呼び出す |

Semantic Layer tools・Discovery tools・SQL tools の 3 コンポーネントは、調査の各ステップで直接使い分けるため、内部のツール構成をさらにドリルダウンします。

#### Semantic Layer tools のツール一覧

```mermaid
graph TB
    ListMetrics["list_metrics"]
    ListSavedQueries["list_saved_queries"]
    GetDimensions["get_dimensions"]
    GetEntities["get_entities"]
    QueryMetrics["query_metrics"]
    GetCompiledSQL["get_metrics_compiled_sql"]
    GetDimensionValues["get_dimension_values"]
```

##### 要素一覧

| 要素名 | 説明 |
|---|---|
| list_metrics | 定義済みメトリクスの一覧を返す |
| list_saved_queries | 保存済みクエリの一覧を返す |
| get_dimensions | 指定メトリクスに紐づくディメンションを返す |
| get_entities | 指定メトリクスに紐づくエンティティを返す |
| query_metrics | メトリクスを group_by・limit 等の条件で実行し値を返す |
| get_metrics_compiled_sql | メトリクスのクエリを実行せずコンパイル済み SQL のみ返す |
| get_dimension_values | 指定ディメンションの個別値 (distinct 値) を返す |

#### Discovery tools のツール一覧 (BI 障害解析で使う主要ツールの抜粋)

Discovery 系統は現行実装で 19 前後のツールを持ちます。ここでは BI 障害解析ワークフローで直接使う主要ツールを抜粋します。

```mermaid
graph TB
    GetAllModels["get_all_models"]
    GetModelDetails["get_model_details"]
    GetModelParents["get_model_parents"]
    GetModelChildren["get_model_children"]
    GetLineage["get_lineage<br/>depth指定可"]
    GetExposures["get_exposures<br/>BIダッシュボード"]
    GetModelHealth["get_model_health"]
```

##### 要素一覧

| 要素名 | 説明 |
|---|---|
| get_all_models | プロジェクト内のモデル一覧とメタデータを取得する |
| get_model_details | 指定モデルの compiled SQL・列・スキーマ・マテリアライズ種別を返す |
| get_model_parents | 指定モデルの上流 (親) モデルを取得し、lineage 遡上の起点となる |
| get_model_children | 指定モデルの下流 (子) モデルを取得し、変更の影響範囲を確認する |
| get_lineage | 深さ (depth) と方向 (ancestors/descendants) を指定して系統図をまとめて取得する |
| get_exposures | dbt の exposure (BI ダッシュボード等の下流利用点) を取得する。エントリ層の数字と dbt グラフを結ぶ |
| get_model_health | モデルの直近実行状況・テスト結果を返す。異常データの一次切り分けに使う |

> 上記以外にも `get_all_sources` / `get_source_details` / `get_exposure_details` / `get_related_models` / `get_mart_models` / `search` などがあります。網羅一覧は [公式 Available tools](https://docs.getdbt.com/docs/dbt-ai/mcp-available-tools) を参照してください。
>
> 補足: これらは MCP ツール呼び出し名です。Python クライアント (`ModelsFetcher`) のメソッド名とは一致しません (例: MCP ツール `get_all_models` は `ModelsFetcher.fetch_models`、`get_model_parents` は `fetch_model_parents` に対応)。呼び出し文脈が MCP ツールか Python クラスかで名称を使い分けます。

#### SQL tools のツール一覧

```mermaid
graph TB
    ExecuteSQL["execute_sql"]
    TextToSQL["text_to_sql"]
```

##### 要素一覧

| 要素名 | 説明 |
|---|---|
| execute_sql | Semantic Layer に対応した dbt Platform インフラ上で SQL を実行する。開発環境接続を経由し Databricks 上で実行する |
| text_to_sql | プロジェクトのメタデータ文脈を踏まえ、自然言語から SQL を生成する (実行はしない) |

## データ

### 概念モデル

dbt MCP が扱うエンティティは 4 つの層に分かれます。MCP Server は複数の MCP Tool を所有します。dbt Semantic Layer は Metric・Dimension・Entity・SavedQuery を所有します。dbt Project Graph は Model・Lineage を所有します。Databricks は Warehouse・Table を所有します。SemanticLayerConfig・CompiledSQL・QueryResult は特定の層に属さない横断エンティティです。

```mermaid
flowchart TD
    subgraph MCPServerBox["MCP Server"]
        MCPTool["MCP Tool"]
    end
    subgraph SemanticLayerBox["dbt Semantic Layer"]
        Metric["Metric"]
        Dimension["Dimension"]
        Entity["Entity"]
        SavedQuery["SavedQuery"]
    end
    subgraph ProjectGraphBox["dbt Project Graph"]
        Model["Model"]
        Lineage["Lineage"]
    end
    subgraph DatabricksBox["Databricks"]
        DatabricksWarehouse["Databricks Warehouse"]
        DatabricksTable["Databricks Table"]
    end
    SemanticLayerConfig["SemanticLayerConfig"]
    CompiledSQL["CompiledSQL"]
    QueryResult["QueryResult"]

    MCPTool -->|"設定参照"| SemanticLayerConfig
    MCPTool -->|"照会"| Metric
    MCPTool -->|"照会"| Dimension
    MCPTool -->|"照会"| Entity
    MCPTool -->|"照会"| SavedQuery
    MCPTool -->|"照会"| Model
    MCPTool -->|"照会"| Lineage
    MCPTool -->|"生成"| CompiledSQL
    MCPTool -->|"生成"| QueryResult
    Metric -->|"保持"| Dimension
    Metric -->|"保持"| Entity
    SavedQuery -->|"参照"| Metric
    Metric -->|"裏付け"| Model
    Model -->|"派生"| Lineage
    Lineage -->|"親を指す"| Model
    Model -->|"実体化"| DatabricksTable
    CompiledSQL -->|"投入"| DatabricksWarehouse
    DatabricksWarehouse -->|"読取"| DatabricksTable
    DatabricksWarehouse -->|"返却"| QueryResult
```

#### MCP Server

| 要素名 | 説明 |
|---|---|
| MCP Server | dbt MCP のプロセス本体です。設定に基づき有効なツールセットを決定します |
| MCP Tool | list_metrics・query_metrics・get_model_parents 等、個々の呼び出し可能な機能です |

#### dbt Semantic Layer

| 要素名 | 説明 |
|---|---|
| Metric | ビジネス指標の定義です。関連する Dimension・Entity の一覧を持ちます |
| Dimension | Metric を切り口で分割する属性です。カテゴリ型・時系列型に分かれます |
| Entity | Metric 同士を結合するためのキー概念です |
| SavedQuery | よく使う Metric と group_by の組み合わせを保存したクエリ定義です |

#### dbt Project Graph

| 要素名 | 説明 |
|---|---|
| Model | dbt プロジェクト内の 1 つの変換ノードです。マテリアライズ設定と compiledCode を持ちます |
| Lineage | プロジェクトグラフ上の 1 ノードです。親ノードの unique_id 一覧を保持します |

#### Databricks

| 要素名 | 説明 |
|---|---|
| Databricks Warehouse | SQL クエリを実行する計算リソースです |
| Databricks Table | クエリ対象の実データを格納するオブジェクトです |

#### 横断エンティティ

| 要素名 | 説明 |
|---|---|
| SemanticLayerConfig | dbt Semantic Layer への接続に必要な設定値の集合です |
| CompiledSQL | Metric クエリをコンパイルした SQL 文です。実行はしません |
| QueryResult | Metric クエリを実行した結果です |

### 情報モデル

```mermaid
classDiagram
    class MCPServer {
        string name
        string transport
        list enabledToolsets
        list disabledToolsets
    }
    class MCPTool {
        string name
        string title
        string description
        string toolset
        bool readOnlyHint
        bool destructiveHint
        bool idempotentHint
    }
    class SemanticLayerConfig {
        string dbtHost
        string dbtToken
        int dbtProdEnvId
        int dbtDevEnvId
        bool disableSemanticLayer
        bool disableDiscovery
        bool disableAdminApi
        bool enableSemanticLayer
        int metricsRelatedMax
        int maxResponseChars
    }
    class Metric {
        string name
        string type
        string label
        string description
        list dimensions
        list entities
        map metadata
    }
    class Dimension {
        string name
        string type
        string label
        string description
        list granularities
        map metadata
    }
    class Entity {
        string name
        string type
        string description
    }
    class SavedQuery {
        string name
        string label
        string description
        list metrics
        list groupBy
        string where
    }
    class Model {
        string name
        string uniqueId
        string description
        string resourceType
        string database
        string schema
        string alias
        string compiledCode
        map config
    }
    class Lineage {
        string name
        string uniqueId
        string resourceType
        list parentIds
    }
    class CompiledSQL {
        list metrics
        list groupBy
        list orderBy
        string where
        int limit
        string sql
        string error
    }
    class QueryResult {
        list metrics
        list groupBy
        list orderBy
        string where
        int limit
        string result
        string error
    }
    class DatabricksWarehouse {
        string id
        string name
        string clusterSize
        string warehouseType
        string state
        string jdbcUrl
    }
    class DatabricksTable {
        string catalogName
        string schemaName
        string name
        string fullName
        string tableType
        string dataSourceFormat
        list columns
    }

    MCPServer "1" *-- "many" MCPTool : hosts
    MCPTool "many" --> "many" SemanticLayerConfig : uses
    MCPTool "many" --> "many" Metric : queries
    MCPTool "many" --> "many" Dimension : queries
    MCPTool "many" --> "many" Entity : queries
    MCPTool "many" --> "many" SavedQuery : queries
    MCPTool "many" --> "many" Model : queries
    MCPTool "many" --> "many" Lineage : queries
    MCPTool "many" --> "many" CompiledSQL : produces
    MCPTool "many" --> "many" QueryResult : produces
    Metric "1" --> "many" Dimension : has
    Metric "1" --> "many" Entity : has
    SavedQuery "many" --> "many" Metric : references
    Metric "many" --> "1" Model : basedOn
    Model "1" --> "many" Lineage : represents
    Lineage "many" --> "many" Model : parentOf
    Model "many" --> "1" DatabricksTable : materializesAs
    CompiledSQL "many" --> "1" DatabricksWarehouse : submittedTo
    DatabricksWarehouse "1" --> "many" DatabricksTable : queries
    DatabricksWarehouse "1" --> "many" QueryResult : yields
```

| 要素名 | 説明 |
|---|---|
| MCPServer | ツールセットの有効・無効を判定するサーバ本体です |
| MCPTool | 1 回の呼び出し単位です。読み取り専用かどうかのヒントを持ちます |
| SemanticLayerConfig | DbtMcpSettings の主要な環境変数を集約した接続設定です |
| Metric | list_metrics / query_metrics が返す指標定義です |
| Dimension | get_dimensions が返す DimensionToolResponse です |
| Entity | get_entities が返す EntityToolResponse です |
| SavedQuery | list_saved_queries が返す保存済みクエリ定義です |
| Model | get_all_models / get_model_details が返すモデル詳細です |
| Lineage | get_lineage が返すグラフノードです。parentIds で親を辿ります |
| CompiledSQL | get_metrics_compiled_sql の入出力です。metrics / group_by / limit を入力に取ります |
| QueryResult | query_metrics の入出力です。metrics / group_by / limit を入力に取ります |
| DatabricksWarehouse | クエリを実行する SQL ウェアハウスです |
| DatabricksTable | Unity Catalog 上のテーブルです |

## 構築方法

dbt MCP サーバ (`dbt-mcp`, PyPI: <https://pypi.org/project/dbt-mcp/>) は、意味層 (dbt Semantic Layer) と検証層 (Databricks SQL) を 1 つの MCP サーバ経由で AI エージェントに公開します。実行方式は 2 通りです。

- **ローカル MCP サーバ**: 手元のマシンで `uvx dbt-mcp` を起動し、stdio で MCP クライアントと接続します。dbt Core / dbt Fusion / dbt CLI ツールを使う場合はこちらが必須です。
- **リモート MCP サーバ**: dbt Platform がホストする HTTP エンドポイントに接続します。ローカルインストールが不要で、streamable HTTP transport を使います。


### 最小構成で試す quick start

まずローカルの stdio 方式で、Semantic Layer と Discovery だけを開ける構成から始めると安全です。SQL 実行は後から明示的に有効化します。

```bash
uvx dbt-mcp
```

MCP クライアントには、次の最小設定を渡します。トークンは実運用では `.env` やシークレットストアに分離します。

```json
{
  "mcpServers": {
    "dbt": {
      "command": "uvx",
      "args": ["dbt-mcp"],
      "env": {
        "DBT_HOST": "abc123.us1.dbt.com",
        "DBT_TOKEN": "dbtc_your_token",
        "DBT_PROD_ENV_ID": "12345",
        "DISABLE_SQL": "true",
        "DISABLE_ADMIN_API": "true",
        "DISABLE_DBT_CLI": "true"
      }
    }
  }
}
```

この状態で `list_metrics`、`get_all_models`、`get_model_parents` が使えることを確認します。BI 障害解析で実データ検証が必要になった段階で、開発環境 ID と個人 PAT を分けて `execute_sql` を有効化します。

### 前提条件

| 項目 | 内容 |
|---|---|
| dbt Platform account | Semantic Layer / Discovery API / SQL ツールを使うには dbt Platform (旧 dbt Cloud) アカウントが必要です |
| Semantic Layer 有効化 | dbt Platform 管理者が Semantic Layer を有効化していることが前提です。プラン種別によって Discovery API / Semantic Layer API へのアクセスが制限されます |
| Databricks 接続 | dbt プロジェクトの Production / Development 環境が Databricks SQL ウェアハウスに接続済みであることが前提です。`execute_sql` はこの環境接続を経由して Databricks 上でクエリを実行します |
| uv (uvx) | ローカル MCP サーバの起動に `uv` (`uvx` コマンド) が必要です。`which uvx` でパスを確認します |
| Python | `dbt-mcp` は Python `>=3.12, <3.14` を要求します |
| トークン | Personal Access Token (PAT) または Service Token。`execute_sql` は PAT 限定です (Service Token 不可) |

### インストール

`uvx` はローカルにパッケージをインストールせずその場で実行するため、リポジトリの clone は不要です。

```bash
# 最新版をその場で起動 (推奨)
uvx dbt-mcp

# バージョンを固定して起動
uvx dbt-mcp==1.21.2
```

pip でインストールする場合です。

```bash
pip install dbt-mcp
```

コントリビュート目的でソースから動かす場合です。

```bash
git clone https://github.com/dbt-labs/dbt-mcp.git
cd dbt-mcp
uv sync
uv run dbt-mcp
```

### MCP クライアント設定

#### stdio (ローカル MCP サーバ)

Claude Desktop や Cursor (`~/.cursor/mcp_config.json`)、VS Code (`mcp.json`) はいずれも同じ形式です。

```json
{
  "mcpServers": {
    "dbt": {
      "command": "uvx",
      "args": ["dbt-mcp"],
      "env": {
        "DBT_HOST": "abc123.us1.dbt.com",
        "DBT_TOKEN": "dbtc_your_token",
        "DBT_PROD_ENV_ID": "12345",
        "DBT_DEV_ENV_ID": "23456",
        "DBT_USER_ID": "34567",
        "DBT_PROJECT_DIR": "/path/to/project",
        "DBT_PATH": "/opt/homebrew/bin/dbt"
      }
    }
  }
}
```

トークンなど秘匿情報を JSON に直書きしたくない場合は `.env` ファイルを分離し `--env-file` で渡します。

```json
{
  "mcpServers": {
    "dbt": {
      "command": "uvx",
      "args": ["--env-file", "/absolute/path/to/your-dbt-project/.env", "dbt-mcp"]
    }
  }
}
```

`uvx` がパス解決できない場合 (`Error: spawn uvx ENOENT`) は、`command` に `uvx` のフルパスを指定します。

#### streamable HTTP (リモート MCP サーバ)

dbt Platform がホストする MCP エンドポイントに直接接続します。ローカルインストールが不要な分、`DBT_DEV_ENV_ID` / `DBT_USER_ID` は環境変数ではなく HTTP ヘッダーで渡します。

```json
{
  "mcpServers": {
    "dbt": {
      "type": "http",
      "url": "https://YOUR_DBT_HOST_URL/api/ai/v1/mcp/",
      "headers": {
        "Authorization": "Token YOUR_DBT_ACCESS_TOKEN",
        "x-dbt-prod-environment-id": "DBT_PROD_ENV_ID",
        "x-dbt-user-id": "DBT_USER_ID",
        "x-dbt-dev-environment-id": "DBT_DEV_ENV_ID"
      }
    }
  }
}
```

`x-dbt-prod-environment-id` などのヘッダー値は環境の URL 全体ではなく、数値 ID のみを渡します。

```
✅ 正しい: "x-dbt-prod-environment-id": "54321"
❌ 誤り  : "x-dbt-prod-environment-id": "https://cloud.getdbt.com/deploy/12345/projects/67890/environments/54321"
```

OpenAI Agents SDK から streamable HTTP に接続する場合の Python 例です (`examples/openai_agent/main_streamable.py` 抜粋)。

```python
from agents.mcp.server import MCPServerStreamableHttp

async with MCPServerStreamableHttp(
    name="dbt",
    params={
        "url": f"https://{host}/api/ai/v1/mcp/",
        "headers": {
            "Authorization": f"token {token}",
            "x-dbt-prod-environment-id": prod_environment_id,
        },
    },
) as server:
    ...
```

ローカル MCP サーバ自体を HTTP で待ち受けさせたい場合 (デバッグ用途) は、環境変数 `MCP_TRANSPORT=streamable-http` を指定します (既定値は `stdio`)。

### 環境変数設定

主要な環境変数は次のとおりです。

| Variable | Type | Default | Description |
|---|---|---|---|
| `DBT_HOST` | str | None | dbt Platform hostname (例 `us1.dbt.com`、既定は `cloud.getdbt.com`) |
| `DBT_TOKEN` | str | None | dbt API token (PAT または Service Token)。`execute_sql` は PAT 必須 |
| `DBT_PROD_ENV_ID` | int | None | 本番環境 ID (single-project mode) |
| `DBT_DEV_ENV_ID` | int | None | 開発環境 ID (`execute_sql` に必須) |
| `DBT_USER_ID` | int | None | User ID (`execute_sql` に必須) |
| `DBT_ACCOUNT_ID` | int | None | Account ID (Admin API、PAT 認証時に必須) |
| `DBT_PROJECT_IDS` | list[int] | None | multi-project mode (comma-separated) |
| `DBT_PROJECT_DIR` | str | None | ローカル dbt プロジェクトパス (dbt CLI/codegen 必須) |
| `DBT_PATH` | str | `dbt` | dbt 実行ファイルパス |
| `DBT_CLI_TIMEOUT` | int | 60 | dbt CLI タイムアウト秒 |
| `MCP_TRANSPORT` | str | `stdio` | transport 種別。ローカルデバッグ限定で `streamable-http` に変更可能 |
| `DBT_MCP_SL_METRICS_RELATED_MAX` | int | 10 | 意味層が関連メトリクスを取得する最大件数 |
| `DBT_MCP_SL_MAX_RESPONSE_CHARS` | int | 16000 | semantic layer 応答の最大文字数 |
| `DISABLE_SEMANTIC_LAYER` | bool | False | 意味層ツールを無効化 |
| `DISABLE_DISCOVERY` | bool | False | discovery ツールを無効化 |
| `DISABLE_SQL` | bool | **True** | SQL ツール (`execute_sql` / `text_to_sql`) を無効化。**既定で無効** |
| `DISABLE_DBT_CLI` | bool | False | dbt CLI ツールを無効化 |
| `DISABLE_DBT_CODEGEN` | bool | True | codegen ツールを無効化 (既定で無効) |
| `DISABLE_ADMIN_API` | bool | False | Admin API ツールを無効化 |
| `DO_NOT_TRACK` | str | None | `true` で利用トラッキング無効化 |

環境変数は次の 3 通りで渡せます。用途に応じて選びます。

```bash
# 方式 1: .env ファイル + --env-file (推奨、秘匿情報を JSON から分離できる)
uvx --env-file /absolute/path/to/.env dbt-mcp

# 方式 2: シェル環境変数
export DBT_HOST=cloud.getdbt.com
export DBT_TOKEN=your-token-here
uvx dbt-mcp

# 方式 3: MCP クライアント設定 JSON の env フィールド (上記「MCP クライアント設定」を参照)
```

`DBT_HOST` / `DBT_PROD_ENV_ID` などは値のみを渡します。URL 全体を渡すと接続エラーになります。

```
✅ 正しい: DBT_HOST=cloud.getdbt.com
❌ 誤り  : DBT_PROD_ENV_ID=https://cloud.getdbt.com/deploy/12345/...
```

### tool group の有効/無効

ツール群 (toolset) は `semantic_layer` / `discovery` / `sql` / `admin_api` / `dbt_cli` / `dbt_codegen` の主要 6 系統に加え、`dbt_lsp` (Fusion) / `product_docs` / `mcp_server_metadata` を含む単位で有効・無効を切り替えます。設計方針は **denylist (原則: 既定で全許可)** と **allowlist (既定で全拒否)** の 2 モードです。

> **重要な例外**: SQL 系統 (`execute_sql` / `text_to_sql`) だけは `DISABLE_SQL` の既定が `true` で、**denylist モードでも初期状態では無効**です。本ドキュメントの検証ステップ (`execute_sql`) を使うには、`DISABLE_SQL=false` (denylist) または `DBT_MCP_ENABLE_SQL=true` (allowlist) を明示的に設定します。`dbt_codegen` / `mcp_server_metadata` も同様に既定で無効です。

BI 障害解析用途では、書き込み系ツールを持ち込ませないために `dbt_cli` / `dbt_codegen` / `admin_api` を明示的に無効化する運用が安全です。

denylist モード (デフォルト。個別ツールを無効化) です。

```env
DISABLE_DBT_CLI=true          # dbt CLI (build/run など書き込み系) を無効化
DISABLE_DBT_CODEGEN=true      # 既定で無効
DISABLE_SEMANTIC_LAYER=false  # 意味層ツールは有効のまま
DISABLE_DISCOVERY=false       # discovery (lineage) ツールは有効のまま
DISABLE_SQL=false             # SQL は既定で無効。execute_sql を使うので明示的に有効化する
DISABLE_ADMIN_API=true        # job 起動などの Admin API を無効化
DISABLE_TOOLS="build,run,test"    # 個別ツール名を comma-separated で無効化
```

allowlist モード (必要なツールだけを明示的に許可) です。BI 障害解析ワークフローに限定するなら、次の toolset だけを有効化すれば十分です。

```env
DBT_MCP_ENABLE_SEMANTIC_LAYER=true
DBT_MCP_ENABLE_DISCOVERY=true
DBT_MCP_ENABLE_SQL=true   # execute_sql を使うため SQL 系統を有効化 (既定は無効)
DBT_MCP_ENABLE_TOOLS="list_metrics,get_dimensions,query_metrics,get_metrics_compiled_sql,get_lineage,get_model_parents,execute_sql"
```

リモート MCP サーバ (HTTP) では、同じ制御を環境変数の代わりに HTTP ヘッダーで行います。

```
x-dbt-disable-tools: get_all_models,text_to_sql,get_entities
x-dbt-disable-toolsets: dbt_cli,admin_api
```

### バージョン確認

```bash
# PyPI 公開バージョンを確認
pip index versions dbt-mcp

# uv でインストール済みバージョンを確認
uv tool list

# インストール済みパッケージのメタ情報
pip show dbt-mcp
```

2026-07-09 時点の PyPI 最新版は `1.21.2` です (`requires-python: >=3.12,<3.14`)。

## 利用方法

### 主要ツールと必須パラメータ

| ツール | 権限特性 | 主な入力 |
|---|---|---|
| `list_metrics` | read-only | `search` (省略可、名前の部分一致) |
| `get_dimensions` | read-only | `metrics` (必須、メトリクス名の配列) |
| `get_entities` | read-only | `metrics` (必須) |
| `get_dimension_values` | read-only | `dimension` (必須)、`metrics` (省略可)、`limit` (既定 100) |
| `query_metrics` | read-only (ウェアハウスに SELECT 相当を実行) | `metrics` (必須)、`group_by` / `order_by` / `where` / `limit` (省略可) |
| `get_metrics_compiled_sql` | read-only (実行せず compiled SQL のみ返す) | `metrics` (必須)、`group_by` / `order_by` / `where` / `limit` (省略可) |
| `get_all_models` | read-only | フィルタ条件 (省略可) |
| `get_lineage` | read-only | `model_name` 等 + `types` (ancestors/descendants) + `depth` |
| `get_model_parents` | read-only | `model_name` (必須) |
| `get_model_children` | read-only | `model_name` (必須) |
| `get_model_details` | read-only | `model_name` (必須)。compiled SQL・列・スキーマを返す |
| `execute_sql` | 実行系 (Databricks 上で SQL を実行。PAT 必須) | `sql` (必須)。`DBT_DEV_ENV_ID` の接続先ウェアハウスに対して実行 |
| `text_to_sql` | 実行系 (SQL 生成のみ、実行はしない) | 自然言語の質問 |

`query_metrics` はウェアハウスに問い合わせを発行しますが、ツール定義上は `read_only_hint=True` / `destructive_hint=False` です。データを書き換えないという意味での read-only であり、`get_metrics_compiled_sql` (SQL 文字列のみ返す・実行なし) とは区別します。

### semantic layer: 自然言語から意味層クエリへ

意味層ツールは「メトリクス名を調べる → 使える軸 (dimension) を調べる → 実際にクエリする」の順で使うと迷いません。

```text
1. list_metrics(search="revenue")
   → 定義済みの "revenue" 系メトリクス一覧 (名前・型・説明) を取得

2. get_dimensions(metrics=["revenue"])
   → "revenue" で group_by 可能なディメンション一覧を取得

3. query_metrics(
     metrics=["revenue"],
     group_by=[{"name": "metric_time", "grain": "day"}],
     limit=1000
   )
   → 実際に集計値を取得 (意味層が生成した SQL がウェアハウス上で実行される)

4. get_metrics_compiled_sql(
     metrics=["revenue"],
     group_by=[{"name": "metric_time", "grain": "day"}]
   )
   → 3 のクエリを実行せず、生成された compiled SQL 文字列だけを確認
```

`query_metrics` と `get_metrics_compiled_sql` は同じ引数 (`metrics` / `group_by` / `order_by` / `where` / `limit`) を受け取ります。障害解析では、まず `get_metrics_compiled_sql` で SQL を確認してから `query_metrics` で実データを取得する順序が安全です。

### discovery: lineage 遡上でモデルの系譜を追う

Discovery ツールは dbt プロジェクトのグラフ (依存関係) を、実際にビルドされた成果物 (manifest) から返します。ドキュメントの追いつき待ちが不要です。

```text
1. get_all_models(search="orders")
   → モデル名・説明の一覧から対象モデルを特定

2. get_model_parents(model_name="fct_orders")
   → fct_orders の直接の上流依存 (親モデル) を取得

3. get_lineage(model_name="fct_orders", types=["ancestors"], depth=5)
   → 5 階層分の上流をまとめて遡上 (親の親まで一括取得)

4. get_model_details(model_name="stg_products")
   → 疑わしいモデルの compiled SQL・列定義・マテリアライズ種別を確認
```

`get_model_children` は逆方向 (下流の影響範囲) の調査に使います。「このソース列を変えたら、どの mart / dashboard が壊れるか」を確認する際に有効です。

### SQL: Databricks 上で read-only 検証する

`execute_sql` は dbt Platform 経由で Databricks SQL ウェアハウスにクエリを発行します。意味層のクエリ結果と、Databricks 上の生データを突き合わせて検証する用途に使います。

```sql
SELECT category, COUNT(*) AS row_count
FROM raw.products
WHERE category = 'food'
GROUP BY category
```

`execute_sql` は DDL/DML の発行も技術的には可能なため、障害解析用途では次のいずれかで書き込みを防ぎます。

- Databricks 側で読み取り専用ロールのトークンを使う
- `DBT_DEV_ENV_ID` に検証専用の開発環境 (本番と分離) を割り当てる
- `text_to_sql` で SELECT 文だけを生成させ、`execute_sql` に渡す前に人間 (またはエージェントの別ステップ) がレビューする

`text_to_sql` は SQL を生成するだけで実行しません。自然言語の質問から dbt プロジェクトの文脈 (モデル名・列名) を踏まえた SQL 文字列を作りたいときに使います。

### BI 障害解析の具体的ワークフロー

起点ブログが挙げる事例 (ある BI ダッシュボードで、飲料が food カテゴリに誤分類されて集計が狂う) を題材に、dbt MCP でどう遡るかを示します。

```mermaid
flowchart TD
    A["1 BI ダッシュボードの<br/>数字がおかしいと気づく"]
    B["2 list_metrics で<br/>対象メトリクスの定義を確認"]
    C["3 get_metrics_compiled_sql で<br/>compiled SQL を確認"]
    D["4 get_model_parents get_lineage で<br/>lineage を遡上"]
    E["5 execute_sql で Databricks 上の<br/>実データを read-only 検証"]
    F{"6 原因モデルを<br/>特定できたか"}
    G["7 root cause を報告<br/>モデル修正は別プロセス"]
    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F -->|"No まだ絞れない"| D
    F -->|"Yes"| G
```

各ステップの具体化です。

1. **異常の把握**: 「食品カテゴリの売上が急増している」など、BI 上の異常な数字を起点にします。
2. **意味層の定義確認**: `list_metrics(search="revenue_by_category")` で、対象メトリクスがどの意味モデル・どの列を参照しているかを確認します。
3. **compiled SQL の確認**: `get_metrics_compiled_sql(metrics=["revenue_by_category"], group_by=[{"name": "product_category"}])` で、意味層が実際に発行している SQL (どのテーブル・どの JOIN・どの CASE 文でカテゴリ分類しているか) を確認します。
4. **lineage 遡上**: compiled SQL に登場するモデル (例 `dim_products`) に対して `get_model_parents(model_name="dim_products")` を呼び、カテゴリ分類ロジックを持つ上流モデル (例 `stg_products` の `CASE WHEN` 分類) まで遡ります。`get_model_details` で該当モデルの compiled SQL を読み、「飲料が `food` に分類されるルール」がどこに書かれているかを特定します。
5. **実データの read-only 検証**: `execute_sql` で Databricks 上の元テーブル (`raw.products` 等) に対して検証クエリ (例 `SELECT category, product_name FROM raw.products WHERE category = 'food' AND product_name ILIKE '%juice%'`) を実行し、ソースデータの時点で誤分類が起きているのか、dbt モデルの変換ロジックで起きているのかを切り分けます。
6. **原因未特定なら 4 に戻る**: 上流にさらにモデルがあれば `get_model_parents` を繰り返し、ソーステーブルまで遡上します。
7. **root cause の報告**: 「`stg_products` の `CASE WHEN category_raw = 'beverage' THEN 'food'` という分類ロジックが誤り」のように、モデル名・行レベルまで特定した状態で報告します。実際の修正 (dbt モデルの書き換え) は別プロセスに委ねます。

この一連の流れにより、エージェントはドキュメントの追随を待たずに、テスト済み・バージョン管理された dbt のグラフと compiled SQL そのものを読んで意味的な影響まで推論できます。

### Python client のコード例

MCP サーバを介さず、Python から直接 Semantic Layer / Discovery の fetcher クラスを呼ぶこともできます。MCP ツール名 (`query_metrics` 等) と Python クラスのメソッド名は必ずしも一致しない点に注意します (例: MCP ツール `get_all_models` は `ModelsFetcher.fetch_models`、`get_model_parents` は `fetch_model_parents` に対応します)。

以下は概念を示す擬似コードです。実際の `Config` は接続設定を **provider 経由**で解決します (`config.semantic_layer_config_provider.get_config()` / `config.discovery_config_provider.get_config()` を `await` して `SemanticLayerConfig` / `DiscoveryConfig` を得ます)。属性を直接参照する形ではない点に注意してください。

```python
import asyncio
from dbt_mcp.config.config import load_config
from dbt_mcp.semantic_layer.client import SemanticLayerFetcher
from dbt_mcp.discovery.client import ModelsFetcher

async def main():
    config = load_config()

    # 接続設定は provider 経由で解決する (擬似コード)
    sl_config = await config.semantic_layer_config_provider.get_config()
    disc_config = await config.discovery_config_provider.get_config()

    # 意味層: メトリクス一覧とクエリ
    sl_fetcher = SemanticLayerFetcher(client_provider)
    metrics = await sl_fetcher.list_metrics(config=sl_config)
    result = await sl_fetcher.query_metrics(
        config=sl_config,
        metrics=["revenue"],
        group_by=[{"name": "metric_time", "grain": "day"}],
        limit=1000,
    )

    # discovery: lineage 遡上
    models_fetcher = ModelsFetcher(paginator=paginator)
    parents = await models_fetcher.fetch_model_parents(
        model_name="dim_products",
        config=disc_config,
    )

asyncio.run(main())
```

MCP サーバ自体をコードから起動する場合の最小構成です。

```python
import asyncio
from dbt_mcp.config.config import load_config
from dbt_mcp.mcp.server import create_dbt_mcp

async def setup_server():
    config = load_config()
    server = await create_dbt_mcp(config)
    server.run(transport="stdio")

asyncio.run(setup_server())
```

## 運用

### サーバの起動・停止・状態確認

dbt MCP サーバは「ローカル (stdio)」と「リモート (dbt Platform ホスト型)」の 2 系統で稼働します。稼働確認はクライアント側から行うのが基本です。

- VS Code: コマンドパレットで `MCP: List Servers` を実行し、稼働中サーバの一覧と状態を確認します。
- Claude Desktop: ログファイルを確認します。

  ```bash
  # macOS
  tail -f ~/Library/Logs/Claude/mcp*.log
  # Windows は %APPDATA%\Claude\logs を確認
  ```

- 詳細ログが欲しいときは、起動前に `DBT_MCP_LOG_LEVEL=DEBUG` を設定します。アクティブなツールセットがログに出力されます。

  ```bash
  export DBT_MCP_LOG_LEVEL=DEBUG
  uvx dbt-mcp
  ```

- 停止は、ローカル (stdio) の場合はクライアントプロセスの終了に追従します。リモートの場合は dbt Platform 側のサービスなので、クライアント側の接続設定 (URL / トークン) を外すことが実質的な停止操作です。

### transport 選択

dbt MCP は MCP 仕様の 2 トランスポートに対応します。用途に応じて選びます。

| transport | 実行形態 | 想定用途 |
|---|---|---|
| stdio (既定) | クライアントが `uvx dbt-mcp` を子プロセスとして起動し、標準入出力で JSON-RPC をやり取り | 個人のローカル開発、単一クライアント接続 |
| streamable HTTP | dbt Platform がホストするリモート MCP サーバに HTTP で接続。ツールは HTTP ヘッダ経由で設定 | マルチユーザー・マルチテナントのエージェントアプリケーション、社内基盤への組み込み |

- ローカルサーバはマルチテナント運用や複数ユーザーへのホスティングに向きません。複数ユーザーに使わせるアプリケーションを作る場合はリモート (streamable HTTP) を選びます。
- ローカルデバッグ目的で stdio の代わりに HTTP を使いたい場合は、環境変数 `MCP_TRANSPORT=streamable-http` を設定します。

### 監査・ロギング

- `DO_NOT_TRACK` に `true` を設定すると、dbt MCP の利用トラッキング (テレメトリ) を無効化できます。社内ポリシーでテレメトリ送信を止めたい場合に使います。
- dbt MCP サーバ自体は本番データを保持・保存しません。監査の主眼は「エージェントが何を引いたか」の記録であり、これは実行基盤側 (dbt Platform / Databricks) のログに委ねます。
- リモート MCP 経由の `execute_sql` / `query_metrics` は dbt Platform infra を通るため、dbt Platform の実行ログが「誰が・いつ・どの metric / SQL を引いたか」の中央記録になります。Databricks 側は Unity Catalog の監査ログと突き合わせることで、意味層からの発行クエリと実データアクセスを二重に追跡できます。
- 障害解析の再現性を担保するため、`get_metrics_compiled_sql` (実行せずコンパイル済み SQL のみ返す) を先に呼び、実際に `execute_sql` を叩く前にログへ残すフローを徹底します。

### 環境分離

- `DBT_PROD_ENV_ID` は本番環境 ID で、意味層の read (`list_metrics` / `query_metrics` など) や discovery 系ツールが参照します。
- `DBT_DEV_ENV_ID` は開発環境 ID で、`execute_sql` はこちらを使います。`execute_sql` には合わせて `DBT_USER_ID` の設定も必須です。
- `execute_sql` は Personal Access Token (PAT) が前提で、Service Token では動作しません。本番の read 専用ツールとは認証方式ごと分離する設計になっています。
- つまり「本番の意味層は read-only で広く共有」「execute_sql による生 SQL 実行は開発環境 + 個人 PAT に限定」という二重の分離が既定の設計です。

  ```bash
  export DBT_HOST=cloud.getdbt.com
  export DBT_PROD_ENV_ID=54321   # 意味層 read 用 (数値 ID、URL 貼り付け不可)
  export DBT_DEV_ENV_ID=98765    # execute_sql 用
  export DBT_USER_ID=123
  export DBT_TOKEN=<PAT>         # execute_sql は PAT 必須、Service Token 不可
  ```

### 意味層応答のサイズ制御

意味層のレスポンスが大きくなりすぎると、エージェントのコンテキストを圧迫したり応答が途中で切れたりします。2 つの環境変数で制御します。

| 変数 | 既定値 | 役割 |
|---|---|---|
| `DBT_MCP_SL_MAX_RESPONSE_CHARS` | 16000 | semantic layer 応答の最大文字数。超過分は切り詰められます |
| `DBT_MCP_SL_METRICS_RELATED_MAX` | 10 | 関連メトリクス取得の最大件数 |

```bash
# 大規模な意味層モデルでレスポンス欠落が疑われる場合、上限を引き上げて様子を見る
export DBT_MCP_SL_MAX_RESPONSE_CHARS=32000
export DBT_MCP_SL_METRICS_RELATED_MAX=20
```

上限を上げるとコンテキスト消費が増えます。まずは `query_metrics` の `group_by` / `limit` を絞る、`get_dimension_values` はスコープを `metrics` で限定する、といったクエリ側の粒度調整を優先し、それでも足りない場合にのみ上限を調整します。

## ベストプラクティス

### 最小権限 / truth layer 分離

dbt MCP の設計論の核心は「エージェントにどの truth layer を、どの権限で開けるか」を明示的に決めることです。

- dbt MCP のツール群は系統 (semantic layer / discovery / SQL / admin API / dbt CLI) に分かれ、系統ごとに有効・無効を切り替えられます。まず必要な系統だけを開けます。

  ```bash
  # semantic layer と discovery だけを許可し、それ以外は無効化する例
  export DISABLE_SEMANTIC_LAYER=false
  export DISABLE_DISCOVERY=false
  export DISABLE_ADMIN_API=true
  export DISABLE_DBT_CLI=true
  export DISABLE_DBT_CODEGEN=true    # 既定で無効
  ```

- allowlist 方式に倒す場合は `DBT_MCP_ENABLE_*` 系を使い、個別ツール単位まで絞り込みます。

  ```bash
  export DBT_MCP_ENABLE_SEMANTIC_LAYER=true
  export DBT_MCP_ENABLE_DISCOVERY=true
  export DBT_MCP_ENABLE_TOOLS=list_metrics,query_metrics,get_dimensions,get_model_parents
  ```

- BI 障害解析用のエージェントには、既定で read-only な semantic layer と discovery のみを開け、`execute_sql` や admin API は allowlist から外すことを起点にします。生 SQL 実行が必要になった場合のみ、開発環境 (`DBT_DEV_ENV_ID`) 限定・個人 PAT 限定で個別に許可します。
- MCP クライアント側でも「ツール呼び出しは既定で拒否し、許可されたツールだけ明示的に許可する」姿勢を徹底します。サーバ側の allowlist とクライアント側の承認フローの二段構えにすることで、単一障害点を避けられます。

### 生データ丸投げの回避

- text-to-SQL をエージェントに直叩きさせる構成は、幻覚 SQL (存在しない列・誤った JOIN)、全表スキャンによる高コストクエリ、PII を含む列の意図しない取得、といったリスクを内包します。読み取り専用のクエリであっても、PII 露出やテナント境界の越境、フィールドレベルのポリシー違反は起こり得ます。
- dbt MCP の `query_metrics` / `get_metrics_compiled_sql` は、意味層で定義済みの metric・dimension のみを組み合わせる形に閉じているため、エージェントが任意のテーブル・列を自由に組み立てる余地がありません。これが「生データ丸投げ」との本質的な違いです。
- `text_to_sql` ツールや `execute_sql` を使う場合も、コンパイル済み SQL を必ず人間または上位エージェントがレビューしてから実行する運用 (`get_metrics_compiled_sql` で先に中身を確認する等) を挟み、生成された SQL を無条件に実行しないようにします。
- スキーマ情報が古いままだと、エージェントは古いテーブル名・列名をもとに幻覚 SQL を生成しやすくなります。dbt プロジェクトのドキュメント (discovery ツールが返す情報) を最新に保つことが、幻覚対策として直接効きます。

### 意味層 = 契約

- dbt Semantic Layer は metric 定義をバージョン管理された YAML として一元化し、BI ツール・ノートブック・AI エージェントのすべてが同じ定義を参照する single source of truth にします。
- エージェントには「定義された意味」だけを引かせ、生テーブルへの直接アクセスは検証層 (Databricks SQL) に限定します。これにより、同じ指標名が経路ごとに違う計算式で出る「意味的ドリフト」を防ぎます。
- 意味層は AI エージェントに対するガードレールでもあり、承認済み・統制された・文脈化された metric のみをクエリさせる強制力を持ちます。エージェントが自由にロジックを組み立てるのではなく、既存の契約 (metric 定義) の範囲内でしか動けない状態を作ります。
- 障害解析の起点は常に「意味層で定義された metric のズレ」から入り、必要な場合のみ検証層 (Databricks SQL) に降りて実データを確認する順序を固定します。逆順 (生データから先に当たる) は truth layer の分離を無意味にします。

### Databricks 側ガバナンス

- Unity Catalog は列レベルマスキング・行レベルフィルタリング・きめ細かいアクセス制御・自動監査ログ・エンドツーエンドのリネージを提供し、最小権限のデータアクセスポリシーを実装する基盤になります。
- エージェントが呼び出す SQL Warehouse は read-only 設定にし、DDL/DML (CREATE/DROP/INSERT/UPDATE/DELETE) を実行できないロールに紐付けます。`execute_sql` 相当のツールを開ける場合でも、接続先ウェアハウスの権限そのものを read-only に倒しておくことで、二重の防御線になります。
- Databricks のエージェント基盤はデフォルトでシステムサービスプリンシパルに read-only 権限を割り当てます。マルチユーザー用途では、共有サービスアカウントでなく on-behalf-of (OBO) 認可で「問い合わせたユーザーの権限」をそのままエージェントに伝播させる構成が推奨されます。
- コスト境界の管理として、SQL Warehouse に自動停止 (auto-stop) とクラスタサイズ上限を設定し、意味層を経由しない大規模スキャンクエリが誤って高コストを生まないようにします。PII を含む列は Unity Catalog のカラムマスキングやビュー越しの公開に留め、エージェントが直接 PII 列に触れない設計にします。

### 監査証跡

- BI 障害解析は「誰が・いつ・どの metric / SQL を・どの権限で引いたか」を再現できて初めて成立します。dbt Platform 側の実行ログと Databricks Unity Catalog の監査ログを突き合わせる前提で運用します。
- dbt MCP 側のログ (`DBT_MCP_LOG_LEVEL=DEBUG` 時のツール呼び出し履歴) と Unity Catalog の監査ログを組み合わせることで、「エージェントが意味層のどの metric を引き、その裏で Databricks のどのテーブルに到達したか」を追跡できます。
- 障害解析ワークフローの各ステップ (metric 確認 → lineage 遡上 → compiled SQL 確認 → 実データ検証) をログとして残すことで、同じ障害が再発したときに手順を再利用できる資産になります。

### CI/CD・マルチ環境・セキュリティ

- 環境変数 (トークン・env ID) は CI/CD のシークレットストアで管理し、リポジトリや Flow 定義に平文で残しません。
- 本番・開発・CI の 3 環境で `DBT_PROD_ENV_ID` / `DBT_DEV_ENV_ID` / トークンの組を明確に分け、CI では admin API・dbt CLI 系ツールをデフォルトで無効化しておきます。
- MCP サーバをローカル (stdio) で複数エージェントに配布する場合は、コンテナやサンドボックスに隔離し、各ツールに明示的なアウトバウンド allowlist (接続先ドメイン/IP) を設定して、意図しない外部通信を遮断します。
- リモート MCP サーバ (streamable HTTP) を使う場合は TLS を必須にし、トークンは定期ローテーションします。新トークンを発行してシステムに反映してから旧トークンを削除する順序を守り、サービス断を避けます。

### 導入前チェックリスト

| 観点 | 確認内容 |
|---|---|
| 目的 | BI の数字不整合、metric 定義確認、lineage 影響調査など、AI エージェントに任せる調査範囲 |
| 正本 | dbt Semantic Layer と Discovery を最新に保つ運用責任者 |
| 権限 | Semantic Layer / Discovery / SQL / Admin API / dbt CLI の有効化範囲 |
| SQL 実行 | `execute_sql` を開ける場合の read-only ロール、開発環境、PAT 管理、レビュー手順 |
| 監査 | dbt Platform ログ、Databricks Unity Catalog 監査ログ、エージェント実行ログの突合方法 |
| コスト | SQL Warehouse の auto-stop、クエリ上限、意味層レスポンスサイズの上限 |
| 障害時対応 | lineage 欠落、認証エラー、Service Token / PAT の使い分け、レスポンス欠落時の切り分け |

このチェックリストを先に埋めると、MCP サーバの接続確認だけで導入を終えず、権限・監査・コスト境界まで含めた運用設計として着地できます。

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `Could not connect to MCP server dbt-mcp` / `spawn uvx ENOENT` | クライアントが PATH 内の `uvx` を見つけられない | `which uvx` (macOS/Linux) または `where uvx` (Windows) でフルパスを確認し、MCP クライアント設定の `command` にフルパスを指定する |
| OAuth ログインでブラウザが開かない・認証がハングする | 前回セッションのロックファイルが残存 | dbt の MCP 用ロックファイルを削除して再試行する。管理者はアカウント有効化も確認する |
| サーバが切断・利用不可 (原因不明) | `DBT_PROJECT_DIR` / `DBT_PATH` の不正、トークン失効、必須環境変数の欠落 | `DBT_MCP_LOG_LEVEL=DEBUG` で詳細ログを確認。VS Code は `MCP: List Servers`、Claude Desktop は `~/Library/Logs/Claude` (macOS) を確認 |
| `execute_sql` が認証エラー・利用不可 | Service Token では `execute_sql` が動作せず、PAT が必須 | Account settings → API tokens → Personal tokens で PAT を発行し `DBT_TOKEN` に設定。合わせて `DBT_DEV_ENV_ID` と `DBT_USER_ID` を設定する |
| Semantic Layer / Discovery / Admin API のツールが使えない | 必須環境変数の不足、または `DISABLE_*` が意図せず有効 | 必須変数を再確認し、`DISABLE_SEMANTIC_LAYER` 等が `true` になっていないか確認。allowlist モード使用時は `DBT_MCP_ENABLE_*` に対象ツールセットが含まれているか確認 |
| 認証エラー・予期しない動作 (ID 系) | `DBT_PROD_ENV_ID` / `DBT_USER_ID` に URL を貼り付けている (数値 ID が必須) | dbt Platform 管理画面の URL からではなく、表示される数値 ID をそのまま設定する |
| `query_metrics` だけ「warehouse credentials not found」、`list_metrics` 等は動く | リモート MCP + PAT 認証時の既知不具合 (dbt-mcp Issue #379) | Semantic Layer の warehouse 資格情報設定を dbt Platform 側で確認。回避策として `get_metrics_compiled_sql` でコンパイル済み SQL のみ取得し、実行は別経路に切り替える |
| 意味層の応答が途中で切れる | `DBT_MCP_SL_MAX_RESPONSE_CHARS` (既定 16000) を超過 | `query_metrics` の `group_by` / `limit` を絞る、または上限を引き上げる |
| 関連メトリクスが期待件数より少ない | `DBT_MCP_SL_METRICS_RELATED_MAX` (既定 10) の上限に達している | 上限値を引き上げるか、`list_metrics` 等で対象を絞り込んでから関連取得する |
| エージェントが生成した SQL が幻覚 (存在しない列・誤った JOIN) を含む | text-to-SQL / `execute_sql` の直叩きで、スキーマ情報が古い・意味層を経由していない | 意味層経由の `query_metrics` / `get_metrics_compiled_sql` を優先し、生 SQL 実行前に必ず compiled SQL をレビューする。dbt プロジェクトのドキュメントを最新化する |
| BI 上の数字不整合を調べようとしたら lineage が途中で途切れる | discovery 系ツールが参照するモデルのドキュメント・依存関係が未整備 | `get_all_models` で対象モデルの存在を確認し、`get_model_parents` を起点から複数段たどる。dbt プロジェクト側で該当モデルの `ref()` / ドキュメントが欠落していないか確認する |

## まとめ

dbt MCP は、AI エージェントに dbt の意味層・リネージ・compiled SQL を渡し、Databricks を検証層として組み合わせることで、BI の数字不整合を安全に追跡するための接続面になります。導入時は、Semantic Layer と Discovery を正本にし、SQL 実行を read-only・開発環境・監査可能な経路に限定すると、生データ丸投げ型の text-to-SQL よりも運用しやすい障害解析フローを作れます。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！

## 参考リンク

- 公式ドキュメント・一次ソース
  - [How MCP connects your AI agent to dbt and Databricks | dbt Labs (起点ブログ)](https://www.getdbt.com/blog/mcp-dbt-databricks)
  - [About dbt Model Context Protocol (MCP) server | dbt Developer Hub](https://docs.getdbt.com/docs/dbt-ai/about-mcp)
  - [Available tools | dbt Developer Hub](https://docs.getdbt.com/docs/dbt-ai/mcp-available-tools)
  - [Set up local MCP | dbt Developer Hub](https://docs.getdbt.com/docs/dbt-ai/setup-local-mcp)
  - [Set up remote MCP | dbt Developer Hub](https://docs.getdbt.com/docs/dbt-ai/setup-remote-mcp)
  - [MCP environment variables reference | dbt Developer Hub](https://docs.getdbt.com/docs/dbt-ai/mcp-environment-variables)
  - [MCP troubleshooting | dbt Developer Hub](https://docs.getdbt.com/docs/dbt-ai/mcp-troubleshooting)
  - [Building the Remote dbt MCP Server | dbt Developer Blog](https://docs.getdbt.com/blog/building-the-remote-dbt-mcp-server)
  - [dbt Semantic Layer | dbt Developer Hub](https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl)
- GitHub・パッケージ
  - [dbt-labs/dbt-mcp | GitHub](https://github.com/dbt-labs/dbt-mcp)
  - [dbt-mcp | PyPI](https://pypi.org/project/dbt-mcp/)
  - [dbt-mcp deepwiki](https://deepwiki.com/dbt-labs/dbt-mcp)
  - [OpenAI Agents SDK 連携例 (streamable HTTP / stdio)](https://github.com/dbt-labs/dbt-mcp/tree/main/examples/openai_agent)
  - [[Bug]: Personal Access Token not working with remote MCP server · Issue #379](https://github.com/dbt-labs/dbt-mcp/issues/379)
  - [dbt_mcp/config/settings.py (DbtMcpSettings)](https://github.com/dbt-labs/dbt-mcp/blob/main/src/dbt_mcp/config/settings.py)
  - [dbt_mcp/semantic_layer/types.py](https://github.com/dbt-labs/dbt-mcp/blob/main/src/dbt_mcp/semantic_layer/types.py)
  - [dbt_mcp/discovery/client.py](https://github.com/dbt-labs/dbt-mcp/blob/main/src/dbt_mcp/discovery/client.py)
- 公式記事・ガバナンス背景
  - [Unify metrics and accelerate analytics with dbt Semantic Layer | dbt Labs](https://www.getdbt.com/product/semantic-layer)
  - [Why metric definitions matter for reliable AI agents | dbt Labs](https://www.getdbt.com/blog/metric-definitions-ai-agents)
  - [How a semantic layer prevents AI hallucinations in analytics | dbt Labs](https://www.getdbt.com/blog/how-a-semantic-layer-prevents-ai-hallucinations-in-analytics)
  - [Governing AI agents at scale with Unity Catalog | Databricks Blog](https://www.databricks.com/blog/governing-ai-agents-scale-unity-catalog)
  - [Data and AI governance with Unity Catalog | Databricks](https://docs.databricks.com/aws/en/data-governance/)
- セキュリティ関連記事
  - [Safe Text-to-SQL: Giving an Agent Database Access Without Dropping Tables or Leaking PII](https://dev.to/kowshik_jallipalli_a7e0a5/safe-text-to-sql-giving-an-agent-database-access-without-dropping-tables-or-leaking-pii-i47)
  - [Text-to-SQL Security: 10 Risks Before Production Deployment](https://www.dpriver.com/blog/text-to-sql-security-10-risks-before-production-deployment/)
  - [MCP Security - OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html)
  - [Security Best Practices - Model Context Protocol](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
