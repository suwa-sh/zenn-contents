---
title: "Keycloak + OpenFGA + Kong による OIDC 認証・認可アーキテクチャ"
emoji: "🔐"
type: "tech"
topics: ["Keycloak", "OpenFGA", "Kong", "OpenIDConnect", "React"]
published: true
published_at: 2026-04-06
---

## 概要

Keycloak + OpenFGA + Kongで、認証と認可の責務を外部サービスに分離した構成について解説します。各コンポーネントが単一の責務を持ち、OIDC・OAuth 2.0 に基づいて連携します。アプリケーションコードに認証・認可ロジックを埋め込まないため、変更・監査・スケールを容易にします。

**認可チェックの責務分担**: Kong が JWKS 署名検証でトークンの真正性を確認（粗粒度チェック）し、バックエンドが OpenFGA の Check API でリソース単位のアクセス可否を判定（細粒度チェック）します。

:::message
Kong の OpenID Connect プラグインは **Kong Gateway Enterprise（有償）** で提供されます。Kong OSS を使用する場合は `jwt` プラグインで JWT 検証を行い、認可チェックはバックエンドに集約する構成や、個人開発のOIDC pluginの利用、この構成を再現するpluginを自作するなどの方法が考えられます。
:::

```mermaid
graph TD
    User["ユーザー"]
    SPA["React SPA"]
    Kong["Kong Gateway"]
    Keycloak["Keycloak"]
    OpenFGA["OpenFGA"]
    Backend["Backend API"]

    User -->|操作| SPA
    SPA -->|"OIDC Authorization Code Flow PKCE"| Keycloak
    Keycloak -->|"ID Token Access Token"| SPA
    SPA -->|"API リクエスト Bearer Token"| Kong
    Kong -->|"JWKS 署名検証"| Keycloak
    Kong -->|検証済みリクエスト| Backend
    Backend -->|認可チェック| OpenFGA
    Keycloak -->|ロール変更イベント| OpenFGA
```

| 要素         | 説明                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| ユーザー     | ブラウザからアプリケーションを操作するエンドユーザー                                                     |
| React SPA    | PKCE 付き認可コードフローで Keycloak と連携し、Access Token を取得して API を呼び出すフロントエンド      |
| Kong Gateway | OIDC プラグインで JWT 署名検証を行うポリシー実行点（Token 検証のみ担当）                                 |
| Keycloak     | OIDC 準拠の Identity Provider。ユーザー認証・SSO・Token 発行を担う                                       |
| OpenFGA      | Zanzibar ベース ReBAC による細粒度認可の判定点。ユーザーとリソースの関係に基づいてアクセス可否を決定する |
| Backend API  | Kong を通過した検証済みリクエストのみを受け取るサービス群                                                |

### 認証と認可の責務分離

| 責務             | 担当コンポーネント | 問い                                     |
| ---------------- | ------------------ | ---------------------------------------- |
| 認証             | Keycloak           | このユーザーは誰か                       |
| Token 検証       | Kong               | この Token は有効か                      |
| 認可             | OpenFGA            | このユーザーはこのリソースに何ができるか |
| アプリ操作       | React SPA          | ユーザーがどの操作を実行したか           |
| ビジネスロジック | Backend            | リクエストに対して何を返すか             |

## 特徴

- **オープン標準準拠**: OIDC、OAuth 2.0、PKCE に完全準拠し、ベンダーロックインを回避できます
- **認証・認可の完全分離**: 認証は Keycloak、認可は OpenFGA が専任で担うため、それぞれを独立して変更できます
- **細粒度アクセス制御**: OpenFGA の ReBAC モデルにより、ロールだけでなくリソース間の関係でアクセスを制御できます
- **ポリシー実行の一元化**: Kong がゲートウェイレベルで Token 検証と認可チェックを実行するため、バックエンドに認証ロジックが不要になります
- **SPA セキュリティ**: React SPA は PKCE 付き認可コードフローを使用し、クライアントシークレットなしで安全に Token を取得できます
- **OSS・自己ホスト**: すべてのコンポーネントがオープンソースであり、データをオンプレミスまたは自社クラウドに保持できます
- **イベント駆動の権限同期**: keycloak-openfga-event-publisher を導入することで、Keycloak のロール変更イベントを OpenFGA に自動同期し、権限の一貫性を維持できます

### 他の構成との比較

| 比較項目         | Keycloak + OpenFGA + Kong      | Auth0 + API Gateway      | Okta + Envoy             | 自前 JWT 検証        | Firebase Auth + Cloud Endpoints |
| ---------------- | ------------------------------ | ------------------------ | ------------------------ | -------------------- | ------------------------------- |
| 認証方式         | OIDC / OAuth 2.0（自己ホスト） | OIDC / OAuth 2.0（SaaS） | OIDC / OAuth 2.0（SaaS） | JWT（独自実装）      | Firebase 独自 + OIDC            |
| 認可モデル       | ReBAC（Zanzibar）+ RBAC/ABAC   | RBAC                     | RBAC + ABAC（OPA 連携）  | アプリ内ロジック     | Firebase Rules                  |
| カスタマイズ性   | 高（OSS・完全制御）            | 中（SaaS 制約あり）      | 中（SaaS 制約あり）      | 高（全自前実装）     | 低（Firebase 依存）             |
| コスト           | 低（OSS・インフラ費のみ）      | 高（ユーザー数課金）     | 高（ユーザー数課金）     | 低（実装コストは高） | 中（使用量課金）                |
| スケーラビリティ | 高（水平スケール可）           | 高（SaaS 管理）          | 高（SaaS 管理）          | 低（自前管理）       | 中（Firebase 制約）             |

### この構成を選ぶべきケース

この構成は以下の要件が重なる場合に特に効果を発揮します。

- **データ主権の要件がある**: SaaS に認証データを預けられない規制業種（金融・医療・公共）で、全コンポーネントを自社インフラに配置できます
- **細粒度認可が必要**: 「組織 A のメンバーがプロジェクト B のドキュメント C を編集できる」のようなリソース単位の認可を、アプリケーションコードから分離して管理したい場合に OpenFGA の ReBAC モデルが有効です
- **マルチサービス構成でゲートウェイ統制が必要**: 複数のバックエンドサービスに対して Kong で一元的にトークン検証・レート制限・CORS を適用し、個々のサービスから認証ロジックを排除できます

一方、以下の場合はオーバースペックになる可能性があります。

- 認可が「管理者/一般ユーザー」程度の粗粒度で済む → Keycloak のロールのみで十分
- チームに IdP・API Gateway の運用経験がない → Auth0 + Vercel のようなマネージド構成のほうが立ち上がりが早い
- バックエンドが1〜2サービスのみ → Kong を挟む利点が薄い

## 構造

### システムコンテキスト図

```mermaid
graph TD
    EndUser[エンドユーザー]
    Admin[管理者]
    System[認証・認可システム]
    ExtIdP[外部 IdP]
    ExtDir[外部ディレクトリ]

    EndUser --> System
    Admin --> System
    System --> ExtIdP
    System --> ExtDir
```

| 要素名             | 説明                                              |
| ------------------ | ------------------------------------------------- |
| エンドユーザー     | Web ブラウザ経由でシステムを利用するアクター      |
| 管理者             | 認可ポリシーとユーザーを管理するアクター          |
| 認証・認可システム | 調査対象の全体システム                            |
| 外部 IdP           | SAML や OIDC で連携する外部 ID プロバイダー       |
| 外部ディレクトリ   | LDAP や Active Directory などの外部ユーザーストア |

### コンテナ図

```mermaid
graph TD
    ReactSPA[React SPA]
    Kong[Kong Gateway]
    Keycloak[Keycloak]
    OpenFGA[OpenFGA]
    Backend[Backend API]

    ReactSPA --> Kong
    ReactSPA --> Keycloak
    Kong --> Keycloak
    Kong --> Backend
    Backend --> OpenFGA
    Keycloak --> OpenFGA
```

| 要素名       | 説明                                                                 |
| ------------ | -------------------------------------------------------------------- |
| React SPA    | ブラウザで動作するシングルページアプリケーション                     |
| Kong Gateway | API ゲートウェイ。リクエストのルーティングとトークン検証を担う       |
| Keycloak     | OIDC 準拠の ID プロバイダー。認証と JWT 発行を担う                   |
| OpenFGA      | Zanzibar ベースの ReBAC エンジン。リソースへのアクセス可否を判定する |
| Backend API  | ビジネスロジックを提供する API サーバー                              |

### コンポーネント図

#### React SPA

```mermaid
graph TD
    AuthProvider[Auth Provider]
    ProtectedRoutes[Protected Routes]
    APIClient[API Client]

    AuthProvider --> ProtectedRoutes
    ProtectedRoutes --> APIClient
```

| 要素名           | 説明                                                              |
| ---------------- | ----------------------------------------------------------------- |
| Auth Provider    | Keycloak との OIDC セッションを管理し、アクセストークンを保持する |
| Protected Routes | 認証済みユーザーのみアクセスを許可するルートガード                |
| API Client       | Kong Gateway にアクセストークン付きリクエストを送信する           |

#### Kong Gateway

```mermaid
graph TD
    OIDCPlugin[OIDC Plugin]
    RateLimiting[Rate Limiting]
    CORS[CORS]
    Routing[Routing]

    OIDCPlugin --> Routing
    RateLimiting --> Routing
    CORS --> Routing
```

| 要素名        | 説明                                                              |
| ------------- | ----------------------------------------------------------------- |
| OIDC Plugin   | Keycloak の JWKS エンドポイントを使ってアクセストークンを検証する |
| Rate Limiting | リクエスト数を制限し、過負荷を防止する                            |
| CORS          | クロスオリジンリクエストのヘッダー制御を行う                      |
| Routing       | 検証済みリクエストを Backend API へ転送する                       |

#### Keycloak

```mermaid
graph TD
    Realm[Realm]
    Client[Client]
    UserFederation[User Federation]
    EventPublisher[OpenFGA Event Publisher]

    Realm --> Client
    Realm --> UserFederation
    Realm --> EventPublisher
```

| 要素名                  | 説明                                                               |
| ----------------------- | ------------------------------------------------------------------ |
| Realm                   | ユーザー、ロール、クライアントをまとめる独立した管理スペース       |
| Client                  | React SPA や Kong Gateway が Keycloak に登録された認証クライアント |
| User Federation         | LDAP や Active Directory と連携してユーザー情報を取得する          |
| OpenFGA Event Publisher | 認証イベントを検知して OpenFGA にタプルを書き込むイベントリスナー  |

#### OpenFGA

```mermaid
graph TD
    Store[Store]
    AuthModel[Authorization Model]
    TupleSpace[Tuple Space]

    Store --> AuthModel
    Store --> TupleSpace
    AuthModel --> TupleSpace
```

| 要素名              | 説明                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| Store               | 認可モデルと関係タプルをまとめるトップレベルのコンテナ               |
| Authorization Model | オブジェクト型と関係のスキーマを定義する不変オブジェクト             |
| Tuple Space         | ユーザー・関係・オブジェクトの三要素からなる具体的な関係データの集合 |

#### Backend API

```mermaid
graph TD
    AuthMiddleware[Auth Middleware]
    OpenFGAClient[OpenFGA Client]
    BusinessLogic[Business Logic]

    AuthMiddleware --> OpenFGAClient
    OpenFGAClient --> BusinessLogic
```

| 要素名          | 説明                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Auth Middleware | Kong が転送した X-Userinfo ヘッダーからユーザー情報を抽出する（トークン検証自体は Kong が実施済み） |
| OpenFGA Client  | OpenFGA の Check API を呼び出してリソースへのアクセス可否を確認する                                 |
| Business Logic  | 認可済みリクエストに対してビジネス処理を実行する                                                    |

#### ネットワーク構成図

```mermaid
graph LR
    Browser[ブラウザ]
    ReactSPA[React SPA]
    Kong[Kong Gateway]
    Backend[Backend API]
    Keycloak[Keycloak]
    OpenFGA[OpenFGA]

    Browser --> ReactSPA
    ReactSPA --> Keycloak
    ReactSPA --> Kong
    Kong --> Keycloak
    Kong --> Backend
    Backend --> OpenFGA
    Keycloak --> OpenFGA
```

| 通信経路                   | 説明                                                                              |
| -------------------------- | --------------------------------------------------------------------------------- |
| ブラウザ → React SPA       | ユーザーが SPA を初期ロードする                                                   |
| React SPA → Keycloak       | OIDC Authorization Code Flow でログインし、アクセストークンを取得する             |
| React SPA → Kong Gateway   | アクセストークンを Authorization ヘッダーに付与して API を呼び出す                |
| Kong Gateway → Keycloak    | JWKS エンドポイントから公開鍵を取得・キャッシュし、JWT の署名をローカルで検証する |
| Kong Gateway → Backend API | 検証済みリクエストをバックエンドへ転送する                                        |
| Backend API → OpenFGA      | Check API でリソースへのアクセス可否を問い合わせる                                |
| Keycloak → OpenFGA         | 認証イベントをトリガーとして関係タプルを書き込む                                  |

## データ

### 概念モデル

```mermaid
graph TD

  subgraph Keycloak
    subgraph Realm
      Client
      Group
      Role
      subgraph User
        Session
      end
    end
    Token_ID["ID Token"]
    Token_Access["Access Token"]
    Token_Refresh["Refresh Token"]
  end

  subgraph OIDC_Flow["OIDC フロー"]
    Authorization_Code["Authorization Code"]
    PKCE_Challenge["PKCE Challenge"]
  end

  subgraph OpenFGA
    subgraph Store
      subgraph Authorization_Model["Authorization Model"]
        Type_Definition["Type Definition"]
        Relation
      end
      Tuple
    end
  end

  subgraph Kong
    subgraph Upstream
      Service
    end
    Route
    Plugin
    Consumer
  end

  Client -->|発行| Authorization_Code
  PKCE_Challenge -->|保護| Authorization_Code
  Authorization_Code -->|交換| Token_Access
  Authorization_Code -->|交換| Token_ID
  Authorization_Code -->|交換| Token_Refresh
  Token_Refresh -->|更新| Token_Access

  Plugin -->|"OIDC 検証"| Token_Access
  Consumer -->|対応| User

  User -->|"Role 割り当てイベント"| Tuple
  Group -->|"Group 割り当てイベント"| Tuple
  Role -->|"Role 割り当てイベント"| Tuple

  Type_Definition -->|定義| Relation
  Authorization_Model -->|評価| Tuple
```

#### Keycloak

| 要素名        | 説明                                                               |
| ------------- | ------------------------------------------------------------------ |
| Realm         | ユーザー・クライアント・ロール・グループを管理する独立した名前空間 |
| Client        | 認証を依頼するアプリケーションまたはサービス                       |
| User          | 認証対象のエンドユーザー                                           |
| Session       | ユーザーログイン時に生成される認証セッション                       |
| Role          | ユーザーの種別や権限カテゴリを表すラベル                           |
| Group         | ロールや属性をまとめて管理するユーザー集合                         |
| ID Token      | ユーザー識別情報を含む JWT                                         |
| Access Token  | API アクセス権限を表す JWT                                         |
| Refresh Token | Access Token を更新するための認証情報                              |

#### OIDC フロー

| 要素名             | 説明                                            |
| ------------------ | ----------------------------------------------- |
| Authorization Code | トークン交換に使う一時的な認可コード            |
| PKCE Challenge     | Authorization Code の傍受攻撃を防ぐコード検証値 |

#### OpenFGA

| 要素名              | 説明                                                       |
| ------------------- | ---------------------------------------------------------- |
| Store               | 認可モデルと Tuple を格納するトップレベルコンテナ          |
| Authorization Model | 型定義と関係からなる権限スキーマ                           |
| Type Definition     | オブジェクト型に対して定義可能な関係の集合                 |
| Relation            | オブジェクトとユーザー間の関係を表す名前付き定義           |
| Tuple               | ユーザー・関係・オブジェクトの三つ組で表す実際の関係データ |

#### Kong

| 要素名   | 説明                                                      |
| -------- | --------------------------------------------------------- |
| Upstream | 複数の Service インスタンスをまとめるロードバランサー定義 |
| Service  | バックエンドの上流サービスを表すエンティティ              |
| Route    | リクエストを Service にマッピングするルーティングルール   |
| Plugin   | Service・Route・Consumer に適用する機能拡張モジュール     |
| Consumer | Kong が管理する API を利用する外部クライアント識別子      |

### 情報モデル

```mermaid
classDiagram

  class Realm {
    id : string
    name : string
    displayName : string
    enabled : boolean
    ssoSessionMaxLifespan : integer
  }

  class Client {
    id : string
    clientId : string
    protocol : string
    publicClient : boolean
    redirectUris : list
    enabled : boolean
  }

  class User {
    id : string
    username : string
    email : string
    firstName : string
    lastName : string
    enabled : boolean
    emailVerified : boolean
  }

  class Role {
    id : string
    name : string
    description : string
    composite : boolean
    clientRole : boolean
  }

  class Group {
    id : string
    name : string
    path : string
    attributes : map
  }

  class Session {
    id : string
    userId : string
    clientId : string
    start : integer
    lastAccess : integer
    ipAddress : string
  }

  class IDToken {
    iss : string
    sub : string
    aud : string
    exp : integer
    iat : integer
    auth_time : integer
    nonce : string
    name : string
    email : string
  }

  class AccessToken {
    iss : string
    sub : string
    aud : string
    exp : integer
    iat : integer
    scope : string
    roles : list
    azp : string
  }

  class RefreshToken {
    iss : string
    sub : string
    exp : integer
    iat : integer
    jti : string
    typ : string
  }

  class AuthorizationCode {
    code : string
    clientId : string
    redirectUri : string
    expiresAt : integer
    scope : string
  }

  class PKCEChallenge {
    codeChallenge : string
    codeChallengeMethod : string
  }

  class Store {
    id : string
    name : string
    createdAt : integer
  }

  class AuthorizationModel {
    id : string
    schemaVersion : string
    createdAt : integer
  }

  class TypeDefinition {
    type : string
  }

  class Relation {
    name : string
    rewrite : string
  }

  class Tuple {
    user : string
    relation : string
    object : string
    condition : string
    timestamp : integer
  }

  class Service {
    id : string
    name : string
    host : string
    port : integer
    protocol : string
    path : string
    enabled : boolean
  }

  class Route {
    id : string
    name : string
    protocols : list
    paths : list
    methods : list
    hosts : list
    stripPath : boolean
    preserveHost : boolean
  }

  class Plugin {
    id : string
    name : string
    enabled : boolean
    config : map
    priority : integer
  }

  class Consumer {
    id : string
    username : string
    customId : string
    tags : list
  }

  class Upstream {
    id : string
    name : string
    algorithm : string
    hashOn : string
  }

  Realm "1" --> "many" Client
  Realm "1" --> "many" User
  Realm "1" --> "many" Role
  Realm "1" --> "many" Group
  User "1" --> "many" Session
  User "many" --> "many" Role
  User "many" --> "many" Group
  Group "many" --> "many" Role
  Session "1" --> "1" IDToken
  Session "1" --> "1" AccessToken
  Session "1" --> "0..1" RefreshToken
  AuthorizationCode "1" --> "1" PKCEChallenge
  AuthorizationCode "1" --> "1" IDToken
  AuthorizationCode "1" --> "1" AccessToken

  Store "1" --> "many" AuthorizationModel
  Store "1" --> "many" Tuple
  AuthorizationModel "1" --> "many" TypeDefinition
  TypeDefinition "1" --> "many" Relation

  Upstream "1" --> "many" Service
  Service "1" --> "many" Route
  Route "1" --> "many" Plugin
  Service "1" --> "many" Plugin
  Consumer "1" --> "many" Plugin
```

#### Keycloak エンティティ

| 要素名       | 説明                                                                             |
| ------------ | -------------------------------------------------------------------------------- |
| Realm        | レルム全体の設定とセッション有効期間を管理する                                   |
| Client       | SPA 向けに publicClient を true に設定し、クライアントシークレットなしで動作する |
| User         | メールアドレス・氏名・有効状態を持つ認証対象エンティティ                         |
| Role         | 単純ロールと複合ロールを区別する composite フラグを持つ                          |
| Group        | パス形式の階層構造と任意属性マップを持つ                                         |
| Session      | ユーザーのログイン開始時刻・最終アクセス時刻・IP アドレスを記録する              |
| IDToken      | ユーザー識別情報と認証時刻を含む JWT                                             |
| AccessToken  | スコープとロール情報を含み、API 認可に使用する JWT                               |
| RefreshToken | 有効期限切れの Access Token を更新するための認証情報                             |

#### OIDC フローエンティティ

| 要素名            | 説明                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| AuthorizationCode | 短命の認可コードで、トークンエンドポイントで Token に交換する                                                                     |
| PKCEChallenge     | code_challenge とチャレンジ方式を保持する。code_verifier はクライアント側のメモリにのみ存在する一時値で、サーバーには送信されない |

#### OpenFGA エンティティ

| 要素名             | 説明                                                             |
| ------------------ | ---------------------------------------------------------------- |
| Store              | 認可データの最上位コンテナで、ストア間でデータを共有しない       |
| AuthorizationModel | スキーマバージョンと型定義で構成される権限スキーマ               |
| TypeDefinition     | オブジェクト型名と、その型に定義された関係の集合                 |
| Relation           | 関係名と計算方法（直接・委譲・セット演算）を持つ定義             |
| Tuple              | ユーザー・関係・オブジェクトの三つ組と任意の条件式を持つ実データ |

#### Kong エンティティ

| 要素名   | 説明                                                                      |
| -------- | ------------------------------------------------------------------------- |
| Service  | バックエンドのホスト・ポート・プロトコルを定義する上流サービス表現        |
| Route    | プロトコル・パス・メソッド・ホストでリクエストを Service にマッチングする |
| Plugin   | 有効化状態・設定マップ・優先度を持つ機能拡張モジュール                    |
| Consumer | username と customId で外部クライアントを識別するエンティティ             |
| Upstream | ロードバランシングアルゴリズムと複数 Service インスタンスを管理する       |

## 構築方法

### Docker Compose による環境構築

#### docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - auth-net

  keycloak:
    image: quay.io/keycloak/keycloak:26.1.0
    command: start-dev  # 開発用。本番では start を使用し、hostname-strict 等を設定する
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: admin
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/postgres
      KC_DB_USERNAME: postgres
      KC_DB_PASSWORD: password
      KC_HTTP_PORT: 8080
      KC_SPI_EVENTS_LISTENER_OPENFGA_EVENTS_PUBLISHER_API_URL: http://openfga:8080
      KC_SPI_EVENTS_LISTENER_OPENFGA_EVENTS_PUBLISHER_STORE_ID: ${FGA_STORE_ID}
      KC_SPI_EVENTS_LISTENER_OPENFGA_EVENTS_PUBLISHER_AUTHORIZATION_MODEL_ID: ${FGA_MODEL_ID}
    volumes:
      - ./keycloak/providers:/opt/keycloak/providers
    ports:
      - "8080:8080"
    depends_on:
      - postgres
    networks:
      - auth-net

  openfga:
    image: openfga/openfga:v1.8
    command: run
    environment:
      OPENFGA_DATASTORE_ENGINE: postgres
      OPENFGA_DATASTORE_URI: postgres://postgres:password@postgres:5432/postgres?sslmode=disable
      OPENFGA_LOG_FORMAT: json
    ports:
      - "8081:8080"
      - "8082:8081"
      - "3000:3000"
    depends_on:
      - postgres
    networks:
      - auth-net

  kong:
    image: kong/kong-gateway:3.9
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /kong/declarative/kong.yml
      KONG_PROXY_LISTEN: "0.0.0.0:9000"
      KONG_ADMIN_LISTEN: "0.0.0.0:9001"
      KONG_LOG_LEVEL: info
    volumes:
      - ./kong:/kong/declarative
    ports:
      - "9000:9000"
      - "9001:9001"
    networks:
      - auth-net

  backend:
    image: your-backend:latest
    environment:
      FGA_API_URL: http://openfga:8080
      FGA_STORE_ID: ${FGA_STORE_ID}
      FGA_MODEL_ID: ${FGA_MODEL_ID}
    ports:
      - "8090:8090"
    networks:
      - auth-net

networks:
  auth-net:

volumes:
  postgres_data:
```

#### 環境変数一覧

| サービス | 変数名                                                     | 説明                        |
| -------- | ---------------------------------------------------------- | --------------------------- |
| Keycloak | `KC_BOOTSTRAP_ADMIN_USERNAME`                              | 初回管理者ユーザー名        |
| Keycloak | `KC_BOOTSTRAP_ADMIN_PASSWORD`                              | 初回管理者パスワード        |
| Keycloak | `KC_DB`                                                    | データベース種別            |
| Keycloak | `KC_DB_URL`                                                | PostgreSQL 接続 URL         |
| Keycloak | `KC_SPI_EVENTS_LISTENER_OPENFGA_EVENTS_PUBLISHER_API_URL`  | OpenFGA サーバー URL        |
| Keycloak | `KC_SPI_EVENTS_LISTENER_OPENFGA_EVENTS_PUBLISHER_STORE_ID` | OpenFGA Store ID            |
| OpenFGA  | `OPENFGA_DATASTORE_ENGINE`                                 | データストア種別            |
| OpenFGA  | `OPENFGA_DATASTORE_URI`                                    | PostgreSQL 接続文字列       |
| Kong     | `KONG_DATABASE`                                            | DB モード（off で DB-less） |
| Kong     | `KONG_DECLARATIVE_CONFIG`                                  | 宣言的設定ファイルパス      |

#### 起動コマンド

```bash
# OpenFGA のデータベースマイグレーション
docker compose up -d postgres
docker compose run --rm openfga migrate

# 全サービス起動
docker compose up -d
```

### Keycloak セットアップ

#### Realm 作成

```bash
# Admin CLI でログイン
docker exec -it <keycloak-container> /opt/keycloak/bin/kcadm.sh \
  config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password admin

# Realm 作成
docker exec -it <keycloak-container> /opt/keycloak/bin/kcadm.sh \
  create realms \
  -s realm=myrealm \
  -s enabled=true
```

#### SPA 用 Client 設定

```bash
docker exec -it <keycloak-container> /opt/keycloak/bin/kcadm.sh \
  create clients \
  -r myrealm \
  -s clientId=my-spa \
  -s publicClient=true \
  -s "redirectUris=[\"http://localhost:3000/*\"]" \
  -s "webOrigins=[\"http://localhost:3000\"]" \
  -s protocol=openid-connect \
  -s attributes='{"pkce.code.challenge.method":"S256"}'
```

| パラメータ                   | 値                        | 説明                         |
| ---------------------------- | ------------------------- | ---------------------------- |
| `clientId`                   | `my-spa`                  | クライアント識別子           |
| `publicClient`               | `true`                    | クライアントシークレット不要 |
| `redirectUris`               | `http://localhost:3000/*` | 認可コード返却先 URI         |
| `webOrigins`                 | `http://localhost:3000`   | CORS 許可オリジン            |
| `pkce.code.challenge.method` | `S256`                    | PKCE チャレンジ方式          |

#### ロール・ユーザー作成

```bash
# ロール作成
docker exec -it <keycloak-container> /opt/keycloak/bin/kcadm.sh \
  create roles -r myrealm -s name=app-user

# ユーザー作成
docker exec -it <keycloak-container> /opt/keycloak/bin/kcadm.sh \
  create users -r myrealm -s username=alice -s enabled=true

# パスワード設定
docker exec -it <keycloak-container> /opt/keycloak/bin/kcadm.sh \
  set-password -r myrealm --username alice --new-password password

# ロール割り当て
docker exec -it <keycloak-container> /opt/keycloak/bin/kcadm.sh \
  add-roles -r myrealm --uusername alice --rolename app-user
```

#### OpenFGA Event Publisher Extension のインストール

```bash
# JAR をダウンロード
curl -L -o keycloak/providers/keycloak-openfga-event-publisher.jar \
  https://github.com/embesozzi/keycloak-openfga-event-publisher/releases/latest/download/keycloak-openfga-event-publisher.jar

# Keycloak を再起動して拡張機能を読み込む
docker compose restart keycloak
```

管理コンソールでの設定手順:

1. `Realm settings` > `Events` > `Event listeners` へ移動する
2. `openfga-events-publisher` を追加する
3. `Save` をクリックする

### Kong セットアップ

#### Service と Route の作成

```bash
# Service 作成
curl -X POST http://localhost:9001/services \
  -d name=backend-service \
  -d url=http://backend:8090

# Route 作成
curl -X POST http://localhost:9001/services/backend-service/routes \
  -d name=backend-route \
  -d "paths[]=/api"
```

#### OpenID Connect プラグインの設定

```bash
curl -X POST http://localhost:9001/services/backend-service/plugins \
  -H "Content-Type: application/json" \
  -d '{
    "name": "openid-connect",
    "config": {
      "issuer": "http://keycloak:8080/realms/myrealm",
      "client_id": "kong-client",
      "client_secret": "kong-client-secret",
      "auth_methods": ["bearer"],
      "bearer_token_param_type": ["header"],
      "token_endpoint_auth_method": "client_secret_post",
      "scopes": ["openid", "profile", "email"],
      "verify_signature": true,
      "verify_expiry": true,
      "upstream_access_token_header": "Authorization",
      "upstream_user_info_header": "X-Userinfo"
    }
  }'
```

| パラメータ                     | 値                             | 説明                                      |
| ------------------------------ | ------------------------------ | ----------------------------------------- |
| `issuer`                       | Keycloak Realm の URL          | OIDC Discovery エンドポイントのベース URL |
| `client_id`                    | `kong-client`                  | Kong の Keycloak クライアント ID          |
| `auth_methods`                 | `["bearer"]`                   | Bearer トークン検証のみ有効化             |
| `token_endpoint_auth_method`   | `client_secret_post`           | クライアント認証方式                      |
| `scopes`                       | `["openid","profile","email"]` | 要求するスコープ                          |
| `upstream_access_token_header` | `Authorization`                | バックエンドへのトークン転送ヘッダー      |

#### CORS プラグインの設定

```bash
curl -X POST http://localhost:9001/services/backend-service/plugins \
  -H "Content-Type: application/json" \
  -d '{
    "name": "cors",
    "config": {
      "origins": ["http://localhost:3000"],
      "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      "headers": ["Content-Type", "Authorization"],
      "exposed_headers": ["X-Auth-Token"],
      "credentials": true,
      "max_age": 3600
    }
  }'
```

### OpenFGA セットアップ

#### Store 作成

```bash
# FGA CLI のインストール
brew install openfga/tap/fga

# Store 作成
fga store create --name "my-app-store"

# 環境変数を設定する
export FGA_API_URL=http://localhost:8081
export FGA_STORE_ID=<取得した store.id>
```

#### Authorization Model の定義と書き込み

```bash
cat > model.fga << 'EOF'
model
  schema 1.1

type user

type role
  relations
    define member: [user]

type document
  relations
    define owner: [user]
    define editor: [user, role#member]
    define viewer: [user, role#member]
    define can_write: editor or owner
    define can_view: viewer or editor or owner
EOF

fga model write --store-id=$FGA_STORE_ID --file model.fga
```

#### 初期 Tuple の投入

```bash
# ユーザーをロールメンバーとして追加する
fga tuple write --store-id=$FGA_STORE_ID user:alice member role:app-user

# ロールにドキュメント閲覧権限を付与する
fga tuple write --store-id=$FGA_STORE_ID role:app-user#member viewer document:readme

# ファイルで一括投入する
fga tuple write --store-id=$FGA_STORE_ID --file tuples.json
```

`tuples.json` の形式:

```json
{
  "writes": [
    { "user": "user:alice", "relation": "owner", "object": "document:readme" },
    { "user": "user:bob", "relation": "viewer", "object": "document:readme" }
  ]
}
```

### React SPA セットアップ

#### oidc-spa ライブラリの導入

```bash
npm install oidc-spa
```

#### AuthProvider の設定

```tsx
// src/oidc.ts
import { createOidc } from "oidc-spa/react";

export const { OidcProvider, useOidc, getOidc } = createOidc({
  issuerUri: "http://localhost:8080/realms/myrealm",
  clientId: "my-spa",
  scopes: ["openid", "profile", "email"],
  // PKCE は自動的に S256 で設定される
});
```

```tsx
// src/main.tsx
import { OidcProvider } from "./oidc";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <OidcProvider fallback={<div>Loading...</div>}>
    <App />
  </OidcProvider>
);
```

#### Protected Route の実装

```tsx
// src/components/ProtectedRoute.tsx
import { useOidc } from "../oidc";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isUserLoggedIn, login } = useOidc();

  if (!isUserLoggedIn) {
    login({ doesCurrentHrefRequiresAuth: true });
    return null;
  }

  return <>{children}</>;
}
```

```tsx
// src/App.tsx
function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
```

#### API Client へのトークン自動付与

```tsx
// src/api/client.ts
import axios from "axios";
import { getOidc } from "../oidc";

const apiClient = axios.create({
  baseURL: "http://localhost:9000/api",
});

apiClient.interceptors.request.use(async (config) => {
  const oidc = await getOidc();
  if (oidc.isUserLoggedIn) {
    const { accessToken } = oidc.getTokens();
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

export default apiClient;
```

#### useAuth カスタムフック

oidc-spa の `useOidc` をラップし、ロールチェック機能を含むカスタムフックを実装します。

```tsx
// src/hooks/useAuth.ts
import { useOidc } from "../oidc";
import { decodeJwt } from "oidc-spa/decode-jwt";

type KeycloakAccessTokenPayload = {
  realm_access?: { roles: string[] };
  resource_access?: Record<string, { roles: string[] }>;
  sub: string;
};

type UseAuthReturn =
  | {
      isAuthenticated: false;
      user: null;
      hasRole: (_roleName: string) => false;
      login: () => void;
    }
  | {
      isAuthenticated: true;
      user: { username: string; email: string; sub: string };
      hasRole: (roleName: string) => boolean;
      logout: (params?: { redirectTo?: string }) => void;
    };

export function useAuth(): UseAuthReturn {
  const oidc = useOidc();

  if (!oidc.isUserLoggedIn) {
    return {
      isAuthenticated: false,
      user: null,
      hasRole: () => false,
      login: () => oidc.login({ doesCurrentHrefRequiresAuth: true }),
    };
  }

  const { decodedIdToken, oidcTokens, logout } = oidc;
  const decoded = decodeJwt<KeycloakAccessTokenPayload>(
    oidcTokens.accessToken
  );
  const realmRoles = decoded.realm_access?.roles ?? [];

  return {
    isAuthenticated: true,
    user: {
      username: decodedIdToken.preferred_username,
      email: decodedIdToken.email,
      sub: decodedIdToken.sub,
    },
    hasRole: (roleName: string) => realmRoles.includes(roleName),
    logout,
  };
}
```

`decodeJwt` は署名検証を行わないため、クライアント側の表示制御のみに使用します。認可の最終判断はバックエンドの OpenFGA で行います。

#### ロールベースのコンポーネントガード

```tsx
// src/components/RequireRole.tsx
import { type ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { Navigate } from "react-router-dom";

export function RequireRole({
  role,
  children,
  fallback = <Navigate to="/unauthorized" replace />,
}: {
  role: string;
  children: ReactNode;
  fallback?: ReactNode;
}): ReactNode {
  const auth = useAuth();

  if (!auth.isAuthenticated) {
    auth.login();
    return null;
  }

  if (!auth.hasRole(role)) {
    return fallback;
  }

  return children;
}
```

```tsx
// ルーティングでの利用例
<Routes>
  <Route path="/dashboard" element={
    <RequireRole role="user"><DashboardPage /></RequireRole>
  } />
  <Route path="/admin" element={
    <RequireRole role="admin" fallback={<Navigate to="/dashboard" replace />}>
      <AdminPage />
    </RequireRole>
  } />
</Routes>
```

#### サイレントリフレッシュとタブ間同期

oidc-spa はオンデマンド方式でトークンをリフレッシュします。

- `getTokens()` / `oidcTokens` アクセス時にトークン有効期限を確認する
- 有効期限が近い場合、Refresh Token で自動的に再取得する
- Refresh Token も期限切れの場合、ログインページにリダイレクトする
- ユーザーの実際の操作を監視し、真の非アクティブ状態でのみログアウトする

複数タブ間の競合防止:

- `Navigator.locks` API によるミューテックスでリフレッシュをシリアライズする
- `BroadcastChannel` API でリフレッシュ成功後の新トークンを全タブに通知する
- oidc-spa がこれらの処理を内部で自動的に実行するため、開発者が実装する必要はない

## 利用方法

### OIDC 認証フロー

#### Authorization Code Flow with PKCE

```mermaid
sequenceDiagram
  participant Browser as React SPA
  participant Kong as Kong Gateway
  participant Keycloak as Keycloak
  Browser->>Browser: code_verifier を生成
  Browser->>Browser: code_challenge を SHA-256 でハッシュ化
  Browser->>Keycloak: "GET /auth?response_type=code&client_id=my-spa&code_challenge=xxx&code_challenge_method=S256"
  Keycloak->>Browser: ログイン画面を表示
  Browser->>Keycloak: ユーザー認証情報を送信
  Keycloak->>Browser: "302 リダイレクト with authorization_code"
  Browser->>Keycloak: "POST /token - code + code_verifier"
  Keycloak->>Browser: "access_token, id_token, refresh_token"
  Browser->>Kong: "GET /api/resource with Bearer access_token"
  Kong->>Kong: "JWKS キャッシュで JWT 署名をローカル検証"
  Kong->>Backend: "リクエスト転送 with Authorization ヘッダー"
  Backend->>Backend: "OpenFGA Check API で認可チェック"
  Backend->>Browser: レスポンス
```

| 要素名             | 説明                                                                    |
| ------------------ | ----------------------------------------------------------------------- |
| React SPA          | PKCE の code_verifier と code_challenge を生成するクライアント          |
| Kong Gateway       | Bearer トークンを検証し、バックエンドにリクエストを転送するゲートウェイ |
| Keycloak           | 認可コードとトークンを発行する Identity Provider                        |
| authorization_code | Keycloak が発行する一時的な認可コード                                   |
| access_token       | API アクセスに使用する JWT トークン                                     |
| code_verifier      | PKCE のランダム文字列（クライアント内で保持）                           |
| code_challenge     | code_verifier の SHA-256 ハッシュ値                                     |

#### トークンリフレッシュ

oidc-spa はトークンの有効期限を監視し、期限切れ前に自動リフレッシュを実行します。Refresh Token も期限切れの場合はログイン画面にリダイレクトします。

```bash
# リフレッシュトークンによるトークン更新（手動確認用）
curl -X POST http://localhost:8080/realms/myrealm/protocol/openid-connect/token \
  -d grant_type=refresh_token \
  -d client_id=my-spa \
  -d refresh_token=<refresh_token>
```

#### ログアウト

| ログアウト種別             | 説明                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| フロントチャネルログアウト | SPA からリダイレクトで Keycloak のログアウトエンドポイントを呼び出す |
| バックチャネルログアウト   | Keycloak がバックエンドサーバーに直接ログアウト通知を送信する        |

```tsx
// フロントチャネルログアウト
const { logout } = useOidc();
await logout({ redirectTo: "http://localhost:3000" });
```

#### バックチャネルログアウトのシーケンス

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Browser as ブラウザ
    participant Keycloak as Keycloak
    participant Backend as バックエンドサーバー
    participant Session as セッションストア

    User->>Browser: ログアウト操作
    Browser->>Keycloak: "POST /realms/myrealm/protocol/openid-connect/logout"
    Keycloak->>Keycloak: セッションを無効化
    Keycloak->>Backend: "POST /backchannel-logout with logout_token"
    Backend->>Backend: logout_token の署名を検証
    Backend->>Backend: "sub または sid クレームを確認"
    Backend->>Session: 該当セッションを削除
    Session-->>Backend: 削除完了
    Backend-->>Keycloak: HTTP 200 OK
    Keycloak-->>Browser: ログアウト完了レスポンス
    Browser-->>User: ログインページへリダイレクト
```

バックエンドでの logout_token 検証実装例:

```typescript
import express from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

const KEYCLOAK_ISSUER = "https://keycloak.example.com/realms/myrealm";
const JWKS = createRemoteJWKSet(
  new URL(`${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`)
);

app.post("/backchannel-logout", async (req, res) => {
  const logoutToken: string = req.body.logout_token;

  const { payload } = await jwtVerify(logoutToken, JWKS, {
    issuer: KEYCLOAK_ISSUER,
  });

  const events = payload.events as Record<string, unknown>;
  if (events?.["http://schemas.openid.net/event/backchannel-logout"] == null) {
    return res.status(400).send("Invalid logout token");
  }

  const sid = payload.sid as string | undefined;
  const sub = payload.sub as string | undefined;
  if (sid != null) {
    await sessionStore.deleteBySessionId(sid);
  } else if (sub != null) {
    await sessionStore.deleteAllByUserId(sub);
  }

  return res.status(200).send("OK");
});
```

| 観点         | フロントチャネル                 | バックチャネル                                 |
| ------------ | -------------------------------- | ---------------------------------------------- |
| 通信経路     | ブラウザ経由                     | サーバー間の直接通信                           |
| ブラウザ依存 | あり                             | なし                                           |
| 信頼性       | 低い（広告ブロッカーの影響あり） | 高い（HTTP POST で確実に届く）                 |
| 実装の複雑さ | 低い                             | 高い（バックエンドにエンドポイント実装が必要） |

### OpenFGA 認可チェック

#### Backend から OpenFGA への Check API 呼び出し

```bash
curl -X POST http://localhost:8081/stores/$FGA_STORE_ID/check \
  -H "Content-Type: application/json" \
  -d '{
    "authorization_model_id": "'$FGA_MODEL_ID'",
    "tuple_key": {
      "user": "user:alice",
      "relation": "can_view",
      "object": "document:readme"
    }
  }'
# レスポンス: {"allowed": true}
```

Node.js バックエンドでの実装例:

```typescript
import { OpenFgaClient } from "@openfga/sdk";

const fgaClient = new OpenFgaClient({
  apiUrl: process.env.FGA_API_URL,
  storeId: process.env.FGA_STORE_ID,
  authorizationModelId: process.env.FGA_MODEL_ID,
});

async function checkPermission(
  userId: string,
  relation: string,
  objectId: string
): Promise<boolean> {
  const response = await fgaClient.check({
    tuple_key: {
      user: `user:${userId}`,
      relation,
      object: objectId,
    },
  });
  return response.allowed ?? false;
}
```

#### Tuple の追加・削除

```bash
# Tuple 追加
fga tuple write --store-id=$FGA_STORE_ID user:alice editor document:report

# Tuple 削除
fga tuple delete --store-id=$FGA_STORE_ID user:alice editor document:report
```

API を使用した追加・削除:

```bash
curl -X POST http://localhost:8081/stores/$FGA_STORE_ID/write \
  -H "Content-Type: application/json" \
  -d '{
    "authorization_model_id": "'$FGA_MODEL_ID'",
    "writes": {
      "tuple_keys": [
        { "user": "user:alice", "relation": "editor", "object": "document:report" }
      ]
    },
    "deletes": {
      "tuple_keys": [
        { "user": "user:bob", "relation": "viewer", "object": "document:report" }
      ]
    }
  }'
```

#### Authorization Model の更新

モデルは更新ではなく新規作成として扱われます。各モデルに一意の `authorization_model_id` が付与されます。古いモデル ID を参照するタプルは引き続き動作します。

```bash
# 新しいモデルを書き込む
fga model write --store-id=$FGA_STORE_ID --file model_v2.fga

# モデル一覧を確認する
fga model list --store-id=$FGA_STORE_ID
```

#### マルチテナント階層モデルの例

組織・フォルダー・ドキュメントの階層関係を含む実用的なモデル定義です。

```bash
cat > model_multitenant.fga << 'EOF'
model
  schema 1.1

type user

type organization
  relations
    define member: [user]
    define admin: [user]
    define can_manage: admin

type folder
  relations
    define parent_folder: [folder]
    define owner: [user, organization#member] or owner from parent_folder
    define writer: [user, organization#member] or owner or writer from parent_folder
    define viewer: [user, organization#member] or writer or viewer from parent_folder

type document
  relations
    define organization: [organization]
    define parent_folder: [folder]
    define owner: [user, organization#member]
    define editor: [user, organization#member] or owner
    define viewer: [user, organization#member] or editor or viewer from parent_folder
    define can_view: viewer or viewer from parent_folder
    define can_edit: editor or admin from organization
EOF

fga model write --store-id=$FGA_STORE_ID --file model_multitenant.fga
```

#### Keycloak Event Publisher の Tuple 書き込みフォーマット

| Keycloak イベント        | user                      | relation   | object               |
| ------------------------ | ------------------------- | ---------- | -------------------- |
| ROLE_MAPPING_CREATE      | `user:<keycloak-user-id>` | `assignee` | `role:<role-name>`   |
| ROLE_MAPPING_DELETE      | `user:<keycloak-user-id>` | `assignee` | `role:<role-name>`   |
| GROUP_MEMBERSHIP（追加） | `user:<user-id>`          | `assignee` | `group:<group-name>` |
| ロール間継承             | `role:<parent-role>`      | `parent`   | `role:<child-role>`  |

#### Conditional Relation（条件付き関係）

IP アドレスや時刻条件でアクセスを制限する例です。

```bash
cat > model_conditional.fga << 'EOF'
model
  schema 1.1

type user

type document
  relations
    define viewer: [user, user with non_expired_grant]

condition non_expired_grant(
  current_time: timestamp,
  grant_time: timestamp,
  grant_duration: duration
) {
  current_time < grant_time + grant_duration
}
EOF
```

条件付き Check リクエスト:

```bash
curl -X POST http://localhost:8081/stores/$FGA_STORE_ID/check \
  -H "Content-Type: application/json" \
  -d '{
    "authorization_model_id": "'$FGA_MODEL_ID'",
    "tuple_key": {
      "user": "user:anne",
      "relation": "viewer",
      "object": "document:budget-2026"
    },
    "context": {
      "current_time": "2026-04-03T14:00:00Z"
    }
  }'
```

### Kong 経由の API アクセス

#### トークン付きリクエストの流れ

```mermaid
sequenceDiagram
  participant SPA as React SPA
  participant Kong as Kong Gateway
  participant Keycloak as Keycloak
  participant Backend as Backend API
  SPA->>Kong: "GET /api/resource - Authorization: Bearer access_token"
  Note over Kong,Keycloak: JWKS 公開鍵はキャッシュ済み（初回のみ取得）
  Kong->>Kong: "JWKS キャッシュで JWT 署名・クレーム・有効期限を検証"
  Kong->>Backend: "GET /resource - Authorization: Bearer access_token X-Userinfo: user_info"
  Backend->>Backend: OpenFGA で認可チェック
  Backend->>SPA: "200 OK with response body"
```

Kong OpenID Connect プラグインが実行する処理:

- Keycloak の Discovery エンドポイントから公開鍵を取得してキャッシュする
- Bearer トークンの署名・有効期限・クレームを検証する
- 検証済みトークンを `Authorization` ヘッダーに付与してバックエンドに転送する
- `X-Userinfo` ヘッダーにユーザー情報を付与する

バックエンドでのヘッダー取得例:

```typescript
app.get("/resource", async (req, res) => {
  const userInfo = req.headers["x-userinfo"];
  const user = JSON.parse(Buffer.from(userInfo as string, "base64").toString());
  const userId = user.sub;

  const allowed = await checkPermission(userId, "can_view", "document:readme");
  if (!allowed) {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json({ data: "protected content" });
});
```

## 運用

### Keycloak 運用

#### Realm エクスポート・インポート

- ユーザー数が 50,000 件を超える場合はディレクトリ形式を使用します
- インポート前にすべての Keycloak ノードを停止します

```bash
# エクスポート（ファイル）
bin/kc.sh export --file realm-export.json --realm myrealm

# エクスポート（ディレクトリ、ユーザー分割）
bin/kc.sh export --dir /export --realm myrealm \
  --users different_files --users-per-file 100

# インポート（既存 Realm を上書きしない）
bin/kc.sh import --dir /export --override false

# 起動時インポート（data/import ディレクトリを参照）
bin/kc.sh start --import-realm
```

#### ユーザー・ロール管理の自動化

```bash
# サービスアカウント（admin-cli の Service Accounts Enabled が必要）
TOKEN=$(curl -s -X POST \
  "http://keycloak:8080/realms/myrealm/protocol/openid-connect/token" \
  -d "client_id=admin-cli&grant_type=client_credentials&client_secret=SECRET" \
  | jq -r .access_token)

# ユーザー作成
curl -s -X POST \
  "http://keycloak:8080/admin/realms/myrealm/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","enabled":true,"email":"alice@example.com"}'
```

#### セッション管理とタイムアウト設定

| 設定項目               | 推奨値             | 説明                               |
| ---------------------- | ------------------ | ---------------------------------- |
| Access Token Lifespan  | 5 分               | アクセストークン有効期限           |
| SSO Session Idle       | 30 分              | アイドル状態でのセッション有効期限 |
| SSO Session Max        | 8〜24 時間         | セッションの最大有効期限           |
| Refresh Token Lifespan | SSO Session と連動 | リフレッシュトークン有効期限       |

#### バージョンアップ手順

```bash
# 1. 現行バージョンでメタデータ生成
bin/kc.sh update-compatibility metadata --file=/tmp/compat.json

# 2. 新バージョンで互換性チェック
bin/kc.sh update-compatibility check --file=/tmp/compat.json
# 終了コード 0: ローリングアップデート可能
# 終了コード 3: 全ノード停止が必要
```

| 変更種別                     | アップデート戦略                           |
| ---------------------------- | ------------------------------------------ |
| パッチリリース（同一 minor） | ローリングアップデート（ダウンタイムなし） |
| マイナー・メジャーバージョン | Recreate（全ノード停止後に起動）           |
| DB スキーマ変更を含む        | Recreate 必須                              |

### Kong 運用

#### declarative config によるバージョン管理

decK（declarative configuration toolkit）で Kong 設定を Git 管理します。Admin API ではなく YAML ファイルを唯一の正解とします（GitOps）。

```bash
# Kong 設定をエクスポート
deck gateway dump --output-file kong.yml

# 差分確認（ドライラン）
deck gateway diff kong.yml

# 設定同期（変更を Kong に適用）
deck gateway sync kong.yml

# OpenAPI Spec から kong.yml を生成
deck file openapi2kong --spec openapi.yml --output-file kong.yml
```

#### ヘルスチェックとアップストリーム管理

```yaml
# kong.yml のアップストリーム定義例
upstreams:
  - name: backend-upstream
    algorithm: round-robin
    healthchecks:
      active:
        http_path: /health
        interval: 10
        healthy:
          successes: 2
        unhealthy:
          http_failures: 3
          interval: 5
      passive:
        healthy:
          successes: 5
        unhealthy:
          http_failures: 5
    targets:
      - target: backend-1:8080
        weight: 100
      - target: backend-2:8080
        weight: 100
```

### OpenFGA 運用

#### Authorization Model のバージョン管理

Authorization Model は一度書き込むと変更・削除できません（イミュータブル）。新しいモデルを書き込むたびに新しい `authorization_model_id` が生成されます。

```bash
# モデル一覧取得（新しい順）
curl -X GET "http://openfga:8080/stores/{store_id}/authorization-models"
```

#### Tuple の一括管理

1 回のリクエストで最大 100 件の Tuple を書き込み・削除できます。書き込みと削除は同一リクエスト内で組み合わせ可能です。

#### パフォーマンスモニタリング

```bash
openfga run \
  --metrics-enabled \
  --datastore-metrics-enabled \
  --trace-enabled \
  --trace-sample-ratio 0.1
```

| メトリクス                      | 説明                                 |
| ------------------------------- | ------------------------------------ |
| `openfga_request_duration_ms`   | Check / ListObjects のレイテンシ     |
| `openfga_datastore_query_count` | データストアクエリ数                 |
| `openfga_request_total`         | リクエスト総数（エラーレート算出用） |

### トークンライフサイクル管理

#### リフレッシュトークンのローテーション

`Revoke Refresh Token` を有効化すると、使用済みリフレッシュトークンは即時失効します。ローテーションにより、リフレッシュトークンの盗用を検知できます。

#### トークン失効

```bash
curl -X POST \
  "http://keycloak:8080/realms/myrealm/protocol/openid-connect/revoke" \
  -d "client_id=spa-client" \
  -d "token=<refresh_token>" \
  -d "token_type_hint=refresh_token"
```

### 監視・ログ

#### ヘルスチェックエンドポイント

| コンポーネント | エンドポイント                | プロトコル          |
| -------------- | ----------------------------- | ------------------- |
| Keycloak       | `/health/ready`               | HTTP                |
| Keycloak       | `/health/live`                | HTTP                |
| Kong           | `/status`                     | HTTP（Admin: 9001） |
| OpenFGA        | `/healthz`                    | HTTP                |
| OpenFGA        | `grpc.health.v1.Health/Check` | gRPC                |

#### 重要なメトリクスとアラート

| メトリクス           | コンポーネント | アラートしきい値 |
| -------------------- | -------------- | ---------------- |
| 認証成功率           | Keycloak       | エラー率 > 1%    |
| Check レイテンシ P99 | OpenFGA        | > 200ms          |
| HTTP 5xx エラー率    | Kong           | > 0.1%           |
| ヒープ使用率         | Keycloak       | > 80%            |

#### 集中ログ管理

| コンポーネント | ログ形式       | 主要フィールド                                                  |
| -------------- | -------------- | --------------------------------------------------------------- |
| Keycloak       | JSON（events） | `type`, `realmId`, `userId`, `sessionId`, `ipAddress`           |
| Kong           | JSON           | `request_id`, `status`, `latency`, `upstream_uri`, `consumer`   |
| OpenFGA        | JSON（zap）    | `store_id`, `model_id`, `user`, `relation`, `object`, `allowed` |

## ベストプラクティス

### セキュリティ

#### PKCE S256 必須化

SPA（publicClient）では PKCE を必須化することで認可コード横取り攻撃を防ぎます。

```bash
curl -X PUT \
  "http://keycloak:8080/admin/realms/myrealm/clients/{client-uuid}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"attributes": {"pkce.code.challenge.method": "S256"}}'
```

#### トークンストレージ戦略

| ストレージ            | トークン種別         | 備考                                                                    |
| --------------------- | -------------------- | ----------------------------------------------------------------------- |
| メモリ（React State） | アクセストークン     | ページリロードで消去されるが、実行中の XSS スクリプトからはアクセス可能 |
| HttpOnly Cookie       | リフレッシュトークン | JS からアクセス不可。CSRF 対策に SameSite 必須                          |

localStorage / sessionStorage へのトークン保存は XSS に対して脆弱なため使用しません。

#### CORS の最小限設定

```yaml
plugins:
  - name: cors
    config:
      origins:
        - "https://app.example.com"
      methods:
        - GET
        - POST
        - PUT
        - DELETE
      headers:
        - Authorization
        - Content-Type
      credentials: true
      max_age: 3600
```

#### CSP ヘッダー設定

```yaml
plugins:
  - name: response-transformer
    config:
      add:
        headers:
          - "Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://keycloak.example.com; frame-ancestors 'none'"
          - "X-Frame-Options: DENY"
          - "X-Content-Type-Options: nosniff"
```

#### XSS 対策

React の JSX はデフォルトでエスケープするため、`dangerouslySetInnerHTML` の使用を禁止します。ユーザー入力を表示する箇所では DOMPurify でサニタイズします。

```tsx
import DOMPurify from "dompurify";

const SafeContent = ({ html }: { html: string }) => (
  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
);
```

#### Keycloak ブルートフォース対策

```bash
curl -X PUT \
  "http://keycloak:8080/admin/realms/myrealm" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bruteForceProtected": true,
    "failureFactor": 5,
    "waitIncrementSeconds": 60,
    "maxFailureWaitSeconds": 900,
    "maxDeltaTimeSeconds": 43200
  }'
```

| パラメータ              | 推奨値  | 説明                                                         |
| ----------------------- | ------- | ------------------------------------------------------------ |
| `bruteForceProtected`   | `true`  | 保護機能の有効化                                             |
| `failureFactor`         | `5`     | この回数を超えるとロックが開始される                         |
| `waitIncrementSeconds`  | `60`    | 失敗回数が倍数に達するたびに加算される秒数                   |
| `maxFailureWaitSeconds` | `900`   | 一時ロックの最大時間（15分）                                 |
| `maxDeltaTimeSeconds`   | `43200` | 最後の失敗から失敗カウントをリセットするまでの秒数（12時間） |

#### OpenFGA API 認証

本番環境では OpenFGA API への認証を必須化します。

Pre-shared Key 方式:

```bash
export OPENFGA_AUTHN_METHOD=preshared
export OPENFGA_AUTHN_PRESHARED_KEYS=my-secret-key-1,my-secret-key-2
```

OIDC クライアントクレデンシャルズ方式（Keycloak 連携）:

```bash
export OPENFGA_AUTHN_METHOD=oidc
export OPENFGA_AUTHN_OIDC_ISSUER=https://keycloak.example.com/realms/myrealm
export OPENFGA_AUTHN_OIDC_AUDIENCE=openfga-api
```

### 認可モデル設計

#### RBAC と ReBAC の使い分け

| ユースケース                           | 推奨モデル |
| -------------------------------------- | ---------- |
| 管理者 / 一般ユーザーの区別            | RBAC       |
| 特定ドキュメントのオーナー・閲覧者管理 | ReBAC      |
| 組織階層に応じた権限継承               | ReBAC      |
| マルチテナント SaaS の権限管理         | ReBAC      |

#### Contextual Tuple の活用

OIDC トークンのクレームを Contextual Tuple として Check API に渡します。ユーザーのグループ情報などをリアルタイムに反映でき、Tuple の同期コストを削減できます。

```typescript
const checkResult = await fgaClient.check({
  tuple_key: {
    user: `user:${userId}`,
    relation: "viewer",
    object: `document:${docId}`,
  },
  contextual_tuples: {
    tuple_keys: token.groups.map((group: string) => ({
      user: `user:${userId}`,
      relation: "member",
      object: `group:${group}`,
    })),
  },
  authorization_model_id: currentModelId,
});
```

| 特性                       | 説明                                             |
| -------------------------- | ------------------------------------------------ |
| 永続化しない               | Check / ListObjects / ListUsers のみで有効       |
| リアルタイム反映           | トークンクレームの変化を即座に権限チェックへ反映 |
| Read / Expand では使用不可 | 検索インデックスには反映されない                 |

### インフラ

#### Keycloak の HA 構成

最低 2 ノード構成で運用し、Infinispan の分散キャッシュを共有します。Kubernetes では StatefulSet と Pod Anti-Affinity を設定してノードを分散します。

```yaml
affinity:
  podAntiAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchLabels:
            app: keycloak
        topologyKey: kubernetes.io/hostname
```

#### Kong のクラスタリング

Hybrid モードでは Control Plane と Data Plane を分離し、Data Plane をスケールアウトします。Data Plane のみを公開ネットワークに配置し、Control Plane を内部ネットワークに隔離します。

#### OpenFGA のスケーリング

少数の高スペックサーバーに集約することでキャッシュヒット率を高めます。OpenFGA ノードと PostgreSQL を同一データセンターに配置します。

```bash
OPENFGA_MAX_CONCURRENT_READS_FOR_CHECK=100
OPENFGA_MAX_CONCURRENT_READS_FOR_LIST_OBJECTS=50
OPENFGA_RESOLVE_NODE_LIMIT=25
OPENFGA_LIST_OBJECTS_MAX_RESULTS=100
```

#### 証明書管理

| コンポーネント | 証明書配置                                                  |
| -------------- | ----------------------------------------------------------- |
| Keycloak       | `--https-certificate-file` 起動オプション                   |
| Kong           | Admin API の `/certificates` エンドポイント または kong.yml |
| OpenFGA        | `--grpc-tls-cert` / `--http-tls-cert` 起動フラグ            |

## トラブルシューティング

### 認証系トラブル

| トラブル                 | 症状                                                                            | 原因                                                                              | 対処                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OIDC Discovery 失敗      | Kong OIDC プラグインが起動時または初回リクエスト時にエラーを返す                | Kong から Keycloak の Discovery エンドポイントへの疎通不可、または URL 誤設定     | `nc -vz keycloak 8080` で疎通確認する。Keycloak 20 以降は Discovery URL が `/realms/{realm}/.well-known/openid-configuration` に変更されているため URL を確認する |
| PKCE mismatch エラー     | 認可コード交換時に `invalid_grant` または `code_verifier mismatch` エラーが返る | code_verifier と code_challenge の生成ロジックに不整合がある                      | S256 の計算式 `BASE64URL(SHA256(ASCII(code_verifier)))` を確認する                                                                                                |
| トークンリフレッシュ失敗 | `invalid_grant` が返り、ユーザーが再ログインを求められる                        | リフレッシュトークンの期限切れ、またはローテーション後に旧トークンを使用した      | SSO Session Idle / Max の設定値を確認する。`Revoke Refresh Token` 有効時は複数タブの競合を考慮してリフレッシュ処理をシリアライズする                              |
| CORS エラー              | ブラウザで `CORS policy: No 'Access-Control-Allow-Origin' header` が表示される  | Kong の CORS プラグイン未設定、または `origins` に SPA のオリジンが含まれていない | `deck gateway diff` で設定を確認する。`credentials: true` 使用時は `origins: ["*"]` は無効なため、明示的なオリジンを指定する                                      |

### 認可系トラブル

| トラブル                                 | 症状                                                                         | 原因                                                                                                          | 対処                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| OpenFGA Check が常に false を返す        | Tuple が存在するにもかかわらず Check が `{"allowed": false}` を返す          | キャッシュによる整合性遅延、異なる `authorization_model_id` の使用、Tuple の user / object フォーマット不一致 | `consistency: "HIGHER_CONSISTENCY"` を一時的に指定して再確認する                                                                         |
| Tuple の不整合                           | Keycloak でユーザーのロールが変更されても、OpenFGA の Check 結果が変わらない | Keycloak のロール変更イベントが OpenFGA の Tuple に反映されていない                                           | Keycloak の Event Listener を確認する。Contextual Tuple でトークンクレームを渡す設計に切り替えることで同期コストを排除できる             |
| Authorization Model マイグレーション失敗 | 新しいモデルへ切り替え後、一部の Check が予期しない結果を返す                | 旧リレーション名の Tuple が残存、またはアプリコードの `authorization_model_id` が更新されていない             | 旧モデル ID のまま Check を継続しながら、新リレーションへ Tuple をコピーする。コピー完了後にアプリの `authorization_model_id` を更新する |

### インフラ系トラブル

| トラブル                          | 症状                                                              | 原因                                                                             | 対処                                                                    |
| --------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Kong ↔ Keycloak 接続タイムアウト  | Kong から Keycloak への OIDC トークン検証でタイムアウトが発生する | ネットワーク遅延、または Discovery キャッシュの TTL 切れ時に集中リクエストが発生 | Discovery の cache_ttl を適切に設定する                                 |
| Keycloak のメモリ・CPU 使用率高騰 | Keycloak のヒープ使用率が 80% を超え、GC が頻発する               | アクティブセッション数の増大、または Infinispan キャッシュサイズの不足           | JVM ヒープを `-Xmx` で適切に設定する（目安: 2GB〜4GB）                  |
| OpenFGA のレスポンスタイム劣化    | Check API のレイテンシが増大し、P99 が 200ms を超える             | DB 接続プールの枯渇、複雑な Authorization Model による深い再帰                   | `OPENFGA_DATASTORE_MAX_OPEN_CONNS` を DB の最大接続数に合わせて調整する |

## まとめ

Keycloak + OpenFGA + Kong + React SPA の構成は、認証・認可の責務をそれぞれ専任コンポーネントに分離し、アプリケーションコードに認証ロジックを持ち込まないゼロトラスト API セキュリティ基盤を実現します。OIDC / OAuth 2.0 / PKCE という標準に準拠し、ReBAC による細粒度認可と GitOps ベースのゲートウェイ管理を組み合わせることで、変更・監査・スケールに強い構成を構築できます。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！

## 参考リンク

- 公式ドキュメント
  - [Keycloak Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/)
  - [OpenFGA Concepts](https://openfga.dev/docs/concepts)
  - [Kong Gateway Entities](https://developer.konghq.com/gateway/entities/)
  - [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
  - [Getting Started with Keycloak on Docker](https://www.keycloak.org/getting-started/getting-started-docker)
  - [OpenFGA Setup with Docker](https://openfga.dev/docs/getting-started/setup-openfga/docker)
  - [OpenFGA Configure Authorization Model](https://openfga.dev/docs/getting-started/configure-model)
  - [OpenFGA Use the FGA CLI](https://openfga.dev/docs/getting-started/cli)
  - [Kong OpenID Connect Plugin](https://developer.konghq.com/plugins/openid-connect/)
  - [oidc-spa Documentation](https://docs.oidc-spa.dev/)
  - [Importing and exporting realms - Keycloak](https://www.keycloak.org/server/importExport)
  - [Checking if rolling updates are possible - Keycloak](https://www.keycloak.org/server/update-compatibility)
  - [Multi-cluster deployments - Keycloak](https://www.keycloak.org/high-availability/multi-cluster/introduction)
  - [Running OpenFGA in Production](https://openfga.dev/docs/best-practices/running-in-production)
  - [Immutable Authorization Models - OpenFGA](https://openfga.dev/docs/getting-started/immutable-models)
  - [Use Token Claims As Contextual Tuples - OpenFGA](https://openfga.dev/docs/modeling/token-claims-contextual-tuples)
  - [Model Migrations - OpenFGA](https://openfga.dev/docs/modeling/migrating)
  - [decK - Kong Docs](https://developer.konghq.com/deck/)
  - [Health checks and circuit breakers - Kong Gateway](https://developer.konghq.com/gateway/traffic-control/health-checks-circuit-breakers/)
  - [Query Consistency Modes - OpenFGA](https://openfga.dev/docs/interacting/consistency)
  - [Conditional Tuples - OpenFGA](https://openfga.dev/docs/modeling/conditions)
  - [OpenFGA Authentication Configuration](https://openfga.dev/docs/getting-started/setup-openfga/configure-openfga)
  - [oidc-spa JWT of the Access Token](https://docs.oidc-spa.dev/resources/jwt-of-the-access-token)
  - [oidc-spa Tokens Renewal](https://docs.oidc-spa.dev/features/tokens-renewal)
  - [Keycloak Brute Force Protection](https://www.keycloak.org/docs/latest/server_admin/#password-guess-brute-force-attacks)
- GitHub
  - [keycloak-openfga-workshop](https://github.com/embesozzi/keycloak-openfga-workshop)
  - [oidc-spa](https://github.com/keycloakify/oidc-spa)
  - [keycloak-openfga-event-publisher](https://github.com/embesozzi/keycloak-openfga-event-publisher)
  - [openfga/sample-stores](https://github.com/openfga/sample-stores)
- 記事
  - [Keycloak integration with OpenFGA for Fine-Grained Authorization at Scale - Medium](https://embesozzi.medium.com/keycloak-integration-with-openfga-based-on-zanzibar-for-fine-grained-authorization-at-scale-d3376de00f9a)
  - [Building Scalable Multi-Tenancy Authentication and Authorization - Medium](https://embesozzi.medium.com/building-scalable-multi-tenancy-authentication-and-authorization-using-open-standards-and-7341fcd87b64)
