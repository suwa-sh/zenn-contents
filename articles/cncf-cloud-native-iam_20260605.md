---
title: "技術調査 - CNCF Cloud Native IAM White Paper"
emoji: "🔐"
type: "tech"
topics: ["IAM", "SPIFFE", "OpenFGA", "CNCF", "ZeroTrust"]
published: false
---

> 対象: CNCF TAG Security and Compliance「Cloud Native Identity and Access Management (IAM) White Paper」(v1.1, 2026-04-24, status: Approved)
> 検証日: 2026-06-05

## 概要

AI エージェントが CI/CD やインフラに自律的に触れる時代になり、IAM の論点は「誰がログインするか」から「人間・ワークロード・自動エージェントをどう同じ枠組みで認証・認可するか」へ移っています。CNCF TAG Security and Compliance が公開した「Cloud Native IAM White Paper」は、まさにこの問いに正面から答える文書です。

この白書の核心は、**人間(end user / internal user / administrator)と非人間(workloads / services / automated agents)を等しく first-class subject として扱い、同じ IAM アーキテクチャの上で認証・認可を設計する**という視座にあります。一般的な IAM 概念の解説書ではなく、**Basic Pattern(境界防御)と Advanced Pattern(ゼロトラスト)という 2 つの参照アーキテクチャ**に対して、RFC 2119 の MUST / SHOULD / MAY で具体的な実装要件を与える「要件カタログ」が本体です。

設計の核心は二層分離にあります。ワークロードの身元は **SPIFFE/SVID**(X.509-SVID または JWT-SVID が MUST)で確立し、その上に**ユーザーの身元と認可コンテキストを internal access token として載せます**。これにより「どのワークロードが」「誰の代理で」アクセスしているかを分離して扱えます(dual-subject 認可)。認可は NIST SP 800-162 の P\*P アーキテクチャ(PEP / PDP / PAP / PIP)に基づき、細粒度認可では RBAC が role explosion を招きやすいため、白書は **ABAC または ReBAC を SHOULD** とします。

ただし、この白書は万能の処方箋ではありません。本記事では、白書の構造とデータモデルを整理したうえで、SPIFFE / OpenFGA / ABAC / エージェント認可それぞれの実装上の限界も「誤解 → 反証 → 推奨」の形で扱います。結論を先に言えば、「白書は人間・非人間を統一視するための優れた骨子であり、実装の土台は組める。ただしエージェントの runtime 認可と組織運用が伴って初めて機能する」という条件付きの評価になります。

### 位置づけと制約

読み始める前に、白書のスコープと立ち位置を押さえておきます。

- **CNCF の community publication** であり、ISO / IETF のような公式標準・査読物ではありません。
- スコープは **single Kubernetes cluster + single trust domain** に限定されます。multi-cluster / cross-trust-domain federation は意図的に対象外です。
- **MCP / A2A は明示的にスコープ外**です。ただし白書の AuthN/AuthZ 原則はエージェントベースシステムへ再利用できる、と設計意図が脚注で明記されています。

## 特徴

### 主体を 4 つに分類する

白書は identity を「人間と非人間を等しく first-class subject」と明言し、アクターを次の 4 区分で定義します。

| 主体カテゴリ | 定義 | 主な認証手段 |
|---|---|---|
| End user | 顧客等の外部ユーザー | OIDC authorization code flow + PKCE(S256)+ MFA |
| Internal user | サポート・運用スタッフ等の組織内ユーザー | 同上 + より高い保証レベル |
| Administrator | ポリシーやシステム設定を管理する特権ユーザー | 同上 + 最高保証レベル |
| Non-human actor | workloads / services / automated agents / devices | SPIFFE/SVID + mTLS |

ここで興味深いのは、人間側を End / Internal / Administrator の 3 つに細分しながら、非人間側は workload / service / automated agent / device を 1 カテゴリにまとめている点です。これは「非人間主体には SPIFFE という共通の ID 基盤を当てる」という設計意図と整合します。Administrator を人間から独立した第 4 カテゴリとして切り出しているのも、特権操作の保証レベルを別建てで扱うためです。

### Basic と Advanced の 2 段で考える

白書は理想形を 1 つだけ押し付けるのではなく、組織の成熟度に応じた 2 つのパターンを定義します。

| 観点 | Basic Pattern | Advanced Pattern |
|---|---|---|
| 防御モデル | 境界(perimeter)防御 | zero-trust(各 workload が trust boundary)|
| ワークロード mTLS | 必須ではない | MUST |
| 人間 MFA | SHOULD(AAL2 以上) | MUST(AAL1 禁止) |
| federation | — | FAL2 以上 MUST |
| 想定段階 | これから IAM を整える組織 | ゼロトラスト移行済み/移行中の組織 |

いきなりゼロトラストを全面適用できない組織でも、Basic から始めて Advanced を到達目標に置けます。

### SVID と internal access token で身元を二層に分ける

Advanced Pattern の核心が、この二層分離です。

- ワークロードの身元は **SPIFFE/SVID** で確立します(X.509-SVID または JWT-SVID が MUST)。
- ユーザーの身元と認可コンテキストは **internal access token** に載せます。
- これにより「どのワークロードが」「誰の代理で」アクセスしているかを分離して扱えます(dual-subject 認可)。

### SVID は自動ローテーションが MUST

- **SPIFFE Signing Authority** が SVID の発行・管理・自動ローテーションを MUST として要求します。
- trust domain root key の寿命最小化が SHOULD、trust bundle の管理・配布も MUST です。
- Kubernetes の bound ServiceAccount token は `expirationSeconds` デフォルト 3600 秒・Pod 削除後失効と、短命クレデンシャルの具体例が整合します。
- 長命クレデンシャルを排し JIT(just-in-time)アクセスを基本とする方針の、技術的な裏付けになっています。

### 認可は ABAC / ReBAC を推す

- 認可アーキテクチャは **NIST SP 800-162 の P\*P 構造**(PEP / PDP / PAP / PIP)を採用します。
- 細粒度認可では **RBAC が role explosion を招きやすい**ため、白書は ABAC または ReBAC を SHOULD とします(RBAC を明示的に NOT RECOMMENDED とは書いていません)。
  - ABAC は属性(subject / resource / action / 環境コンテキスト)に依存する認可に向きます。
  - ReBAC はエンティティ間の関係(所有・組織階層・グループ・文書共有)に依存する認可に向きます。
- 認可の粒度は **function / object / object-property の 3 レベルを MUST** で要求します。
- PEP↔PDP 間の標準インタフェースとして **AuthZEN(Authorization API 1.0)** を採用します。

### revocation を最優先に置く

- 「IAM の最重要セキュリティ機能のひとつ」として **revocation(アクセス権の即時失効)** を位置づけます。
- 退職・異動などの lifecycle event と、侵害などの security incident の両方に対応する要件です。
- access token は「実用上最短の lifetime を MUST」、refresh token は lifecycle 制御 + revocation 能力を MUST とします。

### MCP/A2A はスコープ外でも原則は再利用できる

- identity の定義に **automated agents を明示的に包含**し、AI/エージェント型 workload の増加を cloud native IAM が必要な理由として記述します。
- MCP / A2A は明示的にスコープ外ですが、白書の AuthN/AuthZ 原則は「エージェントベースシステムに再利用可能」と設計意図を脚注で明記しています。
- エージェントへの権限委譲では、OAuth の世界で **RFC 8693 の delegation(代理)と impersonation(なりすまし)の区別**が要になります。`actor_token` / `may_act` クレーム / scope による減衰(attenuation)で、権限の上限を保存します。

## 構造

ここからは、白書の論理構造を C4 model の 3 段階に読み替えて整理します。System Context は白書が扱う対象世界の境界、Container は白書が定義する主要構成要素、Component は中核コンポーネントのドリルダウンです。

### システムコンテキスト図

白書が「IAM システム」として扱う対象と、その外側のアクター・外部システムの関係を示します。

```mermaid
graph TB
    EU["End User<br/>外部利用者"]
    IU["Internal User<br/>組織内利用者"]
    ADM["Administrator<br/>特権操作担当"]
    WL["Workload Service<br/>非人間 処理主体"]
    AG["Automated Agent<br/>非人間 自律実行"]

    subgraph IAM["Cloud Native IAM システム"]
        CORE["認証 認可 ライフサイクル管理"]
    end

    subgraph EXT["外部システム"]
        IDP["外部 IdP<br/>フェデレーション元"]
        OIDCP["OIDC Provider<br/>発見 JWKS エンドポイント"]
        SPIFFE_TD["SPIFFE Trust Domain<br/>workload ID の信頼境界"]
        PE["Policy Engine<br/>OPA OpenFGA 等"]
        CLOUD_STS["Cloud STS<br/>AWS GCP Azure"]
    end

    EU -->|"OIDC PKCE MFA"| IAM
    IU -->|"OIDC PKCE MFA"| IAM
    ADM -->|"OIDC 最高保証 MFA"| IAM
    WL -->|"SPIFFE SVID mTLS"| IAM
    AG -->|"SPIFFE SVID RFC8693 delegation"| IAM

    IAM -->|"フェデレーション FAL2以上"| IDP
    IAM -->|"OIDC Discovery JWKS 検証"| OIDCP
    IAM -->|"SVID 発行 検証"| SPIFFE_TD
    IAM -->|"AuthZEN Authorization API"| PE
    IAM -->|"STS token 交換 GCP は RFC8693 AWS は IRSA"| CLOUD_STS
```

| アクター | 分類 | 認証手段 | 主なリスク |
|---|---|---|---|
| End User | 人間 / 外部 | OIDC + PKCE(S256) + MFA (AAL2以上) | なりすまし、認証情報盗取 |
| Internal User | 人間 / 内部 | OIDC + PKCE(S256) + MFA (AAL2以上) | 内部不正、権限乱用 |
| Administrator | 人間 / 特権 | OIDC + 最高保証 MFA (Advanced は AAL1 禁止) | 設定誤り、過剰権限 |
| Workload / Service | 非人間 | SPIFFE/SVID + mTLS (Advanced は MUST) | workload なりすまし、横移動 |
| Automated Agent | 非人間 | SPIFFE/SVID + RFC 8693 delegation | 権限委譲の連鎖逸脱、帰属不明 |

| 外部システム | 役割 | 接続プロトコル |
|---|---|---|
| 外部 IdP | 組織の既存 IdP へのフェデレーション | OIDC federation (FAL2以上) |
| OIDC Provider | K8s ServiceAccount issuer / JWKS 公開 | OIDC Discovery + RFC 7517 JWKS |
| SPIFFE Trust Domain | workload ID の署名・検証の根 | SPIFFE Workload API / mTLS |
| Policy Engine | 認可判定 (PDP) — OPA (ABAC) / OpenFGA (ReBAC) | AuthZEN Authorization API 1.0 |
| Cloud STS | SVID や K8s SA token をクラウド資格情報へ交換 | RFC 8693 / AssumeRoleWithWebIdentity |

### コンテナ図

白書が主要構成要素として定義する Components と、それらの間のデータフローです。

```mermaid
graph TB
    subgraph Human["人間アクター"]
        H_USER["End / Internal / Administrator"]
    end

    subgraph NonHuman["非人間アクター"]
        NHI["Workload Service Agent"]
    end

    subgraph IAM_SYSTEM["Cloud Native IAM システム"]
        subgraph AuthN_Layer["認証レイヤ"]
            OIDC_OP["OIDC OP<br/>Authorization Token JWKS<br/>domain あたり 1 論理"]
            SPIFFE_SA["SPIFFE Signing Authority<br/>SVID 署名 発行<br/>自動ローテーション MUST"]
            SVID_EP["SPIFFE Workload Endpoint<br/>Workload API 公開<br/>SVID 配布"]
            TOKEN_SVC["Token Service<br/>RFC8693 exchange<br/>scope attenuation"]
        end

        subgraph AuthZ_Layer["認可レイヤ"]
            PEP["PEP<br/>横取り 検証<br/>Permit Deny 執行"]
            PDP["PDP<br/>ABAC ReBAC 評価<br/>全決定ログ MUST"]
        end

        subgraph Token_Layer["トークン層"]
            IAT["internal access token<br/>ユーザー ID 認可コンテキスト"]
            SVID_TOKEN["SVID<br/>X509 JWT<br/>短命 自動ローテーション"]
        end
    end

    H_USER -->|"OIDC code PKCE"| OIDC_OP
    OIDC_OP -->|"ID Token access token"| IAT
    NHI -->|"Workload API"| SVID_EP
    SPIFFE_SA -->|"署名済み SVID"| SVID_EP
    SVID_EP -->|"X509 JWT SVID"| SVID_TOKEN
    SVID_TOKEN -->|"mTLS 証明書"| PEP
    IAT -->|"Bearer token"| PEP
    TOKEN_SVC -->|"narrowed token"| IAT
    SVID_TOKEN -->|"actor_token"| TOKEN_SVC
    PEP -->|"AuthZEN check"| PDP
    PDP -->|"Permit Deny"| PEP
```

| コンポーネント | 核心責務 | スコープ外 |
|---|---|---|
| OIDC OP | 人間アクターの認証権威。authorization code flow with PKCE のみ採用。trust domain に 1 論理インスタンス | ポリシー管理、SCIM/PAM |
| SPIFFE Signing Authority | workload SVID の署名・発行・自動ローテーション。trust bundle の管理・配布 | ユーザー認証、認可判定 |
| SPIFFE Workload Endpoint | 各ノードで Workload API を公開し SVID を配布(Workload API / CSI Driver / SDS 等) | 署名・発行(Signing Authority の責務) |
| Token Service (RFC 8693) | subject_token + actor_token を受け取り、scope を attenuation して internal access token を発行(impersonation 禁止) | ポリシー作成(PAP の責務) |
| PEP | リクエストを横取りし AuthZEN で PDP へ問い合わせ、決定を執行。Advanced では全 workload に内包 | 自分では判定しない |
| PDP | AuthZEN Authorization API 1.0 を公開し ABAC/ReBAC ポリシーを評価。全決定をログ。cluster 外から非公開 | ポリシーの作成・管理(PAP)、属性供給(PIP) |

### コンポーネント図

#### PDP の内部(ABAC / ReBAC)

```mermaid
graph TB
    PEP_IN["PEP<br/>AuthZEN check 送信"]

    subgraph PDP_INTERNAL["PDP の内部"]
        AUTHZEN_IF["AuthZEN Authorization API 1.0<br/>subject resource action context"]

        subgraph ABAC_ENGINE["ABAC エンジン 例 OPA Rego"]
            POLICY_STORE["ポリシーストア<br/>宣言的ルール群"]
            ATTR_EVAL["属性評価<br/>subject resource env"]
        end

        subgraph REBAC_ENGINE["ReBAC エンジン 例 OpenFGA"]
            AUTH_MODEL["Authorization Model<br/>type definition"]
            REL_TUPLES["Relationship Tuples<br/>user relation object"]
            CHECK_API["Check API<br/>関係グラフ探索"]
        end

        DECISION["認可決定<br/>Permit Deny obligation<br/>全決定ログ MUST"]
        CACHE["Decision Cache<br/>既定 MINIMIZE_LATENCY<br/>高機微は HIGHER_CONSISTENCY"]
    end

    PIP_EXT["PIP<br/>属性値の供給源<br/>IdP DB 環境変数"]

    PEP_IN -->|"check 送信"| AUTHZEN_IF
    AUTHZEN_IF --> ABAC_ENGINE
    AUTHZEN_IF --> REBAC_ENGINE
    ABAC_ENGINE -->|"属性不足時"| PIP_EXT
    PIP_EXT -->|"属性供給"| ATTR_EVAL
    POLICY_STORE --> ATTR_EVAL
    AUTH_MODEL --> CHECK_API
    REL_TUPLES --> CHECK_API
    ABAC_ENGINE --> DECISION
    REBAC_ENGINE --> DECISION
    DECISION --> CACHE
    DECISION -->|"Permit Deny"| PEP_IN
```

| コンポーネント | 役割 | 実装例 |
|---|---|---|
| AuthZEN Authorization API 1.0 | PEP-PDP 間の標準 IF。subject / resource / action / context を受付 | OpenID Foundation AuthZEN WG |
| ABAC エンジン | 主体属性・オブジェクト属性・環境条件をポリシーに照合。動的・文脈依存ルールに強い | OPA + Rego |
| ReBAC エンジン | 関係グラフ(所有・継承・共有)を tuple として保持し Check API で辿る | OpenFGA (CNCF Incubating) |
| PIP (外部) | 判定に必要な属性値の供給源。PDP が要求し動的取得 | IdP / LDAP / DB / 環境変数 |
| Decision Cache | 性能向上のため決定を一時保存。高機微環境では無効化 SHOULD | ローカル / 分散 KVS |

#### SPIFFE の二層 Attestation

SPIFFE が「シークレット配布」と本質的に違うのは、まず attestation でノードとワークロードを検証してから短命 SVID を発行する点です。

```mermaid
graph TB
    subgraph K8S_NODE["K8s ノード"]
        WL_PROC["Workload プロセス<br/>Pod Container"]
        SPIRE_AGENT["SPIRE Agent<br/>Workload API 公開"]
        NODE_ATTESTER["Node Attestor<br/>aws_iid k8s join_token"]
        WL_ATTESTER["Workload Attestor<br/>Unix Kubernetes Docker"]
    end

    subgraph SPIRE_SERVER_BLOCK["SPIRE Server"]
        REG_ENTRY["Registration Entry<br/>SPIFFE ID と selector"]
        CA_SIGN["CA 署名モジュール<br/>X509 JWT SVID 発行"]
        TRUST_BUNDLE["Trust Bundle<br/>JWK Set 検証用"]
    end

    subgraph SVID_FORMATS["SVID 形式"]
        X509_SVID["X509-SVID<br/>URI SAN ちょうど1つ<br/>短命証明書 mTLS"]
        JWT_SVID["JWT-SVID<br/>sub aud exp 必須<br/>approved alg 以外拒否"]
    end

    WL_PROC -->|"Workload API 呼出"| SPIRE_AGENT
    SPIRE_AGENT -->|"Layer1 Node Attestation"| NODE_ATTESTER
    NODE_ATTESTER -->|"暗号的証拠"| SPIRE_SERVER_BLOCK
    SPIRE_AGENT -->|"Layer2 Workload Attestation"| WL_ATTESTER
    WL_ATTESTER -->|"selector"| SPIRE_AGENT
    SPIRE_AGENT -->|"selector 照合"| REG_ENTRY
    REG_ENTRY -->|"SPIFFE ID 決定"| CA_SIGN
    CA_SIGN -->|"署名済み SVID"| X509_SVID
    CA_SIGN -->|"署名済み SVID"| JWT_SVID
    X509_SVID -->|"配布"| SPIRE_AGENT
    JWT_SVID -->|"配布"| SPIRE_AGENT
    SPIRE_AGENT -->|"SVID trust bundle"| WL_PROC
    CA_SIGN --> TRUST_BUNDLE
    TRUST_BUNDLE -->|"ピア検証用"| WL_PROC
```

| コンポーネント | レイヤ | 役割 | 具体例 |
|---|---|---|---|
| Node Attestor | Layer 1 | agent が動くノードの ID を暗号的証拠で確立 | aws_iid / K8s SA token / join_token |
| Workload Attestor | Layer 2 | Workload API を呼んだプロセスの selector を判定 | Unix (UID/PID) / Kubernetes / Docker |
| Registration Entry | マッピング | SPIFFE ID と selector を対応づける(管理者が事前定義) | spiffe://example.org/billing と k8s:ns:billing |
| CA 署名モジュール | 発行 | X.509-SVID / JWT-SVID を署名発行。自動ローテーション (MUST) | SPIRE Server の built-in CA |
| Trust Bundle | 配布 | 他 workload が SVID を検証する公開鍵素材 (JWK Set) | SPIRE Server bundle endpoint |

なお重要な前提として、本白書は **single Kubernetes cluster + single trust domain** を対象とします。multi-cluster / cross-trust-domain federation、MCP / A2A、非同期/バッチ処理、SCIM / PAM は意図的にスコープ外です。

## データ

### 概念モデル

主体(Subject)から ID、クレデンシャル、認可、リソースへと至る流れを示します。

```mermaid
graph TB
    subgraph Subjects["主体 Subject"]
        H["Human<br/>End Internal Admin"]
        NH["Non-Human<br/>workload service agent device"]
    end

    subgraph Identity["ID 層"]
        UID["User Identity"]
        WID["Workload Identity"]
    end

    subgraph Credential["クレデンシャル層"]
        IAT["Access Token<br/>internal"]
        X509["X509-SVID<br/>mTLS 証明書"]
        JWTSVID["JWT-SVID<br/>bearer token"]
    end

    subgraph TrustInfra["信頼インフラ"]
        TD["Trust Domain"]
        TB["Trust Bundle<br/>JWK Set"]
        SA["SPIFFE Signing Authority<br/>発行 自動ローテーション"]
        OP["OIDC OP"]
    end

    subgraph AuthZ["認可層 P*P"]
        PEP["PEP"]
        PDP["PDP<br/>ABAC ReBAC"]
        Policy["Policy"]
        Permission["Permission<br/>function object property"]
        RelTuple["RelationshipTuple<br/>object relation user"]
    end

    subgraph Resource["リソース層"]
        Res["Resource"]
        Action["Action<br/>read write delete invoke"]
    end

    H --> UID
    NH --> WID
    UID --> IAT
    WID --> X509
    WID --> JWTSVID
    SA --> X509
    SA --> JWTSVID
    SA --> TB
    TD --> SA
    TD --> OP
    OP --> IAT
    TB -.->|"検証"| X509
    TB -.->|"検証"| JWTSVID
    IAT --> PEP
    X509 --> PEP
    JWTSVID --> PEP
    PEP -->|"AuthZEN"| PDP
    PDP --> Policy
    Policy --> Permission
    Policy --> RelTuple
    PEP -->|"enforce"| Res
    PDP -->|"Permit Deny"| PEP
    Res --> Action
```

| 概念名 | 白書での位置づけ | 説明 |
|---|---|---|
| Subject | first-class subject | 人間(Human)と非人間(Non-Human)の総称。どちらも IAM の一級主体 |
| Human | Actor 区分 1–3 | End user / Internal user / Administrator。OIDC + PKCE + MFA |
| Non-Human actor | Actor 区分 4 | workload / service / automated agent / device。SPIFFE/SVID + mTLS |
| SVID | SPIFFE 文書 | ワークロードが ID を証明する文書。X.509-SVID / JWT-SVID の 2 形式 |
| Trust Domain | SPIFFE 核心概念 | 信頼の根の単位。token の trust boundary も兼ねる |
| Trust Bundle | SPIFFE 検証基盤 | SVID 検証用公開鍵素材(JWK Set) |
| SPIFFE Signing Authority | Advanced 要件 | SVID 発行・管理・自動ローテーション(MUST) |
| internal access token | 二層分離の核心 | ユーザー ID + 認可コンテキストを運ぶ Bearer token |
| PEP | P\*P | アクセスを横取りし PDP へ問い合わせ、決定を執行 |
| PDP | P\*P | ポリシーを評価し Permit/Deny を返す。ABAC または ReBAC(SHOULD) |
| Permission | 認可の粒度 | function / object / object-property の 3 レベル(MUST) |
| RelationshipTuple | OpenFGA / ReBAC | object・relation・user の 3 項組。関係グラフの基本単位 |

### 情報モデル

白書・SPIFFE 仕様(normative)・OpenFGA 仕様から属性を抽出してクラス図にします。

```mermaid
classDiagram
    class SpiffeId {
        String scheme
        String trustDomain
        String path
    }
    class X509Svid {
        SpiffeId spiffeId
        String uriSan
        bool cA
        String keyUsage
        DateTime notAfter
    }
    class JwtSvid {
        SpiffeId sub
        String[] aud
        int exp
        String alg
    }
    class TrustDomain {
        String name
        String spiffeUri
    }
    class TrustBundle {
        String trustDomain
        JwkSet jwkSet
    }
    class RegistrationEntry {
        String spiffeId
        String[] selectors
        String parentId
        int ttl
    }
    class InternalAccessToken {
        String sub
        String[] aud
        int exp
        String[] scope
        String actorSpiffeId
    }
    class PolicyDecisionPoint {
        String pdpId
        String modelType
    }
    class RelationshipTuple {
        String object
        String relation
        String user
    }
    class TokenExchangeRequest {
        String grantType
        String subjectToken
        String actorToken
        String[] scope
    }

    TrustDomain "1" --> "1..*" X509Svid : issues
    TrustDomain "1" --> "1" TrustBundle : owns
    TrustDomain "1" --> "0..*" RegistrationEntry : manages
    SpiffeId "1" --> "1" X509Svid : URI SAN
    SpiffeId "1" --> "1" JwtSvid : sub claim
    RegistrationEntry "1" --> "1" SpiffeId : resolves to
    PolicyDecisionPoint "1" --> "0..*" RelationshipTuple : queries
    TokenExchangeRequest --> InternalAccessToken : produces
```

主要エンティティの normative 制約を抜粋します。

| エンティティ | 属性 | 出典 | 制約 |
|---|---|---|---|
| SpiffeId | trustDomain / path | SPIFFE-ID.md | RFC 3986 URI / 最大 2048 bytes / trustDomain は `[a-z0-9.-_]` のみ |
| X509Svid | uriSan / cA / keyUsage | X509-SVID.md | exactly one URI SAN (MUST) / leaf は Basic Constraints の cA=false |
| JwtSvid | sub / aud / exp / alg | JWT-SVID.md | sub=SPIFFE ID、aud・exp 必須、approved alg(RS/ES/PS の 256/384/512)以外を MUST reject |
| RegistrationEntry | selectors / parentId / ttl | SPIRE 仕様から補完 | selector が workload attestation の条件。parentId / ttl は白書未記載で補完 |
| InternalAccessToken | sub / scope / actorSpiffeId | 白書 + OIDC Core | actorSpiffeId は二層分離設計からの推測属性(白書に明示定義なし) |
| RelationshipTuple | object / relation / user | OpenFGA Concepts | OpenFGA のコア 3 項組 |
| TokenExchangeRequest | grantType / subjectToken / actorToken / scope | RFC 8693 §2.1 | delegation 時は actorToken に実行者 ID(impersonation との差) |

`parentId` / `ttl`(RegistrationEntry)と `actorSpiffeId`(InternalAccessToken)は白書本文に直接の属性記述がなく、SPIRE 公式 concepts および白書の二層分離・自動ローテーション要件から補完した推測属性です。

主体ごとに、クレデンシャルと認可への渡し方を整理すると次のようになります。

| 主体 | クレデンシャル | 認可への渡し方 | PEP での検証 |
|---|---|---|---|
| End / Internal user | OIDC ID token → internal access token | Bearer token | token validation → PDP へ AuthZEN |
| Administrator | internal access token(特権 scope) | Bearer token | 同上 + 監査ログ必須 |
| Workload / service | X.509-SVID (mTLS) | TLS クライアント証明書 | mTLS ハンドシェイク → SVID 検証 → PDP |
| Workload / service | JWT-SVID (bearer) | Authorization header | JWT 署名検証 + aud/exp → PDP |
| Automated agent | SVID + RFC 8693 delegated token | actor_token + subject_token | delegation chain 検証 → scope attenuation 確認 |

## 構築方法

### SPIRE で Trust Domain とワークロード ID を用意する

SPIRE は **SPIRE Server**(署名局)と **SPIRE Agent**(各ノードで Workload API を公開)の 2 層で構成されます。次は SPIRE Server の最小 HCL 例です([SPIRE Getting Started](https://spiffe.io/docs/latest/try/getting-started-k8s/) を最小化した実装案です)。

```hcl
# /etc/spire/server.conf
server {
  bind_address = "0.0.0.0"
  bind_port    = "8081"
  trust_domain = "example.org"       # trust domain は [a-z0-9.-_] のみ (SPIFFE-ID 仕様 MUST)
  data_dir     = "/opt/spire/data/server"
  log_level    = "INFO"
}

plugins {
  NodeAttestor "k8s_psat" {          # K8s Projected SA Token で node attestation
    plugin_data {
      clusters = {
        "my-cluster" = {
          service_account_allow_list = ["spire:spire-agent"]
        }
      }
    }
  }
  KeyManager "disk" {
    plugin_data { keys_path = "/opt/spire/data/server/keys.json" }
  }
}
```

ワークロードに SPIFFE ID を割り当てるには、Registration Entry を登録します。

```bash
# namespace=payments, ServiceAccount=payment-svc に SPIFFE ID を割り当てる
spire-server entry create \
  -spiffeID spiffe://example.org/payments/payment-svc \
  -parentID spiffe://example.org/agent/my-cluster/node1 \
  -selector k8s:ns:payments \
  -selector k8s:sa:payment-svc
```

selector の主な種別は次のとおりです。`k8s:ns` と `k8s:sa` の組み合わせが最も一般的な最小セットです。

| selector | 意味 |
|---|---|
| `k8s:ns:<namespace>` | Pod の Namespace |
| `k8s:sa:<serviceaccount>` | Pod の ServiceAccount |
| `k8s:pod-label:<key>:<val>` | Pod ラベル |
| `k8s:container-name:<name>` | コンテナ名 |

### K8s ServiceAccount トークンと OIDC issuer を使う

Kubernetes v1.22 以降の Bound ServiceAccount Token を使い、Pod に短命 OIDC JWT を投影します。kube-apiserver が OIDC issuer として機能します。

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: payment-worker
  namespace: payments
spec:
  serviceAccountName: payment-svc
  containers:
    - name: app
      image: example/payment-app:latest
      env:
        - name: AWS_WEB_IDENTITY_TOKEN_FILE
          value: /var/run/secrets/tokens/aws-token
        - name: AWS_ROLE_ARN
          value: arn:aws:iam::123456789012:role/payment-role
      volumeMounts:
        - mountPath: /var/run/secrets/tokens
          name: aws-token
  volumes:
    - name: aws-token
      projected:
        sources:
          - serviceAccountToken:
              audience: sts.amazonaws.com
              expirationSeconds: 3600      # 既定 1h / 最小 600s。環境により実測 exp が数秒ずれることがある
              path: aws-token
```

issuer と JWKS は次のコマンドで確認できます。外部クラウド IAM はこの JWKS を取得し、projected token の署名を検証します。

```bash
kubectl get --raw /.well-known/openid-configuration | jq .issuer
kubectl get --raw /openid/v1/jwks | jq .
```

### OPA / OpenFGA を PDP として配置する

白書は PEP(執行)と PDP(判定)の分離を MUST とします。ABAC には OPA、ReBAC には OpenFGA を採用するのが基本構成です。次は OpenFGA の最小 Deployment です。

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openfga
  namespace: authz
spec:
  replicas: 1
  selector:
    matchLabels:
      app: openfga
  template:
    metadata:
      labels:
        app: openfga
    spec:
      containers:
        - name: openfga
          image: openfga/openfga:v1.5.0
          args: ["run"]
          env:
            - name: OPENFGA_DATASTORE_ENGINE
              value: "postgres"
            - name: OPENFGA_DATASTORE_URI
              value: "postgres://openfga:password@postgres:5432/openfga"
          ports:
            - containerPort: 8080   # HTTP API
            - containerPort: 8081   # gRPC API
```

## 利用方法

### Workload API で SVID を取得する

SPIRE の Workload API は Unix domain socket 経由で提供され、**ワークロードは認証トークンなしで呼び出せます**(OS レベルの attestation で判定するためです)。次は Go SDK での取得例です([SPIFFE Go SDK](https://github.com/spiffe/go-spiffe) の最小サンプルをベースにした実装案です)。

```go
package main

import (
    "context"
    "log"

    "github.com/spiffe/go-spiffe/v2/workloadapi"
)

func main() {
    ctx := context.Background()

    // Workload API ソケットに接続(認証トークン不要)
    client, err := workloadapi.New(ctx,
        workloadapi.WithAddr("unix:///run/spire/sockets/agent.sock"),
    )
    if err != nil {
        log.Fatalf("workloadapi.New: %v", err)
    }
    defer client.Close()

    // X.509-SVID を取得(自動ローテーション対応)
    svid, err := client.FetchX509SVID(ctx)
    if err != nil {
        log.Fatalf("FetchX509SVID: %v", err)
    }
    log.Printf("SPIFFE ID: %s", svid.ID)
}
```

### RFC 8693 Token Exchange でクラウドへ橋渡しする

ワークロードが取得した JWT-SVID や Kubernetes SA projected token を、クラウドの STS で短命クラウド資格情報に交換します。GCP Workload Identity Federation は RFC 8693 に準拠しています。

```bash
# JWT-SVID または K8s SA token を GCP STS で交換(実装案)
curl -s -X POST "https://sts.googleapis.com/v1/token" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
    "audience": "//iam.googleapis.com/projects/PROJECT_NUM/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID",
    "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
    "subject_token": "'"${JWT_SVID}"'",
    "requested_token_type": "urn:ietf:params:oauth:token-type:access_token",
    "scope": "https://www.googleapis.com/auth/cloud-platform"
  }'
```

一方で AWS IRSA は、OIDC federation + AWS STS `AssumeRoleWithWebIdentity` による交換です。**RFC 8693 OAuth Token Exchange とは別仕様**(grant_type には準拠しない)なので、GCP STS のような RFC 8693 準拠の実装とは区別して扱います。

```bash
# AWS IRSA: K8s projected SA token を AWS STS で一時資格情報へ交換
aws sts assume-role-with-web-identity \
  --role-arn arn:aws:iam::123456789012:role/payment-role \
  --role-session-name payment-worker-session \
  --web-identity-token "$(cat /var/run/secrets/tokens/aws-token)" \
  --duration-seconds 3600
```

### PEP から PDP に認可を問い合わせる

OPA の Rego v1 では、旧構文の `allow { ... }` ではなく `allow if { ... }` を使います(`import rego.v1` は OPA 1.x で既定有効な v1 セマンティクスを明示宣言するプラクティスです)。

```rego
# policies/authz.rego
package payments.authz

import rego.v1

default allow := false

# subject の SPIFFE ID とリソース・アクションを照合(ABAC パターン)
allow if {
    spiffe_id := input.subject.spiffe_id
    input.action == "read"
    input.resource.type == "order"
    startswith(spiffe_id, "spiffe://example.org/payments/")
}

# 管理者ロールは write も許可
allow if {
    input.subject.role == "payments-admin"
    input.action in {"read", "write"}
    input.resource.type == "order"
}
```

ReBAC が必要な場合は OpenFGA の Check API を使います。

```bash
# Relationship Tuple を書き込む(payment-svc は order:123 の owner)
curl -s -X POST "http://openfga:8080/stores/${STORE_ID}/write" \
  -H "Content-Type: application/json" \
  -d '{"writes": {"tuple_keys": [{"user": "workload:spiffe://example.org/payments/payment-svc", "relation": "owner", "object": "order:123"}]}, "authorization_model_id": "'"${MODEL_ID}"'"}'

# Check: payment-svc は order:123 を viewer として見られるか
curl -s -X POST "http://openfga:8080/stores/${STORE_ID}/check" \
  -H "Content-Type: application/json" \
  -d '{"tuple_key": {"user": "workload:spiffe://example.org/payments/payment-svc", "relation": "viewer", "object": "order:123"}, "authorization_model_id": "'"${MODEL_ID}"'"}'
```

OPA と OpenFGA は次のように使い分けます。OPA は admission 制御・コンフィグ検証・文脈 ABAC(時刻・IP・ラベル条件)、OpenFGA はリソース個別の細粒度認可(「誰が何のオーナーか」「チーム所属」など関係グラフが必要なケース)に向きます。

### エージェントへ権限を委譲する

AI エージェントや自動ワークロードへの権限委譲は、RFC 8693 の **delegation** 意味論を使います(impersonation ではありません)。エージェントは自身の ID を保持しつつ本人(subject)を代理します。

```bash
# ユーザーの広いトークンを、エージェント専用の狭いスコープトークンへ交換
curl -s -X POST "https://sts.example.org/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange" \
  -d "subject_token=${USER_ACCESS_TOKEN}" \
  -d "subject_token_type=urn%3Aietf%3Aparams%3Aoauth%3Atoken-type%3Aaccess_token" \
  -d "actor_token=${AGENT_JWT_SVID}" \
  -d "actor_token_type=urn%3Aietf%3Aparams%3Aoauth%3Atoken-type%3Ajwt" \
  -d "scope=orders%3Aread" \
  -d "audience=payment-service"
```

発行される委譲トークンの JWT `act` claim にアクター(エージェント)が埋め込まれ、監査で「誰が実行したか」を追跡できます。

```json
{
  "sub": "user:alice",
  "act": { "sub": "spiffe://example.org/agents/order-agent" },
  "scope": "orders:read",
  "aud": "payment-service",
  "exp": 1800000000
}
```

ここで効かせたいのが**権限の上限保存(attenuation)**です。エージェントトークンの `scope` は必ず本人トークンの `scope` のサブセット以下にします。認可サーバーは token exchange 時にこの上限を強制し、親が持たないスコープは子に渡せません。ツール呼び出しごとに最小スコープのトークンへ交換すれば、各 hop の最小権限を保てます。

ワークロード間の mTLS は Istio で強制できます。

```yaml
# namespace 全体で mTLS STRICT を強制(SPIFFE ID ベース)
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: payments-strict-mtls
  namespace: payments
spec:
  mtls:
    mode: STRICT   # 平文トラフィックを拒否。PERMISSIVE は移行期のみ
```

ここで紛らわしいのが、証明書の SAN と `AuthorizationPolicy` の `principals` で表記が異なる点です。証明書の SAN は `spiffe://cluster.local/ns/<namespace>/sa/<serviceaccount>` 形式ですが、`source.principals` には **`spiffe://` を付けない** `cluster.local/ns/<namespace>/sa/<serviceaccount>` 形式を指定します。両者を取り違えると認可が一致しません。

## 運用

### SVID とトークンのローテーションを監視する

SPIRE は SVID を自動ローテーションしますが、ローテーション失敗(SPIRE Server 到達不能、registration entry 失効)は SVID の期限切れとして表面化します。Prometheus で期限切れ前にアラートを出します。

```yaml
# Prometheus alerting rule の例
- alert: SVIDExpiringSoon
  expr: (spire_agent_svid_expire_time - time()) < 300
  for: 1m
  labels:
    severity: warning
  annotations:
    summary: "SVID expiring in < 5 minutes"
```

K8s の bound ServiceAccount token は `kubernetes.io/service-account-token` 型の long-lived token が残存していないか定期的にスキャンします。PEP がキャッシュする JWT-SVID の `exp` を TTL と照合し、期限切れを PDP へ通すリスクも排除します。

### revocation を運用に組み込む

- **SVID 失効**: 侵害検知時は SPIRE Server で該当 registration entry を削除します。既発行 SVID は TTL の自然失効まで有効なため、**短命 SVID(推奨 TTL 1 時間以下)が revocation のタイムウィンドウを縮める**本質的な理由になります。
- **OAuth トークン失効**: RFC 7009 Token Revocation を実装し、PEP 側は Token Introspection(RFC 7662)または短命アクセストークン + リフレッシュトークンローテーションで対応します。
- **cascade revocation**: エージェント委任ツリーでは、親トークンを失効させると子(sub-agent)全体を atomic に失効できる仕組みを用意し、delegation receipt を append-only ログに書き込みます。

### JIT アクセスでスコープを絞る

特権操作は常時付与せず、申請 → 承認 → 一時払い出し → 自動回収のサイクルを自動化します。エージェントには per-tool で最小スコープのトークンを発行し、RFC 8693 の scope attenuation で上限保存を効かせます。client 側でも次のような二重チェックを入れておくと安全です(最終強制は AS/STS 側が行います)。

```python
# 付与 scope ⊆ 要求 scope ∩ 本人(subject)token の scope を確認する
granted_scopes = set(response["scope"].split())
requested_scopes = set(requested_scope.split())
subject_scopes = set(subject_token_scope.split())
allowed_upper_bound = requested_scopes & subject_scopes
assert granted_scopes.issubset(allowed_upper_bound), (
    f"Scope violation: granted={granted_scopes} exceeds upper bound={allowed_upper_bound}"
)
```

### 監査ログと NHI 棚卸し

監査ログは書き込みアカウントと読み取りアカウントを分離し、書き込み側に削除権限を与えません(S3 Object Lock / GCS バケットロック / Azure Immutable Blob)。必須フィールドは `subject`・`actor`・`action`・`resource`・`decision`・`timestamp`・`request_id` です。PDP の decision log は `input` と `result` を一緒に記録し、「なぜ許可/拒否されたか」を遡及可能にします。

非人間 ID(NHI)の棚卸しも欠かせません。OWASP NHI1「Improper Offboarding」は最重大リスクです。helm release 削除や Terraform destroy を検知したら、紐づく SPIRE registration entry と service account を自動削除する CI/CD フックを用意します。dev / staging / prod では同一クレデンシャルを再利用せず、環境ごとに trust domain を分離します(`spiffe://prod.example.com` と `spiffe://dev.example.com`)。

### エージェントの行動を可観測にする

各 tool 呼び出しに `trace_id`(W3C TraceContext)と `agent_id`(SPIFFE ID)を伝播し、「どのエージェントが何の tool をどの順で呼んだか」を分散トレースで可視化します。過去に実行したことのない API エンドポイント呼び出しでアラートを出し(behavioral baseline)、RFC 8693 の `act` クレームを全 hop で記録して委任連鎖を一本の trace で追えるようにします。

## ベストプラクティス

ここまでが白書の理想形ですが、実装では「入れれば解決する」という誤解に注意が必要です。3 つの典型的な誤解を、反証とともに整理します。

### 誤解1「SPIFFE を入れれば長命クレデンシャル問題が消える」

SPIFFE は「自分が制御する環境の workload-to-workload mTLS」に限定されます。SaaS(Snowflake / Salesforce / GitHub Actions)は SPIRE agent を持たず SVID を検証しないため、OAuth クライアントシークレットや API キーが残ります。VM 上のレガシーアプリは Workload API を呼べず、DBaaS は SVID を認証手段として受け付けません。さらに SPIRE の本番導入には 6〜24 か月と専任 1〜3 名が必要で、small team には過剰投資になりうると指摘されています [二次情報・競合ベンダー Aembit]。

**推奨**: SPIFFE/SVID を workload-to-workload の信頼基盤として採用しつつ、SaaS/DB/SSH/レガシーの長命クレデンシャルは Vault や Secrets Manager の自動ローテーションで並行管理します。OWASP NHI7(Long-Lived Secrets)を KPI 化し、90 日以上有効なクレデンシャル件数を可視化します。

### 誤解2「ABAC/ReBAC を入れれば認可が正しくなる」

ABAC は属性・ポリシー爆発で一貫管理が難しく、「なぜ拒否されたか」の逆引きが非自明で監査対応に追加投資が必要になります。ReBAC(OpenFGA)は tuple 同期パイプラインが必須で、キャッシュを有効化している場合は `MINIMIZE_LATENCY`(既定の consistency preference)で書き込み直後の変更が stale read になりえます。OSS 実装は Spanner/TrueTime を持たず、本家 Zanzibar 同等の外部一貫性は保証できません [二次情報・authzed / OpenFGA Discussion]。

**推奨**: ABAC は属性粒度でモジュール化し、CI で OPA の policy-test を必須化します。ReBAC は権限剥奪など critical な Check に `HIGHER_CONSISTENCY`、読み取り系に `MINIMIZE_LATENCY` と per-query 設計を文書化します。role/group を ReBAC、行レベル属性を ABAC で補完する hybrid を AuthZEN で PEP から抽象化すれば、将来のエンジン切り替えコストを下げられます。

### 誤解3「エージェントに最小権限を敷ける」

最も根が深いのがこれです。「権限を付与する時点で、エージェントが取りうる行動の集合は完全には不可知」という **design-time と runtime のミスマッチ**があります。エージェントは non-deterministic by design であり、従来 IAM が前提とする「キーボードの前の人間」モデルを破ります。multi-hop 委任が深くなると lineage 追跡が難しく、delegation receipt なしでは「誰が何の権限で行為したか」を事後に追えません。標準も乱立しており、IETF OAuth WG の AI エージェント向けドラフトは 5 本以上並走し、`draft-oauth-ai-agents-on-behalf-of-user-02` は Expired です [二次情報・Resilient Cyber]。

**推奨**: scope attenuation を必ず適用し、各 hop で最小スコープを保ちます。per-tool 短命トークンを発行して完了後に明示失効させます。design-time の最小権限で完全制御は不可能と認識し、action-level ログと異常検知で runtime の逸脱を早期発見します。侵害時に委任ツリー全体を atomic 失効できる cascade revocation を、設計段階で組み込んでおきます。

### OWASP NHI Top 10 を地図にする

OWASP「Non-Human Identities Top 10 (2025)」を、運用アクションへの対応表として使うと整理しやすくなります。

| 優先度 | NHI ID | 対応する運用アクション |
|---|---|---|
| 最優先 | NHI1 Improper Offboarding | 廃止トリガー自動化 / age-based review |
| 最優先 | NHI7 Long-Lived Secrets | SVID TTL 短縮 / Secrets Manager ローテーション |
| 高 | NHI2 Secret Leakage | pre-commit secret scan / SAST |
| 高 | NHI5 Overprivileged NHI | JIT アクセス / scope attenuation |
| 高 | NHI9 NHI Reuse | per-instance unique workload identity |
| 中 | NHI8 Environment Isolation | trust domain 分離 / 環境別 SPIRE Server |
| 中 | NHI10 Human Use of NHI | 人間は OIDC + MFA、SA は workload identity のみ |

## トラブルシューティング

### SVID 取得失敗(`permission denied` / `no registration entries found`)

まず registration entry と attestation の状態を確認します。

```bash
spire-server entry show -spiffeID spiffe://example.com/myservice
spire-agent healthcheck -socketPath /tmp/spire-agent/public/api.sock
kubectl logs -n spire daemonset/spire-agent | grep -i "attestation\|error\|denied"
```

| 原因 | 対処 |
|---|---|
| registration entry が存在しない | selector に一致する entry を `spire-server entry create` |
| selector がワークロードと不一致 | `spire-server agent show` で報告 selector を確認し entry を修正 |
| SPIRE Server に到達できない | Agent→Server の gRPC(8081)疎通を確認 |
| node attestation の失敗 | クラウドメタデータサービス到達可否 / IRSA・GKE WI 設定を確認 |

### JWT-SVID の `aud` 不一致(`invalid audience`)

`aud` は JWT-SVID 取得時に指定した値が埋め込まれます。送信側が `audience` に受信側の SPIFFE ID を正確に指定しているか確認します。複数 SPIFFE ID を `aud` に列挙する場合は、受信側が array 検証をサポートするか確認します。JWT-SVID 仕様は approved list(RS256/384/512・ES256/384/512・PS256/384/512)以外の `alg` を MUST reject するため、`alg:none` も当然対象です。JWT ライブラリの許可 `algorithms` を approved list に固定します。

### Token Exchange の scope 不足(`invalid_scope`)

| 原因 | 対処 |
|---|---|
| 元トークンが要求 scope を持っていない | 元トークンの `scope` を確認し上流の token 発行を修正 |
| AS が scope attenuation で縮退 | 仕様通り。縮退後スコープで機能が足りるか設計を見直す |
| `may_act` 不足 | `may_act` は委任を事前承認するオプション的クレーム(RFC 8693 §4.4)。無くても AS が許可することはあるが、`may_act` を要求する AS では拒否される |

### OpenFGA の stale tuple(ロール剥奪後も `allowed: true`)

権限剥奪など critical な Check は `HIGHER_CONSISTENCY` を必須にします。

```bash
curl -s -X POST https://openfga.example.com/stores/<store_id>/check \
  -H "Content-Type: application/json" \
  -d '{"tuple_key": {"user": "user:alice", "relation": "editor", "object": "document:123"}, "consistency": "HIGHER_CONSISTENCY"}' | jq '.allowed'
```

キャッシュを有効化している場合、既定の `MINIMIZE_LATENCY` では tuple 削除後も一定時間 `allowed: true` を返しえます(キャッシュ無効時は mode によらず強整合)。`ReadChanges` API で tuple 削除が記録されているかも検証します。

### Rego v0/v1 構文エラー(`rego_parse_error`)

```bash
opa version
opa check --v1-compatible policy.rego
```

| 症状 | 対処 |
|---|---|
| `future.keywords` が必要と言われる | `import future.keywords` を追加するか OPA v1 系へ移行 |
| 空 set の記法エラー | 空 set は必ず `set()` を使う(`{}` は object) |
| `every` / `in` / `contains` / `if` が未定義 | v0 環境なら `import future.keywords`、v1 なら `import rego.v1` |

## まとめ

CNCF Cloud Native IAM White Paper は、人間とワークロードと自動エージェントを同じ IAM 図に載せ、SPIFFE/SVID + internal access token の二層分離と ABAC/ReBAC + PEP/PDP で認証・認可を統一する骨子を、Basic/Advanced の 2 段で MUST/SHOULD として与えます。一方で、SPIFFE は SaaS やレガシーをカバーせず、ABAC/ReBAC は運用コストを伴い、エージェントの最小権限は design-time と runtime のミスマッチで未解決という限界も明確で、技術スタックを並べただけでは機能せず、監査・可観測性・組織運用が伴って初めて活きます。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！

## 参考リンク

### 公式・標準仕様

- [CNCF Cloud Native IAM White Paper](https://contribute.cncf.io/community/tags/security-and-compliance/publications/iam-whitepaper/)
- [RFC 2119 (MUST/SHOULD/MAY)](https://datatracker.ietf.org/doc/html/rfc2119)
- [RFC 8693 OAuth 2.0 Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693)
- [RFC 7009 OAuth 2.0 Token Revocation](https://datatracker.ietf.org/doc/html/rfc7009)
- [RFC 7662 OAuth 2.0 Token Introspection](https://datatracker.ietf.org/doc/html/rfc7662)
- [NIST SP 800-162 ABAC](https://csrc.nist.gov/pubs/sp/800/162/upd2/final)
- [NIST SP 800-63-4 Digital Identity Guidelines](https://pages.nist.gov/800-63-4/)
- [AuthZEN Authorization API 1.0](https://openid.github.io/authzen/)

### SPIFFE / SPIRE

- [SPIFFE Concepts](https://spiffe.io/docs/latest/spiffe-about/spiffe-concepts/)
- [SPIFFE-ID 仕様](https://github.com/spiffe/spiffe/blob/main/standards/SPIFFE-ID.md)
- [X.509-SVID 仕様](https://github.com/spiffe/spiffe/blob/main/standards/X509-SVID.md)
- [JWT-SVID 仕様](https://github.com/spiffe/spiffe/blob/main/standards/JWT-SVID.md)
- [SPIRE Concepts](https://spiffe.io/docs/latest/spire-about/spire-concepts/)
- [SPIFFE Go SDK](https://github.com/spiffe/go-spiffe)

### 認可エンジン

- [Open Policy Agent (CNCF Graduated)](https://www.openpolicyagent.org/docs)
- [OPA Rego v1 Migration](https://www.openpolicyagent.org/docs/latest/rego-v1/)
- [OpenFGA (CNCF Incubating)](https://openfga.dev/docs/concepts)
- [OpenFGA Query Consistency Modes](https://openfga.dev/docs/interacting/consistency)
- [Google Zanzibar 論文 (USENIX ATC 2019)](https://www.usenix.org/system/files/atc19-pang.pdf)

### クラウド / Kubernetes / Istio

- [Kubernetes ServiceAccount 設定](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/)
- [AWS EKS IRSA](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)
- [GCP Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [Azure AKS Workload Identity](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview)
- [Istio Security Concepts](https://istio.io/latest/docs/concepts/security/)

### 非人間 ID / エージェント認可

- [OWASP Non-Human Identities Top 10 (2025)](https://owasp.org/www-project-non-human-identities-top-10/)
- [CNCF Cloud Native Agentic Standards](https://www.cncf.io/blog/2026/03/23/cloud-native-agentic-standards/)
- [draft-mishra-oauth-agent-grants (DAAP)](https://datatracker.ietf.org/doc/draft-mishra-oauth-agent-grants/)
- [CVE-2021-27098 (SPIRE)](https://nvd.nist.gov/vuln/detail/CVE-2021-27098)
