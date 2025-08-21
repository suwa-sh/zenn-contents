---
title: "技術調査 - Graphiti"
emoji: "🕸️"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["python", "LLM", "knowledgegraph", "graphiti", "RAG"]
published: true
published_at: 2025-06-05
---

## ■概要

Graphitiは、AIエージェント向けの時間認識型ナレッジグラフを構築し、クエリを実行するためのフレームワークです。

動的な環境で動作するAIエージェント専用に設計されています。ユーザーとの対話、構造化・非構造化された企業データ、外部情報源からの情報を継続的に統合します。これにより、一貫性を持ち、クエリ可能なナレッジグラフを構築します。

Graphitiは、リアルタイムなデータ更新と時間的コンテキストの管理に優れています。従来のGraphRAGアプローチと比較して、動的なデータ管理に特化している点が特徴です。MCPサーバーとGraph Serviceという2つの展開オプションがあり、様々な統合シナリオに対応します。


https://github.com/getzep/graphiti

## ■特徴

- **リアルタイム増分更新**:
  - バッチ処理での再計算をせず、新しいデータエピソードを即時に統合
- **双時間データモデル**:
  - イベントの発生時刻とデータ取り込み時刻を個別に追跡し、正確な時点でのクエリを実行
- **効率的なハイブリッド検索**:
  - セマンティック埋め込み、キーワード検索、グラフトラバーサルを組み合わせ、低遅延のクエリを実現
- **カスタムエンティティ定義**:
  - Pydanticモデルを使用して、柔軟なオントロジー作成と開発者によるエンティティ定義をサポート
- **スケーラビリティ**:
  - 並列処理により大規模なデータセットを効率的に管理し、エンタープライズ環境へ適用可能

## ■システム構造

### ●システムコンテキスト図

```mermaid
graph TD
    Developer["開発者"] --> Graphiti
    AIAgent["AIエージェント"] --> Graphiti
    Graphiti --> Neo4j["Neo4j"]
    Graphiti --> OpenAI["OpenAI"]
```

| 要素名 | 説明 |
| :--- | :--- |
| 開発者 | Graphitiを使用してナレッジグラフアプリケーションを構築する開発者 |
| AIエージェント | Graphitiのナレッジグラフ機能を利用するAIエージェント |
| Graphiti | 時間認識型ナレッジグラフフレームワーク |
| Neo4j | グラフデータベースとして使用する外部システム |
| OpenAI | LLM推論と埋め込み生成に使用する外部システム |

### ●コンテナ図

```mermaid
graph TD
    subgraph "Graphiti System"
        MCPServer["MCP Server"]
        GraphService["Graph Service"]
        GraphitiCore["Graphiti Core"]
    end

    subgraph "External Systems"
        Neo4jDB["Neo4j Database"]
        LLMProvider["LLM Provider"]
    end

    MCPServer --> GraphitiCore
    GraphService --> GraphitiCore
    GraphitiCore --> Neo4jDB
    GraphitiCore --> LLMProvider
```

| 要素名 | 説明 |
| :--- | :--- |
| MCP Server | Model Context Protocol（MCP）サーバーの実装。AIアシスタントとの統合を提供 |
| Graph Service | FastAPIを基盤としたREST APIサービス |
| Graphiti Core | 中核となるナレッジグラフ機能を提供するメインライブラリ |
| Neo4j Database | グラフデータを永続的に保管するストレージ |
| LLM Provider | 自然言語処理タスクを実行する言語モデルプロバイダー |

### ●コンポーネント図

```mermaid
graph TD
    subgraph "Graphiti Core Components"
        GraphitiClient["Graphiti Client"]
        NodeManager["Node Manager"]
        EdgeManager["Edge Manager"]
        SearchEngine["Search Engine"]
        EmbedderClient["Embedder Client"]
        LLMClient["LLM Client"]
    end

    GraphitiClient --> NodeManager
    GraphitiClient --> EdgeManager
    GraphitiClient --> SearchEngine
    NodeManager --> EmbedderClient
    EdgeManager --> LLMClient
    SearchEngine --> EmbedderClient
```

| 要素名 | 説明 |
| :--- | :--- |
| Graphiti Client | メインクライアントクラス。グラフ操作のための統合インターフェースを提供 |
| Node Manager | `EntityNode`、`EpisodicNode`、`CommunityNode`の管理 |
| Edge Manager | `EntityEdge`、`EpisodicEdge`の管理と関係性の抽出 |
| Search Engine | ハイブリッド検索機能の提供 |
| Embedder Client | テキストの埋め込みベクトル生成 |
| LLM Client | 自然言語処理タスクの実行 |

### ●統合検索の処理フロー

Graphitiの統合検索（Unified Search）の処理フローを図解します。これは`search()`関数を中心とした複数の検索手法を組み合わせたハイブリッド検索システムです。

```mermaid
graph TD
    subgraph "検索エントリーポイント"
        SEARCH["search()"]
        QUERY_VECTOR["クエリベクトル化"]
    end
    
    subgraph "並列検索実行"
        EDGE_SEARCH["edge_search()"]
        NODE_SEARCH["node_search()"]
        EPISODE_SEARCH["episode_search()"]
        COMMUNITY_SEARCH["community_search()"]
    end
    
    subgraph "検索手法"
        FULLTEXT["フルテキスト検索<br/>BM25/Lucene"]
        SIMILARITY["ベクトル類似度検索<br/>コサイン類似度"]
        BFS["幅優先探索<br/>グラフトラバーサル"]
    end
    
    subgraph "リランキング戦略"
        RRF["RRF<br/>相互ランク融合"]
        MMR["MMR<br/>最大限界関連性"]
        CROSS_ENCODER["CrossEncoder<br/>ニューラルリランキング"]
        NODE_DISTANCE["ノード距離<br/>リランキング"]
        EPISODE_MENTIONS["メンション数<br/>リランキング"]
    end
    
    subgraph "結果統合"
        SEARCH_RESULTS["SearchResults"]
        CONTEXT_STRING["コンテキスト文字列化"]
    end
    
    SEARCH --> QUERY_VECTOR

    QUERY_VECTOR --> 並列検索実行
    並列検索実行 --> 検索手法
    検索手法 --> リランキング戦略
    リランキング戦略 --> SEARCH_RESULTS

    SEARCH_RESULTS --> CONTEXT_STRING
```

統合検索は`search()`関数で開始され、以下の手順で実行されます：

1. **クエリベクトル化**: 入力クエリを埋め込みベクトルに変換
2. **並列検索実行**: `semaphore_gather()`を使用して4つの検索タイプを同時実行
3. **結果統合**: `SearchResults`オブジェクトに統合

## ■データ

### ●概念モデル

```mermaid
graph TD
    subgraph "Core Entities"
        EpisodicNode["EpisodicNode"]
        EntityNode["EntityNode"]
        CommunityNode["CommunityNode"]
    end

    subgraph "Relationships"
        EntityEdge["EntityEdge"]
        EpisodicEdge["EpisodicEdge"]
    end

    subgraph "Clients"
        GraphitiClient["GraphitiClient"]
        LLMClient["LLMClient"]
        EmbedderClient["EmbedderClient"]
    end

    GraphitiClient --> EpisodicNode
    GraphitiClient --> EntityNode
    GraphitiClient --> CommunityNode
    GraphitiClient --> LLMClient
    GraphitiClient --> EmbedderClient

    EntityEdge --> EntityNode
    EpisodicEdge --> EpisodicNode
```

### ●情報モデル

```mermaid
classDiagram
    class EpisodicNode {
        +uuid: str
        +name: str
        +group_id: str
        +content: str
        +source: str
        +source_description: str
        +created_at: datetime
        +valid_at: datetime
    }

    class EntityNode {
        +uuid: str
        +name: str
        +group_id: str
        +summary: str
        +labels: list[str]
        +created_at: datetime
        +name_embedding: list[float]
    }

    class EntityEdge {
        +uuid: str
        +name: str
        +group_id: str
        +fact: str
        +created_at: datetime
        +valid_at: datetime
        +invalid_at: datetime
        +expired_at: datetime
        +fact_embedding: list[float]
        +episodes: list[str]
    }

    class Graphiti {
        +driver: AsyncDriver
        +llm_client: LLMClient
        +embedder: EmbedderClient
        +cross_encoder: CrossEncoderClient
        +add_episode()
        +search()
        +build_indices_and_constraints()
    }

    EntityEdge --|> EntityNode : connects
    EpisodicNode --|> EntityNode : mentions
    Graphiti --|> EpisodicNode : manages
    Graphiti --|> EntityNode : manages
    Graphiti --|> EntityEdge : manages
```

### ●主要な概念の関係

```mermaid
graph TD
    subgraph "データ階層"
        Episode["EpisodicNode<br/>エピソード"]
        Entity["EntityNode<br/>エンティティ"]
        Fact["EntityEdge<br/>ファクト"]
        Community["CommunityNode<br/>コミュニティ"]
    end
    
    subgraph "関係性"
        Episode -->|"MENTIONS<br/>言及"| Entity
        Entity -->|"RELATES_TO<br/>関係"| Entity
        Community -->|"HAS_MEMBER<br/>メンバー"| Entity
        Fact -.->|"fact属性で記述"| Entity
    end
    
    subgraph "時間的側面"
        ValidAt["valid_at<br/>有効開始時刻"]
        InvalidAt["invalid_at<br/>無効化時刻"]
        ExpiredAt["expired_at<br/>期限切れ時刻"]
    end
    
    Fact --> ValidAt
    Fact --> InvalidAt
    Fact --> ExpiredAt
```

- **エピソード（EpisodicNode）**
    - エピソードは情報の入力単位で、生のコンテンツを保持します。
- **エンティティ（EntityNode）**
    - エンティティは実世界の概念（人、場所、組織など）を表現し、名前の埋め込みベクトルとサマリーを持ちます。
- **ファクト（EntityEdge）**
    - ファクトはエンティティ間の関係を自然言語で記述し、時間的な有効性情報を含みます。
- **コミュニティ（CommunityNode）**
    - コミュニティは関連するエンティティのクラスターを表現し、グラフクラスタリングアルゴリズムによって自動生成されます。

### ●主要な概念の登録処理フロー

```mermaid
flowchart TD
    Input["エピソード入力"] --> Extract["エンティティ・ファクト抽出"]
    Extract --> Resolve["重複解決・時間的検証"]
    Resolve --> Store["グラフデータベース保存"]
    Store --> Community["コミュニティ検出"]
    
    subgraph "データベース層"
        EpisodicSave["EPISODIC_NODE_SAVE"]
        EntitySave["ENTITY_NODE_SAVE"]
        EdgeSave["ENTITY_EDGE_SAVE"]
        CommunitySave["COMMUNITY_NODE_SAVE"]
    end
    
    Store --> EpisodicSave
    Store --> EntitySave
    Store --> EdgeSave
    Community --> CommunitySave
```

## ■構築方法

### 前提条件

- Python 3.10以上をインストールします
- Neo4j 5.26以上を準備します
- OpenAI APIキーを取得します

### パッケージインストール

```bash
pip install graphiti-core
```

または

```bash
poetry add graphiti-core
```

### 追加プロバイダーのインストール

```bash
# Anthropicサポート付き
pip install graphiti-core[anthropic]

# Groqサポート付き
pip install graphiti-core[groq]

# Google Geminiサポート付き
pip install graphiti-core[google-genai]

# 複数プロバイダー
pip install graphiti-core[anthropic,groq,google-genai]
```

### 環境変数設定

```bash
export OPENAI_API_KEY=your_openai_api_key_here
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=password
```

## ■利用方法

### 基本的な初期化

```python
from graphiti_core import Graphiti

# Graphitiクライアントの初期化
graphiti = Graphiti(
    uri="bolt://localhost:7687",
    user="neo4j", 
    password="password"
)

# インデックスと制約の構築
await graphiti.build_indices_and_constraints()
```

### エピソードの追加

```python
# テキストエピソードの追加
await graphiti.add_episode(
    name="会議メモ",
    episode_body="プロジェクトの進捗について議論しました",
    source=EpisodeType.text,
    group_id="project_alpha"
)

# JSONエピソードの追加
await graphiti.add_episode(
    name="顧客データ",
    episode_body='{"company": {"name": "Acme Corp"}, "contact": "john@acme.com"}',
    source=EpisodeType.json,
    group_id="customers"
)
```

### 検索の実行

```python
# ノード検索
search_results = await graphiti.search(
    query="プロジェクトの進捗",
    group_ids=["project_alpha"],
    limit=10
)

# ファクト検索
fact_results = await graphiti.search_facts(
    query="顧客情報",
    group_ids=["customers"],
    limit=5
)
```

### MCPサーバーの起動

```bash
# SSEトランスポート（デフォルト）
uv run graphiti_mcp_server.py --transport sse

# stdioトランスポート
uv run graphiti_mcp_server.py --transport stdio

# カスタム設定
uv run graphiti_mcp_server.py --model gpt-4.1-mini --group-id my-project
```

## ■運用

### ヘルスチェック

```python
# データベース接続確認
async def check_health():
    try:
        await graphiti.driver.verify_connectivity()
        return {"status": "healthy"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
```

### バックグラウンド処理の監視

MCPサーバーでは、グループIDごとに専用のキューワーカーが動作します：

```python
# エピソード処理キューの状態確認
episode_queues = {}  # グループIDごとのキュー
queue_workers = {}   # ワーカーの状態管理
```

### データ管理

```python
# グラフのクリア
await graphiti.clear_graph()

# 特定グループの削除
await zep_graphiti.delete_group(group_id="old_project")

# エピソードの削除
await zep_graphiti.delete_episodic_node(episode_uuid)
```

### Docker運用

```bash
# Docker Composeでの起動
docker-compose up -d

# ログ確認
docker-compose logs graphiti-mcp-server

# 停止
docker-compose down
```

## ■参考リンク

- **概要**
    - [Graphiti - Overview | Zep Help Center](https://help.getzep.com/graphiti/graphiti/overview)
    - [DeepWiki - getzep/graphiti - 1-overview](https://deepwiki.com/getzep/graphiti/1-overview)
    - [arxiv - Zep: A Temporal Knowledge Graph Architecture for Agent Memory](https://arxiv.org/abs/2501.13956)
- **構造**
    - [DeepWiki - getzep/graphiti - 4-system-architecture](https://deepwiki.com/getzep/graphiti/4-system-architecture)
    - [DeepWiki - getzep/graphiti - 4.1-graphiti-core](https://deepwiki.com/getzep/graphiti/4.1-graphiti-core)
    - [DeepWiki - getzep/graphiti - 4.2-search-system](https://deepwiki.com/getzep/graphiti/4.2-search-system)
    - [DeepWiki - getzep/graphiti - 4.3-llm-integration](https://deepwiki.com/getzep/graphiti/4.3-llm-integration)
    - [DeepWiki - getzep/graphiti - 4.4-embedding-and-reranking](https://deepwiki.com/getzep/graphiti/4.4-embedding-and-reranking)
- **情報**
    - [DeepWiki - getzep/graphiti - 3-core-concepts](https://deepwiki.com/getzep/graphiti/3-core-concepts)
    - [DeepWiki - getzep/graphiti - 3.1-knowledge-graph-model](https://deepwiki.com/getzep/graphiti/3.1-knowledge-graph-model)
    - [Graphiti - Custom Entity Types | Zep Help Center](https://help.getzep.com/graphiti/graphiti/custom-entity-types)
    - [Graphiti - Adding Fact Triples | Zep Help Center](https://help.getzep.com/graphiti/graphiti/adding-fact-triples)
- **構築方法**
    - [Graphiti - Installation | Zep Help Center](https://help.getzep.com/graphiti/graphiti/installation)
    - [DeepWiki - getzep/graphiti - 2-getting-started](https://deepwiki.com/getzep/graphiti/2-getting-started)
    - [DeepWiki - getzep/graphiti - 5-deployment-options](https://deepwiki.com/getzep/graphiti/5-deployment-options)
- **利用方法**
    - [Graphiti - Quick Start | Zep Help Center](https://help.getzep.com/graphiti/graphiti/quick-start)
    - [Graphiti - Adding Episodes | Zep Help Center](https://help.getzep.com/graphiti/graphiti/adding-episodes)
    - [Graphiti - Searching | Zep Help Center](https://help.getzep.com/graphiti/graphiti/searching)
    - [Graphiti - Communities | Zep Help Center](https://help.getzep.com/graphiti/graphiti/communities)
    - [Graphiti - CRUD Operations | Zep Help Center](https://help.getzep.com/graphiti/graphiti/crud-operations)
    - [Graphiti - LangGraph Agent | Zep Help Center](https://help.getzep.com/graphiti/graphiti/lang-graph-agent)
    - [DeepWiki - getzep/graphiti - 6-advanced-usage](https://deepwiki.com/getzep/graphiti/6-advanced-usage)
- **運用**
    - [Graphiti - Graph Namespacing | Zep Help Center](https://help.getzep.com/graphiti/graphiti/graph-namespacing)


この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！
