---
title: "技術調査 - Agents Schema"
emoji: "🗂️"
type: "tech"
topics: ["Snowflake", "dbt", "LookML", "Metadata", "LLM"]
published: false
---

> 調査対象: Agents Schema (Fivetran / Open Data Infrastructure) — GitHub `fivetran/agents_schema`
> ライセンス: MIT / 調査時点の最新リリース: v0.0.6（2026-04 リポジトリ公開、Development Status: Alpha）/ 対応 destination: Snowflake のみ
> 調査日: 2026-06-04

## 概要

Agents Schema は、AI エージェントがウェアハウスデータを正確にクエリするために必要なコンテキストを、ウェアハウス内の標準スキーマ `AGENTS` として提供する OSS 標準です。Fivetran, Inc. が開発・維持し、Open Data Infrastructure (ODI) イニシアティブのもとで公開されています。

位置づけは「コードリポジトリにおける `AGENTS.md` のデータ版」です。コードリポジトリに `AGENTS.md` を置いてエージェントにプロジェクト理解を与えるように、データウェアハウスに `AGENTS` スキーマを置いてエージェントにデータ理解を与えます。

主な対象は、dbt や Snowflake を運用しつつ、AI エージェントに社内データを触らせ始めたチームです。メトリクス定義やフィルタ条件をエージェントが推測してしまう問題に、ウェアハウス内のメタデータで答えを与えます。

### 解決する課題

エージェントはテーブルスキーマだけでは不十分なコンテキスト、すなわち「テーブルの用途・管理者・変換元・クエリコスト・他テーブルとの関係」を必要とします。この情報は従来、wiki・Slack スレッド・ダッシュボード・暗黙知として分散していました。エージェントはそれらを収集する手段を持たないため、metric 定義・フィルタ・スキーマを推測して誤クエリを生みます。

Agents Schema はこれらのコンテキストをウェアハウス内に集約し、エージェントがクエリインターフェースから離れずに参照できる単一の標準場所を提供します。

### 用途

次の用途に特化した consumer-facing な discovery layer です。

- どのキュレーションテーブル・セマンティックオブジェクトが存在するか
- どのシステムがメタデータを提供しているか
- dbt モデル・LookML オブジェクト・OSI セマンティックモデルがどのデータセットを裏づけているか
- ソースが陳腐化していないか、データプロダクトのオーナーは誰か

Agents Schema は専門システム・ソースネイティブ API・開発時ツールの代替ではありません。dbt MCP server のように dbt リポジトリを編集するエージェントは引き続きソースファイル・アーティファクトを直接使います。Agents Schema はウェアハウスを起点として既存データのコンテキストを得る consumer 用途に限定されます。

## 特徴

- **オープン形式・オープンソース・オープンコネクタ**: 仕様 (SPEC.md)・CLI・GitHub Actions ワークフローを MIT ライセンスで公開します。
- **メタデータのみ、データ移動なし**: ビジネスデータはウェアハウスに留まり、メタデータ（モデル定義・カラム説明・依存関係・セマンティック定義）だけを `AGENTS` スキーマに書き込みます。
- **SQL で直接クエリ可能**: `SELECT` 文でアクセスできるため、Cursor・Claude Code・ノートブック・内製エージェントなど、ウェアハウスに接続できるあらゆるツールが追加設定なしで読めます。
- **自己文書化する `AGENTS.ROOT`**: provider registry として機能し、どの provider が何のテーブルを提供しているかを consumer が最初に参照できます。
- **ソース別テーブルファミリー**: dbt・LookML・OSI を独立したテーブル群として提供し、各 source の ingestion が自分のファミリーだけを管理します。
- **`CREATE OR REPLACE` による冪等な再生成**: 各インジェスト実行はテーブルファミリーを丸ごと置き換えるため、再実行で状態が一意に確定します。consumer はこれらを手編集不可の生成メタデータとして扱います。
- **クロスソースクエリ**: `LOOKML_VIEW` と `DBT_MODEL` を結合するなど、複数 provider のテーブルを JOIN して横断的な文脈を得られます。
- **GitHub Actions ネイティブ**: 既存リポジトリに reusable workflow を数行追加するだけで CI/CD パイプラインとして動作し、プロジェクト変更のたびに `AGENTS` を自動更新できます。

### 隣接技術との比較

| 比較軸 | Agents Schema | `information_schema` | MCP サーバー | セマンティックレイヤー本体 | dbt MCP server / ソースネイティブ API |
|---|---|---|---|---|---|
| 配置場所 | warehouse 内 (`AGENTS` スキーマ) | warehouse 内 (標準スキーマ) | warehouse 外 (エージェント実行環境) | warehouse 外 (専用サービス / ファイル) | warehouse 外 (開発環境 / CI/CD) |
| アクセス方法 | SQL (`SELECT`) | SQL (`SELECT`) | 専用 API / ツール呼び出し | GraphQL / JDBC / SDK | 専用 CLI / REST API |
| provider 横断性 | 複数 provider を統合 | 単一 warehouse の物理メタデータのみ | provider 依存 | 単一ツールのエコシステム内 | ツール固有 |
| 主な用途 | consumer discovery | DDL 構造確認・内部処理 | tools / actions の公開 | BI 向けメトリクス一元管理 | 開発時の編集・テスト・リネージ |
| データ移動 | なし (メタデータのみ) | なし | なし (ツール経由) | クエリ委譲 | なし |
| 再生成方式 | `CREATE OR REPLACE` (冪等) | warehouse が自動管理 | — | ソース変更で反映 | ソース変更で反映 |

公式 README は次のように位置づけます。

> "It is closest in spirit to `information_schema`, but extensible across many providers. Compared with MCP servers, Agents Schema is narrower: it publishes context inside the warehouse, while MCP servers can expose tools, actions, and source-specific workflows."

### ユースケース別の参照テーブル

| ユースケース | 参照テーブル |
|---|---|
| 利用可能なメタデータ provider の一覧確認 | `AGENTS.ROOT` |
| MRR・ARR などのメトリクス定義取得 | `AGENTS.OSI_METRIC` / `AGENTS.LOOKML_MEASURE` |
| dbt モデルの用途・スキーマ・タグ確認 | `AGENTS.DBT_MODEL` |
| カラムの意味・型の確認 | `AGENTS.DBT_COLUMN` |
| dbt DAG の依存を再帰トレース | `AGENTS.DBT_DEPENDENCY` |
| BI 向けの explore・view の把握 | `AGENTS.LOOKML_EXPLORE` / `AGENTS.LOOKML_VIEW` |
| セマンティックモデルの dataset・関係確認 | `AGENTS.OSI_DATASET` / `AGENTS.OSI_RELATIONSHIP` |
| LookML view と dbt model の対応付け | `AGENTS.LOOKML_VIEW` JOIN `AGENTS.DBT_MODEL` |

エージェント向けの差別化要素は `ai_context` 列です。LookML / OSI 由来のオブジェクトは `description`（人間向け説明）に加えて `ai_context`（エージェント向けの明示的な指示）を保持できます。たとえば「このメトリクスは必ず `currency_code` でフィルタする」「historical データのため当年ではなく最新年で集計する」といった制約を `ai_context` に書くと、エージェントは推測せずその指示に従えます。既存のセマンティックレイヤーが無い段階で OSI ファミリーから着手し、既に dbt / LookML を運用していればその provider をそのまま取り込む、という使い分けが自然です。

## 構造

C4 model の 3 段階で内部アーキテクチャを図解します。次は公式が示す全体フローです。

![Agents Schema 公式概要図。ソースリポジトリ → GitHub Actions → CLI → Snowflake AGENTS スキーマ → AI エージェントの流れを示す](/images/agents-schema_20260604/01_agents-schema-overview.png)

*出典: `fivetran/agents_schema` リポジトリ README（`assets/agents-schema-overview.png`）*

### システムコンテキスト図

```mermaid
graph TD
    DE["データエンジニア<br/>/ アナリティクスエンジニア"]
    AI["AI エージェント<br/>クライアント"]
    AS["Agents Schema<br/>システム"]
    SRC["メタデータソース<br/>dbt / LookML / OSI"]
    CI["CI/CD 基盤<br/>GitHub Actions"]
    WH["データウェアハウス<br/>Snowflake"]

    DE -->|"ワークフロー設定<br/>認証情報登録"| CI
    CI -->|"メタデータ取得トリガー"| AS
    SRC -->|"ソースファイル提供"| AS
    AS -->|"正規化メタデータ書き込み"| WH
    AI -->|"AGENTS テーブルを SQL で参照"| WH
```

#### 要素説明

| 要素名 | 説明 |
|---|---|
| データエンジニア / アナリティクスエンジニア | ワークフローを設定し `WAREHOUSE_CREDENTIALS` シークレットを登録する人間アクター。 |
| AI エージェント クライアント | `AGENTS.*` テーブルを SQL で読み取りデータの文脈を得る consumer。Cursor / Claude Code / Codex / ノートブック等が該当する。 |
| Agents Schema システム | メタデータを取り込み・正規化・書き込む本システム。本図ではブラックボックス扱い。 |
| メタデータソース | dbt project の `manifest.json`、LookML の `*.lkml`、OSI の `*.osi.yaml` を提供する外部リポジトリ。 |
| CI/CD 基盤 | GitHub Actions。ユーザーリポジトリのワークフローから reusable workflow を呼び出すオーケストレーター。 |
| データウェアハウス | Snowflake。`AGENTS` スキーマを保持する書き込み先かつクエリ先。 |

### コンテナ図

```mermaid
graph TD
    subgraph UserRepo["ユーザーリポジトリ"]
        UW["呼び出し元ワークフロー<br/>agents-schema-dbt.yml 等"]
    end

    subgraph AgentsSchemaSystem["Agents Schema システム"]
        RW["再利用可能ワークフロー<br/>agents-schema-dbt/looker/osi.yml"]
        ACT["Composite Action<br/>.github/actions 配下"]
        CLI["agents-schema CLI<br/>Python パッケージ"]
        DEST["Destination 層<br/>SnowflakeDestination"]
    end

    subgraph Warehouse["Snowflake ウェアハウス"]
        ROOT["AGENTS.ROOT<br/>プロバイダーレジストリ"]
        DBT["dbt テーブルファミリー<br/>DBT_MODEL / COLUMN / DEPENDENCY"]
        LKL["LookML テーブルファミリー<br/>LOOKML_VIEW / DIMENSION 等"]
        OSI["OSI テーブルファミリー<br/>OSI_DATASET / FIELD 等"]
    end

    SRC["メタデータソース<br/>manifest.json / lkml / osi.yaml"]

    UW -->|"uses: pinned tag で呼び出し"| RW
    RW -->|"checkout + 実行"| ACT
    ACT -->|"CLI 起動"| CLI
    SRC -->|"ファイル読み込み"| CLI
    CLI -->|"正規化データ渡し"| DEST
    DEST -->|"MERGE upsert"| ROOT
    DEST -->|"CREATE OR REPLACE / INSERT"| DBT
    DEST -->|"CREATE OR REPLACE / INSERT"| LKL
    DEST -->|"CREATE OR REPLACE / INSERT"| OSI
```

#### UserRepo サブグラフ

| 要素名 | 説明 |
|---|---|
| 呼び出し元ワークフロー | ユーザーリポジトリが配置する `.github/workflows/*.yml`。`uses:` 行に pinned tag を指定して reusable workflow を呼び出し、`WAREHOUSE_CREDENTIALS` シークレットを渡す。 |

#### AgentsSchemaSystem サブグラフ

| 要素名 | 説明 |
|---|---|
| 再利用可能ワークフロー | `fivetran/agents_schema` が提供する `agents-schema-dbt.yml` / `agents-schema-looker.yml` / `agents-schema-osi.yml`。`workflow_call` で公開される。 |
| Composite Action | `.github/actions/agents-schema-dbt` 等。リポジトリ checkout 後に呼ばれ、必要なら managed dbt parse で manifest を生成してから CLI を起動する。 |
| agents-schema CLI | `agents-schema` Python パッケージ。argparse サブコマンドでソースを選択し、メタデータを正規化する中心エンジン。 |
| Destination 層 | `SnowflakeDestination` クラス。SQL 生成と `snowflake.connector` 経由の書き込みを担う。 |

#### Warehouse サブグラフ

| 要素名 | 説明 |
|---|---|
| AGENTS.ROOT | プロバイダーレジストリ。各 source の ingestion が自身の行を MERGE で upsert し、他 provider の行は保持する。 |
| dbt テーブルファミリー | `AGENTS.DBT_MODEL` / `AGENTS.DBT_COLUMN` / `AGENTS.DBT_DEPENDENCY`。実行ごとに `CREATE OR REPLACE TABLE` + INSERT で全置換される。 |
| LookML テーブルファミリー | `AGENTS.LOOKML_VIEW` / `AGENTS.LOOKML_DIMENSION` / `AGENTS.LOOKML_MEASURE` / `AGENTS.LOOKML_EXPLORE`。 |
| OSI テーブルファミリー | `AGENTS.OSI_DATASET` / `AGENTS.OSI_FIELD` / `AGENTS.OSI_METRIC` / `AGENTS.OSI_RELATIONSHIP`。 |

### コンポーネント図

```mermaid
graph TD
    subgraph CLI["agents-schema CLI"]
        MAIN["cli.py<br/>argparse エントリポイント"]
        DBT_MOD["dbt.py<br/>manifest.json パーサー"]
        LKL_MOD["lookml.py<br/>lkml パーサー"]
        OSI_MOD["osi.py<br/>osi.yaml パーサー"]
        ROOT_MOD["root.py<br/>ROOT レジストリ"]
        DEST_MOD["destinations.py<br/>書き込みエンジン"]
        CFG["config.py<br/>設定バリデーター"]
        DBTPROF["dbt_profiles.py<br/>profiles パーサー"]
    end

    subgraph DestInternals["destinations.py 内部"]
        TS["TableSchema<br/>テーブル定義 dataclass"]
        COL["Column<br/>カラム定義 dataclass"]
        SD["SnowflakeDestination<br/>書き込みクラス"]
        CRED["warehouse_credentials_from_env<br/>認証情報パーサー"]
    end

    MAIN -->|"dbt サブコマンド"| DBT_MOD
    MAIN -->|"looker サブコマンド"| LKL_MOD
    MAIN -->|"osi サブコマンド"| OSI_MOD
    MAIN -->|"warehouse_type_from_env"| CRED
    DBT_MOD -->|"upsert_provider_root"| ROOT_MOD
    LKL_MOD -->|"upsert_provider_root"| ROOT_MOD
    OSI_MOD -->|"upsert_provider_root"| ROOT_MOD
    DBT_MOD -->|"open_destination"| SD
    LKL_MOD -->|"open_destination"| SD
    OSI_MOD -->|"open_destination"| SD
    ROOT_MOD -->|"upsert_rows ROOT"| SD
    DEST_MOD -->|"内部に実装"| SD
    TS -->|"カラムリスト保持"| COL
    SD -->|"TableSchema を受け取る"| TS
    SD -->|"JSON/YAML パース"| CRED
    CRED -->|"型検証"| CFG
    MAIN -->|"adapter-package サブコマンド"| DBTPROF
```

#### CLI サブグラフ

| 要素名 | 説明 |
|---|---|
| cli.py | `argparse` でサブコマンド `dbt` / `looker` / `osi` を定義し、対応モジュールの `run()` を呼び出す。 |
| dbt.py | `target/manifest.json` を読み込み、`resource_type=model` のノードを走査して `DBT_MODEL` / `DBT_COLUMN` / `DBT_DEPENDENCY` の行を生成する。 |
| lookml.py | `*.lkml` を再帰スキャンし、`view` / `explore` ブロックと内部の `dimension` / `dimension_group` / `measure` を解析して LookML 4 テーブルの行を生成する。 |
| osi.py | `*.osi.yaml` を読み込み、`semantic_model` オブジェクトから OSI 4 テーブルの行を生成する。 |
| root.py | `ROOT_ENTRIES` 辞書で provider 別の説明行を保持し、`upsert_provider_root()` が `AGENTS.ROOT` へ MERGE する。 |
| destinations.py | `TableSchema` / `Column` dataclass によるテーブル定義、`SnowflakeDestination` による SQL 生成・実行、認証情報読み込みを担う。 |
| config.py | `ConfigError` 例外と `SUPPORTED_WAREHOUSE_TYPES` 定数を提供する。 |
| dbt_profiles.py | `profiles.yml` から dbt アダプターパッケージ名を解決する補助モジュール。`agents-schema-dbt-adapter-package` サブコマンドが使用する。 |

#### destinations.py 内部

| 要素名 | 説明 |
|---|---|
| TableSchema | テーブル名・カラムリスト・主キーを保持する frozen dataclass。`array_indexes` プロパティで VARIANT カラムの位置を返す。 |
| Column | カラム名・型種別 (`varchar` / `text` / `boolean` / `array`)・nullable フラグを保持する frozen dataclass。 |
| SnowflakeDestination | `replace_table()`（`CREATE OR REPLACE TABLE`）、`upsert_rows()`（`MERGE INTO`、1000 行バッチ）、`insert_rows()`（`INSERT INTO`、1000 行バッチ）を実装する。VARIANT カラムには `PARSE_JSON(%s)` プレースホルダを使用する。 |
| warehouse_credentials_from_env | 環境変数 `WAREHOUSE_CREDENTIALS` を JSON または YAML でパースする。`type: snowflake` 必須、key-pair 認証またはパスワード認証を受け付ける。 |

## データ

### 概念モデル

`AGENTS` スキーマ全体の所有関係と参照関係を示します。

```mermaid
graph TD
    subgraph AGENTS["AGENTS スキーマ"]
        ROOT["ROOT<br/>provider registry"]

        subgraph dbtFamily["dbt table family"]
            DBT_MODEL["DBT_MODEL"]
            DBT_COLUMN["DBT_COLUMN"]
            DBT_DEPENDENCY["DBT_DEPENDENCY"]
        end

        subgraph lookmlFamily["LookML table family"]
            LOOKML_VIEW["LOOKML_VIEW"]
            LOOKML_DIMENSION["LOOKML_DIMENSION"]
            LOOKML_MEASURE["LOOKML_MEASURE"]
            LOOKML_EXPLORE["LOOKML_EXPLORE"]
        end

        subgraph osiFamily["OSI table family"]
            OSI_DATASET["OSI_DATASET"]
            OSI_FIELD["OSI_FIELD"]
            OSI_METRIC["OSI_METRIC"]
            OSI_RELATIONSHIP["OSI_RELATIONSHIP"]
        end
    end

    ROOT -->|"dbt provider を登録"| DBT_MODEL
    ROOT -->|"lookml provider を登録"| LOOKML_VIEW
    ROOT -->|"osi provider を登録"| OSI_DATASET

    DBT_MODEL -->|"model_id 参照"| DBT_COLUMN
    DBT_MODEL -->|"DAG edge"| DBT_DEPENDENCY
    DBT_DEPENDENCY -->|"upstream / downstream"| DBT_MODEL

    LOOKML_VIEW -->|"view_name 参照"| LOOKML_DIMENSION
    LOOKML_VIEW -->|"view_name 参照"| LOOKML_MEASURE
    LOOKML_EXPLORE -->|"from_view 参照"| LOOKML_VIEW

    OSI_DATASET -->|"dataset_name 参照"| OSI_FIELD
    OSI_RELATIONSHIP -->|"from / to 参照"| OSI_DATASET
```

#### 概念モデル説明

| エンティティ | 分類 | 役割 |
|---|---|---|
| ROOT | core | provider registry。全 provider が (provider, key) の組で行を upsert する。 |
| DBT_MODEL | dbt table family | dbt `manifest.json` の model ノード 1 件を 1 行で表す。 |
| DBT_COLUMN | dbt table family | DBT_MODEL に属する documented column を正規化して格納する。 |
| DBT_DEPENDENCY | dbt table family | dbt DAG の直接依存エッジ。upstream / downstream の id ペアを保持する。 |
| LOOKML_VIEW | LookML table family | LookML の view ブロック 1 件を 1 行で表す。 |
| LOOKML_DIMENSION | LookML table family | LOOKML_VIEW に属する dimension / dimension_group ブロックを格納する。 |
| LOOKML_MEASURE | LookML table family | LOOKML_VIEW に属する measure ブロックを格納する。 |
| LOOKML_EXPLORE | LookML table family | LookML の explore ブロック 1 件を 1 行で表す。from_view で LOOKML_VIEW を参照する。 |
| OSI_DATASET | OSI table family | `semantic_model.datasets` の dataset 1 件を 1 行で表す。 |
| OSI_FIELD | OSI table family | OSI_DATASET に属するフィールドを格納する。 |
| OSI_METRIC | OSI table family | `semantic_model.metrics` の metric 1 件を 1 行で表す。 |
| OSI_RELATIONSHIP | OSI table family | dataset 間の結合関係を 1 行で表す。 |

### 情報モデル

ROOT と 12 の source テーブル、計 13 テーブルの主要属性を示します。

```mermaid
classDiagram
    class ROOT {
        +varchar provider
        +varchar key
        +text content
    }
    class DBT_MODEL {
        +varchar unique_id
        +varchar name
        +varchar schema_name
        +varchar materialization
        +text description
        +varchar file_path
        +array tags
    }
    class DBT_COLUMN {
        +varchar model_id
        +varchar column_name
        +varchar data_type
        +text description
    }
    class DBT_DEPENDENCY {
        +varchar upstream_id
        +varchar downstream_id
        +varchar upstream_type
        +varchar downstream_type
    }
    class LOOKML_VIEW {
        +varchar name
        +varchar sql_table_name
        +varchar label
        +text description
        +text ai_context
        +varchar file_path
    }
    class LOOKML_DIMENSION {
        +varchar view_name
        +varchar field_name
        +varchar field_kind
        +varchar type
        +text sql
        +text description
        +text ai_context
        +boolean primary_key
    }
    class LOOKML_MEASURE {
        +varchar view_name
        +varchar measure_name
        +varchar type
        +text sql
        +text description
        +text ai_context
        +text filters
    }
    class LOOKML_EXPLORE {
        +varchar name
        +varchar from_view
        +varchar label
        +text description
        +text ai_context
        +varchar file_path
    }
    class OSI_DATASET {
        +varchar name
        +varchar source_table
        +array primary_key
        +text description
        +text ai_context
    }
    class OSI_FIELD {
        +varchar dataset_name
        +varchar field_name
        +varchar label
        +text description
        +text ai_context
        +boolean is_time_dimension
        +text expression
    }
    class OSI_METRIC {
        +varchar name
        +text description
        +text ai_context
        +text expression
    }
    class OSI_RELATIONSHIP {
        +varchar name
        +varchar from_dataset
        +varchar to_dataset
        +array from_columns
        +array to_columns
    }

    DBT_MODEL "1" --> "many" DBT_COLUMN : model_id
    DBT_MODEL "many" --> "many" DBT_DEPENDENCY : upstream / downstream
    LOOKML_VIEW "1" --> "many" LOOKML_DIMENSION : view_name
    LOOKML_VIEW "1" --> "many" LOOKML_MEASURE : view_name
    LOOKML_EXPLORE "many" --> "1" LOOKML_VIEW : from_view
    OSI_DATASET "1" --> "many" OSI_FIELD : dataset_name
    OSI_DATASET "1" --> "many" OSI_RELATIONSHIP : from / to
```

`OSI_METRIC` は他エンティティと関係線を持ちません。これは OSI 仕様上 `semantic_model.metrics` が `semantic_model.datasets` と並列のトップレベル要素であり、metric が特定 dataset への外部キーを持たない設計を反映したものです。

#### `AGENTS.ROOT`（PK: provider + key）

| カラム | 型 | 意味（ソースフィールド対応） |
|---|---|---|
| provider | varchar | metadata contributor の短い識別子。`dbt` / `lookml` / `osi` など lowercase で記録する。 |
| key | varchar | provider 内でユニークな識別子。テーブル文書化行では unprefixed table 名を使う慣習（例: `model` → `AGENTS.DBT_MODEL`）。 |
| content | text | provider が公開したい任意のテキスト。Markdown が自然だが plain text でも可。 |

#### `AGENTS.DBT_MODEL`（PK: unique_id）

| カラム | 型 | 意味（ソースフィールド対応） |
|---|---|---|
| unique_id | varchar | manifest の node key。例: `model.package.model_name`。 |
| name | varchar | `node.name`。 |
| schema_name | varchar | `node.schema`。 |
| materialization | varchar | `node.config.materialized`。 |
| description | text | `node.description`。欠損時は空文字列。 |
| file_path | varchar | `node.original_file_path`。 |
| tags | array (VARIANT) | `node.tags` を `PARSE_JSON` でシリアライズした JSON 配列。 |

#### `AGENTS.DBT_COLUMN`（PK: model_id + column_name）

| カラム | 型 | 意味（ソースフィールド対応） |
|---|---|---|
| model_id | varchar | 親モデルの `unique_id`。 |
| column_name | varchar | `node.columns` のキー。 |
| data_type | varchar | `column.data_type`。欠損時は空文字列。 |
| description | text | `column.description`。欠損時は空文字列。 |

#### `AGENTS.DBT_DEPENDENCY`（PK: upstream_id + downstream_id）

| カラム | 型 | 意味（ソースフィールド対応） |
|---|---|---|
| upstream_id | varchar | `node.depends_on.nodes` のエントリ（依存先の unique_id）。 |
| downstream_id | varchar | 現在のモデルの `unique_id`。 |
| upstream_type | varchar | `upstream_id` の最初の `.` より前のプレフィックス。`.` が無い場合は `unknown`。 |
| downstream_type | varchar | 現行の dbt ingestion では常に `model`。 |

#### `AGENTS.LOOKML_VIEW`（PK: name）

| カラム | 型 | 意味（ソースフィールド対応） |
|---|---|---|
| name | varchar | view ブロック名。 |
| sql_table_name | varchar | view の `sql_table_name`。 |
| label | varchar | view の `label`。 |
| description | text | view の `description`。 |
| ai_context | text | view の `ai_context`。 |
| file_path | varchar | LookML ディレクトリからの `.lkml` 相対パス。 |

#### `AGENTS.LOOKML_DIMENSION`（PK: view_name + field_name）

| カラム | 型 | 意味（ソースフィールド対応） |
|---|---|---|
| view_name | varchar | 親 view 名。 |
| field_name | varchar | dimension または dimension_group のブロック名。 |
| field_kind | varchar | `dimension` または `dimension_group` の区別。 |
| type | varchar | フィールドの `type`。 |
| sql | text | フィールドの `sql`。LookML `;;` ターミネータを除去して格納する。 |
| description | text | フィールドの `description`。 |
| ai_context | text | フィールドの `ai_context`。 |
| primary_key | boolean | フィールドの `primary_key` を boolean として解析した値。 |

#### `AGENTS.LOOKML_MEASURE`（PK: view_name + measure_name）

| カラム | 型 | 意味（ソースフィールド対応） |
|---|---|---|
| view_name | varchar | 親 view 名。 |
| measure_name | varchar | measure ブロック名。 |
| type | varchar | measure の `type`。 |
| sql | text | measure の `sql`。`;;` ターミネータを除去して格納する。 |
| description | text | measure の `description`。 |
| ai_context | text | measure の `ai_context`。 |
| filters | text | measure の `filters` プロパティ。現行パーサは JSON 化せず、捕捉した生の LookML テキスト値をそのまま `TEXT` に格納する。consumer 側で解釈する。 |

#### `AGENTS.LOOKML_EXPLORE`（PK: name）

| カラム | 型 | 意味（ソースフィールド対応） |
|---|---|---|
| name | varchar | explore ブロック名。 |
| from_view | varchar | explore の `from`。欠損時は explore 名と同値。 |
| label | varchar | explore の `label`。 |
| description | text | explore の `description`。 |
| ai_context | text | explore の `ai_context`。 |
| file_path | varchar | LookML ディレクトリからの `.lkml` 相対パス。 |

#### `AGENTS.OSI_DATASET`（PK: name）

| カラム | 型 | 意味（ソースフィールド対応） |
|---|---|---|
| name | varchar | dataset の `name`。 |
| source_table | varchar NOT NULL | dataset の `source`。欠損時は NULL ではなく空文字列を挿入する。 |
| primary_key | array (VARIANT) | dataset の `primary_key` を `PARSE_JSON` でシリアライズした JSON 配列。 |
| description | text | dataset の `description`。欠損時は空文字列。 |
| ai_context | text | dataset の `ai_context`。欠損時は空文字列。 |

#### `AGENTS.OSI_FIELD`（PK: dataset_name + field_name）

| カラム | 型 | 意味（ソースフィールド対応） |
|---|---|---|
| dataset_name | varchar | 親 dataset の `name`。 |
| field_name | varchar | フィールドの `name`。 |
| label | varchar | フィールドの `label`。 |
| description | text | フィールドの `description`。欠損時は空文字列。 |
| ai_context | text | フィールドの `ai_context`。欠損時は空文字列。 |
| is_time_dimension | boolean | `field.dimension.is_time` が truthy のとき `true`、それ以外は `false`。 |
| expression | text | `field.expression.dialects[].expression` の先頭エントリ。 |

#### `AGENTS.OSI_METRIC`（PK: name）

| カラム | 型 | 意味（ソースフィールド対応） |
|---|---|---|
| name | varchar | metric の `name`。 |
| description | text | metric の `description`。欠損時は空文字列。 |
| ai_context | text | metric の `ai_context`。欠損時は空文字列。 |
| expression | text | `metric.expression.dialects[].expression` の先頭エントリ。 |

#### `AGENTS.OSI_RELATIONSHIP`（PK: name）

| カラム | 型 | 意味（ソースフィールド対応） |
|---|---|---|
| name | varchar | relationship の `name`。 |
| from_dataset | varchar | relationship の `from`（起点 dataset 名）。 |
| to_dataset | varchar | relationship の `to`（終点 dataset 名）。 |
| from_columns | array (VARIANT) NOT NULL | relationship の `from_columns` を `PARSE_JSON` した JSON 配列。 |
| to_columns | array (VARIANT) NOT NULL | relationship の `to_columns` を `PARSE_JSON` した JSON 配列。 |

#### 型システムと識別子の重要事実

| 内部 kind | Snowflake 格納型 | 挿入方法 |
|---|---|---|
| `varchar` | `VARCHAR` | そのまま文字列として渡す。 |
| `text` | `TEXT` | そのまま文字列として渡す。 |
| `boolean` | `BOOLEAN` | Python の bool 値として渡す。 |
| `array` | `VARIANT` | `json.dumps` でシリアライズし `PARSE_JSON(%s)` プレースホルダ経由で挿入する。 |

Python パッケージ内部はテーブル名・カラム名を lowercase で定義します。Snowflake へはクォートなしの unquoted identifier として送出するため、Snowflake は格納時に自動的に UPPERCASE へ変換します。実際のウェアハウスオブジェクトは `AGENTS.DBT_MODEL`・`AGENTS.LOOKML_VIEW`・`AGENTS.OSI_DATASET` のような大文字名として存在します。

NOT NULL 制約は、各テーブルの PK 構成カラムすべてと、`DBT_MODEL.name`・`OSI_DATASET.source_table`・`OSI_RELATIONSHIP.from_columns`/`to_columns` に付きます。PK カラムは定義上 NOT NULL です。ただし「欠損時は空文字列を挿入する」カラムは、制約上 NOT NULL でも意味的には空になりうる点に注意します。

`OSI_FIELD.expression` と `OSI_METRIC.expression` には、OSI YAML の `expression.dialects[]` のうち**先頭エントリ**の式だけを格納します。複数 dialect が定義されていても残りは取り込まれません。consumer は格納された式が必ずしも Snowflake 方言である保証がない点に注意し、`AI_CONTEXT` の指示を優先します。

## 構築方法

### 前提条件

対応 destination は **Snowflake のみ**です（"more coming soon"）。各メタデータソースに必要なファイルは次のとおりです。

| ソース | 必須ファイル | 備考 |
|---|---|---|
| dbt | `<dbt-project-dir>/target/manifest.json` | 無ければ commit するか、managed dbt parse で生成する。 |
| LookML | `<lookml-dir>/*.lkml` | Looker プロジェクトのディレクトリを指定する。 |
| OSI | `<osi-dir>/*.osi.yaml` | Open Semantic Interchange YAML を配置する。 |

CLI を直接使う場合は Python 3.11 以上が必要です（依存: `cryptography` / `pyyaml` / `snowflake-connector-python`）。

### 必須パラメータ一覧

**CLI サブコマンドの必須引数**

| サブコマンド | 必須引数 | 説明 |
|---|---|---|
| `dbt` | `--project-dir` | `target/manifest.json` を含む dbt プロジェクトのパス。 |
| `looker` | `--lookml-dir` | `*.lkml` ファイルが存在するディレクトリのパス。 |
| `osi` | `--osi-dir` | `*.osi.yaml` ファイルが存在するディレクトリのパス。 |

**`WAREHOUSE_CREDENTIALS` secret の必須キー**

| キー | 必須/任意 | 説明 |
|---|---|---|
| `type` | 必須 | `snowflake` 固定。 |
| `account` | 必須 | Snowflake アカウント識別子。 |
| `user` | 必須 | 接続ユーザー名。 |
| `warehouse` | 必須 | 使用するウェアハウス名。 |
| `database` | 必須 | 書き込み先データベース名。 |
| `role` | 任意 | 実行ロール名。 |
| `private_key_pem` / `private_key_path` / `password` | いずれか 1 つ必須 | 認証手段。key-pair（`private_key_pem` または `private_key_path`）を推奨する。 |
| `private_key_passphrase` | 任意 | `private_key_pem` が暗号化されている場合のみ必要。 |

### Secret 設定

GitHub リポジトリの Actions secret に `WAREHOUSE_CREDENTIALS` を 1 つ作成します。形式は YAML または JSON を受け付けます。

```yaml
type: snowflake
account: abc123
user: AGENTS_SCHEMA_BOT
warehouse: COMPUTE_WH
database: ANALYTICS
role: TRANSFORMER
private_key_pem: |
  -----BEGIN ENCRYPTED PRIVATE KEY-----
  MIIEvQIBADANBgkqh...
  -----END ENCRYPTED PRIVATE KEY-----
private_key_passphrase: your-passphrase
```

- `role` は省略可能です。
- 非暗号化キーは `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` マーカーを使い、`private_key_passphrase` を省略します。暗号化キーは `-----BEGIN ENCRYPTED PRIVATE KEY-----` マーカーで判別できます。
- `account` は Snowflake の新方式 `orgname-accountname` か、旧方式の account locator（`locator.region.cloud`）のいずれかを使います。接続できない場合はこの形式の取り違えを疑います。

### Workflow 配線 — dbt

dbt プロジェクトのリポジトリに次の workflow ファイルを配置します。

```yaml
name: Agents Schema dbt

on:
  workflow_dispatch:
  push:
    branches: [main]

jobs:
  agents-schema-dbt:
    uses: fivetran/agents_schema/.github/workflows/agents-schema-dbt.yml@v0.0.6
    with:
      dbt-project-dir: dbt_project
    secrets: inherit
```

workflow は `<dbt-project-dir>/target/manifest.json` を読み込み、`AGENTS.DBT_MODEL` / `AGENTS.DBT_COLUMN` / `AGENTS.DBT_DEPENDENCY` に書き込みます。

`manifest.json` が存在しない場合、Composite Action は次の 3 択で対応します。いずれも満たさないとエラーになります。

1. `target/manifest.json` を事前に commit しておく。
2. **managed dbt parse**: `dbt-profile-name`（input）と `DBT_PROFILES_YML`（secret）の**両方**を渡す。Action がこの 2 つを揃って検知したときだけ `dbt parse` を実行する。
3. **カスタムコマンド**: `dbt-parse-command`（input）で manifest 生成コマンドを直接指定する。

オプション入力と secret は次のとおりです。

| 入力 / secret | 種別 | 説明 |
|---|---|---|
| `dbt-profile-name` | input | managed dbt parse に必要なプロファイル名。`DBT_PROFILES_YML` と必ずペアで指定する。 |
| `dbt-target` | input (任意) | `profiles.yml` が複数ターゲットを持つ場合に指定する。 |
| `dbt-parse-command` | input (任意) | manifest 生成に使うカスタムコマンド（選択肢 3）。 |
| `DBT_PROFILES_YML` | secret | managed dbt parse 用の `profiles.yml` 内容。`dbt-profile-name` と必ずペアで指定する。 |

managed dbt parse の内部では、補助コマンド `agents-schema-dbt-adapter-package` が `profiles.yml` の選択ターゲットから adapter type を読み取り、対応する dbt アダプターパッケージ名を出力します。現行マッピングは `snowflake` → `dbt-snowflake` のみです。Composite Action は `uvx` でこのアダプターを取り込んでから `dbt parse --no-partial-parse` を実行し、`target/manifest.json` を生成します。`profiles.yml` が複数ターゲットを持つ場合は `dbt-target` の指定が必要です。

### Workflow 配線 — Looker

```yaml
name: Agents Schema Looker

on:
  workflow_dispatch:
  push:
    branches: [main]

jobs:
  agents-schema-looker:
    uses: fivetran/agents_schema/.github/workflows/agents-schema-looker.yml@v0.0.6
    with:
      lookml-dir: lookml
    secrets: inherit
```

### Workflow 配線 — OSI

```yaml
name: Agents Schema OSI

on:
  workflow_dispatch:
  push:
    branches: [main]

jobs:
  agents-schema-osi:
    uses: fivetran/agents_schema/.github/workflows/agents-schema-osi.yml@v0.0.6
    with:
      osi-dir: osi
    secrets: inherit
```

workflow は `AGENTS.OSI_DATASET` / `AGENTS.OSI_FIELD` / `AGENTS.OSI_METRIC` / `AGENTS.OSI_RELATIONSHIP` を書き込みます。

### Workflow 配線 — 複数ソース同時

1 つのリポジトリで dbt + LookML + OSI を同期する場合は、各 job を同一 workflow に並べます。job 間の依存関係は不要です。公式サンプルとして `examples/workflows/dbt-looker.yml` と `examples/workflows/dbt-looker-osi.yml` が用意されています。

```yaml
jobs:
  agents-schema-dbt:
    uses: fivetran/agents_schema/.github/workflows/agents-schema-dbt.yml@v0.0.6
    with:
      dbt-project-dir: dbt_project
    secrets: inherit

  agents-schema-looker:
    uses: fivetran/agents_schema/.github/workflows/agents-schema-looker.yml@v0.0.6
    with:
      lookml-dir: lookml
    secrets: inherit

  agents-schema-osi:
    uses: fivetran/agents_schema/.github/workflows/agents-schema-osi.yml@v0.0.6
    with:
      osi-dir: osi
    secrets: inherit
```

### バージョン pin

リポジトリ全体（reusable workflows・actions・CLI・examples・README・spec）が 1 つの release tag で versioning されます。現行タグは **v0.0.6** です。アップグレードは `uses:` 行のタグを変更するだけです。

### CLI 直接呼び出し

GitHub Actions を使わずローカルや任意の CI で直接実行する場合は `agents-schema` CLI を使います。PyPI に `agents-schema` として公開されています。

```bash
pip install agents-schema
# または
uv pip install agents-schema
```

インストール後のエントリポイントは `agents-schema`（`agents_schema.cli:main`）です。補助コマンド `agents-schema-dbt-adapter-package`（`agents_schema.cli:dbt_adapter_package_main`）も提供されます。

```bash
export WAREHOUSE_CREDENTIALS="$(cat credentials.yaml)"

agents-schema dbt --project-dir dbt_project
agents-schema looker --lookml-dir lookml
agents-schema osi --osi-dir osi
```

CLI は環境変数 `WAREHOUSE_CREDENTIALS` を読み込みます。

## 利用方法

エージェントは `AGENTS.*` テーブルを SQL で読んで、ビジネスデータをクエリする前に文脈を得ます。

### `AGENTS.ROOT` 起点の discovery

まずどの provider がメタデータを書き込んでいるかを確認します。存在する provider のテーブルのみを参照します。

```sql
SELECT provider, key, content
FROM AGENTS.ROOT
ORDER BY provider, key;
```

### metric 探索

OSI の metric は `AGENTS.OSI_METRIC`、LookML の measure は `AGENTS.LOOKML_MEASURE` を検索し、`DESCRIPTION` / `AI_CONTEXT` と計算式（OSI は `EXPRESSION`、LookML は `SQL`）を読み取ります。

```sql
SELECT name, description, ai_context, expression
FROM AGENTS.OSI_METRIC
WHERE LOWER(NAME||' '||COALESCE(DESCRIPTION,'')||' '||COALESCE(AI_CONTEXT,''))
      LIKE '%mrr%';
```

```sql
SELECT view_name, measure_name, type, sql, description, ai_context
FROM AGENTS.LOOKML_MEASURE
WHERE LOWER(MEASURE_NAME||' '||COALESCE(DESCRIPTION,'')||' '||COALESCE(AI_CONTEXT,''))
      LIKE '%revenue%';
```

### physical table 解決

metric の formula を確認したら、参照する物理テーブルとクエリルールを取得します。`AI_CONTEXT` の指示に厳密に従います。

```sql
SELECT name, source_table, primary_key, description, ai_context
FROM AGENTS.OSI_DATASET
WHERE name = '<dataset_name>';
```

```sql
SELECT name, sql_table_name, description, ai_context
FROM AGENTS.LOOKML_VIEW
WHERE name = '<view_name>';
```

### 再帰 lineage（dbt dependency）

あるソースに直接・間接的に依存する全モデルは `AGENTS.DBT_DEPENDENCY` を `WITH RECURSIVE` で辿って取得します。次は SPEC.md の正準例です。

```sql
WITH RECURSIVE lineage AS (
  SELECT downstream_id AS node_id
  FROM AGENTS.DBT_DEPENDENCY
  WHERE upstream_id = 'source.my_project.raw.account'

  UNION ALL

  SELECT d.downstream_id
  FROM AGENTS.DBT_DEPENDENCY d
  JOIN lineage l ON d.upstream_id = l.node_id
)
SELECT DISTINCT m.name, m.schema_name, m.description
FROM lineage
JOIN AGENTS.DBT_MODEL m ON m.unique_id = lineage.node_id;
```

### cross-source join（LookML ↔ dbt）

LookML view の `sql_table_name` と dbt model の `schema_name` / `name` を heuristic で突き合わせ、BI 向けオブジェクトをモデル化された warehouse テーブルへ対応づけます。`sql_table_name` は自由記述のため、orientation 用途の発見的クエリです。

```sql
SELECT
  v.name AS lookml_view,
  v.sql_table_name,
  m.unique_id AS dbt_model_id,
  m.name AS dbt_model,
  m.schema_name,
  m.description AS dbt_description
FROM AGENTS.LOOKML_VIEW v
LEFT JOIN AGENTS.DBT_MODEL m
  ON LOWER(v.sql_table_name) LIKE '%' || LOWER(m.schema_name) || '.' || LOWER(m.name) || '%';
```

`sql_table_name` が derived table（インライン SQL）や `${TABLE}` テンプレート、`database.schema.table` の三段修飾を含む場合は、この LIKE 一致が外れます。一致しない view は `LOOKML_VIEW.description` / `ai_context` のテキスト検索で補うか、`AGENTS.ROOT` のカスタム行に view ↔ model の対応関係を明示して解決します。

### analyst skill の導入

`agents-schema-analyst` skill を使うと、AI エージェントが `AGENTS.*` を自律的に参照してビジネス質問に答えます。事前に `snow connection add` で Snowflake 接続を設定します。

```bash
# Claude Code
curl -fsSL --create-dirs \
  -o ~/.claude/skills/agents-schema-analyst/SKILL.md \
  https://raw.githubusercontent.com/fivetran/agents_schema/v0.0.6/examples/skills/agents-schema-analyst/SKILL.md
```

```bash
# Codex
curl -fsSL --create-dirs \
  -o ~/.codex/skills/agents-schema-analyst/SKILL.md \
  https://raw.githubusercontent.com/fivetran/agents_schema/v0.0.6/examples/skills/agents-schema-analyst/SKILL.md
```

呼び出しは Claude Code が `/agents-schema-analyst "What is our total MRR this month?"`、Codex が `$agents-schema-analyst "What is our total MRR this month?"` です。

working directory に `agents.yml` を置くと接続名とスキーマ名をカスタマイズできます。

```yaml
snow_cli_connection: my_connection
agents_schema_name: AGENTS
```

`snow_cli_connection` を省略すると `snow connection list` のデフォルト接続を、`agents_schema_name` を省略すると `AGENTS` を使います。skill は `snow sql` を通じて **read-only**（`SELECT` / `SHOW` のみ）で動作します。

## 運用

### メタデータのリフレッシュ

ワークフローは `push (branches:[main])` と `workflow_dispatch` の 2 トリガーで動きます。dbt manifest や LookML / OSI ファイルを `main` に push するたびに自動起動します。secret 更新後やリポジトリ変更を伴わないリフレッシュは、Actions タブの "Run workflow"（workflow_dispatch）で手動実行します。

### 冪等な再生成

各 source ingestion は自分の table family を `CREATE OR REPLACE TABLE` で丸ごと置換します。`AGENTS.ROOT` への書き込みは MERGE（upsert）で行い、自分の provider 行だけを更新して他 provider の行には触れません。

```text
実行ごとの動作:
  source table（DBT_MODEL 等）: CREATE OR REPLACE TABLE → 全件置換
  AGENTS.ROOT:                 MERGE ON (provider, key) → 自 provider 行のみ upsert
```

consumer 側は手編集不可の「generated metadata」として扱う設計です。

### 状態確認

publish 済み provider は `AGENTS.ROOT` で確認します。各テーブルの最終更新時刻は Snowflake の `INFORMATION_SCHEMA` で補完できます。

```sql
SELECT provider, key, content FROM AGENTS.ROOT ORDER BY provider, key;
```

```sql
SELECT table_name, last_altered
FROM information_schema.tables
WHERE table_schema = 'AGENTS'
ORDER BY table_name;
```

### バージョン更新

`uses:` 行のタグを上げるだけでリポジトリ全体（workflows / actions / CLI / examples / spec）が一括更新されます。本記事の調査時点（2026-06-04）の最新タグは `v0.0.6` です。

## ベストプラクティス

### 権限分離

SPEC.md「Permissions」に基づく推奨設計です。

- **read**: `AGENTS.ROOT` と全 source table は、分析クエリまたはエージェントクエリを実行するすべての Snowflake principal に SELECT を付与します。
- **write**: `AGENTS.*` への書き込みは、publish するワークフロー / サービスプリンシパルに限定します。専用ユーザー（例: `AGENTS_SCHEMA_BOT`）と `TRANSFORMER` ロールを用意し、key-pair 認証を推奨します。

### 取り込み経路の選択

SPEC.md「Populating the Tables」が示す 4 経路から、自分のインフラに合うものを選びます。GitHub Actions は 1 実装手段にすぎません。

| 経路 | 説明 |
|---|---|
| Vendor-run pipeline | プロバイダーが自動で warehouse に sync する。 |
| CI/CD job | ソースアーティファクト変更時に `AGENTS.*` をロードする。 |
| Scheduled workflow | 定期的にソースからメタデータをリフレッシュする。 |
| Platform engineering job | 内部メタデータ・スキル・クエリレシピ・運用コンテキストを管理する。 |

### カスタム provider 拡張

`AGENTS.ROOT` に独自 provider 行を追加すると、warehouse に任意のコンテキストを置けます。特定テーブルを説明する行は unprefixed table 名に key を合わせます（例: `(dbt, model)` → `AGENTS.DBT_MODEL`）。content は LLM consumer 向けに Markdown が自然です。

```sql
INSERT INTO AGENTS.ROOT (provider, key, content) VALUES
  ('acme_corp', 'skills/refund_workflow', '# Refund Workflow\nWhen a user asks about refunds, use this procedure...'),
  ('acme_corp', 'costs', '# Query Costs\nUse this before running expensive joins.');
```

カスタムテーブルを作る場合は `(provider, table_name)` の命名慣習（例: `AGENTS.ACME_ORDERS`）に従うと、LLM エージェントが混乱しにくくなります。テーブルのカラム構成に強制はなく、consumer が読める列名と型（自由記述は `TEXT`、ID やラベルは `VARCHAR`、JSON は `VARIANT`）を持てば十分です。最小構成の DDL 例は次のとおりです。

```sql
CREATE TABLE IF NOT EXISTS AGENTS.ACME_ORDERS (
  table_name  VARCHAR,
  description TEXT,
  ai_context  TEXT
);
```

`ROOT.key` にテーブル名以外の自由キー（例: `skills/refund_workflow`、`costs`）を使う場合、それは特定テーブルの文書ではなく自由コンテキストです。consumer は `AGENTS.ROOT` を全件 SELECT し、`provider` で絞り込んだうえで `content`（多くは Markdown）を読んで利用します。テーブル文書化行とは異なり、対応テーブルの存在を前提にしません。

### destination の拡張余地

現状の対応 destination は Snowflake のみです（"more coming soon"）。`destinations.py` は `Destination` Protocol（`replace_table` / `upsert_rows` / `insert_rows` / `close`）を定義し、`SnowflakeDestination` がその実装です。他ウェアハウスへ拡張する際は、この Protocol を満たすクラスを追加し、`open_destination()` のディスパッチと `SUPPORTED_WAREHOUSE_TYPES` を拡張する形になります。`TableSchema` / `Column` による論理スキーマ定義は destination 非依存のため再利用できます。

### 適用境界

- dbt リポジトリを編集する dbt MCP server は source files / artifacts を直接使うべきです。Agents Schema はその代替ではありません。
- Semantic Layer の置換でもありません。計算・集計ロジックのランタイム実行は専用システムが担います。
- `information_schema` のように warehouse 内で自己完結するメタデータ発見レイヤーとして位置づけます。

### consumer 側 skill のガードレール

`examples/skills/agents-schema-analyst/SKILL.md` に示されるガードレールです。

- `snow sql` の **SELECT / SHOW のみ** を許可します。INSERT・UPDATE・DROP・CREATE は実行しません。
- `SHOW TABLES` / `GET_DDL` による広域スキーマクロールは避け、`AGENTS.ROOT` を起点に focused SELECT で対象を絞ります。
- ROOT に出ていない provider のテーブルを推測クエリしません。
- `AI_CONTEXT` / `DESCRIPTION` の指示を厳守し、定義が無ければ推測せず「定義が見つからない」と返します。

## トラブルシューティング

`src/destinations.py` / `src/config.py` の `ConfigError` メッセージを根拠とした主要エラーです。

| 症状 | 原因 | 対処 |
|---|---|---|
| `missing required WAREHOUSE_CREDENTIALS secret` | `WAREHOUSE_CREDENTIALS` 未設定 | リポジトリの Settings → Secrets → Actions に登録する。 |
| `WAREHOUSE_CREDENTIALS is not valid JSON or YAML` | secret 本文が JSON / YAML として不正 | 改行・インデント・クォートを確認して正しい形式で書き直す。 |
| `WAREHOUSE_CREDENTIALS.type must be snowflake` | `type` が欠落または別値 | `type: snowflake` を明示する（現状唯一の対応 destination）。 |
| `unsupported WAREHOUSE_CREDENTIALS.type '...'` | `type` に snowflake 以外を指定 | `type: snowflake` に修正する。 |
| `WAREHOUSE_CREDENTIALS missing keys: ...` | account / user / warehouse / database または認証手段の欠落 | 不足キーを追加する。 |
| dbt manifest not found | `<dbt-project-dir>/target/manifest.json` が無い | manifest を生成して commit するか、managed dbt parse（`dbt-profile-name` + `DBT_PROFILES_YML` を両方設定）か `dbt-parse-command` を使う。 |
| `expected a simple Snowflake identifier: ...` | 識別子に `[A-Za-z_][A-Za-z0-9_$]*` 以外の文字が混入 | 命名規則に従ったテーブル名に変更する。 |
| key-pair 認証失敗 | `private_key_pem` の改行崩れ、または passphrase 指定誤り | 暗号化キーは passphrase を指定、非暗号化キーは passphrase 行を省く。PEM の改行保持を確認する。 |

### WAREHOUSE_CREDENTIALS の解析順

`destinations.py` の `_parse_warehouse_credentials` は JSON → YAML の順で parse を試み、どちらも失敗すると `ConfigError` を送出します。認証手段は `password` / `private_key_pem` / `private_key_path` のいずれか 1 つが必須で、`private_key_passphrase` は暗号化キー使用時のみ指定します。

### dbt manifest 不在

```bash
dbt compile --project-dir dbt_project
# または dbt run / dbt parse で target/manifest.json を生成
git add dbt_project/target/manifest.json
git commit -m "add dbt manifest"
git push origin main
```

### ROOT が空のまま / provider が追加されない

ワークフローが正常終了しても ROOT が空の場合は、write 権限（`TRANSFORMER` role 等）が `AGENTS` スキーマに付与されているかを確認します。

```sql
SELECT provider, key FROM AGENTS.ROOT ORDER BY provider, key;

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'AGENTS' ORDER BY table_name;
```

## まとめ

Agents Schema は、AI エージェントがウェアハウスデータを正確にクエリするためのメタデータを、ウェアハウス内の標準 `AGENTS` スキーマに置く OSS 標準です。dbt / LookML / OSI のメタデータを GitHub Actions + CLI で `AGENTS.*` テーブルへ正規化し、SQL を実行できるあらゆるエージェントが「推測ではなく定義」に基づいてクエリできるようにします。`information_schema` に近く provider 横断で拡張でき、`ai_context` 列でエージェント向けの明示的な制約を与えられる点が特徴です。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！

## 参考リンク

- 公式ドキュメント
  - [Agents Schema — Open Data Infrastructure](https://www.opendatainfrastructure.com/agents-schema)
  - [Open Data Infrastructure](https://www.opendatainfrastructure.com)
  - [Open Semantic Interchange (OSI)](https://open-semantic-interchange.org/)
  - [PyPI: agents-schema](https://pypi.org/project/agents-schema/)
- GitHub
  - [fivetran/agents_schema](https://github.com/fivetran/agents_schema)
  - [SPEC.md（スキーマ契約）](https://github.com/fivetran/agents_schema/blob/v0.0.6/SPEC.md)
  - [README.md](https://github.com/fivetran/agents_schema/blob/v0.0.6/README.md)
  - [dbt Setup Guide](https://github.com/fivetran/agents_schema/blob/v0.0.6/dbt-setup.md)
  - [Looker Setup Guide](https://github.com/fivetran/agents_schema/blob/v0.0.6/looker-setup.md)
  - [OSI Setup Guide](https://github.com/fivetran/agents_schema/blob/v0.0.6/osi-setup.md)
  - [src/agents_schema/destinations.py](https://github.com/fivetran/agents_schema/blob/v0.0.6/src/agents_schema/destinations.py)
  - [src/agents_schema/config.py](https://github.com/fivetran/agents_schema/blob/v0.0.6/src/agents_schema/config.py)
  - [agents-schema-analyst SKILL.md](https://github.com/fivetran/agents_schema/blob/v0.0.6/examples/skills/agents-schema-analyst/SKILL.md)
- 記事
  - [deepwiki: fivetran/agents_schema（二次情報）](https://deepwiki.com/fivetran/agents_schema)
