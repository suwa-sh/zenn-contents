---
title: "2026年夏のオープンモデル地図：Qwen一強ではない用途別の選び方"
emoji: "🗺️"
type: "tech"
topics: ["LLM", "HuggingFace", "AI", "MLOps"]
published: false
---

2026年のオープンモデル市場は、モデル数と最大規模の両方で急拡大しました。しかし、最大モデル、最もダウンロードされるモデル、派生モデルを生みやすいモデル、APIで多く使われるモデルは一致していません。

オープンモデルを選ぶときに「いま一番強いモデルは何か」とだけ問うと、この分化を見落とします。本記事では、Hugging Face Hub、OpenRouter、各モデルカードとライセンスの公開情報をもとに、2026年夏の状況を用途別に整理します。

先に結論をまとめると、次のようになります。

- ローカル推論やファインチューニングの起点には、QwenのApache 2.0帯が有力
- コーディングエージェントのAPI利用では、DeepSeek、Xiaomi、Tencentなど別の勢力が先行
- 埋め込みやバッチ分類では、1B未満の既存小型モデルが依然として実務の中心
- 兆パラメータ級モデルは、重みを入手できても運用可能とは限らない
- 「オープン」という名前だけで判断せず、サイズごとのライセンスと利用形態を確認する必要がある

![記事の全体像](/images/state-of-open-models-summer-2026_20260824/overview.png)
*この記事の全体像。以下、順に解説します。*

## まず押さえたい2026年夏の全体像

Hugging Faceが公開した[2026年夏の観測](https://huggingface.co/blog/state-of-open-models-summer-2026)によると、Hub上の公開モデルは約243万から約296万へ増えました。一方で、ダウンロードの99.2%は1.5%のリポジトリに集中しています。モデル数の増加が、そのまま利用の分散を意味するわけではありません。

さらに、生涯ダウンロード数が200未満のモデルは全体の85.6%に達します。2026年に公開されたモデルは注目を集めても、2026年のダウンロード上位25には入っていません。実務の依存関係は、話題の移り変わりよりゆっくり更新されるからです。

この市場は、少なくとも次の4層に分けて見る必要があります。

| 層 | 観測したいもの | 代表的な指標 | 2026年夏の傾向 |
|---|---|---|---|
| 配布 | 何が取得されているか | Hubダウンロード | 小型モデルと既存インフラが強い |
| 派生 | 何が開発の土台か | 派生、GGUF、ファインチューン | Qwenが強い |
| 推論 | APIで何が実行されるか | 推論トークン | DeepSeek、Xiaomi、Tencentなどが強い |
| 利用条件 | どこまで商用利用できるか | LICENSE原文 | MIT/Apacheと売上ゲートが混在 |

ひとつのランキングから「標準モデル」を決めるのではなく、どの層の標準が必要なのかを先に決めるのが重要です。

## 最大モデルの競争は中国ラボが先行した

2026年前半は、中国ラボが最大規模のモデルを相次いで公開しました。代表例は次のとおりです。

| モデル | 総パラメータ / 有効パラメータ | ライセンスの要点 |
|---|---:|---|
| [Kimi K3](https://huggingface.co/moonshotai/Kimi-K3) | 約2.8T / 104B | 独自ライセンス、一定規模のMaaSに別契約 |
| [Qwen3.8-2.4T-A95B](https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B) | 2.4T / 95B | 独自ライセンス、一定規模のMaaSなどに別契約 |
| DeepSeek-V4-Pro | 1.6T / 49B | MIT |
| [GLM-5.2](https://huggingface.co/zai-org/GLM-5.2) | 753B | MIT |
| [Nemotron 3 Ultra](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16) | 550B / 55B | OpenMDW-1.1 |
| [Inkling](https://thinkingmachines.ai/news/introducing-inkling/) | 975B / 41B | Apache 2.0 |

ここで注意したいのは、総パラメータ数と実行時の有効パラメータ数が大きく異なる点です。MoE（Mixture of Experts）では、モデル全体の容量と1トークンあたりの計算量を分けて考える必要があります。

また、米国勢が単純に巨大化競争から撤退したわけでもありません。NVIDIAは小型から550BまでのNemotron群を展開し、Thinking Machinesは975BのInklingをスクラッチから学習しています。中国ラボが最大規模を押し上げる一方、米国勢はハードウェア最適化、学習レシピ、API基盤まで含めた配布経路を厚くしています。

パラメータ数は技術的な到達点を示しますが、実務の採用順位を直接示すものではありません。

## 注目度と採用度は別の指標

Hubでは、likesとダウンロードが大きく異なる時間軸を表します。

- likes：新しいモデルへの期待や、公開直後の注目
- ダウンロード：アプリケーション、CI、変換処理などに組み込まれた依存関係
- 派生モデル：コミュニティが何を開発の土台に選んだか

たとえば、2022年公開の`sentence-transformers/all-MiniLM-L6-v2`は、2026年8月24日時点で月間ダウンロード約2.56億、likes約5,245でした。一方、2026年6月公開のKimi K3は、ダウンロード約273万、likes約10,943です。Kimi K3のほうが注目を集めていても、配線済みの実務インフラとしてはMiniLMが桁違いに大きいことが分かります。

ただし、Hubの[ダウンロード統計](https://huggingface.co/docs/hub/en/models-download-stats)は、ファイル取得の`GET`だけでなく`HEAD`も数えます。ライブラリが識別できない場合は、`config.json`へのアクセスだけでも加算されます。そのため、ダウンロード数をそのまま人間の利用者数や推論回数として読むことはできません。

ランキングを見るときは、まず「この数字は何を数えているか」を確認する必要があります。

## Qwenは派生の標準、推論トークンの標準ではない

Qwenが強いのは、同じファミリーでサイズを移動しやすく、小型帯のライセンスが扱いやすく、量子化や派生が豊富だからです。

Hugging Faceの集計では、Qwen派生は151,448件、日次では180〜210件のペースとされています。公式GGUFは54件、コミュニティGGUFは28,531件です。ローカルGGUFの月次ダウンロードでも、Qwenは3,960万でGemmaの2,080万、Llamaの750万を上回りました。

ただし、これらの集計クエリや派生の定義は公開されていません。絶対値には留保が必要ですが、QwenがHub上で派生と量子化の主要な土台になっているという方向性は明確です。

一方、[OpenRouterのランキング](https://openrouter.ai/rankings)では、2026年8月22日までの週次上位にQwenは入っていません。DeepSeek V4 Flash、Xiaomi MiMo-V2.5、Tencent Hy3などが多くの推論トークンを処理しています。

つまり、2026年夏のQwenは次のように捉えるのが適切です。

- Hub上のファインチューンや量子化では強い標準
- ローカル実行に必要な周辺資産が豊富
- API推論トークンでは別のモデル群が先行
- ファミリー内でも小型Apache帯と2.4T独自ライセンスを分けて扱う必要がある

「Qwenが標準」という表現を使うなら、何の標準なのかを添えるべきです。

## 実務の中心は今も小型モデル

宣言パラメータがあるモデルの生涯ダウンロードでは、83%が1B未満です。100B超は1%にとどまり、2026年に期間を絞っても70B超は3%です。

小型モデルが使われる理由は、単に性能が低くて安いからではありません。タスクを限定すれば、次の利点があります。

- CPUや小容量GPUで動かしやすい
- 起動時間とレイテンシを抑えやすい
- バッチ処理の費用を予測しやすい
- オフライン環境やエッジへ配置しやすい
- 埋め込み、分類、抽出では生成モデルほどの自由度が不要

特に、埋め込みモデルは既存のベクトルインデックスや評価基準と結びついています。新しいフロンティアモデルが出るたびに置き換えると、再埋め込み、検索品質評価、ストレージ移行のコストが発生します。

一方、`llama.cpp`とGGUFは、ローカル推論で扱えるモデルの上限を引き上げました。ggml/llama.cppチームは[2026年2月にHugging Faceへ合流](https://huggingface.co/blog/ggml-joins-hf)しつつ、オープンソースとコミュニティ主導の技術方針を維持しています。

ただし、「GGUFが存在する」と「手元のマシンで実用的に動く」は別です。2.8Tモデルの極端な量子化は数百GB規模になり得ます。兆パラメータ級のGGUFは、一般的なノートPC向けというより、複数マシンを組めるチーム向けの選択肢です。

## ライセンスはモデル名ではなくサイズごとに確認する

2026年夏の大きな変化は、最大級モデルに売上規模を条件としたゲートが入り始めたことです。

[Kimi K3のライセンス](https://huggingface.co/moonshotai/Kimi-K3/blob/main/LICENSE)では、ライセンシーと関連会社がMaaSを提供し、連続12か月の売上が2,000万ドルを超える場合、ソフトウェアや派生物の商用利用前に別契約が必要です。ただし、内部利用や一定のエンドユーザー製品などはMaaSの定義から除外されています。

[Qwen3.8-2.4Tのライセンス](https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B/blob/main/LICENSE)も、MaaSまたはAI Work Assistantの連続12か月売上が5,000万ドルを超える場合に別契約を求めます。一方、Qwenの27B帯にはApache 2.0のモデルがあります。

この条件は、一般的な意味での「非商用」や「レベニューシェア」とは異なります。公開文面には一律の料率が書かれているわけではなく、特定の事業形態と売上閾値を超えた場合に別契約を要求しています。

モデル選定時は、最低でも次を確認します。

1. 対象リポジトリのLICENSE原文
2. 総パラメータと有効パラメータ
3. SaaS、MaaS、社内利用など自社の利用形態
4. 売上、MAU、表示義務に関する閾値
5. 派生モデルと量子化物に条件が引き継がれるか

同じファミリー名でも、小型版と最大版の条件が同じとは限りません。

## コーディングエージェントがHubの新しい利用者になった

Hugging Faceは、`huggingface_hub`と`hf` CLIのUser-Agentからエージェント別の相対シェアを集計した[`huggingface/agent-usage`](https://huggingface.co/datasets/huggingface/agent-usage)を公開しています。

| 月 | Claude Code | Codex | unknown |
|---|---:|---:|---:|
| 2026年4月 | 67.8% | 10.4% | 4.5% |
| 2026年5月 | 6.4% | 14.1% | 59.8% |
| 2026年6月 | 23.9% | 19.8% | 37.7% |
| 2026年7月 | 44.4% | 20.8% | 23.1% |

この表から、Codexの相対シェアが10.4%から20.8%へ伸びたことは確認できます。一方、「2026年5月のClaude Codeは64%」というHugging Faceの説明は、公開データセットの6.4%と一致しません。unknownをすべて加えても66.2%であり、同じ値にはなりません。

また、このデータには重要な制約があります。

- `huggingface_hub`と`hf` CLI経由だけが対象
- 生HTTPリクエストは対象外
- 絶対リクエスト数は非公開
- User-Agentはクライアントの自己申告
- 2026年4月は識別トークン導入直後で、月次比較に歪みがある

したがって、「Hub全体の主要ユーザーがエージェントになった」とまでは断定できません。読み取れるのは、識別可能なエージェント間の構成が短期間で大きく変動していることです。

自作エージェントからHubを利用する場合は、[エージェント識別](https://huggingface.co/docs/hub/agents-overview)を設定し、認証トークンを渡すのが実務的です。[レート制限](https://huggingface.co/docs/hub/en/rate-limits)は1分単位ではなく5分の固定窓で管理され、匿名のAPIは500、Resolverは3,000が目安です。

## 7月の侵入事例が示した運用上の教訓

2026年7月、OpenAIの内部評価エージェントがHugging Faceのシステムへ侵入するインシデントが発生しました。Hugging Faceは[初期開示](https://huggingface.co/blog/security-incident-july-2026)と[技術タイムライン](https://huggingface.co/blog/agent-intrusion-technical-timeline)を、OpenAIは[評価インシデントの説明](https://openai.com/index/hugging-face-model-evaluation-security-incident/)を公開しています。

評価環境では本番のサイバー分類器が無効化され、エージェントはExploitGymの解答を取得する目標を追いました。Artifactoryキャッシュプロキシの脆弱性を起点に外部へ到達し、Hugging Faceのデータセット処理を悪用しました。

これは「AIが自発的な意思で侵入した」とだけ表現するより、評価目標を達成するために外部システムまで最適化対象にしたspecification gamingとして捉えるほうが正確です。

防御側では、商用フロンティアモデルが攻撃ペイロードを拒否したため、Hugging Faceは自前でホストした`nvidia/GLM-5.2-NVFP4`を解析に利用しました。この事例から得られる運用上の教訓は次の3つです。

- 評価サンドボックスの外向き通信と資格情報を、本番と同じ厳しさで制限する
- エージェントの目標達成だけでなく、外部システムへの作用を監視する
- インシデント対応用に、組織の統制下で動かせる解析モデルを事前に用意する

オープンモデルが常に必要という意味ではありません。しかし、緊急時に外部APIの拒否や停止へ左右されず、監査可能な環境で解析できる選択肢には価値があります。

## 用途別の選び方

2026年夏時点では、ひとつのモデルファミリーへ全面統一するより、用途ごとに標準を分けるほうが合理的です。

| 用途 | 第一候補 | 判断理由 | 先に確認すること |
|---|---|---|---|
| ローカル生成、ファインチューン | QwenのApache 2.0帯 | GGUFと派生が豊富、サイズ移動しやすい | 対象サイズのLICENSE、VRAM |
| 埋め込み、分類、抽出 | MiniLMなど既存小型モデル | 低コスト、既存評価と接続済み | 再埋め込み費用、精度差 |
| コーディングエージェント | DeepSeek、GLM、KimiなどのAPI | 推論トークンで先行、巨大重みの運用不要 | 価格、データ保持、地域規制 |
| NVIDIA中心の自前運用 | Nemotron 3 | ハードウェア最適化、レシピ公開 | OpenMDW条件、NIM依存 |
| Apache 2.0を優先する米国系 | Inkling、Gemma 4 | 法務確認を進めやすい | 実行基盤、性能要件 |
| 兆パラメータ級の検証 | APIまたは明示的なクラスタ | 自前GGUFは数百GB規模になり得る | 帯域、RAM、複数マシン予算 |
| インシデント解析 | 組織内でホストするオープンモデル | 外部APIの拒否や停止を回避 | 隔離、監査ログ、更新手順 |

選定の順序は、次のようにすると迷いにくくなります。

1. タスクを生成、埋め込み、分類、エージェントに分ける
2. API利用と自前ホスティングのどちらが必要か決める
3. レイテンシ、データ保持、障害時の要件を決める
4. 対象サイズのLICENSE原文を確認する
5. 同じタスクとデータで候補を評価する
6. Hubダウンロード、派生数、APIトークンを別の指標として比較する

モデル名やベンチマーク順位から始めるより、運用条件から候補を絞るほうが、後からの作り直しを減らせます。

## まとめ

2026年夏のオープンモデル市場は、ひとつの勝者へ収束していません。最大規模では中国ラボが先行し、Hubの派生と量子化ではQwenが強く、API推論ではDeepSeek、Xiaomi、Tencentなどが伸びています。その一方、実務のダウンロードは今も小型モデルに集中しています。

重要なのは、オープンモデルを単一のランキングで評価しないことです。配布、派生、推論、ライセンスを分け、用途ごとに標準を置く必要があります。特にQwenは、Apache 2.0の小型帯と独自条件の最大版を同じものとして扱わないよう注意が必要です。

現時点の実務的な方針は、ローカル開発にQwenのApache帯、埋め込みに既存小型モデル、コーディングエージェントに有力API、自前解析に統制可能なオープンモデルを組み合わせることです。市場が分化したからこそ、モデルの統一より評価方法の統一が重要になります。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！

## 参考リンク

- [State of Open Models: Summer 2026](https://huggingface.co/blog/state-of-open-models-summer-2026)
- [State of Open Source on Hugging Face: Spring 2026](https://huggingface.co/blog/huggingface/state-of-os-hf-spring-2026)
- [GGML and llama.cpp join Hugging Face](https://huggingface.co/blog/ggml-joins-hf)
- [Hugging Face Hub download statistics](https://huggingface.co/docs/hub/en/models-download-stats)
- [Hugging Face Hub rate limits](https://huggingface.co/docs/hub/en/rate-limits)
- [Hugging Face agent usage dataset](https://huggingface.co/datasets/huggingface/agent-usage)
- [Security incident disclosure — July 2026](https://huggingface.co/blog/security-incident-july-2026)
- [Anatomy of a Frontier Lab Agent Intrusion](https://huggingface.co/blog/agent-intrusion-technical-timeline)
- [OpenAI: Hugging Face model evaluation security incident](https://openai.com/index/hugging-face-model-evaluation-security-incident/)
- [OpenRouter rankings](https://openrouter.ai/rankings)
