---
title: "技術調査 - 全社AIゲートウェイ（Internal Key方式の入口プロキシ）"
emoji: "🚪"
type: "tech"
topics: ["LLM", "LiteLLM", "生成AI", "セキュリティ", "アーキテクチャ"]
published: false
---

全社の LLM / AI エージェント利用を単一の入口プロキシに集約し、認証情報の抽象化・利用可視化・レート制御・監査・ガードレールを提供する設計パターンを整理します。C4 構造・データモデル・構築/運用手順まで、実装に落とせる粒度でまとめます。起点はソフトバンクの社内共通 AI ゲートウェイ「Cloud Proxy」事例ですが、LiteLLM Proxy / Portkey AI Gateway / Kong AI Gateway / Cloudflare AI Gateway など代表実装の共通概念として一般化します。

> 調査日: 2026-07-09 / 主対象バージョン: LiteLLM Proxy（self-host OSS）を中心に検証

## 概要

### 解く課題

企業が複数の LLM プロバイダを全社導入すると、次の 4 つの限界に直面します。

| 限界 | 内容 |
|---|---|
| 認証情報管理 | 外部 API キーを部門・アプリ単位に直配りすると、キーの横流し・漏えいリスクが増える |
| 利用可視化 | どのチーム・どのシステムが何トークン使ったか、リクエスト単位で追跡できない |
| 性能・可用性 | プロバイダ障害時のフェイルオーバーやレート制御を各アプリが個別実装する必要がある |
| コスト統制 | 部門別・システム別の予算上限やコスト配賦ができない |

外部 API キーをアプリごとに直配りする方式は、初期は簡便です。しかし利用者数・接続システム数が増えるほど、キー管理コストとセキュリティリスクが線形以上に増大します。エンタープライズ AI ゲートウェイは、この直配り方式をやめ、入口を一本化したプロキシに認証情報の抽象化・利用可視化・レート制御・監査・ガードレールを集約する設計パターンです。

### 位置づけ

AI ゲートウェイは、隣接する 3 つの概念と役割が異なります。

| 概念 | 主な役割 | AI ゲートウェイとの関係 |
|---|---|---|
| API ゲートウェイ | REST/gRPC 全般のルーティング・認証・レート制御 | トークン課金・コンテキスト長・モデル単位の可観測性など LLM 固有の関心事を持たない |
| LLM プロキシ | リクエストを転送しログを付与するだけの薄い中継 | 意思決定を行わない点でゲートウェイと区別される |
| モデルルーター | コスト・レイテンシ・プロンプト内容に基づき最適なモデル/プロバイダを選択する決定層 | ゲートウェイの一機能として内包されることが多い |

AI ゲートウェイは、これらを内包します。そのうえで「リクエスト送信者の ID を認識し、その ID に紐づくポリシー（予算・レート・ガードレール）を強制する」点が決定的な違いです。API ゲートウェイが経路の入口であるのに対し、AI ゲートウェイは LLM トラフィックに特化したポリシー実行点として機能します。

### ソフトバンク事例: Internal Key 方式による入口一本化

ソフトバンクの社内共通 AI ゲートウェイ「Cloud Proxy」は、この設計パターンの実例です。

- **課題**: 外部サービスの API キーを利用者へ直配りすると、キーの横流しリスクや、顧客が外部サービスの認証画面に直接触れることによる情報漏えいリスクがある
- **Internal Key 方式**: テナント（利用部門）と利用者ごとに Internal Key を発行し、検証と認可を一元管理する。認可されたリクエストのみが外部サービスの API キーへ変換される。利用者は外部プロバイダの実キーに一切触れない
- **中央記録**: リクエストログを Internal Key 単位で記録し、トークン単位の使用量とモデル別の利用状況を追跡する
- **入口一本化**: Azure OpenAI・Gemini・Sarashina など複数の外部 LLM に対応しながら単一エントリーポイントを提供し、新モデルの追加は約 1 週間で対応できる
- **IdP 連携**: 複数の IdP（Identity Provider）に対応し、既存のエンタープライズアクセス制御を流用する

定量的な成果は次のとおりです。

| 指標 | 値 |
|---|---|
| 利用規模 | 240 システム、2 万人超が利用 |
| 想定トラフィック規模 | 1 日あたり 3,000 万リクエスト超 |
| スケールアウト所要時間 | 約 5 分 |
| スケールアウト成果 | 14 日間という短期間で、スループット上限を 2 倍へ引き上げるスケールアウトを実施 |
| モデル追加リードタイム | 数か月から約 1 週間へ短縮 |

Internal Key 方式・中央記録・入口一本化という 3 点セットは、後述する LiteLLM の Virtual Key、Portkey の Virtual Key、Kong の Secrets management など、代表実装に共通する設計思想です。

### 代表実装の比較

| 実装 | 実行方式 | 対応プロバイダ | コスト/利用可視化 | ガードレール | キャッシュ | キー抽象化 |
|---|---|---|---|---|---|---|
| LiteLLM Proxy | OSS/self-host（Enterprise は SaaS 併用） | 100+ (OpenAI, Anthropic, Azure, Bedrock, VertexAI 等) | キー・チーム・ユーザー単位の spend 追跡、予算・レート制限 | PII マスキング・コンテンツフィルタ等（組み込みは限定的） | 応答キャッシュあり | Virtual Key あり |
| Portkey AI Gateway | OSS（self-host 無料）+ SaaS | 1,600+ LLM | リクエスト単位のモニタリング、トレース、コスト集計 | 多数の AI Guardrails | Simple/Semantic キャッシュ（Semantic は Enterprise 限定） | Virtual Key あり |
| Kong AI Gateway | SaaS（Konnect）/self-host/プラグイン群 | OpenAI, Anthropic, Azure AI 等（Universal API） | リクエスト・トークン量とエラー率の監視 | AI Prompt Guard, Azure Content Safety, AWS/GCP Guardrails 連携 | Semantic キャッシュあり | Config Store でプロバイダキーを秘匿管理 |
| Cloudflare AI Gateway | エッジ（グローバルネットワーク上の SaaS） | OpenAI, Anthropic, Google, Replicate, Workers AI 等 | リクエスト数・トークン数・コストの Analytics | レート制限中心 | エッジキャッシュあり | プロバイダキーはアプリ側管理が前提 |
| Databricks/MLflow AI Gateway | Databricks 内蔵（MLflow OSS は self-host 可） | Model Serving エンドポイント経由の主要プロバイダ | トレース・評価・プロンプト管理と統合 | Databricks 側のガードレールと統合 | ルーティング/フォールバック機能あり | Unity Catalog principal に紐づく ID ベース認可 |

> Databricks/MLflow 行はベンダー比較ページを補助情報として参照しています。機能の一次確認は各製品の公式ドキュメントで行ってください。

選定の勘所は次のとおりです。LiteLLM は OSS で低コストに始めたいチーム、Portkey はガードレール数と観測性を重視するチーム、Kong は既存の Kong Gateway 資産を持つチーム、Cloudflare はエッジでの低レイテンシとキャッシュを優先するチームに向きます。ソフトバンク Cloud Proxy のような内製 Internal Key 方式は、これらの OSS/SaaS 実装が提供する Virtual Key 機構を、自社の IdP・課金体系に合わせて拡張したものと位置づけられます。

## 特徴

- **入口一本化**: アプリケーションは単一エンドポイントに接続するだけで、背後の複数 LLM プロバイダを意識しない
- **認証情報の抽象化（Virtual Key/Internal Key）**: 利用者・部門ごとに発行した内部キーを、ゲートウェイが実プロバイダの API キーへ変換する。利用者は実キーに触れない
- **利用の可視化**: リクエスト・トークン・コストをキー/チーム/ユーザー単位で記録し、ダッシュボードで参照できる
- **予算・レート制御**: キー/チーム単位で予算上限・レート制限を設定し、超過時にブロックまたはアラートできる
- **中央監査ログ**: すべてのリクエストをキー単位で記録し、誰がいつ何を使ったかを追跡できる
- **ガードレール**: PII マスキング・コンテンツフィルタ・プロンプトインジェクション対策などをリクエスト経路上で一括適用できる
- **キャッシュ**: 完全一致または意味的類似度に基づくキャッシュで、レイテンシとコストを削減できる
- **フェイルオーバー・ロードバランシング**: プロバイダ障害時に別プロバイダへ自動切り替えできる
- **IdP/エンタープライズ ID 連携**: 既存の SSO/IdP と統合し、アクセス制御を二重管理しない
- **迅速なモデル追加**: 新モデル・新プロバイダの追加を、既存アプリの改修なしに数日単位で行える
- **スケールアウト耐性**: トラフィック急増時に短時間でスケールアウトできる設計が前提になる

## 構造

エンタープライズ AI ゲートウェイの構造を C4 model の 3 段階（システムコンテキスト → コンテナ → コンポーネント）で図解します。加えて、入口プロキシへの一本化と egress 遮断という「境界そのものをアーキテクチャにする」設計思想を、ネットワーク構成図として独立させて示します。

### システムコンテキスト図

AI ゲートウェイを 1 つのシステムとして扱い、周囲のアクターと外部システムとの関係を示します。この段階では具体的な製品名を使いません。

```mermaid
flowchart TB
    subgraph Actors["利用者"]
        DevAgent["開発者/<br/>AIエージェント"]
        Employee["社員"]
        PlatformOp["プラットフォーム<br/>運用者"]
        SecAdmin["セキュリティ<br/>管理者"]
    end
    Gateway["AIゲートウェイ"]
    subgraph External["外部システム"]
        LLMProviders["LLM<br/>プロバイダ群"]
        IdP["IdP・SSO"]
        Observability["監視基盤"]
        SecretMgr["シークレット<br/>管理基盤"]
    end
    DevAgent -->|API呼出| Gateway
    Employee -->|チャット利用| Gateway
    PlatformOp -->|設定・運用| Gateway
    SecAdmin -->|監査・ポリシー| Gateway
    Gateway -->|推論API呼出| LLMProviders
    Gateway -->|認証委譲| IdP
    Gateway -->|メトリクス送信| Observability
    Gateway -->|鍵参照| SecretMgr
```

#### 利用者

| 要素名 | 説明 |
|---|---|
| 開発者/AIエージェント | Internal Key を使ってゲートウェイ経由で LLM 呼び出しを行う開発者本人、および自律実行される AI エージェントプロセス |
| 社員 | チャット UI やアプリ組み込み機能を通じて業務で LLM を利用する一般社員 |
| プラットフォーム運用者 | ゲートウェイ自体の可用性・ルーティング設定・キー発行・予算設定を維持するチーム |
| セキュリティ管理者 | ガードレールポリシー・監査要件・アクセス権限を定義する役割 |

#### 調査対象

| 要素名 | 説明 |
|---|---|
| AIゲートウェイ | 全社の LLM/AI エージェント利用を集約する単一の入口プロキシ。認証情報抽象化・ルーティング・レート/予算制御・利用可視化・監査・ガードレールを提供する |

#### 外部システム

| 要素名 | 説明 |
|---|---|
| LLMプロバイダ群 | 実際に推論を実行する外部/内部のモデル提供元 |
| IdP・SSO | 社員・開発者の認証、およびロール/グループ情報をゲートウェイに提供する ID 基盤 |
| 監視基盤 | ゲートウェイが発するメトリクス・トレース・ログを受け取り可視化する基盤 |
| シークレット管理基盤 | プロバイダ API キー等の機密情報を安全に保管し、ゲートウェイに払い出すボールト |

### コンテナ図

AI ゲートウェイの内部を主要コンテナ単位に分解します。この段階でも具体的な製品名を使いません。

```mermaid
flowchart TB
    subgraph ActorsC["利用者"]
        DevAgentC["開発者/<br/>AIエージェント"]
        EmployeeC["社員"]
        PlatformOpC["プラットフォーム<br/>運用者"]
        SecAdminC["セキュリティ<br/>管理者"]
    end
    subgraph GatewayBoundary["AIゲートウェイ"]
        Ingress["受信プロキシ/<br/>API互換レイヤ"]
        AuthKey["認証・<br/>Virtual Key解決"]
        Router["ルーター/<br/>ロードバランサ"]
        RateBudget["レート/<br/>予算制御"]
        Guardrail["ガードレール/<br/>PIIフィルタ"]
        Cache["キャッシュ"]
        AuditStore["利用ログ/<br/>監査ストア"]
        AdminUI["管理UI/API"]
    end
    subgraph ExternalC["外部システム"]
        LLMProvidersC["LLM<br/>プロバイダ群"]
        IdPC["IdP・SSO"]
        ObservabilityC["監視基盤"]
        SecretMgrC["シークレット<br/>管理基盤"]
    end
    DevAgentC --> Ingress
    EmployeeC --> Ingress
    Ingress --> AuthKey
    AuthKey --> RateBudget
    RateBudget --> Guardrail
    Guardrail --> Cache
    Cache --> Router
    Router --> LLMProvidersC
    AuthKey --> IdPC
    AuthKey --> SecretMgrC
    RateBudget --> AuditStore
    Guardrail --> AuditStore
    Router --> AuditStore
    AuditStore --> ObservabilityC
    PlatformOpC --> AdminUI
    SecAdminC --> AdminUI
    AdminUI --> AuthKey
    AdminUI --> RateBudget
    AdminUI --> Guardrail
    AdminUI --> AuditStore
```

#### AIゲートウェイ内部コンテナ

| 要素名 | 説明 |
|---|---|
| 受信プロキシ/API互換レイヤ | クライアントからのリクエストを受け付け、各プロバイダの API 形式に依存しない共通インターフェースへ正規化する |
| 認証・Virtual Key解決 | Internal Key を検証し、実プロバイダキー・利用者/チーム・予算枠へマッピングする |
| ルーター/ロードバランサ | モデル・プロバイダ選択、複数プロバイダ間の負荷分散、フォールバック/リトライを担う |
| レート/予算制御 | ユーザー・チーム・キー単位の RPM/TPM 制限と予算消費を追跡し、超過時にリクエストを拒否する |
| ガードレール/PIIフィルタ | プロンプト/レスポンスに対する禁止語・PII 検出・ポリシー違反チェックを行う |
| キャッシュ | 完全一致/セマンティック一致したリクエストの応答を再利用する |
| 利用ログ/監査ストア | すべてのリクエスト/レスポンスのメタデータ・コスト・トレースを永続化する |
| 管理UI/API | キー発行、予算設定、ルーティング設定、ガードレールポリシー、監査ログ閲覧を行う管理面 |

#### 外部システム

| 要素名 | 説明 |
|---|---|
| LLMプロバイダ群 | ルーターが実際にリクエストを転送する推論先 |
| IdP・SSO | 認証・Virtual Key 解決コンテナが利用者/チームの照合に使う |
| 監視基盤 | 利用ログ/監査ストアからメトリクス・トレースを受け取る |
| シークレット管理基盤 | 認証・Virtual Key 解決コンテナが実プロバイダキーを取得する先 |

### コンポーネント図

各コンテナをさらに分解し、代表実装に見られる典型的なコンポーネントを具体例として示します。

```mermaid
flowchart TB
    subgraph CG1["受信プロキシ/API互換レイヤ"]
        CG1a["OpenAI互換<br/>APIサーバ"]
        CG1b["Envoy/Kong<br/>データプレーン"]
        CG1c["Workers<br/>実行環境"]
    end
    subgraph CG2["認証・Virtual Key解決"]
        CG2a["Virtual Key<br/>ストア"]
        CG2b["Provider Key<br/>マッピング"]
        CG2c["RBAC・<br/>チーム権限"]
    end
    subgraph CG3["ルーター/ロードバランサ"]
        CG3a["モデル<br/>ルーター"]
        CG3b["フォールバック・<br/>リトライ"]
        CG3c["モデルI/F<br/>正規化層"]
    end
    subgraph CG4["レート/予算制御"]
        CG4a["並列リクエスト<br/>制御"]
        CG4b["予算<br/>トラッカー"]
    end
    subgraph CG5["ガードレール/PIIフィルタ"]
        CG5a["Prompt Guard<br/>プラグイン"]
        CG5b["PII<br/>Sanitizer"]
        CG5c["外部Guardrails<br/>API連携"]
    end
    subgraph CG6["キャッシュ"]
        CG6a["セマンティック<br/>キャッシュ"]
        CG6b["Redis・<br/>インメモリ<br/>キャッシュ"]
    end
    subgraph CG7["利用ログ/監査ストア"]
        CG7a["非同期<br/>ロガー"]
        CG7b["OTel<br/>Exporter"]
        CG7c["監査DB・<br/>台帳ストア"]
    end
    subgraph CG8["管理UI/API"]
        CG8a["管理API"]
        CG8b["管理<br/>ダッシュボード"]
    end
    CG1a --> CG1b
    CG1b --> CG2a
    CG2a --> CG2b
    CG2a --> CG2c
    CG2a --> CG4a
    CG4a --> CG4b
    CG4a --> CG5a
    CG5a --> CG5b
    CG5b --> CG5c
    CG5a --> CG6a
    CG6a --> CG6b
    CG6a --> CG3a
    CG3a --> CG3b
    CG3a --> CG3c
    CG3c --> CG7a
    CG7a --> CG7b
    CG7b --> CG7c
    CG8a --> CG2a
    CG8a --> CG4a
    CG8a --> CG5a
    CG8a --> CG7c
    CG8b --> CG8a
```

#### 受信プロキシ/API互換レイヤ

| 要素名 | 説明 |
|---|---|
| OpenAI互換APIサーバ | LiteLLM Proxy Server や各実装の OpenAI/Anthropic 互換エンドポイント。クライアントは既存 SDK のまま送信先だけをゲートウェイに向けられる |
| Envoy/Kongデータプレーン | Kong AI Gateway が Envoy 系のデータプレーン上に構築するプラグイン実行層。ai-proxy/ai-proxy-advanced プラグインがここで動く |
| Workers実行環境 | Cloudflare AI Gateway が Workers 上でリクエストを受け付け、複数プロバイダへ振り分ける実行基盤 |

#### 認証・Virtual Key解決

| 要素名 | 説明 |
|---|---|
| Virtual Keyストア | LiteLLM や Portkey が発行する Internal Key を Redis/インメモリキャッシュ優先で検証し、DB 参照を最小化する |
| Provider Keyマッピング | Virtual Key からバックエンドのプロバイダ API キーへの対応関係を保持し、実キーをクライアントに露出させない |
| RBAC・チーム権限 | Portkey のロールベースアクセス制御や LiteLLM の team/user 階層に相当し、キーごとの利用範囲を制限する |

#### ルーター/ロードバランサ

| 要素名 | 説明 |
|---|---|
| モデルルーター | LiteLLM Router に相当。モデル名からプロバイダ/デプロイを解決し複数候補間で負荷分散する |
| フォールバック・リトライ | 呼び出し失敗時に代替プロバイダ/モデルへ自動的に切り替える機構 |
| モデルI/F正規化層 | 各プロバイダ固有のリクエスト/レスポンス形式を litellm SDK のようなアダプタで共通形式に変換する |

#### レート/予算制御

| 要素名 | 説明 |
|---|---|
| 並列リクエスト制御 | LiteLLM の MaxParallelRequestsHandler に相当し、RPM/TPM をグローバル・キー・チーム単位で検証する |
| 予算トラッカー | 累積コストを追跡し予算上限に達したキー/チームのリクエストを拒否する |

#### ガードレール/PIIフィルタ

| 要素名 | 説明 |
|---|---|
| Prompt Guardプラグイン | Kong AI Gateway の ai-prompt-guard に相当。許可/拒否リストやセマンティック判定でプロンプトを検査する |
| PII Sanitizer | Kong の ai-pii-sanitizer や Portkey の入出力ガードレールに相当し、個人情報をマスキング/ブロックする |
| 外部Guardrails API連携 | クラウド各社のコンテンツセーフティ API を呼び出す連携点 |

#### キャッシュ

| 要素名 | 説明 |
|---|---|
| セマンティックキャッシュ | Kong の ai-semantic-cache に相当。意味的に類似したプロンプトへのヒット判定を行う |
| Redis・インメモリキャッシュ | LiteLLM が Virtual Key 検証やレスポンス完全一致キャッシュに用いる Redis/In-Memory Cache |

#### 利用ログ/監査ストア

| 要素名 | 説明 |
|---|---|
| 非同期ロガー | リクエスト応答経路と切り離してバックグラウンドで使用量/コストを DB へ書き込む |
| OTel Exporter | 各リクエストの span を発行し、OpenTelemetry Collector へ送る |
| 監査DB・台帳ストア | Langfuse/MLflow 等の外部ログシステムや内部 DB に永続化された監査可能なログ台帳 |

#### 管理UI/API

| 要素名 | 説明 |
|---|---|
| 管理API | キー発行・予算設定・ルーティング設定を操作する REST/管理 API |
| 管理ダッシュボード | 利用状況・コスト・ガードレール違反を可視化する Web UI |

### ネットワーク構成図

AI ゲートウェイの価値は「ポリシーを守らせる」ことではなく「構造的に他の経路を塞ぐ」ことにあります。CNCF のブログ記事は、この考え方を NGINX + OpenTelemetry で実装する例を示します。入口側（リバースプロキシ・TLS 終端）と出口側（フォワードプロキシ）の双方に NGINX を配置し、iptables でゲートウェイ経由以外の全 egress を遮断します。これにより「AI エージェントの全通信がゲートウェイを通る」ことが、ポリシー遵守ではなくネットワーク構造そのものによって保証されます（boundary as architecture）。あわせて NGINX の OTEL モジュールが全リクエストの span を発行し、OpenTelemetry Collector 経由で監査ログや監視基盤に集約されます。

```mermaid
flowchart TB
    subgraph ZoneInternal["社内ネットワーク"]
        Caller["開発者・社員・<br/>AIエージェント"]
    end
    subgraph ZoneGateway["AIゲートウェイ<br/>ホスト境界"]
        InboundProxy["Inbound NGINX<br/>TLS終端"]
        GatewayCore["ゲートウェイ<br/>コア処理"]
        OTelSpan["OTelスパン<br/>発行"]
        OutboundProxy["Outbound NGINX<br/>フォワードプロキシ"]
        IptablesRule["iptables<br/>egress遮断"]
    end
    subgraph ZoneExternal["外部ネットワーク"]
        LLMProvidersN["LLM<br/>プロバイダ群"]
    end
    subgraph ZoneAudit["可観測性・<br/>監査基盤"]
        OTelCollector["OTel<br/>Collector"]
        AuditLogStore["監査ログ<br/>ストア"]
        SIEM["SIEM・<br/>監視ダッシュボード"]
    end
    Caller --> InboundProxy
    InboundProxy --> GatewayCore
    GatewayCore --> OTelSpan
    GatewayCore --> OutboundProxy
    OutboundProxy --> IptablesRule
    IptablesRule --> LLMProvidersN
    OTelSpan --> OTelCollector
    OTelCollector --> AuditLogStore
    OTelCollector --> SIEM
```

#### AIゲートウェイホスト境界

| 要素名 | 説明 |
|---|---|
| Inbound NGINX TLS終端 | リバースプロキシとしてクライアントからの TLS を終端し、ゲートウェイコアへ引き渡す |
| ゲートウェイコア処理 | 認証・ルーティング・レート制御・ガードレール等の処理本体 |
| OTelスパン発行 | ゲートウェイコアの処理単位ごとに OpenTelemetry の span を生成する |
| Outbound NGINX フォワードプロキシ | プロバイダへの全アウトバウンド通信が通る唯一の経路 |
| iptables egress遮断 | Outbound NGINX を経由しない全 egress 通信をホスト単位で拒否し、迂回経路を構造的に無くす |

#### 可観測性・監査基盤

| 要素名 | 説明 |
|---|---|
| OTel Collector | ゲートウェイが発行する span を収集し、監査ログストアや監視ツールへ分配する |
| 監査ログストア | ユーザー操作とエージェントの外部呼び出しを紐付けた形で永続化する保管先 |
| SIEM・監視ダッシュボード | Jaeger/Grafana/SIEM 等、収集した span を可視化・セキュリティ分析に用いるツール群 |

## データ

エンタープライズ AI ゲートウェイが扱う中核データを、概念モデル（エンティティと関係）と情報モデル（属性）の 2 段階で整理します。対象は LiteLLM Proxy / Portkey AI Gateway / Kong AI Gateway の 3 実装から共通概念を抽出したものです。

### 概念モデル

- **所有（利用主体の階層）**: Organization が Team を、Team が User を内包する
- **利用**: Virtual Key の発行、Model と Deployment のマッピング、Budget/RateLimit の適用、Usage Log の生成、Policy の適用、Route による選択を矢印で表現する

```mermaid
flowchart TD
    subgraph SG_ORG["Organization"]
        direction TB
        subgraph SG_TEAM["Team"]
            direction TB
            USR["User"]
        end
    end
    VK["Virtual Key / Internal Key"]
    PC["Provider Credential"]
    MODEL["Model"]
    DEPLOY["Deployment"]
    BUDGET["Budget"]
    RATELIMIT["Rate Limit"]
    LOG["Usage Log / Spend"]
    POLICY["Policy / Guardrail"]
    ROUTE["Route / Fallback"]
    SG_TEAM -->|"issues"| VK
    USR -->|"issues"| VK
    VK -->|"subject to"| BUDGET
    VK -->|"subject to"| RATELIMIT
    SG_TEAM -->|"subject to"| BUDGET
    SG_TEAM -->|"subject to"| RATELIMIT
    VK -->|"allows access to"| MODEL
    MODEL -->|"model_group maps to"| DEPLOY
    DEPLOY -->|"authenticates via"| PC
    ROUTE -->|"selects among"| DEPLOY
    VK -->|"routed via"| ROUTE
    VK -->|"generates"| LOG
    DEPLOY -->|"recorded in"| LOG
    POLICY -->|"applies to"| VK
    POLICY -->|"applies to"| DEPLOY
```

#### エンティティの要旨

| エンティティ | 役割 | 一次ソース上の対応 |
|---|---|---|
| Virtual Key / Internal Key | ユーザー/チーム/アプリに配る抽象キー。実プロバイダキーを直接渡さない | LiteLLM key(sk-...)、Portkey 旧 Virtual Key |
| Provider Credential | 実プロバイダの本物の API キー。ゲートウェイが暗号化保管 | LiteLLM litellm_params.api_key、Portkey Integration |
| Organization | 契約・課金単位の最上位。複数 Team を束ねる | LiteLLM Organization、Portkey Organization |
| Team | 部門・プロジェクト単位。共有予算/レート制限/モデル許可を持つ | LiteLLM LiteLLM_TeamTable、Portkey Workspace |
| User | 個人。Team に所属し個人予算を持てる（Team 所属時は Team 予算優先） | LiteLLM LiteLLM_UserTable |
| Model | 論理モデル名（公開エイリアス）。複数 Deployment をまとめる model_group | LiteLLM model_name |
| Deployment | 実デプロイ先（実モデル ID・エンドポイント・重み） | LiteLLM litellm_params、Kong upstream/target |
| Budget | 予算上限と消化額。金額/トークンベース、期間でリセット | LiteLLM max_budget/budget_duration |
| Rate Limit | TPM/RPM/同時実行数の制限 | LiteLLM tpm_limit/rpm_limit、Kong ai-rate-limiting-advanced |
| Usage Log / Spend | リクエスト単位の課金・トークン・レイテンシ記録 | LiteLLM LiteLLM_SpendLogs |
| Policy / Guardrail | PII/コンテンツフィルタ等の適用ルール | LiteLLM guardrails |
| Route / Fallback | ルーティング戦略と失敗時の切替先 | LiteLLM fallbacks、Portkey Configs |

### 情報モデル

```mermaid
classDiagram
    class VirtualKey {
        string key_id
        string key_alias
        string hashed_secret
        string status
        list allowed_models
        datetime expires_at
        float max_budget
        string budget_duration
        int tpm_limit
        int rpm_limit
        int max_parallel_requests
        float spend
        map metadata
    }
    class ProviderCredential {
        string credential_id
        string provider
        string api_base
        string api_key_encrypted
        string integration_id
        datetime created_at
    }
    class Organization {
        string org_id
        string name
        datetime created_at
    }
    class Team {
        string team_id
        string team_alias
        list member_roles
        float max_budget
        string budget_duration
        int tpm_limit
        int rpm_limit
        list allowed_models
        float spend
        map metadata
    }
    class User {
        string user_id
        string email
        string role
        float max_budget
        float spend
        map metadata
    }
    class Model {
        string model_name
        string model_group
        bool is_public_alias
        string description
    }
    class Deployment {
        string deployment_id
        string actual_model
        string provider
        string api_base
        int weight
        int rpm
        string region
    }
    class Budget {
        string budget_id
        float max_amount
        string budget_type
        string duration
        datetime reset_at
        float current_spend
    }
    class RateLimit {
        string rate_limit_id
        int tpm_limit
        int rpm_limit
        int max_parallel_requests
        int burst_limit
    }
    class UsageLog {
        string request_id
        datetime occurred_at
        string key_id
        string user_id
        string team_id
        string model_name
        string deployment_id
        int prompt_tokens
        int completion_tokens
        int total_tokens
        float spend
        int latency_ms
        string status
        string call_type
        set tags
        map metadata
    }
    class Policy {
        string policy_id
        string name
        string mode
        string type
        bool default_on
        map config
    }
    class Route {
        string route_id
        string strategy
        list targets
        list fallback_chain
        int retry_count
        int timeout_ms
    }
    Organization "1" --> "many" Team : owns
    Team "1" --> "many" User : has member
    Team "1" --> "many" VirtualKey : issues
    User "1" --> "many" VirtualKey : issues
    VirtualKey "many" --> "many" Model : allows access to
    Model "1" --> "many" Deployment : model_group maps to
    Deployment "many" --> "1" ProviderCredential : authenticates via
    VirtualKey "1" --> "0..1" Budget : subject to
    Team "1" --> "0..1" Budget : subject to
    VirtualKey "1" --> "0..1" RateLimit : subject to
    Team "1" --> "0..1" RateLimit : subject to
    Route "1" --> "many" Deployment : selects among
    VirtualKey "many" --> "1" Route : routed via
    VirtualKey "1" --> "many" UsageLog : generates
    Deployment "1" --> "many" UsageLog : recorded in
    Policy "many" --> "many" VirtualKey : applies to
    Policy "many" --> "many" Deployment : applies to
```

#### 属性の根拠と補完注記

- `VirtualKey`: 主要フィールドは LiteLLM Virtual Keys ドキュメント記載のものを採用。図の `key_id`・`hashed_secret` は LiteLLM がハッシュ化キーを内部的に保持する `token` フィールドを一般化した表現（`/key/info` 系レスポンスで `token` が確認できる）。`status` は実装から補完
- `Organization`: LiteLLM の公式ドキュメントは Organization オブジェクトの詳細構造を明示していない。属性は Team との対称性からの補完
- `Team`: 公式フィールド `team_id`/`team_alias`/`members_with_roles`/`tpm_limit`/`rpm_limit`/`max_budget`/`budget_duration`/`models`/`spend`/`metadata` を採用。図中の `member_roles`・`allowed_models` はそれぞれ公式名 `members_with_roles`・`models` を読みやすく一般化した表示名（意味は同一）
- `User`: Team 所属時は Team 予算が優先されユーザー個人予算は適用されない、という優先順位がドキュメントで明言されている
- `Budget`/`RateLimit`: LiteLLM は budget/rate limit を Key・Team・User の各オブジェクトに埋め込みフィールドとして持たせる設計。ここでは属性の共通性を可視化するため独立エンティティとして抽出している
- `UsageLog`: LiteLLM LiteLLM_SpendLogs のフィールドを採用。`latency_ms`/`status`/`occurred_at` は個別フィールド名がドキュメントに明示されないため実装から補完

## 構築方法

self-host OSS の代表実装である LiteLLM Proxy を主軸に、構築の手順とコード例を示します。Portkey AI Gateway は self-host 手順のみ補足します。

### 前提条件

| 項目 | 内容 |
|---|---|
| ランタイム | Python 3.8+（pip 導入時）または Docker |
| インストール方法 | pip install（litellm[proxy]）/ uv tool install / Docker イメージ |
| DB（Virtual Key 運用時） | PostgreSQL（接続文字列は DATABASE_URL） |
| 認証キー | Master Key（sk- 始まり必須）を発行元プロバイダとは別に自前で用意 |
| 公式イメージ | docker.litellm.ai/berriai/litellm:latest（DB なし）/ docker.litellm.ai/berriai/litellm-database:latest（DB あり）。ghcr.io/berriai/... も利用可。本番では main-v1.90.2 のような固定タグを推奨（main-stable タグは deprecated） |

### インストール

pip でインストールします（プロキシ拡張込み）。

```bash
pip install 'litellm[proxy]'
```

uv 経由のツールインストールも利用できます。

```bash
uv tool install 'litellm[proxy]'
```

### config.yaml の作成

`model_list` に `model_name`（利用者向けエイリアス）と `litellm_params`（実プロバイダへの接続情報）を書きます。`api_key` は `os.environ/VARIABLE_NAME` 記法で環境変数から注入できます。

```yaml
model_list:
  - model_name: gpt-4o
    litellm_params:
      model: azure/gpt-4o-eu
      api_base: https://my-endpoint.openai.azure.com/
      api_key: "os.environ/AZURE_API_KEY_EU"
      rpm: 6

general_settings:
  master_key: sk-1234
  database_connection_pool_limit: 10
```

`general_settings.master_key` は Proxy Admin 用の鍵です。他の Virtual Key を発行するための管理者キーであり、`sk-` で始まる必要があります。Master Key は `LITELLM_MASTER_KEY` 環境変数でも設定できます。

### プロバイダキーの環境変数注入

config.yaml 内で `os.environ/<NAME>` を指定した変数は、起動時に環境変数として渡します。

```bash
export AZURE_API_KEY_EU="<provider-api-key>"
```

### プロキシの起動（pip 導入時）

```bash
litellm --config config.yaml
```

デバッグログを付ける場合は次のとおりです。

```bash
litellm --config config.yaml --detailed_debug
```

### Docker でのセットアップ（DB なし、単純プロキシ）

```bash
docker pull docker.litellm.ai/berriai/litellm:latest

docker run \
  -v $(pwd)/config.yaml:/app/config.yaml \
  -e AZURE_API_KEY_EU=<provider-api-key> \
  -p 4000:4000 \
  docker.litellm.ai/berriai/litellm:latest \
  --config /app/config.yaml --detailed_debug
```

### Docker でのセットアップ（Postgres 接続あり、Virtual Key 運用向け）

`litellm-database` イメージを使うと、コンテナが Prisma マイグレーションを実行して DB を初期化します。

```bash
docker run \
  -v $(pwd)/config.yaml:/app/config.yaml \
  -e LITELLM_MASTER_KEY=sk-1234 \
  -e DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<dbname> \
  -e AZURE_API_KEY_EU=<provider-api-key> \
  -p 4000:4000 \
  docker.litellm.ai/berriai/litellm-database:latest \
  --config /app/config.yaml --detailed_debug
```

Docker Compose でプロキシと DB をまとめて起動する場合は次のとおりです。

```bash
curl -O https://raw.githubusercontent.com/BerriAI/litellm/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/BerriAI/litellm/main/prometheus.yml
echo 'LITELLM_MASTER_KEY="sk-1234"' > .env
echo 'LITELLM_SALT_KEY="sk-1234"' >> .env
docker compose up
```

`LITELLM_SALT_KEY` は保存済みプロバイダ認証情報の暗号化キーです。モデル追加後は変更できません。

### Portkey AI Gateway の self-host（補足）

npx で起動します（依存インストール不要）。

```bash
npx @portkey-ai/gateway
```

起動後、ゲートウェイは `http://localhost:8787/v1` で待ち受け、管理コンソールは `http://localhost:8787/public/` に立ちます。

## 利用方法

### 必須パラメータ一覧

| パラメータ | 値 / 指定場所 | 説明 |
|---|---|---|
| base_url | http://<gateway-host>:4000 | OpenAI SDK / curl の接続先をゲートウェイに向ける |
| Authorization ヘッダー | Bearer <virtual-key> または Bearer <master-key> | Virtual Key 未発行の検証時は Master Key でも通る |
| model | model_list[].model_name の値 | ゲートウェイ側のエイリアス名を指定する |
| エンドポイント | /v1/chat/completions | OpenAI 互換の chat completion API |

### OpenAI 互換エンドポイントへの切り替え

curl の例です。

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-1234" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Python OpenAI SDK の例です。`base_url` をゲートウェイに向けるだけで既存コードを流用できます。

```python
import openai

client = openai.OpenAI(
    api_key="sk-1234",  # Virtual Key または Master Key
    base_url="http://localhost:4000",
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "test"}],
)
```

### Virtual Key の発行

Master Key を使い、利用可能モデルとメタデータを指定して発行します。

```bash
curl 'http://0.0.0.0:4000/key/generate' \
  --header 'Authorization: Bearer sk-1234' \
  --header 'Content-Type: application/json' \
  --data-raw '{"models": ["gpt-4o", "gpt-3.5-turbo"], "metadata": {"user": "team-a@example.com"}}'
```

レスポンスの例です。

```json
{
  "key": "sk-tXL0wt5-lOOVK9sfY2UacA",
  "expires": "2023-11-19T01:38:25.834000+00:00"
}
```

発行された `key` を Authorization ヘッダーに設定してリクエストします。

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-tXL0wt5-lOOVK9sfY2UacA" \
  -d '{"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "Hello"}]}'
```

### team / budget 設定

チームを作成します。

```bash
curl --location 'http://localhost:4000/team/new' \
  --header 'Authorization: Bearer sk-1234' \
  --header 'Content-Type: application/json' \
  --data-raw '{"team_alias": "my-awesome-team"}'
```

チーム紐づけと予算上限付きの Virtual Key を発行します（`max_budget` は USD 換算の上限額）。

```bash
curl 'http://0.0.0.0:4000/key/generate' \
  --header 'Authorization: Bearer sk-1234' \
  --header 'Content-Type: application/json' \
  --data-raw '{"models": ["gpt-3.5-turbo", "gpt-4"], "team_id": "my-unique-id", "max_budget": 100}'
```

### ルーティング（model_group / fallbacks）

同じ `model_name` を複数の `litellm_params` で登録すると、その名前へのリクエストは登録済みデプロイ間でロードバランスされる model_group になります。proxy の config.yaml では `routing_strategy` を `router_settings` に置きます。`fallbacks` は `litellm_settings` と `router_settings` のどちらでも設定でき、公式ドキュメントの例も両方あります（本記事では `litellm_settings` に統一します）。

```yaml
model_list:
  - model_name: gpt-3.5-turbo
    litellm_params:
      model: azure/<deployment-name>
      api_base: <azure-endpoint>
      api_key: <azure-api-key>
      rpm: 6
  - model_name: gpt-4
    litellm_params:
      model: azure/gpt-4-ca
      api_base: https://my-endpoint-canada-berri992.openai.azure.com/
      api_key: <azure-api-key>
      rpm: 6

router_settings:
  routing_strategy: least-busy

litellm_settings:
  fallbacks: [{"gpt-3.5-turbo": ["gpt-4"]}]
```

`content_policy_fallbacks` / `context_window_fallbacks` も同様に `litellm_settings` 配下に置けます（コンテンツポリシー違反時 / コンテキスト長超過時専用の切り替え先）。

### キャッシュの有効化

`litellm_settings.cache: True` と `cache_params` で方式を指定します。Redis の例です。

```yaml
litellm_settings:
  set_verbose: True
  cache: True
  cache_params:
    type: "redis"
    host: "localhost"
    port: 6379
    password: "your_password"
    ttl: 600
```

ローカルインメモリキャッシュのみで良い場合の最小構成です。

```yaml
litellm_settings:
  cache: True
  cache_params:
    type: local
```

`type` は複数のバリアントに対応します（例: `local` / `redis` / `redis-semantic` / `s3` / `disk` / `gcs` / `qdrant-semantic` / `valkey-semantic`）。

### 他実装の入口切り替え例（Kong / Cloudflare）

Kong AI Gateway は `ai-proxy` プラグインをルートに適用し、`route_type` とプロバイダ・モデルを宣言的 config で指定します。実プロバイダキーは Kong 側で保持し、クライアントには公開しません。

```yaml
plugins:
  - name: ai-proxy
    config:
      route_type: "llm/v1/chat"
      auth:
        header_name: "Authorization"
        header_value: "Bearer <provider-api-key>"
      model:
        provider: "openai"
        name: "gpt-4o"
```

Cloudflare AI Gateway は OpenAI 互換エンドポイント（`compat`）を経由させ、送信先ホストをゲートウェイに向けるだけで既存の OpenAI 互換リクエストをプロキシできます。モデル名は `{provider}/{model}` 形式で指定します（`gateway_id` は未作成なら `default` を使える）。

```bash
curl https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_id>/compat/chat/completions \
  -H "Authorization: Bearer <provider-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai/gpt-4o", "messages": [{"role": "user", "content": "Hello"}]}'
```

## 運用

本セクションは稼働開始後の運用に集中します。

### 可観測性

ダッシュボードで最低限見るべき指標は次の 4 つです。

- リクエスト数・成功率
- team / key 別のトークン消費量とコスト
- モデル別レイテンシ（p50/p95/p99）
- エラー率（429 / 5xx / タイムアウト）

LiteLLM Proxy は `StandardLoggingPayload` にモデル名・入出力トークン数・推定コスト・ユーザー ID・team ID・開始終了時刻・レイテンシを記録します。Cloudflare AI Gateway の Analytics はリクエスト数・トークン数・コストを可視化します。Portkey の Observability はリクエストごとのコスト・トレース・ガードレール違反をリアルタイムに記録します。

**OpenTelemetry（OTEL）を監査ログへ**

LiteLLM は `callbacks: ["otel"]` を設定するだけで、リクエストごとに OTEL span を出力します。

```yaml
litellm_settings:
  callbacks: ["otel"]
```

```bash
export OTEL_EXPORTER="otlp_http"
export OTEL_ENDPOINT="http://0.0.0.0:4317"
export OTEL_SERVICE_NAME="litellm"
```

`traceparent` ヘッダーで分散トレース間の文脈を伝播でき、上流アプリのトレース ID とゲートウェイの span を結び付けられます。CNCF の記事では、NGINX native OpenTelemetry モジュールが全リクエストに OTEL span を出す構成を紹介しています。この span を OpenTelemetry Collector で永続化すると、そのまま監査ログとして機能します。

監査ログをアプリ内ログでなく通信境界で取る利点は次の 3 つです。

- 既存の可観測性ツール（Jaeger / Grafana / SIEM）に既存フォーマットのまま統合できる
- アプリの実装ミスや改変の影響を受けない（境界を通らないリクエストは存在しない）
- ユーザーのインタラクションとエージェントの外部呼び出しを相関付けられる

**機微情報のマスキング**

メッセージ内容を記録せずメタデータとコストだけ残したい場合は次を設定します。

```yaml
litellm_settings:
  turn_off_message_logging: true
  redact_user_api_key_info: true
```

リクエスト単位で無効化する場合は `"no-log": true` をボディに含めます。

### コスト管理

team / key の 2 階層で予算を設定できます。key が team に属する場合は team 予算が優先され、個人予算は適用されません。

```bash
curl 'http://localhost:4000/team/new' \
  -H 'Authorization: Bearer <master-key>' \
  -d '{"team_alias": "my-team", "max_budget": 100, "budget_duration": "30d"}'
```

```bash
curl 'http://0.0.0.0:4000/key/generate' \
  -H 'Authorization: Bearer <master-key>' \
  -d '{"max_budget": 10, "budget_duration": "30d"}'
```

予算超過時はリクエストが拒否され、エラーメッセージに現在の spend と上限が含まれます。Portkey の Virtual Key も同様にチーム単位で月額上限を設定でき、上限到達時は即座に 429 を返します。rate limit（RPM/TPM）は team / key / モデルの各粒度で設定できます。

```bash
curl 'http://0.0.0.0:4000/team/new' \
  -d '{"tpm_limit": 20, "rpm_limit": 4, "max_parallel_requests": 10}'
```

### キーローテーション・失効

LiteLLM は Master Key（管理者鍵）と Virtual Key（利用者鍵）でローテーション手順が異なります。Master Key のローテーションは既存モデルテーブルの暗号化情報を新鍵で再暗号化します。

```bash
curl -X POST 'http://localhost:4000/key/regenerate' \
  -H 'Authorization: Bearer sk-1234' \
  -d '{"key": "sk-1234", "new_master_key": "sk-PIp1h0RekR"}'
```

Virtual Key のローテーションは `key` パスパラメータで対象を指定します（`/key/{key}/regenerate` は LiteLLM Enterprise の機能）。

```bash
curl -X POST 'http://localhost:4000/key/sk-1234/regenerate' \
  -H 'Authorization: Bearer sk-1234' \
  -d '{"max_budget": 100}'
```

定期ローテーションに加え、次の契機では即時ローテーションを実施します。

- 依存ライブラリのサプライチェーン侵害が判明したとき
- 退職・異動でチームメンバー構成が変わったとき
- ログでキーの異常利用（急激な spend 増加、想定外の IP からのアクセス）を検知したとき

### フェイルオーバー・ルーティング

LiteLLM は 3 種類のフォールバックを使い分けます。

| フォールバック種別 | 発火条件 | 設定キー |
|---|---|---|
| 汎用フォールバック | 429 / 5xx などの全般エラー | fallbacks |
| コンテンツポリシー違反 | プロバイダのコンテンツフィルタ拒否 | content_policy_fallbacks |
| コンテキストウィンドウ超過 | 入力長超過エラー | context_window_fallbacks |

```yaml
litellm_settings:
  num_retries: 3
  request_timeout: 10
  allowed_fails: 3
  cooldown_time: 30
  fallbacks: [{"gpt-3.5-turbo": ["gpt-4"]}]
```

`allowed_fails` 回数を超えたデプロイは `cooldown_time` 秒だけ自動的にルーティング対象から外れ、フォールバック先へ誘導されます（`routing_strategy` は `router_settings` 側に置く）。同一 `model_name` に複数デプロイを登録すると model_group となり、`routing_strategy: least-busy` 等でロードバランスされます。これはプロバイダ単位のレート制限回避策として機能します。

```mermaid
flowchart LR
    App["社内アプリ / エージェント"] --> GW["AI ゲートウェイ"]
    GW -->|"通常ルート"| P1["プロバイダA"]
    GW -->|"429/5xx でフォールバック"| P2["プロバイダB"]
    GW -->|"cooldown 中は除外"| P1
    GW --> Log["OTEL span / 監査ログ"]
```

### キャッシュ運用

完全一致キャッシュ（Redis）と意味的類似キャッシュ（Redis Semantic Cache）を使い分けます。

```yaml
litellm_settings:
  cache: True
  cache_params:
    type: "redis"
    namespace: "litellm.caching"
    ttl: 600
```

```yaml
litellm_settings:
  cache: True
  cache_params:
    type: "redis-semantic"
    similarity_threshold: 0.8
    redis_semantic_cache_embedding_model: azure-embedding-model
```

TTL はグローバル設定とリクエスト単位の 2 階層で制御できます。キャッシュ不整合が起きやすいのは、プロバイダ固有のオプションパラメータをキーに含めていないケースです。`enable_caching_on_provider_specific_optional_params: True` を設定して対処します。明示的な無効化は `/cache/delete` にキー一覧を渡します。

```bash
curl -X POST "http://0.0.0.0:4000/cache/delete" \
  -H "Authorization: Bearer sk-1234" \
  -d '{"keys": ["key1", "key2"]}'
```

キャッシュの健全性は `/cache/ping` で確認します。

### スケール

- LiteLLM Proxy は Kubernetes 環境で「1 pod = 1 Uvicorn worker」を推奨し、水平スケール（pod 数増加）で対応する。レイテンシが予測可能になり、HPA のしきい値判定も正確になる
- 複数インスタンス運用では Redis の導入が強く推奨される（公式の本番運用ガイドの推奨項目）。TPM/RPM カウンターとルーティング状態をインスタンス間で共有するために使う
- Redis 接続は `redis_url` でなく `redis_host` / `redis_port` / `redis_password` を個別指定する方が、公式ベンチマーク上 約 80 RPS 高速とされる（公式は調査中と留保）
- DB（PostgreSQL）接続数は `pod数 × worker数 × database_connection_pool_limit` で線形に増える。DB の接続上限を超えないよう調整する
- spend ログの DB 書き込みはデフォルトでバッチ化される（`proxy_batch_write_at`）
- ヘルスチェックは `/health/readiness` を Kubernetes の readinessProbe に組み込み、ローリングデプロイ時に 1 pod ずつ確実にドレインする

## ベストプラクティス

### 入口一本化と egress 遮断による境界強制

CNCF の記事の核心的主張は「境界はアーキテクチャであってポリシーであってはならない」という点です。アプリケーションが遵守することを期待するポリシーは回避可能ですが、ネットワーク層で物理的に強制した構造は回避不可能です。NGINX を使う場合、同一インスタンスをインバウンドのリバースプロキシ兼アウトバウンドのフォワードプロキシとして構成し、`iptables` で他の全経路を遮断します。この構成の効果は次の 2 点です。

- shadow AI（未承認の直接プロバイダ呼び出し）がネットワーク層で物理的に不可能になる
- 監査証跡の取得漏れが原理的に起きない（通過しないリクエストが存在しないため）

### Internal Key 抽象化で外部キーを直接配らない

各プロバイダの実キーはゲートウェイのみが保持し、利用者・アプリには Internal Key を配布します。Internal Key に紐づく属性（team / model 許可リスト / budget / rate limit）をゲートウェイ側で一元管理すると、実キー漏洩時の影響範囲を Internal Key 単位に局所化できます。実キーのローテーションは利用者側のコード変更なしにゲートウェイ内で完結します。

### 最小権限 / read-only 原則

- Virtual Key にはモデル許可リスト（`models` パラメータ）を必ず指定し、未使用モデルへのアクセスを塞ぐ
- 管理系エンドポイントを叩ける Master Key は少数の管理者のみに限定し、利用者へは配布しない
- 監査・分析用途で外部システムにログを転送する場合も、読み取り専用のエクスポート経路に限定する

### ガードレール（PII / コンテンツ）

Portkey は多数のプリビルトガードレールを提供し、LLM の入出力を検査してフィルタ・修正・ルーティング変更ができます。ガードレール違反もログ / 分析に記録され、コストと同様に監視対象になります。ガードレールは入口（リクエスト送信前）と出口（レスポンス返却前）の両方に置けるかを設計時に確認します。PII マスキングは入口、有害コンテンツ検知は出口で効かせるケースが多いです。

### 内製 vs 製品の判断

判断材料は主に次の 4 軸です。

| 軸 | 内製（OSS self-host）が有利 | 製品（Portkey / Kong / Cloudflare 等）が有利 |
|---|---|---|
| 規模 | 数千〜数万ユーザー、専任の運用チームがいる | 立ち上げを急ぐ、運用人員が限られる |
| カスタマイズ | 独自ルーティング・独自監査要件がある | 標準機能（ガードレール/観測性）で十分 |
| セキュリティ運用体制 | サプライチェーン監視・パッチ適用を自前で回せる | ベンダーのセキュリティ対応に委ねたい |
| コスト構造 | インフラ費用のみ（人件費は別途発生） | ログ量 / 保持期間に応じた従量課金を許容できる |

ソフトバンクの事例（2 万人超・240 システム、1 日 3,000 万リクエスト超を想定）は内製を選び、インフラ構築の自動化でスケールアウトを約 5 分以内で実行できるようにしました。モデル追加のプロセスもテンプレート化し、数か月かかっていた作業を約 1 週間に短縮しています。大規模・高頻度の拡張が見込まれる組織では、初期投資を払っても内製の自動化が長期的に回収されやすいです。逆に、拡張頻度が低く運用チームを新設できない組織では、OSS 化されたガバナンス機能付き製品を採用し、運用の大半をマネージド側に寄せる方が回収が早いです。

### 監査証跡は通信境界で取る

アプリ内ログは実装の変更・バグ・意図的な迂回で欠落しえます。ゲートウェイ（通信境界）で OTEL span として記録すれば、アプリの実装に関わらず全リクエストが漏れなく記録されます。監査証跡はコストログと分離せず同じ基盤（OTEL Collector → 既存 SIEM / Grafana）に集約し、コスト異常と不正利用の兆候を同じダッシュボードで検知できるようにします。

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| 429 が多発する | team / key / モデル単位の RPM・TPM 上限、またはプロバイダ側のレート制限に達している | rpm_limit / tpm_limit を見直す。同一モデルに複数デプロイを登録してロードバランスする。fallbacks で代替モデルへ自動退避する |
| 特定プロバイダのモデルが応答しない | プロバイダ側の障害・メンテナンス | fallbacks で別プロバイダへ切り替える。allowed_fails / cooldown_time で自動的に該当デプロイをルーティングから除外する |
| リクエストが予算超過エラーで拒否される | team / key の max_budget に到達した。budget_duration のリセットタイミングが想定とずれている | 日次・月次の多段階予算を確認する。緊急時は Master Key で max_budget を一時引き上げる。恒常的な超過は team 単位の利用実態を見直す |
| APIキー漏洩が疑われる | Virtual Key の外部流出、または依存ライブラリのサプライチェーン侵害（例: 2026 年 3 月の LiteLLM PyPI 侵害。公式は「Trivy の侵害との関連を疑っている」と述べ、別途「攻撃者が正規の CI/CD を迂回し悪意あるパッケージを直接 PyPI へ公開した初期証拠がある」としている。窃取対象はクラウド認証情報・SSH 鍵・K8s トークン。調査は継続中） | 該当キーを即座に /key/{id}/regenerate で失効・再発行する。ライブラリのバージョンを確認し、侵害バージョンなら安全なバージョンにピン留めする。クラウド認証情報・SSH 鍵・DB 認証情報を全面ローテーションする |
| レイテンシが急増する | キャッシュ不発。DB 接続プール枯渇。Redis 未導入によるインスタンス間カウンター同期遅延 | /cache/ping でキャッシュ稼働を確認する。database_connection_pool_limit と接続数上限を見直す。複数インスタンス運用時は Redis を導入する |
| キャッシュのレスポンスが古い | プロバイダ固有のオプションパラメータがキャッシュキーに反映されていない。TTL 設定漏れ | enable_caching_on_provider_specific_optional_params を True にする。cache_params.ttl を明示する。個別キーは /cache/delete で強制無効化する |
| 予算・レート制限が意図通り効かない（複数インスタンス環境） | Redis 未導入でカウンターがインスタンスごとに独立している | Redis を導入し team/key の RPM・TPM・spend カウンターをインスタンス間で共有する |

## まとめ

エンタープライズ AI ゲートウェイは、外部 API キーの直配りをやめ、入口プロキシに認証情報の抽象化（Internal Key）・利用可視化・レート/予算制御・監査・ガードレールを集約する設計パターンです。監査証跡はアプリ内ログではなく、egress を構造的に遮断した通信境界で取ることで、shadow AI と取得漏れを原理的に防げます。LiteLLM Proxy を軸に、規模と運用体制に応じて内製と製品を使い分けるのが実務的な選択になります。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！

## 参考リンク

- 公式ドキュメント
  - [LiteLLM AI Gateway (LLM Proxy)](https://docs.litellm.ai/docs/simple_proxy)
  - [LiteLLM Proxy Architecture](https://docs.litellm.ai/docs/proxy/architecture)
  - [LiteLLM Proxy Quick Start](https://docs.litellm.ai/docs/proxy/quick_start)
  - [LiteLLM Proxy Configs](https://docs.litellm.ai/docs/proxy/configs)
  - [LiteLLM Proxy Deploy](https://docs.litellm.ai/docs/proxy/deploy)
  - [LiteLLM Proxy Virtual Keys](https://docs.litellm.ai/docs/proxy/virtual_keys)
  - [LiteLLM Proxy Users / Budgets & Rate Limits](https://docs.litellm.ai/docs/proxy/users)
  - [LiteLLM Proxy Reliability (Fallbacks)](https://docs.litellm.ai/docs/proxy/reliability)
  - [LiteLLM Proxy Caching](https://docs.litellm.ai/docs/proxy/caching)
  - [LiteLLM Proxy Logging & Observability](https://docs.litellm.ai/docs/proxy/logging)
  - [LiteLLM Best Practices for Production](https://docs.litellm.ai/docs/proxy/prod)
  - [LiteLLM Rotating Master Key](https://docs.litellm.ai/docs/proxy/master_key_rotations)
  - [LiteLLM Security Update: Suspected Supply Chain Incident](https://docs.litellm.ai/blog/security-update-march-2026)
  - [Kong AI Gateway](https://developer.konghq.com/ai-gateway/)
  - [Kong AI Proxy Plugin](https://developer.konghq.com/plugins/ai-proxy/)
  - [Kong AI Rate Limiting Advanced Plugin](https://developer.konghq.com/plugins/ai-rate-limiting-advanced/)
  - [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)
  - [Cloudflare AI Gateway Chat Completion (OpenAI compat)](https://developers.cloudflare.com/ai-gateway/usage/chat-completion/)
  - [Portkey Docs (AI Gateway)](https://portkey.ai/docs/product/ai-gateway)
  - [Portkey Model Catalog](https://portkey.ai/docs/product/model-catalog)
  - [Portkey Guardrails](https://portkey.ai/features/guardrails)
- GitHub
  - [BerriAI/litellm](https://github.com/BerriAI/litellm)
  - [Portkey-AI/gateway](https://github.com/Portkey-AI/gateway)
- 記事・事例
  - [ソフトバンクの独自AIゲートウェイ「Cloud Proxy」の正体 - ＠IT](https://atmarkit.itmedia.co.jp/ait/articles/2607/07/news009.html)
  - [CNCF: Network Boundary for AI Agents Using NGINX and OpenTelemetry](https://www.cncf.io/blog/2026/07/08/network-boundary-for-ai-agents-using-nginx-and-opentelemetry/)
  - [MLflow vs LiteLLM (AI Gateway comparison)](https://mlflow.org/litellm-alternative/)
  - [2026年3月24日の LiteLLM 侵害の概要と対応指針](https://diary.shift-js.info/litellm-compromise/)
