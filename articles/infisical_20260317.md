---
title: "技術調査 - Infisical"
emoji: "🔐"
type: "tech"
topics: ["Infisical", "SecretManagement", "Kubernetes", "PKI", "Security"]
published: true
published_at: 2026-03-17
---

## 概要

[Infisical](https://infisical.com/) は、シークレット・証明書・特権アクセスを一元管理するオープンソースプラットフォームです。MIT ライセンスで公開されており、Y Combinator 出身のスタートアップが開発しています。

開発者・インフラ・セキュリティチームが、APIキー・データベース認証情報・設定値をセキュアに保存・配布・ローテーションできます。ハードコードされたシークレットを排除し、複数環境・インフラ間で認証情報を安全に自動配布します。

月間 5 億個以上のシークレットを保護しており、500 社以上が採用しています。

## 特徴

### シークレット管理

- 環境（開発・ステージング・本番）をまたいだ一元管理
- バージョン管理とポイントインタイムリカバリ
- 動的シークレット（Dynamic Secrets）：PostgreSQL・MySQL・RabbitMQ 等へのエフェメラルな認証情報のオンデマンド発行
- ローテーション自動化（PostgreSQL・MySQL・AWS IAM 等に対応）
- シークレット参照（Secret References）：他シークレットの値を参照する変数展開
- シークレットスキャン：コードリポジトリ・CI/CD パイプライン内のハードコード検出

### 統合・配布

- 50 以上の外部サービスへのシークレット同期（AWS・GCP・Azure・GitHub・Vercel・Terraform・Ansible 等）
- Kubernetes・Terraform・CI/CD パイプライン・ローカル開発環境へのネイティブ統合
- マルチ言語 SDK：Node.js・Python・Go・Java・Ruby・.NET
- CLI・REST API・Kubernetes Operator・エージェントによる多様なアクセス手段

### 証明書管理 - PKI

- 内部 CA による X.509 証明書のライフサイクル管理（発行・更新・失効）
- CA 階層構成：Root CA → Intermediate CA の多段構成
- 外部 CA 統合：Let's Encrypt・DigiCert・Microsoft AD CS
- ACME プロトコル（RFC 8555）による証明書自動更新（HTTP-01 / DNS-01 チャレンジ）
- SSH 証明書ベース認証：短命の証明書（推奨最大 1 時間）でパスワード認証・静的鍵を排除

### アクセス制御・セキュリティ

- RBAC（ロールベースアクセス制御）と細粒度の追加権限設定
- 特権アクセス管理（PAM）：ジャストインタイム型アクセスと承認ワークフロー
- 一時的アクセス権限の付与と自動失効
- 監査ログによる全操作の追跡

### 認証

| 認証方式 | 用途 |
|---|---|
| Universal Auth | 汎用マシン ID 認証 |
| Kubernetes Auth | Pod からの認証 |
| AWS / GCP / Azure Auth | クラウドネイティブ認証 |
| OIDC Auth | OpenID Connect 対応 |
| SSO / SCIM | エンタープライズ ID 管理 |

### デプロイメント

- クラウド（Infisical Cloud）・セルフホスト・オフラインモードに対応
- PostgreSQL（プライマリ DB）と Redis（キャッシュ・キュー）で構成
- Docker・Kubernetes によるデプロイ

### 暗号化アーキテクチャ

Infisical はシークレット暗号化に 2 つのバージョンを持ちます。

| 項目 | V1 | V2 |
|------|----|----|
| 暗号化方式 | ボットキー対称暗号 | KMS 管理暗号 |
| キー保管 | `project_bots` テーブル | `kms_keys` テーブル |
| シークレット名 | 暗号化 + ブラインドインデックス | プレーンテキスト |
| キーサイズ | 128-bit | 256-bit |

`shouldUseSecretV2Bridge` フラグにより、プロジェクトバージョンに応じてルーティングが決定されます。

**鍵階層（Key Hierarchy）**

```
Root Encryption Key - 256-bit AES
  └─ オペレーターが環境変数で提供。HSM連携も可能
     └─ Internal KMS Root Key - 256-bit AES
          └─ インスタンス初回起動時に自動生成、DBに暗号化保存
               ├─ Organization Data Key - 256-bit AES
               │    └─ SSO設定・Machine Identity・SCIM設定を保護
               └─ Project Data Key - 256-bit AES
                    └─ シークレット・証明書・APIキーを保護
```

**V2 暗号化フロー（書き込み時）：**

1. DB から暗号化済みデータキーを取得します
2. Internal KMS Root Key でデータキーを復号します
3. AES-256-GCM と 96-bit ランダムノンスでプレーンテキストを暗号化します
4. 暗号文・ノンス・認証タグを DB に保存します

**V2 復号フロー（読み出し時）：**

1. DB からデータキーを取得し復号します
2. 暗号文・ノンス・認証タグを取得します
3. AES-256-GCM で復号します
4. `conditionallyHideSecretValue()` で権限に応じてマスキングを適用します

### コンプライアンス

- SOC 2・HIPAA・FIPS 140-3 準拠
- AES-GCM-256 暗号化
- 稼働率 99.99% の SLA（クラウド版）

## 構造

### システムコンテキスト図

```mermaid
graph TD
    Developer[開発者]
    Operator[運用者]
    Application[アプリケーション]
    Infisical[Infisical]
    LicenseServer[ライセンスサーバー]
    SMTP[メールサービス]
    OAuthProvider[OAuthプロバイダー]
    IntegrationPlatform[連携プラットフォーム]
    HSM[ハードウェアセキュリティモジュール]

    Developer --> Infisical
    Operator --> Infisical
    Application --> Infisical
    Infisical --> LicenseServer
    Infisical --> SMTP
    Infisical --> OAuthProvider
    Infisical --> IntegrationPlatform
    Infisical --> HSM
```

| 要素名 | 説明 |
|--------|------|
| 開発者 | Web UI・CLI・SDK を通じてシークレットを管理するユーザー |
| 運用者 | プラットフォームの設定・監視・アクセス制御を担うユーザー |
| アプリケーション | SDK・Agent・Kubernetes Operator を通じてシークレットを取得するシステム |
| Infisical | シークレット・証明書・特権アクセスを一元管理するプラットフォーム |
| ライセンスサーバー | エンタープライズ機能のライセンス検証を行う外部サービス |
| メールサービス | ユーザー招待・通知メールを送信する外部 SMTP サービス |
| OAuthプロバイダー | ソーシャルログインによる認証を提供する外部 ID プロバイダー |
| 連携プラットフォーム | シークレットの同期先となるクラウド・CI/CD・PaaS |
| ハードウェアセキュリティモジュール | 暗号鍵をハードウェアレベルで保護するオプションの外部デバイス |

### コンテナ図

```mermaid
graph TD
    Developer[開発者]
    Operator[運用者]
    Application[アプリケーション]

    subgraph Infisical
        WebUI[Web UI]
        CLI[CLI]
        SDK[SDK]
        Agent[Agent]
        KubernetesOperator[Kubernetes Operator]
        APIGateway[APIゲートウェイ]
        AppServer[アプリケーションサーバー]
        BackgroundWorker[バックグラウンドワーカー]
        Database[データベース]
        ReadReplica[読み取りレプリカ]
        Cache[キャッシュ・キュー]
        AuditDB[監査ログDB]
    end

    Developer --> WebUI
    Developer --> CLI
    Operator --> WebUI
    Application --> SDK
    Application --> Agent
    Application --> KubernetesOperator

    WebUI --> APIGateway
    CLI --> APIGateway
    SDK --> APIGateway
    Agent --> APIGateway
    KubernetesOperator --> APIGateway

    APIGateway --> AppServer
    AppServer --> Database
    AppServer --> ReadReplica
    AppServer --> Cache
    AppServer --> AuditDB
    AppServer --> BackgroundWorker
    BackgroundWorker --> Cache
    BackgroundWorker --> Database
```

| 要素名 | 説明 |
|--------|------|
| Web UI | React/Next.js 製のブラウザベース管理コンソール |
| CLI | Go 製のコマンドラインツール。SSH ゲートウェイ機能も提供 |
| SDK | Node.js・Python・Java・Go・Ruby・.NET 向けの言語別ライブラリ |
| Agent | シークレットを自動取得・更新するデーモンプロセス |
| Kubernetes Operator | CRD を通じてシークレットを Kubernetes ネイティブに同期するコンポーネント |
| APIゲートウェイ | Nginx による SSL 終端・レート制限・ルーティングを行うリバースプロキシ |
| アプリケーションサーバー | Fastify ベースの REST API サーバー。ビジネスロジックを担う中核コンテナ |
| バックグラウンドワーカー | BullMQ による非同期ジョブ処理ワーカー |
| データベース | PostgreSQL による主要データの永続ストレージ |
| 読み取りレプリカ | クエリ負荷分散のための PostgreSQL レプリカ |
| キャッシュ・キュー | Redis によるセッション管理・分散ロック・ジョブキュー |
| 監査ログDB | コンプライアンス要件に対応する分離された監査ログ用 PostgreSQL |

### コンポーネント図

```mermaid
graph TD
    APIGateway[APIゲートウェイ]

    subgraph AppServer[アプリケーションサーバー]
        Middleware[ミドルウェアパイプライン]
        AuthService[認証サービス]
        SecretService[シークレットサービス]
        ProjectService[プロジェクトサービス]
        IdentityService[IDサービス]
        PKIService[PKIサービス]
        IntegrationService[連携サービス]
        KMSService[KMSサービス]
        AuditService[監査ログサービス]
        LicenseService[ライセンスサービス]
        PermissionService[権限サービス]
        QueueService[キューサービス]
        DAL[データアクセス層]
    end

    subgraph BackgroundWorker[バックグラウンドワーカー]
        SecretWorker[シークレットワーカー]
        IntegrationWorker[連携ワーカー]
        AuditWorker[監査ワーカー]
        GeneralWorker[汎用ワーカー]
    end

    Database[(PostgreSQL)]
    Cache[(Redis)]

    APIGateway --> Middleware
    Middleware --> AuthService
    Middleware --> PermissionService
    AuthService --> IdentityService
    PermissionService --> ProjectService
    ProjectService --> SecretService
    ProjectService --> PKIService
    ProjectService --> IntegrationService
    SecretService --> KMSService
    SecretService --> DAL
    PKIService --> DAL
    IntegrationService --> DAL
    AuditService --> DAL
    LicenseService --> DAL
    QueueService --> Cache
    QueueService --> SecretWorker
    QueueService --> IntegrationWorker
    QueueService --> AuditWorker
    QueueService --> GeneralWorker
    DAL --> Database
    DAL --> Cache
```

| 要素名 | 説明 |
|--------|------|
| ミドルウェアパイプライン | Cookie パース・CORS・Helmet・IP 検出・ID 注入・権限注入などの順次処理 |
| 認証サービス | JWT・APIキー・OAuthなど12種以上の認証方式を実装する `authLoginServiceFactory` |
| シークレットサービス | V1/V2 の2方式に対応する `secretServiceFactory`・`secretV2BridgeServiceFactory` |
| プロジェクトサービス | プロジェクト・環境の作成と設定を管理する `projectServiceFactory` |
| IDサービス | マシン ID と認証方式の管理を担う `identityServiceFactory` |
| PKIサービス | 証明書認証局と ACME プロトコルを提供する `certificateAuthorityServiceFactory` |
| 連携サービス | 50 以上の外部プラットフォームへのシークレット同期を行う `integrationServiceFactory` |
| KMSサービス | V2 シークレット暗号化で使用する暗号鍵を管理する `kmsServiceFactory` |
| 監査ログサービス | 操作履歴とコンプライアンス記録を管理する `auditLogServiceFactory` |
| ライセンスサービス | 機能ゲーティングとエンタープライズ機能の有効化を管理する `licenseServiceFactory` |
| 権限サービス | CASL ベースの属性ベースアクセス制御を提供する `permissionServiceFactory` |
| キューサービス | BullMQ によるジョブのエンキューとワーカー管理を行う `queueServiceFactory` |
| データアクセス層 | Knex クエリビルダーで PostgreSQL・Redis へのアクセスを抽象化するドメイン別 DAL |
| シークレットワーカー | シークレット関連の非同期ジョブ処理 |
| 連携ワーカー | 外部プラットフォームへのシークレット同期ジョブ処理 |
| 監査ワーカー | 監査ログの書き込みジョブ処理 |
| 汎用ワーカー | テレメトリ収集・定期メンテナンスなどの汎用ジョブ処理 |

## データ

### 概念モデル

```mermaid
graph TD
  Organization["Organization"]
  SubOrganization["Sub-Organization"]
  Project["Project"]
  Environment["Environment"]
  Folder["Folder"]
  Secret["Secret"]
  SecretVersion["Secret Version"]
  SecretTag["Secret Tag"]
  SecretImport["Secret Import"]
  SecretRotation["Secret Rotation"]
  User["User"]
  MachineIdentity["Machine Identity"]
  Group["Group"]
  Role["Role"]
  Permission["Permission"]
  CertificateAuthority["Certificate Authority"]
  Certificate["Certificate"]
  Integration["Integration"]
  AuditLog["Audit Log"]

  Organization --> SubOrganization
  Organization --> Project
  Organization --> User
  Organization --> MachineIdentity
  Organization --> Group
  Project --> Environment
  Environment --> Folder
  Folder --> Secret
  Secret --> SecretVersion
  Secret --> SecretTag
  Secret --> SecretImport
  Secret --> SecretRotation
  Project --> CertificateAuthority
  CertificateAuthority --> Certificate
  Project --> Integration

  User --> Role
  MachineIdentity --> Role
  Group --> Role
  Role --> Permission

  User -.-> AuditLog
  MachineIdentity -.-> AuditLog
```

| 要素名 | 説明 |
|---|---|
| Organization | 最上位のテナント単位。プロジェクト・メンバー・課金を統括 |
| Sub-Organization | Enterprise 向けの子 Organization。親リソースを継承 |
| Project | Organization 内の独立した作業空間。種別は Secrets Management / PKI / PAM |
| Environment | Project 内のシークレット区画。dev / staging / production など |
| Folder | Environment 内の階層ディレクトリ。マイクロサービスなど論理単位で区切り |
| Secret | 保護対象の鍵と値のペア |
| Secret Version | Secret の変更履歴。変更のたびに生成 |
| Secret Tag | Secret に付与するメタデータラベル |
| Secret Import | Project 内の別 Environment や Folder からシークレットを参照 |
| Secret Rotation | 定期的に Secret の値を自動更新する設定 |
| User | 人間のアカウント。Organization および Project に所属 |
| Machine Identity | ワークロードやアプリケーションを表す機械アカウント |
| Group | User をまとめた集合。ロールを一括付与 |
| Role | Organization または Project レベルの権限セット |
| Permission | Role が持つ個別の操作許可 |
| Certificate Authority | PKI のルート CA または中間 CA |
| Certificate | CA が発行する X.509 証明書 |
| Integration | AWS / GitHub など外部プラットフォームへのシークレット同期設定 |
| AuditLog | User または Machine Identity の操作記録 |

### 情報モデル

```mermaid
classDiagram
  class Organization {
    +String id
    +String name
    +String slug
    +String plan
    +DateTime createdAt
  }
  class Project {
    +String id
    +String name
    +String slug
    +String type
    +String encryptionVersion
    +String orgId
    +DateTime createdAt
  }
  class Environment {
    +String id
    +String name
    +String slug
    +String projectId
    +Int position
  }
  class Folder {
    +String id
    +String name
    +String path
    +String envId
    +String parentId
  }
  class Secret {
    +String id
    +String key
    +String value
    +String type
    +String folderId
    +String envId
    +String projectId
    +DateTime createdAt
    +DateTime updatedAt
  }
  class SecretVersion {
    +String id
    +String secretId
    +Int version
    +String key
    +String value
    +DateTime createdAt
  }
  class SecretTag {
    +String id
    +String name
    +String slug
    +String color
    +String projectId
  }
  class SecretRotation {
    +String id
    +String secretId
    +String type
    +Int rotationInterval
    +String rotationStatus
    +DateTime lastRotatedAt
    +DateTime nextRotationAt
  }
  class SecretImport {
    +String id
    +String folderId
    +String importEnv
    +String importPath
    +Int position
  }
  class User {
    +String id
    +String email
    +String username
    +String firstName
    +String lastName
    +DateTime createdAt
  }
  class MachineIdentity {
    +String id
    +String name
    +String authMethod
    +String orgId
    +DateTime createdAt
  }
  class Group {
    +String id
    +String name
    +String slug
    +String orgId
    +DateTime createdAt
  }
  class Role {
    +String id
    +String name
    +String slug
    +String scope
    +Boolean isCustom
  }
  class Permission {
    +String id
    +String subject
    +String action
    +String conditions
  }
  class CertificateAuthority {
    +String id
    +String name
    +String type
    +String status
    +String projectId
    +DateTime notAfter
  }
  class Certificate {
    +String id
    +String commonName
    +String serialNumber
    +String status
    +String caId
    +DateTime notAfter
  }
  class Integration {
    +String id
    +String app
    +String environment
    +String secretPath
    +String projectId
    +Boolean isSynced
    +DateTime lastSyncedAt
  }
  class AuditLog {
    +String id
    +String orgId
    +String projectId
    +String actorType
    +String actorId
    +String eventType
    +String ipAddress
    +DateTime createdAt
  }

  Organization "1" --> "0..*" Project
  Organization "1" --> "0..*" User
  Organization "1" --> "0..*" MachineIdentity
  Organization "1" --> "0..*" Group
  Project "1" --> "1..*" Environment
  Environment "1" --> "1..*" Folder
  Folder "1" --> "0..*" Secret
  Secret "1" --> "0..*" SecretVersion
  Secret "0..*" --> "0..*" SecretTag
  Secret "1" --> "0..1" SecretRotation
  Folder "1" --> "0..*" SecretImport
  Project "1" --> "0..*" CertificateAuthority
  CertificateAuthority "1" --> "0..*" Certificate
  Project "1" --> "0..*" Integration
  Role "1" --> "0..*" Permission
  User "0..*" --> "0..*" Role
  MachineIdentity "0..*" --> "0..*" Role
  Group "0..*" --> "0..*" Role
  User "0..*" --> "0..*" Group
```

| 要素名 | 説明 |
|---|---|
| Organization | テナントの基本単位。`plan` で課金プランを管理 |
| Project | Secrets Management / PKI / PAM のいずれかの `type` を持つ作業空間 |
| Environment | Project 内の区画。`slug` で API から参照 |
| Folder | Environment 内の階層パス。`parentId` で入れ子を実現 |
| Secret | `key`/`value` のペア。`type` で通常・共有などを区別 |
| SecretVersion | Secret の `version` 番号付き変更履歴 |
| SecretTag | `color` 付きのラベル。複数の Secret に付与可能 |
| SecretRotation | `rotationInterval`（日数）で自動ローテーションを制御 |
| SecretImport | `importEnv` と `importPath` で参照先を指定 |
| User | `email` と `username` を持つ人間アカウント |
| MachineIdentity | `authMethod` でトークン認証・クラウド認証などを選択 |
| Group | 複数 User をまとめてロール付与するための集合 |
| Role | `scope`（org / project）と `isCustom` でカスタムロールを区別 |
| Permission | `subject`（リソース種別）と `action`（操作）の組み合わせ |
| CertificateAuthority | `type`（root / intermediate）と `status` を持つ CA |
| Certificate | `serialNumber` と `notAfter` でライフサイクルを管理 |
| Integration | `app` で外部プラットフォームを指定し `isSynced` で同期状態を表示 |
| AuditLog | `actorType` と `eventType` で操作主体と操作種別を記録 |

## 構築方法

### Docker Compose でのセルフホスト

- 最小要件：CPU 2コア / RAM 4GB / ストレージ 20GB
- 推奨要件：CPU 4コア / RAM 8GB / SSD 50GB 以上

```bash
# 1. 設定ファイルを取得
curl -o docker-compose.prod.yml \
  https://raw.githubusercontent.com/Infisical/infisical/main/docker-compose.prod.yml
curl -o .env \
  https://raw.githubusercontent.com/Infisical/infisical/main/.env.example

# 2. 暗号化キーを生成して .env に設定
export ENCRYPTION_KEY=$(openssl rand -base64 32)
export AUTH_SECRET=$(openssl rand -base64 32)
export DB_PASSWORD=$(openssl rand -base64 32)

# 3. サービス起動
docker compose -f docker-compose.prod.yml up -d

# 4. 起動確認
curl -s http://localhost:80/api/status
```

**docker-compose.yml 構成例**

```yaml
version: '3.9'

services:
  backend:
    image: infisical/infisical:latest
    ports:
      - "80:8080"
    depends_on: [postgres, redis]
    environment:
      - NODE_ENV=production
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - AUTH_SECRET=${AUTH_SECRET}
      - DB_CONNECTION_URI=postgres://infisical:${DB_PASSWORD}@postgres:5432/infisical
      - REDIS_URL=redis://redis:6379
      - SITE_URL=https://infisical.yourdomain.com
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_USERNAME=${SMTP_USERNAME}
      - SMTP_PASSWORD=${SMTP_PASSWORD}

  postgres:
    image: postgres:14-alpine
    environment:
      - POSTGRES_USER=infisical
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=infisical

  redis:
    image: redis:7-alpine
```

### Kubernetes / Helm でのデプロイ

```bash
# 1. 名前空間を作成
kubectl create namespace infisical

# 2. Helm リポジトリを追加
helm repo add infisical-helm-charts \
  'https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/'
helm repo update

# 3. シークレットを作成
kubectl create secret generic infisical-secrets \
  --from-literal=AUTH_SECRET="<auth-secret>" \
  --from-literal=ENCRYPTION_KEY="<encryption-key>" \
  --from-literal=DB_CONNECTION_URI="<db-uri>" \
  --from-literal=REDIS_URL="<redis-url>" \
  --from-literal=SITE_URL="https://infisical.example.com" \
  --namespace infisical

# 4. デプロイ
helm upgrade --install infisical infisical-helm-charts/infisical-standalone \
  --namespace infisical \
  --values values.yaml
```

**values.yaml 最小構成例**

```yaml
infisical:
  image:
    repository: infisical/infisical
    tag: "v0.151.0"
    pullPolicy: IfNotPresent
  replicaCount: 2
  kubeSecretRef: "infisical-secrets"

ingress:
  enabled: true
  hostName: "infisical.example.com"
  ingressClassName: nginx
```

### Infisical Cloud の利用

https://app.infisical.com からサインアップします。インフラ管理不要でフルマネージド環境を即日利用できます。

| プラン | 用途 |
|--------|------|
| Free | 個人・小規模チーム |
| Pro | チーム・スタートアップ |
| Enterprise | 大規模組織・コンプライアンス要件あり |

### 初期設定・環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `ENCRYPTION_KEY` | シークレット暗号化キー（32バイト） | 必須 |
| `AUTH_SECRET` | JWT 署名シークレット（32バイト） | 必須 |
| `DB_CONNECTION_URI` | PostgreSQL 接続 URI | 必須 |
| `REDIS_URL` | Redis 接続 URI | 必須 |
| `SITE_URL` | Infisical の公開 URL | 必須 |
| `SMTP_HOST` | メール送信ホスト | オプション |
| `SMTP_PORT` | SMTP ポート番号 | オプション |
| `SMTP_USERNAME` | SMTP ユーザー名 | オプション |
| `SMTP_PASSWORD` | SMTP パスワード | オプション |
| `TELEMETRY_ENABLED` | テレメトリー送信の有効化 | オプション |

`ENCRYPTION_KEY` は紛失するとシークレットが復元不能になります。必ずバックアップを取得してください。

## 利用方法

### CLI の基本操作

**インストール**

```bash
# macOS
brew install infisical/get-cli/infisical

# Linux (apt)
curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo bash
sudo apt-get install infisical
```

**主要コマンド**

```bash
# ログイン
infisical login

# プロジェクトに紐付け（.infisical.json を生成）
infisical init

# シークレットをインジェクトしてコマンドを実行
infisical run --env=dev -- npm run dev
infisical run --env=prod -- node server.js

# 複数コマンドをチェーン
infisical run --command "npm install && npm run build && npm start"

# CI/CD 向け（マシンアイデンティティトークン使用）
infisical run --token=$INFISICAL_TOKEN --projectId=<project-id> -- ./deploy.sh

# シークレット変更時にホットリロード
infisical run --watch --watch-interval=30 -- npm run dev

# 特定パスのシークレットを取得
infisical run --path=/backend/api --env=staging -- python app.py

# シークレットを一覧表示
infisical secrets --env=dev

# シークレットを設定
infisical secrets set MY_SECRET=value --env=dev
```

**主要オプション**

| オプション | 説明 |
|-----------|------|
| `--env` | 対象環境（dev / staging / prod） |
| `--path` | シークレットのフォルダパス |
| `--recursive` | サブフォルダのシークレットも取得 |
| `--token` | マシンアイデンティティトークン |
| `--projectId` | プロジェクト ID |
| `--watch` | シークレット変更の監視を有効化 |

### SDK の利用

#### Node.js SDK

```bash
npm install @infisical/sdk
```

```javascript
const { InfisicalSDK } = require("@infisical/sdk");

const client = new InfisicalSDK({
  siteUrl: "https://app.infisical.com"
});

await client.auth().universalAuth.login({
  clientId: "<machine-identity-client-id>",
  clientSecret: "<machine-identity-client-secret>"
});

// シークレットを取得
const secret = await client.secrets().getSecret({
  environment: "dev",
  projectId: "<project-id>",
  secretPath: "/",
  secretName: "DATABASE_URL"
});

console.log(secret.secretValue);
```

#### Python SDK

```bash
pip install infisicalsdk
```

```python
from infisical_sdk import InfisicalSDKClient

client = InfisicalSDKClient(host="https://app.infisical.com")
client.auth.universal_auth.login(
    client_id="<machine-identity-client-id>",
    client_secret="<machine-identity-client-secret>"
)

# シークレットを一覧取得
secrets = client.secrets.list_secrets(
    project_id="<project-id>",
    environment_slug="dev",
    secret_path="/"
)

# 特定のシークレットを取得
secret = client.secrets.get_secret_by_name(
    secret_name="DATABASE_URL",
    project_id="<project-id>",
    environment_slug="dev",
    secret_path="/"
)

print(secret.secret_value)
```

- Python SDK はクライアントサイドキャッシュを内蔵（デフォルト：60 秒）
- Python 3.7 以上が必要

### Kubernetes Operator

Kubernetes Operator は Infisical のシークレットを Kubernetes Secret に同期するコントローラーです。

**インストール**

```bash
helm repo add infisical-helm-charts \
  'https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/'
helm repo update

# クラスター全体にインストール
helm install --generate-name infisical-helm-charts/secrets-operator

# 特定の名前空間にスコープを限定
helm install operator-namespaced infisical-helm-charts/secrets-operator \
  --namespace target-namespace \
  --set scopedNamespaces=target-namespace \
  --set scopedRBAC=true
```

**サポートする CRD**

| CRD | 説明 |
|-----|------|
| `InfisicalSecret` | Infisical のシークレットを Kubernetes Secret に同期 |
| `InfisicalPushSecret` | Kubernetes Secret を Infisical に Push |
| `InfisicalDynamicSecret` | 動的シークレットのリースを自動管理 |

**InfisicalSecret マニフェスト例**

```yaml
apiVersion: secrets.infisical.com/v1alpha1
kind: InfisicalSecret
metadata:
  name: my-infisical-secret
  namespace: default
spec:
  hostAPI: https://app.infisical.com/api
  resyncInterval: 60
  authentication:
    universalAuth:
      secretsScope:
        projectSlug: "my-project"
        envSlug: "prod"
        secretsPath: "/"
      credentialsRef:
        secretName: universal-auth-credentials
        secretNamespace: default
  managedSecretReference:
    secretName: my-k8s-secret
    secretNamespace: default
```

### Infisical Agent

Infisical Agent は、トークン管理とシークレット取得を自動化するデーモンです。

**主な機能**

- アクセストークンの自動取得・更新
- Go テンプレートによるシークレットの任意フォーマット出力
- シークレット変更検知後の任意コマンド実行（アプリ再起動など）

**設定ファイル例（agent-config.yaml）**

```yaml
infisical:
  address: "https://app.infisical.com"

auth:
  type: "universal-auth"
  config:
    client-id: "./client-id"
    client-secret: "./client-secret"

sinks:
  - type: "file"
    config:
      path: "/tmp/infisical-token"

templates:
  - source-path: ./secret.template
    destination-path: /app/.env
    config:
      polling-interval: 60s
      execute:
        command: ./reload-app.sh
        timeout: 30
```

**テンプレートファイル例（secret.template）**

```
{{- with secret "my-project" "prod" "/" }}
DATABASE_URL={{ .DB_URL }}
API_KEY={{ .API_KEY }}
{{- end }}
```

**起動**

```bash
infisical agent --config agent-config.yaml
```

**サポートする認証方式**

| タイプ | 用途 |
|--------|------|
| `universal-auth` | クライアント ID / シークレット認証 |
| `kubernetes` | Kubernetes Service Account 認証 |
| `aws-iam` | AWS IAM 認証 |
| `azure` | Azure Managed Identity 認証 |
| `gcp-id-token` | GCP ID Token 認証 |

### CI/CD 連携 - GitHub Actions

OIDC 認証によるシークレット取得が推奨です。静的な認証情報を GitHub Secrets に保存する必要がありません。

**設定手順**

1. Infisical でマシンアイデンティティを作成します
2. 認証方式として OIDC Auth を選択します
3. Discovery URL を `https://token.actions.githubusercontent.com` に設定します
4. Subject を `repo:<owner>/<repo>:ref:refs/heads/main` に設定します
5. Identity ID をワークフローに記述します

**ワークフロー例**

```yaml
name: Deploy

on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: Infisical/secrets-action@v1.0.9
        with:
          method: "oidc"
          identity-id: "your-identity-id"
          project-slug: "your-project-slug"
          env-slug: "prod"

      - name: Use secrets
        run: |
          echo "$DATABASE_URL"
```

取得したシークレットはジョブのライフタイム中、環境変数として利用できます。ログ上では自動的にマスクされます。

### PKI・証明書管理

**Root CA の作成**

```bash
curl -X POST "https://app.infisical.com/api/v1/cert-manager/ca/internal" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "<your-project-slug>",
    "type": "root",
    "commonName": "My Root CA"
  }'
```

**Intermediate CA の作成と署名**

```bash
# Intermediate CA を作成
curl -X POST "https://app.infisical.com/api/v1/cert-manager/ca/internal" \
  -d '{"projectSlug": "<slug>", "type": "intermediate", "commonName": "My Intermediate CA"}'

# Root CA で CSR に署名
curl -X POST "https://app.infisical.com/api/v1/cert-manager/ca/internal/<root-ca-id>/sign-intermediate" \
  -d '{"csr": "<csr>", "notAfter": "2029-06-12"}'
```

**証明書の失効**

```bash
curl -X POST "https://app.infisical.com/api/v1/cert-manager/certificates/<cert-id>/revoke" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"revocationReason": "UNSPECIFIED"}'
```

**SSH 証明書ベース認証**

```bash
# サーバー側: ホスト登録
infisical ssh add-host \
  --projectId=<project-id> \
  --hostname=<hostname> \
  --write-user-ca-to-file \
  --write-host-cert-to-file \
  --configure-sshd

# クライアント側: SSH 接続
infisical ssh connect \
  --hostname=<host> \
  --login-user=<user>
```

二 CA 方式（User CA / Host CA）でトラスト設定を行います。発行された SSH 証明書は SSH エージェントに自動ロードされます。

### シークレットローテーション

認証情報を定期的に自動更新するセキュリティ機能です。

**ローテーション方式**

| 方式 | 説明 | 用途 |
|------|------|------|
| Dual-Phase | 2つの認証情報を交互に更新。ダウンタイムなし | 推奨（大多数のプロバイダー） |
| Single-Phase | 既存の認証情報を直接更新。更新中は旧認証情報が失効 | メンテナンスウィンドウ時のみ |

**サポートプロバイダー**

- PostgreSQL
- MySQL
- AWS IAM

### 動的シークレット

要求時に一時的な認証情報をオンデマンドで生成する機能です。TTL（有効期限）の経過後に自動失効します。

Enterprise 機能です（Infisical Cloud は Enterprise Tier、セルフホストは要ライセンス契約）。

**サポートプロバイダー**

| プロバイダー | 種別 |
|-------------|------|
| PostgreSQL | データベース |
| MySQL | データベース |
| Cassandra | データベース |
| Oracle | データベース |
| Redis | キャッシュ |
| AWS IAM | クラウド |

**Node.js SDK での動的シークレット作成例**

```javascript
import { InfisicalSDK, DynamicSecretProviders } from "@infisical/sdk";

const client = new InfisicalSDK();
await client.auth().universalAuth.login({
  clientId: "CLIENT_ID",
  clientSecret: "CLIENT_SECRET"
});

const dynamicSecret = await client.dynamicSecrets().create({
  provider: {
    type: DynamicSecretProviders.Redis,
    inputs: {
      host: "<redis-host>",
      port: 6479,
      username: "<redis-username>",
      password: "<redis-password>",
      creationStatement: "ACL SETUSER {{username}} on >{{password}} ~* &* +@all",
      revocationStatement: "ACL DELUSER {{username}}"
    }
  },
  defaultTTL: "1h",
  maxTTL: "24h",
  name: "redis-dynamic-secret",
  projectSlug: "my-project",
  environmentSlug: "dev"
});
```

**Python SDK での動的シークレット作成例**

```python
from infisical_sdk import DynamicSecretProviders

dynamic_secret = client.dynamic_secrets.create(
    name="postgres-dev",
    provider_type=DynamicSecretProviders.SQL_DATABASE,
    inputs={
        "client": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "mydb",
        "username": "admin",
        "password": "admin-password",
        "creationStatement": "CREATE USER \"{{username}}\" WITH PASSWORD '{{password}}';",
        "revocationStatement": "DROP USER \"{{username}}\";"
    },
    default_ttl="1h",
    max_ttl="24h",
    project_slug="my-project",
    environment_slug="dev",
    path="/"
)
```

## 運用

### 監視・ログ管理

**ヘルスチェック**

`/api/status` エンドポイントで稼働状態を確認できます。

```bash
curl http://localhost:8080/api/status
```

Kubernetes では Readiness / Liveness Probe をこのエンドポイントに設定します。

**Prometheus + OpenTelemetry**

以下の環境変数を設定すると Prometheus 形式でメトリクスを公開します。

```bash
OTEL_TELEMETRY_COLLECTION_ENABLED=true
OTEL_EXPORT_TYPE=prometheus
```

Kubernetes の場合は `ServiceMonitor` を作成してメトリクスを収集します。

```bash
# リソース使用量の確認
kubectl top pods -n infisical

# スロットリングの確認
kubectl describe pod -n infisical <pod-name>
```

**ログ取得（Kubernetes）**

```bash
# 全 Pod のログを追跡
kubectl logs -n infisical -l component=infisical -f

# 特定 Pod のログ
kubectl logs -n infisical <pod-name> -f

# クラッシュ前のログ
kubectl logs -n infisical <pod-name> --previous
```

**SIEM 連携**

以下のログストリーム先をサポートします（Enterprise ライセンス必須）。

| 連携先 | 備考 |
|--------|------|
| Splunk | HTTP Event Collector 経由 |
| Datadog | ネイティブプロバイダー |
| Azure Monitor / Microsoft Sentinel | Azure 統合 |
| Better Stack | カスタムエンドポイント |
| Cribl Stream | 集中処理基盤 |
| Custom | HTTP リクエストを受け付ける任意のエンドポイント |

### バックアップ・リストア

**PostgreSQL バックアップ**

```bash
# Docker/Linux 環境
pg_dump -U <username> -h <db-host> -d <db-name> > infisical_backup.sql

# Kubernetes 環境
kubectl exec -n infisical postgresql-0 -- \
  pg_dump -U infisical infisicalDB > infisical_backup.sql
```

**PostgreSQL リストア**

```bash
psql -U <username> -h <db-host> -d <db-name> < infisical_backup.sql
```

**HA 構成での継続バックアップ（CloudNativePG）**

- WAL アーカイブを S3 互換ストレージへ継続出力
- Point-in-Time Recovery（PITR）で任意の時点に復元可能

**Redis バックアップ**

```bash
redis-cli SAVE && cp /data/dump.rdb s3://backup-bucket/redis/dump.rdb
```

### HA 構成・スケーリング

アプリケーション層はステートレスなため、水平スケーリングが容易です。

**Kubernetes レプリカ数の設定**

```yaml
# values.yaml
infisical:
  replicaCount: 4
```

```bash
# 動的スケール
kubectl scale deployment -n infisical infisical --replicas=4
```

**推奨リソース（本番環境）**

| コンポーネント | CPU Request | Memory Limit |
|----------------|-------------|--------------|
| Infisical | 350m | 1000Mi |
| PostgreSQL | 250m | 512Mi |
| Redis | 100m | 256Mi |

- ノード：3 台以上、4 コア / 8GB RAM / 50GB SSD 推奨
- Pod Disruption Budget：`minAvailable: 1` を設定してメンテナンス中の可用性を維持

**Redis HA モード**

| モード | 用途 |
|--------|------|
| Standalone | 開発・小規模 |
| Sentinel | 自動フェイルオーバー（本番推奨） |
| Cluster | 水平スケール（大規模） |

**ワーカー分散**

`QUEUE_WORKER_PROFILE` 環境変数でワーカーの役割を分離します。

| 値 | 処理内容 |
|----|----------|
| All | 全ジョブ（デフォルト） |
| Secrets | シークレット関連のみ |
| Integrations | 外部連携のみ |
| General | その他全般 |

**Read Replica**

```bash
DB_READ_REPLICAS=postgres://replica-host:5432/infisical
```

### アップグレード手順

**事前確認**

```bash
# 現行バージョンの確認
cat /opt/infisical-core/version-manifest.txt

# DB・Redis の稼働確認
infisical-ctl status
```

**DB バックアップの取得（必須）**

```bash
pg_dump -U <username> -h <db-host> -d <db-name> > infisical_backup_$(date +%Y%m%d).sql
```

**Linux シングルノードのアップグレード**

```bash
# 1. サービス停止
infisical-ctl stop

# 2. パッケージ更新（Debian/Ubuntu）
sudo apt-get update && sudo apt-get install -y infisical-core

# 3. 再設定
infisical-ctl reconfigure

# 4. サービス起動
infisical-ctl start

# 5. 動作確認
infisical-ctl status
infisical-ctl tail
```

**Kubernetes（Helm）のアップグレード**

```bash
# 1. DB バックアップ
kubectl exec -n infisical postgresql-0 -- \
  pg_dump -U infisical infisicalDB > backup.sql

# 2. values.yaml のイメージタグを更新後、適用
helm upgrade infisical infisical-helm-charts/infisical-standalone \
  --namespace infisical --values values.yaml

# 3. ロールアウト監視
kubectl rollout status deployment/infisical -n infisical
```

**ロールバック**

```bash
# Helm
helm rollback infisical -n infisical

# Linux パッケージ（Debian/Ubuntu）
infisical-ctl stop
sudo apt-get install -y infisical-core=<previous-version>
psql -U <username> -h <db-host> -d <db-name> < infisical_backup.sql
infisical-ctl reconfigure
```

DB マイグレーションは PostgreSQL アドバイザリロックで排他制御されるため、マルチノード構成でも同時実行されません。

### 監査ログの活用

60 以上のイベントを監査ログとして記録します。

| フィールド | 内容 |
|-----------|------|
| `event.type` | 操作種別（例：`get-secrets`） |
| `event.metadata` | シークレットパス・環境名など |
| `actor` | 操作者（ユーザー / マシンアイデンティティ） |
| `ipAddress` | リクエスト元 IP |
| `createdAt` | タイムスタンプ |
| `orgId` / `projectId` | 組織・プロジェクト識別子 |

**主な追跡イベント例**

```
get-secrets / create-secret / delete-secret
login-attempt / failed-login
add-member / remove-member
create-service-token / revoke-service-token
```

**UI でのフィルタリング**

Project Settings > Audit Logs から以下の条件で絞り込めます。

- イベント種別
- アクター（ユーザー / マシンアイデンティティ）
- ソース（Web / CLI / SDK）
- 日時範囲

## ベストプラクティス

### シークレット管理

- 長期有効なパスワードの代わりに Dynamic Secrets を使用
- アプリケーションは Secret の値ではなく名前を参照
- プロビジョニング・配布・ローテーション・廃棄をすべて自動化
- IaC ツール（Terraform など）でシークレット権限をインフラと一括管理
- アクセス要求ワークフローで一時的な権限を付与（Just-in-Time アクセス）
- 緊急アクセス（Breakglass）は MFA 必須とし、使用後に即時ローテーション
- シークレット取得ごとにタイムスタンプ・リクエスト元 IP・アイデンティティをログに記録
- 高リスクイベントにリアルタイムアラートを設定

### アクセス制御の設計

Infisical は CASL ライブラリを採用した subject-action-object フレームワークで権限制御を行います。

- 最小権限の原則に従い、役割ごとに必要最低限の権限を付与
- 権限は Subject（リソース）・Action（操作）・Condition（条件）の 3 要素で定義
- 複数ロールの付与が可能で、権限は加算式（additive）で評価

**組織レベルとプロジェクトレベルの違い**

| レベル | 組み込みロール | 対象リソース |
|--------|--------------|-------------|
| Organization | Admin / Member | SSO設定・Machine Identity・SCIM設定 |
| Project | Admin / Developer / Viewer | シークレット・証明書・APIキー・承認ワークフロー |

**カスタムロール作成（API）**

```bash
curl -X POST "https://app.infisical.com/api/v1/projects/<projectId>/roles" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "slug": "prod-read-only",
    "name": "Production Read Only",
    "permissions": [
      {
        "subject": "secrets",
        "action": ["describeSecret", "readValue"],
        "conditions": {
          "environment": { "$eq": "production" }
        }
      }
    ]
  }'
```

カスタムロールは Pro Tier（Cloud）または Enterprise ライセンス（セルフホスト）が必要です。

**Condition によるスコープ制限**

| Operator | 用途 |
|----------|------|
| `$eq` | 特定の環境・パスに限定 |
| `$glob` | パスのワイルドカードマッチ |
| `$in` | 複数の許可値を列挙 |
| `$ne` | 特定の値を除外 |

設定例：`production` 環境の `/app/db/*` パスへの読み取りのみを許可します。

```json
{
  "subject": "secrets",
  "action": "readValue",
  "conditions": {
    "environment": { "$eq": "production" },
    "secretPath": { "$glob": "/app/db/*" }
  }
}
```

- 一時的なアクセス要求には Access Approvals を使用
- 本番環境の変更には Secret Change Approvals を設定

### 環境分離の戦略

各プロジェクトに `development` / `staging` / `production` などの環境を作成し、シークレットを分離します。

| 環境 | アクセス権限 |
|------|-------------|
| development | 開発者：読み書き可 |
| staging | 開発者：読み取りのみ |
| production | SRE・CI/CD のみ：読み取りのみ |

- 異なるチームが管理するシステムは別プロジェクトに分割
- プロジェクト間のシークレット共有には Secret Imports を使用
- 監査ログは別 DB に分離してパフォーマンスと監査要件を両立

```bash
AUDIT_LOGS_DB_CONNECTION_URI=postgres://audit-db-host:5432/infisical_audit
```

### セキュリティ強化策

**暗号化キーの生成**

```bash
openssl rand -hex 16       # 暗号化キー
openssl rand -base64 32    # 認証シークレット
```

**コンテナのハードニング（Docker）**

```bash
docker run \
  --read-only \
  --tmpfs /tmp:rw,exec,size=1G \
  --cap-drop=ALL \
  --memory=1g \
  --cpus=0.5 \
  infisical/infisical:<specific-version>
```

**Kubernetes のセキュリティコンテキスト**

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
```

**ネットワーク制限**

```bash
ALLOW_INTERNAL_IP_CONNECTIONS=false
CORS_ALLOWED_ORIGINS=https://app.example.com
```

**HSM / 外部 KMS の活用**

| ソリューション | 設定変数 |
|----------------|---------|
| AWS KMS | envelope encryption で workspace キーを保護 |
| Thales Luna HSM | `HSM_LIB_PATH`, `HSM_PIN`, `HSM_SLOT`, `HSM_KEY_LABEL` |
| Azure Key Vault | FedRAMP / SOC2 / ISO27001 コンプライアンス対応 |

**TLS の徹底**

```bash
DB_CONNECTION_URI=postgres://user:pass@host:5432/db?sslmode=require
REDIS_URL=rediss://user:password@redis:6380
```

## トラブルシューティング

### よくあるエラーと解決策

| エラー / 症状 | 原因 | 解決策 |
|--------------|------|--------|
| `Unable to fetch secrets due to connection error` | ネットワーク障害 / トークン期限切れ | API URL・トークンの有効性を確認。`--log-level debug` でログを取得 |
| `Failed to sync secrets` - Kubernetes Operator | シークレットパス・ワークスペース・環境名の誤り | InfisicalSecret CRD のパラメータを再確認 |
| DB マイグレーション失敗 | DB ユーザーの権限不足 | DB ユーザーに DDL 権限を付与し、バックアップからリストア |
| CLI ログイン失敗 | API ホストの設定誤り | `INFISICAL_API_URL` を正しいエンドポイントに設定 |
| `.dockerconfigjson` エラー - Kubernetes | Secret タイプの設定誤り | CRD の `secretType` フィールドを確認 |

### 接続問題の診断

**CLI の API URL 設定**

```bash
# セルフホスト環境
export INFISICAL_API_URL="https://your-infisical.example.com"

# EU Cloud
export INFISICAL_API_URL="https://eu.infisical.com"
```

**Relay（ゲートウェイ）の疎通確認**

```bash
curl -I https://app.infisical.com
openssl s_client -connect <relay-ip>:8443
```

**Kubernetes CSI プロバイダーのログ確認**

```bash
kubectl logs infisical-csi-provider-7x44t
kubectl logs csi-secrets-store-csi-driver-7h4jp -n kube-system
```

### パフォーマンス問題の対処

- アプリケーション層のレプリカ数を増加：`kubectl scale deployment -n infisical infisical --replicas=4`
- Read Replica を追加：`DB_READ_REPLICAS=postgres://replica-host:5432/infisical`
- 監査ログ DB を分離：`AUDIT_LOGS_DB_CONNECTION_URI=postgres://audit-db-host:5432/infisical_audit`
- ワーカーを分離：`QUEUE_WORKER_PROFILE=Secrets`
- メモリスワップを無効化：`swapoff -a`

### デバッグ方法

```bash
# CLI のデバッグログ
infisical secrets --log-level debug

# Linux パッケージのリアルタイムログ
infisical-ctl tail

# ヘルスエンドポイントの確認
curl -v http://localhost:8080/api/status

# Kubernetes イベントの確認
kubectl describe pod -n infisical <pod-name>
kubectl get events -n infisical --sort-by='.lastTimestamp'
```

Infisical は起動時に 150 以上の環境変数を Zod スキーマで検証します。エラー発生時は、ログに不正な変数名と期待値が表示されます。

## まとめ

Infisical は、シークレット管理・PKI・特権アクセスを一元化するオープンソースプラットフォームです。AES-256-GCM ベースの多層暗号化アーキテクチャと CASL による細粒度アクセス制御を中核に、50 以上の外部サービス連携・Dynamic Secrets・自動ローテーションでシークレットのライフサイクル全体をカバーします。Docker Compose / Kubernetes Helm / Infisical Cloud の 3 パターンでデプロイでき、Kubernetes Operator・Agent・多言語 SDK でアプリケーションへのシークレット配布を自動化できます。

HashiCorp Vault のようなエンタープライズ向けツールと比較して、セットアップの容易さと開発者体験の良さが特徴です。セルフホストでも PostgreSQL + Redis のシンプルな構成で運用でき、SOC 2・HIPAA・FIPS 140-3 のコンプライアンス要件にも対応します。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！

## 参考リンク

- 公式ドキュメント
  - [Infisical - Secrets Management on Autopilot](https://infisical.com/)
  - [Infisical Introduction](https://infisical.com/docs/documentation/getting-started/introduction)
  - [Secrets Management Overview](https://infisical.com/docs/documentation/platform/secrets-mgmt/overview)
  - [Organization Structure](https://infisical.com/docs/documentation/platform/organization)
  - [Machine Identities](https://infisical.com/docs/documentation/platform/identities/machine-identities)
  - [Self-hosting with Docker Compose](https://infisical.com/docs/self-hosting/deployment-options/docker-compose)
  - [Deploy with Kubernetes](https://infisical.com/docs/self-hosting/deployment-options/kubernetes-helm)
  - [Configuration - Environment Variables](https://infisical.com/docs/self-hosting/configuration/envars)
  - [CLI Documentation](https://infisical.com/docs/cli/overview)
  - [CLI SSH Commands](https://infisical.com/docs/cli/commands/ssh)
  - [Node.js SDK](https://infisical.com/docs/sdks/languages/node)
  - [Python SDK](https://infisical.com/docs/sdks/languages/python)
  - [Kubernetes Operator](https://infisical.com/docs/integrations/platforms/kubernetes/infisical-operator)
  - [Infisical Agent](https://infisical.com/docs/integrations/platforms/infisical-agent)
  - [GitHub Actions Integration](https://infisical.com/docs/integrations/cicd/githubactions)
  - [PKI - Internal CA](https://infisical.com/docs/documentation/platform/pki)
  - [Secret Rotation](https://infisical.com/docs/documentation/platform/secret-rotation/overview)
  - [Dynamic Secrets](https://infisical.com/docs/documentation/platform/dynamic-secrets/overview)
  - [High Availability](https://infisical.com/docs/self-hosting/guides/high-availability)
  - [Upgrading Infisical](https://infisical.com/docs/self-hosting/guides/upgrading)
  - [Audit Logs](https://infisical.com/docs/documentation/platform/audit-logs)
  - [Audit Log Streams](https://infisical.com/docs/documentation/platform/audit-log-streams)
  - [Access Controls](https://infisical.com/docs/documentation/platform/access-controls/overview)
  - [Project Permissions](https://infisical.com/docs/internals/permissions/project-permissions)
  - [HSM Integration](https://infisical.com/docs/documentation/platform/kms/hsm-integration)
  - [Security Internals](https://infisical.com/docs/internals/security)
  - [FAQ](https://infisical.com/docs/documentation/faq)
- GitHub
  - [Infisical/infisical](https://github.com/Infisical/infisical)
  - [Infisical Architecture - deepwiki](https://deepwiki.com/Infisical/infisical)
- 記事
  - [Secrets Management Best Practices](https://infisical.com/blog/secrets-management-best-practices)
  - [Open Source Secrets Management for DevOps](https://infisical.com/blog/open-source-secrets-management-devops)
  - [Infisical | Y Combinator](https://www.ycombinator.com/companies/infisical)
