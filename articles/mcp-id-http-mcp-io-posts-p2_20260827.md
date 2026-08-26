---
title: "MCP新ロードマップが優先するエージェントID、HTTP統一、長時間実行"
emoji: "🧭"
type: "tech"
topics: ["MCP", "OAuth", "Security", "AIAgent"]
published: false
---

Model Context Protocol（MCP）のコアメンテナが、2026-08-22 に新しいロードマップを公開しました。仕様改訂 `2026-07-28` の先、6〜12 か月の優先領域を 5 つに整理したものです。

この記事では、5 つの優先領域が何を解こうとしているのか、そのうち今日すでに使えるものはどれで、まだ提案段階のものはどれかを、仕様・SEP・RFC の粒度まで落として整理します。読み終えたときに、次のことが判断できる状態を目指します。

- 自分の MCP クライアント / サーバーが、どの呼び出し元類型に当てはまるか
- いま本番へ入れてよい認可経路と、Final を待つべき経路の線引き
- 長時間実行・サーバー起点イベントを、現行仕様の範囲でどう組むか

なお公式ロードマップは、内容を current thinking（現時点の考え）と位置づけています。次リビジョンへの確約ではありません。この記事も同じ前提で読んでください。

この記事の主眼は、2026-03 から 2026-08 への優先領域の組み替えと、いま採用してよいものと待つべきものの線引きです。土台となる `2026-07-28` 仕様そのもの（ステートレス化、`server/discover`、キャッシュ、Tasks）と EMA の詳細フローは、ロードマップを読むのに必要な範囲で本文中に要約し、根拠は各節から公式仕様へ直接リンクしています。

![記事の全体像](/images/mcp-id-http-mcp-io-posts-p2_20260827/overview.png)
*この記事の全体像。以下、順に解説します。*

## 概要

![MCP ロードマップの 5 つの優先領域](/images/mcp-id-http-mcp-io-posts-p2_20260827/01_priority-areas.png)

新ロードマップの出発点は、呼び出し元の変化です。現行の MCP 認可は、人がブラウザで同意する対話型フローを中心に組み立てられています。しかし実際の呼び出し元は、クラウド上のワークロード、ユーザー不在の代理実行、親より狭い権限のサブエージェントへ広がりました。新ロードマップは、エージェント ID・委譲・非同期イベント・長時間タスクを優先領域へ引き上げます。

前提として、MCP の認可はプロトコル全体では OPTIONAL です。HTTP ベースのトランスポートは認可仕様に適合すべき（SHOULD）とされ、stdio は環境から資格情報を取得し、この認可仕様には従うべきでない（SHOULD NOT）とされています。

```mermaid
flowchart TD
    Now["現行 2026-07-28"]
    N1["1 Agentic Messaging"]
    N2["2 HTTP-Native Transport"]
    N3["3 Agent Identity"]
    N4["4 Improved Primitives"]
    N5["5 Improved SDK DX"]
    Now --> N1
    Now --> N2
    Now --> N3
    Now --> N4
    Now --> N5
```

| 要素 | 説明 |
|---|---|
| 現行 2026-07-28 の対話型認可 | 人がブラウザで同意する OAuth 2.1 認可コードフローと PKCE。HTTP トランスポート向け認可仕様の中心 |
| エージェント ID と委譲 | クラウドワークロード自身の ID、ユーザー代理、サブエージェントへの狭い権限委譲を規格化する優先領域 |
| HTTP ネイティブトランスポート統一 | リモート MCP を通常の HTTP ワークロードとして扱い、stdio も同一の Streamable HTTP へ寄せる優先領域 |
| 長時間実行 Tasks とサーバー起点イベント | 分単位の作業、途中操舵、完了のプッシュ通知を揃える優先領域 |

### 旧ロードマップとの差分

2026-03-09 の旧ロードマップは 4 優先領域で、Horizon に triggers、result types、deeper security、extensions を置いていました。2026-08-22 の新ロードマップは 5 優先領域です。Horizon にあった server-initiated events、result type、agent identity を本線へ上げています。ガバナンス成熟は `2026-07-28` の周期で進捗したため、独立した優先領域からは外れました。

```mermaid
flowchart LR
    T["旧 トランスポート進化"]
    A["旧 エージェント通信"]
    G["旧 ガバナンス成熟"]
    E["旧 エンタープライズ"]
    H["旧 Horizon"]
    N1["新 Agentic Messaging"]
    N2["新 HTTP-Native Transport"]
    N3["新 Agent Identity"]
    N4["新 Improved Primitives"]
    N5["新 Improved SDK DX"]
    T --> N2
    A --> N1
    E --> N3
    H --> N1
    H --> N3
    H --> N4
    G -.->|"独立領域から外れる"| N5
```

| 観点 | 2026-03 旧ロードマップ | 2026-08 新ロードマップ |
|---|---|---|
| 公開日 | 2026-03-09 | 2026-08-22 |
| 優先領域数 | 4 | 5 |
| トランスポート | セッションの水平分散と `.well-known` | リモート HTTP 化のあと、stdio を Streamable HTTP へ統一 |
| エージェント通信 | experimental Tasks | サーバー起点イベント、合成レビュー、Tasks のコア取り込み方向 |
| ガバナンス | Contributor Ladder と WG への SEP 委任 | 独立優先領域から外れる。SDK DX は別領域であり後継ではない |
| エンタープライズ | SSO と監査を広く定義 | エージェント ID、DPoP、WIF、ID-JAG、token exchange へ具体化 |

### 期間内 deliverable と担当

| # | 優先領域 | 担当 Core Maintainer | 期間内の対象 | 担当 WG |
|---|---|---|---|---|
| 1 | Agentic Messaging Primitives | Caitie McCaffrey、Clare Liguori、Peter Alexander | サーバー起点イベント。Agents / Transports / Triggers and Events の合成レビュー | Triggers and Events、Agents、Transports |
| 2 | HTTP-Native Transport Unification and Hardening | Kurtis Van Gent、Nick Cooper | HTTP over stdio。ETag を含むキャッシュ拡張 | Transports |
| 3 | Agent Identity and Enterprise-Ready Security | Paul Carleton、Den Delimarsky | DPoP の確定と普及。WIF、ID-JAG、RFC 8693 による ID と委譲 | Agent Identity WG（forming） |
| 4 | Improved Primitives | Kurtis Van Gent、Peter Alexander、Den Delimarsky | `tools/call` 結果形。progressive discovery。primitive annotations | Core Primitives WG（forming） |
| 5 | Improved SDK Developer Experience | Den Delimarsky、David Soria Parra | 拡張契約。仕様からの Tier 1 SDK 生成実験 | SDK WG |

優先領域内の SEP は審査が先行します。領域外の SEP も審査対象ですが、メンテナの時間は領域内へ先に割かれます。

期間内 deliverable の外側（公式ロードマップの「Beyond these」）は次のとおりです。

| 領域 | Beyond these |
|---|---|
| Agentic Messaging | Tasks（SEP-2663）のコア取り込みへ向けた継続 |
| HTTP-Native Transport | 全サーフェスの標準エラー、SEP-2575 後の tool list の capability scoping、サーバー設定の安全な受け渡し |
| Agent Identity | human-presence attestation ほか、WG 形成後に範囲入りし得る議論 |
| Improved Primitives | File Uploads WG による範囲付きファイル操作と階層 listing |
| Improved SDK DX | reference servers / quickstart の所有と鮮度 |

### 出荷済みと未出荷の線引き

ロードマップを読むうえで最も実務に効くのは、成熟度の区別です。次の 3 段階で見ると判断を誤りません。

1. **コア / Stable**: 仕様 `2026-07-28` 本体、または公式拡張の stable。本番前提で採用できます。
2. **公開済み Draft**: 仕様が公開され実装もできますが、互換性の変更があり得ます。受容できる範囲で採用します。
3. **未マージ SEP / 議論中**: Open PR、forming の WG、Horizon 項目。ゲートや SDK 制約へ落としません。

| 区分 | 項目 | 位置づけ |
|---|---|---|
| 出荷済み 2026-07-28 | プロトコルレベルセッションと `initialize` ハンドシェイクの廃止 | SEP-2575、SEP-2567 |
| 出荷済み 2026-07-28 | `server/discover` | 接続前に版と能力を知る |
| 出荷済み 2026-07-28 | リスト結果のキャッシュ | SEP-2549。`ttlMs` と `cacheScope` |
| 出荷済み 拡張 | Tasks | SEP-2663。公式拡張 `io.modelcontextprotocol/tasks`。コアへの取り込みは継続 |
| 出荷済み 2026-07-28 | MRTR | SEP-2322。サーバー起点リクエストの置換 |
| 出荷済み 認可 | issuer 検証、CIMD 優先、DCR 非推奨 | コア認可仕様 |
| 出荷済み 拡張 | Enterprise-Managed Authorization | `io.modelcontextprotocol/enterprise-managed-authorization`。stable |
| 公開済み Draft 拡張 | OAuth Client Credentials | `io.modelcontextprotocol/oauth-client-credentials`。draft。実装可能だが変更リスクを受容する場合に限る |
| 出荷済み トランスポート | リモート MCP を通常の HTTP ワークロードとして扱えること | Streamable HTTP。HTTP+SSE は Deprecated |
| 未出荷 | サーバー起点イベント（webhooks / channels） | Triggers and Events WG |
| 未出荷 | HTTP over stdio（HTTP/2 over stdio を検討） | 単一バインディング |
| 未出荷 | ETag によるキャッシュ拡張 | `ttlMs` / `cacheScope` の先 |
| 未出荷 | DPoP の確定と普及 | RFC 9449。Agent Identity WG |
| 未出荷 | WIF SEP-1933 | Open PR。RFC 7523 jwt-bearer + OIDC Discovery |
| 未出荷 | RFC 8693 によるサブエージェント委譲の意見付き経路 | IETF OAuth / WIMSE と連携 |
| 議論中 | human-presence attestation | 対話型クライアントとヘッドレスエージェントの区別 |

Tasks のポーリング（`tasks/get`）、途中入力（`tasks/update`）、協調的キャンセル（`tasks/cancel`）は拡張として出荷済みです。完了をサーバーからプッシュする webhooks / channels は未出荷です。

ID-JAG を使う Enterprise-Managed Authorization（EMA）も拡張として出荷済みです。一方、エージェント自身のワークロード ID（WIF）と、親から子への狭い権限委譲（RFC 8693 の MCP プロファイル）は未出荷です。

採用判断の目安を、GA 相当と見なせる条件として置いておきます。

- SEP-1933: GitHub PR が Merged し、仕様改訂本文に入るまで、本番 MCP AS へ jwt-bearer を投げない
- DPoP: MCP Authorization が `token_type=DPoP` を MUST / SHOULD と書くまで、全社必須化しない
- Agent Identity WG: community の WG ページが forming から外れるまで、成果物をコア扱いしない
- HTTP over stdio / ETag / webhooks: Transports または Triggers and Events の SEP が Final になるまで、現行パイプラインを維持する

### 認可方式の比較

比較の軸はグラントと主体です。トークンが JWT か opaque かは Authorization Server（AS）の実装選択なので、プロトコル固有の列とは分けています。RFC 8628 Device Flow は MCP 現行認可の採用グラントではありませんが、関連する OAuth グラントとして併記します。

| 比較項目 | 対話型 OAuth+PKCE | EMA+ID-JAG | WIF SEP-1933 JWT-bearer | API キー | Device Flow RFC 8628 |
|---|---|---|---|---|---|
| MCP 上の位置づけ | コア認可仕様 `2026-07-28` の中心フロー | 公式認可拡張。stable | Open PR。ロードマップ期間の対象 | 仕様のグラント一覧の外。現行サーバーの運用慣行 | 仕様の採用グラント一覧の外 |
| 土台規格 | OAuth 2.1 認可コード、PKCE、RFC 8707、RFC 9728、RFC 9207、CIMD | IETF ID-JAG draft、RFC 8693、RFC 7523 | RFC 7523 jwt-bearer、OpenID Connect Discovery | 共有秘密の手渡し | RFC 8628 |
| 主体 | リソースオーナーである人 | 企業 IdP が方針で認めた従業員 | プラットフォームが発行したワークロード ID | キー文字列の保持者 | 承認する人と `device_code` を持つ実行側 |
| 同意チャネル | MCP 認可サーバーへブラウザでリダイレクト | 企業 IdP への SSO。MCP AS の authorization endpoint は使わない | ブラウザ同意を省略し、信頼した issuer の JWT を提示 | 発行時の人手 | 別デバイスのブラウザで `user_code` を承認 |
| グラント | `authorization_code` + `code_verifier` | IdP が ID-JAG を発行。MCP AS が jwt-bearer でアクセストークンを返す | `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` | 共有秘密そのものを提示 | `urn:ietf:params:oauth:grant-type:device_code` |
| クライアント登録 | CIMD 優先。DCR は非推奨 | 拡張の宣言と組織設定 | クライアント登録なし。AS が trusted issuer allowlist を持つ | キーの配布台帳 | OAuth クライアントとしての登録 |
| 人の在席 | 同意時点でブラウザに人がいる | 初回 SSO に人がいる | エージェントが自身として動く | 発行時のみ | 承認時点で別デバイスに人がいる |
| ロードマップとの関係 | 対話型クライアント向けの現行解 | 企業ユーザーの中央管理として出荷済み | 常駐クラウドエージェント向けの意見付き経路 | 貼り付けキーと長期 refresh token を置き換える対象 | 対話型かつブラウザレスな実行環境向けの関連解 |

DPoP（RFC 9449）は、これらのグラントの上に載る所持証明です。Agent Identity WG が仕様確定と普及を期間内対象にしています。

ユーザー不在の呼び出し元については、もう 1 つ公式拡張があります。[OAuth Client Credentials](https://modelcontextprotocol.io/extensions/auth/oauth-client-credentials)（`io.modelcontextprotocol/oauth-client-credentials`）です。バックグラウンドサービス、CI/CD、サーバー間連携、デーモン向けに、OAuth 2.0 client credentials フローを MCP へ持ち込みます。資格情報は client secret か、推奨される署名 JWT アサーション（RFC 7523）です。ext-auth リポジトリ上の成熟度は Draft で、stable の EMA とは段階が違います。実装はできますが、互換性の変更があり得る前提で採用してください。

WIF SEP-1933 と混同しないでください。両者はユーザー不在という点だけが共通です。

| 観点 | OAuth Client Credentials 拡張 | WIF SEP-1933 |
|---|---|---|
| 位置づけ | 公式認可拡張。Draft | コア仕様への Open PR |
| 身元の出どころ | 事前登録したアプリケーション資格情報 | 実行基盤が投影するワークロード ID |
| クライアント登録 | 必要。client secret または公開鍵を AS へ登録 | 不要。AS が trusted issuer allowlist を持つ |
| 秘密の管理 | client secret または署名鍵を自前で保持 | プラットフォーム発行の短命 JWT を都度受け取る |
| 今の採用可否 | 実装可能。ただし Draft 段階の変更リスクを受容する場合 | 不可。PR が Merged するまで待つ |

つまり「常駐型は WIF が Final になるまで API キーのまま」ではありません。事前登録済みの資格情報で足りるなら、Client Credentials 拡張が貼り付け API キーからの現実的な移行先になります。プラットフォームの federated identity をそのまま使いたい場合に限り、WIF を待つことになります。

### ユースケース別の推奨

| ユースケース | 推奨 | 根拠 |
|---|---|---|
| 対話型クライアント | コアの認可コード + PKCE | 人がブラウザで同意する前提に、現行仕様が合わせてあります |
| 対話型かつ企業統制下のクライアント | EMA + ID-JAG | 同意の決定主体を企業 IdP に置けます |
| 常駐クラウドエージェント（事前登録できる） | OAuth Client Credentials 拡張 | 公式拡張として実装できます。成熟度は Draft なので変更リスクを受容できる場合に限ります |
| 常駐クラウドエージェント（基盤の workload ID を使いたい） | WIF SEP-1933 の JWT-bearer | スコープはエージェントが自身として動く場合です。Open PR のため採用は提案段階です |
| サブエージェント委譲 | RFC 8693 token exchange による狭い権限の再発行 | MCP 固有プロファイルは未出荷です |
| 試作・一時接続 | API キー | ロードマップが置き換え対象とする現行運用です |

## 特徴

- **優先領域の再編成**: 2026-03 の 4 領域と Horizon を、2026-08 の 5 領域へ組み替えます。
- **方向の明示**: 公式 Note は current thinking として示します。SEP 審査の時間配分の指針になります。
- **対話型からエージェント ID へ**: 現行認可はブラウザ同意です。新領域はクラウドワークロード ID、ユーザー代理、サブエージェント委譲を、既存 IETF 規格の組み合わせで扱います。
- **出荷済み EMA と未出荷 WIF の併用**: 企業ユーザー経路の ID-JAG は拡張として安定しています。ワークロード自身の JWT-bearer は SEP-1933 として Open PR です。
- **所持証明の追加**: DPoP の確定と普及を、forming 中の Agent Identity WG が担います。
- **長時間実行の部品揃え**: Tasks 拡張、`subscriptions/listen`、progress は既に使えます。サーバー起点の webhooks / channels と、ライフサイクル・キャンセル・エラー面の共有が期間内の焦点です。
- **単一トランスポート**: リモートは通常の HTTP ワークロードです。ローカル stdio も Streamable HTTP の単一バインディングへ寄せます。
- **キャッシュの深化**: `ttlMs` と `cacheScope` に加え、ETag で primitive 結果の版管理を足します。
- **結果形の一本化**: `tools/call` が `content` と `structuredContent` を同時に返す現状を、一つの契約へ寄せます。
- **段階的発見**: 巨大なツール一覧を最初からモデルへ渡す代わりに、会話の焦点に合わせてカタログを開きます。
- **認可の適用範囲**: 認可は OPTIONAL です。適用対象は HTTP です。stdio は環境の資格情報です。

## 構造

ここからは、5 つの優先領域を C4 相当の粒度で分解します。対象は OSS 製品ではなく提案フレームワークなので、C4 は論理構造への読み替えです。出荷済みは仕様 `2026-07-28` コアまたは公式拡張の stable、未出荷はロードマップ期間の deliverable・Open PR・WG forming・議論中を指します。

### システムコンテキスト図

対象システムは MCP Host / Client / Server / AS です。現行認可は対話型ユーザーがブラウザで同意する前提です。ロードマップは、クラウドエージェントとサブエージェントを第一級の呼び出し元にします。

```mermaid
flowchart TD
    subgraph actors["アクター"]
        User["対話型ユーザー"]
        CloudAgent["クラウドエージェント"]
        SubAgent["サブエージェント"]
        IdPAdmin["企業IdP管理者"]
    end
    subgraph mcp["MCP対象システム"]
        Host["MCP Host"]
        Client["MCP Client"]
        Server["MCP Server"]
        AS["MCP Authorization Server"]
    end
    subgraph ext["外部システム"]
        IdP["企業IdP"]
        OAuthWG["IETF OAuth"]
        WIMSE["IETF WIMSE"]
        PlatformId["プラットフォーム<br/>ワークロード身元"]
    end
    User -->|"ブラウザで同意する 出荷済み"| Host
    CloudAgent -->|"自身の身元で到達する 未出荷"| Client
    SubAgent -->|"狭い権限で委任される 未出荷"| Client
    IdPAdmin -->|"アクセス方針を設定する 出荷済み拡張"| IdP
    Host -->|"生成し管理する"| Client
    Client -->|"JSON-RPC を送る"| Server
    Client -->|"トークンを要求する"| AS
    Server -->|"トークンを検証する"| AS
    Client -->|"ID-JAG を要求する 出荷済み拡張"| IdP
    IdP -->|"ID-JAG を発行する 出荷済み拡張"| Client
    AS -->|"ID-JAG を検証する 出荷済み拡張"| IdP
    CloudAgent -->|"短命JWTを受ける 未出荷"| PlatformId
    Client -->|"JWT-bearer で交換する 未出荷"| AS
    OAuthWG -->|"OAuthとDPoPとToken Exchangeを進化させる"| AS
    WIMSE -->|"ワークロード身元の隙間を埋める"| PlatformId
```

アクターの内訳です。

| 要素名 | 説明 | 出荷 |
|---|---|---|
| 対話型ユーザー | ブラウザ User-Agent で認可コードと PKCE に同意する人です | 出荷済み |
| クラウドエージェント | ユーザー不在のクラウドワークロードです。プラットフォーム発行の短命 JWT を自身の身元として使います | 未出荷 |
| サブエージェント | 親エージェントより狭い権限で到達する委譲先です | 未出荷 |
| 企業 IdP 管理者 | 企業 IdP 上で MCP サーバーへのアクセス方針を設定する人です | 出荷済み拡張 |

対象システムの内訳です。

| 要素名 | 説明 | 出荷 |
|---|---|---|
| MCP Host | 対話とエージェント実行を束ね、Client を生成・管理するアプリケーションです | 出荷済み |
| MCP Client | 1 サーバーと 1 対 1 で通信する OAuth クライアントです。HTTP では認可仕様に従うべきで、stdio では従うべきでないとされます | 出荷済み |
| MCP Server | ツール・リソース・プロンプトを公開する OAuth リソースサーバーです。認可は OPTIONAL です | 出荷済み |
| MCP Authorization Server | アクセストークンを発行する認可サーバーです。Server と同居しても分離しても構いません | 出荷済み |

外部システムの内訳です。

| 要素名 | 説明 | 出荷 |
|---|---|---|
| 企業 IdP | 従業員を認証し、組織方針に基づき ID-JAG を発行する IdP です | 出荷済み拡張 |
| IETF OAuth | OAuth 2.1、DPoP、Token Exchange、CIMD など MCP が採用する標準の作業部会です | 外部標準 |
| IETF WIMSE | 複数システム環境のワークロード身元を扱う作業部会です | 外部標準 |
| プラットフォームワークロード身元 | 実行基盤がワークロードへ短命 JWT を投影する仕組みです | 未出荷の入力 |

### コンテナ図

対象システムを 5 つの優先領域へ分解します。この粒度では具体 SEP 名を使わず、役割で表現します。

```mermaid
flowchart TD
    subgraph messaging["Messaging"]
        MsgCore["長時間作業と途中操作"]
        MsgPush["サーバー起点イベント"]
        MsgCompose["ライフサイクルの合成"]
    end
    subgraph transport["Transport"]
        HttpRemote["リモートHTTP作業負荷"]
        HttpLocal["ローカル単一バインディング"]
        HttpCache["キャッシュ硬化"]
    end
    subgraph identity["Identity"]
        HumanAuth["対話型認可"]
        AgentAuth["エージェント身元と委任"]
        Proof["所持証明"]
    end
    subgraph primitives["Primitives"]
        ToolResult["ツール結果の契約"]
        Discovery["段階的発見"]
        Annot["注釈の見直し"]
    end
    subgraph sdk["SDK"]
        Conformance["適合と手メンテ"]
        ExtContract["拡張契約"]
        Codegen["生成成果物実験"]
    end
    MsgCore -->|"完了を知らせる"| MsgPush
    MsgPush -->|"合成対象になる"| MsgCompose
    HttpRemote -->|"同一モデルを伸ばす"| HttpLocal
    HttpRemote -->|"結果版管理を足す"| HttpCache
    HumanAuth -->|"呼び出し元を広げる"| AgentAuth
    AgentAuth -->|"トークン盗難耐性を足す"| Proof
    ToolResult -->|"大規模カタログへ進む"| Discovery
    Discovery -->|"キャッシュと交差する"| HttpCache
    Annot -->|"可視性の混乱を解く"| ToolResult
    Conformance -->|"仕様から再生成する"| Codegen
    ExtContract -->|"役割束縛を決める"| Conformance
    MsgCompose -->|"輸送制約を共有する"| HttpRemote
    AgentAuth -->|"長寿命秘密を置き換える"| HttpRemote
```

Messaging の内訳です。

| 要素名 | 説明 | 出荷 |
|---|---|---|
| 長時間作業と途中操作 | 分単位の作業、途中入力、協調キャンセルを扱うメッセージ基盤です。既存の Tasks、購読、進捗通知が土台です | 土台は出荷済み |
| サーバー起点イベント | チャネルと webhook で完了を知らせます。Triggers and Events WG の期間内 deliverable です | 未出荷 |
| ライフサイクルの合成 | Tasks と Triggers が共有の寿命・取消・エラー面を持つかを横断レビューします | 未出荷 |

Transport の内訳です。

| 要素名 | 説明 | 出荷 |
|---|---|---|
| リモート HTTP 作業負荷 | `2026-07-28` でリモート MCP は通常の HTTP 作業負荷になりました | 出荷済み |
| ローカル単一バインディング | Streamable HTTP を stdin/stdout 上の単一バインディングにします。HTTP/2 over stdio で多重化を検討します | 未出荷 |
| キャッシュ硬化 | 一覧とリソース読取の TTL に加え、ETag でプリミティブ結果の版管理を足します | TTL は出荷済み、ETag は未出荷 |

Identity の内訳です。

| 要素名 | 説明 | 出荷 |
|---|---|---|
| 対話型認可 | 人がブラウザで承認する現行モデルです | 出荷済み、OPTIONAL |
| エージェント身元と委任 | エージェント自身の身元、ユーザー不在の代理、サブエージェントへの狭い委任の意見付き経路です | 未出荷 |
| 所持証明 | アクセストークンの所持を証明し、貼り付けた API キーと長寿命リフレッシュトークンからの離脱を進めます | 未出荷 |

Primitives と SDK の内訳です。

| 要素名 | 説明 | 出荷 |
|---|---|---|
| ツール結果の契約 | 同一出力が複数形で返る混乱を解消します | 現行形は出荷済み、再設計は未出荷 |
| 段階的発見 | 巨大カタログを一括投入せず、会話の絞り込みに応じて公開します | 未出荷 |
| 拡張契約 | 拡張が束縛する役割、SDK の必須実装、梱包、版付き能力追加を決めます | 未出荷 |

### コンポーネント図

各コンテナを、SEP と RFC の具体名でドリルダウンします。まず Messaging と Transport です。

```mermaid
flowchart TD
    subgraph messagingC["Messagingコンポーネント"]
        Tasks["SEP-2663 Tasks 拡張"]
        GetTask["tasks/get"]
        Listen["subscriptions/listen"]
        Progress["progress notifications"]
        MRTR["SEP-2322 MRTR"]
        Webhook["サーバー起点イベント"]
        Compose["合成レビュー"]
    end
    subgraph transportC["Transportコンポーネント"]
        SHTTP["Streamable HTTP POST"]
        Headers["MCP-Protocol-Version<br/>Mcp-Method Mcp-Name"]
        Stateless["SEP-2575 SEP-2567"]
        CacheTTL["SEP-2549 ttlMs cacheScope"]
        StdioH["HTTP over stdio"]
        ETag["ETag キャッシュ"]
    end
    Tasks -->|"既定 poll"| GetTask
    Tasks -->|"任意 push"| Listen
    Progress -->|"リクエスト応答ストリームに乗る"| SHTTP
    MRTR -->|"サーバー起点リクエストを置換"| SHTTP
    Webhook -->|"ポーリング代替"| Compose
    SHTTP -->|"必須ヘッダ"| Headers
    Stateless -->|"水平分散を可能にする"| SHTTP
    CacheTTL -->|"一覧と読取に付く"| SHTTP
    StdioH -->|"同一バインディングを局所へ"| SHTTP
    CacheTTL -->|"版管理で強化される"| ETag
```

続いて Identity、Primitives、SDK です。

```mermaid
flowchart TD
    subgraph identityC["Identityコンポーネント"]
        OAuth21["OAuth 2.1 PKCE Bearer"]
        CIMD["CIMD 優先 DCR 非推奨"]
        PRM["RFC 9728 PRM"]
        EMA["EMA ID-JAG SEP-990"]
        DPoP["RFC 9449 DPoP"]
        WIF["SEP-1933 WIF RFC 7523"]
        TE["RFC 8693 Token Exchange"]
    end
    subgraph primitivesC["Primitivesコンポーネント"]
        CallShape["tools/call 結果形"]
        ProgDisc["progressive discovery"]
        Ann["content annotations"]
    end
    subgraph sdkC["SDKコンポーネント"]
        ExtFw["SEP-2133 拡張枠"]
        ExtRole["extension contract"]
        GenArt["generated-artifacts experiment"]
    end
    OAuth21 -->|"発見"| PRM
    OAuth21 -->|"登録"| CIMD
    EMA -->|"IdP 決定主体"| OAuth21
    WIF -->|"jwt-bearer 交換"| OAuth21
    TE -->|"狭い権限へ委譲"| WIF
    DPoP -->|"所持証明"| OAuth21
    CallShape -->|"キャッシュと交差"| ProgDisc
    Ann -->|"可視性の混乱"| CallShape
    ExtFw -->|"Tasks と EMA を載せる"| ExtRole
    ExtRole -->|"役割束縛"| GenArt
```

Messaging コンポーネントの内訳です。

| 要素名 | 説明 | 出荷 |
|---|---|---|
| SEP-2663 Tasks 拡張 | 公式拡張 `io.modelcontextprotocol/tasks` です。メソッドは `tasks/get`、`tasks/update`、`tasks/cancel` です。キャンセルは協調的です。コア取り込みは継続中です | 拡張として出荷済み、コアは未出荷 |
| subscriptions/listen | 長寿命 POST の SSE ストリームです。HTTP GET ストリームは廃止済みです | 出荷済み |
| progress notifications | 進捗は該当リクエストの応答ストリームに流れます。listen ストリームには載せません | 出荷済み |
| SEP-2322 MRTR | サーバーは `InputRequiredResult` を返し、クライアントは元リクエストを再送します | 出荷済み |
| サーバー起点イベント | Triggers and Events WG がチャネルと webhook を含むプッシュ配送を定義します | 未出荷 |

Transport コンポーネントの内訳です。

| 要素名 | 説明 | 出荷 |
|---|---|---|
| Streamable HTTP POST | 単一 MCP エンドポイントへの POST です。応答は JSON またはリクエスト範囲の SSE です | 出荷済み |
| Streamable HTTP headers | 必須ヘッダは `MCP-Protocol-Version`、`Mcp-Method`、該当時の `Mcp-Name` です。本文との不一致は HeaderMismatch `-32020` です | 出荷済み |
| SEP-2575 / SEP-2567 | `initialize` ハンドシェイクとセッション識別を廃止します | 出荷済み |
| SEP-2549 | 一覧結果とリソース読取へ `ttlMs` と `cacheScope` を足します | 出荷済み |
| HTTP over stdio | Streamable HTTP を stdin/stdout の単一バインディングにします | 未出荷 |

Identity コンポーネントの内訳です。

| 要素名 | 説明 | 出荷 |
|---|---|---|
| OAuth 2.1 PKCE Bearer | HTTP トランスポートの現行認可です。フローはブラウザ User-Agent を含む認可コードと PKCE です。クエリ掲載は禁止で、audience 検証は MUST です | 出荷済み |
| CIMD 優先 / DCR 非推奨 | Client ID Metadata Documents が優先登録経路です。RFC 7591 の DCR は非推奨です | 出荷済み |
| RFC 9728 PRM | Protected Resource Metadata で AS を発見します。MCP サーバーは MUST 実装です | 出荷済み |
| EMA / ID-JAG / SEP-990 | IdP が ID-JAG を発行し、MCP AS が検証してアクセストークンを返します。ユーザーは MCP AS の authorization endpoint へリダイレクトしません | 出荷済み拡張 |
| RFC 9449 DPoP | Agent Identity WG が仕様確定と普及を期間内 deliverable とします | 未出荷 |
| SEP-1933 WIF / RFC 7523 | `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` と OIDC Discovery です。クライアント登録は不要です。GitHub PR は Open です | 未出荷 |
| RFC 8693 Token Exchange | サブエージェントへの狭い権限が MCP 側の想定用途です | IETF は標準、MCP 採用は未出荷 |

Primitives と SDK コンポーネントの内訳です。

| 要素名 | 説明 | 出荷 |
|---|---|---|
| tools/call 結果形 | `content` と `structuredContent` の同時返却が実装を分岐させます。Core Primitives WG が契約を再設計します | 現行は出荷済み、再設計は未出荷 |
| progressive discovery | クライアントは必要に応じてツールとリソースを学びます | 未出荷 |
| content annotations | 対象読者と優先度を宣言します。ツール結果への適用が検討対象です（SEP-2200） | 出荷済み |
| SEP-2133 拡張枠 | リバース DNS の拡張 ID です。Tasks と EMA が載ります | 出荷済み |
| extension contract | 拡張が束縛する役割は host / client / server / agent です | 未出荷 |
| generated-artifacts experiment | 仕様から候補 Tier 1 SDK を生成し、適合試験で検証します | 未出荷 |

現行サーバーが頼っている貼り付け API キーと長寿命リフレッシュトークンは、標準化対象の反面です。

## データ

ロードマップが扱う主体とトークンを、型として並べます。以下の `InteractiveClient` / `CloudWorkloadAgent` / `SubAgent` は、ロードマップが挙げる呼び出し元 3 類型に付けた概念名です。MCP JSON Schema の型名ではありません（仕様未記載）。

### 概念モデル

```mermaid
flowchart TB
  subgraph AgentCaller
    InteractiveClient
    CloudWorkloadAgent
    SubAgent
  end
  subgraph TokenArtifacts
    AccessToken
    RefreshToken
    DPoPProof
    WorkloadJWT
    IDJAG
    TokenExchangeRequest
  end
  subgraph TaskArtifacts
    CreateTaskResult
    Task
    TaskStatus
  end
  subgraph TransportArtifacts
    StreamableHTTPHeaders
    CacheableResult
  end
  subgraph CapabilityArtifacts
    ClientCapabilities
    DiscoverResult
    ServerCapabilities
    ProtectedResourceMetadata
    AuthorizationServerMetadata
  end
  InteractiveClient --> AccessToken
  InteractiveClient --> RefreshToken
  InteractiveClient --> DPoPProof
  InteractiveClient --> IDJAG
  CloudWorkloadAgent --> WorkloadJWT
  CloudWorkloadAgent --> DPoPProof
  SubAgent --> TokenExchangeRequest
  SubAgent --> AccessToken
  WorkloadJWT --> TokenExchangeRequest
  IDJAG --> TokenExchangeRequest
  TokenExchangeRequest --> AccessToken
  DPoPProof --> AccessToken
  RefreshToken --> AccessToken
  AccessToken --> StreamableHTTPHeaders
  ClientCapabilities --> StreamableHTTPHeaders
  DiscoverResult --> CacheableResult
  DiscoverResult --> ServerCapabilities
  ClientCapabilities --> CreateTaskResult
  ServerCapabilities --> CreateTaskResult
  CreateTaskResult --> Task
  Task --> TaskStatus
  ProtectedResourceMetadata --> AuthorizationServerMetadata
  AuthorizationServerMetadata --> TokenExchangeRequest
```

呼び出し元 3 類型です。

| 要素名 | 説明 |
|---|---|
| InteractiveClient | ブラウザ User-Agent で人が同意する対話型の呼び出し元です。現行 MCP Authorization の主経路（Authorization Code + PKCE）です |
| CloudWorkloadAgent | クラウド / Kubernetes / SPIFFE 上で独自の workload 身分を持つ呼び出し元です。WIF（SEP-1933、Draft）と RFC 7523 jwt-bearer が経路です |
| SubAgent | 親より狭い権限へ委任される呼び出し元です。RFC 8693 token exchange（`actor_token` / `act` / `may_act`）が経路候補です |

トークン成果物です。

| 要素名 | 説明 |
|---|---|
| AccessToken | MCP Resource Server への保護リクエストに使うトークンです。現行は `Authorization: Bearer` です。DPoP 採用時は `token_type` が `DPoP` になり得ます（RFC 9449。MCP 側は未 finalize） |
| RefreshToken | アクセストークン再発行用です。発行は AS の裁量で、クライアントは機密保持 MUST です |
| DPoPProof | RFC 9449 の DPoP proof JWT です。HTTP ヘッダ `DPoP` で送ります。MCP 固有フィールドは仕様未記載です |
| WorkloadJWT | プラットフォーム発行の短命 JWT です。SEP-1933 では RFC 7523 の `assertion` になります。WIT（`jwt+wit`）は本 SEP の対象外です |
| IDJAG | IdP が発行する Identity Assertion JWT Authorization Grant です。`typ` は `oauth-id-jag+jwt` です |
| TokenExchangeRequest | AS または IdP の token endpoint へ送るフォームです。RFC 8693 と RFC 7523 jwt-bearer の 2 プロファイルを含みます |

タスク・トランスポート・能力の成果物です。

| 要素名 | 説明 |
|---|---|
| CreateTaskResult | 長時間処理を選んだサーバーが同期結果の代わりに返す型です。`resultType` は `"task"` です |
| Task | 受信側が生成する耐久ハンドルです。`taskId` で一意です |
| TaskStatus | `working` / `input_required` / `completed` / `failed` / `cancelled` です。後ろ 3 つは終端です |
| StreamableHTTPHeaders | 必須ヘッダです。`MCP-Protocol-Version` / `Mcp-Method` / 該当時 `Mcp-Name` です。不一致は `HeaderMismatch`（`-32020`）です |
| CacheableResult | `ttlMs` と `cacheScope` を必須とする結果インタフェースです（SEP-2549）。ETag は未出荷です |
| ClientCapabilities | 毎リクエストの `_meta.io.modelcontextprotocol/clientCapabilities` です。拡張は `extensions` マップです |
| DiscoverResult | `server/discover` の結果です。`CacheableResult` を継承し `ServerCapabilities` を所有します |
| ProtectedResourceMetadata | RFC 9728 です。MCP サーバーは MUST 実装です |
| AuthorizationServerMetadata | RFC 8414 または OIDC Discovery です。MCP AS は少なくとも一方が MUST です |

### 情報モデル

属性名はハイフンを避けています。対応する HTTP ヘッダ名は、後続の表に書きます。まず呼び出し元とトークンです。

```mermaid
classDiagram
  class InteractiveClient {
    string identityMode
  }
  class CloudWorkloadAgent {
    string identityMode
  }
  class SubAgent {
    string identityMode
  }
  class AccessToken {
    string token_type
    string access_token
    number expires_in
    string scope
    map cnf
  }
  class RefreshToken {
    string refresh_token
  }
  class DPoPProof {
    string typ
    string alg
    map jwk
    string jti
    string htm
    string htu
    number iat
    string ath
    string nonce
  }
  class WorkloadJWT {
    string iss
    string sub
    string aud
    number exp
    number nbf
    number iat
    string jti
  }
  class IDJAG {
    string typ
    string jti
    string iss
    string sub
    string aud
    string client_id
    number exp
    number iat
    string email
    string resource
    string scope
  }
  InteractiveClient "1" --> "0..1" AccessToken : presents
  InteractiveClient "1" --> "0..1" RefreshToken : stores
  InteractiveClient "1" --> "many" DPoPProof : signs
  InteractiveClient "1" --> "0..1" IDJAG : requests
  CloudWorkloadAgent "1" --> "1" WorkloadJWT : presents
  DPoPProof "1" --> "1" AccessToken : binds
  RefreshToken "1" --> "1" AccessToken : refreshes
```

次にトークン交換とタスクです。

```mermaid
classDiagram
  class TokenExchangeRequest {
    string grant_type
    string assertion
    string subject_token
    string subject_token_type
    string requested_token_type
    string audience
    string resource
    string scope
    string actor_token
    string actor_token_type
    string client_id
  }
  class CreateTaskResult {
    string resultType
    string taskId
    string status
    string statusMessage
    string createdAt
    string lastUpdatedAt
    number ttlMs
    number pollIntervalMs
  }
  class Task {
    string taskId
    string status
    string statusMessage
    string createdAt
    string lastUpdatedAt
    number ttlMs
    number pollIntervalMs
    map inputRequests
    map result
    map error
  }
  class TaskStatus {
    string value
  }
  SubAgent "1" --> "1" TokenExchangeRequest : requests
  SubAgent "1" --> "0..1" AccessToken : presents
  WorkloadJWT "1" --> "1" TokenExchangeRequest : assertion
  IDJAG "1" --> "1" TokenExchangeRequest : assertion
  TokenExchangeRequest "1" --> "1" AccessToken : issues
  CreateTaskResult "1" --> "1" Task : seed
  Task "1" --> "1" TaskStatus : status
```

最後にトランスポートと能力・メタデータです。

```mermaid
classDiagram
  class StreamableHTTPHeaders {
    string mcpProtocolVersion
    string mcpMethod
    string mcpName
  }
  class CacheableResult {
    number ttlMs
    string cacheScope
  }
  class ClientCapabilities {
    map extensions
    map elicitation
    map experimental
  }
  class DiscoverResult {
    list supportedVersions
    string instructions
  }
  class ServerCapabilities {
    map extensions
    map tools
    map resources
    map prompts
    map experimental
  }
  class ProtectedResourceMetadata {
    string resource
    list authorization_servers
    list scopes_supported
    list bearer_methods_supported
    string jwks_uri
  }
  class AuthorizationServerMetadata {
    string issuer
    string authorization_endpoint
    string token_endpoint
    string jwks_uri
    list grant_types_supported
    list code_challenge_methods_supported
    list authorization_grant_profiles_supported
  }
  AccessToken "1" --> "1" StreamableHTTPHeaders : accompanies
  DiscoverResult --|> CacheableResult
  DiscoverResult "1" *-- "1" ServerCapabilities : capabilities
  ProtectedResourceMetadata "1" --> "many" AuthorizationServerMetadata : authorization_servers
```

図を読むうえでの注意です。

- `InteractiveClient.identityMode` などは、3 類型を区別するために置いた識別用スロットです（仕様未記載）。
- `CreateTaskResult` は仕様上 `Result & Task` のフラット合成です。継承ではありません。作成応答の `resultType` は `"task"`、`tasks/get` 応答の `resultType` は `"complete"` です。
- `TokenExchangeRequest` は RFC 8693 の token-exchange と RFC 7523 の jwt-bearer を同じフォームに載せた概念クラスです。実際の `grant_type` はどちらか一方です。
- `AuthorizationServerMetadata.authorization_grant_profiles_supported` は EMA / ID-JAG の発見キーです。RFC 8414 の MCP AS MUST 集合ではありません。
- `AccessToken.cnf` はトークン応答の JSON フィールドではありません。DPoP のトークン応答は `access_token` / `token_type` / `expires_in` / `refresh_token` です。公開鍵との結び付き（`cnf.jkt`）は、JWT アクセストークンの内部クレーム、または opaque token の introspection 応答に現れます。図では所持証明との関連を示すためだけに並べています。

トークン成果物の主要属性です。

| 要素名 | 説明 |
|---|---|
| AccessToken.token_type | 現行 MCP は Bearer（RFC 6750）です。DPoP 発行時は RFC 9449 により `DPoP` です |
| AccessToken.access_token | トークン値です。URI クエリへの掲載は MUST NOT です |
| DPoPProof.typ | 必須 `dpop+jwt` です |
| DPoPProof.htm / htu / iat / jti | RFC 9449 の必須クレームです。保護リソース提示時は `ath` が MUST です |
| WorkloadJWT.iss / sub / aud / exp | RFC 7523 の必須クレームです。`aud` は AS です |
| IDJAG.typ | JOSE ヘッダで `oauth-id-jag+jwt` です |
| IDJAG.jti / iss / sub / aud / client_id / exp / iat | ID-JAG draft の必須クレームです。`aud` は Resource Authorization Server の issuer です |
| IDJAG.email / resource / scope | OPTIONAL です。`resource` がある場合は MCP Server の Resource Identifier が MUST です |
| TokenExchangeRequest.grant_type | `urn:ietf:params:oauth:grant-type:token-exchange` または `urn:ietf:params:oauth:grant-type:jwt-bearer` です |
| TokenExchangeRequest.actor_token | RFC 8693 の任意項目です。委任（SubAgent）で使います |

タスクとトランスポートの主要属性です。

| 要素名 | 説明 |
|---|---|
| CreateTaskResult.resultType | 必須 `"task"` です |
| CreateTaskResult.ttlMs | 作成からのミリ秒です。`null` は無期限で、寿命中に変わり得ます |
| CreateTaskResult.pollIntervalMs | 任意です。クライアントは尊重 SHOULD です |
| Task.inputRequests | `status` が `input_required` のとき必須です |
| Task.result | `completed` のときに入ります。元リクエストの同期結果と同型です |
| Task.error | `failed` のときに入ります。JSON-RPC Error です。ツールの `isError: true` は `completed` です |
| StreamableHTTPHeaders.mcpProtocolVersion | HTTP ヘッダ `MCP-Protocol-Version` です。全 POST で MUST です |
| StreamableHTTPHeaders.mcpMethod | HTTP ヘッダ `Mcp-Method` です。ソースは JSON-RPC の `method` です |
| StreamableHTTPHeaders.mcpName | HTTP ヘッダ `Mcp-Name` です。`tools/call` / `resources/read` / `prompts/get` と `tasks/get` 等で MUST です。Tasks 操作では値は `params.taskId` です |
| CacheableResult.ttlMs | ミリ秒で必須です。`0` は即 stale です |
| CacheableResult.cacheScope | `"public"` または `"private"` で必須です。認可の代替にしてはなりません |

## 構築方法

- Authorization は OPTIONAL です。HTTP 実装は SHOULD、stdio は SHOULD NOT です。
- 現行の TypeScript SDK v2 は `@modelcontextprotocol/server` と `@modelcontextprotocol/client` に分割されています。
- Streamable HTTP は単一 POST エンドポイントです。stdio は改行区切り JSON-RPC です。

### 必須パラメータ

| 項目 | 現行 `2026-07-28` | 必須度 |
|---|---|---|
| Authorization 機能そのもの | プロトコル全体として OPTIONAL | OPTIONAL |
| HTTP トランスポートでの Authorization 適合 | HTTP 実装は本仕様に従う | SHOULD |
| stdio トランスポートでの Authorization 適合 | 本認可仕様に従わない | SHOULD NOT |
| 保護リソース要求の `Authorization` ヘッダ | `Authorization: Bearer <access-token>` | MUST（認可を使う HTTP 要求ごと） |
| `resource`（RFC 8707） | 認可リクエストとトークンリクエストの両方 | MUST |
| クライアント登録 CIMD | Client ID Metadata Documents | SHOULD（優先パス） |
| クライアント登録 DCR（RFC 7591） | Dynamic Client Registration | MAY（deprecated） |
| Tasks 拡張 ID | `io.modelcontextprotocol/tasks` | 双方オプトイン |
| `MCP-Protocol-Version` / `Mcp-Method` | 毎 POST | MUST |
| `Mcp-Name` | `tools/call` / `resources/read` / `prompts/get` と Tasks 操作 | MUST |

### TypeScript SDK v2 の初回セットアップ

v1 の `@modelcontextprotocol/sdk` 単一パッケージとは import パスが異なります。対象仕様は `2026-07-28` です。

```bash
npm install @modelcontextprotocol/server
npm install @modelcontextprotocol/client
```

サーバー側です。ここが v1 からの最大の落とし穴で、`McpServer` を `StdioServerTransport` へ直接 `connect` した構成は 2025 系プロトコルしか話しません。SDK を上げても wire 上は変わらないため、`2026-07-28` を出すには `serveStdio(() => buildServer())` を使います。ファクトリは接続ごとに 1 インスタンスへ固定され、接続冒頭のやり取りでその接続の era が決まります。

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const handle = serveStdio(() => {
  const server = new McpServer({ name: 'greeting-server', version: '1.0.0' });

  server.registerTool(
    'greet',
    {
      description: 'Greet someone by name',
      inputSchema: z.object({ name: z.string() })
    },
    async ({ name }) => ({
      content: [{ type: 'text', text: `Hello, ${name}!` }]
    })
  );

  return server;
});

process.on('SIGINT', () => {
  void handle.close();
});
```

2025 系の接続を拒否したい場合は `serveStdio(factory, { legacy: 'reject' })` を指定します。なお `2026-07-28` に固定された接続では `initialize` が走らないため、`getClientCapabilities()` と `getClientVersion()` は `undefined` を返し、ハンドラはリクエストごとの識別子を `ctx.mcpReq.envelope` から読みます。

クライアント側です。既定は legacy の `initialize` なので、`versionNegotiation` を明示しないと `server/discover` 経路になりません。

```typescript
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client(
  { name: 'my-first-client', version: '1.0.0' },
  { versionNegotiation: { mode: 'auto' } }
);
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', 'src/index.ts']
});
await client.connect(transport);

const { tools } = await client.listTools();
const result = await client.callTool({
  name: 'greet',
  arguments: { name: 'Ada' }
});
await client.close();
```

`mode: 'auto'` では、まず `server/discover` を試し、応答しなければ legacy へフォールバックします。フォールバックには supported-versions のリストに 2025 系リビジョンが残っている必要があり、modern のみのリストでは `connect()` が reject します。ネゴシエート結果は `client.getProtocolEra()` で確認できます。

### stdio トランスポート（現行）

クライアントがサーバーを subprocess として起動します。1 メッセージは 1 行で、埋め込み改行は禁止です。ヘッダ層はありません。プロトコル版は本文の `_meta` に載ります。資格情報の環境変数名は公式未記載です。

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"greet","arguments":{"name":"Ada"},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"ExampleClient","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}
```

## 利用方法

- 対話型は Protected Resource Metadata から CIMD と PKCE へ進みます。
- 常駐型の jwt-bearer は実装案です。SEP-1933 は Open PR です。
- 長時間 `tools/call` は Tasks 拡張の `CreateTaskResult` を扱います。

### Streamable HTTP の必須ヘッダ付き POST

サーバーは単一 MCP エンドポイントを POST で公開します。`Origin` 検証は MUST です。ローカルは 127.0.0.1 bind が SHOULD です。ヘッダと本文の不一致は HTTP 400 と JSON-RPC `-32020`（`HeaderMismatch`）です。

```http
POST /mcp HTTP/1.1
Host: mcp.example.com
Content-Type: application/json
Accept: application/json, text/event-stream
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Origin: https://app.example.com
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: get_weather

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "location": "Seattle, WA"
    },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "ExampleClient",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

Streamable HTTP では、キャンセルは SSE 応答ストリームを閉じることです。`notifications/cancelled` は stdio 用です。

### 対話型クライアント: PRM から CIMD と PKCE へ

まず未認可アクセスに対する 401 応答です。

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource",
                         scope="files:read"
```

指された Protected Resource Metadata です。

```json
{
  "resource": "https://mcp.example.com/mcp",
  "authorization_servers": ["https://auth.example.com"],
  "scopes_supported": ["files:read", "files:write"]
}
```

トークンリクエストです。

```http
POST /token HTTP/1.1
Host: auth.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fcallback
&client_id=https%3A%2F%2Fapp.example.com%2Foauth%2Fclient-metadata.json
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
&resource=https%3A%2F%2Fmcp.example.com%2Fmcp
```

`resource` は認可リクエストとトークンリクエストの両方で MUST です。アクセストークンを URI クエリに含めてはなりません。

### 常駐型クライアント: SEP-1933 の jwt-bearer（実装案）

以下は [SEP-1933 PR](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1933)（Status: Draft）と RFC 7523 §2.1 から組み立てた実装案です。`2026-07-28` のコア Authorization には含まれません。スコープは、エージェントが自分自身として動く場合です。

```http
POST /token HTTP/1.1
Host: as.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer
&assertion=eyJhbGciOiJFUzI1NiIsImtpZCI6IjE2In0.eyJpc3MiOiJodHRwczovL2t1YmVybmV0ZXMuZXhhbXBsZS8iLCJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6ZGVmYXVsdDptY3AtYWdlbnQiLCJhdWQiOiJodHRwczovL2FzLmV4YW1wbGUuY29tIiwiaWF0IjoxNzg3NzQwMDAwLCJleHAiOjE3ODc3NDAzNjB9.signature
&resource=https%3A%2F%2Fmcp.example.com%2Fmcp
```

`assertion` の中身は次のとおりです（署名部分のみ `signature` に置き換えています）。RFC 7523 §3 は `iss` / `sub` / `aud` / `exp` を MUST としているので、これらを削ってはいけません。

```json
{"alg":"ES256","kid":"16"}
{
  "iss": "https://kubernetes.example/",
  "sub": "system:serviceaccount:default:mcp-agent",
  "aud": "https://as.example.com",
  "iat": 1787740000,
  "exp": 1787740360
}
```

AS は `iss` が trusted issuer か判定し、OIDC Discovery の `jwks_uri` で JWT を検証して、MCP アクセストークンを発行します。WIT（`jwt+wit`）を RFC 7523 の assertion にすることは、SEP 作者コメントで対象外とされています。

### 対話型エンタープライズ: EMA の ID-JAG

EMA は公式拡張の stable です。ユーザーを MCP AS の authorization endpoint へリダイレクトしてはなりません。AS が ID-JAG を受け付けるかは、metadata の `authorization_grant_profiles_supported` に `urn:ietf:params:oauth:grant-profile:id-jag` があるかで判定します。

第 1 段は IdP での ID-JAG 取得です。

```http
POST /oauth2/token HTTP/1.1
Host: acme.idp.example
Content-Type: application/x-www-form-urlencoded

grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange
&requested_token_type=urn%3Aietf%3Aparams%3Aoauth%3Atoken-type%3Aid-jag
&audience=https%3A%2F%2Fauth.chat.example%2F
&resource=https%3A%2F%2Fmcp.chat.example%2F
&scope=chat.read+chat.history
&subject_token=eyJraWQiOiJzMTZ0cVNtODhwREo4VGZCXzdrSEtQ...
&subject_token_type=urn%3Aietf%3Aparams%3Aoauth%3Atoken-type%3Aid_token
```

第 2 段は MCP AS でのアクセストークン取得です。

```http
POST /oauth2/token HTTP/1.1
Host: auth.chat.example
Content-Type: application/x-www-form-urlencoded

grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer
&assertion=eyJhbGciOiJIUzI1NiIsI...
&client_id=https%3A%2F%2Fclient.example.com%2Fclient.json
```

### サブエージェント: RFC 8693（実装案）

狭い権限の委譲はロードマップ項目であり、MCP 固有のメソッド名は公式未記載です。以下は RFC 8693 §2.1 / §2.3 に沿った形です。EMA の ID-JAG は従業員 SSO 経路であり、この節のサブエージェント委譲とは別物です。

```http
POST /as/token.oauth2 HTTP/1.1
Host: as.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange
&resource=https%3A%2F%2Fmcp.example.com%2Fmcp
&scope=files%3Aread
&subject_token=accVkjcJyb4BWCxGsndESCJQbdFMogUC5PbRDqceLTC
&subject_token_type=urn%3Aietf%3Aparams%3Aoauth%3Atoken-type%3Aaccess_token
&actor_token=eyJhbGciOiJFUzI1NiIsInN1YiI6InN1Yi1hZ2VudCJ9...
&actor_token_type=urn%3Aietf%3Aparams%3Aoauth%3Atoken-type%3Ajwt
```

`actor_token` を省略すると impersonation 寄りになります。RFC 8693 の `act` claim が委譲チェーンを表現します。

### DPoP（実装案。RFC 9449、MCP 仕様としては未 finalize）

`2026-07-28` の MCP Authorization では、保護リソース要求は `Authorization: Bearer` です。以下は RFC 9449 側のヘッダ例です。

```http
POST /token HTTP/1.1
Host: server.example.com
Content-Type: application/x-www-form-urlencoded
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIsImFsZyI6IkVTMjU2IiwiandrIjp7Imt0eSI6IkVDIiwieCI6Imw4dEZyaHgtMzR0VjNoUklDUkRZOXpDa0RscEJoRjQyVVFVZldWQVdCRnMiLCJ5IjoiOVZFNGpmX09rX282NHpiVFRsY3VOSmFqSG10NnY5VERWclUwQ2R2R1JEQSIsImNydiI6IlAtMjU2In19.eyJqdGkiOiItQndDM0VTYzZhY2MybFRjIiwiaHRtIjoiUE9TVCIsImh0dSI6Imh0dHBzOi8vc2VydmVyLmV4YW1wbGUuY29tL3Rva2VuIiwiaWF0IjoxNTYyMjYyNjE2fQ.2-GxA6T8lP4vfrg8v-FdWP0A0zdrj8igiMLvqRMUvwnQg4PtFLbdLXiOSsX0x7NVY-FNyJK70nfbV37xRZT3Lg

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
```

DPoP proof は header に `typ` / `alg` と公開鍵 `jwk`、payload に `jti` / `htm` / `htu` / `iat` が必須です（RFC 9449 §4.2）。短縮する場合もこれらを削らないでください。

成功時の `token_type` は RFC 9449 では `DPoP` です。保護リソースでは `Authorization: DPoP` と `DPoP` ヘッダを併用します。MCP へ適用するのは finalize 後です。

### Tasks 拡張

拡張 ID は `io.modelcontextprotocol/tasks` です。サーバーは、クライアントが宣言していない要求に `CreateTaskResult` を返してはなりません。タスク化するかどうかは、サーバーがリクエスト単位で決めます。フィールド名は ext-tasks の `schema/2026-07-28/schema.ts` に従います（`ttlMs` / `pollIntervalMs` であり、旧 experimental の `ttl` / `tasks/result` ではありません）。

まずクライアントが拡張をオプトインして呼び出します。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "run_pipeline",
    "arguments": { "repo": "example/app" },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {
        "extensions": {
          "io.modelcontextprotocol/tasks": {}
        }
      }
    }
  }
}
```

サーバーは同期結果の代わりに `CreateTaskResult` を返します。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "task",
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "status": "working",
    "createdAt": "2026-07-28T10:30:00Z",
    "lastUpdatedAt": "2026-07-28T10:30:00Z",
    "ttlMs": 3600000,
    "pollIntervalMs": 5000
  }
}
```

以降はクライアントがポーリングします。なお `2026-07-28` では `_meta`（`protocolVersion` と `clientCapabilities`）が全リクエストで必須で、サーバーは過去のリクエストから能力を推測してはなりません。以下の `tasks/get` / `tasks/update` / `tasks/cancel` / `subscriptions/listen` の例は紙幅の都合で共通の `_meta` を省略しているため、そのままでは送信できません。実装では上の `tools/call` と同じ `_meta` を毎回付けてください。

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tasks/get",
  "params": {
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840"
  }
}
```

`tasks/get` の `resultType` は `"complete"` です。Streamable HTTP では `Mcp-Name` ヘッダに `taskId` を載せます。

途中入力は、`status: "input_required"` の `inputRequests` に対して `tasks/update` の `inputResponses` で返します。キーはタスク寿命中に再利用してはなりません。

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tasks/update",
  "params": {
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "inputResponses": {
      "name": {
        "action": "accept",
        "content": {
          "input": "Luca"
        }
      }
    }
  }
}
```

キャンセルは協調的です。

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tasks/cancel",
  "params": {
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840"
  }
}
```

ack しても最終状態が `cancelled` 以外になり得ます。なお `tasks/list` は SEP-2663 で削除済みです。

通知は `subscriptions/listen` の `params.notifications.taskIds` です（SEP-2663）。

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "subscriptions/listen",
  "params": {
    "notifications": {
      "taskIds": ["786512e2-9e0d-44bd-8f29-789f320fe840"]
    }
  }
}
```

ただしコア仕様ページの Notification Filter 表は `toolsListChanged` 等の 4 キーだけを列挙しており、TypeScript SDK v2.0.0 はフィルタを閉じたオブジェクトにしているため、`taskIds` がパースで落ちる既知の隙間があります（[typescript-sdk#2569](https://github.com/modelcontextprotocol/typescript-sdk/issues/2569)）。実装上はポーリングを既定にしておくのが安全です。

能力不足時のプロトコルエラーは `-32021`（Missing Required Client Capability）です。正本はコア schema と SEP-2663 です。

### HTTP over stdio（未出荷）

現行の stdio は改行区切り JSON-RPC です。ロードマップは Streamable HTTP を stdin/stdout 上の単一バインディングにする方向を示していますが、HTTP/2 のフレームレイアウトを含め公式仕様は未出荷です。推測でフレーム実装を先回りしないでください。

## 運用

### 長時間タスク

ブロッキングな `tools/call` は、プロキシ・LB・クライアントのアイドルタイムアウトで切れます。Tasks は耐久ハンドルを返し、結果を接続の生死から切り離します。コアはリクエスト単位 SSE の再開（`Last-Event-ID`）を削除済みです。

| 経路 | 役割 | 現行の位置づけ |
|---|---|---|
| `tools/call` 同期 / リクエスト SSE | 短時間。進捗は同一ストリームの `notifications/progress` | コア GA |
| Tasks `CreateTaskResult` + `tasks/get` | 長時間の既定。クライアント駆動のポーリング | 公式拡張 |
| `subscriptions/listen` + `notifications/tasks` | サーバーがフルタスク状態を push | 拡張 + コア購読。SDK 実装に隙間 |
| ロードマップの webhooks / channels | ポーリング依存を減らすサーバー起点イベント | 未出荷 |

運用ルールは次のとおりです。

- クライアントは `pollIntervalMs` を尊重します。
- 通知を使う場合も、欠落時のフォールバックとしてポーリングを残します。
- `subscriptions/listen` の長寿命 SSE では、サーバーが SSE コメント行（`:`）を定期送出します。
- HTTP では `X-Accel-Buffering: no` を付与します（SHOULD）。
- クライアントはクラッシュ耐性のため `taskId` を耐久ストアへ書きます。
- HTTP でリクエスト SSE を閉じると、そのリクエストはキャンセル扱い（MUST）になります。Tasks の作業はストリーム切断では止まりません。

クライアント側の最小実装です。

```python
import json
import time
from pathlib import Path

STATE = Path("/var/lib/mcp/task-state.json")

def persist_task(task: dict) -> None:
    STATE.write_text(json.dumps({
        "taskId": task["taskId"],
        "createdAt": task["createdAt"],
        "ttlMs": task.get("ttlMs"),
    }))

def resume_or_poll(rpc, task: dict) -> dict:
    persist_task(task)
    interval_ms = task.get("pollIntervalMs") or 5000
    while True:
        current = rpc("tasks/get", {"taskId": task["taskId"]})
        status = current["status"]
        if status in ("completed", "failed", "cancelled"):
            STATE.unlink(missing_ok=True)
            return current
        if status == "input_required":
            return current
        time.sleep(max(interval_ms, 1000) / 1000)
        interval_ms = current.get("pollIntervalMs") or interval_ms
```

### HTTP 統一とゲートウェイ

`2026-07-28` 以降、リモート MCP は通常の HTTP サービスと同じ運用面を持ちます。ゲートウェイは本文をパースせず、ヘッダでルーティングできます。一方、本文を処理するサーバーはヘッダと本文の不一致を MUST で検出し、`-32020 HeaderMismatch` を返します。

次は `Mcp-Method` の照合だけを抜き出した断片です。これ単体では仕様を満たしません。実装では `MCP-Protocol-Version`、`Mcp-Method`、対象メソッドの `Mcp-Name`、および自分が解釈する `Mcp-Param-*` のすべてについて、欠落・Base64 デコード失敗・本文との不一致を同じ `-32020` として拒否します。

```javascript
function assertMethodMatches(headers, body) {
  const method = headers["mcp-method"];
  if (method !== body.method) {
    return {
      http: 400,
      error: {
        code: -32020,
        message: `Header mismatch: Mcp-Method '${method}' does not match body '${body.method}'`,
      },
    };
  }
  return null;
}
```

非 ASCII の `Mcp-Name` は `=?base64?...?=` センチネルです。サーバーはデコードしてから本文と比較します。中間装置がポリシーをヘッダに依存する場合は、`MCP-Protocol-Version` がヘッダ検証を要求する版であることを確認します。

### エージェント ID の移行準備

| 呼び出し元 | 現行で動くもの | 移行先（未出荷を含む） |
|---|---|---|
| 対話型クライアント | 認可コード + PKCE、CIMD 優先、DCR 非推奨 | 継続。human-presence attestation は議論中 |
| 常駐クラウドワークロード | 貼り付け API キー、長期 refresh token | OAuth Client Credentials 拡張（Draft、今日採用可）、その先に WIF SEP-1933 |
| ユーザー不在の代理 / 狭い権限のサブエージェント | 親のトークン再利用、または別キー | RFC 8693 token exchange、ID-JAG、DPoP |

監査ログに残す主体は次のとおりです。

| 記録 | 誰が書くか | 現行で取れる値 |
|---|---|---|
| 認可判断 | IdP / AS | `iss` / `sub` / `aud` / `client_id` / ポリシー結果 |
| 委譲 | AS（token exchange 時） | `subject_token` の `sub`、`actor_token`、発行トークンの `act` |
| 実行 | MCP Resource Server | アクセストークンの audience、ツール名（`Mcp-Name`）、`taskId` |

EMA の IdP 監査はトークン発行までです。実際の `tools/call` は Resource Server 側のログです。両方を残さないと委譲連鎖が途切れます。

移行準備の手順です。

1. API キーと無期限 refresh token の在庫を台帳化します。
2. 対話型は CIMD と短命アクセストークンへ寄せます。refresh token の発行を前提にしません。
3. 常駐型のうち事前登録できるものは、OAuth Client Credentials 拡張（署名 JWT アサーション推奨）へ寄せます。基盤の workload ID を使いたいものは、プラットフォーム JWT の issuer を AS の allowlist 候補として棚卸ししたうえで、SEP-1933 が Final になるまで jwt-bearer を本番 MCP AS へ投げません。
4. サブエージェントには親トークンのコピーを禁止します。
5. アクセストークンの形式（JWT か opaque か）は AS 実装依存として扱います。

### 認可経路の分離

1 本の OAuth クライアント設定で 3 経路を兼ねないでください。EMA は従業員 SSO の対話型エンタープライズ経路であり、ユーザー不在の常駐型の代替ではありません。human-presence attestation は議論項目にとどまるため、現行では「このトークンが対話セッション由来か」をプロトコルが保証しません。

## ベストプラクティス

### 接続可否ではなく主体識別・委譲連鎖・非同期状態で統制する

| 単位 | 見るもの | 接続チェックでは見えないこと |
|---|---|---|
| 主体識別 | `iss` / `sub` / `client_id`、workload の `iss` + `sub` | API キー利用者の実体 |
| 委譲連鎖 | RFC 8693 の `act` / `may_act`、EMA の IdP ポリシー、親から子への scope 減衰 | 子が親権限で動いていること |
| 非同期状態 | `taskId`、`ttlMs`、終端状態、入力待ち | プロキシが 200 を返した後も作業が生きていること |

セッションは廃止済みです。認可はリクエストごと、タスク状態は Task Store、業務状態は明示ハンドルで持ちます。

### プロトコル固有と実装選択を分ける

| 層 | プロトコルが定めること | AS / 実装の選択 |
|---|---|---|
| トークン提示 | HTTP では `Authorization` ヘッダ。クエリ禁止。audience 検証 MUST | アクセストークンが JWT か opaque か |
| 登録 | CIMD 優先、DCR 非推奨、事前登録 | IdP 製品、JWKS の置き場 |
| EMA | ID-JAG のグラントの組み合わせ | Okta XAA 等の製品実装 |
| DPoP | RFC 9449 の proof JWT | MCP への採用時期、nonce 窓 |
| Tasks | `taskId` / 状態機械 / 協調的キャンセル | Task Store の実装 |

「MCP は JWT を使う」は誤りです。Bearer の中身は AS 依存です。

### 認可が任意なサーバーと必須なサーバーの混在に備える

クライアントは 401 と `WWW-Authenticate` の `resource_metadata` を見てからフローを始めます。無認可サーバーに Bearer を付けません。Resource Server は自分宛てのトークンだけ受理します。`cacheScope: "public"` は認可の代替ではありません。

### stdio ローカルサーバーに HTTP 認可仕様を適用しない

stdio にはヘッダ層がありません。資格情報は環境から取ります。キャンセルは `notifications/cancelled` です。ローカル HTTP（127.0.0.1 の Streamable HTTP）と stdio を混同しないでください。

### Tasks のキャンセルは協調的として扱う

`tasks/cancel` は意図の通知です。クライアントは ack を停止完了とみなしません。HTTP の SSE 切断によるリクエストキャンセルと、Tasks の協調的キャンセルを同一ハンドラにまとめないでください。

### ロードマップ項目を現行 GA として扱わない

次を「仕様になった」としてゲートや SDK 制約に落とさないでください。

- HTTP over stdio / HTTP/2 over stdio
- ETag による tool call の版管理
- DPoP の MCP 必須化
- SEP-1933 WIF
- RFC 8693 の MCP 委譲プロファイル
- webhooks / channels
- `tools/call` の結果形の一本化
- progressive discovery
- Agent Identity WG の成果（WG 自体が forming）

WIMSE は workload の実行時 ID、伝播、マルチホップ委譲を扱う IETF WG です。MCP が WIMSE トークンをそのまま受け取る仕様ではありません。SEP-1933 のメンテナコメントは、WIT を RFC 7523 の JWT として使わないことを明示しています。

### よくある誤解と反証

#### 長時間実行はどれか 1 つのプリミティブで足りる

- 誤解: Tasks が出たので listen も同期 SSE も不要です。
- 反証: ロードマップは、3 つの答えがライフサイクルを共有しないリスクを明示しています。Tasks は拡張、listen はコア、webhooks は未出荷です。
- 推奨: 長時間の結果は Tasks、カタログ変更は listen、数秒の進捗はリクエスト SSE と使い分けます。

#### リモートが HTTP になったのでローカルも同じ認可である

- 誤解: stdio にも Bearer が要ります。
- 反証: Authorization は HTTP で SHOULD、stdio で SHOULD NOT です。
- 推奨: リモート HTTP にだけ認可仕様を適用します。

#### ヘッダがあればゲートウェイは本文を信じなくてよい

- 誤解: `Mcp-Method` で振り分ければサーバー側の method チェックは不要です。
- 反証: 仕様は本文を処理するサーバーにクロスバリデーションを MUST で課します。
- 推奨: LB はヘッダでルーティングし、オリジンは必ず照合します。

#### EMA でエージェント ID は解決済みである

- 誤解: エンタープライズなら ID-JAG でワークロードもサブエージェントもカバーできます。
- 反証: EMA は従業員 SSO と IdP ポリシーです。ロードマップのエージェント ID は WIF + ID-JAG + token exchange + DPoP の組み合わせです。
- 推奨: 対話型エンタープライズは EMA、常駐型は WIF 待ち、委譲は RFC 8693 の `act` を監査項目に予約します。

#### jwt-bearer はどの AS でも通る

- 誤解: RFC 7523 は古い標準なので、既存 MCP AS は受け付けます。
- 反証: SEP-1933 は Open PR です。EMA の jwt-bearer は ID-JAG 用です。Kubernetes の ServiceAccount JWT をそのまま投げても `typ` / `aud` が合いません。
- 推奨: AS がグラントと issuer allowlist を広告するまで使いません。

#### DPoP を入れれば refresh token は無期限でよい

- 誤解: sender-constraining があるので長期の refresh token は安全です。
- 反証: ロードマップは、貼り付け API キーと長寿命 refresh token を問題として挙げています。DPoP は XSS 文脈での鍵使用までは防げません（RFC 9449）。
- 推奨: refresh token は短寿命かつローテーションにします。常駐型はプラットフォーム JWT の再提示へ寄せます。

#### `content` と `structuredContent` の両方を出せば互換である

- 誤解: 両方返せば、どのクライアントも正しくモデルへ渡します。
- 反証: ロードマップは「どの形をモデルの前に出すかがクライアントで分かれる」と明記しています。
- 推奨: structured content を返すツールは、互換のため TextContent にも JSON を載せる SHOULD です。structured が無い場合まで両方必須ではありません。単一契約を GA として書かないでください。

#### Tasks の cancel は即停止である

- 誤解: `tasks/cancel` の成功応答でワーカーは止まります。
- 反証: 公式は協調的であるとしており、`cancelled` 以外の終端状態もあり得ます。
- 推奨: 課金や副作用のあるジョブは、ワーカー側で cancel フラグを見ます。

#### トークン形式は MCP が JWT に決めた

- 誤解: audience 検証があるのでアクセストークンは JWT です。
- 反証: audience 検証は RFC 8707 の意図先チェックです。形式は AS の実装です。
- 推奨: クライアントはトークン応答の `token_type`（RFC 6749 §5.1）に従って提示方式を選びます。Resource Server は Authorization scheme と、AS との間で設定した署名鍵（`jwks_uri`）または introspection 経路に基づいて検証します。`token_type` は AS メタデータ（RFC 8414）の項目ではありません。

## トラブルシューティング

典型的な失敗は 3 つに集約されます。ヘッドレス実行に対話型フローを載せると 401 のあとブラウザ同意で止まります。長時間処理を同期 `tools/call` に載せるとプロキシが 504 を返します。stdio に Bearer 検証を適用するとローカルサーバーが落ちます。

| 症状 | 原因 | 対処 |
|---|---|---|
| 401 のあとブラウザ同意画面が出て、ヘッドレスエージェントが止まる | 現行 Authorization は User-Agent 付きの認可コード + PKCE が正です | 対話型と常駐型でクライアントとグラントを分けます。ヘッドレスではブラウザフローを起動しません |
| `tools/call` がすぐ返らずプロキシが 504 / 切断する | 同期ブロックのまま長時間実行しています。または SSE をプロキシがバッファしています | 長時間は Tasks に切り替えて `taskId` を即返します。SSE には `X-Accel-Buffering: no` と keep-alive コメントを付けます |
| ローカル stdio サーバーが Bearer 無しで失敗する | HTTP 認可仕様や `Mcp-Method` 検証を stdio に適用しています | stdio は環境変数から資格情報を取ります。ヘッダ層はありません |
| `400` + `-32020 HeaderMismatch` | `Mcp-Method` / `Mcp-Name` / `MCP-Protocol-Version` が本文と不一致です | クライアントは本文からヘッダを複製します。プロキシの allowlist に MCP ヘッダを入れます |
| ID-JAG 交換が `invalid_grant`。ログ上 `aud` / `iss` が不一致 | ID-JAG の `iss` は IdP、`aud` は MCP AS の issuer 識別子が MUST です | AS は IdP の JWKS で署名を検証し、`typ=oauth-id-jag+jwt`、`aud` が自 AS issuer であることを確認します。Resource Server の URL を `aud` に入れません |
| SEP-1933 未実装の AS に jwt-bearer を投げて失敗する | WIF は Draft です。既存 AS は認可コードと（EMA なら）ID-JAG 用 jwt-bearer しか受けません | AS が RFC 7523 と issuer allowlist を広告するまで使いません |
| 同じ `tools/call` なのにクライアント A は構造化データを使い、B はテキストだけモデルに渡す | `content` と `structuredContent` の同時返却が現行契約です | サーバーは両方返します。単一契約の SEP を待ってからサーバー側を削ります |
| `tasks/cancel` 後も課金ジョブが続く | キャンセルは協調的です | ワーカーが cancel をポーリングします。クライアントは終端状態を待ちます |
| 再起動後にタスク結果が取れない | `taskId` をメモリだけに保持しました | クライアントは `taskId` をディスクへ永続化します。サーバーは返却前に共有 Store へ書きます |
| listen 中に `notifications/tasks` が来ない | コアのフィルタに `taskIds` が載っていない、または SDK が拡張キーを落とします | ポーリングを既定にします。SDK の listen 拡張対応を確認します |
| DPoP を必須にしたら既存 Bearer クライアントが全滅する | RFC 9449 の `token_type=DPoP` は MCP の GA ではありません | ロードマップの finalize 前に全社必須化しません |
| `cacheScope: public` の一覧が他テナントに出る | 公開キャッシュを認可代わりにしました | ユーザー依存データは `private` にします。認可はトークン検証で行います |
| サブエージェントが親と同じ書き込みに成功する | 親トークンの再利用です | 子には狭いトークンか狭いサーバー側アカウントを付けます。監査に親の `sub` と子アクターを残します |

コアの隣接エラーコードです。

| コード | 名前 | 切り分け |
|---|---|---|
| `-32020` | HeaderMismatch | ヘッダと本文の不一致です。認可ではありません |
| `-32021` | MissingRequiredClientCapability | 毎リクエストの `_meta` に Tasks 等の拡張がありません |
| `-32022` | UnsupportedProtocolVersion | 版交渉です。`server/discover` へ戻ります |
| HTTP 401 | Unauthorized | トークン欠落または無効です。ブラウザフローを起こしてよいかはクライアント種別で決めます |
| HTTP 403 + `insufficient_scope` | スコープ不足です | step-up します。ヘッドレスは中断して人間の経路へエスカレーションします |

## まとめ

- 新ロードマップは、MCP の呼び出し元が「ブラウザの前にいる人」から「クラウドワークロードとサブエージェント」へ広がった事実に、仕様を追いつかせる計画です。
- 今日使えるのは、認可コード + PKCE、CIMD 優先、EMA の ID-JAG、OAuth Client Credentials 拡張（Draft）、Streamable HTTP、`server/discover`、TTL キャッシュ、Tasks 拡張です。
- 待つべきなのは、WIF（SEP-1933 は Open PR）、DPoP の MCP 必須化、RFC 8693 の MCP 委譲プロファイル、webhooks / channels、HTTP over stdio、ETag、結果形の一本化です。
- 移行準備としてすぐ着手できるのは、API キーと無期限 refresh token の棚卸し、対話型と常駐型でのクライアント分離、委譲の監査項目（`act`、親の `sub`）の予約、`taskId` の永続化です。
- ロードマップは current thinking です。ゲートや SDK 制約へ落とす前に、対応する SEP が Final か、WG が forming を抜けたかを必ず確認してください。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！

## 参考リンク

ロードマップ本体です。

- [The New MCP Roadmap（blog, 2026-08-22）](https://blog.modelcontextprotocol.io/posts/mcp-roadmap/)
- [Official roadmap](https://modelcontextprotocol.io/development/roadmap)
- [The 2026 MCP Roadmap（旧, 2026-03-09）](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)

仕様 `2026-07-28` です。

- [Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [stdio](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio)
- [subscriptions/listen](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions)
- [Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

拡張と SEP です。

- [Tasks overview](https://modelcontextprotocol.io/extensions/tasks/overview)
- [SEP-2663: Tasks Extension](https://modelcontextprotocol.io/seps/2663-tasks-extension)
- [ext-tasks](https://github.com/modelcontextprotocol/ext-tasks)
- [ext-tasks schema 2026-07-28](https://raw.githubusercontent.com/modelcontextprotocol/ext-tasks/main/schema/2026-07-28/schema.ts)
- [Enterprise-Managed Authorization](https://modelcontextprotocol.io/extensions/auth/enterprise-managed-authorization)
- [OAuth Client Credentials](https://modelcontextprotocol.io/extensions/auth/oauth-client-credentials)
- [ext-auth（拡張の成熟度一覧）](https://github.com/modelcontextprotocol/ext-auth)
- [EMA stable specification MDX](https://github.com/modelcontextprotocol/ext-auth/blob/main/specification/stable/enterprise-managed-authorization.mdx)
- [SEP-990](https://modelcontextprotocol.io/seps/990-enable-enterprise-idp-policy-controls-during-mcp-o)
- [SEP-1933 PR](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1933)
- [SEP-2549 TTL for list results](https://modelcontextprotocol.io/seps/2549-TTL-for-list-results)
- [SEP-2575 Stateless MCP](https://modelcontextprotocol.io/seps/2575-stateless-mcp)
- [SEP-2567 Sessionless MCP](https://modelcontextprotocol.io/seps/2567-sessionless-mcp)
- [SEP-2322 MRTR](https://modelcontextprotocol.io/seps/2322-MRTR)
- [SEP-2133 Extensions](https://modelcontextprotocol.io/seps/2133-extensions)
- [Triggers and Events WG](https://modelcontextprotocol.io/community/working-groups/triggers-events)

IETF の一次資料です。

- [RFC 9449 DPoP](https://www.rfc-editor.org/rfc/rfc9449)
- [RFC 8693 Token Exchange](https://www.rfc-editor.org/rfc/rfc8693)
- [RFC 7523 JWT Bearer](https://www.rfc-editor.org/rfc/rfc7523)
- [RFC 9728 Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728)
- [RFC 8707 Resource Indicators](https://www.rfc-editor.org/rfc/rfc8707)
- [RFC 9207 Authorization Server Issuer Identification](https://www.rfc-editor.org/rfc/rfc9207)
- [RFC 8414 Authorization Server Metadata](https://www.rfc-editor.org/rfc/rfc8414)
- [Identity Assertion Authorization Grant draft](https://datatracker.ietf.org/doc/draft-ietf-oauth-identity-assertion-authz-grant/)
- [WIMSE WG](https://datatracker.ietf.org/wg/wimse/about/)

SDK と実装の隙間です。

- [TypeScript SDK（v2）](https://github.com/modelcontextprotocol/typescript-sdk)
- [typescript-sdk#2569: subscriptions/listen が extension notifications を運べない](https://github.com/modelcontextprotocol/typescript-sdk/issues/2569)
