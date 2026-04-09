---
title: "技術調査 - GlitchTip"
emoji: "🐛"
type: "tech"
topics: ["GlitchTip", "Sentry", "ErrorTracking", "Django", "SelfHosted"]
published: true
published_at: 2026-04-10
---

## ■概要

GlitchTip は、Sentry SDK と互換性を持つオープンソースのエラートラッキングプラットフォームです。
エラー収集・パフォーマンスモニタリング・アップタイム監視の 3 機能を 1 つのサービスで提供します。

Sentry が 2019 年にコアをプロプライエタリライセンスへ移行したことを受けて、2020 年に開発が開始されました。
GlitchTip は Sentry がオープンソースだった時代のコードベースを部分的に継承しつつ、Django + PostgreSQL を中心とした軽量な再実装として設計されています。
ライセンスは MIT であり、商用利用・再配布・改変が自由に行えます。

DSN の URL を変更するだけで Sentry SDK からの移行が完了するため、アプリケーションコードの修正は不要です。
セルフホスト環境では外部への通信（フォンホーム）を行わないため、プライバシーを確保できます。

最新バージョンは GlitchTip 6（2026 年 2 月リリース）で、UUIDv7 によるイベント ID 管理とデータベースパーティション管理の内製化により、イベント取得速度が向上しています。

### ●類似ツール比較

| 項目               | GlitchTip                               | Sentry self-hosted                     | Sentry SaaS          |
| ------------------ | --------------------------------------- | -------------------------------------- | -------------------- |
| ライセンス         | MIT                                     | FSL（Functional Source License）       | プロプライエタリ     |
| 最小メモリ         | 512 MB RAM                              | 16 GB RAM 以上                         | 不要（クラウド管理） |
| コンテナ数         | 4（Web / Worker / Valkey / PostgreSQL） | 40 以上（Kafka / ClickHouse 等を含む） | 不要                 |
| Sentry SDK 互換    | あり（DSN 変更のみ）                    | 完全互換                               | 完全互換             |
| エラートラッキング | あり                                    | あり                                   | あり                 |
| パフォーマンス監視 | 基本機能のみ                            | フル機能                               | フル機能             |
| アップタイム監視   | あり                                    | なし（別途要）                         | 一部プランで対応     |
| セッションリプレイ | なし                                    | あり                                   | あり                 |
| 分散トレーシング   | 限定的                                  | フル機能                               | フル機能             |
| CSP 違反レポート   | あり                                    | あり                                   | あり                 |
| 運用難易度         | 低（小規模 VPS 可）                     | 高（専用インフラ必須）                 | 不要                 |
| SaaS 価格（最小）  | $15/月（10 万イベントまで）             | 有料は $29/月〜                        | 有料は $26/月〜      |

### ●ユースケース別推奨

| ユースケース                                 | 推奨                          | 理由                                         |
| -------------------------------------------- | ----------------------------- | -------------------------------------------- |
| 個人・インディー開発                         | GlitchTip セルフホスト        | MIT ライセンスで無償、最小リソースで運用可   |
| 小規模チーム（〜20 名）                      | GlitchTip セルフホスト / SaaS | 低コストでコアのエラートラッキングをカバー   |
| データをクラウド送信したくない               | GlitchTip セルフホスト        | フォンホームなし、MIT ライセンスで完全管理   |
| セッションリプレイが必要                     | Sentry SaaS                   | GlitchTip は未対応                           |
| 大規模エンタープライズ（高度なトレーシング） | Sentry SaaS / self-hosted     | 分散トレーシング・インテグレーション数で優位 |
| インフラ管理コストを最小化したい             | GlitchTip SaaS                | ホスティング版は $15/月から利用可            |
| Sentry から移行を検討中                      | GlitchTip                     | DSN 変更のみで移行完了、リスクが低い         |

## ■特徴

- **Sentry SDK 互換**: すべての Sentry 公式 SDK（Python・JavaScript・Go・Ruby・Java 等）をそのまま利用可能。DSN の URL 変更のみで移行完了
- **エラートラッキング**: 例外・ログメッセージを収集し、スタックトレース付きで一元管理。イシューのグルーピング・優先度付け・無視指定が可能
- **パフォーマンスモニタリング**: ウェブリクエスト・バックグラウンドタスク・DB コールのトランザクションをグルーピングし、遅いエンドポイントを特定
- **アップタイム監視**: 設定した URL に定期リクエストを送信し、応答がない場合にアラートを通知
- **CSP 違反レポート**: ブラウザが送信する Content Security Policy 違反レポートを収集・管理
- **軽量アーキテクチャ**: 512 MB RAM・1 vCPU の小規模 VPS で稼働可能
- **MIT ライセンス**: 商用利用・改変・再配布が自由。セルフホスト環境ではフォンホームを行わない
- **マルチプロジェクト対応**: 複数のプロジェクト・チームを 1 インスタンスで管理可能
- **アラート・通知**: メール・Webhook・Slack 等への通知インテグレーションを提供
- **JavaScript ソースマップ対応**: ミニファイされた JavaScript のスタックトレースを元のソースに対応付けて表示

## ■構造

### ●システムコンテキスト図

```mermaid
graph TD
    Dev["開発者"]
    Ops["運用者"]
    App["監視対象アプリケーション"]
    GT["GlitchTip"]
    SMTP["メールサーバー - SMTP"]
    OAuth["OAuthプロバイダー - GitHub / GitLab / Google等"]
    S3["オブジェクトストレージ - S3互換"]
    Stripe["Stripe - 決済"]

    Dev -->|エラー・パフォーマンスデータ送信| GT
    App -->|Sentry SDK経由でイベント送信| GT
    Ops -->|ブラウザで操作| GT
    GT -->|アラート通知| SMTP
    GT -->|SSO認証| OAuth
    GT -->|ファイル・ソースマップ保存| S3
    GT -->|サブスクリプション管理| Stripe
```

| 要素                             | 説明                                                                |
| -------------------------------- | ------------------------------------------------------------------- |
| 開発者                           | GlitchTip を使用してアプリのエラーを追跡する利用者                  |
| 運用者                           | アップタイム監視・アラート設定を行う利用者                          |
| 監視対象アプリケーション         | Sentry SDK を組み込んでイベントを送信するアプリ                     |
| GlitchTip                        | オープンソースのエラートラッキングプラットフォーム（Sentry 互換）   |
| メールサーバー - SMTP            | アラート・通知メール送信先（Mailgun 等も利用可）                    |
| OAuthプロバイダー                | GitHub / GitLab / Google / Microsoft / Okta 等の SSO 認証基盤       |
| オブジェクトストレージ - S3 互換 | ソースマップ・Debug Information Files・アップロードファイルの永続化 |
| Stripe - 決済                    | ホスティング版のサブスクリプション課金管理                          |

### ●コンテナ図

```mermaid
graph TD
    FE["フロントエンド - Angular SPA"]
    WEB["Web - API サーバー - Django / Granian - ASGI"]
    WORKER["Worker - バックグラウンド処理"]
    PG["PostgreSQL - データベース"]
    VK["Valkey - Redis互換 - キャッシュ・タスクキュー"]
    SMTP["メールサーバー - 外部"]
    S3["オブジェクトストレージ - 外部"]

    FE -->|REST API - JSON - HTTP| WEB
    WEB -->|ORM - クエリ| PG
    WEB -->|タスクエンキュー - セッション| VK
    WORKER -->|ORM - クエリ| PG
    WORKER -->|タスクデキュー| VK
    WORKER -->|メール送信| SMTP
    WORKER -->|ファイル操作| S3
    WEB -->|ファイル操作| S3
```

| 要素                                           | 説明                                                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| フロントエンド - Angular SPA                   | Angular 製シングルページアプリ。Angular Material で UI 構築。ビルド成果物を静的ファイルとして配信                                                     |
| Web - API サーバー - Django / Granian - ASGI   | Django REST フレームワーク + Django Ninja による API。Granian（ASGI サーバー）で起動。イベント受信・認証・組織管理を担当                              |
| Worker - バックグラウンド処理                  | GlitchTip 6 以降は django-vtasks の `runworker --scheduler` で起動。5.x 以前は Celery + Celery Beat。アラート送信・アップタイム監視・データ集計を担当 |
| PostgreSQL - データベース                      | バージョン 14 以上必須。イベント・Issue・組織・プロジェクトの永続化                                                                                   |
| Valkey - Redis 互換 - キャッシュ・タスクキュー | タスクブローカー・キャッシュ・セッション管理。最小構成では省略可能                                                                                    |
| メールサーバー - 外部                          | アラート・ユーザー登録通知の送信先（SMTP / Mailgun 等）                                                                                               |
| オブジェクトストレージ - 外部                  | S3 互換ストレージ（ソースマップ・DIF・ユーザーアップロードファイル）                                                                                  |

> **all-in-one モード**: 最小構成では Web コンテナが `GLITCHTIP_EMBED_WORKER=true` を設定し、Worker・スケジューラを同一プロセスに内包して起動します。

### ●コンポーネント図

```mermaid
graph LR
    API["API 層 - Django Ninja"]
    AUTH["認証 - allauth - OAuth - MFA"]
    EI["event-ingest - イベント受信・正規化"]
    IE["issue-events - Issue イベント管理"]
    PROJ["projects - プロジェクト管理"]
    ORG["organizations-ext - 組織管理"]
    TEAMS["teams - チーム管理"]
    USERS["users - ユーザー管理"]
    ALERTS["alerts - アラートルール・通知"]
    UPTIME["uptime - アップタイム監視"]
    PERF["performance - トランザクション・N+1検出"]
    LOGS["logs - ログ収集"]
    OBS["observability - OpenTelemetry - Prometheus"]
    REL["releases - リリース管理"]
    ENV["environments - 環境管理"]
    DIF["difs - Debug Information Files"]
    SC["sourcecode - ソースマップ"]
    FILES["files - ファイルアップロード"]
    TOKENS["api-tokens - APIトークン"]
    OAUTH["oauth - OAuth2サーバー"]
    STRIPE["stripe - 課金拡張"]
    IMP["importer - Sentry移行インポート"]

    API --> AUTH
    API --> EI
    API --> IE
    API --> PROJ
    API --> ORG
    API --> TEAMS
    API --> USERS
    API --> ALERTS
    API --> UPTIME
    API --> PERF
    API --> LOGS
    API --> OBS
    API --> REL
    API --> ENV
    API --> DIF
    API --> SC
    API --> FILES
    API --> TOKENS
    API --> OAUTH
    API --> STRIPE
    API --> IMP
    EI --> IE
    ALERTS --> UPTIME
    ALERTS --> IE
    PROJ --> ORG
    TEAMS --> ORG
    USERS --> ORG
```

| 要素                             | 説明                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------- |
| API 層 - Django Ninja            | Django Ninja を使用したスキーマ駆動 REST API。Sentry 互換エンドポイントも提供     |
| 認証 - allauth                   | django-allauth による認証基盤。OAuth2 ソーシャルログイン・MFA・パスワードレス対応 |
| event-ingest                     | Sentry SDK からのイベントを受信・検証・正規化してストアするパイプライン           |
| issue-events                     | 正規化済みのイベントを Issue に集約・管理。検索・フィルタリングを提供             |
| projects                         | プロジェクト（DSN 発行・SDK 設定）の CRUD 管理                                    |
| organizations-ext                | 組織の CRUD・サブスクリプション・クォータ管理                                     |
| teams                            | 組織内チームの管理とプロジェクトへのアクセス制御                                  |
| users                            | ユーザープロファイル・メンバーシップ・通知設定                                    |
| alerts                           | アラートルール定義・通知チャンネル（メール・Webhook・Slack 等）・発火管理         |
| uptime                           | URL の死活監視スケジュール管理・結果記録                                          |
| performance                      | トランザクション・スパン・N+1 クエリ等のパフォーマンスデータ管理                  |
| logs                             | アプリケーションログ収集・保存（OpenTelemetry Logs 互換）                         |
| observability                    | OpenTelemetry / Prometheus メトリクスエンドポイント提供                           |
| releases                         | デプロイリリースの記録・コミット関連付け                                          |
| environments                     | プロジェクト内環境（production / staging 等）の管理                               |
| difs                             | Debug Information Files（シンボルファイル）のアップロード・管理                   |
| sourcecode                       | ソースマップの処理・スタックトレースの逆変換                                      |
| files                            | 汎用ファイルアップロード管理（S3 互換ストレージ連携）                             |
| api-tokens                       | ユーザー・組織単位の API トークン発行・管理                                       |
| oauth                            | OAuth2 認可サーバー機能（外部アプリへのアクセス委譲）                             |
| stripe - 課金拡張                | djstripe を拡張したサブスクリプション・クォータ課金管理                           |
| importer - Sentry 移行インポート | Sentry からのデータ移行用インポートユーティリティ                                 |

## ■データ

### ●概念モデル

```mermaid
graph TD
  subgraph OrganizationScope [Organization]
    Org[Organization]
    OrgUser[OrganizationUser]
    OrgOwner[OrganizationOwner]
    OrgInvitation[OrganizationInvitation]
    Team[Team]
    Environment[Environment]
    Release[Release]
    StatusPage[StatusPage]
  end

  subgraph ProjectScope [Project]
    Project[Project]
    ProjectKey[ProjectKey]
    ProjectAlert[ProjectAlert]
    AlertRecipient[AlertRecipient]
  end

  subgraph IssueTracking
    Issue[Issue]
    IssueEvent[IssueEvent]
    IssueHash[IssueHash]
    IssueTag[IssueTag]
    Comment[Comment]
    UserReport[UserReport]
  end

  subgraph Performance
    TransactionGroup[TransactionGroup]
    SpanStaging[SpanStaging]
  end

  subgraph Uptime
    Monitor[Monitor]
    MonitorCheck[MonitorCheck]
  end

  User[User]
  Notification[Notification]

  User ----> OrgUser
  OrgUser --> OrgOwner
  Org --> Team
  Team --> OrgUser
  Team --> Project
  Org --> Project
  Org --> Environment
  Environment --> Project
  Org --> Release
  Release --> Project
  Project --> ProjectKey
  Project --> ProjectAlert
  ProjectAlert --> AlertRecipient
  ProjectAlert ----> Notification
  Notification --> Issue
  Project --> Issue
  Issue --> IssueEvent
  Issue --> IssueHash
  Issue --> IssueTag
  Issue --> Comment
  Issue --> UserReport
  Issue --> Release
  Project ----> Monitor
  Org --> Monitor
  Monitor --> MonitorCheck
  Org --> StatusPage
  StatusPage --> Monitor
  Project -----> TransactionGroup
  Org --> TransactionGroup
```

| 要素              | 説明                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| Organization      | 最上位の所有エンティティ。Team・Project・Environment・Release・Monitor を所有 |
| OrganizationUser  | User と Organization を紐付けるメンバーシップ。ロール情報を保持               |
| OrganizationOwner | OrganizationUser から昇格されるオーナー指定                                   |
| Team              | 組織内のチーム。OrganizationUser と Project を多対多で管理                    |
| Environment       | production / staging 等の環境区分。Project と多対多                           |
| Release           | デプロイされたアプリケーションバージョン                                      |
| StatusPage        | 複数 Monitor をまとめた公開ステータスページ                                   |
| Project           | DSN を発行する単位。Issue・Monitor の所属先                                   |
| ProjectKey        | DSN の公開鍵。レート制限設定を保持                                            |
| ProjectAlert      | アラートルール。頻度閾値と通知先を持つ                                        |
| AlertRecipient    | 通知チャンネル（メール・Webhook 等）                                          |
| Notification      | 実際の通知送信インスタンス                                                    |
| Issue             | 同一グループのエラー集約単位                                                  |
| IssueEvent        | 個別のエラーイベント（発生の瞬間のスナップショット）                          |
| IssueHash         | Issue をグルーピングするためのハッシュ                                        |
| IssueTag          | Issue に付与されるタグ（環境・リリース等の検索用）                            |
| Comment           | Issue に対するコメント                                                        |
| UserReport        | エンドユーザーからのフィードバック                                            |
| TransactionGroup  | パフォーマンストランザクションの集約                                          |
| SpanStaging       | スパンデータの一時領域                                                        |
| Monitor           | アップタイム監視対象                                                          |
| MonitorCheck      | Monitor の個別チェック結果                                                    |
| User              | 利用ユーザー                                                                  |

**IssueEvent.data の主要フィールド:**

| フィールド    | 説明                                                   |
| ------------- | ------------------------------------------------------ |
| `exception`   | 例外クラス名・メッセージ・スタックトレース情報         |
| `request`     | HTTP リクエスト情報（URL・ヘッダー・ボディ・メソッド） |
| `user`        | エンドユーザー識別情報（id・email・ip_address 等）     |
| `breadcrumbs` | イベント発生前の操作ログ（ナビゲーション・クリック等） |
| `contexts`    | OS・ランタイム・デバイス等のコンテキスト情報           |
| `sdk`         | 送信元 SDK の名前とバージョン                          |

### ●情報モデル

```mermaid
classDiagram
  class Organization {
    int id
    string slug
    bool is_accepting_events
    int event_throttle_rate
    bool open_membership
    bool scrub_ip_addresses
    string stripe_customer_id
    bool is_deleted
  }
  class OrganizationUser {
    int role
    string email
  }
  class User {
    int id
    string email
    string name
    bool is_staff
    bool is_active
    datetime created
    bool subscribe_by_default
    map options
    map analytics
  }
  class Team {
    int id
    string slug
  }
  class Environment {
    int id
    string name
    datetime created
  }
  class EnvironmentProject {
    bool is_hidden
  }
  class Project {
    int id
    string slug
    string name
    string platform
    datetime first_event
    bool scrub_ip_addresses
    int event_throttle_rate
  }
  class ProjectKey {
    int id
    string name
    string public_key
    bool is_active
    int rate_limit_count
    int rate_limit_window
    map data
  }
  class Release {
    int id
    string version
    string ref
    string url
    datetime released
    map data
    int commit_count
    int deploy_count
  }
  class Deploy {
    int id
    string environment
    string url
    datetime date_started
    datetime date_finished
  }
  class Issue {
    int id
    int short_id
    string title
    string culprit
    string level
    string type
    string status
    bool is_public
    datetime first_seen
    datetime last_seen
    int count
    map metadata
  }
  class IssueEvent {
    string id
    string event_id
    datetime timestamp
    string type
    string level
    string title
    string transaction
    map data
    map tags
    list hashes
  }
  class IssueHash {
    int id
    string value
  }
  class IssueTag {
    int count
  }
  class TagKey {
    int id
    string key
  }
  class TagValue {
    int id
    string value
  }
  class Comment {
    int id
    datetime created
    string text
  }
  class UserReport {
    int id
    string event_id
    string name
    string email
    string comments
  }
  class ProjectAlert {
    int id
    string name
    int timespan_minutes
    int quantity
    bool uptime
  }
  class AlertRecipient {
    int id
    string recipient_type
    string url
    map config
    list tags_to_add
  }
  class Notification {
    int id
    bool is_sent
  }
  class Monitor {
    int id
    string name
    string url
    string monitor_type
    int interval
    int timeout
    int expected_status
    string expected_body
    string endpoint_id
    bool cached_is_up
    datetime cached_last_change
    datetime created
  }
  class MonitorCheck {
    string id
    datetime start_check
    int response_time
    int reason
    bool is_up
    bool is_change
    map data
  }
  class StatusPage {
    int id
    string name
    string slug
    bool is_public
  }
  class TransactionGroup {
    int id
    string transaction
    string op
    string method
    datetime first_seen
    datetime last_seen
    float avg_duration
    float p50
    float p95
    int count
    int error_count
    list duration_histogram
  }

  Organization "1" --> "many" OrganizationUser : has
  User "1" --> "many" OrganizationUser : belongs to
  OrganizationUser "1" --> "0..1" OrganizationOwner : promoted to
  Organization "1" --> "many" Team : has
  Team "many" --> "many" OrganizationUser : members
  Team "many" --> "many" Project : manages
  Organization "1" --> "many" Project : owns
  Organization "1" --> "many" Environment : owns
  Environment "many" --> "many" Project : via EnvironmentProject
  Organization "1" --> "many" Release : owns
  Release "many" --> "many" Project : deployed to
  Release "1" --> "many" Deploy : has
  Project "1" --> "many" ProjectKey : has
  Project "1" --> "many" ProjectAlert : has
  ProjectAlert "1" --> "many" AlertRecipient : notifies
  ProjectAlert "1" --> "many" Notification : triggers
  Notification "many" --> "many" Issue : about
  Project "1" --> "many" Issue : tracks
  Issue "1" --> "many" IssueEvent : aggregates
  Issue "1" --> "many" IssueHash : identified by
  Issue "1" --> "many" IssueTag : tagged with
  Issue "1" --> "many" Comment : has
  Issue "1" --> "many" UserReport : has
  Issue "many" --> "0..1" Release : first_seen in
  IssueTag "many" --> "1" TagKey : key
  IssueTag "many" --> "1" TagValue : value
  Comment "many" --> "0..1" User : authored by
  UserReport "many" --> "1" Project : on
  Organization "1" --> "many" Monitor : owns
  Project "1" --> "many" Monitor : belongs to
  Monitor "1" --> "many" MonitorCheck : checked by
  Organization "1" --> "many" StatusPage : publishes
  StatusPage "many" --> "many" Monitor : displays
  Organization "1" --> "many" TransactionGroup : has
  Project "1" --> "many" TransactionGroup : has
```

## ■構築方法

### ●必須環境変数一覧

| 環境変数             | 説明                                         | 例                                          |
| -------------------- | -------------------------------------------- | ------------------------------------------- |
| `SECRET_KEY`         | セッション・暗号化用のランダム文字列         | `openssl rand -hex 32` で生成               |
| `DATABASE_URL`       | PostgreSQL 14+ 接続文字列                    | `postgres://user:pass@db:5432/glitchtip`    |
| `GLITCHTIP_DOMAIN`   | スキーム付きのドメイン（末尾スラッシュなし） | `https://glitchtip.example.com`             |
| `EMAIL_URL`          | メール送信設定                               | `smtp+tls://user:pass@smtp.example.com:587` |
| `DEFAULT_FROM_EMAIL` | 送信元メールアドレス                         | `glitchtip@example.com`                     |
| `PORT`               | Web サーバーのリスニングポート               | `8000`（v6 デフォルト）                     |

### ●オプション環境変数

| 環境変数                       | 説明                                     | デフォルト |
| ------------------------------ | ---------------------------------------- | ---------- |
| `VALKEY_URL`                   | Valkey / Redis 接続 URL                  | 省略可     |
| `ENABLE_USER_REGISTRATION`     | ユーザー自己登録を許可                   | `true`     |
| `ENABLE_ORGANIZATION_CREATION` | 一般ユーザーの組織作成を許可             | `false`    |
| `GLITCHTIP_RETENTION_DAYS`     | イベントデータ保持日数                   | `90`       |
| `VTASKS_CONCURRENCY`           | vtasks ワーカー並列数（v6 以降）         | `20`       |
| `CELERY_WORKER_AUTOSCALE`      | Celery ワーカーの自動スケール（v5 以前） | 未設定     |
| `I_PAID_FOR_GLITCHTIP`         | `true` で全機能有効化（寄付推奨）        | 未設定     |

### ●docker-compose による構築

| ファイル              | 用途                                                |
| --------------------- | --------------------------------------------------- |
| `compose.sample.yml`  | 推奨構成（Web / Worker / Valkey / PostgreSQL 分離） |
| `compose.minimal.yml` | 最小構成（256 MB RAM 環境向け、プロセス統合）       |

```yaml
x-environment: &default-environment
  DATABASE_URL: postgres://postgres:postgres@postgres:5432/postgres
  SECRET_KEY: your-secret-key-here
  PORT: 8000
  GLITCHTIP_DOMAIN: https://glitchtip.example.com
  EMAIL_URL: smtp+tls://user:pass@smtp.example.com:587
  DEFAULT_FROM_EMAIL: glitchtip@example.com
  ENABLE_USER_REGISTRATION: "False"
  GLITCHTIP_RETENTION_DAYS: "90"

services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: postgres
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    restart: unless-stopped
    volumes:
      - postgres-data:/var/lib/postgresql/data

  valkey:
    image: valkey/valkey:8
    restart: unless-stopped

  web:
    image: glitchtip/glitchtip:latest
    depends_on: [postgres, valkey]
    ports:
      - "8000:8000"
    environment: *default-environment
    restart: unless-stopped
    volumes:
      - uploads:/code/uploads

  worker:
    image: glitchtip/glitchtip:latest
    command: ./bin/run-worker.sh
    depends_on: [postgres, valkey]
    environment: *default-environment
    restart: unless-stopped
    volumes:
      - uploads:/code/uploads

  migrate:
    image: glitchtip/glitchtip:latest
    depends_on: [postgres]
    command: "./manage.py migrate"
    environment: *default-environment

volumes:
  postgres-data:
  uploads:
```

```bash
# 1. 設定ファイルを配置
cp compose.sample.yml compose.yml
vi compose.yml

# 2. DB マイグレーション実行
docker compose run --rm migrate

# 3. サービス起動
docker compose up -d

# 4. ログ確認
docker compose logs -f web
```

### ●メール設定の種類

```bash
# SMTP（STARTTLS）
EMAIL_URL="smtp+tls://user:pass@smtp.example.com:587"

# SMTP（SSL）
EMAIL_URL="smtp+ssl://user:pass@smtp.example.com:465"

# ユーザー名に @ が含まれる場合は URL エンコード
EMAIL_URL="smtp+tls://user%40gmail.com:pass@smtp.gmail.com:587"

# コンソール出力（テスト用）
EMAIL_URL="consolemail://"

# Mailgun
EMAIL_BACKEND=anymail.backends.mailgun.EmailBackend
MAILGUN_API_KEY=key-xxxxx

# SendGrid
EMAIL_BACKEND=anymail.backends.sendgrid.EmailBackend
SENDGRID_API_KEY=SG.xxxxx
```

### ●管理者ユーザー作成

```bash
docker compose run --rm web ./manage.py createsuperuser
# 作成後 https://glitchtip.example.com/admin/ にアクセス可能
```

### ●Helm / Kubernetes による構築

```bash
helm repo add glitchtip https://gitlab.com/api/v4/projects/16325141/packages/helm/stable
helm repo update
helm install glitchtip glitchtip/glitchtip -f my-values.yaml
```

```yaml
# my-values.yaml
image:
  repository: glitchtip/glitchtip
  tag: v6.0.0
  pullPolicy: IfNotPresent

env:
  normal:
    GLITCHTIP_DOMAIN: https://glitchtip.example.com
    ENABLE_USER_REGISTRATION: "false"
    GLITCHTIP_RETENTION_DAYS: "90"
  secret:
    SECRET_KEY: "ランダムな文字列をここに設定"
    DATABASE_URL: "postgresql://user:pass@external-db:5432/glitchtip"
    EMAIL_URL: "smtp+tls://user:pass@smtp.example.com:587"
```

- PostgreSQL は外部マネージドサービス（Cloud SQL / RDS 等）を推奨
- Valkey の `auth.password` は必須（未設定だと接続エラー）
- 複数ノード構成では PodDisruptionBudget と anti-affinity ルールを設定

### ●S3 互換ストレージ連携

```bash
# ソースマップ / DIF / アップロードファイルを S3 互換ストレージに保存
DEFAULT_FILE_STORAGE=storages.backends.s3boto3.S3Boto3Storage
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_STORAGE_BUCKET_NAME=glitchtip-uploads
AWS_S3_ENDPOINT_URL=https://s3.example.com  # MinIO 等の互換ストレージの場合
AWS_S3_REGION_NAME=us-east-1
```

## ■利用方法

### ●DSN の構造

```
https://<public_key>@<host>/<project_id>
        └── ProjectKey.public_key        └── Project.id
```

| 要素           | 取得元                          | 説明                                    |
| -------------- | ------------------------------- | --------------------------------------- |
| `<public_key>` | プロジェクト設定 → Client Keys  | 認証用の公開鍵（ProjectKey.public_key） |
| `<host>`       | `GLITCHTIP_DOMAIN` のホスト部分 | GlitchTip のエンドポイント              |
| `<project_id>` | Project.id                      | プロジェクトの内部 ID                   |

### ●DSN 利用に必要な設定（SDK 共通）

| 設定項目                | 説明                                       | 例                                                 |
| ----------------------- | ------------------------------------------ | -------------------------------------------------- |
| `dsn`                   | プロジェクト設定画面から取得する接続 URL   | `https://<key>@glitchtip.example.com/<project-id>` |
| `traces_sample_rate`    | トランザクションサンプリング率（0.0〜1.0） | `0.01`（1 % 推奨）                                 |
| `auto_session_tracking` | セッション追跡（GlitchTip は未サポート）   | `False` に固定                                     |
| `release`               | デプロイバージョン（任意）                 | `"v1.2.3"`                                         |
| `environment`           | 環境名（任意）                             | `"production"`                                     |

### ●組織 / プロジェクト作成

1. ブラウザで `https://glitchtip.example.com` にアクセスしログイン
2. **Organizations** → **Create Organization** で組織を作成
3. 組織内で **Projects** → **Create Project** でプロジェクトを作成（プラットフォームを選択）
4. プロジェクト設定画面に DSN が表示される

### ●DSN 発行と確認

- プロジェクト作成直後の Issues ページに DSN が表示される
- 後から確認: **Project Settings** → **DSN**

### ●Python（基本）

```bash
pip install sentry-sdk
```

```python
import sentry_sdk

sentry_sdk.init(
    dsn="https://abc123@glitchtip.example.com/1",
    traces_sample_rate=0.01,
    auto_session_tracking=False,
    release="v1.2.3",
    environment="production",
)

division_by_zero = 1 / 0
```

### ●Python Django / Flask

```python
# Django: settings.py
import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration

sentry_sdk.init(
    dsn="https://abc123@glitchtip.example.com/1",
    integrations=[DjangoIntegration()],
    traces_sample_rate=0.01,
    auto_session_tracking=False,
)
```

```python
# Flask
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

sentry_sdk.init(
    dsn="https://abc123@glitchtip.example.com/1",
    integrations=[FlaskIntegration()],
    traces_sample_rate=0.01,
    auto_session_tracking=False,
)
```

### ●JavaScript / Node.js / Next.js

```bash
npm install @sentry/browser @sentry/node @sentry/nextjs
```

```javascript
// ブラウザ
import * as Sentry from "@sentry/browser";

Sentry.init({
  dsn: "https://abc123@glitchtip.example.com/1",
  tracesSampleRate: 0.01,
  autoSessionTracking: false,
  release: "v1.2.3",
  environment: "production",
});
```

```javascript
// Node.js / Express
const Sentry = require("@sentry/node");
const express = require("express");

Sentry.init({
  dsn: "https://abc123@glitchtip.example.com/1",
  tracesSampleRate: 0.01,
  autoSessionTracking: false,
});

const app = express();
Sentry.setupExpressErrorHandler(app);
```

```javascript
// Next.js: sentry.client.config.js / sentry.server.config.js
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://abc123@glitchtip.example.com/1",
  tracesSampleRate: 0.01,
  autoSessionTracking: false,
});
```

```go
// Go
import "github.com/getsentry/sentry-go"

sentry.Init(sentry.ClientOptions{
    Dsn: "https://abc123@glitchtip.example.com/1",
    Environment: "production",
    Release: "v1.2.3",
})
```

### ●Source Maps / Release アップロード

```bash
pip install glitchtip-cli
glitchtip-cli --url https://glitchtip.example.com login

# リリース作成とソースマップアップロード
glitchtip-cli releases new v1.2.3 --org my-org --project my-project
glitchtip-cli releases set-commits v1.2.3 --auto --org my-org --project my-project
glitchtip-cli sourcemaps inject ./dist
glitchtip-cli sourcemaps upload ./dist --release v1.2.3 --org my-org --project my-project
glitchtip-cli releases finalize v1.2.3 --org my-org --project my-project
```

```ini
# .sentryclirc
[defaults]
url = https://glitchtip.example.com
org = my-org
project = my-project

[auth]
token = your-auth-token
```

### ●アラート設定

1. **Projects** ページで対象プロジェクトの設定を開く
2. **Alerts** セクションへ移動
3. エラー発生頻度のしきい値を設定（例: 5 分間に 10 回以上）
4. 通知先を設定（デフォルトはメール、Webhook 追加可）
5. アラートを保存

### ●Uptime モニタ

| タイプ    | 動作                                | 用途                          |
| --------- | ----------------------------------- | ----------------------------- |
| Ping      | GlitchTip → 対象 URL へ HTTP HEAD   | 一般的な死活監視              |
| GET       | GlitchTip → 対象 URL へ HTTP GET    | レスポンスボディが必要な場合  |
| POST      | GlitchTip → 対象 URL へ HTTP POST   | API エンドポイント監視        |
| Heartbeat | 対象サービス → GlitchTip へ定期送信 | バッチジョブ・Cron の生存確認 |

```bash
# Heartbeat モニタ（cron 例）
*/5 * * * * curl -s https://glitchtip.example.com/api/0/monitors/<uuid>/checkin/
```

## ■運用

### ●起動 / 停止 / 状態確認 / ログ確認

```bash
docker compose pull           # イメージ取得
docker compose up -d          # バックグラウンド起動
docker compose stop           # 停止
docker compose down           # 完全停止（コンテナ削除）
docker compose ps             # 状態確認
docker compose logs -f web    # Web ログ
docker compose logs -f worker # Worker ログ
```

- マイグレーションは `up -d` 時に自動実行される
- ログ詳細度を上げる場合は環境変数 `LOG_LEVEL=INFO` または `DEBUG` を設定（デフォルトは `WARNING`）

### ●アップグレード

```bash
docker compose pull
docker compose stop
docker compose up -d
docker compose logs -f web
```

**4.x → 6.x アップグレードの注意点:**

- 4.x ユーザーは必ず 5.x に上げてから 6.x に進む（直接 6.x への上げは非サポート）
- GlitchTip 6 は UUIDv7 主キーへ移行。デフォルトで直近 10,000 件のみ自動移行
- 大量データを保持する場合は以下を設定してから手動移行

```bash
GLITCHTIP_RETAIN_LEGACY_DATA=True
docker compose exec web ./manage.py import_legacy_events --limit 100000 --delete-source
```

- GlitchTip 6 からポートが 8080 → **8000** に変更

### ●PostgreSQL バックアップ / リストア

```bash
# 圧縮ダンプ（推奨）
docker compose exec postgres pg_dump -U postgres -Fc postgres > backup_$(date +%Y%m%d_%H%M%S).dump

# SQL ダンプ
docker compose exec postgres pg_dump -U postgres postgres > backup.sql

# リストア
docker cp backup.dump <postgres_container>:/tmp/backup.dump
docker compose exec postgres pg_restore -c -U postgres -d postgres /tmp/backup.dump
```

```bash
# /etc/cron.d/glitchtip-backup
0 2 * * * root docker compose -f /opt/glitchtip/compose.yml exec -T postgres pg_dump -U postgres -Fc postgres > /backup/glitchtip_$(date +\%Y\%m\%d).dump
```

### ●Worker スケール

```yaml
# v6 以降（vtasks）
environment:
  - VTASKS_CONCURRENCY=20
  - DATABASE_POOL_MAX_SIZE=20
```

```yaml
# v5 以前（Celery）
environment:
  - CELERY_WORKER_AUTOSCALE=2,8
  - CELERY_WORKER_MAX_TASKS_PER_CHILD=10000
```

```bash
docker compose up -d --scale worker=3
```

- 水平スケール時はスケジューラ重複に注意。専用スケジューラコンテナを分離する構成が推奨
- `start-all-in-one.sh` を使う場合はスケールせず 1 プロセスで運用

```yaml
# スケジューラを専用コンテナに分離する構成例
services:
  scheduler:
    image: glitchtip/glitchtip:latest
    command: ./bin/run-worker.sh
    environment:
      <<: *default-environment
      SERVER_ROLE: scheduler
      VTASKS_CONCURRENCY: "1"

  worker:
    image: glitchtip/glitchtip:latest
    command: ./bin/run-worker.sh
    environment:
      <<: *default-environment
      SERVER_ROLE: worker
      VTASKS_CONCURRENCY: "20"
    deploy:
      replicas: 3
```

### ●データ保持（イベントクリーンアップ）

```bash
GLITCHTIP_RETENTION_DAYS=90
GLITCHTIP_EVENT_HOT_DAYS=30
GLITCHTIP_LOG_HOT_DAYS=7
GLITCHTIP_RELEASE_RETENTION_DAYS=365
```

```bash
# DuckDB + S3 アーカイブ（コールドストレージ）
GLITCHTIP_ENABLE_DUCKDB=true
GLITCHTIP_COLD_STORAGE_BUCKET=s3://my-bucket/glitchtip-cold
GLITCHTIP_COLD_STORAGE_CLEANUP_ENABLED=true
DUCKDB_MEMORY_LIMIT=256MB
```

- 参考値: 月間 100 万イベントで約 30 GB のディスク使用量

### ●モニタリング

```bash
# アプリケーション基本応答確認
curl -f http://localhost:8000/api/0/

# Prometheus メトリクス（要認証トークン）
curl -H "Authorization: Bearer <AUTH_TOKEN>" http://localhost:8000/api/0/observability/
```

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'glitchtip'
    static_configs:
      - targets: ['glitchtip.example.com']
    scheme: https
    metrics_path: /api/0/observability/
    bearer_token: '<GLITCHTIP_AUTH_TOKEN>'
```

```bash
ENABLE_OBSERVABILITY_API=true
```

## ■ベストプラクティス

### ●リバースプロキシ配下配置（SSL）

```nginx
server {
    listen 80;
    server_name glitchtip.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name glitchtip.example.com;

    ssl_certificate     /etc/letsencrypt/live/glitchtip.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/glitchtip.example.com/privkey.pem;

    client_max_body_size 40M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;
    }
}
```

```yaml
# Traefik（Docker Compose ラベル）
services:
  web:
    image: glitchtip/glitchtip
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.glitchtip.rule=Host(`glitchtip.example.com`)"
      - "traefik.http.routers.glitchtip.entrypoints=websecure"
      - "traefik.http.routers.glitchtip.tls.certresolver=letsencrypt"
      - "traefik.http.services.glitchtip.loadbalancer.server.port=8000"
```

```bash
# セキュリティヘッダー
SECURE_HSTS_SECONDS=31536000
SECURE_HSTS_PRELOAD=true
SECURE_HSTS_INCLUDE_SUBDOMAINS=true
CSRF_TRUSTED_ORIGINS=https://glitchtip.example.com
```

### ●SMTP / OAuth 設定

- SMTP は `EMAIL_URL` に加え、Mailgun / SendGrid / Postmark / Mailjet / Brevo 等を Anymail 経由で利用可能
- OAuth プロバイダーは Django Admin `/admin/socialaccount/socialapp/` から設定
- 対応プロバイダー: GitHub / GitLab / Gitea / Google / Microsoft / Okta / NextCloud / OpenID Connect（汎用）
- コールバック URL 形式: `https://glitchtip.example.com/accounts/<provider>/login/callback/`

### ●シークレット管理

```bash
# .env ファイル（compose.yml から参照）
SECRET_KEY=your-very-long-random-secret-key
DATABASE_URL=postgres://glitchtip:password@postgres:5432/glitchtip
VALKEY_URL=redis://valkey:6379
EMAIL_URL=smtp+tls://sender:password@smtp.example.com:587
GLITCHTIP_DOMAIN=https://glitchtip.example.com
DEFAULT_FROM_EMAIL=noreply@example.com
```

- シークレットは `compose.yml` に直書きせず、`.env` や外部シークレットマネージャーを使用
- `.env` は `.gitignore` に追加

### ●マルチ環境構成

```yaml
# compose.production.yml
services:
  web:
    environment:
      - LOG_LEVEL=WARNING
      - GLITCHTIP_RETENTION_DAYS=90
```

```yaml
# compose.staging.yml
services:
  web:
    environment:
      - LOG_LEVEL=INFO
      - GLITCHTIP_RETENTION_DAYS=14
      - EMAIL_URL=consolemail://
```

```bash
docker compose -f compose.yml -f compose.production.yml up -d
```

### ●CI/CD 連携（Release 通知）

```yaml
# GitHub Actions
- name: Notify GlitchTip of release
  env:
    SENTRY_URL: https://glitchtip.example.com
    SENTRY_AUTH_TOKEN: ${{ secrets.GLITCHTIP_AUTH_TOKEN }}
    SENTRY_ORG: my-org
    SENTRY_PROJECT: my-project
  run: |
    glitchtip-cli releases new ${{ github.sha }}
    glitchtip-cli releases set-commits ${{ github.sha }} --auto
    glitchtip-cli releases finalize ${{ github.sha }}
    glitchtip-cli deploys new ${{ github.sha }} --env production
```

### ●リソース制限

```yaml
services:
  web:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          memory: 256M
  worker:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G
```

| 規模                   | 構成                                          | 最小メモリ |
| ---------------------- | --------------------------------------------- | ---------- |
| 小（個人・小チーム）   | all-in-one モード（`SERVER_ROLE=all_in_one`） | 256 MB     |
| 中（チーム）           | Web + Worker 分離                             | 512 MB     |
| 大（エンタープライズ） | Web × N + Worker × N + 外部 DB / Valkey       | 1 GB+      |

```bash
VTASKS_CONCURRENCY=20
DATABASE_POOL_MAX_SIZE=20
GRANIAN_WORKERS=2
```

## ■トラブルシューティング

### ●頻出エラー一覧

| 症状                                  | 原因                                                | 対処                                                         |
| ------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| メール送信が届かない                  | `EMAIL_URL` が Worker サービスに未設定              | Worker にも同じ `EMAIL_URL` を設定                           |
| メール設定で特殊文字を含むとエラー    | `@` `/` `+` が未エスケープ                          | URL エンコード（例: `@` → `%40`）                            |
| DSN 送信が届かない                    | `GLITCHTIP_DOMAIN` が `http://` 始まり              | `https://` に変更し DSN を再コピー                           |
| DSN 送信が届かない                    | リバースプロキシが chunked Transfer-Encoding 非対応 | Nginx で `proxy_request_buffering off;` を設定               |
| マイグレーションが失敗                | PostgreSQL が 14 未満                               | 14 以上にアップグレード                                      |
| マイグレーションが失敗                | DB ユーザーに CREATE / ALTER 権限がない             | DDL 権限を付与                                               |
| イベントが UI に表示されない          | Worker が停止 / クラッシュ                          | `docker compose logs worker` を確認、`restart worker`        |
| イベントが UI に表示されない          | Valkey 接続が切れている                             | `VALKEY_URL` を確認、`restart valkey`                        |
| Worker が動かない                     | `VTASKS_CONCURRENCY` がリソース超過                 | 小規模では `VTASKS_CONCURRENCY=4` に下げる                   |
| 503 / 接続エラー                      | Granian のポートが変更された（v6 で 8080 → 8000）   | リバースプロキシのアップストリームを 8000 に                 |
| CSRF エラー                           | `CSRF_TRUSTED_ORIGINS` 未設定                       | `CSRF_TRUSTED_ORIGINS=https://glitchtip.example.com` を追加  |
| v6 アップグレード後にイベントが消えた | UUIDv7 移行で既定 10,000 件のみ自動移行             | `GLITCHTIP_RETAIN_LEGACY_DATA=True` + `import_legacy_events` |
| ディスクがすぐに満杯                  | `GLITCHTIP_RETENTION_DAYS` が長すぎる               | 保持期間短縮 or DuckDB コールドストレージ導入                |
| OAuth ログイン失敗                    | コールバック URL がプロバイダー設定と不一致         | `/accounts/<provider>/login/callback/` を確認                |

### ●デバッグ手順の基本フロー

```bash
# 1. ログを詳細モードに
LOG_LEVEL=DEBUG

# 2. 再起動
docker compose up -d

# 3. サービスごとのログ確認
docker compose logs -f web
docker compose logs -f worker

# 4. GlitchTip CLI で設定確認
glitchtip-cli info

# 5. テストイベント送信
glitchtip-cli send-event -m "Test: $(date)"

# 6. メンテナンスモード（DB 作業中にイベントを止める）
MAINTENANCE_EVENT_FREEZE=true docker compose up -d
```

### ●GlitchTip 6 移行チェックリスト

- [ ] v5.x に先にアップグレード済みか確認
- [ ] リバースプロキシのポートを 8080 → 8000 に変更
- [ ] Valkey / Redis バージョンが 7 以上であることを確認
- [ ] 大量データがある場合: `GLITCHTIP_RETAIN_LEGACY_DATA=True` を設定してから起動
- [ ] 起動後: `import_legacy_events` コマンドで残データを移行
- [ ] Celery 関連設定（`CELERY_*`）を `VTASKS_CONCURRENCY` に移行
- [ ] Worker コンテナの起動コマンドを確認（`SERVER_ROLE=worker`）

## ■まとめ

GlitchTip は、Sentry SDK と完全互換の MIT ライセンスで提供されるエラートラッキングプラットフォームです。Django + PostgreSQL + Valkey の軽量構成で小規模 VPS から運用でき、DSN 変更のみで Sentry からの移行が完了します。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNS でのシェアをいただけると励みになります！

## ■参考リンク

- 公式ドキュメント
  - [GlitchTip 公式サイト](https://glitchtip.com/)
  - [GlitchTip ドキュメント](https://glitchtip.com/documentation/)
  - [公式インストールガイド](https://glitchtip.com/documentation/install/)
  - [Hosted GlitchTip: Architecture and Security Compliance](https://glitchtip.com/documentation/hosted-architecture/)
  - [GlitchTip Integrations](https://glitchtip.com/documentation/integrations/)
  - [GlitchTip CLI ドキュメント](https://glitchtip.com/documentation/cli/)
  - [Uptime Monitoring ドキュメント](https://glitchtip.com/documentation/uptime-monitoring/)
  - [Error Tracking ドキュメント](https://glitchtip.com/documentation/error-tracking/)
  - [GlitchTip Python SDK](https://glitchtip.com/sdkdocs/python/)
  - [GlitchTip JavaScript SDK](https://glitchtip.com/sdkdocs/javascript/)
  - [Celery SDK ドキュメント](https://glitchtip.com/sdkdocs/python-celery/)
  - [GlitchTip 6 リリースノート](https://glitchtip.com/blog/2026-02-03-glitchtip-6-released/)
  - [GlitchTip 5.2 リリースノート](https://glitchtip.com/blog/2025-11-13-glitchtip-5-2-released/)
  - [サステナブルオープンソース（ライセンス解説）](https://glitchtip.com/blog/2021-04-09-sustainable-open-source/)
  - [compose.sample.yml（公式）](https://glitchtip.com/assets/compose.sample.yml)
  - [compose.minimal.yml（公式）](https://glitchtip.com/assets/compose.minimal.yml)
- GitHub / GitLab
  - [GlitchTip Backend - GitLab](https://gitlab.com/glitchtip/glitchtip-backend)
  - [GlitchTip Frontend - GitLab](https://gitlab.com/glitchtip/glitchtip-frontend)
  - [GlitchTip Helm Chart](https://gitlab.com/glitchtip/glitchtip-helm-chart)
  - [organizations_ext/models.py](https://gitlab.com/glitchtip/glitchtip-backend/-/raw/master/apps/organizations_ext/models.py)
  - [projects/models.py](https://gitlab.com/glitchtip/glitchtip-backend/-/raw/master/apps/projects/models.py)
  - [issue_events/models.py](https://gitlab.com/glitchtip/glitchtip-backend/-/raw/master/apps/issue_events/models.py)
  - [uptime/models.py](https://gitlab.com/glitchtip/glitchtip-backend/-/raw/master/apps/uptime/models.py)
  - [alerts/models.py](https://gitlab.com/glitchtip/glitchtip-backend/-/raw/master/apps/alerts/models.py)
  - [releases/models.py](https://gitlab.com/glitchtip/glitchtip-backend/-/raw/master/apps/releases/models.py)
  - [performance/models.py](https://gitlab.com/glitchtip/glitchtip-backend/-/raw/master/apps/performance/models.py)
  - [Observability API MR - django-prometheus](https://gitlab.com/glitchtip/glitchtip-backend/-/merge_requests/129)
  - [Backend Issues](https://gitlab.com/glitchtip/glitchtip-backend/-/issues)
  - [Docker Hub: glitchtip/glitchtip](https://hub.docker.com/r/glitchtip/glitchtip)
  - [docker-glitchtip-traefik 構成例](https://github.com/ruanbekker/docker-glitchtip-traefik)
  - [GlitchTipForge - 本番向け Docker Compose 構成](https://github.com/SyntaxArc/GlitchTipForge)
- 記事
  - [GlitchTip vs Sentry - DEV Community](https://dev.to/selfhostingsh/glitchtip-vs-sentry-206o)
  - [GlitchTip vs Sentry vs Bugsink](https://www.bugsink.com/blog/glitchtip-vs-sentry-vs-bugsink/)
  - [Setup GlitchTip on Docker - DEV Community](https://dev.to/ruanbekker/setup-glitchtip-error-monitoring-on-docker-358)
  - [Setup GlitchTip with K8S - DevOps.dev](https://blog.devops.dev/setup-glitchtip-with-k8s-a-simpler-sentry-alternative-0124d938736c)
  - [Games24x7 Tech - GlitchTip 本番運用事例](https://medium.com/@Games24x7Tech/cutting-costs-without-cutting-corners-embracing-glitchtip-an-open-source-error-tracking-at-235d521e5bcc)
