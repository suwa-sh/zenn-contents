
### 4.7. コミット履歴のインタラクティブな編集

#### git rebase -i

* **シナリオ**: プルリクエストを提出する前に、複数の「作業中」コミットを一つにまとめたり、コミットメッセージを修正したり、不要なコミットを削除して、履歴をきれいに整えたい場合。git rebase -iは、コミット履歴を自在に編集するための強力なツールです 1。  
* **コマンド**: `git rebase -i <base>` (例: `git rebase -i HEAD~3` は直近3つのコミットを対象とします)  
* **インタラクティブな操作**: コマンドを実行するとエディタが開き、各コミットに対して以下のアクションを指定できます 3:  
  * `pick (p)`: コミットをそのまま使用します。  
  * `reword (r)`: コミットを使用しますが、コミットメッセージを編集するために一時停止します。  
  * `edit (e)`: コミットを使用しますが、git commit --amend を使ってコミット内容を修正するために一時停止します。  
  * `squash (s)`: コミットを直前のコミットに統合し、新しいコミットメッセージを編集します。  
  * `fixup (f)`: squash と同様ですが、このコミットのメッセージは破棄され、直前のコミットのメッセージが使用されます。  
  * `drop (d)`: コミットを完全に削除します。  
* **図解**:  

  ```mermaid
  gitGraph  
      %% Before: A feature branch with multiple small commits  
      commit id: "A" tag: "main"  
      branch feature  
      checkout feature  
      commit id: "wip1"
      commit id: "wip2"
      commit id: "wip3"
  ```

  上記の3つのコミット (wip1, wip2, wip3) を git rebase -i HEAD~3 を使って squash すると、以下のように1つのクリーンなコミットにまとめることができます。  

  ```mermaid
  gitGraph  
      %% After: Squashing the commits into one  
      commit id: "A" tag: "main"  
      branch feature  
      checkout feature  
      commit id: "B"
  ```

### 4.8. 安全なブランチ切り替え

#### git switch

* **シナリオ**: ブランチの切り替え操作を、ファイル復元機能も持つ git checkout から分離し、より明確で安全に行いたい場合。git switch はブランチ操作に特化したコマンドです（Git v2.23以降） 4。  
* **コマンド**:  
  * git switch <branch-name>: 既存のブランチに切り替えます 5。  
  * git switch -c <new-branch-name>: 新しいブランチを作成し、すぐにそのブランチに切り替えます 5。  
  * git switch -: 直前にいたブランチに切り替えます 5。  
* **図解**:  

  ```mermaid
  graph TD  
      A["現在のブランチ: main"] -- "git switch -c feature/new-task" --> B;  
      B -- "git switch main" --> A["現在のブランチ: main"];
  ```

  この図は、git switch コマンドがいかにブランチの作成と切り替えを直感的に行えるかを示しています。

### 4.9. 変更の安全な復元

#### git restore

* **シナリオ**: ワーキングツリーの変更を破棄したり、ステージングした変更を取り消したりする操作を、より安全かつ明確に行いたい場合。git restore はファイルの状態を元に戻すことに特化したコマンドです（Git v2.23以降） 7。  
* **コマンド**:  
  * git restore <file>: ワーキングツリーのファイルの変更を破棄し、インデックス（ステージングエリア）の状態に戻します 7。  
  * git restore --staged <file>: ステージングされたファイルの変更を取り消し（アンステージ）、インデックスを HEAD の状態に戻します 7。  
  * git restore --source <commit> <file>: ファイルをワーキングツリーとインデックスの両方で、特定のコミットの状態に戻します 7。  
* **図解**:  

  ```mermaid
  graph TD  
      subgraph "ワーキングツリーの変更を破棄 (git restore <file>)"  
          direction LR  
          I1[Index] -- "内容をコピー" --> WT1  
      end  
      subgraph "ステージングの取り消し (git restore --staged <file>)"  
          direction LR  
          H2 -- "内容をコピー" --> I2[Index]  
      end
  ```

  この図は、git restore がどの領域からどの領域へデータを復元するのかを明確に示しています。

### 4.10. バグの原因を二分探索で特定

#### git bisect

* **シナリオ**: プロジェクトの履歴内でバグが混入したコミットを、手作業で一つずつ確認するのではなく、二分探索アルゴリズムを使って効率的に特定したい場合 9。  
* **コマンド**:  
  * git bisect start: 二分探索セッションを開始します 9。  
  * git bisect bad <commit>: バグが含まれるコミットを指定します（例: HEAD） 9。  
  * git bisect good <commit>: バグが含まれていなかったことが確実な過去のコミットを指定します 9。  
  * git bisect good / git bisect bad: Gitが自動でチェックアウトしたコミットをテストし、その結果を報告します。Gitはこれを元に範囲を半分に絞り込みます 9。  
  * git bisect reset: セッションを終了し、元のブランチとコミットに戻ります 9。  
* **図解**:  

  ```mermaid
  graph TD  
      A(セッション開始<br/>'git bisect start') --> B(悪いコミットをマーク<br/>'git bisect bad HEAD');  
      B --> C(良いコミットをマーク<br/>'git bisect good v1.2.0');  
      C --> D{Gitが中間コミットを<br/>自動でチェックアウト};  
      D --> E{コードをテスト};  
      E -- "バグあり" --> F("悪いとマーク<br/>'git bisect bad'");  
      E -- "バグなし" --> G("良いとマーク<br/>'git bisect good'");  
      F --> H{範囲が特定されたか？};  
      G --> H;  
      H -- No --> D;  
      H -- Yes --> I(Gitが原因のコミットを特定);  
      I --> J(セッション終了<br/>'git bisect reset');
  ```
