---
title: "コーディングエージェントの成果を、人がレビューしやすいHTMLにする"
emoji: "👀"
type: "tech"
topics: ["ClaudeCode", "CodeReview", "AIAgent", "OSS", "UX"]
published: false
---

コーディングエージェントに大きな調査や実装を任せると、成果物を作る時間より、人がその成果を理解して判断する時間の方が長くなることがあります。エージェントは背景を積み上げながら自律的に進みますが、reviewerはその過程を共有していません。そのため、前提知識がないまま、突然コードや最終結果の判断を求められます。

そこで使いたくなるのが、変更意図、diff、テスト結果、画面をまとめたHTMLです。ただし、MarkdownをきれいなHTMLへ変換するだけでは、レビューはそれほど楽になりません。減らしたいのは文字量ではなく、**前提を組み立てる、対象の仕組みを把握する、探す、戻る、照合する、未確認箇所を覚える**といった作業だからです。

この記事では、前提知識ゼロからレビューに必要なメンタルモデルを再構築するHTMLの設計原則と、2026年8月時点で利用できるツールを整理します。Claude Code Artifactsの不足を補うOSSも、どのペインをどう解消するのかという観点で比較します。

:::message
結論から言うと、既定値は小さなGitHub PR、CI、raw diffのままで十分です。HTMLは承認の正本ではなく、前提知識ゼロから対象と判断材料を理解するための派生ビューです。複数案、ユーザーフロー、図、画面状態など、行指向diffでは理解しにくい変更にだけ追加します。
:::

![記事の全体像](/images/coding-agent-human-html-review_20260807/overview.png)
*この記事の全体像。以下、順に解説します。*

## HTML化の前に、減らしたい負荷を分ける

「レビューがつらい」を一つの問題として扱うと、ツール選びを誤ります。実際には、少なくとも次の7つに分けられます。

| 負荷 | レビュー中に起きること | UIへ移せるもの |
|---|---|---|
| 前提構築負荷 | 目的、制約、検討経緯を知らず、結果から背景を推測する | 発端から採用結果までの因果的な時系列 |
| 対象理解負荷 | コードを読みながら構造、振る舞い、データ関係を頭内で組み立てる | 構造図、振る舞い図、データモデル図 |
| 同定負荷 | 「左の3つ目」「この辺」と対象を言い直す | DOM、行、引用へのanchor |
| 探索・再定位負荷 | 仕様、diff、テスト、画面を往復する | 索引、deep link、確認位置 |
| 比較・統合負荷 | before/afterや複数ファイルを頭内で結ぶ | 同期比較、関心事ごとの束ね |
| 状態保持負荷 | 見た箇所、未確認、差し戻し、古い判断を覚える | unseen、decision、staleの分離 |
| 転記負荷 | コメントを再びプロンプトへまとめる | 構造化feedbackとagentへの返送 |

HTMLの利点は、reviewerとエージェントの間にある文脈の非対称性を埋め、これらの状態を画面へ外在化できることです。一方で、変更が正しいか疑い、反証し、承認する思考まで省くべきではありません。

「HTMLの方がMarkdownやPRより認知負荷が低い」と直接示したコードレビュー実験は、今回の調査では確認できませんでした。参考になるのは、変更理由と根拠を近づける、探索状態を外に出す、関心事ごとに分解するといった周辺研究です。つまり、効果を生むのはHTMLという媒体ではなく、**情報の配置とレビュー状態の設計**です。

## 時系列でメンタルモデルを再構築する

前提知識のないreviewerには、結論だけでなく「なぜ現在の形になったのか」を組み立てる足場が必要です。そこで本文の主線は時系列にします。ただし、agent transcriptを最初から並べるのではありません。レビュー判断に影響する発端、制約、選択、結果だけを残した**因果の時系列**にします。

最初に、このHTMLが何を求めるレビューなのかを宣言します。

- **承認型**: 完成した結果を採用してよいか
- **選択型**: 複数案のどれを選ぶか

その後は、次の順に情報を配置します。

```mermaid
flowchart LR
    A["発端・目的"] --> B["検討した案"]
    B --> C["採用結果<br/>または選択肢"]
    C --> D["レビュー対象<br/>構造・振る舞い・データ"]
    D --> E["検証<br/>証拠・未確認・リスク"]
    E --> F["人の判断"]
    F --> G["判断後に起きること"]
```

この順番には理由があります。レビュー対象の構造を先に見せても、reviewerは何に注目すべきか分かりません。検討した案と採用結果を示した後なら、なぜその構造や振る舞いを確認する必要があるのか理解できます。そして対象の仕組みを把握した後に、テストやログが何を検証しているのかを判断できます。

変更理解の研究でも、why、完全性、正しさ、設計、波及リスクは主要な情報ニーズでした。また、実際のコードレビューではannotated diffだけでなく、変更外のコード、実行結果、仕様も参照されます。したがって、HTMLはdiffを隠す要約ではなく、判断に必要なメンタルモデルを組み立て、そこから原証拠へ案内する索引にします。

### 採用結果の後に、レビュー対象自体を説明する

エージェントは変更理由を説明しても、レビュー対象そのものを共有済みとして省略しがちです。その状態では、reviewerがコードを読みながら対象の仕組みを逆算することになります。採用結果を示した直後に、今回の判断に関係する範囲を次の3図で説明します。

| 図 | 示す内容 | reviewerが答えられる問い |
|---|---|---|
| 構造図 | 主要component、責務、依存関係、対象境界 | どこが変わり、どこまで影響するか |
| 振る舞い図 | trigger、処理、出力、副作用、失敗経路 | 正常時と失敗時に何が起きるか |
| データモデル図 | entity、関係、所有者、状態遷移、永続化先 | 何が保存・更新され、整合性をどう保つか |

システム全体を網羅する必要はありません。今回の判断に必要なsliceへ絞り、図の境界と省略範囲を明示します。各nodeから対応するcode、schema、testへ移動できるようにし、図がagentの想像だけで作られた説明にならないようにします。

before/afterは、別々の図を眺めさせるより、同じ対象モデルへ変更を重ねます。たとえば、componentの追加、呼び出し順の変化、entityの所有者変更を強調すれば、構造とdiffを頭内で再結合する負荷を減らせます。

### 対象モデルの後に検証を置く

検証結果は、対象の仕組みを理解した後に示します。「tests pass」だけでは、どの振る舞いやデータ制約を確認したのか判断できません。構造、振る舞い、データモデルの各要素へ、対応するtest、log、screenshot、raw diffを近接させます。

特に、失敗、warning、not-run、unverifiedは折り畳みの外へ出します。成功した反復ログは閉じても構いませんが、例外の存在と件数まで隠すと、progressive disclosureではなく情報欠落になります。

## 承認型と選択型で、判断の出口を分ける

承認型では、採用済みの案とその検証結果を読み、`Approve`または`Request changes`を返します。一方、選択型では機能一覧を比較するだけでは判断できません。各案を選択した結果、どのような未来になるのかまで示す必要があります。

| 選択肢ごとに示すもの | 確認する内容 |
|---|---|
| 得られる結果 | ユーザー体験やシステムがどう変わるか |
| 構造への影響 | component、責務、依存関係がどうなるか |
| 振る舞いへの影響 | 正常系、失敗系、運用がどう変わるか |
| データへの影響 | schema、状態、移行、所有権がどうなるか |
| コスト | 実装、運用、移行、学習に何が必要か |
| リスクと未知 | 未検証事項と、失敗した場合の影響 |
| 可逆性 | 後から変更・撤回できるか |
| 次のアクション | 選択後にagentと人が何をするか |

```mermaid
flowchart TB
    Q["選択してほしい問い"] --> A["案A"]
    Q --> B["案B"]
    Q --> C["案C"]
    A --> AO["Aを選んだ後の状態"]
    B --> BO["Bを選んだ後の状態"]
    C --> CO["Cを選んだ後の状態"]
    AO --> D["人の選択"]
    BO --> D
    CO --> D
    D --> N["実装・検証・移行"]
```

推奨案を出す場合も、他案を不当に弱く見せません。評価軸と前提を明示し、「この制約ならA、可逆性を優先するならB」のように、前提が変わったとき推奨がどう変わるかを示します。選択後の処理も曖昧にせず、選択を受けてagentが実装するのか、追加検証するのか、移行を開始するのかまで書きます。

:::details レビューHTMLの依頼テンプレート
前提知識のないreviewerが、過去の会話や作業ログを読まなくても妥当性を判断できるレビューHTMLを作成してください。

最初に、このレビューが「完成した結果の承認」を求めるものか、「複数の選択肢からの選択」を求めるものかを明示してください。発端、目的、成功条件、制約、検討した案、採用結果または現在の選択肢を、判断に影響する因果関係が分かる時系列で説明してください。agent transcriptの単純な要約にはしないでください。

採用結果または選択肢を説明した後に、レビュー対象自体を説明してください。今回の判断に関係する範囲について、主要component・責務・依存関係を示す構造図、入力・処理・出力・副作用・失敗経路を示す振る舞い図、entity・関係・所有者・状態遷移・永続化先を示すデータモデル図を作成してください。図の境界、省略範囲、対応するcode・schema・testへの参照も示してください。

対象の説明後に、検証済み事項、未実行・未確認事項、既知のリスクを示してください。agentの主張、codeから確認できる事実、testなどの証拠、人の判断は分離してください。

選択を求める場合は特徴比較だけで終わらせず、各案を選んだ後のユーザー体験、構造、振る舞い、データ、運用、コスト、リスク、可逆性、次のアクションを説明してください。
:::

## `pass`と`approved`を同じ緑色にしない

レビュー状態は最低でも次の5軸に分けます。

| 状態軸 | 例 |
|---|---|
| machine evidence | pass / fail / unknown / not-run |
| reviewer exposure | unseen / seen |
| human decision | accepted / changes-requested / deferred |
| discussion | needs-reply / unresolved / resolved |
| currency | current / stale |

テスト成功は「人が見た」ではなく、閲覧済みは「承認した」でもありません。改版後には、以前の判断が現在の証拠に対して有効かも別に判定する必要があります。

ここを一つのbadgeへ潰すと、エージェントの成功報告が人の判断を上書きします。HTML側のresolvedをPRのblocking stateと同一視するのも危険です。最終的な承認、required review、CI、merge blocker、監査はGitHub PRなど既存の正本へ残します。

## ファイルではなく「変更意図」でも束ねる

複数ファイルにまたがる変更は、ファイル順だけでは目的が見えません。HTMLでは、各変更を次のようなchange unitへまとめられます。

```yaml
change_unit:
  intent: "失効したsessionを安全に再認証する"
  before_after: "401で終了 → refresh後に1回だけ再試行"
  impacted:
    - "auth client"
    - "retry policy"
    - "integration tests"
  evidence:
    passed: ["auth integration test"]
    failed: []
    not_run: ["mobile offline recovery"]
  risks:
    - "非idempotent requestの重複"
  source_revision:
    base: "<sha>"
    head: "<sha>"
```

ただし、意図順が常に優れているわけではありません。関心事ごとの変更分解を調べた小規模実験では、誤指摘の減少とcontext-seekingの増加は見られましたが、欠陥発見数や変更理由の理解向上までは示されませんでした。変更順序の効果について信頼できる結論を得られなかった追試もあります。

そのため、`by intent`、`by dependency`、`by file`を切り替えられる設計が安全です。エージェントが作った一つの順序を、唯一の読み方として強制しません。

## AI要約は答えではなく、原diffへの索引にする

説明が詳しいほど安全とは限りません。AI説明を加えてもconfidence表示だけの場合よりhuman-AI性能が有意に改善せず、AIが誤ったときの依存を強める可能性を示した研究があります。対象はコードレビューではないため効果量は外挿できませんが、少なくとも「説明があるから正しい」とは扱えません。

実装では次を守ります。

- `agent claim`、`observed evidence`、`human decision`を別の型として表示する
- 「tests pass」ではなく、command、suite、除外、exit status、revisionを示す
- summaryの各claimからraw evidenceへ1 action以内で移動できるようにする
- 高リスク変更では、AI所見を開く前に人が期待挙動と最大懸念を一つ書けるようにする

最後のcognitive forcingは過信を減らしうる一方、操作の複雑さと不満を増やし、全体性能の向上を保証しません。すべてのレビューへ強制するのではなく、高リスク条件に限定して検証します。

## Claude Code Artifactsは何を解き、何を残すか

Claude Code Artifactsは、2026年8月時点ではPro、Max、Team、Enterpriseで利用できます。単一のself-contained pageをclaude.aiへ公開し、同じURLへ再公開して版を作れます。TeamとEnterpriseでは組織内共有、retention、audit logなどの統制があり、Enterpriseでは追加のRBACも利用できます。

したがって、発表当初の「組織外へ共有できない」という説明は現在の主要ペインではありません。ProとMaxではpublic linkも利用できます。残る問題は、共有よりもレビューの往復です。

| 残るペイン | Artifactsの現在地 |
|---|---|
| 要素や引用へのコメントを元agentへ返す | anchored threadから元sessionへ返す標準workflowは公式仕様で確認できない |
| interaction結果を修正指示へ変える | Copy as prompt等はあるが、target・quote・revisionを持つreview protocolではない |
| review stateを保存する | Artifactはcaptureであり、一般的なbackendやform stateを持たない |
| PR承認へ接続する | branch protection、required review、CI blockerの正本ではない |
| headlessにpublishする | 一部実行環境では無効で、汎用publish APIとしての契約は確認できない |

Artifactsは、stable URL、版、共有、組織統制が欲しいときには有力です。しかし、人が画面上の「ここ」を指し、その対象と版を保ったままagentへ返す用途は、別の層で補う必要があります。

## 関連ツールを、解消するペインで選ぶ

ツールは一つのランキングに並べず、役割ごとに分けると選びやすくなります。

### ローカルで注釈し、そのままagentへ返す

| ツール | 解消するペイン | 適用境界 |
|---|---|---|
| [Plannotator](https://github.com/backnotprop/plannotator) | HTML、計画、diffの対象をpinし、structured feedbackをClaude CodeのhookやCLIへ返す | 計画・HTML・diffを同じ習慣で見たい個人PoC向け。raw HTMLのscriptやstale表示、復旧性は破壊試験が必要 |
| [Lavish](https://github.com/kunchenguid/lavish-axi) | DOM、テキスト、Mermaid、レイアウトの「ここ」を直接annotateし、live reloadで往復する | HTMLや図の対象指定に強い。diff reviewや改版差分管理は主目的外 |
| [Discuss CLI](https://github.com/codesoda/discuss-cli) | Markdownや短いdiffをterminalではなくlocalhostで読み、block/line threadを返す | rich HTMLやteam asyncが不要なら、生成層を増やさない対照候補 |

Plannotatorは計画・diffまで含む広いreview loop、LavishはHTML上の対象指定という深いreview loopに向きます。どちらが上位というより、減らしたい転記負荷の範囲が違います。

### 非同期チームレビューを閉じる

[Glance](https://github.com/plivo-labs/glance)は、HTMLやfolderをself-hostし、認証されたreviewerがanchored commentを付け、agentがCLIで回収・返信する流れを狙ったOSSです。Slack、画像、メールに散った指摘を構造化し、agentへ手で転記する負荷を直接減らします。

ただし、2026年に登場したv0系で、Cloudflare Workers、D1、R2、KVの運用も必要です。upload全体cap、retention、初期event raceにはopen Issueがあり、backup、restore、改版時のanchor移行も本番導入前に実演すべきです。現時点では本番推奨ではなく、非同期review loopを検証するlab候補と考えます。

運用を持ちたくない場合の比較対象には、hostedサービスの[Markloop](https://markloop.io/)があります。target、quote、intent、versionを持つfeedbackをMCPやCLIで回収する設計ですが、OSSやself-hostではありません。

### 生成、公開、保存だけを補う

| 欲しいもの | 候補 | 持たないもの |
|---|---|---|
| 用途別のレビューHTML生成 | [visual-explainer](https://github.com/nicobailon/visual-explainer)、[effective-html](https://github.com/plannotator/effective-html) | review state、承認 |
| self-host、stable URL、版、stale検知 | [Open Artifacts](https://github.com/coda0HQ/open-artifacts) | anchored commentからagentへの往復 |
| Git-backedな最小live URL | [tot](https://github.com/plannotator/tot) | private review、細かな権限管理 |
| 増えた成果物の棚、検索、未読管理 | [viewllm](https://github.com/yz671/viewllm)、[Satchel](https://github.com/mdschoff/Satchel) | 注釈、PR承認 |

共有だけが目的なら、review platformを入れる必要はありません。逆に、comment round-tripが目的なら、見栄えのよいHTML generatorだけを導入してもペインは残ります。

## 最小構成から段階的に試す

最初から全PRをHTML化すると、artifactの生成、公開、stale管理、アクセシビリティ対応という新しい負荷が増えます。次の順に導入するのが現実的です。

### 1. まずPRを小さくする

```text
agent
  → small focused PR
  → 人が書く intent / before-after / unverified
  → CI + raw diff
  → GitHub review
```

短い行指向変更はこれで十分です。HTMLを作らないことが、最も低コストな認知負荷対策になる場合があります。

### 2. 個人のrich artifactで往復を試す

```text
agent
  → 用途別のself-contained HTML
  → Plannotator または Lavish
  → target付きstructured feedback
  → agent revision
  → 最終判断はPRへ記録
```

計画、HTML、diffをまとめて扱いたければPlannotator、DOMや図への指示を深く試したければLavishを使います。Markdownや短いdiffならDiscuss CLIなどを対照条件にします。

### 3. 非同期チームレビューが必要なら共有層を足す

Glance等を試すときは、単にdeployできたことを成功にしません。データ、security、backupのownerを決め、comment export、restore、upgrade、rollback、anchor migrationまで受け入れ条件にします。HTML側で判断したblocking stateはPRへ同期し、最終判断の正本を二重化しません。

## 導入前に壊して確かめる

この領域のOSSは若いプロジェクトが多く、starsや更新頻度だけではfeedback durability、accessibility、security、長期保守を判断できません。機能デモより、次の破壊試験が重要です。

1. 送信直前と直後にagent、CLI、serverを終了し、feedbackをcopy、export、retryできるか。
2. HTMLのDOMを大きく組み替え、commentが誤った要素へ移らずoutdatedになるか。
3. rebaseやsource更新後、表示revisionとreviewed stateが一致するか。
4. 大量file、5 MiB超、large image、多数assetでsearch、scroll、memory、upload failureを確認する。
5. keyboard-only、screen reader、複数browser、reduced-motion、no-JSで主要操作を完遂できるか。
6. malicious HTMLのscript、fetch、WebSocket、form、popup、download、local asset pathを確認する。
7. public/private変更、token失効、offboarding、expired linkを確認する。
8. version upgradeとrollback、backupから新環境へのrestore、comment exportを実演する。

Plannotatorにはfeedback復旧、stale diff、screen reader menu、Lavishにはdead agentへの送信やbrowser互換、Glanceにはupload cap、retention、iframeの初期raceに関するopen Issueがあります。Issueは全環境での再現保証ではありませんが、PoCで壊す箇所を決める材料になります。

## 「読みやすい」ではなく、理解と誤承認を測る

実際の変更10件程度を使い、次の条件を比較します。

1. 標準のfile-based PR diff
2. PR diffにintent、impact、unverifiedだけを追加
3. intent-grouped HTML、近接した証拠、raw diff
4. 条件3にAI要約を初期表示
5. 条件3にAI要約をon-demand表示

正しいAI要約だけでなく、一部誤った要約も混ぜます。小変更と複数関心事の変更、全test成功だが要求違反の変更、複数revisionの再レビューも含めます。さらに、完成結果を承認する課題と、複数案から選択する課題を分けます。選択課題では、特徴表だけを見せる条件と、各案を選択した後の状態まで見せる条件を比較します。

測るのは、Approveや選択までの速さだけではありません。

- 目的、before/after、最大リスク、未検証点を説明できるか
- 対象の構造、振る舞い、主要なデータ関係を説明できるか
- 選んだ案によって何が起き、次に何をするか説明できるか
- 誤ったAI要約を差し戻せるか
- false negative、false positive、誤承認
- 最初の有用な証拠へ到達する時間、再発見、画面間往復
- 前回確認版から現在版までの再レビュー時間
- lost feedback、stale state、anchor migration失敗
- keyboardやscreen readerで主要操作を完遂できるか
- 主観負荷と正答がそれぞれどう変わるか

成功条件は、理解あたりの時間が改善し、AIが誤る条件でも見落としが増えず、feedbackが失われないことです。

## まとめ

人向けHTMLレビューの価値は、成果物を華やかにすることではありません。エージェントとreviewerの文脈の非対称性を埋め、レビューに必要なメンタルモデルを再構築することです。その上で、探索、比較、状態保持、転記を画面とプロトコルへ移し、人の注意を判断へ戻します。

- 既定値は、小さなPR、CI、raw diffとする
- HTMLはrichな表現が必要なときだけ、派生ビューとして追加する
- 背景、選択・採用、対象モデル、検証、判断、判断後の未来を因果的な時系列で配置する
- 採用結果の後に、対象の構造、振る舞い、データモデルを図解する
- 承認型と選択型を分け、選択型では各案を選んだ後の状態まで示す
- pass、seen、approved、resolved、currentを別の状態として持つ
- AI要約を答えにせず、原証拠への索引にする
- 個人PoCはPlannotatorとLavish、非同期PoCはGlance等を比較する
- 導入判断では速さだけでなく、理解、誤承認、feedback消失、アクセシビリティを測る

Claude Code Artifactsは共有と版管理の有力な層ですが、anchored commentを元agentへ返すレビュー往復は別途補う必要があります。まず自分のペインが生成、注釈、共有、保存、承認のどの層にあるかを決め、最小のツールだけを足すのがよいでしょう。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！

## 参考リンク

- [Claude Code Artifacts](https://code.claude.com/docs/en/artifacts)
- [Artifacts in Claude Code announcement](https://claude.com/blog/artifacts-in-claude-code)
- [Using Claude Code: The unreasonable effectiveness of HTML](https://claude.com/blog/using-claude-code-the-unreasonable-effectiveness-of-html)
- [Plannotator](https://github.com/backnotprop/plannotator) / [公式ドキュメント](https://docs.plannotator.ai/open-source/)
- [Lavish](https://github.com/kunchenguid/lavish-axi)
- [Glance](https://github.com/plivo-labs/glance)
- [Markloop](https://markloop.io/)
- [Open Artifacts](https://github.com/coda0HQ/open-artifacts)
- [How Do Software Engineers Understand Code Changes?](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/07/howdosoftwareengineersunderstandcodechanges_fse2012.pdf)
- [Expectations, Outcomes, and Challenges of Modern Code Review](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/ICSE202013-codereview.pdf)
- [The Effects of Change Decomposition on Code Review](https://doi.org/10.7717/peerj-cs.193)
- [The Split-Attention Effect as a Factor in the Design of Instruction](https://doi.org/10.1111/j.2044-8279.1992.tb01017.x)
- [Associating Working Memory Capacity and Code Change Ordering with Code Review Performance](https://tobiasbaum.github.io/rp/memoryCodeOrderAndReview.pdf)
- [Does the Whole Exceed its Parts? The Effect of AI Explanations](https://doi.org/10.1145/3411764.3445717)
- [To Trust or to Think: Cognitive Forcing Functions](https://doi.org/10.1145/3449287)
- [W3C Supplemental Guidance: Cognitive Accessibility](https://www.w3.org/WAI/WCAG2/supplemental/#-cognitive-accessibility-guidance)
- [Reviewable files and revisions](https://docs.reviewable.io/files)
