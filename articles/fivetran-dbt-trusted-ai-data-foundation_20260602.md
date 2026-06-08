---
title: "AIにSQLを書かせる前に整える信頼できるデータ基盤: Fivetran+dbt と dbt MCP"
emoji: "🧱"
type: "tech"
topics: ["dbt", "MCP", "AIAgent", "DataEngineering", "SemanticLayer"]
published: true
published_at: 2026-06-09
---

> 検証日: 2026-06-02 / 対象: dbt MCP server・Semantic Layer (MetricFlow)・Agents Schema を含む Fivetran+dbt 統合基盤
> 起点: dbt Labs Blog「What we announced at Snowflake Summit and why it matters」

2026 年 6 月、Fivetran と dbt Labs の合併が完了しました。新会社が掲げたメッセージは「Data Infrastructure for Trusted AI Agents (信頼できる AI エージェントのためのデータ基盤)」です。本記事では、この「信頼できるデータ基盤」を構成する要素が AI エージェントに対して何の失敗を防ぐのかを構造的に整理し、dbt MCP server と Semantic Layer がエージェントとデータをどう接続するかを技術的に追い、最後にロックインや採用コストといった反証を踏まえて採用判断の条件を示します。

## 概要

2026 年 6 月 1 日、Fivetran と dbt Labs の合併が完了しました。統合後の正式プレスタイトルは "Create the Data Infrastructure for Trusted AI Agents" であり、新会社の競争軸を「信頼できる AI エージェントのためのデータ基盤」に定めました。

この統合の核心は、競争軸が「より賢いモデル」から「エージェントが信頼して行動できるデータ」に移ったという主張にあります。Tristan Handy (President) の言葉がその思想を端的に示します。

> "The companies that deploy AI successfully over the next decade will be the ones whose agents can be trusted to act. Trust is built at the infrastructure layer, on high-quality tooling and on open standards." — Tristan Handy

AI エージェントは自律的に行動します。誤った・古い・未検証のデータの上で動くと、意思決定が静かに破綻します。そこで Fivetran+dbt は、AI にクエリを書かせる前に、データ側で lineage (来歴) / data contract (契約) / test (品質テスト) / semantic layer (指標定義) / incremental (差分実行) を整えるべきだと主張します。

### 合併の基本事実

| 項目 | 値 |
|---|---|
| 合併形態 | 株式交換 (all-stock transaction) による経営統合 |
| 合併公表 | 2025-10-13 |
| 合併完了 | 2026-06-01 |
| 統合後 ARR | 約 $600M (合併完了後に近づく見込みの表記、二次情報: Morningstar / Techzine) |
| データチーム数 | 100,000+ (OpenAI, Zendesk, Coupa, HubSpot 等、二次情報) |
| CEO | George Fraser (旧 Fivetran) |
| President | Tristan Handy (旧 dbt Labs 共同創業者) |

### 役割分担

アナリストの要約が統合の本質を一言で示します (二次: TechTarget)。

> "Fivetran moves the data and dbt makes it trustworthy."

- Fivetran (ELT): 多数のデータソースから継続的・完全にデータを取り込む。エージェントが完全で同期済みの信頼できるデータの上で動くことを保証する。
- dbt (transformation + governance): 取り込まれたデータを検証し、意味を付与し、信頼できるものにする。tested business logic・共有セマンティック・ガバナンスを提供する。

従来、取り込みと変換は別ツール・別 lineage で分断されていました。統合により、ソース取込から変換・テスト・セマンティック定義・メトリクスまでが 1 つの lineage / コンテキスト層として束ねられます。

### AI-ready データ基盤の定義と業界収斂

「AI-ready データ基盤」という言葉は Fivetran+dbt だけでなく、Databricks・Snowflake も同時期に打ち出しています。構成要素は 3 陣営とも概ね「governed + modeled/tested + lineage + semantic context」に収斂しています。Fivetran+dbt の差別化は、これを特定プラットフォームに依存しないオープン標準として提供しようとする点にあります。

| 比較項目 | Fivetran + dbt | Databricks | Snowflake |
|---|---|---|---|
| 信頼の中核 | Agents Schema (OSS 標準) + dbt semantic / lineage / test | Unity Catalog (governance + Metric Views + 品質監視) | Semantic Views + Cortex (Semantic View Autopilot 等、機能名/GA 範囲は要確認) |
| 立ち位置 | オープン・プラットフォーム非依存 | 自社 lakehouse 内の垂直統合 | 自社プラットフォームを control plane に |
| 接続方式 | dbt MCP server (Local / Remote HTTP) | MCP / AI Gateway + Agent Bricks | Cortex Agents / MCP |
| ガバナンス | service token + OAuth スコープ + Agents Schema | RBAC + column-level lineage + 監査証跡 + PII 自動タグ | RBAC + Cortex Agent Evaluations |
| エージェントメモリ | なし | Lakebase (OLTP、永続メモリ) | なし |

## 特徴

### 失敗の形を「もっともらしい誤答」から「エラーメッセージ」に変える

生の text-to-SQL (LLM にスキーマを渡して直接 SQL を書かせる方式) の最大の問題は、実行は成功するが間違った数値を返す点です。dbt Semantic Layer (MetricFlow) が SQL 生成を決定的 (deterministic) に担うことで、LLM の仕事を「正しい metric / dimension を選ぶこと」だけに縮小します。不正な join や集計は構造的に起こせなくなります。

> "With text-to-SQL, failure looks like a plausible but incorrect answer. With the Semantic Layer, failure looks like an error message." — dbt Labs

dbt Labs の自社ベンチ (ACME Insurance データセット、11 問 × 20 回 × 複数 LLM という限定条件) では、Semantic Layer scope 内で gpt-5.3-codex が Text-to-SQL 84.1% から Semantic Layer 100.0% へ、claude-sonnet-4-6 が 90.0% から 98.2% へ達したと報告されています (一次: dbt docs blog `semantic-layer-vs-text-to-sql-2026`、モデル名は 2026 年時点の同ブログ表記)。自社ベンチである点と SL scope 内という条件には留意が必要で、トレードオフはカバレッジであり、モデル化済みの範囲しか答えられません。

### 5 要素は役割が階層的に分かれている

| 要素 | いつ効くか | 防ぐ失敗 |
|---|---|---|
| data contract | build 前 (preflight) に構造 (shape) を検証 | 上流スキーマ変更でエージェントの SQL がサイレントに破損する |
| test (dbt test) | build 後に中身 (content) を検証 | コードは正しいが入力データが壊れて誤答する |
| lineage (column-level) | 来歴追跡・影響分析・stale 検出 | 「なぜこの数値か」を説明できない / 古いテーブルを参照する |
| semantic layer / metric 定義 | クエリ時に指標を一意解釈 | 「売上」等の定義揺れ・不正な join |
| incremental / 差分実行 | 鮮度 × コストの土台 | フル rebuild できず古いデータで誤答する (間接的) |

contract は構造しか見ず logic を見ない限界があり、test と補完関係にあります。incremental は他 4 要素のように誤りを直接防ぐのではなく、freshness とコスト効率を支える土台です。

### dbt MCP server を「governed control layer」と位置づける

dbt MCP server (`dbt-labs/dbt-mcp`、Apache-2.0) の公式定義は次の通りです。

> "these dbt MCP server tools make dbt not just the structured context layer, but also the governed control layer between your data workflows and your AI, the bridge between the governed warehouse and your LLMs, agents, and AI-powered tools." — dbt Labs 公式ブログ

単なる接続口ではなく、アクセス権限とコンテキストを統制するレイヤーとして位置づけます。Local (uvx) と Remote (HTTP) の 2 形態があり、Remote は consumption-only (dbt CLI 不可) です。

### Agents Schema で一気通貫のコンテキストをエージェントに渡す

Agents Schema は、データウェアハウス/レイク内の単一スキーマに、メトリクス定義・セマンティックモデル・dbt lineage・ビジネスドキュメントをプレーンな SQL テーブルとして格納する OSS 標準です。

> "one schema in a data warehouse or data lake that is compatible across systems as the shared context layer for agentic AI." — citybiz (合併完了発表ミラー, 2026-06-01)

エージェントは「どのソースから来た、どう検証された、どのメトリクス定義の数字か」を辿れます。「customer-owned context layer」と表現することで、ベンダー側でなく顧客のガバナンスポリシー内で動く点を強調します。

### ELT + transformation の統合による lineage の一気通貫

取り込みと変換が 1 ベンダーになることで、ソース取込から変換・テスト・セマンティック定義・メトリクスまでの lineage が途切れません。公式の整理 (一次: Fivetran 公式まとめ) は次の通りです。

> "combining reliable data movement, governed transformation, and consistent business logic into a unified, context-rich foundation."

### dbt Wizard は「汎用コーディングエージェントではない」

dbt Wizard (および dbt Copilot) は、分析エンジニアリングの文脈を知る専用エージェントとして位置づけられます (一次: docs.getdbt.com)。

> "Analytics engineering requires more than code generation — it requires understanding your data, how it connects, and what breaks when something changes." — dbt docs

汎用 AI コーディングアシスタントは構文は分かるが頑健なデータパイプラインに必要な深い文脈を欠きます。dbt の AI 群は lineage / tests / contracts / metric 定義に grounded である点を差別化とします。

### オープン標準を差別化軸とする

- dbt Core v2.0: Apache 2.0 ライセンスで OSS 化 (Fusion runtime 部分)。ただし alpha 段階。
- Agents Schema: OSS 標準として公開。
- dbt MCP server: Apache-2.0 ライセンス (`dbt-labs/dbt-mcp` で確認)。

ただし注意点が 2 つあります。dbt Fusion (proprietary distribution) は Elastic License (source-available) であり OSI 承認の OSS ではありません。MetricFlow のライセンスは、2025-10 の合併公表時に「Apache 2.0 でのフル OSS 化」が言及された一方、公式 licenses-faq では BSL (Business Source License、非本番用途はフリー) 表記が残っており、現時点のライセンス状態は要確認です。

## 構造

### システムコンテキスト図

```mermaid
graph TB
  AE["Analytics Engineer"]
  AIAgent["AI エージェント"]
  BIUser["BI ユーザー"]

  subgraph Foundation["信頼できる AI エージェント向けデータ基盤<br/>Fivetran + dbt"]
    Core["データ基盤コア"]
  end

  ELTSrc["ELT ソース<br/>SaaS - DB - イベント等"]
  WH["データウェアハウス<br/>Snowflake - BigQuery - Redshift 等"]
  LLMProv["LLM プロバイダー<br/>OpenAI - Anthropic - Bedrock 等"]
  BITool["BI - 可視化ツール<br/>Tableau - Looker - Mode 等"]

  AE -->|モデル開発・テスト・デプロイ| Foundation
  AIAgent -->|MCP protocol 経由で指標・lineage 取得| Foundation
  BIUser -->|指標クエリ - ダッシュボード参照| Foundation
  ELTSrc -->|生データ取込| Foundation
  Foundation -->|変換・検証済みデータ| WH
  Foundation -->|SQL 実行・クエリ委譲| WH
  Foundation <-->|AI 推論リクエスト - トークン消費| LLMProv
  WH -->|集計データ| BITool
```

#### アクター

| 要素名 | 説明 |
|--------|------|
| Analytics Engineer | dbt プロジェクトでモデル・テスト・セマンティックモデルを定義・管理する開発者 |
| AI エージェント | MCP protocol 経由でデータ基盤にアクセスし、指標取得・lineage 探索・SQL 実行を行う自律エージェント |
| BI ユーザー | ダッシュボードや Insights UI でガバナンスされた指標を参照するビジネスユーザー |

#### 外部システム

| 要素名 | 説明 |
|--------|------|
| ELT ソース | SaaS アプリ・DB・イベントストリームなど、Fivetran が取り込む生データの発生元 |
| データウェアハウス | Snowflake / BigQuery / Redshift 等。変換・検証後の最終保存先であり SQL 実行エンジン |
| LLM プロバイダー | OpenAI / Anthropic / Azure AI Foundry 等。dbt Wizard / text_to_sql のバックエンド |
| BI - 可視化ツール | Tableau / Looker / Mode 等。Semantic Layer API 経由または直接 WH に接続して可視化 |

### コンテナ図

```mermaid
graph TB
  AE["Analytics Engineer"]
  AIAgent["AI エージェント"]
  BIUser["BI ユーザー"]

  subgraph Foundation["信頼できる AI エージェント向けデータ基盤"]
    Fivetran["Fivetran ELT<br/>データ取込・増分同期"]
    dbtTransform["dbt Transformation<br/>Test - Contract<br/>変換・品質保証・契約"]
    SemanticLayer["Semantic Layer - MetricFlow<br/>指標定義・クエリ実行"]
    MCPServer["dbt MCP server<br/>AI エージェント接続口"]
    AgentsSchema["Agents Schema<br/>エージェント共有コンテキスト層"]
    Catalog["Catalog - Lineage<br/>Explorer - 列レベル来歴"]
  end

  WH[("データウェアハウス")]
  LLMProv["LLM プロバイダー"]

  AE -->|Studio IDE - dbt CLI| dbtTransform
  AE -->|Canvas - ビジュアルモデリング| dbtTransform
  AIAgent -->|MCP protocol| MCPServer
  BIUser -->|Insights UI - BI ツール| SemanticLayer

  Fivetran -->|生データ同期| WH
  dbtTransform -->|変換・テスト・contract 検証| WH
  dbtTransform -->|metric - semantic model 定義| SemanticLayer
  dbtTransform -->|lineage メタデータ| Catalog
  SemanticLayer -->|SQL 実行委譲| WH
  MCPServer -->|指標クエリ| SemanticLayer
  MCPServer -->|メタデータ - lineage| Catalog
  MCPServer -->|SQL 実行| WH
  AgentsSchema -->|context テーブル参照| WH
  Catalog -->|lineage - health| dbtTransform
  MCPServer <-->|text_to_sql 推論| LLMProv
```

#### Fivetran ELT

| 要素名 | 説明 |
|--------|------|
| Fivetran ELT | SaaS / DB / イベントソースからウェアハウスへの増分同期を担うコネクタ群。合併によって dbt lineage と統合され、取込から変換まで一気通貫の来歴を実現 |

#### dbt Transformation - Test - Contract

| 要素名 | 説明 |
|--------|------|
| dbt Transformation | SQL モデルのビルド・マテリアライズ・増分実行を管理する変換エンジン (dbt Core / Fusion) |
| Test | dbt test による行レベル・カラムレベルのデータ品質検証。ビルド後に実行し誤った入力データを検出 |
| Contract | モデルごとにカラム名・型・制約を YAML で宣言し、上流スキーマ変更をビルド前 (preflight) に検出するサイレント破損防止機構 |

#### Semantic Layer - MetricFlow

| 要素名 | 説明 |
|--------|------|
| Semantic Layer - MetricFlow | セマンティックモデル (Entities / Dimensions / Measures) と 5 種の Metric を YAML で中央定義し、クエリ時に決定論的 SQL を生成。BI ツール・AI エージェント双方に一貫した指標を供給 |

#### dbt MCP server

| 要素名 | 説明 |
|--------|------|
| dbt MCP server | MCP に準拠した AI エージェント向け接続口。Local (uvx) と Remote (HTTP) の 2 形態。Semantic Layer / Discovery / SQL / CLI / Admin / Fusion の各 toolset を公開 |

#### Agents Schema

| 要素名 | 説明 |
|--------|------|
| Agents Schema | ウェアハウス内の単一スキーマに metric 定義・セマンティックモデル・lineage・ビジネスドキュメントをプレーン SQL テーブルとして格納する OSS 標準。顧客が所有し既存のセキュリティ・ガバナンスポリシー内で動く共有コンテキスト層 |

#### Catalog - Lineage

| 要素名 | 説明 |
|--------|------|
| Catalog - Lineage | dbt Explorer が提供するモデル・ソース・テスト・メトリクスのカタログ。列レベルの来歴と model health (テスト結果・鮮度) を提供し、エージェントの影響分析・監査ルートを支える |

### コンポーネント図

dbt MCP server と Semantic Layer のドリルダウンです。

#### dbt MCP server コンポーネント

```mermaid
graph TB
  AIAgent["AI エージェント<br/>Claude - Cursor - VS Code 等"]

  subgraph MCPServer["dbt MCP server"]
    subgraph ReadTools["Read 系 toolset"]
      SLTools["Semantic Layer tools<br/>list_metrics - get_dimensions<br/>query_metrics"]
      DiscTools["Discovery - Metadata tools<br/>get_lineage - get_model_details<br/>get_model_health"]
      SQLTools["SQL tools<br/>execute_sql - text_to_sql"]
      FusionTools["Fusion tools<br/>fusion.compile_sql<br/>fusion.get_column_lineage"]
      DocTools["Product Doc tools<br/>get_product_doc_pages"]
    end
    subgraph WriteTools["Write 系 toolset"]
      CLITools["dbt CLI tools<br/>run - build - test"]
      CodegenTools["Codegen tools<br/>generate_model_yaml"]
      AdminTools["Admin API tools<br/>trigger_job_run"]
    end
    AuthGate["認証・スコープ制御<br/>service token - PAT - OAuth"]
    EnvControl["toolset 有効-無効制御<br/>DISABLE_x - DBT_MCP_ENABLE_x"]
  end

  SLEndpoint["Semantic Layer API<br/>GraphQL - JDBC - Python SDK"]
  DiscAPI["Discovery API"]
  AdminAPI["Admin API"]
  WH[("データウェアハウス")]
  LLMProv["LLM プロバイダー"]

  AIAgent -->|MCP protocol| AuthGate
  AuthGate --> EnvControl
  EnvControl --> SLTools
  EnvControl --> DiscTools
  EnvControl --> SQLTools
  EnvControl --> FusionTools
  EnvControl --> DocTools
  EnvControl --> CLITools
  EnvControl --> CodegenTools
  EnvControl --> AdminTools

  SLTools -->|GraphQL createQuery - query| SLEndpoint
  DiscTools -->|metadata query| DiscAPI
  SQLTools -->|SQL 実行| SLEndpoint
  FusionTools -->|dbt Platform API| SLEndpoint
  CLITools -->|dbt project build| WH
  AdminTools -->|job 操作| AdminAPI
  SQLTools -->|text_to_sql 推論| LLMProv
```

##### Read 系 toolset

| 要素名 | 説明 |
|--------|------|
| Semantic Layer tools | list_metrics / get_dimensions / query_metrics 等。Semantic Layer API 経由で定義済み metric を取得。Remote MCP でも使用可能 |
| Discovery - Metadata tools | get_lineage / get_model_details / get_model_health 等。Discovery API 経由でモデル来歴・品質状態・依存関係を取得 |
| SQL tools | execute_sql (PAT 必須) / text_to_sql。Gateway service 経由で SQL を実行、または LLM で自然言語から SQL を生成 |
| Fusion tools | fusion.compile_sql / fusion.get_column_lineage。dbt Platform 側の Fusion engine 経由で列レベル lineage・SQL コンパイルを提供 |
| Product Doc tools | get_product_doc_pages / search_product_docs。docs.getdbt.com のページを Markdown で取得 |

##### Write 系 toolset

| 要素名 | 説明 |
|--------|------|
| dbt CLI tools | run / build / test 等。Local MCP のみ。ウェアハウスに直接作用する書き込み系操作 |
| Codegen tools | generate_model_yaml 等。Local MCP のみ、デフォルト無効。モデル YAML・ソース定義を自動生成 |
| Admin API tools | trigger_job_run / cancel_job_run 等。dbt Cloud のジョブを管理するリモート操作 |

##### 制御層

| 要素名 | 説明 |
|--------|------|
| 認証・スコープ制御 | service token (SL / Discovery / Admin) と PAT (execute_sql 必須) および Remote MCP の OAuth によるアクセス制御 |
| toolset 有効-無効制御 | DISABLE_x (大半は既定 false、DISABLE_SQL / DISABLE_DBT_CODEGEN / DISABLE_MCP_SERVER_METADATA のみ既定 true) と DBT_MCP_ENABLE_x (allowlist) の優先順位制御 |

#### Semantic Layer コンポーネント

```mermaid
graph TB
  MCPClient["dbt MCP server<br/>SL tools query_metrics 等"]
  BITool["BI ツール - Insights UI"]

  subgraph SemanticLayer["dbt Semantic Layer<br/>Cloud-only Starter 以上"]
    SLAPI["SL APIs<br/>GraphQL - JDBC - Python SDK"]
    ServiceLayer["Service layer<br/>クエリ調整・dispatch"]
    MetricFlow["MetricFlow<br/>SQL 生成・join 解決"]
    Gateway["Gateway service<br/>SQL 実行・WH 接続"]
    subgraph Definitions["定義層 dbt project"]
      SemanticModels["Semantic Models<br/>Entities - Dimensions - Measures"]
      MetricDefs["Metric 定義<br/>simple - cumulative - derived<br/>ratio - conversion"]
      SavedQueries["Saved Queries"]
    end
  end

  WH[("データウェアハウス")]

  MCPClient -->|GraphQL createQuery| SLAPI
  BITool -->|JDBC - GraphQL - SDK| SLAPI
  SLAPI -->|クエリ調整| ServiceLayer
  ServiceLayer -->|SQL 生成要求| MetricFlow
  MetricFlow -->|join 解決・決定論的 SQL| Gateway
  MetricFlow -.->|定義参照| Definitions
  Gateway -->|SQL 実行| WH
  WH -->|rows| Gateway
  Gateway -->|jsonResult - arrowResult - sql| SLAPI
  SLAPI -->|QueryResult polling| MCPClient
```

##### SL APIs

| 要素名 | 説明 |
|--------|------|
| GraphQL API | エージェント・BI ツールの主要接続口。createQuery で queryId を取得し query(queryId) で結果を非同期ポーリング。リージョン別エンドポイント |
| JDBC API | BI ツール向け標準メタデータ機能付きドライバ接続 |
| Python SDK | Python 環境からのプログラマティックアクセス |

##### 実行層

| 要素名 | 説明 |
|--------|------|
| Service layer | クエリリクエストを調整し MetricFlow への dispatch を担うコーディネーター。Gateway service を内包。dbt 1.6+ / Cloud 専有 (Starter 以上) |
| MetricFlow | Semantic Model と Metric 定義 (5 種) を参照し、join を自動解決して決定論的 SQL を生成するエンジン (ライセンスは特徴・反証節を参照) |
| Gateway service | MetricFlow が生成した SQL をウェアハウスに対して実行し結果を返す実行層 |

##### 定義層

| 要素名 | 説明 |
|--------|------|
| Semantic Models | Entities (ビジネスオブジェクト) / Dimensions (属性) / Measures (集約対象量) を YAML で定義する構造単位 |
| Metric 定義 | simple / cumulative / derived / ratio / conversion の 5 種。既存 semantic model の measures を参照し cross-metric 計算も可能 |
| Saved Queries | 再利用可能なクエリ定義。list_saved_queries tool で列挙される |

## データ

### 概念モデル

```mermaid
graph TD
  subgraph quality["データ品質・ガバナンス層"]
    Source["Source"]
    Model["Model"]
    Contract["Contract"]
    Test["Test"]
    ColumnLineage["Column-Lineage"]
  end

  subgraph semantic["セマンティック層"]
    SemanticModel["Semantic Model"]
    Entity["Entity"]
    Dimension["Dimension"]
    Measure["Measure"]
    Metric["Metric"]
    SavedQuery["Saved Query"]
  end

  subgraph agent["エージェント接続層"]
    AgentsSchema["Agents Schema"]
    MCPTool["MCP Tool"]
  end

  Source -->|変換| Model
  Model -->|定義保証| Contract
  Model -->|品質検証| Test
  Model -->|列追跡| ColumnLineage

  Model -->|意味付け| SemanticModel
  SemanticModel -->|join キー| Entity
  SemanticModel -->|属性| Dimension
  SemanticModel -->|集約量| Measure
  Measure -->|参照| Metric
  Metric -->|クエリ定義| SavedQuery

  SemanticModel -->|コンテキスト提供| AgentsSchema
  Contract -->|コンテキスト提供| AgentsSchema
  Test -->|コンテキスト提供| AgentsSchema
  ColumnLineage -->|コンテキスト提供| AgentsSchema

  AgentsSchema -->|公開| MCPTool
  Metric -->|公開| MCPTool
  SavedQuery -->|公開| MCPTool
  Model -->|公開| MCPTool
```

| 要素名 | 説明 |
|--------|------|
| Source | Fivetran 等が取り込む生データの定義。freshness 閾値を持つ |
| Model | dbt が変換した中間/最終テーブル定義 |
| Contract | Model のカラム名・型・制約の宣言 (shape の保証) |
| Test | Model の content を検証するアサーション |
| Column-Lineage | カラム単位の来歴 (どの上流カラムから派生したか) |
| Semantic Model | Model に意味を付与する構造単位 (Entities/Dimensions/Measures) |
| Entity / Dimension / Measure | join キー / 属性 / 集約対象量 |
| Metric | Measure を参照する指標定義 (5 種) |
| Saved Query | 再利用可能なクエリ定義 |
| Agents Schema | 上記コンテキストを SQL テーブルとして束ねる共有層 |
| MCP Tool | エージェントに公開される操作単位 |

### 情報モデル

```mermaid
classDiagram
  class Source {
    name : string
    database : string
    schema : string
    freshness_warn_after : string
    freshness_error_after : string
    loaded_at_field : string
  }
  class Model {
    name : string
    materialized : string
    schema : string
    compiled_sql : string
    description : string
    unique_id : string
  }
  class Contract {
    enforced : boolean
    alias_types : boolean
    columns : list
    constraints : list
  }
  class Test {
    test_type : string
    column_name : string
    severity : string
    status : string
    unique_id : string
  }
  class ColumnLineage {
    column_name : string
    source_columns : list
    transform_type : string
    description : string
  }
  class SemanticModel {
    name : string
    model_ref : string
    description : string
  }
  class Entity {
    name : string
    entity_type : string
    expr : string
  }
  class Dimension {
    name : string
    dim_type : string
    expr : string
    is_partition : string
  }
  class Measure {
    name : string
    agg : string
    expr : string
    agg_time_dimension : string
    non_additive_dimension : string
  }
  class Metric {
    name : string
    metric_type : string
    label : string
    filter : string
    input_metrics : list
    window : string
    numerator : string
    denominator : string
  }
  class SavedQuery {
    name : string
    description : string
    metrics : list
    group_by : list
    where : list
    order_by : list
  }
  class AgentsSchema {
    name : string
    version : string
    description : string
    resources : list
  }
  class MCPTool {
    tool_name : string
    category : string
    access_mode : string
    description : string
  }

  Source "1" --> "many" Model : 変換元
  Model "1" --> "0..1" Contract : 持つ
  Model "1" --> "many" Test : 検証される
  Model "1" --> "many" ColumnLineage : 列追跡される
  Model "1" --> "0..1" SemanticModel : 意味付けられる
  SemanticModel "1" --> "many" Entity : 持つ
  SemanticModel "1" --> "many" Dimension : 持つ
  SemanticModel "1" --> "many" Measure : 持つ
  Measure "many" --> "many" Metric : 参照される
  Metric "many" --> "many" SavedQuery : クエリ化される
  SemanticModel "many" --> "1" AgentsSchema : 含まれる
  Contract "many" --> "1" AgentsSchema : 含まれる
  Test "many" --> "1" AgentsSchema : 含まれる
  ColumnLineage "many" --> "1" AgentsSchema : 含まれる
  AgentsSchema "1" --> "many" MCPTool : 公開される
  Metric "many" --> "many" MCPTool : 公開される
  SavedQuery "many" --> "many" MCPTool : 公開される
  Model "many" --> "many" MCPTool : 公開される
```

## 構築方法

### 前提条件

共通の前提は次の通りです。

- dbt Cloud アカウント (Starter 以上)
- Semantic Layer / Discovery API 利用は Team / Enterprise プランが必要
- execute_sql / Fusion tools 利用は Personal Access Token (PAT) が別途必要

Local MCP は追加で uv のインストール、ローカルの dbt プロジェクト (`dbt_project.yml`)、dbt CLI のローカルインストールが必要です。Remote MCP はローカルインストール不要で、dbt platform の AI 機能が有効である必要があります。

### Local MCP server のセットアップ

ローカルマシンで `uvx dbt-mcp` を起動し、MCP プロトコルで AI エージェントと通信する形態です。dbt CLI コマンドを含む全 toolset が利用できます。

```bash
uvx dbt-mcp
# 正常起動したら Ctrl+C で停止
```

Claude Code 設定例 (`.mcp.json`、dbt platform 併用) は次の通りです。

```json
{
  "mcpServers": {
    "dbt": {
      "command": "uvx",
      "args": ["dbt-mcp"],
      "env": {
        "DBT_PROJECT_DIR": "/Users/yourname/projects/my_dbt_project",
        "DBT_PATH": "/opt/homebrew/bin/dbt",
        "DBT_HOST": "abc123.us1.dbt.com",
        "DBT_TOKEN": "YOUR_SERVICE_OR_PAT_TOKEN",
        "DBT_PROD_ENV_ID": "123456",
        "DBT_DEV_ENV_ID": "789012",
        "DBT_USER_ID": "42",
        "DBT_ACCOUNT_ID": "9999"
      }
    }
  }
}
```

`claude mcp add` コマンドでも設定できます。

```bash
claude mcp add dbt \
  -e DBT_PROJECT_DIR=/Users/yourname/projects/my_dbt_project \
  -e DBT_PATH=/opt/homebrew/bin/dbt \
  -- uvx dbt-mcp
```

### Remote MCP server のセットアップ

ローカルインストール不要で dbt platform への HTTP 接続のみで動作します。Semantic Layer / SQL / Discovery / Admin API / Fusion の各 toolset は Remote でも利用でき、Local 専用は dbt CLI コマンドと Codegen tools のみです。エンドポイント URL は Account settings の Access URLs から取得、または `https://YOUR_DBT_HOST_URL/api/ai/v1/mcp/` の形式で構築します。

Claude Code 設定例 (Token 認証) は次の通りです。

```json
{
  "mcpServers": {
    "dbt": {
      "type": "http",
      "url": "https://YOUR_DBT_HOST_URL/api/ai/v1/mcp/",
      "headers": {
        "Authorization": "Token YOUR_DBT_ACCESS_TOKEN",
        "x-dbt-prod-environment-id": "123456",
        "x-dbt-user-id": "42",
        "x-dbt-dev-environment-id": "789012"
      }
    }
  }
}
```

OAuth (Enterprise / Enterprise+、private beta) では url のみ指定し、初回接続でブラウザサインインと同意画面を経ます。多くの MCP クライアントは RFC 7591 dynamic registration に対応します。

### 必要な環境変数一覧

Local CLI 変数は次の通りです。

| 変数名 | 必須 | 既定値 | 説明 |
|--------|------|--------|------|
| DBT_PROJECT_DIR | 必須 | なし | `dbt_project.yml` の絶対パス |
| DBT_PATH | 必須 | なし | dbt 実行ファイルの絶対パス |
| DBT_PROFILES_DIR | 任意 | `~/.dbt/` | `profiles.yml` の格納ディレクトリ |
| DBT_CLI_TIMEOUT | 任意 | 60 | dbt CLI コマンドのタイムアウト秒数 |

dbt Platform 接続変数は次の通りです。

| 変数名 | 必須 | 説明 |
|--------|------|------|
| DBT_HOST | 必須 | dbt platform のホスト名 |
| DBT_TOKEN | 必須 | サービストークンまたは PAT (execute_sql は PAT 必須) |
| DBT_PROD_ENV_ID | 必須 | 本番環境 ID |
| DBT_DEV_ENV_ID | execute_sql / Fusion に必須 | 開発環境 ID |
| DBT_USER_ID | execute_sql / Fusion に必須 | ユーザー ID |
| DBT_ACCOUNT_ID | Admin API + PAT 認証時に必須 | アカウント ID |

Semantic Layer チューニング変数として、`DBT_MCP_SL_METRICS_RELATED_MAX` (既定 10) と `DBT_MCP_SL_MAX_RESPONSE_CHARS` (既定 16000) があります。

## 利用方法

### API / ツール 必須パラメータ早見表

| ツール / API | 必須パラメータ | 補足 |
|-------------|--------------|------|
| list_metrics | なし | 環境は env で設定済み |
| get_dimensions | metrics | 指定 metric で使える dimension 一覧 |
| get_entities | metrics | 指定 metric で使える entity 一覧 |
| query_metrics | metrics | group_by / where / order / limit は任意 |
| get_metrics_compiled_sql | metrics | SQL 生成のみ・実行なし |
| execute_sql | SQL + PAT + DBT_DEV_ENV_ID + DBT_USER_ID | Raw SQL を gateway で実行 |
| createQuery (GraphQL) | environmentId, metrics | Semantic Layer mutation |
| query (GraphQL) | environmentId, queryId | createQuery の queryId でポーリング |

### エージェントの指標取得フロー

AI エージェントが MCP ツールを通じて指標を取得する典型シーケンスは 3 ステップです。

```
1. list_metrics()
   → [{ name: "monthly_revenue" }, { name: "order_count" }, ...]

2. get_dimensions(metrics=[{ name: "monthly_revenue" }])
   → [{ name: "metric_time" }, { name: "region" }, ...]

3. query_metrics(
     metrics=[{ name: "monthly_revenue" }],
     group_by=[{ name: "region" }, { name: "metric_time", grain: MONTH }],
     where=[{ sql: "{{ Dimension('customer__customer_segment') }} = 'enterprise'" }],
     limit=12
   )
   → { jsonResult: [...], sql: "SELECT ...", status: "SUCCESSFUL" }
```

内部では Semantic Layer API の createQuery から query(queryId) のポーリングが行われ、MetricFlow が join を含む SQL を生成し、Gateway service がウェアハウスで実行します。実行せず生成 SQL のみを確認したい場合は get_metrics_compiled_sql を使い、監査・レビュー用途に適します。

### Semantic Layer GraphQL API

MCP ツールを介さず外部システムから直接呼び出す場合のインタフェースです。エンドポイントはリージョン別 (例: NA は `https://semantic-layer.cloud.getdbt.com/api/graphql`)、認証は `Authorization: Bearer <SERVICE_TOKEN_OR_PAT>`、各リクエストに environmentId が必須です。

クエリ生成 mutation は次の通りです。

```graphql
mutation CreateRevenueQuery {
  createQuery(
    environmentId: 123456
    metrics: [{ name: "monthly_revenue" }]
    groupBy: [{ name: "metric_time", grain: MONTH }, { name: "region" }]
    where: [{ sql: "{{ Dimension('customer__customer_segment') }} = 'enterprise'" }]
    order: [{ groupBy: { name: "metric_time", grain: MONTH }, descending: true }]
    limit: 12
  ) {
    queryId
  }
}
```

結果取得は非同期ポーリングです。

```graphql
query PollResult {
  query(environmentId: 123456, queryId: "QueryID_abc123") {
    sql
    status
    error
    jsonResult(orient: TABLE, encoded: true)
    arrowResult
  }
}
```

status が SUCCESSFUL または FAILED になるまでポーリングします。`WhereInput.sql` では Jinja テンプレート (`{{ Dimension(...) }}` / `{{ TimeDimension(...) }}` / `{{ Metric(...) }}`) を使用します。

### semantic model / metric の YAML 定義例

MetricFlow による semantic model と metric の定義例です。ratio metric の numerator / denominator は metric 名を参照します。

```yaml
semantic_models:
  - name: orders
    model: ref('orders')
    defaults:
      agg_time_dimension: ordered_at
    entities:
      - name: order
        type: primary
        expr: order_id
      - name: customer
        type: foreign
        expr: customer_id
    dimensions:
      - name: ordered_at
        type: time
        type_params:
          time_granularity: day
      - name: order_status
        type: categorical
    measures:
      - name: order_total
        agg: sum
        expr: order_amount
      - name: order_count
        agg: count
        expr: order_id

metrics:
  - name: total_revenue
    type: simple
    type_params:
      measure: order_total

  - name: total_orders
    type: simple
    type_params:
      measure: order_count

  - name: revenue_per_order
    type: ratio
    type_params:
      numerator: total_revenue
      denominator: total_orders
```

### read-only 化の設定

dbt MCP に明示的な read-only フラグは存在しません。`DISABLE_x` (true で無効化) と `DBT_MCP_ENABLE_x` (allowlist) の組み合わせで権限を絞ります。`DISABLE_SQL` / `DISABLE_DBT_CODEGEN` / `DISABLE_MCP_SERVER_METADATA` は既定で true (無効) です。

Semantic Layer と Discovery のみを許可し書き込み系を閉じる構成例は次の通りです。

```json
{
  "env": {
    "DBT_HOST": "cloud.getdbt.com",
    "DBT_TOKEN": "YOUR_SERVICE_TOKEN",
    "DBT_PROD_ENV_ID": "123456",
    "DISABLE_DBT_CLI": "true",
    "DISABLE_ADMIN_API": "true",
    "DISABLE_SQL": "true",
    "DISABLE_DBT_CODEGEN": "true"
  }
}
```

優先順位は高い順に `DBT_MCP_ENABLE_TOOLS` から `DISABLE_TOOLS`、toolset enable、toolset disable、default です。空の `DBT_MCP_ENABLE_x=` は他全 toolset を黙って無効化するため注意します。

## 運用

### dbt MCP クレジット消費と遮断

text_to_sql のみが dbt Wizard クレジットを消費します。Semantic Layer クエリ・Discovery ツール・Admin API ツールはクレジットを消費しません (一次: docs.getdbt.com/docs/dbt-ai/about-mcp)。クレジット枯渇時は Remote MCP 経由の全ツールが遮断され、ローカル MCP から Remote にプロキシされるツール (SQL 実行・Remote Fusion) も停止します。ad hoc 分析ループで text_to_sql を繰り返すとクレジットが急減するため、Semantic Layer 経由 (query_metrics) に切り替えることで消費をゼロにできます。

### Semantic Layer クエリのレイテンシ

クエリパスは「MCP クライアントから dbt MCP server、SL GraphQL API、Service layer、MetricFlow、Gateway、ウェアハウス」と多段になります。warehouse 直 SQL に比べホップ数が増える分、レイテンシのオーバーヘッドは避けられません。GraphQL は createQuery から query(queryId) の非同期ポーリング構造のため、短時間クエリでもポーリング往復が加わります。高頻度・低レイテンシ要件がある場合は metric を事前 materialize した dbt モデルを参照する設計も選択肢です (鮮度とコストのトレードオフあり)。`DBT_MCP_SL_MAX_RESPONSE_CHARS` / `DBT_MCP_SL_METRICS_RELATED_MAX` で応答サイズを絞れます。

### freshness と incremental によるデータ現行性の維持

dbt MCP は freshness 情報を公開しており、get_model_health で run status・テスト結果・上流 source freshness を一括取得できます。incremental モデルは全行を毎回 rebuild せず新規・変更行だけを処理し、大規模テーブルでも低コスト・高頻度に最新化を維持します。「古いデータで誤答する」問題の緩和に寄与します。ただし incremental はエージェントの誤りを直接防ぐというより基盤の運用効率 (鮮度とコスト) を支える位置づけで、lineage・contract・test・semantic layer とは役割が異なります。

## ベストプラクティス

### エージェント権限は read-only から始める

1. `DISABLE_DBT_CLI=true` でモデルの build/run/test を封じる。
2. Admin API のジョブ操作が不要なら `DISABLE_ADMIN_API=true`。
3. SQL 書き込みリスクが不安なら `DISABLE_SQL=true` (既定値は true)。
4. `DBT_MCP_ENABLE_x` allowlist 方式で明示したツールセット以外を全遮断する。
5. service token に最小権限スコープ (Semantic Layer 読み取り・Discovery 読み取りのみ) を付与する。
6. Remote MCP (consumption-only) はローカル CLI ツールが存在せず、書き込み誤実行リスクが低い。

エージェントは人が止める異常を止めない (Fivetran 一次) ことを前提に、書き込み権限は人間の承認フローを経てから付与します。

### 正確性が要る指標は Semantic Layer 経由、探索は text-to-SQL

board data・監査・OKR・KPI・週次レポート等、数値の正確性と再現性が必須の場面は Semantic Layer 経由を使います。MetricFlow が deterministic に SQL を生成します。未モデル化データの探索・仮説検証の初回クエリ・スキーマ把握は text-to-SQL (ad hoc 探索) を使い、もっともらしいが誤った答えが返る可能性を念頭に置きます。推奨ワークフローとして、ad hoc で答えが重要と判明したら最小の dbt モデルを作成し Semantic Layer に組み込みます。dbt 公式実験では 3 モデル追加でカバレッジが 72.7% から 100% に拡大しました。

### AI の前に metric と test を最優先で整える

優先順位の目安は次の通りです。

1. 主要ビジネス指標の metric 定義 (Semantic Layer)
2. primary key の unique と not_null test、参照整合性 (relationships) test
3. data contract (スキーマの breaking change 検出)
4. freshness SLA の設定と監視
5. その後に AI エージェントを接続

dbt ADE-bench の最難問は、コードが正しくてもデータを実際にクエリしないと解けない問題でした (join を壊す bad value・不可能な数値・誤った WHERE 条件等)。これらは test が整っていなければエージェントがそのまま使ってしまいます。

### ロックインを採用判断に織り込む

ライセンス区分の確認が必要です。dbt Fusion (Platform 側の proprietary distribution) は ELv2 (無料だが OSI 非承認)、MetricFlow は公式 licenses-faq の BSL 表記と最新発表の Apache-2.0 化で情報が分かれており要確認、dbt Core は Apache-2.0 据え置きですが「将来ビジョンは Core でなく Fusion」と公言され開発投資の重点移行リスクがあります (二次情報: tobikodata.com, driftwave.io, getdbt.com/licenses-faq)。価格面では、競合ベンダー Nexla は Fivetran が 2025 年に一部顧客で価格を 4〜8 倍に引き上げたと主張する一方、Fivetran 公式は大多数のユーザーで値下げになると説明しており、評価は分かれます (二次情報: nexla.com, techtarget.com, fivetran.com)。ingestion と transformation を 1 ベンダーで統合すると切り替えコストが増大するため、Databricks Metric Views や Snowflake Semantic Views など warehouse-native の代替が自社スタックに合うかを先行評価します。

### Semantic Layer 採用コストを踏まえた段階導入

dbt native チームでも Semantic Layer の採用率は 18% との分析があります (算出母集団・基準は要確認の未検証試算、二次情報: typedef.ai)。コスト試算の一例 (100 人チーム) は SaaS $50K/年 + エンジニア $15K/年 = $65K/年です (同上、算出方法は要確認)。段階導入の推奨は次の通りです。

1. unique と not_null test + primary key contract を全主要モデルに整備する (低コスト・高効果)。
2. 問い合わせ頻度が高い 3〜5 指標を MetricFlow で定義する。
3. AI 精度・運用コストを検証してから範囲を拡大する。
4. SL 外の ad hoc は text-to-SQL で補い、有用な答えを順次モデル化する。

## トラブルシューティング

| 症状 | 主な原因 | 対処 |
|------|----------|------|
| もっともらしいが誤った答えが返る | text-to-SQL が誤った join や集計を生成。LLM がビジネス定義を知らない | 問題の指標を Semantic Layer に移し query_metrics 経由にする。一時対処は get_metrics_compiled_sql で生成 SQL を目視確認 |
| 同じ質問で実行ごとに数値が微妙に違う | LLM が確率的に異なる SQL を生成 | Semantic Layer 経由に切り替える。MetricFlow のロジックは固定され再現性を持つ |
| 指標定義が部門ごとに揺れる (metric drift) | 指標が各 BI ツールや SQL に分散定義 | MetricFlow で YAML 定義を一元化。変更は全ツール・全エージェントに即伝播する |
| 古いデータで誤答する (stale) | incremental ジョブの失敗・遅延、freshness SLA 未設定 | get_model_health で上流 source の freshness を確認。閾値を yml で設定し超過 source を通知する |
| MCP ツールが突然全滅する | text_to_sql のクレジット枯渇による Remote MCP 全遮断 | 請求画面でクレジット残量を確認。text_to_sql を query_metrics で代替。緊急時はローカル MCP に切替 |
| contract を設定したのに上流の論理変更を検出できない | dbt contract は構造 (shape) のみ検証し SQL ロジック変更は検出しない | ロジック変化は dbt test のカスタムテストや期待値テストで補う。contract は breaking schema change 検出の補助と位置づける |
| contract の YAML が古くなり build が頻繁に落ちる | YAML が業務ロジックの変化に追随せず drift | 必須カラムのみを contract に含め補助カラムは test で検証。CI でスキーマ実態と自動比較する |
| Semantic Layer 経由のクエリが遅い | GraphQL 非同期ポーリング + SQL 生成 + Gateway 実行の多段レイテンシ | 高頻度クエリは metric を materialize した dbt モデルを直接参照。応答サイズを env で削減 |
| Semantic Layer が AI 品質の rate limiter になる | SL に定義されていない概念を聞かれて答えられない。定義が弱い・不完全 | SL の coverage と定義精度を上げる。SL 外の問いは text-to-SQL + 結果検証にフォールバックし有用な答えはモデル化 |
| エージェントが存在しない accepted_values を返す | LLM が実データを確認せず値を推測 | dbt agent skills のように test を書く前に execute_sql で実データを preview させる |

## まとめ

Fivetran+dbt が掲げる「信頼できる AI エージェント向けデータ基盤」の本質は、AI にクエリを書かせる前に lineage / contract / test / semantic layer / metric を整え、dbt MCP server を governed control layer としてエージェントに read-only から接続することにあります。一方でライセンスのロックインや Semantic Layer の採用コストは無視できず、「特定ベンダー束を常に先に整えるべき」という普遍命題は規模と文脈に依存する条件付きの主張として捉えるのが妥当です。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！

## 参考リンク

- 公式ドキュメント (dbt / Fivetran / Snowflake / Databricks)
  - [dbt docs: About dbt MCP server](https://docs.getdbt.com/docs/dbt-ai/about-mcp)
  - [dbt docs: Available MCP tools](https://docs.getdbt.com/docs/dbt-ai/mcp-available-tools)
  - [dbt docs: MCP environment variables](https://docs.getdbt.com/docs/dbt-ai/mcp-environment-variables)
  - [dbt docs: Remote MCP quickstart](https://docs.getdbt.com/docs/dbt-ai/mcp-quickstart-remote)
  - [dbt docs: Semantic Layer overview](https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl)
  - [dbt docs: Semantic Layer architecture](https://docs.getdbt.com/docs/use-dbt-semantic-layer/sl-architecture)
  - [dbt docs: Semantic Layer GraphQL API](https://docs.getdbt.com/docs/dbt-cloud-apis/sl-graphql)
  - [dbt docs: MetricFlow metrics overview](https://docs.getdbt.com/docs/build/metrics-overview)
  - [dbt docs: Model contracts](https://docs.getdbt.com/docs/mesh/govern/model-contracts)
  - [dbt docs: Column-level lineage](https://docs.getdbt.com/docs/explore/column-level-lineage)
  - [dbt docs: About dbt AI and intelligence](https://docs.getdbt.com/docs/dbt-ai/about-dbt-ai)
  - [dbt docs: About dbt Copilot (Wizard)](https://docs.getdbt.com/docs/cloud/dbt-copilot)
  - [dbt blog: Semantic Layer vs text-to-SQL (2026)](https://docs.getdbt.com/blog/semantic-layer-vs-text-to-sql-2026)
  - [dbt blog: Building a better data agent benchmark](https://docs.getdbt.com/blog/building-a-better-data-agent-benchmark)
  - [Fivetran: Agentic AI Readiness Index 2026](https://www.fivetran.com/blog/85-of-enterprises-are-running-agentic-ai-on-a-data-foundation-that-isnt-ready)
  - [Fivetran + dbt Labs merger](https://www.fivetran.com/fivetran-dbt-labs-merger)
  - [Snowflake: dbt Fusion Is Now Available on Snowflake](https://www.snowflake.com/en/blog/dbt-fusion-available-snowflake/)
  - [Databricks: Governing AI agents at scale with Unity Catalog](https://www.databricks.com/blog/governing-ai-agents-scale-unity-catalog)
- GitHub
  - [dbt-labs/dbt-mcp](https://github.com/dbt-labs/dbt-mcp)
  - [dbt-core#14395: Model Contracts EPIC (open)](https://github.com/dbt-labs/dbt-core/issues/14395)
  - [dbt-core#11997: Semantic Layer YAML EPIC (open)](https://github.com/dbt-labs/dbt-core/issues/11997)
- 解説・批判・プレス
  - [Business Wire: Fivetran + dbt Labs Complete Merger (2026-06-01)](https://www.businesswire.com/news/home/20260601514374/)
  - [TechTarget: complete merger to form data layer for AI](https://www.techtarget.com/searchdatamanagement/news/366643590/Fivetran-DBT-Labs-complete-merger-to-form-data-layer-for-AI)
  - [Techzine: data infrastructure for reliable agentic AI](https://www.techzine.eu/news/analytics/141758/fivetran-and-dbt-labs-complete-merger-data-infrastructure-for-reliable-agentic-ai/)
  - [Tobiko: The False Promise of dbt Contracts](https://www.tobikodata.com/blog/the-false-promise-of-dbt-contracts)
  - [Tobiko: Is dbt Fusion the death of dbt Core?](https://www.tobikodata.com/blog/dbt-fusion-death-of-dbt-core)
  - [typedef.ai: Semantic Layer Architectures](https://www.typedef.ai/resources/semantic-layer-architectures-explained-warehouse-native-vs-dbt-vs-cube)
  - [Datacoves: dbt + Fivetran Merger Risks](https://datacoves.com/post/dbt-fivetran)
