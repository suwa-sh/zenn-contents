---
title: "続・マルチステージCIとGitOps：その戦略をKubernetes以外の環境へ適用するための実践ガイド"
emoji: "🏗️"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["CICD", "GitOps", "Microservices", "ブランチ戦略", "DevSecOps"]
published: true
published_at: 2025-09-21
---


## ■はじめに：2つの記事の架け橋として

先日公開した2つの記事では、マイクロサービス開発におけるCI/CD戦略と、Kubernetesを使わないGitOpsライクな運用について解説しました。

  * **[マルチステージCIとGitOpsで実現するマイクロサービスのCI/CD戦略](https://zenn.dev/suwash/articles/microservices_cicd_20250912)**
  * **[Kubernetesを使わないGitOpsライクな運用](https://zenn.dev/suwash/articles/gitops_without_kubernetes_20250920)**

最初の記事では、Argo CDやFluxといったKubernetesネイティブなGitOpsツールを前提とした、CI/CDの責務分離モデルを提案しました。しかし、オンプレミスのVMや、AWS ECS/Lambdaといった非Kubernetes環境で、モダンなデプロイ戦略を模索している開発・運用チームも数多く存在します。

そこでこの記事では、元記事の戦略を**Kubernetes以外の環境へ適用する際の「差分」と、その差分を乗り越えるための具体的な実践方法**に焦点を当てて解説します。この記事は、上記2つの記事の内容を結びつけるための、実践的なガイドです。

## ■アーキテクチャ

これから解説する4つの差分を乗り越え、非Kubernetes環境で一貫したCI/CDパイプラインを実現するためのアーキテクチャ全体像を以下の図に示します。

![](/images/articles/microservices_cicd_without_k8s_20250921/overview.png)
*図1：非Kubernetes環境におけるマルチステージCI x Push型GitOpsのアーキテクチャ*

このアーキテクチャの核心は、元記事と同様にCIとCDの責務をリポジトリレベルで完全に分離することにあります。

  * **アプリケーションリポジトリ (CI)**: 開発者がコードをプッシュする場所です。ここでのCIパイプラインは、高品質な「部品」（コンテナイメージやJARファイルなど）をビルドし、設定リポジトリへの変更要求（PR）を自動作成するまでが責務です。
  * **設定リポジトリ (CD)**: 各環境（`dev`, `stg`, `prod`）のあるべき状態を宣言的に管理します。ここでのCDパイプラインは、承認されたPRをトリガーに、**Push型**でターゲット環境へ変更を適用（デプロイ）します。

この図の流れを念頭に置くことで、以降に説明する各原則や差分への理解がより深まります。

## ■普遍的な原則：環境を問わず「変わらない」こと

まず重要なのは、元記事で提唱した戦略の中核部分は、実行環境がKubernetesかどうかに関わらず有効であるという点です。

  * **CI/CDの責務分離**: アプリケーションリポジトリが「部品」を作り、設定リポジトリが「システム」を組み立てるという考え方。
  * **マルチステージCI**: Developer CI, Team CI, Component CIを通じて、フィードバックを早期化し、高品質なアーティファクトを生成するプロセス。
  * **PRベースのプロモーション**: ある環境での成功が、次の環境へのデプロイPRを自動作成する、安全で追跡可能なプロモーションフロー。
  * **Git Revertによるロールバック**: 問題発生時に、設定リポジトリでコミットをrevertすることで、安全に以前の状態へ復元する原則。

これらの原則は、これから解説する差分を乗り越えるための土台となります。

## ■4つの重要な差分：非Kubernetes環境で「変わる」こと

元記事の戦略を非Kubernetes環境へ適用する際には、主に4つの重要な違いを理解し、対処する必要があります。

### ●差分1：状態管理モデルが「Pull型」から「Push型」へ

元記事で前提としたArgo CD/Fluxは、環境側からGitリポジトリを監視し、あるべき状態を **プル（Pull）** して自己の状態を同期させる「Pull型」です。

一方、非Kubernetes環境では、CI/CDパイプライン（例: GitHub Actions）がデプロイ対象の環境へ直接変更を **プッシュ（Push）** する「Push型」が、実装の容易さから現実的な選択肢となります。このモデルの違いが、後述するすべての差分の根源となります。

### ●差分2：「継続的リコンシリエーション」の不在と「ドリフト監査」の必要性

Pull型モデル最大の利点は、手動変更などで発生した「構成ドリフト」を自動で検知・修復する**継続的リコンシリエーション**機能です。Push型にはこの仕組みがありません。

**【対策】 定期的な「ドリフト監査パイプライン」の実装**
このギャップを埋めるため、デプロイパイプラインとは別に、Git上の「あるべき状態」と「実際の環境」を定期的に比較する**ドリフト監査パイプライン**を構築することが不可欠です。例えば、Ansibleの`--check`モードやTerraformの`plan`を定期実行したり、AWS CLIで設定値を取得してGit上の定義と比較したりすることで、ドリフトを検知し、GitOpsのワークフローに則った修正を促します。

**サンプルコード：Ansibleによる定期的なドリフト監査 (GitHub Actions)**

```yaml
# .github/workflows/audit.yml
# 注意: このコードは概念を示すサンプルです。実際にはインベントリファイルやPlaybook、
#       SSHキーなどのシークレットを適切に設定する必要があります。
name: Daily Infrastructure Audit

on:
  schedule:
    - cron: '0 2 * * *' # 毎日 AM2時に実行 (JST AM11時)

jobs:
  ansible-check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout config repository
        uses: actions/checkout@v4

      - name: Setup SSH Agent for Ansible
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.PROD_SSH_PRIVATE_KEY }}

      - name: Run Ansible in Check Mode
        run: |
          ansible-playbook \
            -i inventory/production.ini \
            --check \ # Check modeを有効化。実際の変更は加えない
            playbooks/all.yml
          # 実行結果に応じて、差分があればSlack通知やIssue起票を行う
```

### ●差分3：デプロイ後テストの実行主体と方法

元記事では、Argo CDのSync Hooksなどを使い、デプロイ完了をトリガーとしてテストJobを実行できました。Push型では、この責務をCDパイプライン自身が担う必要があります。

**【対策】 CDパイプライン内でのステップ実行**
GitHub ActionsなどのCDパイプライン内で、デプロイ用コマンドを実行するステップの**直後**に、Smoke TestやAPIテストを実行するステップを明示的に追加します。テストが失敗した場合はパイプライン全体を失敗させ、後続のプロモーションPR作成を中止するロジックが必須です。

**サンプルコード：デプロイとテストを連携させるCDパイプライン (GitHub Actions)**

```yaml
# .github/workflows/cd.yml (抜粋)
jobs:
  deploy-and-test:
    if: github.ref == 'refs/heads/stg'
    runs-on: ubuntu-latest
    steps:
      # (中略: Checkoutや認証設定)

      - name: Deploy to Staging
        id: deploy
        run: |
          echo "Deploying to Staging environment..."
          # serverless deploy --stage stg などを実行
          # 成功したデプロイ先のURLなどを出力
          echo "endpoint=https://stg.api.example.com" >> $GITHUB_OUTPUT

      - name: Run Smoke Test
        id: test
        run: |
          echo "Running smoke tests on ${{ steps.deploy.outputs.endpoint }}"
          # curlやテストスクリプトでエンドポイントを叩く
          # テストが失敗した場合は exit 1 でジョブを失敗させる
          exit 0

      - name: Create PR to Production
        if: success() # deployとtestの両ステップが成功した場合のみ実行
        run: |
          gh pr create \
            --base prod \
            --head stg \
            --title "🚀 Promote changes from stg to prod" \
            --body "All tests passed in the staging environment."
```

### ●差分4：デプロイ実装の多様化とクレデンシャル管理

Kubernetes環境ではマニフェストという共通言語がありましたが、非K8s環境ではデプロイツールが多様です（Ansible, Terraform, AWS CodeDeploy, Serverless Framework, 各社CLI、あるいは単純なシェルスクリプトなど）。

**【対策】 ツール連携と安全な認証**

  * **ツール連携**: CDパイプラインは、プロモーション先のブランチ名（`dev`, `stg`など）に応じて、AnsibleのインベントリファイルやServerless Frameworkのステージ名を動的に切り替えるロジックを持つ必要があります。
  * **クレデンシャル管理**: Push型ではCI/CD基盤が本番環境のクレデンシャルを持つ必要があり、セキュリティリスクとなります。この対策として、クラウドプロバイダとの**OIDC連携**を活用し、永続的なキーではなく、実行ごとに発行される**短期的なアクセストークン**で認証することが強く推奨されます。OIDCが利用できない環境では、AWS Secrets ManagerやHashiCorp Vaultのような外部のシークレット管理ツールと連携し、実行時に動的に認証情報を取得する方法も有効です。

**サンプルコード：OIDC連携とブランチに応じた動的なデプロイ (GitHub Actions)**

```yaml
# .github/workflows/cd-aws.yml
name: Deploy to AWS Lambda

on:
  push:
    branches:
      - dev
      - prod

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # OIDC認証のために必要
      contents: read
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Get branch name
        id: get_branch
        run: echo "branch=${GITHUB_REF#refs/heads/}" >> $GITHUB_OUTPUT

      - name: Configure AWS credentials using OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-deploy-role
          aws-region: ap-northeast-1

      - name: Deploy with Serverless Framework
        uses: serverless/github-action@v3.3
        with:
          # ブランチ名(dev/prod)を Serverless Framework の stage として動的に渡す
          args: deploy --stage ${{ steps.get_branch.outputs.branch }}
```

## ■まとめ

元記事で提案したマルチステージCIとGitOpsの戦略は、特定のプラットフォームに縛られない強力な設計思想です。

Kubernetes以外の環境へ適用する際は、本記事で解説した**4つの差分**を正しく理解し、

1.  **ドリフト監査パイプライン**で構成ドリフトを検知する仕組みを補い、
2.  **CDパイプライン内**でデプロイ後のテストを確実に実行し、
3.  **OIDC連携**などで安全な認証を実現する

といった実装上の工夫を加えることで、その恩恵を最大限に享受することができます。これにより、皆さんのチームは、実行環境の制約を超えて、迅速で信頼性の高いソフトウェアデリバリーを実現できるはずです。

この記事が少しでも参考になった、あるいは改善点などがあれば、ぜひリアクションやコメント、SNSでのシェアをいただけると励みになります！

## ■関連リンク

  * **[マルチステージCIとGitOpsで実現するマイクロサービスのCI/CD戦略 - zenn](https://zenn.dev/suwash/articles/microservices_cicd_20250912)**
  * **[Kubernetesを使わないGitOpsライクな運用 - zenn](https://zenn.dev/suwash/articles/gitops_without_kubernetes_20250920)**
