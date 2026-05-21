---
title: "技術調査 - GitHub 内部リポジトリ不正アクセス事案 (2026-05)"
emoji: "🛡️"
type: "tech"
topics: ["GitHub", "Security", "SupplyChain", "VSCode", "DevSecOps"]
published: false
---

## 概要

2026-05-20、GitHub の CISO Alexis Wales は公式ブログで次の事案を公表しました。2026-05-18 に従業員 1 名の端末が、third party 製の poisoned VS Code 拡張機能で侵害されました。攻撃者は約 3,800 件の internal リポジトリを exfiltrate したと主張し、GitHub の内部調査もこの規模感と "directionally consistent"（方向性として一致する）と評価しています[^gh]。検知翌日にかけて、最重要 credential から優先的に rotation を進めたことも併せて発表されました[^gh]。顧客が GitHub 上で管理する org / repo へのアクセス痕跡は、現時点で検出されていません[^gh]。

| 項目 | 内容 |
|---|---|
| 検知日 | 2026-05-18 (Mon) |
| 公表日 | 2026-05-20 (Wed) |
| 起点 | 従業員 1 名の端末 |
| 侵害経路 | third party 製の poisoned VS Code 拡張機能 |
| 影響範囲 | GitHub-internal リポジトリへのアクセス、約 3,800 件 exfil の攻撃者主張と "directionally consistent" |
| 顧客データ | 現時点で被害未検出 |
| 主な対応 | critical secrets の rotation を最重要 credential から優先実施 |
| 未公表事項 | 拡張機能名 / publisher / 侵害経路の技術詳細 / 拡張機能の入手元 |

事案の本質は「サードパーティ製の VS Code 拡張機能が、開発者端末 1 台を経由して、組織の主要アセットに到達した」点にあります（入手元が VS Code Marketplace か Open VSX かは未公表）。特殊な APT ではなく、2024 年以降繰り返し観測されてきた publisher 乗っ取り型サプライチェーン攻撃の延長線上にある事案です。

タイミングは、AI コーディングエージェント（Claude Code / Cursor / Codex / Gemini CLI / Antigravity）と Model Context Protocol (MCP) サーバーが、組織開発のデフォルトに組み込まれ始めた時期と重なります。AI エージェントと MCP サーバーは、VS Code 拡張と配布チャネル・起動形態・権限モデルをほとんど共有します。今回の事案で露出した攻撃面は、VS Code 拡張固有のものではなく、「開発者端末でローカルにサードパーティコードを実行する仕組みすべて」が共有する構造的攻撃面です。

本記事は次のテーマを扱います。

- 公式声明から確定できる事実の整理
- VS Code 拡張 / MCP サーバー / AI エージェントが共有する攻撃面の多層モデル
- 攻撃面に対応する 5 つの防御カテゴリと具体的な設定例
- 「件数の派手さに反応しすぎない」「IDE を替えても解決しない」など反証視点

> 本記事では攻撃の再現手順 / PoC / 攻撃者ツール詳細は扱いません。被害と防御の構造に絞って整理します。

## 特徴

### 公式声明から確定する事実

| # | 項目 | 内容 |
|---|---|---|
| 1 | タイムライン | 2026-05-18 検知 → 同日〜翌日に critical secrets rotation 開始 → 2026-05-20 CISO 名義で公表 |
| 2 | 起点 | 単一従業員端末。enterprise-wide な認証基盤侵害ではない |
| 3 | 侵害経路 | third party 製の poisoned VS Code 拡張機能。拡張機能名・publisher・Marketplace か Open VSX かは未公表 |
| 4 | 影響規模 | 攻撃者主張: 約 3,800 件の internal repo exfil。GitHub 調査もその規模と "directionally consistent" |
| 5 | 顧客への影響 | 顧客が管理する org / repo / metadata への不正アクセス痕跡は現時点で未検出 |
| 6 | 内部 repo の内容 | support interaction の抜粋を含む可能性が言及（詳細内訳は未公表） |
| 7 | 初動対応 | 最重要 credential から優先 rotation。検知翌日にかけて夜通し作業 |
| 8 | フォローアップ | 詳細レポートは後日公開予定 |

### 業界事案からの構造的特徴

VS Code 拡張は本体プロセスと同等の権限で動きます。VS Code 公式の "Extension runtime security" は "The extension host has the same permissions as VS Code itself" と明記しています[^vsc]。ブラウザ拡張のような細粒度 permission モデルは存在しません。

インストールはユーザー権限ほぼフルアクセスと等価です。拡張機能は `fs` で任意ファイル読み書き、`child_process` で任意コマンド実行、任意ホストへの外向きネットワークが可能です[^vsc]。さらに、同 UID のプロセスとして OS Keychain やローカル設定ファイル（`~/.config/gh/hosts.yml` 等）へ素通しで到達できます。

publisher アカウント乗っ取りが 2025-2026 の主流手口です[二次情報]。Wiz の 2025-10 調査では、VS Code Marketplace / Open VSX 上の 500+ 拡張から 550+ の有効なシークレットが検出されたと報告されています[二次情報]。

Verified Publisher バッジは現在の安全性を保証しません。バッジが意味するのは「ドメイン所有権の確認」と「アカウント開設 6 ヶ月以上の良好実績」までです。当該 publisher の現在のセッション / PAT / CI トークンが侵害されていないことは保証範囲外です[^vsc-marketplace]。

その他の構造的特徴:

- CLI インストール (`code --install-extension`) は publisher 信頼確認 prompt を経由しません
- MITRE ATT&CK が 2025-03-30 に T1176.002 "IDE Extensions" を新設しました[^mitre]
- theme / icon 拡張も実行コードを持ちうる事例が確認されています（2025-02 Material Theme 系 Marketplace 削除）[二次情報]
- 既定で auto-update が有効なため、publisher 乗っ取り後の poisoned 更新を 1 回 push できれば、既存ユーザー全員に瞬時に届きます[二次情報]

### 既存攻撃面 (npm postinstall) との連続性

GitHub 事案を「VS Code 拡張という新規攻撃面」と位置づけると構造を見誤ります。配布チャネルが異なるだけで、被害の伝播メカニズムは npm `postinstall` 経由のサプライチェーン攻撃（2018 event-stream 以降）と同一です。

- 配布物の検証粒度は npm と同等以下です。Marketplace は publisher account + 署名のみで、コードの安全性は保証しません[^vsc-marketplace]
- MCP サーバーも同じ配布チャネルに乗ります。公式 MCP Registry はメタデータと namespace 所有権検証のみを提供し、コードの実体は npm / PyPI / Docker Hub に置かれます[^mcp-registry]
- AI エージェント tool call にも同じ構造があります。tool / MCP server / hook の追加は基本的にユーザーと同 UID で subprocess を起動します[^mcp-spec]
- 2025-2026 の npm 連続インシデント (Shai-Hulud worm / axios / @tanstack 全 42 パッケージ) と並行する流れにあります[二次情報]

つまり GitHub 事案は「新しい攻撃面の出現」ではなく、「ローカルで実行されるサードパーティコードに何を許すか」という既存課題が、AI エージェント / MCP / IDE 拡張という形で増殖した攻撃面に拡張されたことを示すマーカー事案です。

## 構造

### システムコンテキスト図

中央に置くのは Developer Endpoint ではなく、端末を経由して権限が伝播する組織アセットアクセス系全体です。Developer / Attacker / Org Admin の 3 アクターが、Marketplace / MCP Registry / SaaS API の 3 外部システムを介して同一端末に作用する点が、事案の出発点です。

```mermaid
graph LR
  Dev["Developer<br/>legitimate user"]
  Atk["Attacker<br/>compromised publisher"]
  Adm["Org Admin<br/>security ops"]
  IdP["Identity Provider<br/>Okta / Entra"]
  EDR["EDR Console<br/>Defender / CrowdStrike"]
  SCM["GitHub SCM"]
  EP["Developer Endpoint<br/>macOS or Windows"]
  MP["Extension Marketplace<br/>VS Code / Open VSX"]
  REG["MCP Registry<br/>npm / pypi / docker"]
  SaaS["SaaS APIs<br/>cloud / secrets"]

  Dev -->|daily use| EP
  Atk -->|poisoned update| MP
  Atk -->|poisoned package| REG
  MP -->|auto update| EP
  REG -->|npx install| EP
  EP -->|API call| SCM
  EP -->|API call| SaaS
  IdP -->|authn| EP
  IdP -->|authn| SCM
  EDR -->|telemetry from| EP
  Adm -->|policy| IdP
  Adm -->|policy| EDR
  Adm -->|policy| SCM
```

| 要素 | 説明 |
|---|---|
| Developer | 端末利用者、拡張機能を導入する主体。本事案では従業員 1 名の端末が起点 |
| Attacker | publisher アカウント乗っ取り、poisoned 配布物作成。publisher は未公表 |
| Org Admin | IdP / EDR / SCM のポリシー所有者。検知後の rotation を主導 |
| Identity Provider | 認証と device posture シグナル発信。Okta / Entra 想定 |
| EDR Console | 端末からのテレメトリ収集と検知。Defender / CrowdStrike |
| Developer Endpoint | IDE / 拡張 / MCP / Agent が同 UID で動く実行基盤。攻撃面の中心 |
| Extension Marketplace | VS Code Marketplace / Open VSX。拡張配布チャネル |
| MCP Registry | MCP メタデータと npm / pypi / docker hub の実体。AI 時代の追加配布チャネル |
| SaaS APIs | SCM / Cloud / Secret Manager の API。横展開先 |

### コンテナ図

C4 のコンテナ図を「攻撃が降りていく層」に読み替えます。L1 から L5 へ向かって権限が連鎖し、各層の弱点が組み合わさって事案を成立させました。

```mermaid
graph TD
  L1["L1 Marketplace Layer<br/>VS Code Marketplace<br/>Open VSX / npm / pypi"]
  L2["L2 Execution Layer<br/>Extension Host<br/>MCP Server / Agent CLI"]
  L3["L3 Local Process Layer<br/>fs / child_process<br/>Secret Storage"]
  L4["L4 Credential Layer<br/>dotfile / Keychain<br/>env var"]
  L5["L5 Organizational Asset<br/>SCM / Cloud<br/>Secret Manager"]

  L1 -->|poisoned update| L2
  L2 -->|same UID| L3
  L3 -->|read plaintext| L4
  L4 -->|long-lived token| L5
```

| 層 | 含まれるもの | 攻撃者が得るもの | 主な弱点 |
|---|---|---|---|
| L1 Marketplace | VS Code MP / Open VSX / npm / pypi / docker hub / MCP Registry メタデータ | 正規 publisher 名義での配信権 | publisher 乗っ取り、Verified バッジの限界、npm postinstall の任意実行 |
| L2 Execution | Extension Host / MCP server subprocess / AI agent CLI | VS Code 本体と同一 UID の Node.js full process | 細粒度 permission の不在、MCP tool annotation のサーバ側嘘、model-controlled tool |
| L3 Local Process | fs / child_process / Secret Storage API / Webview / OS Keychain | ユーザ権限での任意プロセス起動、平文ファイル読み取り | 同 UID プロセスは Keychain や dotfile を素通しで読める |
| L4 Credential | `~/.config/gh/hosts.yml` / `~/.npmrc` / `~/.aws/credentials` / `~/.ssh/id_*` / env var | 長寿命 PAT / SSH 鍵 / API key | classic PAT の org 全体スコープ、long-lived、SSO 強制の弱さ |
| L5 Organizational Asset | GitHub SCM API / Cloud control plane / Secret Manager / 顧客データ | repo 一括 clone、CI secret 読み取り、サービス横展開 | 3,800 件規模の mass clone が anomaly detection で止まらなかった |

### コンポーネント図

各防御カテゴリ (D1 - D5) を C4 のコンポーネント層に置き、L1 - L5 のどこに効くかを線で示します。1 つの防御で複数層をカバーする設計と、層ごとに別の防御を重ねる多段設計の両方を読み取れます。

```mermaid
graph LR
  D1["D1 Allowlist<br/>extensions.allowed<br/>ADMX"]
  D2["D2 EDR Custom Rules<br/>Defender KQL<br/>macOS ESF"]
  D3["D3 Secret Brokering<br/>1Password CLI<br/>Vault Agent / OIDC"]
  D4["D4 Min-priv Posture<br/>Fine-grained PAT<br/>Device Assurance"]
  D5["D5 Blast Radius<br/>Codespaces<br/>Cloud Workstation"]

  L1["L1 Marketplace"]
  L2["L2 Execution"]
  L3["L3 Local Process"]
  L4["L4 Credential"]
  L5["L5 Org Asset"]

  D1 --> L1
  D1 --> L2
  D2 --> L2
  D2 --> L3
  D3 --> L4
  D4 --> L4
  D4 --> L5
  D5 --> L3
  D5 --> L4
  D5 --> L5
```

| 防御 | 代表製品 / 機能 | 主な設定キー | 効く層 | 制限と注意 |
|---|---|---|---|---|
| D1 Allowlist | VS Code 1.96 plus / Windows ADMX | `extensions.allowed`, `AllowedExtensions` Group Policy | L1, L2 | 申請オーバーヘッドで shadow IT を招きやすい |
| D2 EDR Custom Rules | Defender Advanced Hunting / CrowdStrike Falcon / macOS ESF | KQL `DeviceFileEvents` for `~/.vscode/extensions/`, ESF `ES_EVENT_TYPE_NOTIFY_OPEN` | L2, L3 | 素の EDR は開発端末で誤検知量産 |
| D3 Secret Brokering | 1Password CLI / Vault Agent / GitHub Actions OIDC / Doppler | `op://vault/item/field`, Vault dynamic secrets TTL 1h, OIDC `id-token: write` | L4 | env と broker 化の両輪が必要 |
| D4 Min-priv Posture | Fine-grained PAT / GitHub App installation token / SSO / Okta Device Assurance / Cloudflare Access | repo selection, 60min token TTL, device posture AND identity claim | L4, L5 | Cloudflare Access のポスチャ評価は 5 分キャッシュ |
| D5 Blast Radius | Codespaces / Cloud Workstations / Coder / Gitpod | machine type 制限, IP allow list, VPC Service Controls | L3, L4, L5 | レイテンシで開発者が離反、可用性事案あり |

## データ

### 概念モデル

サプライチェーン攻撃を構成する登場概念とその関係を、関係マップとして示します。

```mermaid
graph LR
  Publisher["Publisher<br/>発行者"]
  Extension["Extension<br/>拡張/MCP/Agent"]
  Marketplace["Marketplace<br/>配布チャネル"]
  DeveloperEndpoint["DeveloperEndpoint<br/>開発端末"]
  Credential["Credential<br/>認証情報"]
  Asset["Asset<br/>保護対象"]
  Attacker["Attacker<br/>侵害主体"]
  Mitigation["Mitigation<br/>対策カテゴリ"]

  Publisher -- publishes --> Extension
  Extension -- distributed_via --> Marketplace
  Marketplace -- delivers --> DeveloperEndpoint
  DeveloperEndpoint -- installs --> Extension
  DeveloperEndpoint -- stores --> Credential
  Credential -- grants_access_to --> Asset
  Attacker -- steals --> Credential
  Attacker -- compromises --> Publisher
  Attacker -- poisons --> Extension
  Extension -- runs_on --> DeveloperEndpoint
  Extension -- reads --> Credential
  Mitigation -- protects --> DeveloperEndpoint
  Mitigation -- restricts --> Extension
  Mitigation -- shortens_ttl_of --> Credential
  Mitigation -- limits_blast_radius_of --> Asset
```

| 概念 | 説明 |
|---|---|
| Publisher | Marketplace に Extension を発行する主体。VS Code は publisher アカウント、npm は maintainer、MCP Registry は reverse-DNS namespace 所有者 |
| Extension | 開発者端末上で実行されるサードパーティコード。VS Code 拡張 / MCP サーバ / AI エージェントツールを総称 |
| Marketplace | Extension を集約・配信するチャネル。VS Code Marketplace / Open VSX / npm / PyPI / Docker Hub / MCP Registry |
| DeveloperEndpoint | 開発者本人が利用する物理・仮想端末。Extension は本端末のユーザーと同 UID で動く |
| Credential | 端末上に保管される認証情報。長寿命 PAT / SSH 鍵 / API キー / OAuth refresh token |
| Asset | 認証情報で到達される最終的な保護対象。本事案では GitHub internal リポジトリ約 3,800 件 |
| Attacker | 上記を狙う攻撃主体。本事案では publisher 未確定 |
| Mitigation | 攻撃連鎖を断つ対策カテゴリ。Allowlist / EDR / Credential Broker / Device Posture / Blast Radius 限定 |

関係の読み方:

- Attacker は Publisher を compromise することで、正規 Extension の poisoned 更新を Marketplace に publish します
- Marketplace は Extension を DeveloperEndpoint に delivers（auto-update が前提）します
- Extension は DeveloperEndpoint 上で runs_on し、同 UID で Credential を reads します
- Credential は Asset への grants_access_to を持つため、Credential 漏洩 = Asset 漏洩に直結します
- Mitigation は 4 ノード（Endpoint / Extension / Credential / Asset）に別々の制約をかけ、単一突破点で全部抜かれない構造を作ります

### 情報モデル

組織が「拡張機能 / MCP サーバ / AI エージェントツール / 認証情報 / 端末 / アクセス権」をサプライチェーン台帳として管理するためのエンティティ群です。本モデルは「侵害発生時に Blast Radius を 1 枚絵で評価できる」「平時に rotation / audit の対象を漏れなく列挙できる」ことを目的とします。

```mermaid
classDiagram
  class ExtensionInventory {
    +id : string
    +publisher_id : string
    +name : string
    +version : string
    +marketplace : enum
    +allowlisted : bool
    +verified_publisher : bool
    +signature_verified : bool
    +last_audit : datetime
    +risk_score : int
    +secrets_accessed : list~SecretRef~
    +installed_devices : int
    +mitre_tags : list~string~
  }
  class McpServerInventory {
    +id : string
    +name : string
    +transport : enum
    +source_registry : enum
    +package_ref : string
    +allowlisted : bool
    +permissions : list~string~
    +owner_team : string
    +last_audit : datetime
    +tool_descriptions_hash : string
    +network_egress_policy : string
  }
  class AgentToolInventory {
    +id : string
    +vendor : enum
    +product : string
    +version : string
    +sandbox_mode : enum
    +credential_proxy_used : bool
    +allow_managed_only : bool
    +bypass_disabled : bool
    +tool_allow_rules : list~string~
    +tool_deny_rules : list~string~
    +last_policy_review : datetime
  }
  class Publisher {
    +id : string
    +display_name : string
    +marketplace : enum
    +verified : bool
    +verified_since : date
    +domain_proof : string
    +last_known_compromise : datetime
    +contact : string
  }
  class CredentialInventory {
    +id : string
    +type : enum
    +owner_principal : string
    +ttl_seconds : int
    +storage_method : enum
    +scope : string
    +last_rotated : datetime
    +next_rotation_due : datetime
    +broker_managed : bool
    +long_lived : bool
  }
  class DeviceInventory {
    +id : string
    +owner : string
    +os : string
    +edr_agent : string
    +posture_score : int
    +allowed_tools : list~string~
    +last_attestation : datetime
    +cloud_workstation : bool
  }
  class AccessGrant {
    +id : string
    +principal : string
    +asset_ref : string
    +permission : enum
    +expires_at : datetime
    +granted_via_credential : string
    +sso_enforced : bool
    +device_posture_required : bool
  }
  class SecretRef {
    +id : string
    +path : string
    +secret_type : enum
    +sensitivity : enum
  }
  class Asset {
    +id : string
    +type : enum
    +classification : enum
    +owner_team : string
  }
  ExtensionInventory --> Publisher : published_by
  ExtensionInventory ..> SecretRef : may_access
  ExtensionInventory --> DeviceInventory : installed_on
  McpServerInventory --> Publisher : published_by
  McpServerInventory ..> CredentialInventory : consumes
  McpServerInventory --> AgentToolInventory : invoked_from
  AgentToolInventory --> DeviceInventory : runs_on
  AgentToolInventory ..> McpServerInventory : registers
  CredentialInventory --> DeviceInventory : stored_on
  CredentialInventory ..> AccessGrant : authorizes
  AccessGrant --> Asset : grants_to
  AccessGrant --> CredentialInventory : backed_by
  DeviceInventory ..> AccessGrant : posture_gates
  SecretRef --> CredentialInventory : refers_to
```

主なエンティティの位置付け:

| エンティティ | 役割 |
|---|---|
| ExtensionInventory | VS Code / IDE 拡張機能の台帳。`secrets_accessed` で「この拡張が読み得るシークレット」を可視化 |
| McpServerInventory | MCP サーバの台帳。`tool_descriptions_hash` を毎セッション照合し rug pull を検知 |
| AgentToolInventory | AI コーディングエージェント本体の台帳。`tool_allow_rules` / `tool_deny_rules` で permission を一元化 |
| Publisher | 発行者の台帳。`verified_since` と `last_known_compromise` で publisher 履歴を追跡 |
| CredentialInventory | 認証情報の台帳。`long_lived = true` の行を限りなく減らすことが事案最大の教訓 |
| DeviceInventory | 端末の台帳。`posture_score` で「この端末で実行可能なツール」を制御 |
| AccessGrant | アクセス権の台帳。`device_posture_required = true` を必須化し、credential 単独流出を Blast Radius 限定に変換 |
| SecretRef / Asset | 参照型。SecretRef は path と sensitivity、Asset は type / classification / owner_team |

台帳運用の要点を整理します。

1. 3 つの Inventory（Extension / McpServer / AgentTool）を 1 つのサプライチェーン台帳に統合します
2. `CredentialInventory.long_lived = true` の行をゼロに近づけます
3. `AccessGrant.device_posture_required = true` を必須にします
4. `McpServerInventory.tool_descriptions_hash` を毎セッション再評価します
5. `ExtensionInventory.secrets_accessed` を静的解析と EDR telemetry から自動更新し `risk_score` の主入力にします

## 構築方法

### VS Code Allowlist 導入

`extensions.allowed` をワークスペース / ユーザー / マシンレベルの `settings.json` に書きます。MDM (Jamf / Intune) で配布する想定です。

```jsonc
// settings.json
{
  "extensions.allowed": {
    "*": false,
    "ms-python.python": true,
    "ms-vscode.cpptools": true,
    "github.copilot": true,
    "github.vscode-pull-request-github": true,
    "esbenp.prettier-vscode": ["10.1.0", "11.0.0"],
    "dbaeumer.vscode-eslint": ["2.4.4"],
    "some.suspect-extension": "stop"
  },
  "extensions.autoUpdate": false,
  "extensions.autoCheckUpdates": false
}
```

値の意味は次の通りです。

| 値 | 意味 |
|---|---|
| `true` / `false` | 全バージョン許可 / 拒否 |
| `"x.y.z"` | 単一バージョンのみ許可 |
| `["x.y.z", "a.b.c"]` | 列挙した version のみ許可 |
| `"stop"` | 既にインストール済みでもロード停止 |
| `"*": false` | 既定全拒否 |

Windows ADMX (Group Policy) では `Allowed Extensions` / `Update Mode: none` / `Enable Extension Marketplace: Disabled` を組み合わせます。

```bash
# 端末上で適用状況確認
code --list-extensions --show-versions
code --status
```

### Fine-grained PAT 発行と SSO Enforce

Organization 側の事前設定（admin 操作）:

1. `Organization → Settings → Third-party Access → Personal access tokens`
2. Allow access via fine-grained PAT を ON
3. Require administrator approval を ON
4. Restrict access via classic PAT で classic を Deny
5. `Authentication security → SAML single sign-on` を Required に
6. Enterprise plan の場合は `Settings → Authentication security → IP allow list` に CIDR を登録

Fine-grained PAT の発行手順（利用者）:

- Token name: 用途を書く（例 `local-dev-repo-foo-20260520`）
- Expiration: 実装案では 30 日固定を推奨
- Resource owner: 対象 org を選択
- Repository access: `Only select repositories` を選び、必要な repo だけ列挙
- Permissions: 必要最小限（例 `Contents: Read-only`, `Metadata: Read-only`）

### 1Password CLI による secret 注入

```dotenv
# Before (commit したら漏れる)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_ACCESS_KEY_ID=AKIAEXAMPLE

# After (commit して OK)
GITHUB_TOKEN=op://Dev/GitHub-PAT/token
AWS_ACCESS_KEY_ID=op://Dev/AWS-Dev/access_key_id
AWS_SECRET_ACCESS_KEY=op://Dev/AWS-Dev/secret_access_key
```

```bash
op run --env-file=.env -- gh repo list
op run --env-file=.env -- aws s3 ls
op run --env-file=.env -- npm publish
```

1Password Desktop App → `Settings → Developer → Integrate with 1Password CLI` を ON にすると、CLI 認可時に Touch ID prompt が出ます。悪性プロセスがバックグラウンドで秘密を抜く挙動を物理タッチで止められる点が本質です。

### GitHub Actions OIDC 連携（AWS の例）

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

IAM Role の Trust Policy で `sub` を repo + branch に固定します。

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike":   { "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:ref:refs/heads/main" }
    }
  }]
}
```

```yaml
# .github/workflows/deploy.yml
name: deploy
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
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-deploy
          aws-region: ap-northeast-1
      - run: aws sts get-caller-identity
```

repo / branch に紐付いた約 1 時間の短命 STS credential が発行され、長寿命 AWS access key を Secrets に置く必要が消えます。GCP / Azure も同様のパターンで実装できます。

### MCP サーバー allowlist（Claude Code）

managed-settings（MDM 配布）を `/Library/Application Support/ClaudeCode/managed-settings.json` (macOS) または `C:\ProgramData\ClaudeCode\managed-settings.json` (Windows) に置きます。

```jsonc
{
  "enableAllProjectMcpServers": false,
  "enabledMcpjsonServers": [],
  "disabledMcpjsonServers": ["*"],
  "permissions": {
    "defaultMode": "default",
    "allow": [
      "Read", "Edit",
      "Bash(git status:*)", "Bash(git diff:*)", "Bash(npm test:*)",
      "mcp__github__*"
    ],
    "deny": [
      "Bash(curl:*)", "Bash(wget:*)", "Bash(rm -rf:*)",
      "Read(./.env)", "Read(./.env.*)", "Read(./secrets/**)",
      "Read(//Users/*/.aws/**)", "Read(//Users/*/.ssh/**)", "Read(//Users/*/.config/gh/**)"
    ],
    "ask": [ "Bash(git push:*)", "Write" ]
  }
}
```

設定のポイント:

- `permissions.allow` / `deny` / `ask` でツール単位の制御。`deny` が最優先
- ファイルパス glob で読み取り禁止を表現
- `Bash(...:*)` でコマンドプレフィックスマッチ
- managed-settings に書けば user / project settings で上書き不可

## 利用方法

### 新規拡張機能の導入リクエストフロー

1. 申請: 開発者が社内チケットを起票。publisher / extension ID / 希望バージョン / 用途 / 代替品検討の有無を記載
2. publisher 検証: Marketplace で Verified / GitHub repo / 更新頻度 / typosquatting 疑い（例 `mircosoft`）を確認
3. コードレベル審査を Risk Tier に応じて実施
4. allowlist 追加: `extensions.allowed` に entry を追加。バージョン固定を推奨
5. 配布通知
6. 月次で「直近インストール済み拡張 × CVE / 脆弱性報告」を突合

| Risk Tier | 対象 | 審査内容 |
|---|---|---|
| Tier A | 公式 Microsoft / GitHub / npm 公式 publisher | publisher 検証のみ |
| Tier B | Verified 第三者 | VSIX を展開、`extension.js` の suspicious API call (`child_process`, 未知ホストへの `node-fetch`) を grep |
| Tier C | Unverified | 原則拒否。要件があれば Codespaces / Cloud Workstation 隔離環境のみ |

事案教訓は次の通りです。poisoned 拡張は「既に許可済み拡張の改竄バージョン」として配信されたケースが多いです。バージョン固定と `extensions.autoUpdate: false` をセットで適用するのが本質です。

### 新規 MCP サーバーの導入リクエストフロー

1. 申請: MCP サーバー名、リポジトリ URL、提供ツール一覧、認証方式、依存 secrets
2. 権限境界レビュー: ローカルファイル read / write スコープ、外部 HTTP egress 先、secrets の取得経路
3. 動作確認: 検証端末で `claude mcp add` → `claude mcp list` → 実トリガーで挙動確認
4. managed-settings 反映 → MDM 配布
5. 記録: MCP サーバー台帳に承認 SHA / レビュアー / 有効期限（6 ヶ月）
6. 6 ヶ月で再レビュー

### PAT 発行依頼フロー

Classic PAT を全面禁止し、Fine-grained PAT のみ許可します。

1. 申請: 用途、対象 org / repo (list)、必要 permission、有効期限（最大 30 日推奨）
2. 代替検討: `gh auth login --web`（短命 OAuth） / GitHub App installation token（60 分） / OIDC
3. 発行 → admin が approve
4. 保管: 発行直後に 1Password の Vault に保存。ローカルファイル / Slack DM / メモアプリを全面禁止
5. 利用: `op run --env-file .env -- <command>` で都度 inject
6. 失効: 用途完了直後に手動失効

### シークレットローテーション運用

1Password Vault を真実のソースに据え、定期 rotation を実施します。

| 対象 | 推奨 TTL |
|---|---|
| GitHub PAT (fine-grained) | 30 日 |
| GitHub App private key | 90 日 |
| npm publish token | 90 日 |
| クラウド長寿命 key (AWS / GCP / Azure) | そもそも持たない (OIDC へ移行)。例外は 90 日 |
| SSH key | 180 日 |

緊急ローテーション（漏洩疑い時）は 1 時間以内に全 secret を回す手順を runbook 化します。

### インシデント発生時の端末隔離手順

GitHub が実際に行った対応をテンプレ化したものです。

Phase 1（即時隔離・5 分以内）: EDR で device isolate / 全 session revoke / MFA 強制リセット

Phase 2（認証情報 rotate・1 時間以内）:

```bash
# GitHub PAT 全 revoke (該当 user)
for token_id in $(gh api /user/tokens --jq '.[].id'); do
  gh api -X DELETE /user/tokens/$token_id
done
```

Phase 3（影響範囲調査・24 時間以内）: GitHub audit log と EDR timeline で行動を再構成し、読み取られた可能性のあるファイル一覧を抽出します。

Phase 4（復旧）: 端末再 image 化 / 新規 credential 配布 / runbook 更新を実施します。

## 運用

### EDR の開発端末特化ルール

汎用 EDR は Office + メール端末を前提に最適化されています。開発端末では `git clone` の連打や `node.exe` の長時間外向き通信が「正常ノイズ」として処理されがちです。Custom Detection rule で開発端末専用のシグナルを足します。

`~/.vscode/extensions/` への IDE 外書き込みを検知します。

```kql
DeviceFileEvents
| where Timestamp > ago(1d)
| where ActionType in ("FileCreated", "FileModified", "FileRenamed")
| where FolderPath has_any (@"\.vscode\extensions\", @"/.vscode/extensions/",
                            @"\.vscode-insiders\extensions\", @"\.cursor\extensions\")
| where InitiatingProcessFileName !in~ ("Code.exe", "Code - Insiders.exe", "cursor.exe",
                                       "windsurf.exe", "code", "cursor")
| where FileName endswith ".vsix" or FileName == "package.json" or FileName endswith ".js"
| project Timestamp, DeviceName, InitiatingProcessAccountName, InitiatingProcessFileName,
          InitiatingProcessCommandLine, FolderPath, FileName, SHA256
```

`~/.config/gh/hosts.yml` を `gh` 以外が読む挙動を検知します。

```kql
DeviceFileEvents
| where Timestamp > ago(1d)
| where ActionType == "FileOpened" or ActionType == "FileCreated"
| where FileName == "hosts.yml"
| where FolderPath has_any (@"\.config\gh\", @"/.config/gh/")
| where InitiatingProcessFileName !in~ ("gh.exe", "gh")
| project Timestamp, DeviceName, InitiatingProcessAccountName, InitiatingProcessFileName,
          InitiatingProcessCommandLine, FolderPath, InitiatingProcessParentFileName
```

同じパターンを `~/.aws/credentials` / `~/.ssh/id_*` / `~/.npmrc` / `~/.docker/config.json` に適用します。

`git clone` の異常頻度を検知します。

```kql
DeviceProcessEvents
| where Timestamp > ago(7d)
| where FileName in~ ("git", "git.exe")
| where ProcessCommandLine has "clone"
| summarize CloneCount = count() by DeviceName, bin(Timestamp, 10m)
| where CloneCount >= 30
| order by CloneCount desc
```

`node.exe` / `Code.exe` の未知ホストへの egress を検知します。

```kql
DeviceNetworkEvents
| where Timestamp > ago(1d)
| where InitiatingProcessFileName in~ ("node.exe", "Code.exe", "cursor.exe", "electron", "node", "code")
| where RemoteIPType == "Public"
| where not(RemoteUrl has_any ("github.com", "githubusercontent.com", "vscode-cdn.net",
                              "anthropic.com", "openai.com", "marketplace.visualstudio.com",
                              "npmjs.org", "registry.npmjs.org", "openvsx.org"))
| summarize Connections = count(), DistinctIPs = dcount(RemoteIP)
        by DeviceName, RemoteUrl, RemotePort, InitiatingProcessFileName
| where Connections > 100
| order by Connections desc
```

完成形は「Advanced Hunting で 30〜90 日チューニング → Custom Detection rule に昇格 → Automated Investigation & Response で端末隔離 + ユーザー session revoke」です。

### macOS Endpoint Security Framework (ESF) 検知例

開発端末で sub する価値が高いイベントは以下です。

| イベント | 目的 | 開発端末での具体例 |
|---|---|---|
| `ES_EVENT_TYPE_NOTIFY_OPEN` | 機密ファイルアクセスの可観測化 | `~/.aws/credentials`, `~/.ssh/id_*`, `~/.config/gh/hosts.yml`, `~/.npmrc`, `~/.docker/config.json` |
| `ES_EVENT_TYPE_NOTIFY_EXEC` | 拡張からの shell injection 検知 | `Electron` / `Code Helper` 子プロセスから `osascript` / `curl` / `bash -c` |
| `ES_EVENT_TYPE_NOTIFY_BTM_LAUNCH_ITEM_ADD` | 永続化検知 | LaunchAgent / LaunchDaemon / Login Item / SMAppService 登録 |
| `ES_EVENT_TYPE_AUTH_MOUNT` | DMG mount を blocking で評価 | 未署名 DMG / `.pkg` の install 試行 |
| `ES_EVENT_TYPE_NOTIFY_KEXTLOAD` | kext / system extension load | 未知 kext の動的ロード |

### Blast Radius シミュレーション運用（月次）

「自分の端末が今 fully compromised になったら、何分で何が抜かれるか」を月次で測定する Tabletop / Live Fire 演習です。1 回 90 分目安で実施します。

| Phase | 時間 | 内容 |
|---|---|---|
| Phase 0 前提宣言 | 5 min | 攻撃者が user セッション権限を完全に得た想定で開始 |
| Phase 1 機密インベントリ | 15 min | 端末上の credential / cookies / config を grep |
| Phase 2 SCM scope 確認 | 15 min | 各 PAT で触れる repo 件数を実測 |
| Phase 3 Exfil simulation | 30 min | `gh repo clone` を並列実行。SIEM alert / 端末隔離まで何分かを測定 |
| Phase 4 Detection gap | 15 min | EDR / Audit Log / SAML session revoke の遅延を記録 |
| Phase 5 Remediation log | 10 min | 改善 TODO を 1 つだけ commit |

KPI 例:

- MTTD（Mean Time To Detect）: 異常 clone 開始から alert 発火まで（目標 < 15 min）
- MTTC（Mean Time To Contain）: alert から端末隔離 / session revoke まで（目標 < 30 min）
- Reachable Repo Count: 単一 PAT で `repos.list` が返す件数

## ベストプラクティス

反証を統合した「過信しないバージョン」のチェックリストです。重要度順（上から順に投資対効果が高い）に並べます。

### B-1. 長寿命 PAT の駆逐（最優先）

- [ ] `gh auth login` のデフォルトを Fine-grained PAT に組織ポリシーで強制する
- [ ] org の Personal Access Token policy で maximum lifetime ≤ 90 days を設定する
- [ ] 自動化 / bot は GitHub App installation token (60 min TTL) に全面移行する
- [ ] CI の長寿命 secret は GitHub Actions OIDC で全廃する
- [ ] 既存 classic PAT を audit-log で棚卸しし、四半期ごとに残数を 0 に近づける

過信を避ける視点: PAT 化を完了しても npm / pip / git hooks / Makefile 経由の任意コード実行リスクは消えません。

### B-2. 拡張機能 + MCP サーバー + AI Agent の統合台帳

- [ ] VS Code / Cursor / JetBrains / Claude Code / Cline 等の拡張・MCP・agent を 1 つの台帳に統合する
- [ ] 拡張 marketplace ごとに「許可 publisher 一覧」を定義する
- [ ] MCP サーバーは `permissions.json` で tool 単位の allow / deny を組織配布する
- [ ] AI agent の auto-approve は最も厳しい agent (Claude Code) の permissions に揃える

過信を避ける視点: IDE を VS Code から JetBrains に替えても、同種の脆弱性面は残ります（JetBrains GitHub Plugin CVE-2024-37051）。

### B-3. 拡張機能 Allowlist（monitor → enforce の 2 段階）

- [ ] 第 1 フェーズ: monitor mode で 4〜8 週間、実態を棚卸しする
- [ ] 第 2 フェーズ: 利用 ≥ 10% かつ publisher 信頼できる拡張を allow に追加する
- [ ] 第 3 フェーズ: enforce 化、新規追加は申請フォーム化する
- [ ] 申請承認 SLA を business hours 4 時間以内に明文化する

過信を避ける視点: 承認オーバーヘッドが Shadow IT を生みます。SLA を守れない組織は Allowlist を導入しない方が安全な場合があります。

### B-4. EDR の開発端末特化ルール

- [ ] 上記運用セクションの KQL を Custom Detection に昇格する
- [ ] macOS は ESF ベースの EDR を必須化する
- [ ] 誤検知率 ≤ 5% を維持できる閾値に四半期ごとにチューニングする
- [ ] 月 1 回の Tuning Review で発火しなかった rule を retire する

過信を避ける視点: 「CrowdStrike / Defender を入れた」だけでは安全になりません。

### B-5. Fine-grained PAT による repo scope 絞り

- [ ] 個人 PAT は repository selection で必要 repo のみに絞る
- [ ] 組織で Fine-grained PAT の許可ポリシーを ON にする
- [ ] SAML SSO Enforced + IP allow list (Enterprise plan) を組み合わせる

過信を避ける視点: Fine-grained PAT は一部 API でカバレッジが古い classic PAT に劣ります。代替できない API は classic + SSO Enforce + 短命化で凌ぎます。

### B-6. Blast Radius シミュレーション（月次）

- [ ] 上記運用セクションのフォーマットで月 1 回実施する
- [ ] 演習結果から 1 つだけ remediation を必ず commit する
- [ ] MTTD / MTTC / Reachable Repo Count を経時グラフ化する

過信を避ける視点: 件数を damage proxy にしないようにします。Reachable Repo Count は BIA tier weight 付きで評価します。

### B-7. Cloud Workstation の段階移行

- [ ] Phase 1: 新規 onboarding 開発者のみ Cloud Workstation 標準化
- [ ] Phase 2: 機密度が高い repo (BIA tier 1) のみローカル禁止、Cloud Workstation 必須
- [ ] Phase 3: 既存全開発者を段階移行（12〜24 ヶ月）

過信を避ける視点: 2026-02 の Codespaces 6 時間グローバル停止のような事象は再発します。ローカル開発を完全廃止せず、Cloud / ローカルのハイブリッド + ポスチャ強制が現実解です。

### 適用条件サマリ

| ベストプラクティス | 適用条件 | 適用してはいけないケース |
|---|---|---|
| B-1 PAT 駆逐 | 全組織 | なし |
| B-2 台帳統合 | 全組織 | なし |
| B-3 Allowlist | 申請 SLA を守れる SecOps 体制 | SLA < 4h を守れない組織 |
| B-4 EDR 特化 | Custom Detection を 1 人月 / 四半期で書ける | 書ける人材がいない |
| B-5 Fine-grained PAT | GitHub Enterprise Cloud | GHE Server 古いバージョン |
| B-6 演習 | 1 人月 / 月の SecOps 余裕 | 兼任 SecOps 単独運用 |
| B-7 Cloud WS | 機密度 tier 1 から段階 | 全業務一括移行 |

## トラブルシューティング

### T-1. 拡張機能 Allowlist で開発者から反発が出る

症状: enforce 直後に「使えなくなった拡張がある」「申請が遅い」「結局 Cursor / 私物端末で開発する」という不満が噴出し、Slack の `#dev-tools` が炎上します。

原因: monitor 期間を取らずに enforce 化、申請 SLA が未定義、申請フローが多段承認になっていることです。

解決策:

1. monitor → enforce の 2 段階を踏みます。最低 4 週間 monitor で実態把握。利用 ≥ 10% 拡張は自動 allow とします
2. 申請 SLA を business hours 4h 以内承認 / 24h 以内インストール可能と明文化します
3. 申請フォームを簡略化します。Slack workflow で 1 クリック申請にします
4. 拡張のグループ事前承認を導入します（Microsoft 公式 / GitHub 公式 / Anthropic 公式は publisher 単位で許可）
5. 例外承認の audit 化を行います（四半期で全件レビュー）

### T-2. Fine-grained PAT の API カバレッジが古い classic PAT に劣る

症状: 一部の Enterprise admin API / 古い Packages API で Fine-grained PAT が 403 / 404 を返します。

解決策:

1. 公式 docs の "Permissions required for fine-grained personal access tokens" で対象 API を確認します
2. 代替できない API は classic PAT + SAML SSO Enforced + maximum lifetime ≤ 30 days + IP allow list の 3 点固めで凌ぎます
3. 中期的には GitHub App installation token への置換を進めます

### T-3. 1Password CLI / Vault が CI で動かない

症状: ローカルでは `op run` / `vault read` が使えるが、CI で「authentication failed」「TOTP prompt が出ない」となります。

解決策: CI とローカルで secret 取得経路を分離します。

| 環境 | secret 取得経路 |
|---|---|
| ローカル開発端末 | 1Password CLI (`op run`) / Vault Agent + OIDC (Okta) |
| GitHub Actions (CI / CD) | OIDC で AWS / GCP / Azure に直接 AssumeRole |
| GitHub Actions (1Password 必要時) | `1password/load-secrets-action` + service account token |
| Self-hosted runner | Vault に AppRole / Kubernetes auth |

「ローカルと CI で同じツールを使う」を諦めます。CI は GitHub Actions OIDC が最も短命で監査もしやすいです。1Password / Vault は「ローカル開発端末上の長寿命 secret を消す」ためのツールに割り切ります。

### T-4. MCP サーバーの権限制御が agent によって違う

症状: Claude Code は `permissions.json` で tool 単位の allow / deny を効かせられるが、Cursor / Cline / Continue は permission モデルが異なり、組織配布できません。

解決策:

1. 最も厳しい agent (Claude Code) に組織標準を合わせます。MDM で配布します
2. Cursor / Cline は `.cursorrules` / `mcp.json` を組織テンプレで強制配布し、auto-approve をオフにします
3. MCP サーバー自体に server-side scope 制限を入れます（例: GitHub MCP は GitHub App installation token に置換）
4. EDR で MCP サーバープロセスの egress を監視します

### T-5. Codespaces レイテンシで開発者離反

症状: Cloud Workstation 移行後に「ローカルより明らかに遅い」「日本リージョンが混雑」「2026-02 の全断のような事象で業務止まる」と離反が起きます。

解決策:

1. リージョン最適化: org policy で最寄り region を default に強制します
2. 専用 prebuild: 主要 repo の devcontainer を prebuild 化し、起動時間を 10s 以下にします
3. 段階導入: 全業務一括移行ではなく、機密度 tier 1 repo / 新規 onboarding のみ Cloud WS 強制にします
4. 可用性 BCP: Cloud WS 全断時の代替経路（ローカル + 一時 PAT、Coder self-hosted、別クラウドの GCW）を明文化します
5. 離反モニタリング: 月次サーベイで利用時間 / 不満点を計測します

## まとめ

GitHub 2026-05 内部リポジトリ事案は、VS Code 拡張という配布チャネル特有の話ではなく、MCP サーバー / AI コーディングエージェントを含む「開発者端末でローカル実行されるサードパーティコード」全体が共有する構造的攻撃面を露呈させました。長寿命 PAT の駆逐、拡張・MCP・Agent の統合台帳、拡張機能 Allowlist、開発端末特化の EDR ルール、Blast Radius シミュレーションを多層で組み合わせる設計が、AI エージェント時代のサプライチェーン防御の現実解になります。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！

## 参考リンク

- 一次ソース（事案本体）
  - [Investigating unauthorized access to GitHub's internal repositories (GitHub Security Blog, 2026-05-20)](https://github.blog/security/investigating-unauthorized-access-to-githubs-internal-repositories/)
- VS Code 公式
  - [Extension runtime security (VS Code Docs)](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security)
  - [Security and Trust in Visual Studio Marketplace (Microsoft Developer Blog)](https://developer.microsoft.com/blog/security-and-trust-in-visual-studio-marketplace)
  - [Enterprise — Group Policy on Windows (VS Code Docs)](https://code.visualstudio.com/docs/setup/enterprise)
- MITRE / 攻撃技法
  - [MITRE ATT&CK T1176.002 IDE Extensions](https://attack.mitre.org/techniques/T1176/002/)
- Model Context Protocol 公式
  - [MCP Registry: About](https://modelcontextprotocol.io/registry/about)
  - [MCP Security Best Practices (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices)
  - [MCP Transports (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- GitHub PAT / SSO / OIDC 公式
  - [Managing your personal access tokens (fine-grained PAT)](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
  - [Setting a personal access token policy for your organization](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization)
  - [Generating an installation access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
  - [About security hardening with OpenID Connect](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
  - [Configuring OpenID Connect in Amazon Web Services](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- GitHub Actions OIDC GitHub
  - [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials)
- 1Password / Vault 公式
  - [1Password: Use secret references](https://developer.1password.com/docs/cli/secrets-environment-variables)
  - [1Password: Secrets reference syntax](https://www.1password.dev/cli/secrets-reference-syntax)
  - [HashiCorp Vault: AppRole auth method](https://developer.hashicorp.com/vault/docs/auth/approle)
  - [HashiCorp Vault: Vault Agent](https://developer.hashicorp.com/vault/docs/agent-and-proxy/agent)
- Claude Code 公式
  - [Claude Code: Identity and Access Management](https://docs.claude.com/en/docs/claude-code/iam)
  - [Claude Code: Settings](https://docs.claude.com/en/docs/claude-code/settings)
- EDR / ESF 公式
  - [Microsoft Defender XDR: Advanced Hunting overview](https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-overview)
  - [Microsoft Defender XDR: DeviceFileEvents table](https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-devicefileevents-table)
  - [Microsoft Defender XDR: DeviceProcessEvents table](https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-deviceprocessevents-table)
  - [Microsoft Defender XDR: DeviceNetworkEvents table](https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-devicenetworkevents-table)
  - [Apple: Endpoint Security](https://developer.apple.com/documentation/endpointsecurity)
- Cloud Workstation 公式
  - [GitHub Codespaces: Restricting access to machine types](https://docs.github.com/en/codespaces/managing-codespaces-for-your-organization/restricting-access-to-machine-types)
  - [Google Cloud Workstations overview](https://docs.cloud.google.com/workstations/docs/overview)
  - [GitHub Availability Report: February 2026](https://github.blog/news-insights/company-news/github-availability-report-february-2026/)
- 関連プラットフォーム 公式
  - [Okta: Device assurance (Identity Engine)](https://help.okta.com/oie/en-us/content/topics/identity-engine/devices/device-assurance.htm)
  - [Cloudflare: Device posture checks](https://developers.cloudflare.com/cloudflare-one/identity/devices/)
  - [Tailscale: Device posture management](https://tailscale.com/docs/features/device-posture)
  - [Cloudflare Blog: Claude Managed Agents](https://blog.cloudflare.com/claude-managed-agents/)
- 記事（二次情報）
  - [Koi Security: GlassWorm — First Self-Propagating Worm Using Invisible Code Hits OpenVSX Marketplace](https://www.koi.ai/blog/glassworm-first-self-propagating-worm-using-invisible-code-hits-openvsx-marketplace)
  - [Wiz Blog: Supply Chain Risk in VSCode Extension Marketplaces](https://www.wiz.io/blog/supply-chain-risk-in-vscode-extension-marketplaces)
  - [Help Net Security: TeamPCP breached GitHub's internal codebase via poisoned VS Code extension](https://www.helpnetsecurity.com/2026/05/20/github-breached-teampcp/)
  - [BleepingComputer: GitHub confirms breach of 3,800 repos via malicious VSCode extension](https://www.bleepingcomputer.com/news/security/github-confirms-breach-of-3-800-repos-via-malicious-vscode-extension/)
  - [Unit42: Shai-Hulud npm supply chain attack](https://unit42.paloaltonetworks.com/npm-supply-chain-attack/)
  - [Wiz: Mini Shai-Hulud strikes again — TanStack & more npm packages compromised](https://www.wiz.io/blog/mini-shai-hulud-strikes-again-tanstack-more-npm-packages-compromised)
  - [BleepingComputer: VSCode extensions with 9 million installs pulled over security risks (Material Theme)](https://www.bleepingcomputer.com/news/security/vscode-extensions-with-9-million-installs-pulled-over-security-risks/)
  - [OX Security: MCP Supply Chain Advisory](https://www.ox.security/blog/mcp-supply-chain-advisory-rce-vulnerabilities-across-the-ai-ecosystem/)
  - [TrueFoundry: CVE-2025-54136 MCP Tool Poisoning](https://www.truefoundry.com/blog/blog-mcp-tool-poisoning-gateway-defense)
  - [JetBrains Security Blog: GitHub Plugin CVE-2024-37051](https://blog.jetbrains.com/security/2024/06/updates-for-security-issue-affecting-intellij-based-ides-2023-1-and-github-plugin/)
- 記事（Shadow IT / 反証統合）
  - [Kolide: What is Shadow IT? You Can't Solve It by Blocking It](https://www.kolide.com/blog/what-is-shadow-it-you-can-t-solve-it-by-blocking-it)
  - [Wiz: What Is Shadow IT? Causes, Risks, and Examples](https://www.wiz.io/academy/cloud-security/shadow-it)
  - [GitGuardian: Uber Breach 2022](https://blog.gitguardian.com/uber-breach-2022/)
  - [Computer Weekly: Impact of Lapsus$ attack on Okta less than feared](https://www.computerweekly.com/news/252516176/Impact-of-Lapsus-attack-on-Okta-less-than-feared)
  - [TechTarget: Top 6 challenges of a zero-trust security model](https://www.techtarget.com/searchsecurity/tip/Top-risks-of-deploying-zero-trust-cybersecurity-model)

[^gh]: GitHub Security Blog, "Investigating unauthorized access to GitHub's internal repositories", 2026-05-20.
[^vsc]: Microsoft, "Extension runtime security" (VS Code Docs).
[^vsc-marketplace]: Microsoft Developer Blog, "Security and Trust in Visual Studio Marketplace".
[^mitre]: MITRE ATT&CK, "T1176.002 IDE Extensions" (introduced 2025-03-30).
[^mcp-registry]: Model Context Protocol, "MCP Registry: About".
[^mcp-spec]: Model Context Protocol, "Security Best Practices (2025-06-18)".
