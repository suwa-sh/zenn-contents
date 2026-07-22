---
title: "多段エージェントで対象固定が誤操作を3倍に増幅する現象と対処 - Binding Drift"
emoji: "🎯"
type: "tech"
topics: ["LLM", "AIAgent", "Evaluation", "Bedrock"]
published: false
---

ツール実行型の LLM エージェントは、最初のステップで操作対象 (顧客・チケット・ドキュメントなど) を特定し、後続のステップでその対象を操作し続けます。この「対象との結合 (エンティティバインディング)」は、多段ワークフローでは 2 つの経路で破綻します。正しい結合が途中で別対象へ黙って切り替わる binding drift と、最初の誤りが後続ステップ全てへ持ち回られる error propagation です。

本記事では、この 2 現象を分離して定量化した論文 "Binding Drift in Multi-Step Tool-Augmented Agents" と公開実装を調査し、実験ハーネスの構造、データモデル、再現手順、実務エージェントへの組み込み方法までを解説します。

> 対象論文: [Binding Drift in Multi-Step Tool-Augmented Agents](https://arxiv.org/abs/2607.18316) (arXiv:2607.18316, 2026-07-17 v1)
> 公開実装: [shashank-indukuri/binding-drift](https://github.com/shashank-indukuri/binding-drift)
> 調査日: 2026-07-23

## 概要

本論文は、ツール実行型 LLM エージェントが多段ワークフローを実行する際の「エンティティバインディング (entity binding、対象との結合)」の破綻を対象にします。

エージェントは Step 1 で対象 (顧客・チケット・ドキュメント等) を特定し、以降のステップでその対象に対して操作を続けます。本論文は、この一連の流れで何が起きるかを 2 種類に区別して定量化します。

| 現象名 | 定義 |
|---|---|
| Binding Drift (バインディングドリフト) | Step 1 では正しい対象にバインディングしたのに、後続ステップで別の対象へ黙って切り替わる現象 |
| Error Propagation (エラー伝播) | Step 1 で誤った対象にバインディングし、その誤りを後続ステップ全てに持ち回る現象 |

論文は、この 2 現象を排他的なワークフロー集合上で個別に採点します。これにより、両者が混同されない形で定量比較できます。

### 問題設定

論文は、対策 (特にエンティティロック) が両現象に対して逆方向に作用する点を明らかにしました。

- エンティティロック (最初のバインディングを固定保存し後続ステップで再利用) は drift を解消します。
- 同じロックが、Step 1 の誤りをそのまま後続ステップへ確実に運ぶため、error propagation を増幅します。

このため、単一の対策では両現象に同時対応できません。論文は、独立再検証 (元の指示から対象を再導出する手法) のみが両現象を同時に抑えられることを示しました。

### 先行研究との関係

本論文は、先行論文 "Entity Binding Failures in Tool-Augmented Agents" (arXiv:2606.30531、著者: Rahul Suresh Babu, Shashank Indukuri) を多段設定へ拡張したものです。

| 項目 | Paper 1 (単一 step、arXiv:2606.30531) | 本論文 (多段、arXiv:2607.18316) |
|---|---|---|
| 評価設定 | 60 タスク、5 モデル backend、6 tool-use 手法。1 instruction → 1 action を 1 回だけ採点 | 200 workflows、8 モデル backend、580 entity-binding 採点対象 step |
| 主要な指摘 | ツール選択は 0% 誤りでも、wrong-entity action が 24.0-26.0% の runs で発生 | 単一 step の誤りが、多段では drift と propagation という異なる経路で悪化する |
| 観測できなかったこと | ステップをまたいだ挙動 (対象が保持されるか、切り替わるか) | drift 率と propagation 増幅率を分離して定量化 |

先行論文は「エージェントは正しいツールを選ぶが、間違った対象にバインディングする」ことを単一アクションで実証しました。本論文は、その誤りが多段ワークフローの時間軸上でどう推移するか (維持・drift・propagation) を明らかにした点が新規性です。

周辺の関連研究との位置関係は次のとおりです (いずれも参考リンク参照)。

- "No Action Without a NOD" (arXiv:2605.12240) は、行動前に別エージェントの承認を要求するマルチエージェント構成の提案です。本論文の「破壊的操作の直前に独立検証を挟む」という防御と同型の発想を、アーキテクチャ側から扱う補完的研究です。
- "Always-On Agents" (arXiv:2606.30306) は、エージェントの永続メモリ・状態・ガバナンスのサーベイです。本論文が反証する「永続化 = 正しい挙動」という前提側の整理にあたり、対比軸として参照できます。
- "AgentLTL" (arXiv:2607.02599) は、ツール実行エージェントの手続き遵守を軌跡検証で測定・強制するフレームワークです。本論文の trajectory 採点・provenance ログ監査と問題意識を共有する並行研究です。

### 対策アプローチの比較

論文は、baseline を含む主要 6 種類の defense configuration (防御構成) と、実践的な LLM 再検証 2 構成を比較しました。増幅率・削減率は injection mode (誤ったバインディングを Step 1 の前に意図的に注入し、伝播だけを測定する条件) での数値です。

| 対策 | メカニズム | 効果 |
|---|---|---|
| Baseline (`baseline`) | 対策なし。各ステップで独立に対象解決 | 誤った行動 907 件 (injection mode 基準値) |
| Entity Lock (`lock`) | 最初の具体的なバインディングをピン留めし、後続ステップで再利用する | drift は解消。一方で誤った行動を 907 件から 2,746 件へ 3.0 倍に増幅 (bootstrap 95% CI [2.8, 3.3])。モデル別最大は Claude Opus 4.5 で 8.5 倍 |
| Provenance Checkpoint (`lock_provenance`) | 各ステップで「参照表現 → バインディング先 ID → 根拠」を記録する | ロックの挙動を追跡可能にする補助機構。単独では増幅を防がない |
| Drift-Aware Gate (`lock_provenance_gate`) | 後続ステップの解決結果がロックと乖離した場合、行動せず確認を挟む | ロックによる増幅を防止する |
| 統合対策 (`full`) | ロック + provenance + gate を組み合わせた対策一式 | 個別対策より高い防御力を狙う構成 |
| Oracle Re-Verify (`reverify`) | 正解リゾルバで元の指示から対象を再導出する、実装に依存しない理論上限 | 誤った行動を 180 件へ 80% 削減 (0.20 倍、CI [0.17, 0.23]) |
| LLM Self-Verifier (`llm_self_reverify`) | 同一モデルが元の指示から対象を独立に再導出し、バインディングと照合する | 誤った行動を 261 件へ削減 (0.29 倍) |
| LLM Cross-Verifier (`llm_cross_reverify`) | 安価な別モデル (論文では Nova Micro) が元の指示から対象を独立に再導出し、バインディングと照合する | 誤った行動を 907 件から 189 件へ 79% 削減 (0.21 倍、CI [0.18, 0.25])。oracle 上限 (180 件) にほぼ到達 |

ワークフローパターンのうち `dependent-chain` (D3、前ステップの出力が次ステップの入力を決める連鎖型) が最も増幅されやすく、最大 16.6 倍に達しました。baseline では 61 件だった誤った行動が、lock 下では誤った口座バインディングが最終ステップの誤送信まで連鎖し 1,011 件に達しています。

なお、本表の 95% CI は論文 Table 2 の脚注に記載された論文報告値です (workflow×model ペアを復元抽出する 10,000 回の bootstrap resampling、percentile 法、seed=42)。本ドキュメントでの独自算出値ではありません。

### 記憶保持・状態管理系の研究との比較

論文は、対話状態追跡 (Dialogue State Tracking, DST) 研究 (MultiWOZ・SGD 等) との対比で、エンティティロックの位置づけを説明しています。

| 観点 | DST (MultiWOZ・SGD 等) | 本論文のエージェント設定 |
|---|---|---|
| スロット永続化の評価 | 対話ターンをまたいで belief state を蓄積するのが正しい挙動 | Step 1 のバインディングが誤っている場合、永続化はその誤りを実世界アクションへ確実に運ぶため有害 |
| 訂正可能性 | 対話ターンは後続のやり取りで訂正できる | 各解決が不可逆な実世界アクション (送金・削除・通知等) を引き起こす |
| 含意 | persistence = correct behavior | persistence だけでは不十分。独立再検証との併用が必要 |

**永続化 (entity lock) と再検証 (re-verification) は代替関係にない**点が本論文の中心的な含意です。ロックは drift を防ぐための状態管理であり、再検証はバインディングそのものの正しさを繰り返し確認する仕組みです。両者は防ぐ現象が異なるため、drift-aware gate のようにロック (永続化) と再検証 (乖離検知) を組み合わせる設計が、単独対策より有効に機能します。

### 問題の全体像

```mermaid
graph TD
  A["多段ワークフロー"]
  B["Step1<br/>バインディング正しい"]
  C["Step1<br/>バインディング誤り"]
  D["Binding Drift<br/>後続で対象転換"]
  E["Error Propagation<br/>誤りが継続伝播"]
  A --> B
  A --> C
  B --> D
  C --> E
```

| 要素名 | 説明 |
|---|---|
| 多段ワークフロー | エージェントが複数ステップにわたり同一対象を操作する処理単位 |
| Step1 バインディング正しい | 最初のステップで正しい対象にバインディングできた状態 |
| Step1 バインディング誤り | 最初のステップで誤った対象にバインディングした状態 |
| Binding Drift | 正しいバインディングから始まり、後続ステップで別対象へ黙って切り替わる現象 |
| Error Propagation | 誤ったバインディングが後続ステップ全てに持ち回られる現象 |

## 実験規模と主要な定量結果

論文の実験規模と主要な定量結果は次のとおりです。

- 8 モデル backend を横断評価 (Amazon Nova Micro、Amazon Nova 2 Lite、Amazon Nova Premier、Llama-3.1-8B Instruct、Llama-3.3-70B Instruct、Claude Haiku 4.5、Claude Sonnet 4.5、Claude Opus 4.5)
- 200 の多段ワークフロー (5 つの drift パターン D1-D5 で構成)、580 ステップが entity-binding 採点対象
- 4 つのエンタープライズドメイン (calendar・CRM・docs・tickets)
- 40,000 回以上のモデル呼び出し (natural mode + controlled injection mode)
- 論文が報告する主要 6 種類の defense configuration (`baseline` / `lock` / `lock_provenance` / `lock_provenance_gate` / `full` / `reverify` = oracle 上限) に加え、実装には実践的 LLM 再検証 2 構成 (`llm_self_reverify` / `llm_cross_reverify`) とアブレーション 2 構成 (`provenance_only` / `gate_only`) の計 10 構成を定義
- natural mode (誤りを注入せず、各ステップで独立に対象解決させる条件) で、Step 1 で正しくバインディングできた「適格な (eligible)」workflows のうち 18% で binding drift が発生 (8 モデル集計)。この 18% は論文 Section 5.4 の 8 モデル集約値であり、モデル別内訳と CI は論文に非開示。関連情報として、baseline の per-step 誤り率が step とともに約 3% から約 28% まで上昇するレンジのみ図示されている
- injection mode (Step 1 の前に誤ったバインディングを意図的に注入する条件) で、entity lock が誤った行動を 907 件から 2,746 件へ 3.0 倍に増幅。モデル別最大は Claude Opus 4.5 の 8.5 倍
- LLM cross-verifier (`llm_cross_reverify`) は誤った行動を 907 件から 189 件へ 79% 削減 (0.21 倍)。oracle 上限 (`reverify`) は 180 件へ 80% 削減 (0.20 倍) で両者はほぼ一致
- ワークフローパターンのうち `dependent-chain` (D3) が最も増幅されやすく、baseline 61 件 → lock 下 1,011 件の最大 16.6 倍を記録
- 先行論文 (arXiv:2606.30531) が単一 step で報告した wrong-entity action 率 24.0-26.0% を出発点に、多段設定での drift・propagation の分離定量化へ拡張

### ドリフトパターン D1-D5 の定義

ベンチマークの 200 workflows は、5 つのドリフトパターン各 40 件で構成されています (論文 Benchmark 節)。

| ID | パターン | 定義 | シナリオ例 |
|---|---|---|---|
| D1 | Temporal Recurrence (`temporal`) | 繰り返しイベントの複数インスタンスが存在し、step 1 以降は名前の修飾子が省略される | 4 つの「Weekly Sync」イベントから顧客向けを特定した後、以降のステップで修飾子が繰り返されない |
| D2 | Distractor Injection (`distractor_injection`) | より強いメタデータを持つ同名エンティティがワークフロー途中で注入される | 途中で登場する同名の別エンティティに引きずられる |
| D3 | Dependent Chain (`dependent_chain`) | step k が step k-1 で解決したエンティティを参照する (ドメイン横断) | アカウント → そのオーナーへのメール送信のように、エンティティ型が変わりながら連鎖する |
| D4 | True Ambiguity (`true_ambiguity`) | 曖昧さを解消する手掛かりが存在せず、確認質問 (CLARIFY) が正解の挙動 | gold=CLARIFY であり、いかなる ACT も誤りとして採点される |
| D5 | Silent Switch (`silent_switch`) | 3 つの同名エンティティが存在し、step 1 以降は修飾子が省略される | 同名 3 件の中で対象が黙って入れ替わる |

D4 (true_ambiguity) は「ACT した時点で誤り」という特殊な採点になるため、主実験 (論文 Table 2) の wrong-action 集計は D4 を除いた 160 workflows (non-ambiguity) で行われています。パターン別分析 (論文 Table 5) では D4 も独立に評価されます。

## 実験ハーネスの構造

論文の実験ハーネスと防御レイヤーを、C4 モデルの 3 段階で読み替えます。

まず、arXiv HTML (2607.18316v1) の章立てと、実装 repo (`shashank-indukuri/binding-drift`) の対応を確認します。

| 論文の章 | 内容 | 対応する実装 |
|---|---|---|
| Problem Formulation | ワークフロー・バインディング状態・指標の定義 | `environment.py` の `WorkflowState` / スコアリング関数 |
| Benchmark | D1-D5 の 5 ドリフトパターン、合成環境、注入プロトコル | `generate_200_workflows.py` / `environment.py` の `inject_early_binding` |
| Defenses | 4 種の防御機構 (ロック・来歴・ゲート・再検証) | `environment.py` の `apply_defenses`、`run_drift_experiment.py` の LLM 再検証呼び出し |
| Evaluation | 8 モデル backend での結果 | `run_drift_experiment.py` / `aggregate_results.py` / `aggregate_injection.py` |
| (図表) | ステップ別誤りエンティティ率の図 | `plot_drift_curve.py` |

### システムコンテキスト図

```mermaid
graph TB
  Researcher["研究者"]
  Developer["実務エージェント<br/>開発者"]
  Harness["バインディング<br/>ドリフト実験<br/>ハーネス"]
  LLMPlatform["LLM API基盤"]
  Models["モデル群"]
  Researcher --> Harness
  Developer --> Harness
  Harness --> LLMPlatform
  LLMPlatform --> Models
```

| 要素名 | 説明 |
|---|---|
| 研究者 | ドリフトと伝播を区別して定量化し、防御層の効果を検証する利用者 |
| 実務エージェント開発者 | 自分のエージェントに防御層を組み込むかどうかの判断材料を得る利用者 |
| バインディングドリフト実験ハーネス | 多段ワークフローでバインディングエラーを注入し、防御構成ごとに採点する実験基盤 |
| LLM API基盤 | ハーネスがモデル呼び出しに使う共通 API 層 |
| モデル群 | LLM API基盤上で稼働する評価対象のモデル群 |

### コンテナ図

```mermaid
graph TB
  subgraph Harness["バインディングドリフト<br/>実験ハーネス"]
    WFGen["ワークフロー生成器<br/>generate_200_workflows.py"]
    WFData["ワークフロー<br/>データセット<br/>workflows_200.jsonl"]
    Env["ステートフル環境<br/>+防御レイヤー+採点<br/>environment.py"]
    Runner["マルチステップ<br/>ランナー<br/>run_drift_experiment.py"]
    StepResults["実行結果<br/>per-step・per-workflow<br/>CSV"]
    AggNatural["集計器<br/>aggregate_results.py"]
    AggInject["注入実験集計器<br/>aggregate_injection.py"]
    Summaries["集計結果<br/>summary CSV・LaTeX"]
    FigGen["図生成器<br/>plot_drift_curve.py"]
    OfflineTest["オフライン検証<br/>test_offline.py"]
    MockRun["モック実行<br/>mock_run.py"]
  end
  LLMPlatform["LLM API基盤"]
  WFGen --> WFData
  Runner --> WFData
  Runner --> Env
  Runner --> LLMPlatform
  Runner --> StepResults
  AggNatural --> StepResults
  AggInject --> StepResults
  AggNatural --> Summaries
  AggInject --> Summaries
  FigGen --> Summaries
  OfflineTest --> Env
  MockRun --> Env
```

| 要素名 | 説明 |
|---|---|
| ワークフロー生成器 | パラメータ化テンプレートから 200 件の多段ワークフローを生成する `generate_200_workflows.py` |
| ワークフローデータセット | 生成された全ワークフローを保持するデータストア `workflows_200.jsonl` |
| ステートフル環境+防御レイヤー+採点 | ロック・来歴・採点などの決定的ロジックを提供する中核ライブラリ `environment.py` |
| マルチステップランナー | ワークフローをステップ単位で LLM API 基盤に投げ、防御を適用して結果を記録する `run_drift_experiment.py` |
| 実行結果 | ランナーが出力するステップ単位・ワークフロー単位の生データ |
| 集計器 | 自然実行結果を構成別・パターン別サマリーに集計する `aggregate_results.py` |
| 注入実験集計器 | 誤り注入実験の結果を構成別・モデル別サマリーに集計する `aggregate_injection.py` |
| 集計結果 | 集計器が出力するサマリー表と LaTeX 表 |
| 図生成器 | 集計結果からステップ別誤りエンティティ率の図を生成する `plot_drift_curve.py` |
| オフライン検証 | 独立したワークフローファイルを使い、API 課金なしで採点ロジックを検証する `test_offline.py` |
| モック実行 | 疑似モデルでパイプライン全体を API なしで一通り動かす `mock_run.py` |
| LLM API基盤 | ランナーが呼び出す外部モデル実行基盤 |

**命名に関する注記** (ソース確認の結果、README の記述と実装が食い違う点):

- `workflows_200.jsonl` を実際に生成しているのは `generate_200_workflows.py` です。README の記載 (`generate_hard_workflows.py` → `workflows_200.jsonl`) は実装と一致しません。
- `generate_hard_workflows.py` は別スクリプトで、36 件のワークフローを `workflows_hard.jsonl` に出力します。
- `test_offline.py` と `mock_run.py` は、それぞれ `workflows_hard.jsonl` (なければ `workflows_multistep.jsonl`)、`workflows_multistep.jsonl` という独自のワークフローファイルを読み込みます。上図でこの 2 コンポーネントを `workflows_200.jsonl` に接続していないのはこのためです。

### コンポーネント図

`environment.py` の防御レイヤー本体と、`run_drift_experiment.py` 側の config 分岐・injection 機構をドリルダウンします。集計層 (`aggregate_results.py` / `aggregate_injection.py` / `plot_drift_curve.py`) は論文の主張 (防御の作用機序) に直接関与しない CSV 加工処理のため、コンテナ図までを本調査の対象とします。

```mermaid
graph TB
  subgraph EnvCore["防御レイヤー本体<br/>environment.py"]
    ConfigFeatures["CONFIG_FEATURES<br/>設定別フラグ表"]
    WorkflowState["WorkflowState<br/>ロック・来歴管理"]
    ApplyDefenses["apply_defenses<br/>防御適用処理"]
    ScoreStep["score_step<br/>ステップ採点"]
    ScoreWorkflow["score_workflow<br/>軌跡採点"]
  end
  subgraph RunnerLayer["config分岐と<br/>injection機構<br/>run_drift_experiment.py"]
    ConfigHint["CONFIG_HINT<br/>設定別プロンプト文言"]
    ErrorInjector["エラー注入処理<br/>inject_early_binding"]
    LLMReverifier["LLM再検証呼び出し<br/>self・cross判定"]
  end
  ConfigFeatures --> ApplyDefenses
  WorkflowState --> ApplyDefenses
  ApplyDefenses --> WorkflowState
  ApplyDefenses --> ScoreStep
  ApplyDefenses --> LLMReverifier
  LLMReverifier --> WorkflowState
  LLMReverifier --> ScoreStep
  ScoreStep --> ScoreWorkflow
  ErrorInjector --> WorkflowState
```

#### 防御レイヤー本体 (environment.py)

| 要素名 | 説明 |
|---|---|
| CONFIG_FEATURES | 設定名ごとに lock・provenance・gate・reverify・llm_reverify の各フラグを保持する表 |
| WorkflowState | ロック値・来歴ログ・可視エンティティ・正解ターゲットを保持するワークフロー単位の状態オブジェクト |
| apply_defenses | フラグに応じてロック適用・ドリフトゲート・来歴記録・オラクル再検証を実行し、実効予測を返す関数 |
| score_step | ステップ単位でツール正誤・エンティティ正誤・誤エンティティ行動を判定する関数 |
| score_workflow | ワークフロー単位でドリフト・伝播・回復・複合係数を集計する関数 |

#### config分岐とinjection機構 (run_drift_experiment.py)

| 要素名 | 説明 |
|---|---|
| CONFIG_HINT | 設定ごとに異なる自然文のプロンプト文言。決定的フラグとは独立にモデルへの指示文を変える |
| エラー注入処理 | `--inject` フラグ指定時に、実行開始前のワークフロー状態へ誤ったバインディングを事前に仕込む処理 |
| LLM再検証呼び出し | apply_defenses の実効予測に対し、別モデル呼び出しでバインディングを再検証し、必要なら補正する処理 |

#### 設定名とレイヤーの対応 (差別化の3軸)

実装の 10 種類の config は、単一の軸では区別できません。ソースを確認すると、差別化は次の 3 軸に分かれています。

- 決定的フラグ (`CONFIG_FEATURES`、`environment.py`)
- プロンプト文言 (`CONFIG_HINT`、`run_drift_experiment.py`)
- 検証モデルの選択 (ランナー内の分岐、`run_drift_experiment.py`)

| 設定名 | 決定的フラグ | プロンプト文言 | 検証モデル |
|---|---|---|---|
| baseline | すべて False | 各ステップを独立に解決するよう指示 | なし |
| lock | lock のみ True | 確定した ID を以降も使うよう指示 | なし |
| lock_provenance | lock + provenance | ID固定 + 選定理由の記録を指示 | なし |
| lock_provenance_gate | lock + provenance + gate | ID固定 + 分岐時 CLARIFY を指示 (full とは文言が異なる) | なし |
| full | lock + provenance + gate (lock_provenance_gate と同一フラグ) | ID固定 + 記録 + 分岐時 CLARIFY を指示 (llm_self/cross と同一文言) | なし |
| reverify | lock + provenance + gate + reverify | 元の依頼から都度再導出するよう指示 | オラクル (正解データによる決定的補正) |
| provenance_only | provenance のみ True (アブレーション) | 記録のみを指示 | なし |
| gate_only | gate のみ True (アブレーション) | 不明時 CLARIFY のみを指示 | なし |
| llm_self_reverify | lock + provenance + gate + llm_reverify (full + llm_reverify) | full と同一文言 | 同一モデルによる再検証 |
| llm_cross_reverify | llm_self_reverify と同一フラグ | llm_self_reverify と同一文言 | 軽量な別モデルによる再検証 (差分はここのみ) |

この表からわかる 2 つの事実を補足します。

- `full` と `lock_provenance_gate` は決定的フラグが完全に一致します。両者を分けているのはプロンプト文言の言い回しだけです。
- `llm_self_reverify` と `llm_cross_reverify` は決定的フラグとプロンプト文言の両方が完全に一致します。両者を分けているのは、ランナーが再検証に使うモデルの選択 (同一モデルか、軽量な別モデルか) だけです。

## ベンチマークのデータモデル

### 概念モデル

```mermaid
graph TB
  subgraph Domain
    subgraph Workflow
      Entity
      Tool
      Injection
      subgraph Step
        EntityBinding["Entity<br/>Binding<br/>gold・予測の2役"]
      end
    end
  end
  subgraph Trajectory
    ScoredStep["Scored<br/>Step"]
  end
  ModelBackend["Model<br/>Backend"] --> Trajectory
  DefenseConfig["Defense<br/>Config"] --> Trajectory
  Workflow --> Trajectory
  EntityBinding --> Entity
  Injection --> Entity
  Step --> Tool
  ScoredStep --> EntityBinding
  Trajectory --> Summary
```

| 要素名 | 説明 |
|---|---|
| Domain | ワークフローが属する業務領域。calendar・CRM・docs・tickets の 4 種類 |
| Workflow | 1 つの多段タスクの定義。対象エンティティ・ステップ列・利用可能ツール・注入メタデータを保有する |
| Entity | ワークフロー内に登場するドメインオブジェクト。人物・文書・予定・顧客アカウント・チケットのいずれか |
| Tool | ワークフローが呼び出せる操作の定義。ドメインごとに固定の集合を持つ |
| Injection | 誤り注入実験用のメタデータ。注入する誤りエンティティと、その言い回し・注入位置を保有する |
| Step | ワークフローを構成する 1 ステップ。指示文と正解ラベル (ツール・バインディング・リスク) を保有する |
| Entity Binding | 参照スロットと対象エンティティ ID の対応 (slot → entity_id)。正解 (gold) のバインディングと、モデルが実行時に生成する予測バインディングの 2 つの役割が同じ形状を取る (図中ノードの「gold・予測の2役」注記) |
| Model Backend | 評価対象の LLM モデル。8 種類 (Nova 系・Llama 系・Claude 系) |
| Defense Config | ワークフロー実行時に適用する防御設定。ロック・provenance・gate・再検証の有効/無効の組み合わせ |
| Trajectory | 1 つの Workflow を、特定の Model Backend と Defense Config の組で実行した結果。drift・propagation 等のトラジェクトリ指標を保有する |
| Scored Step | Trajectory 内の 1 アクションステップの採点結果。正解ツール一致・正解エンティティ一致・wrong_entity フラグ等を保有する |
| Summary | 多数の Trajectory を config・model・pattern 単位で集計した結果 |

### 情報モデル

```mermaid
classDiagram
  class Domain {
    string domain_id
  }
  class Workflow {
    string workflow_id
    string domain
    string drift_pattern
    string target_entity_id
    int n_steps
  }
  class Entity {
    string id
    string type
    string name
    string metadata
  }
  class Tool {
    string name
    string description
    list requires
  }
  class Injection {
    string step1_referent
    string inject_wrong_id
    string inject_phrasing
    int inject_position
  }
  class Step {
    string instruction
    string gold_tool
    string risk
    string carry_slot
    bool drift_possible
    list injected_entities
  }
  class EntityBinding {
    string slot
    string entity_id
  }
  class ModelBackend {
    string model_id
    string short_name
  }
  class DefenseConfig {
    string config_id
    bool lock
    bool provenance
    bool gate
    bool reverify
    bool llm_reverify
  }
  class Trajectory {
    string workflow_id
    string model
    string config
    int n_steps
    int n_action_steps
    bool bound_correct_at_1
    int n_wrong_entity_actions
    bool drift
    bool drift_eligible
    bool propagated
    bool mis_bound_at_1
    bool recovery
    bool recovery_eligible
    int compounding_factor
    bool workflow_success
    int over_clarification_steps
    int risk_weighted_wrong_entity
    list per_step_wrong
  }
  class ScoredStep {
    bool is_action_step
    bool needs_clarification
    bool acted
    bool clarified
    bool tool_correct
    bool entity_correct
    bool wrong_entity
    string bound_id
    string risk
    int risk_weighted_wrong_entity
    bool step_success
    map defense_events
  }
  class Summary {
    string config
    int n_workflows
    float workflow_success_rate
    float binding_drift_rate
    float propagation_rate
    int total_wrong_entity_actions
  }

  Domain "1" --> "many" Workflow
  Workflow "1" --> "many" Entity
  Workflow "1" --> "many" Tool
  Workflow "1" --> "1" Injection
  Workflow "1" --> "many" Step
  Step "1" --> "1" EntityBinding
  EntityBinding "many" --> "1" Entity
  Workflow "1" --> "many" Trajectory
  ModelBackend "1" --> "many" Trajectory
  DefenseConfig "1" --> "many" Trajectory
  Trajectory "1" --> "many" ScoredStep
  ScoredStep "many" --> "1" EntityBinding
  Trajectory "many" --> "1" Summary
```

| 要素名 | 説明 |
|---|---|
| Domain | `workflow.domain` フィールドの値。calendar / crm / docs / tickets の 4 値を確認 (`data/workflows_200.jsonl` 実データ) |
| Workflow | `data/workflows_200.jsonl` の 1 行。`workflow_id` / `domain` / `drift_pattern` / `target_entity_id` / `n_steps` を実データで確認。`drift_pattern` は temporal (D1) / distractor_injection (D2) / dependent_chain (D3) / true_ambiguity (D4) / silent_switch (D5) の 5 値 |
| Entity | `base_entities` 配列の要素。`id` / `type` は全ドメイン共通。`name` は実装では `name` (person・account) または `title` (document・event・ticket) と表記が分かれる。テーブルでは一般化して `name` と表記 (実装から補完) |
| Tool | `tools` 配列の要素。`name` / `description` / `requires` (例: `"event:calendar_event"` のような `slot:type` 文字列のリスト) を実データで確認 |
| Injection | `step1_referent` / `inject_wrong_id` / `inject_phrasing` / `inject_position` を実データで確認。`inject_phrasing` は `authoritative` / `uncertain` / `tool_return` 等の値を取る (実装から補完) |
| Step | `steps` 配列の要素。`instruction` / `gold_tool` / `risk` / `carry_slot` / `drift_possible` / `injected_entities` を実データで確認。`risk` は low/medium/high/critical の 4 段階で、重みは `RISK_WEIGHT = {low: 1, medium: 2, high: 4, critical: 5}` (`code/environment.py` で確認) |
| Entity Binding | `Step.gold_bindings` (正解) と、モデル実行時の予測 `bindings` (`code/environment.py` `apply_defenses`) の共通形状。予測側はファイルへ永続化されず、Scored Step の `bound_id` / `wrong_entity` に結果として反映される (実装から補完) |
| Model Backend | 論文本文で 8 種類確認: Amazon Nova Micro・Nova 2 Lite・Nova Premier、Llama-3.1-8B・Llama-3.3-70B、Claude Haiku 4.5・Sonnet 4.5・Opus 4.5。`code/aggregate_injection.py` の `MODEL_ORDER` に短縮名、`results/wf_inject_ALL.csv` の `model` 列に Bedrock 完全 ID (`us.amazon.nova-micro-v1:0` 等) を確認。両者の対応は `modkey()` 関数の部分一致で解決 (実装から補完) |
| Defense Config | `code/environment.py` の `CONFIG_FEATURES` を実装で確認。論文本文が報告する主要 6 種は `baseline` / `lock` / `lock_provenance` / `lock_provenance_gate` / `full` / `reverify`。実装にはこれに加えて `provenance_only` / `gate_only` / `llm_self_reverify` / `llm_cross_reverify` の計 10 config が定義されている (実装から補完、アブレーションと実践的 LLM 再検証用途) |
| Trajectory | `results/wf_inject_ALL.csv` (injection mode) と `results/workflows_natural_ALL.csv` (natural mode) の 1 行。列名は `code/environment.py` の `score_workflow()` 戻り値と実データヘッダで確認。natural/injection の区別はファイル (スクリプト起動時の `--inject` フラグ) で決まり、行内に明示列はない。主要指標の定義 (`environment.py` で確認): `recovery` = step1 で誤バインディングだったが後続ステップで正解エンティティに復帰したか / `recovery_eligible` = step1 誤バインディングかつアクションステップ 2 つ以上 (recovery rate の分母) / `compounding_factor` = 1 件以上誤りが出た workflow 内の誤エンティティ行動の総数 / `risk_weighted_wrong_entity` = リスク重み付き誤行動の合計 |
| Scored Step | `code/environment.py` の `score_step()` 戻り値。ファイルへ直接永続化されない中間データで、`Trajectory.per_step_wrong` 等に集約される (実装から補完) |
| Summary | `results/summaries/*.csv` (`summary_by_config` / `summary_by_pattern_config` / `inject_by_config` / `inject_by_model` / `per_step_curve`) の実ヘッダで確認。集計粒度はファイルごとに config 単位・model 単位・pattern×config 単位などが異なる |

## 実験の再現手順

実験を再現するための構築手順です。

### 必須パラメータ一覧

`run_drift_experiment.py` (フル再実行用) の CLI フラグです。

| フラグ | 必須/既定値 | 説明 |
|---|---|---|
| `--workflows` | 必須 | 入力ワークフロー JSONL のパス |
| `--out` | 必須 | ステップ単位の結果 CSV 出力先 |
| `--wf-out` | 必須 | ワークフロー軌跡単位の結果 CSV 出力先 |
| `--models` | 必須 (可変長) | Bedrock モデル ID を空白区切りで複数指定 |
| `--region` | 既定値 `us-east-1` | AWS リージョン |
| `--configs` | 既定値は全 `CONFIGS` (10 種) | 検証する防御構成を空白区切りで複数指定 |
| `--sleep` | 既定値 `1.0` | ステップ間の待機秒数 |
| `--inject` | フラグ (store_true) | 制御注入モードを有効化 (初期ステップに誤バインディングを人工的に注入) |

集計スクリプトのフラグです。

| スクリプト | フラグ | 必須/既定値 | 説明 |
|---|---|---|---|
| `aggregate_injection.py` | `--wf` | 必須 (可変長) | 注入モード結果 CSV (複数ファイル指定可) |
| `aggregate_injection.py` | `--outdir` | 必須 | 出力先ディレクトリ |
| `aggregate_results.py` | `--wf` | 必須 | 自然モード (注入なし) 結果 CSV |
| `aggregate_results.py` | `--outdir` | 必須 | 出力先ディレクトリ |
| `plot_drift_curve.py` | `--curve` | 必須 | ステップ別ドリフト率 CSV |
| `plot_drift_curve.py` | `--outdir` | 必須 | 出力先ディレクトリ |

### リポジトリの取得

```bash
git clone https://github.com/shashank-indukuri/binding-drift.git
cd binding-drift
```

### Requirements (README 実物)

README の `Requirements` 節の記載です。

- Python 3.9 以上が必要です。
- オフライン検証・集計表生成には `pandas` のみ必要です。
- フル再実行には `boto3` / `botocore` / `tenacity` / `tqdm` が追加で必要です。

```bash
pip install pandas
pip install boto3 botocore tenacity tqdm   # フル再実行のみ必要
```

### オフライン検証 (API 不要)

`code/test_offline.py` は、挙動が既知の 4 種のスクリプトエージェント (`oracle` / `drifter` / `propagator` / `guesser`) を `environment.py` の状態機械に通し、ドリフト・伝播・回復の指標が仕様どおり算出されることを 25 個のアサーションで検証します。

```bash
cd code
python3 test_offline.py   # 25/25 assertions must pass
```

`code/mock_run.py` は、ハッシュ由来の決定的な疑似モデルでワークフロー全体を流し、CSV 出力と集計スクリプトの入出力形式を API なしで確認するデモです。生成される数値は実モデルの結果ではなく、パイプライン疎通確認専用です。

```bash
python3 mock_run.py
```

両スクリプトとも `../data/workflows_multistep.jsonl` (存在しない場合は `workflows_hard.jsonl`) を読み込みます。現行リポジトリの `data/` には `workflows_200.jsonl` のみが同梱されているため、実行前に次のコピーが必要です (下記「既知の注意点」参照)。

```bash
cp ../data/workflows_200.jsonl ../data/workflows_multistep.jsonl
```

### 保存済み結果からの集計再現 (API 不要)

リポジトリは `results/wf_inject_ALL.csv` (8 モデル × 5 構成 × 200 ワークフローの注入結果) と `results/summaries/` (集計済み CSV) を同梱しています。README のコマンドで表を再生成できます。

```bash
cd code
python3 aggregate_injection.py --wf ../results/wf_inject_ALL.csv --outdir ../out/
python3 aggregate_results.py --wf ../results/workflows_natural_ALL.csv --outdir ../out/
```

`aggregate_injection.py` を実際に実行し、論文のヘッドライン数値を確認しました。

| 防御構成 | 誤エンティティ行動数 | ベースライン比 |
|---|---|---|
| baseline | 907 | 1.00x |
| lock (entity lock) | 2,746 | 3.03x |
| reverify (oracle 上限) | 180 | 0.20x |

`aggregate_injection.py` の集計テーブルは `ORDER` リストに列挙された 6 構成 (`baseline` / `lock` / `lock_provenance` / `lock_provenance_gate` / `full` / `reverify`) だけを表示対象にしており、`llm_self_reverify` と `llm_cross_reverify` は既定の出力に現れません。両構成の行は `results/wf_inject_ALL.csv` に含まれているため、`pandas` で直接集計すると次のとおり一次データから再現できます。

```bash
python3 -c "
import pandas as pd
df = pd.read_csv('../results/wf_inject_ALL.csv')
df = df[df['drift_pattern'] != 'true_ambiguity']
print(df.groupby('config')['n_wrong_entity_actions'].sum())
"
```

`true_ambiguity` (D4) を除外しているのは、論文 Table 2 の主実験集計が D4 を除く 160 workflows (non-ambiguity) を対象とするためです (「実験規模と主要な定量結果」の D1-D5 定義表を参照)。

| 防御構成 | 誤エンティティ行動数 | ベースライン比 |
|---|---|---|
| llm_self_reverify (同一モデルで自己再検証) | 261 | 0.29x |
| llm_cross_reverify (安価な別モデルで交差再検証) | 189 | 0.21x (79% 削減) |

### reproduce_all.sh によるまとめ実行

`code/reproduce_all.sh` は、オフライン検証 → 注入結果集計 → 自然モード結果集計 → ドリフト曲線図生成の 4 ステップを順に実行するスクリプトです。

```bash
cd code
bash reproduce_all.sh
```

### フル再実行 (AWS Bedrock アクセスが必要)

README 記載のコマンドです。

```bash
cd code
python run_drift_experiment.py \
  --workflows ../data/workflows_200.jsonl \
  --out ../results/steps.csv --wf-out ../results/workflows.csv \
  --region us-east-1 \
  --models us.amazon.nova-micro-v1:0 us.amazon.nova-2-lite-v1:0 ... \
  --configs baseline lock lock_provenance lock_provenance_gate full reverify \
  [--inject]
```

論文で使用した 8 モデルの Bedrock モデル ID は、同梱結果 CSV (`results/wf_inject_ALL.csv`) の `model` 列から実際に確認できます。

| モデル | Bedrock モデル ID |
|---|---|
| Amazon Nova Micro | `us.amazon.nova-micro-v1:0` |
| Amazon Nova 2 Lite | `us.amazon.nova-2-lite-v1:0` |
| Amazon Nova Premier | `us.amazon.nova-premier-v1:0` |
| Llama-3.1-8B Instruct | `us.meta.llama3-1-8b-instruct-v1:0` |
| Llama-3.3-70B Instruct | `us.meta.llama3-3-70b-instruct-v1:0` |
| Claude Haiku 4.5 | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| Claude Sonnet 4.5 | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| Claude Opus 4.5 | `us.anthropic.claude-opus-4-5-20251101-v1:0` |

`--configs` に指定できる値は `code/environment.py` の `CONFIGS` リストに定義された 10 種類です。

| config 値 | 内容 |
|---|---|
| `baseline` | ロックなし・都度独立解決 |
| `lock` | 初回バインディングを固定 |
| `lock_provenance` | ロック + 出所ログ記録 |
| `lock_provenance_gate` | ロック + 出所ログ + 乖離時 CLARIFY |
| `full` | ロック + 出所ログ + ゲート (3機能フル) |
| `reverify` | oracle 再検証 (正解データ利用、上限値) |
| `provenance_only` | 出所ログのみ (アブレーション) |
| `gate_only` | ゲートのみ (アブレーション) |
| `llm_self_reverify` | 実践的 LLM 再検証 (同一モデル) |
| `llm_cross_reverify` | 実践的 LLM 再検証 (安価な別モデル、既定は Nova Micro) |

### 既知の注意点 (実機検証済み)

以下は実際にリポジトリを clone しコマンドを実行して確認した内容です。

| コマンド/ファイル | 状況 | 対処 |
|---|---|---|
| `test_offline.py` / `mock_run.py` | `data/workflows_multistep.jsonl` を読み込むが、リポジトリには `data/workflows_200.jsonl` のみ同梱 | 実行前に `workflows_200.jsonl` を `workflows_multistep.jsonl` としてコピーする |
| `reproduce_all.sh` Step 2 | `../results/workflows_inject_ALL.csv` を参照するが、実ファイル名は `wf_inject_ALL.csv` | README 記載どおり `--wf ../results/wf_inject_ALL.csv` を直接指定する |
| `reproduce_all.sh` Step 3 | `../results/workflows_natural_ALL.csv` を参照するが、同ファイルはリポジトリに未同梱 | このステップはスキップし、Step 4 の `--curve` は同梱済みの `../results/summaries/per_step_curve.csv` を直接指定する |

上記のファイル名補正を行った上で `test_offline.py` (25/25 assertions)・`mock_run.py`・`aggregate_injection.py --wf ../results/wf_inject_ALL.csv`・`plot_drift_curve.py --curve ../results/summaries/per_step_curve.csv` の 4 コマンドは正常終了し、論文のヘッドライン数値と一致することを確認しました。

## 実務エージェントへの組み込み方法

論文の再検証パターンを実務エージェントへ導入する方法です。

### 前提: oracle reverify と実践的 LLM reverify の違い

論文には 2 種類の reverify 実装があります。実務のエージェントに組み込めるのは後者のみです。

| 実装 | 参照元 | 性質 |
|---|---|---|
| oracle reverify (`reverify`) | `environment.py` の `apply_defenses` 内 (`feats.get("reverify")` 分岐) | `state.gold_target` (正解ラベル) と直接比較して補正する決定論的処理。正解データが要るため上限値の算出専用であり、実運用のエージェントでは代替不可 |
| 実践的 LLM reverify (`llm_self_reverify` / `llm_cross_reverify`) | `run_drift_experiment.py` の `LLM_REVERIFY_PROMPT` と該当ロジック (`feats.get("llm_reverify")` 分岐) | 独立した 2 回目の LLM 呼び出しで対象エンティティを再導出する。正解データを使わず、一般のツール実行エージェントに移植できる |

以降のコード例は `run_drift_experiment.py` の実装を土台にした、**論文の意図を反映した実装例**です。既存フレームワークの API ではなく、汎用 Python 疑似コードとして示します。

### reverify プロンプトの実物 (引用)

`run_drift_experiment.py` の `LLM_REVERIFY_PROMPT` は次のとおりです。独立解決者 (independent entity resolver) として、元の依頼文と候補エンティティのみからエンティティ ID を再導出させます。

```text
You are an independent entity resolver. Given the original user request and candidate entities, determine which entity the request refers to.

Original request: "{referent}"

Candidate entities:
{entities_json}

Which entity ID does the original request refer to? Return ONLY a JSON object:
{"entity_id": "the_correct_id"}

If genuinely ambiguous (multiple equally plausible), return:
{"entity_id": "AMBIGUOUS"}
```

### 実装上のポイント

論文実装 (`run_drift_experiment.py`) から読み取れる設計原則です。

- 再検証は破壊的な行動 (`ACT` 判定) の直前、かつ対象スロットに具体的なバインディングが存在するときだけ発火させます。
- 再検証プロンプトには「元の依頼文」と「現在の候補エンティティ一覧」だけを渡し、これまでの会話履歴やロック済み状態は渡しません。この隔離が、確認バイアスを避けるための要点です。
- 検証モデルは、主エージェントと同一モデル (self-reverify) より、安価な別モデル (cross-reverify、論文では Nova Micro) のほうが誤り抑制効果が高いという結果が出ています (0.29x 対 0.21x)。
- 再検証結果が `AMBIGUOUS` の場合は補正せず、既存のクラリフィケーション経路に委ねます。
- 再検証結果が現在のバインディングと一致しない場合のみ、バインディングとロック状態の両方を補正します (ロックだけ残すと以後のステップで再び古いバインディングが復元されるため)。
- 再検証の呼び出し失敗 (API エラー等) は補正をスキップし、処理をブロックしません。
- 追加コストは行動ステップ 1 回あたり LLM 呼び出し 1 回分です。

### 汎用ツール実行ループへの組み込み例 (疑似コード)

function calling / MCP ツール実行ループの一般形に、破壊的操作の直前フックとして reverify を挿入する例です。`run_drift_experiment.py` の該当ロジック (214〜238 行目) を汎用化しています。以下は設計意図を示す疑似コードであり、そのまま動作するコードではありません (`call_llm` / `primary_agent_call` / `conversation_steps` は利用するフレームワークの呼び出しに読み替えます)。

```python
# 論文の意図を反映した実装例。既存フレームワークの API は使用しない。
# 参照元: code/run_drift_experiment.py (LLM_REVERIFY_PROMPT, CROSS_VERIFY_MODEL, 214-238行目)
#         code/environment.py (WorkflowState.locks, oracle reverify との対比)

DESTRUCTIVE_TOOLS = {"delete_ticket", "send_payment", "share_document", ...}

def maybe_reverify_before_action(action, original_request, candidate_entities,
                                  carried_binding, verifier_model, primary_model):
    """破壊的操作の直前に独立した LLM で対象エンティティを再導出する。"""
    if action.tool not in DESTRUCTIVE_TOOLS:
        return action  # 破壊的操作以外は再検証しない

    slot = action.carry_slot
    current_id = action.bindings.get(slot)
    if current_id is None:
        return action

    # 会話履歴・ロック状態は渡さず、元の依頼文と候補一覧だけを渡す
    prompt = LLM_REVERIFY_PROMPT.format(
        referent=original_request,
        entities_json=json.dumps(candidate_entities, indent=1),
    )
    verify_model = verifier_model or primary_model  # cross か self かを呼び出し側で選択

    try:
        resolved = call_llm(verify_model, prompt)
        resolved_id = json.loads(resolved)["entity_id"]
    except Exception:
        return action  # 再検証呼び出し失敗時は補正せず続行

    if resolved_id == "AMBIGUOUS":
        return action  # 既存のクラリフィケーション経路に委ねる

    if resolved_id != current_id:
        action.bindings[slot] = resolved_id
        carried_binding[slot] = resolved_id  # ロック状態も同時に補修する
        action.audit_log.append({"reverify_corrected": True, "from": current_id, "to": resolved_id})

    return action


# ツール実行ループ本体への挿入位置
def tool_execution_loop(user_request, tools):
    state = {}
    for step in conversation_steps(user_request, tools):
        action = primary_agent_call(step, state)          # 1回目: 主エージェント呼び出し
        action = maybe_reverify_before_action(             # 破壊的操作の直前フック
            action, user_request, state["visible_entities"],
            state["locks"], verifier_model="cheap-model-id",
            primary_model="primary-model-id")
        execute_tool(action)                               # 実際のツール実行はこの後
```

### 設計選択の根拠

論文の該当節・実装から確認できた根拠です。

| 選択 | 根拠 |
|---|---|
| 破壊的操作の直前だけに挿入する | 全ステップに挿入するとコストが線形に増える一方、論文の実験は行動 (ACT) ステップに限定して発火させている (`run_drift_experiment.py` 214行目の `eff.get("decision") == "ACT"` 条件) |
| 会話履歴・ロックを渡さない | 独立再導出という前提を壊さないため。ロック状態を渡すと確認バイアスで検証が無効化する |
| cross-reverify を優先 | 実験結果で self-reverify (261, 0.29x) より cross-reverify (189, 0.21x, 79% 削減) のほうが誤り抑制効果が高い |
| AMBIGUOUS は補正しない | 真に曖昧なケースを誤って確定させないため。クラリフィケーション判断は別レイヤーに委譲する |

## 運用での防御設計

稼働後の実務エージェント運用に、論文の防御層をどう組み込むかを整理します。

### 破壊的操作の直前再検証運用

論文は 5 種類の防御層 (lock / provenance / gate / oracle 再検証 / LLM 再検証) を定義しています。実装 (`code/environment.py`) では、baseline とアブレーションを含む計 10 構成が `CONFIG_FEATURES` と `CONFIGS` に定義されています (「実験ハーネスの構造」の設定対応表を参照)。

| 防御層 | 論文の定義 | コストの性質 |
|---|---|---|
| entity lock | 最初の具体的バインディングを固定し、以降のステップで再利用する | 追加呼び出しなし。ただし誤りを固定するリスクを持つ |
| provenance checkpoint | 各ステップで `referent → bound_id → evidence` を記録する | ログ書き込みのみ。追加 LLM 呼び出しなし |
| drift-aware gate | 後続ステップの解決結果が lock と乖離した場合、実行せず確認質問に切り替える | 判定ロジックのみ。追加 LLM 呼び出しなし |
| independent re-verification (oracle) | 元のリクエストから正解リゾルバで target を再導出する | 実装には ground truth リゾルバが必要で、実運用では代替不可 |
| LLM cross-verifier | 安価な別モデル (論文では Nova Micro) で 1 回だけ再検証する | 1 ステップあたり約 0.3 秒のレイテンシと軽微なトークンコストを追加する |

**再検証の挿入位置** (論文知見からの翻訳・実装案):

- 破壊的操作 (write / send / delete 等) の直前だけに reverify を挟みます。
- 参照系の読み取り操作には reverify を挟みません。理由は、後述のとおり再検証は over-clarification を増やすためです。
- gate は「発散を検知して確認質問に切り替える」処理のみで、追加の LLM 呼び出しを伴いません。低コストで先行導入できます。

```text
# 実装イメージ (論文コードの llm_cross_reverify を実務エージェントに適用する案)
if step.decision == "ACT" and step.risk_tier == "destructive":
    verified_id = cheap_model.reverify(original_request, candidate_entities)
    if verified_id != step.bound_id:
        step.bound_id = verified_id
        log_correction(step)
```

再検証専用モデルは、実行本体のモデルと同一である必要がありません。論文では `llm_self_reverify` (同一モデル) と `llm_cross_reverify` (Nova Micro など別モデル) の 2 系統を比較し、両者とも oracle に近い性能を示しています。

### drift の検知・監視 (trajectory ログ監査)

provenance 機能を有効にすると、各ステップ後に以下の形式でログが追記されます。

| フィールド | 内容 |
|---|---|
| `step_idx` | ワークフロー内のステップ順序 |
| `slot` | バインディング対象のスロット名 (例: account, owner) |
| `bound_id` | そのステップで解決されたエンティティ ID |
| `decision` | `ACT` または `CLARIFY` |

このログは append-only のチェックポイントログとして機能し、バインディングの遷移を監査可能にします。実務エージェントでの監視設計案 (論文知見からの翻訳):

- スロット単位で `bound_id` の時系列を追い、step N と step N+1 の値が変化した箇所を抽出します。
- 変化が `decision=ACT` のまま記録されている場合、gate が発火していないため drift の疑いとして扱います。
- 変化が `decision=CLARIFY` を伴う場合、gate が正しく機能した事例として区別します。
- ステップ番号ごとの drift 検知率を集計します。論文の natural 設定では、baseline のエラー率が Step 1-2 の約 8% から Step 3 の約 28% まで上昇しています。ステップが進むほど監視を強化する根拠になります。

```mermaid
flowchart TD
  A[対象取り違えを検知]
  A --> B{step1のbound_idが正しいか}
  B -->|正しい| C[binding driftの疑い]
  B -->|誤り| D[error propagationの疑い]
  C --> E[step間でbound_idの遷移を監査]
  D --> F[step1の入力解決ロジックを監査]
```

| 要素名 | 説明 |
|---|---|
| 対象取り違えを検知 | 意図と異なるエンティティへの操作を検知した起点 |
| step1のbound_idが正しいか | trajectory ログの最初のバインディングを正解と照合する分岐 |
| binding driftの疑い | Step 1 は正しく、途中で対象が切り替わったケース |
| error propagationの疑い | Step 1 の解決自体が誤っていたケース |
| step間でbound_idの遷移を監査 | drift の発生ステップを特定する監査 |
| step1の入力解決ロジックを監査 | 曖昧参照の解決・候補絞り込みを見直す監査 |

### defense config 選択の運用判断

論文の controlled-injection 実験 (8 モデル × 200 workflows) が示す trade-off です。

| Defense | Wrong actions | Over-clarification | Workflow 成功率 |
|---|---|---|---|
| baseline | 907 | 743 | 29.2% |
| entity lock | 2,746 (3.0倍) | 1,040 | 0.0% |
| LLM self-reverify | 261 | 2,044 | 26.5% |
| LLM cross-reverify | 189 (0.21倍, 79%減) | 2,056 | 25.2% |
| oracle re-verify | 180 (0.20倍, 80%減) | 2,400 | 18.8% |

運用判断の目安 (論文知見からの翻訳・実装案):

- 参照系ステップの多いワークフローでは baseline または `lock_provenance` (ログ記録のみ) を選びます。over-clarification が最小のためです。
- 書込み系ステップを含むワークフローでは `lock_provenance_gate` を選びます。追加 LLM 呼び出しなしで発散を確認質問に変えられるためです。
- 破壊的操作を含むワークフローでは LLM cross-reverify を選びます。oracle との差が 1 パーセントポイント以内でありながら、ground truth リゾルバが不要なためです。
- entity lock 単体の採用は避けます。injection 実験では workflow 成功率が 0.0% まで落ち込んでいます。

```mermaid
flowchart TD
  A[ステップ実行前にリスクを判定]
  A --> B{破壊的操作か}
  B -->|参照系| C[baselineのまま実行]
  B -->|書込み系| D[lock_provenance_gateで実行]
  B -->|破壊的操作| E[LLM cross-reverifyを追加実行]
  E --> F{再導出結果がbound_idと一致}
  F -->|一致| G[ACTを実行]
  F -->|不一致| H[bound_idを修正してACTを実行]
```

| 要素名 | 説明 |
|---|---|
| ステップ実行前にリスクを判定 | ツールのリスク区分 (参照系 / 書込み系 / 破壊的) を判定する起点 |
| 破壊的操作か | リスク区分による防御構成の分岐 |
| baselineのまま実行 | 参照系は追加防御なしで実行するケース |
| lock_provenance_gateで実行 | 書込み系は追加 LLM 呼び出しなしのゲート付きで実行するケース |
| LLM cross-reverifyを追加実行 | 破壊的操作は安価な別モデルで再検証してから実行するケース |
| 再導出結果がbound_idと一致 | 再検証の照合分岐 |
| ACTを実行 | 一致時にそのまま実行する終端 |
| bound_idを修正してACTを実行 | 不一致時にバインディングを補正して実行する終端 |

## 予防のベストプラクティス

### 誤解 → 反証 → 推奨: entity lock の直感的対策

- **誤解**: 最初の正しいバインディングを固定 (entity lock) すれば、以降のステップで対象がすり替わる drift を防げるため、単純に安全性が上がると考えがちです。
- **反証 (数値)**:
  - controlled injection 実験全体で、entity lock は誤操作を 907 件から 2,746 件に増やしています (3.0 倍、95% CI [2.8, 3.3])。
  - モデル別では変動が大きく、Claude Opus 4.5 では 8.5 倍 (52 → 442 件) まで増幅しています。Nova Micro では 1.8 倍 (208 → 376 件) にとどまっています (出典: `results/summaries/inject_by_model.csv` の baseline / lock 列)。
  - ワークフローパターン別では dependent-chain (D3: account → owner のような派生スロットを持つパターン) が最大 16.6 倍を記録しています。account の誤バインディングが最終ステップで誤った宛先へのメール送信に伝播する事例です。
  - entity lock 単体を injection 条件で使うと、workflow 成功率は 0.0% まで低下しています。
- **推奨**: entity lock は単体で使わず、`lock_provenance_gate` または reverify と組み合わせて使います。lock は「対象を固定して drift を消す」効果を持つ一方、最初の誤りを訂正する力を持ちません。誤りの訂正は独立再検証だけが担います。

### 永続メモリと再検証は代替関係にない

- 論文は対話状態追跡 (Dialogue State Tracking) の前提を反転させています。DST では「一度埋めたスロットを保持する」ことが正しい振る舞いとされますが、エージェント的なツール利用では、各解決が現実世界への不可逆な操作を引き起こすため、最初のスロット値が誤っている場合はスロットの永続化がむしろ有害に働きます。

| 要素 | 目的 | 誤りへの効果 |
|---|---|---|
| entity lock (永続メモリ) | ステップ間での対象の一貫性を保つ | 誤りを訂正せず、そのまま持ち回る |
| 独立再検証 (reverify) | 元のリクエストから対象を再導出する | 誤りを検知し、訂正できる唯一の層 |

- 運用ベストプラクティス (論文知見からの翻訳): 永続メモリと再検証は択一の関係ではなく、階層として組み合わせます。lock で一貫性を確保しつつ、破壊的操作の直前だけ reverify で訂正機会を挟む構成が、コストと安全性のバランスとして妥当です。

### 再検証自体のコストと誤判定リスク

- レイテンシ・コスト面: 1 ステップあたり追加の LLM 呼び出しが 1 回発生します。論文では約 0.3 秒のレイテンシと軽微なトークンコストと記載されています。
- 誤判定リスク面: 再検証を導入すると、不要な確認質問 (over-clarification) が増加します。baseline の 743 件から、LLM cross-reverify で 2,056 件、oracle で 2,400 件まで増えています。この増加に伴い、ワークフロー成功率は baseline の 29.2% から、cross-reverify で 25.2%、oracle で 18.8% まで下がっています。
- 実務上の含意: 再検証を全ステップに一律適用すると、正しく解決できているケースまで確認質問に回してしまい、完了率を犠牲にします。破壊的操作の直前に限定して挿入する運用 (前節参照) が、安全性と完了率の両立点として妥当です。
- LLM cross-reverify は oracle 比で誤操作削減効果が 1 パーセントポイント以内に収まりながら、over-clarification は oracle より少なく (2,056 件 対 2,400 件)、workflow 成功率も高く (25.2% 対 18.8%) なっています。ground truth リゾルバを持たない実務環境では、oracle の代替として LLM cross-reverify を採用する根拠になります。

### mock / controlled testbed の適用条件

- テストベッドは合成データです。200 workflows は 3〜8 ステップ、4 業務ドメイン (calendar / CRM / docs / tickets) の合成エンティティストア上で構成されています。
- 派生スロットの複雑さは限定的です。ベンチマークはワークフローあたり最大 1 個の派生スロット (D3) しか扱っておらず、account → owner → owner's calendar → 競合イベントのような多段カスケードは未検証です。
- injection は意図的に人工的な設定です。有能なモデルは自然な状態では誤バインディングをほとんど起こさないため、播種型の injection によって伝播を大規模かつモデル能力に依存しない形で測定しています。したがって injection 由来の数値 (3.0 倍などの増幅率) は、制御された圧力下での失敗挙動の大きさを特徴づけるものであり、実運用での発生頻度そのものではありません。
- 統計的な留保もあります。Bootstrap 95% CI は報告されていますが、正式な仮説検定は行われていません。3.0 倍という集計値は、モデル別の差 (1.8〜8.5 倍) を覆い隠す可能性があります。
- 適用条件の運用推奨 (論文知見からの翻訳): このテストベッドは、防御構成間の相対比較 (どの config がどの config より優れているか) の根拠として使い、絶対的な発生率の予測には使いません。実運用への導入前には、自社ドメインの実データを使ったカナリアテストで再検証します。特に実運用のワークフローが 15〜50 ステップに及ぶ場合、噛み合わせが未検証な長さのため、追加の検証が必要です。

## 対処時の切り分けと注意点

### 対象取り違えが起きたときの切り分け: drift か propagation か

| 症状 | 原因 | 切り分け方法 | 対処 |
|---|---|---|---|
| 最終ステップで意図と異なるエンティティに操作が実行された | binding drift: Step 1 は正しく解決できていたが、途中で対象が切り替わった | trajectory ログで Step 1 の `bound_id` を確認する。正しければ drift、誤りであれば propagation | gate を有効化し、lock からの乖離を確認質問に切り替える |
| Step 1 から一貫して誤ったエンティティに操作されている | error propagation: Step 1 の解決自体が誤っている | trajectory ログで Step 1 の `bound_id` を gold 値と比較する | Step 1 の入力解決ロジック (曖昧な参照表現の解決、候補エンティティの絞り込み) を監査する。lock だけの追加は誤りを固定するため避ける |
| lock 導入後に誤操作件数が増えた | lock が誤った Step 1 バインディングをそのまま後続へ持ち回っている | lock 導入前後で誤操作件数を比較する。lock 導入後に増えていれば増幅が発生している | reverify (独立再検証) を追加する。lock 単体の運用から `lock_provenance_gate` または reverify 併用へ切り替える |
| 派生スロット (account → owner 等) を含むワークフローで誤りが大きく増幅した | dependent-chain パターン: 誤りが派生元から派生先へ伝わる | どのスロットが他スロットから派生しているかをワークフロー定義で確認する | 派生元スロットの解決結果を派生先で使う直前に reverify を挟む |

### repo 再現時の頻出問題

| 症状 | 原因 | 対処 |
|---|---|---|
| Bedrock 呼び出しが `AccessDeniedException` で失敗する | 対象リージョンでモデルアクセスが有効化されていない | Bedrock コンソールでモデルアクセスをリクエストし、有効化を確認してから再実行する |
| モデル ID を指定してもエラーになる | `us.amazon.nova-micro-v1:0` のような推論プロファイル形式の ID は、対応するリージョン (例: `us-east-1`) を明示的に指定しないと解決できない | `--region us-east-1` のように、推論プロファイルが対応するリージョンを明示指定する |
| 実行が断続的に `ThrottlingException` で止まる | Bedrock 側のレート制限。コードは `ClientError` と一般例外を tenacity で最大 5 回・指数バックオフ (2〜30 秒) 再試行するが、上限を超えると失敗する | 呼び出しモデル数・並列数を減らす。再試行上限を超えて失敗する場合は待機時間を延ばして再実行する |
| API キー・認証情報が見つからない | boto3 が想定する認証情報チェーン (環境変数・`~/.aws/credentials` 等) が未設定 | AWS CLI の認証設定を先に確認する (`aws sts get-caller-identity` 等) |
| API を使わずに動作を確認したい | フル再実行には boto3 経由の Bedrock 呼び出しが必須だが、オフラインで完結する検証経路も用意されている | `code/test_offline.py` (25 件のアサーション) と `code/aggregate_results.py` / `code/aggregate_injection.py` (保存済み CSV からの集計) はオフラインで完結する。Bedrock 認証が無い環境では、まずこの範囲で挙動を確認する |
| `test_offline.py` / `mock_run.py` が入力ファイル不在で失敗する | 両スクリプトが読む `workflows_multistep.jsonl` はリポジトリに未同梱 | `cp data/workflows_200.jsonl data/workflows_multistep.jsonl` を先に実行する (「実験の再現手順」の既知の注意点を参照) |

## まとめ

多段エージェントの対象取り違えには、正しい結合が途中で切り替わる binding drift と、最初の誤りを持ち回る error propagation の 2 種類があり、直感的な対策であるエンティティロックは前者を解消する一方で後者を 3.0 倍に増幅します。両現象を同時に抑えられるのは独立再検証だけであり、破壊的操作の直前に安価な別モデルで対象を再導出する LLM cross-reverify が、正解データなしで oracle 上限とほぼ同等の 79% 削減を達成します。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！

## 参考リンク

### 一次論文 (本フレームワーク)

- [Binding Drift in Multi-Step Tool-Augmented Agents (arXiv abstract)](https://arxiv.org/abs/2607.18316)
- [Binding Drift in Multi-Step Tool-Augmented Agents (arXiv HTML full text v1)](https://arxiv.org/html/2607.18316v1)

### 関連学術論文 (系譜)

- [Entity Binding Failures in Tool-Augmented Agents (Paper 1、先行論文)](https://arxiv.org/abs/2606.30531)
- [No Action Without a NOD: A Heterogeneous Multi-Agent Architecture for Reliable Service Agents](https://arxiv.org/pdf/2605.12240)
- [Always-On Agents: A Survey of Persistent Memory, State, and Governance in LLM Agents](https://arxiv.org/pdf/2606.30306)
- [AgentLTL: A Trace-Verification Framework for Measuring, Enforcing, and Training Procedural Compliance in Tool-Using LLM Agents](https://arxiv.org/pdf/2607.02599)

### 実装リポジトリ (一次実装)

- [shashank-indukuri/binding-drift (companion repo)](https://github.com/shashank-indukuri/binding-drift)
- [code/environment.py (defense config 実装)](https://github.com/shashank-indukuri/binding-drift/blob/main/code/environment.py)
- [code/run_drift_experiment.py (Bedrock ランナー / LLM 再検証)](https://github.com/shashank-indukuri/binding-drift/blob/main/code/run_drift_experiment.py)
- [code/aggregate_injection.py (注入実験集計)](https://github.com/shashank-indukuri/binding-drift/blob/main/code/aggregate_injection.py)
- [code/aggregate_results.py (自然モード集計)](https://github.com/shashank-indukuri/binding-drift/blob/main/code/aggregate_results.py)
- [code/test_offline.py (オフライン検証)](https://github.com/shashank-indukuri/binding-drift/blob/main/code/test_offline.py)
- [code/mock_run.py (モック実行)](https://github.com/shashank-indukuri/binding-drift/blob/main/code/mock_run.py)
- [code/reproduce_all.sh (まとめ実行スクリプト)](https://github.com/shashank-indukuri/binding-drift/blob/main/code/reproduce_all.sh)
- [code/plot_drift_curve.py (図生成)](https://github.com/shashank-indukuri/binding-drift/blob/main/code/plot_drift_curve.py)

### 一次データ (raw)

- [data/workflows_200.jsonl](https://raw.githubusercontent.com/shashank-indukuri/binding-drift/main/data/workflows_200.jsonl)
- [results/wf_inject_ALL.csv](https://raw.githubusercontent.com/shashank-indukuri/binding-drift/main/results/wf_inject_ALL.csv)
- [results/summaries/inject_by_config.csv](https://raw.githubusercontent.com/shashank-indukuri/binding-drift/main/results/summaries/inject_by_config.csv)
- [results/summaries/inject_by_model.csv](https://raw.githubusercontent.com/shashank-indukuri/binding-drift/main/results/summaries/inject_by_model.csv)
- [results/summaries/per_step_curve.csv](https://raw.githubusercontent.com/shashank-indukuri/binding-drift/main/results/summaries/per_step_curve.csv)
- [results/summaries/summary_by_config.csv](https://raw.githubusercontent.com/shashank-indukuri/binding-drift/main/results/summaries/summary_by_config.csv)
- [results/summaries/summary_by_pattern_config.csv](https://raw.githubusercontent.com/shashank-indukuri/binding-drift/main/results/summaries/summary_by_pattern_config.csv)

### 関連ツール

- [LangSmith (LLM アプリのトレース観測・評価。trajectory ログ監査の実装先候補)](https://docs.langchain.com/langsmith)

### 実務記事・FAQ

- [LLM Agent Evaluation Metrics in 2026 (Confident AI)](https://www.confident-ai.com/blog/llm-agent-evaluation-complete-guide)
