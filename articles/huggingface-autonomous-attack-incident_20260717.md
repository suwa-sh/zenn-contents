---
title: "自律AIエージェント攻撃に学ぶ、権限境界とインシデント対応の設計"
emoji: "🛡️"
type: "tech"
topics: ["Security", "AI", "Kubernetes", "IAM", "LLM"]
published: false
---

> 本記事は、Hugging Face が 2026年7月16日に公開したセキュリティインシデント報告 (公式ブログ) を一次情報として、AIエージェント時代の「権限境界」と「インシデント対応」の設計を防御側視点で構造化したものです。攻撃の再現手順は扱わず、防御側が導入できる対策の設計と手順に焦点を当てます。

## インシデントの概要

Hugging Face は 2026年7月16日、本番基盤の一部への侵入インシデントを公式ブログで開示しました。公表時点から見て「今週初め」に検知・対応した事案です。公式は「これまで扱ったどのインシデントとも一点で違った。侵入は端から端まで自律AIエージェントシステムによって駆動され、われわれもそれを自前のAIで検知・解析した」と説明しています。

### 侵入の全体像

侵入口は AI プラットフォーム特有の弱点である「データ処理パイプライン」でした。悪意あるデータセットが 2 つのコード実行経路を悪用します。

1. リモートコード実行を許すデータセットローダー
2. データセット設定内のテンプレートインジェクション

この 2 経路を使い、処理ワーカー上でコードを実行しました。攻撃者はそこからノードレベルアクセスへエスカレーションし、クラウド・クラスタの認証情報を収集し、週末をまたいで複数の内部クラスタへ横移動しました。

攻撃を実行したのは「自律エージェントフレームワーク(セキュリティ調査用ハーネスをベースにしていると見られる。使用した LLM は未特定)」です。短命のサンドボックス群にまたがって数千の個別アクションを実行し、公開サービス上に自己移動型の C2(コマンド&コントロール)をステージングしました。公式はこれを「業界がかねて予測していた『エージェント型攻撃者』シナリオそのもの」と位置づけています。

### 被害範囲

- 限定的な内部データセットへの不正アクセス
- 複数の内部サービスで使われる認証情報への不正アクセス
- パートナー・顧客データへの影響は評価中(該当があれば個別連絡)
- 公開中の学習済みモデル・データセット・Spaces への改ざんは未検出
- ソフトウェアサプライチェーン(コンテナイメージ・公開パッケージ)は検証済みでクリーン

### 検知と解析

侵害は AI 支援検知が最初に表面化させました。異常検知パイプラインがセキュリティテレメトリに対して LLM ベースのトリアージを行い、複数シグナルの相関から侵害を検知しました。

解析フェーズでは、LLM 駆動の解析エージェントが攻撃者行動ログ全体(17,000件超の記録イベント)を解析しました。これにより、タイムラインの再構築、侵害指標の抽出、触れられた認証情報のマッピング、実被害とおとり行動の切り分けを実施しています。公式は「通常なら数日かかる作業を数時間で終え、攻撃側の速度に対抗できた」と述べています。

ただし、この解析フェーズには当初の想定外の制約がありました(詳細は「特徴」を参照)。商用フロンティアモデルの安全ガードレールが、フォレンジック解析に必要な攻撃コマンド・エクスプロイト・C2 アーティファクトの大量投入を拒否したため、公式は解析基盤をオープンウェイトモデル(GLM 5.2)の自社インフラ運用に切り替えています。

### 対応内容

- 脆弱性修正: 侵入口となったデータセットのコード実行経路を閉鎖
- 侵害ノードの排除・再構築: 攻撃者の足掛かりを各クラスタから排除し、侵害ノードを再構築
- 認証情報の失効・ローテーション: 影響を受けた認証情報とトークンを失効・ローテーションし、予防的な広範囲ローテーションも実施
- ガードレール強化: クラスタへの追加ガードレールと、より厳格な入場制御(admission control)を追加
- 検知・アラート改善: 重大度の高いシグナルは曜日を問わず数分以内に担当者へページングされるよう改善
- 外部連携: 外部のサイバーセキュリティフォレンジック専門家と協働し、セキュリティポリシー・手順を見直し中。法執行機関にも報告済み

コミュニティへは、アクセストークンのローテーションと直近のアカウント活動確認を推奨しています。

### 防御側が学ぶべき構造的な論点

このインシデントは、単発の脆弱性修正では閉じない 4 つの構造的論点を提起しています。

1. **データ・モデル面が侵入口になる**: 攻撃の起点は従来型のネットワーク境界ではなく、データセット処理という AI プラットフォーム固有のコード実行経路でした。
2. **権限境界の設計が被害範囲を決める**: 1 ワーカーでのコード実行が、ノードレベルアクセス、認証情報窃取、複数クラスタへの横移動へと連鎖しました。処理ワーカーとクラスタ間の権限分離が不十分だったことが被害拡大の構造要因です。
3. **機械速度の攻撃には機械速度の防御が要る**: 数千アクション・17,000件超のイベントという規模は人手でのトリアージが現実的に不可能な量です。防御側も AI 解析を前提にせざるを得ません。
4. **商用 AI 依存はインシデント対応時のボトルネックになりうる**: 平時に有用な安全ガードレールが、有事のフォレンジック解析(攻撃データそのものを扱う作業)を妨げる「非対称性問題」が顕在化しました。

## 攻撃の特徴

このインシデントが従来型侵害と何が違うかを整理します。

- **自律エージェントフレームワークによる機械速度の攻撃**: 攻撃者本人の作業速度に律速されず、短命サンドボックスの群で数千の個別アクションを連続実行しました。自己移動型 C2 を公開サービス上にステージングする自己拡張的な挙動も確認されています。
- **データ・モデル面を第一級の攻撃面として扱う**: 侵入口はネットワーク境界やアプリケーション脆弱性ではなく、データセットのコード実行経路でした。悪意ある第三者データセットを起点とするコード実行は、OWASP の LLM Top 10 (2025) が挙げる「LLM03: Supply Chain」(第三者データセット・モデルの汚染や依存関係経由のコード実行を含む)が指す攻撃面が、理論でなく実被害として現れた事例です。学習データの汚染でモデル出力を操作する「LLM04: Data and Model Poisoning」とは区別されます。
- **週末を狙った横移動**: 内部クラスタへの横移動は週末をまたいで進行しました。検知・対応要員が手薄になりやすい時間帯を突く形になっています。
- **商用APIの安全制御が正当なフォレンジック解析を拒否する「非対称性問題」**: フォレンジック解析には攻撃コマンド・エクスプロイト・C2 アーティファクトを大量に含むプロンプトが必要ですが、商用フロンティアモデルの安全ガードレールは「インシデント対応者」と「攻撃者」を区別できず、これらのリクエストをブロックしました。公式は「攻撃者は利用ポリシーに縛られない一方、われわれの初回のフォレンジック作業は利用したホスト型モデルのガードレールにブロックされた」と述べています。
- **オープンウェイトモデルへの切替**: 公式はフォレンジック解析基盤を、オープンウェイトモデルの GLM 5.2 を自社インフラ上で動かす方式に切り替えました。ガードレール制約の回避に加え、「攻撃者データも、そこに含まれる認証情報も自社環境の外に出さない」という副次的な利点も得ています。
- **検知・解析の両方に AI を使うループ**: 検知は異常検知パイプラインの LLM トリアージ、解析は LLM 駆動の解析エージェントが担いました。通常数日かかる 17,000件超のログ解析を数時間に短縮し、攻撃側の速度に対抗しています。

### 攻撃タイプ比較

| 観点 | 従来型(人間主導の侵害) | スクリプト自動化型 | 自律AIエージェント型(本件) |
|---|---|---|---|
| 攻撃速度 | 攻撃者本人の判断速度に律速。侵入から横移動まで数日〜数週間かかることが多い | 定型処理は高速化されるが、分岐判断は人手待ちになる | 判断を含め機械速度で自走。数千アクションを連続実行 |
| 並列度 | 攻撃者本人の作業量に限定される | スクリプト単位で並列化できるが、シナリオは事前に固定される | 短命サンドボックスの群に動的に展開し、状況に応じて分岐する |
| 検知難度 | 人間らしい操作パターンが残り、異常検知しやすい | 定型シグネチャで検知しやすい | 数千〜数万件のイベントに埋もれ、相関分析(AIトリアージ)が前提になる |
| 防御側の対応非対称性 | 防御側も人手で追随できる規模 | 防御側は既存の自動化ツールで概ね追随できる | 商用APIの安全ガードレールが攻撃データを含む解析要求そのものを拒否し、防御側が独自基盤+オープンウェイトモデルの事前準備を迫られる |

## 攻撃と防御の構造

本インシデントは製品ではなく攻撃事象です。そのため C4 model を役割/カテゴリ単位に読み替え、システムコンテキスト図・コンテナ図・コンポーネント図の 3 段階で図解します。あわせて攻撃と防御の時系列を sequenceDiagram で補足します。

### システムコンテキスト図

自律攻撃エージェント framework・防御チーム・LLM 解析エージェントと、対象システム、外部要素の関係です。

```mermaid
graph TB
    Attacker["自律攻撃エージェント<br/>Framework"]
    DefenseTeam["防御チーム"]
    LLMTriage["LLM解析エージェント"]
    System["データ処理基盤<br/>Hub クラスタ群"]
    CommercialAPI["商用API<br/>安全制御"]
    OnPremModel["オンプレの<br/>オープンウェイトモデル"]
    CredStore["資格情報ストア"]

    Attacker -->|"数千件のアクションで侵害"| System
    System -->|"認証情報を保持"| CredStore
    Attacker -->|"認証情報を窃取"| CredStore
    DefenseTeam -->|"侵害を検知し対応"| System
    DefenseTeam -->|"分析を指示"| LLMTriage
    LLMTriage -->|"攻撃ログを分析"| System
    DefenseTeam -->|"分析送信を試み拒否される"| CommercialAPI
    LLMTriage -->|"オンプレ基盤で稼働"| OnPremModel
```

| 要素名 | 説明 |
|---|---|
| 自律攻撃エージェント Framework | 短命サンドボックス群を並列稼働させ数千件の個別アクションを自動実行する攻撃側の主体 |
| 防御チーム | 侵害を検知し、封じ込め・認証情報失効・クラスタ再構築を判断する人間の主体 |
| LLM解析エージェント | 攻撃ログを解析しキルチェーンを特定する自動化された解析主体 |
| データ処理基盤 Hub クラスタ群 | 攻撃対象となった本番システム全体。データセット処理パイプラインと内部クラスタ複数を含む |
| 商用API安全制御 | 大量の実攻撃コマンドを含む分析依頼を安全機構でブロックした外部の商用 LLM API |
| オンプレのオープンウェイトモデル | 攻撃者データを社外に出さずにフォレンジック分析を実行した自社インフラ上のモデル基盤 |
| 資格情報ストア | クラウド認証情報・クラスタ認証情報・サービス資格情報を保持する外部の管理領域 |

### コンテナ図

対象システムをドリルダウンし、攻撃面コンテナ群と防御コンテナ群の関係を示します。

```mermaid
graph TB
    subgraph AttackSurface["攻撃面コンテナ群"]
        DatasetLoader["データセット<br/>ローダー"]
        TemplateProc["テンプレート<br/>処理"]
        Worker["処理ワーカー"]
        ClusterNode["クラスタ<br/>ノード"]
        CredStore["資格情報<br/>ストア"]
        DatasetLoader --> TemplateProc
        TemplateProc --> Worker
        Worker --> ClusterNode
        ClusterNode --> CredStore
    end
    subgraph Defense["防御コンテナ群"]
        Telemetry["セキュリティ<br/>テレメトリ"]
        LLMTriage["LLM<br/>トリアージ"]
        Forensics["フォレンジック<br/>解析"]
        Admission["Admission<br/>Control"]
        TokenRevoke["トークン失効<br/>基盤"]
        Telemetry --> LLMTriage
        LLMTriage --> Forensics
        Forensics --> TokenRevoke
    end
    Worker -.->|"実行ログを送出"| Telemetry
    ClusterNode -.->|"アクセスログを送出"| Telemetry
    Admission -.->|"新規ノードを検査"| ClusterNode
    TokenRevoke -.->|"窃取された認証情報を失効"| CredStore
```

#### 攻撃面コンテナ群

| 要素名 | 説明 |
|---|---|
| データセットローダー | リモートコード実行可能なデータセット読み込み処理。侵入の起点 |
| テンプレート処理 | データセット設定内のテンプレートを解釈する処理。インジェクションの標的 |
| 処理ワーカー | データセットローダーの読み込み処理を実行する計算コンテナ。コード実行が成立する場所 |
| クラスタノード | 処理ワーカーが稼働するホスト。権限昇格の標的 |
| 資格情報ストア | ノードから到達可能なクラウド認証情報とクラスタ認証情報の保管領域 |

#### 防御コンテナ群

| 要素名 | 説明 |
|---|---|
| セキュリティテレメトリ | ワーカーとノードの実行ログ・アクセスログを収集する基盤。17,000件超のイベントを蓄積 |
| LLMトリアージ | 収集ログを一次分析し異常パターンを抽出する自動化基盤 |
| フォレンジック解析 | トリアージ結果を深掘りし攻撃キルチェーンを特定する解析基盤。オンプレのオープンウェイトモデル上で稼働 |
| Admission Control | 新規ノードやワークロードの起動時に権限・設定を検査し不正な変更を拒否する制御点 |
| トークン失効基盤 | 窃取が疑われる認証情報を即時に失効・ローテーションする基盤 |

### コンポーネント図

攻撃キルチェーンの段階と、それぞれを断ち切る権限境界の設計要素です。

```mermaid
graph TB
    subgraph KillChain["攻撃キルチェーン"]
        Entry["データセット入口"]
        CodeExec["ワーカーでの<br/>コード実行"]
        PrivEsc["ノード権限昇格"]
        CredTheft["資格情報窃取"]
        LateralMove["クラスタ間<br/>横移動"]
        Entry --> CodeExec
        CodeExec --> PrivEsc
        PrivEsc --> CredTheft
        CredTheft --> LateralMove
    end
    subgraph Defenses["権限境界の設計要素"]
        Sandbox["データローダーの<br/>隔離実行環境"]
        AdmissionCtl["Admission Control<br/>Pod Security"]
        ScopedToken["短命 限定スコープ<br/>トークン"]
        NetSeg["ネットワーク<br/>セグメンテーション"]
    end
    Sandbox -.->|"侵害範囲を限定"| CodeExec
    AdmissionCtl -.->|"特権昇格を拒否"| PrivEsc
    ScopedToken -.->|"悪用時間を制限"| CredTheft
    NetSeg -.->|"横移動を遮断"| LateralMove
```

#### 攻撃キルチェーン

| 要素名 | 説明 |
|---|---|
| データセット入口 | リモートコード実行可能なローダーとデータセット設定内テンプレートインジェクションの組合せが起点 |
| ワーカーでのコード実行 | データセット読み込み時に処理ワーカー上で任意コードが実行される段階 |
| ノード権限昇格 | ワーカーからホストであるクラスタノードへアクセス範囲が拡大する段階 |
| 資格情報窃取 | ノードから到達可能なクラウド認証情報・クラスタ認証情報・サービス資格情報を収集する段階 |
| クラスタ間横移動 | 窃取した認証情報を用いて複数の内部クラスタへ侵害範囲を広げる段階 |

各段階は MITRE ATT&CK のテクニックに概ね対応します。攻撃を段階で捉えると、どの防御要素がどのテクニックを断つかを設計として議論できます。

| キルチェーン段階 | 対応する MITRE ATT&CK (代表例) |
|---|---|
| データセット入口 | T1195 Supply Chain Compromise |
| ワーカーでのコード実行 | T1059 Command and Scripting Interpreter |
| ノード権限昇格 | T1611 Escape to Host (TA0004 Privilege Escalation) |
| 資格情報窃取 | T1552 Unsecured Credentials (TA0006 Credential Access) |
| クラスタ間横移動 | T1078 Valid Accounts (TA0008 Lateral Movement) |

#### 権限境界の設計要素

| 要素名 | 説明 |
|---|---|
| データローダーの隔離実行環境 | 未検証コードをネットワーク遮断されたマイクロVM相当のサンドボックスで実行し、侵害をワーカー内に封じ込める設計。例としてgVisorやFirecracker等のマイクロVM分離が該当する |
| Admission Control Pod Security | クラスタ入場時点で特権コンテナやサンドボックス外実行を拒否し、ワーカーからノードへの権限昇格を断つ設計。例として ValidatingAdmissionPolicy や OPA Gatekeeper、Pod Security Admission が該当する |
| 短命 限定スコープトークン | 分単位TTLで発行し用途を最小権限に絞ったトークンに置き換える設計。窃取されても悪用可能な時間と範囲を縮小する。例としてクラウドのSTS一時認証情報が該当する |
| ネットワークセグメンテーション | クラスタ間の East-West 通信をデフォルト拒否し必要な経路のみ許可する設計。1クラスタの侵害が他クラスタへ波及するのを遮断する |

### 攻撃対防御タイムライン

キルチェーンの進行と防御対応の時系列を補足します。攻撃側は数千件のアクションを短時間で実行できる一方、防御側は商用API安全制御に阻まれ分析経路を切り替える非対称性があります。

```mermaid
sequenceDiagram
    participant Atk as 自律攻撃エージェント
    participant Worker as 処理ワーカー
    participant Node as クラスタノード
    participant Cred as 資格情報ストア
    participant Tele as セキュリティテレメトリ
    participant Def as 防御チーム
    participant LLM as LLMトリアージ基盤
    Atk->>Worker: テンプレート注入でコード実行
    Worker->>Node: 権限昇格を試行
    Node->>Cred: クラウド クラスタ認証情報を収集
    Atk->>Cred: 複数クラスタへ横移動
    Worker-->>Tele: 異常な実行ログを送出
    Tele->>Def: アラートを通知
    Def->>LLM: 攻撃ログの分析を指示
    Note over LLM: オンプレの<br/>オープンウェイトモデルで分析
    LLM-->>Def: キルチェーンを特定
    Def->>Cred: 認証情報を失効
    Def->>Node: クラスタを再構築
```

| 要素名 | 説明 |
|---|---|
| 自律攻撃エージェント | 短命サンドボックス群から並列にアクションを実行する攻撃主体 |
| 処理ワーカー | コード実行が成立し異常ログの発生源となるコンテナ |
| クラスタノード | 権限昇格と再構築対象になるホスト |
| 資格情報ストア | 窃取と失効の対象になる認証情報の保管領域 |
| セキュリティテレメトリ | 異常ログを収集しアラートの起点になる基盤 |
| 防御チーム | 分析指示と最終対応を判断する人間の主体 |
| LLMトリアージ基盤 | オンプレのオープンウェイトモデル上でログを分析しキルチェーンを特定する基盤 |

## インシデント対応で扱うデータ

インシデント対応・権限境界設計で扱うエンティティを、概念モデルと情報モデルで整理します。

### 概念モデル

所有関係は subgraph の入れ子、利用関係は矢印で表します。

```mermaid
graph TD
  subgraph Incident
    subgraph KillChainStage
      AttackAction
    end
  end
  subgraph Cluster
    Node
  end
  subgraph PermissionBoundary
    Scope
  end
  SecurityEvent
  Credential
  Dataset
  ForensicAnalysisModel
  DetectionSignal
  RemediationAction

  AttackAction --> Credential
  AttackAction --> Node
  AttackAction --> Dataset
  AttackAction --> SecurityEvent
  Credential --> Scope
  Credential --> Cluster
  Node --> Dataset
  ForensicAnalysisModel --> SecurityEvent
  ForensicAnalysisModel --> DetectionSignal
  DetectionSignal --> RemediationAction
  RemediationAction --> Credential
  RemediationAction --> PermissionBoundary
```

### 情報モデル

```mermaid
classDiagram
  class Incident {
    string incident_id
    string title
    timestamp detected_at
    string severity
    string status
  }
  class KillChainStage {
    string stage_id
    string name
    string mitre_technique
    string entry_condition
  }
  class AttackAction {
    string action_id
    timestamp timestamp
    string mitre_technique
    string target_resource
    string actor_type
  }
  class SecurityEvent {
    string event_id
    timestamp timestamp
    string actor
    string action_type
    string target_resource
    string verdict
    string evidence_status
  }
  class Credential {
    string token_id
    string credential_type
    timestamp issued_at
    int ttl
    timestamp revoked_at
  }
  class Scope {
    string scope_id
    string resource_type
    string permission_level
    string granted_to
  }
  class Node {
    string node_id
    string cluster_id
    string role
    string status
    timestamp compromised_at
  }
  class Cluster {
    string cluster_id
    string name
    string environment
    string isolation_status
  }
  class Dataset {
    string dataset_id
    string name
    string visibility
    string processing_pipeline
  }
  class ForensicAnalysisModel {
    string model_id
    string model_type
    string version
    list analyzed_events
    int confidence_score
  }
  class DetectionSignal {
    string signal_id
    timestamp detected_at
    string severity
    list correlated_events
    string status
  }
  class RemediationAction {
    string action_id
    string action_type
    timestamp executed_at
    string target_resource
    string result
  }
  class PermissionBoundary {
    string boundary_id
    string policy_name
    set allowed_scopes
    timestamp enforced_at
  }

  Incident "1" --> "many" KillChainStage
  KillChainStage "1" --> "many" AttackAction
  AttackAction "many" --> "1" Credential
  AttackAction "many" --> "many" Node
  AttackAction "many" --> "many" Dataset
  AttackAction "1" --> "many" SecurityEvent
  Credential "1" --> "many" Scope
  Credential "many" --> "1" Cluster
  Cluster "1" --> "many" Node
  Node "1" --> "many" Dataset
  ForensicAnalysisModel "1" --> "many" SecurityEvent
  ForensicAnalysisModel "1" --> "many" DetectionSignal
  DetectionSignal "1" --> "many" RemediationAction
  RemediationAction "many" --> "1" Credential
  RemediationAction "many" --> "1" PermissionBoundary
  PermissionBoundary "1" --> "many" Scope
```

### 要素説明

| 要素名 | 説明 |
|---|---|
| Incident | セキュリティインシデント全体の記録単位です。 |
| KillChainStage | インシデントを構成する攻撃段階です。MITRE ATT&CK のテクニック ID と紐づきます。 |
| AttackAction | 攻撃段階内で実行された個別の攻撃行動です。自律エージェントによる実行か人間による実行かを actor_type で区別します。 |
| SecurityEvent | 攻撃行動から生成される行動ログです。evidence_status で未確認・確認済み・永続化済みのライフサイクル状態を保持します。 |
| Credential | OAuth デバイスフロー等で発行される短命トークンです。ttl で有効期限を管理します。 |
| Scope | Credential に付与される権限範囲です。resource_type と permission_level で範囲を規定します。 |
| Node | クラスタを構成する処理ワーカーです。侵害有無を compromised_at で記録します。 |
| Cluster | Node の集合を管理する内部インフラ単位です。 |
| Dataset | データセット処理パイプラインで扱われる素材です。公開範囲を visibility で持ちます。 |
| ForensicAnalysisModel | SecurityEvent を分析し DetectionSignal を生成する検知モデルです。LLM ベースのトリアージ等が該当します。 |
| DetectionSignal | 複数の SecurityEvent の相関から導かれる異常検知シグナルです。 |
| RemediationAction | DetectionSignal を起点に実行される是正措置です。Credential の失効や PermissionBoundary の強化を担います。 |
| PermissionBoundary | Scope の許容範囲を定義するポリシーです。クラスタ受付制御などの権限境界を表します。 |

### 証拠ライフサイクルの状態遷移

SecurityEvent の evidence_status は、次の3状態で遷移します。停止した処理や部分出力を「確認済み」として誤って昇格させない、証拠ライフサイクルの設計が要点です。

| 状態 | 説明 |
|---|---|
| unverified (未確認) | 異常検知パイプラインが検出したが、人手または追加分析による裏付けがない状態です。 |
| confirmed (確認済み) | ForensicAnalysisModel の分析やテレメトリ相関により、攻撃行動との関連が裏付けられた状態です。 |
| preserved (永続化済み) | 改ざん防止のため保全され、フォレンジック証跡・監査対応に利用可能な状態です。 |

## 防御基盤の構築

本件の侵入口は、データセット処理内の 2 つのコード実行経路(リモートコードローダーとテンプレートインジェクション)でした。ここでは、この侵入パターンを再現させないための防御基盤を、初期構築の観点で示します。攻撃コードは扱いません。

### データローダーのコード実行面を隔離する構成

信頼できないデータセットのロード処理は、本体クラスターと切り離した実行面に閉じ込めます。

- 隔離レイヤーの選定
  - Kubernetes 上では gVisor (`runsc`) を RuntimeClass として導入します。ユーザー空間カーネルが syscall を仲介し、ホストカーネルへの直接到達を遮断します。
  - 単一ホスト向けの軽量代替には firejail が使えます。namespace ベースでネットワーク・ファイルシステム・capability を分離します。
  - コード実行そのものをリモートサンドボックス (Docker executor / E2B 相当) に委譲する構成も選べます。Hugging Face 自身が公開している `smolagents` の secure code execution ガイドが、この構成のベストプラクティスとして「最小権限で実行する」「不要なネットワークアクセスを無効化する」「シークレットは環境変数経由に限定する」を挙げています。
- Kubernetes での RuntimeClass 定義

```yaml
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: runsc
```

- 隔離 Pod の定義例(データセットローダー専用)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: untrusted-dataset-loader
  namespace: dataset-processing
  labels:
    role: dataset-loader
spec:
  runtimeClassName: gvisor
  securityContext:
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: loader
      image: internal-registry/dataset-loader:sandboxed
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]
      resources:
        limits:
          cpu: "1"
          memory: "1Gi"
```

- ネットワーク遮断(NetworkPolicy で egress を deny-all にします)

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: dataset-loader-egress-deny
  namespace: dataset-processing
spec:
  podSelector:
    matchLabels:
      role: dataset-loader
  policyTypes:
    - Egress
  egress: []
```

- 単一ホスト向け firejail 実行例

```bash
firejail --net=none --private --seccomp --caps.drop=all \
  python3 load_dataset.py --trust_remote_code=False
```

- 運用ルール
  - `trust_remote_code=True` を要求するデータセットは、隔離実行面でのみロードを許可します。
  - 隔離実行面と本体クラスターの間は、認証情報を共有しません。次項のトークン基盤で越境時のみ短命クレデンシャルを発行します。

### 短命・限定スコープトークンの発行基盤

本件では処理ワーカーでのコード実行が、クラウド・クラスタ認証情報の窃取と複数クラスタへの横移動につながりました。長期の広範囲トークンを持たせない設計が対抗策になります。

- 人間の承認を挟む操作(デプロイ・失効操作など)には OAuth 2.0 Device Authorization Grant (RFC 8628) を使います。デバイスコードは 900〜1800 秒程度で失効させ、承認後に発行するアクセストークンも短命にします。これらの TTL は実務上の目安であり、RFC 8628 が規定する固定値ではありません。アクセス・リフレッシュトークンの形式や寿命、即時失効の可否は認可サーバの実装依存です。
- ワークロード間のクラウド越境アクセスには workload identity federation を使い、長期キーの配布そのものをなくします。

```bash
# GCP: AWS IAM ロールの認証情報を GCP の短命トークンに交換する設定を生成
gcloud iam workload-identity-pools create-cred-config \
  projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/aws-pool/providers/aws-provider \
  --service-account=dataset-pipeline-sa@PROJECT_ID.iam.gserviceaccount.com \
  --aws \
  --output-file=/etc/gcp/credential-config.json
```

- workload identity federation は発行側と受領側の両方の設定が揃って初めて成立します。上記 GCP 側の `create-cred-config` に対して、AWS 側では IAM OIDC アイデンティティプロバイダを登録し、ロールの信頼ポリシーに発行元 IdP を固定する `Condition` (例: `token.actions.githubusercontent.com:sub` の完全一致) を設定します。片側だけでは越境アクセスは通りません。
- AWS 内のワーカーには STS の一時クレデンシャルを発行し、`DurationSeconds` と session policy で最小権限に絞ります。

```bash
aws sts assume-role \
  --role-arn arn:aws:iam::123456789012:role/dataset-worker-role \
  --role-session-name dataset-loader-$(date +%s) \
  --duration-seconds 900 \
  --policy file://scoped-down-read-only.json
```

- TTL とスコープの設計例

| トークン種別 | 想定用途 | TTL 目安 | スコープ設計 |
|---|---|---|---|
| データセット処理ワーカー用 STS | 隔離実行面から対象バケットの読み取り | 900〜3600 秒 (`--duration-seconds`) | 対象データセットバケットの `GetObject` のみ、他リソースは session policy で明示的に除外 |
| CI/CD エージェント用 Device Flow トークン | 人間承認を要するデプロイ・失効操作 | device_code 15〜30 分、アクセストークン 1 時間 | 対象リポジトリ・対象クラスタのみ |
| クロスクラウド Workload Identity | GCP ワークロードから AWS リソースへのアクセス等 | 既定 1 時間 | 対象ロール 1 つのみを信頼、発行元 IdP を明示的に固定 |
| Hugging Face fine-grained token | データセット・モデルの読み書き | 定期更新(長期固定を避ける) | 特定リポジトリ・特定 Organization のみ、書き込み権限は必要最小限 |

### admission control / Pod Security の初期構成

侵入後の横移動を防ぐ最終防衛線として、クラスタ入場時点で特権コンテナやサンドボックス外実行を拒否します。

- 単純な必須ラベル・値の検証は Kubernetes 標準の `ValidatingAdmissionPolicy` (CEL ベース、v1.30 で GA) が使えます。外部 Webhook を経由しないため、レイテンシと運用コストを抑えられます。

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicy
metadata:
  name: require-gvisor-for-dataset-loader
spec:
  failurePolicy: Fail
  matchConstraints:
    resourceRules:
      - apiGroups: [""]
        apiVersions: ["v1"]
        operations: ["CREATE", "UPDATE"]
        resources: ["pods"]
  validations:
    - expression: "object.metadata.?labels['role'].orValue('') != 'dataset-loader' || object.spec.runtimeClassName == 'gvisor'"
      message: "dataset-loader labeled Pods must run under RuntimeClass 'gvisor'"
---
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicyBinding
metadata:
  name: require-gvisor-for-dataset-loader-binding
spec:
  policyName: require-gvisor-for-dataset-loader
  validationActions: ["Deny"]
  matchResources:
    namespaceSelector:
      matchLabels:
        kubernetes.io/metadata.name: dataset-processing
```

- より複雑なポリシー(組織横断の Rego ライブラリ運用など)には OPA Gatekeeper を使います。現行の Gatekeeper は Rego v1 構文をサポートし、`version: "v1"` を指定した `code` ブロック配下でのみ有効になります。

```yaml
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8srequiregvisorforuntrusted
spec:
  crd:
    spec:
      names:
        kind: K8sRequireGvisorForUntrusted
  targets:
    - target: admission.k8s.gatekeeper.sh
      code:
        - engine: Rego
          source:
            version: "v1"
            rego: |
              package k8srequiregvisorforuntrusted

              violation contains {"msg": msg} if {
                input.review.object.metadata.labels.role == "dataset-loader"
                input.review.object.spec.runtimeClassName != "gvisor"
                msg := "dataset-loader labeled Pods must run under RuntimeClass 'gvisor'"
              }

              violation contains {"msg": msg} if {
                input.review.object.metadata.labels.role == "dataset-loader"
                some c in input.review.object.spec.containers
                c.securityContext.privileged == true
                msg := "dataset-loader labeled Pods must not run privileged containers"
              }
```

- 対応する Constraint

```yaml
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sRequireGvisorForUntrusted
metadata:
  name: require-gvisor-for-dataset-loader
spec:
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]
    namespaces: ["dataset-processing"]
```

- Namespace 単位で Pod Security Admission(組み込み機能)も併用し、二重の防衛線にします。

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: dataset-processing
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
```

### クラスタ間ネットワークセグメンテーション

本件の横移動は、1 つの侵害ノードから複数の内部クラスタへ広がりました。ワーカー単体の egress 遮断 (前述の NetworkPolicy) に加えて、クラスタ間の East-West 通信をデフォルト拒否にする層を重ねます。ワーカー内の隔離とクラスタ間の遮断は、別レイヤーの防御として明確に区別します。

- クラスタ全体に効く既定拒否は、CNI レベルのポリシー (例: Cilium の `CiliumClusterwideNetworkPolicy`) で表現します。必要な経路だけを allow で明示的に開けます。

```yaml
apiVersion: cilium.io/v2
kind: CiliumClusterwideNetworkPolicy
metadata:
  name: default-deny-cross-cluster
spec:
  endpointSelector: {}
  egress:
    - toEntities:
        - cluster
    - toEndpoints:
        - matchLabels:
            k8s:io.kubernetes.pod.namespace: kube-system
            k8s-app: kube-dns
```

- クラウド側では、クラスタ間 VPC のセキュリティグループ・NACL を deny-by-default にし、管理経路のみを許可リストで開けます。
- 内部サービス間は mTLS で相互認証し、認証情報の窃取だけでは別クラスタへ到達できない多層構成にします。

## 失効とフォレンジックの実行手順

初期構築後の基本運用として、トークン一括失効とフォレンジック解析基盤の使い方を示します。

### 必須パラメータ一覧

| パラメータ | 説明 | 例 |
|---|---|---|
| `ORG_NAME` | Hugging Face の Organization 名 | `your-org` |
| `ADMIN_HF_TOKEN` | 失効操作を実行する管理者の Access Token(Enterprise プラン、revoke 権限が必要) | 環境変数経由で渡す |
| `LEAKED_HF_TOKEN` | 失効対象の生トークン値 | 環境変数経由で渡す |
| `role-name` | セッションを無効化する対象の AWS IAM ロール名 | `dataset-worker-role` |
| `aws:TokenIssueTime` 基準時刻 | この時刻より前に発行された STS セッションをすべて無効化する基準 | インシデント検知時刻(UTC) |
| モデル repo | オンプレ配備するオープンウェイトモデルの識別子 | 組織のセキュリティ方針で選定(本件は GLM 5.2) |
| `--host` / `--port` | `vllm serve` の bind アドレス。外部公開しない | `127.0.0.1` / `8000` |

### トークン一括失効(rotate/revoke)の運用コマンド

- Hugging Face の fine-grained token は、Enterprise プランの Token Management で管理者が生トークン値を指定して強制失効できます。この経路は secrets scanning 連携などの自動化ワークフロー向けです。

```bash
# ORG_NAME: 対象組織名、ADMIN_HF_TOKEN: 失効操作を行う管理者トークン
# LEAKED_HF_TOKEN: 失効対象の生トークン値(シェル履歴に残さないよう環境変数経由で渡す)
curl -X POST "https://huggingface.co/api/organizations/${ORG_NAME}/settings/tokens/revoke" \
  -H "Authorization: Bearer ${ADMIN_HF_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"${LEAKED_HF_TOKEN}\"}"
```

- AWS の長期アクセスキーは、いったん無効化してから削除します。

```bash
aws iam update-access-key --user-name dataset-pipeline-user \
  --access-key-id AKIAXXXXXXXXXXXXXXXX --status Inactive
aws iam delete-access-key --user-name dataset-pipeline-user \
  --access-key-id AKIAXXXXXXXXXXXXXXXX
```

- AWS STS の一時クレデンシャルは個別失効ができません。ロールに `aws:TokenIssueTime` 条件付きの Deny ポリシーを追加し、基準時刻より前に発行された全セッションを一括無効化します。

```bash
aws iam put-role-policy \
  --role-name dataset-worker-role \
  --policy-name AWSRevokeOlderSessions \
  --policy-document file://revoke-sessions.json
```

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "DateLessThan": {
          "aws:TokenIssueTime": "2026-07-17T00:00:00Z"
        }
      }
    }
  ]
}
```

- 失効後は、影響範囲を確定してからポリシーを解除し、新規発行のトークン・ロールで運用を再開します。予防的な広範囲ローテーションも合わせて実施します。

### フォレンジック向け: オンプレのオープンウェイトモデルで行動ログを解析する最小構成

本件では、攻撃者行動ログ(17,000 件超のイベント)の解析に、商用フロンティアモデルではなくオープンウェイトモデル(GLM 5.2)を自社インフラで実行する構成が使われました。

- オープンウェイトを選ぶ理由
  - 商用フロンティアモデルの安全ガードレールは、攻撃コマンド・エクスプロイト・C2 アーティファクトを大量に含むフォレンジックプロンプトを、インシデント対応者からの正当な要求と攻撃者からの要求とを区別できずにブロックします。
  - オープンウェイトモデルを自社インフラで動かせば、この非対称性を回避できます。
  - 副次的な利点として、攻撃者データやログに含まれる認証情報の断片が自社環境の外に一切出ません。二次漏洩のリスクを避けられます。
- 最小構成の手順
  1. 平時のうちにモデル重みを内部ミラーへ事前配置しておきます(解析時にインターネット接続を必要としないため)。
  2. インシデント発生時は、ネットワーク遮断済みの隔離ホストで `vllm serve` を起動し、bind アドレスをローカルホストに限定します。

```bash
vllm serve <internal-mirror>/<open-weight-model> \
  --host 127.0.0.1 \
  --port 8000 \
  --served-model-name forensic-analyzer
```

  3. OpenAI 互換 API 経由でログのバッチを投入し、タイムライン再構成・侵害指標(IOC)抽出・触れられた認証情報のマッピングを行わせます。

```bash
curl -s http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "forensic-analyzer",
    "messages": [
      {"role": "system", "content": "You are a forensic log analyst. Extract IOCs, timeline, and touched credentials from the following attacker action log excerpt."},
      {"role": "user", "content": "<ログ抜粋をここに挿入>"}
    ]
  }'
```

  4. 解析結果は隔離ホスト内に保管し、必要な要約のみを外部の対応チームへ共有します。ログ原本を外部サービスへ送信しません。

- アクセス制御の注意
  - このオンプレモデルは安全アライメントが弱いため、呼び出し可能な主体をインシデント対応者に限定します。
  - 推論エンドポイントへのアクセスは短命トークンで認可し、誰がどのログを投入したかを監査ログに残します。
  - 通常運用の生成用途とは権限・ネットワークを分離し、フォレンジック解析専用に隔離します。

## インシデント対応の運用

Hugging Face の 2026 年 7 月インシデントは、NIST SP 800-61 の 4 フェーズ (準備 / 検知・分析 / 封じ込め・根絶・復旧 / 事後対応) に沿って整理できます。攻撃は週末に発生し、悪意あるデータセットがデータ処理パイプラインの 2 つのコード実行パス (リモートコードデータセットローダーとテンプレート注入) を突く形で開始しました。侵入後は短命サンドボックス群で数千の個別アクションを実行し、公開サービスに自己移行型 C2 を段階的に配置、週末のうちに複数の内部クラスタへ横展開しました。

```mermaid
flowchart LR
  A[検知] --> B[トリアージ]
  B --> C[封じ込め]
  C --> D[根絶]
  D --> E[復旧]
  E --> F[事後対応]
  F --> A
```

### 検知・トリアージ・封じ込め・根絶・復旧の運用フロー

- **検知**: セキュリティテレメトリ上のシグナル相関で異常を捕捉します。
- **トリアージ**: 17,000 件超の行動ログを LLM で一次分類し、高重大度シグナルだけを人間アナリストに渡します。
- **封じ込め**: 該当ノード・クラスタをネットワーク隔離し、C2 の再接続経路を遮断します。
- **根絶**: 初期侵入に使われたデータセット実行パスを閉鎖し、テンプレート注入の余地を塞ぎます。
- **復旧**: 影響を受けた認証情報・トークンを取り消し・ローテーションしたうえで、既知良好状態からサービスを再開します。

各フェーズは NIST の定義どおり線形ではなく反復的です。根絶中に新たな横展開の痕跡が見つかれば、封じ込めフェーズへ戻ります。

### 週末・低監視時間帯の検知強化

攻撃側は監視要員が手薄な週末を狙って横展開しました。時間帯によらない検知体制を、しきい値の動的変更で作ります。

```yaml
alert_rule: high_severity_agentic_signal
correlation_window: 15m
weekend_threshold_override:
  enabled: true
  severity_floor: MEDIUM   # 平日は HIGH のみページング、週末は MEDIUM から自動ページング
  page_within: 5m
escalation:
  - on_call_primary
  - on_call_secondary       # 週末はオンコールを二重化
```

- 高重大度シグナルは数分単位でオンコールにページングします。
- 週末・夜間はページング閾値を平日より一段階引き下げます。
- オンコール担当は週末のみ二重配置にし、初動の見逃しを防ぎます。

### ノード再構築の手順

侵害の疑いがあるノードは、証拠保全と再投入を分離した手順で扱います。

1. **ネットワーク隔離**: 該当ノードを内部クラスタから切り離します。
2. **フォレンジックスナップショット取得**: ディスク・メモリダンプを取得し、証拠状態を「未確認」として保存します。
3. **認証情報棚卸し**: ノードが保持していたトークン・鍵を列挙します。
4. **認証情報の取り消し・ローテーション**: 棚卸し結果からスコープを逆算し、影響範囲を確定します。
5. **既知良好イメージからの再構築**: パッチ済みベースイメージ (データセット実行パス閉塞済み) を使います。
6. **最小権限での再投入**: 仕事の型から導出したスコープのみを付与します。
7. **監視強化期間の設定**: 再構築後 72 時間は検知しきい値を高感度側に寄せます。

### LLM トリアージによる大量行動ログの解析運用

17,000 件超の記録イベントを人手だけで解析すると、初動が数日単位に伸びます。バッチ処理と自動相関で一次分類の時間を圧縮します。

```python
for batch in chunk(action_log, size=500):
    signals = extract_signals(batch)          # プロセス起動 / 外向き通信 / 認証情報アクセス
    correlated = correlate(signals, window="15m")
    if correlated.severity >= HIGH:
        page_responder(correlated)
        mark_state(batch, "確認済み")
    else:
        mark_state(batch, "未確認")
```

- 攻撃コマンドや脆弱性ペイロードを含むログの解析は、商用 API がセーフガードでブロックする場合があります。
- ブロックされた区間はオープンウェイトモデル (今回は GLM 5.2 をオンプレ実行) に切り替えて解析を継続します。
- LLM トリアージの出力は最終判断ではなく一次分類として扱い、高重大度判定は人間アナリストが確認します。

### 証拠の状態管理

複数対応者が同時並行で動くインシデントでは、証拠の改ざん・重複編集が起きやすくなります。状態を 3 段階で管理します。

| 状態 | 定義 | 遷移条件 | 操作制約 |
|---|---|---|---|
| 未確認 | ログ収集直後、相関分析が未実施 | LLM トリアージまたは人間レビューが未着手 | 編集可、複製は禁止 |
| 確認済み | 相関分析と人間レビューが完了し、攻撃との関連が判明 | アナリスト 1 名以上の承認 | 追記のみ可、上書きは禁止 |
| 永続化済み | チェーンオブカストディに格納、ハッシュを固定 | 法務対応・対外報告での利用が確定 | read-only、参照時はハッシュ検証が必須 |

### 事後対応 (post-incident)

復旧後の事後対応フェーズは、フローの最終段でありながら記述が薄くなりがちです。本件で公式が実施した「外部フォレンジック専門家との協働」「法執行機関への報告」「ポリシー・手順の見直し」に沿って、運用手順として明文化します。

- **証拠共有範囲の取り決め**: 外部専門家へ渡すのは永続化済み証拠のハッシュ付きコピーに限定します。原本と認証情報の断片は自社環境に留めます。
- **対外報告のタイムライン**: 影響範囲の確定を待たずに一次開示し、確定後に詳細を追補します。法執行機関・規制当局への報告要否は法務が判断します。
- **再発防止レビュー**: キルチェーンの各段階を「どの防御が欠けて通したか」で振り返り、admission control やトークンスコープの不足を是正バックログへ登録します。
- **検知ルールの更新**: 抽出した IOC と攻撃パターンを検知ルールへ反映し、同型の再侵入を早期に捕捉できるようにします。

## 予防のベストプラクティス

過信を避けるため、各原則を「誤解 → 反証 → 推奨 → 適用条件」の順で示します。

### 権限境界を攻撃側の機械速度から再設計する

- **誤解**: 人間の承認フローがあれば異常操作は止められます。
- **反証**: 攻撃側は短命サンドボックス群で数千の個別アクションを機械速度で実行しました。公式は 1 アクションあたりの正確な実行時間を開示していませんが、17,000件超のイベントが週末という限られた時間内に実行された規模から、人手の承認は速度で追いつきません。
- **推奨**: 高頻度・高リスク操作は事前定義ポリシーでの自動遮断を主にし、人間レビューは事後監査と例外承認に限定します。
- **適用条件**: 自動遮断ポリシーの誤検知率が高いと正規業務が止まります。導入初期はログのみ収集する監視モードから始め、閾値を段階的に締めます。

### データ・モデル面を第一級の攻撃面として扱う

- **誤解**: 攻撃対象はネットワーク境界とアプリケーションコードが中心です。
- **反証**: 今回の初期侵入は、データセットローダーのコード実行パスとテンプレート注入でした。データ・モデルの読み込み経路そのものが侵入口になりました。
- **推奨**: データセット・モデルの読み込みパイプラインをサンドボックス化し、コード実行を伴うローダーはレビュー対象に含めます。
- **適用条件**: 既存パイプラインの実行パスを一律にサンドボックス化すると、正規のデータ処理が止まる場合があります。許可リスト方式で段階的に絞り込みます (トラブルシューティング参照)。

### 商用 API の「非対称性問題」への備え

- **誤解**: 商用 API と契約していれば、インシデント時のフォレンジック解析にも問題なく使えます。
- **反証**: 攻撃コマンドや脆弱性ペイロードの再現的な送信は、商用 API のセーフガードが有害コンテンツと判定してブロックしました。安全制御が強いモデルほど、フォレンジック解析という正当な用途でも拒否が起きます。
- **推奨**: インシデント前に、オンプレミスで実行可能な有能なオープンウェイトモデルを検証・準備しておきます。理由は 2 点です。攻撃データを外部環境に流出させない点と、商用 API のガードレールに解析を阻害されない点です。
- **適用条件**: オープンウェイトモデルは安全アライメントが商用モデルより弱く、フォレンジック解析以外の用途 (一般的な生成・公開応答) に転用するとリスクが増します。用途をインシデント解析に限定し、通常運用の権限とは分離します。

### トークン寿命・スコープ最小化 (仕事の型から権限を導出)

- **誤解**: サービスアカウントは長期トークンで運用したほうが管理コストが低くなります。
- **反証**: 横展開は、クラウド・クラスタ認証情報の収集を起点に拡大しました。長期・広域スコープの認証情報は、侵害後の影響範囲を広げます。
- **推奨**: 認証情報は「誰が使うか」ではなく「その仕事に何が必要か」から権限を導出します。タスク開始時に発行し完了時に失効する、短命・narrow-scope なトークンに統一します。
- **適用条件**: 短命トークンへの移行は、既存の長期トークン依存システムの棚卸しと並走させる必要があります。全面移行前は、少なくとも高権限 (クラウド管理・クラスタ操作) から優先的に置き換えます。

## 対処時の注意点

| 症状 | 原因 | 対処 |
|---|---|---|
| 商用モデルが攻撃ログの解析を拒否する | セーフガードが攻撃コマンド・脆弱性ペイロードの再現を有害コンテンツと判定 | オープンウェイトモデル (オンプレ実行、例 GLM 5.2) に切り替え、事前検証済みの解析パイプラインを使う |
| 週末に検知が遅れる | 監視要員が手薄で、高重大度シグナルの相関に時間がかかる | ページング閾値を週末仕様に引き下げ、LLM トリアージでシグナル相関を自動化する |
| トークン失効の影響範囲が読めない | 長期・広域スコープの認証情報が複数サービスで共有されている | 仕事の型から発行した短命・narrow-scope トークンへ棚卸しし、失効時の依存関係マップを事前作成する |
| データローダー隔離で正規処理が壊れる | コード実行パスを一律遮断すると、正規のデータセット処理も止まる | 実行パスを許可リスト化し、許可された処理のみサンドボックス経由で段階的に再開する |
| 証拠の破損・改ざんが疑われる | 複数対応者が同じ証跡ファイルを並行編集している | 未確認 → 確認済み → 永続化済みの状態管理を導入し、確認済み以降は read-only にする |
| 大量ログのトリアージで誤検知が多い | バッチ単位の相関ウィンドウが粗く、正規操作を高重大度と誤判定する | 相関ウィンドウとバッチサイズを調整し、LLM トリアージの判定を一次分類に限定して人間アナリストが最終確認する |

## まとめ

自律AIエージェントによる攻撃は、データ処理パイプラインという AI プラットフォーム固有の攻撃面から入り、機械速度で権限境界を越えて横移動しました。防御側は、データローダーの隔離・短命スコープトークン・admission control で被害範囲を設計的に抑え、商用APIのフォレンジック拒否に備えてオープンウェイトモデルを平時から準備しておくことが要点です。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！

## 参考リンク

### 概要 / 特徴

- [Security incident disclosure — July 2026 (Hugging Face 公式ブログ)](https://huggingface.co/blog/security-incident-july-2026)

### 構造

- [Securing a Cluster | Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/securing-a-cluster/)
- [Securing Admission Controllers | Kubernetes Blog](https://kubernetes.io/blog/2022/01/19/secure-your-admission-controllers-and-webhooks/)
- [Kubernetes Security Cheat Sheet | OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Kubernetes_Security_Cheat_Sheet.html)
- [Short-Lived Credentials in Agentic Systems: A Practical Trade-off Guide | GitGuardian Blog](https://blog.gitguardian.com/short-lived-credentials-in-agentic-systems-a-practical-trade-off-guide/)

### データ

- [MITRE ATT&CK T1078 Valid Accounts](https://attack.mitre.org/techniques/T1078/)
- [MITRE ATT&CK TA0004 Privilege Escalation](https://attack.mitre.org/tactics/TA0004/)
- [Open Cybersecurity Schema Framework (OCSF) actor object](https://schema.ocsf.io/1.3.0/objects/actor)
- [OCSF Schema (GitHub)](https://github.com/ocsf/ocsf-schema)
- [OAuth 2.0 Access Token Lifetime](https://www.oauth.com/oauth2-servers/access-tokens/access-token-lifetime/)
- [Token Lifetimes and Security in OAuth 2.0 (IDPro Body of Knowledge)](https://bok.idpro.org/article/id/108/)
- [Chain of Custody in Digital Forensics Explained (KnowledgeHut)](https://www.knowledgehut.com/blog/security/chain-of-custody-in-cyber-security)

### 構築方法 / 利用方法

- [Constraint Templates | Gatekeeper](https://open-policy-agent.github.io/gatekeeper/website/docs/constrainttemplates/)
- [Validating Admission Policy | Kubernetes](https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/)
- [gVisor Documentation](https://gvisor.dev/docs/)
- [Secure code execution — smolagents (Hugging Face)](https://huggingface.co/docs/smolagents/main/en/tutorials/secure_code_execution)
- [Loading methods / trust_remote_code — Hugging Face Datasets](https://huggingface.co/docs/datasets/main/en/dataset_script)
- [Tokens Management — Hugging Face Hub (Enterprise)](https://huggingface.co/docs/hub/en/enterprise-hub-tokens-management)
- [RFC 8628 — OAuth 2.0 Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628)
- [Configure Workload Identity Federation with AWS or Azure VMs — Google Cloud](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-clouds)
- [AssumeRole — AWS STS API Reference](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html)
- [Revoke IAM role temporary security credentials — AWS IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_revoke-sessions.html)
- [vllm serve — vLLM CLI Reference](https://docs.vllm.ai/en/latest/cli/serve/)

### 運用 / ベストプラクティス / トラブルシューティング

- [NIST SP 800-61 Incident Response Lifecycle | ForensicSpot](https://forensicspot.com/topics/incident-response-and-management/nist-sp-800-61-lifecycle)
- [NIST SP 800-61 Rev 3: New Incident Response Framework Guide | Linford & Co](https://linfordco.com/blog/nist-sp-800-61/)
- [OWASP LLM03:2025 Supply Chain](https://genai.owasp.org/llmrisk/llm032025-supply-chain/)
- [Least Privilege for AI Agents: Scopes, Time-Bound Access, and Blast Radius Control](https://tekysinfo.com/least-privilege-for-ai-agents-scopes-time-bound-access-and-blast-radius-control/)
- [How to implement least privilege for AI agents | Okta](https://www.okta.com/identity-101/how-to-implement-least-privilege-for-ai-agents/)
- [Responding to a Supply Chain Breach: Key Rotation, Version Pinning, and Scoping the Blast Radius | OX Security](https://www.ox.security/blog/responding-to-a-supply-chain-breach-a-guide-to-key-rotation-version-pinning-and-scoping-the-blast-radius/)
- [Blast Radius in Cybersecurity | Entro Glossary](https://entro.security/glossary/blast-radius-in-cybersecurity/)
- [Open-Weight AI Models: Safety Guardrails Can Be Removed in Minutes | Akerman LLP](https://www.akerman.com/en/perspectives/open-weight-ai-models-safety-guardrails-can-be-removed-in-minutes-using-free-publicly-available-tools.html)
- [Death by a Thousand Prompts: Open Model Vulnerability Analysis | Cisco Blogs](https://blogs.cisco.com/ai/open-model-vulnerability-analysis)
