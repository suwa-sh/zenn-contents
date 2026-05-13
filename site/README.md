# zenn-contents site

`articles/` の zenn 用 Markdown を GitHub Pages 向けに静的サイト化するビルドです。zenn 本体の rate limit を回避するため、`published: false` の下書きも含めて全件公開しています。

公開 URL: <https://suwa-sh.github.io/zenn-contents/>

## ビルド構成

```
site/
├── astro.config.mjs            # base: /zenn-contents/, output: dist/
├── package.json
├── public/
│   ├── images       → ../../images         (symlink: 記事内 /images/* を配信)
│   └── books-assets → ../../books          (symlink: 書籍のカバー画像等を配信)
└── src/
    ├── lib/
    │   ├── render.mjs       # Markdown → HTML 共通変換 (zenn + mermaid + TOC + asset rewrite)
    │   ├── articles.mjs     # ../articles/*.md ローダー
    │   └── books.mjs        # ../books/<slug>/config.yaml + chapters ローダー
    ├── layouts/Layout.astro # 共通スタイル + ヘッダー検索 (Pagefind UI)
    └── pages/
        ├── index.astro             # 記事一覧（公開済み / 下書き）
        ├── articles/[slug].astro   # 個別記事ページ (右サイドバーに TOC)
        ├── books/
        │   ├── index.astro              # 本一覧
        │   ├── [slug]/index.astro       # 書籍 TOC（カバー + 概要 + 章一覧）
        │   └── [slug]/[chapter].astro   # 個別チャプター (TOC + 前後ナビ)
        └── tags/
            ├── index.astro     # 全タグ一覧（記事+本を統合カウント）
            └── [topic].astro   # タグ別一覧（記事と本が混在）
```

### 使っているライブラリ

| ライブラリ           | 役割                                                                    |
| -------------------- | ----------------------------------------------------------------------- |
| `astro`              | 静的サイトジェネレーター。`getStaticPaths` で記事ページを全件生成       |
| `gray-matter`        | Markdown フロントマター解析（`title` / `emoji` / `published` / `topics` 等） |
| `js-yaml`            | 書籍メタデータ `books/<slug>/config.yaml` の YAML 解析                 |
| `zenn-markdown-html` | zenn 互換の Markdown → HTML 変換（`:::message` `@[card]` 等の zenn 拡張対応） |
| `zenn-content-css`   | zenn と同じ記事スタイル CSS                                             |
| `beautiful-mermaid`  | Mermaid 図を **ビルド時に SVG 化**して iframe 不要にする                |
| `mermaid@11` (CDN)   | beautiful-mermaid 非対応図（`gitGraph` 等）のみ **クライアント側**で描画 |
| `pagefind`           | ビルド後に静的検索 index を生成。ヘッダーの検索欄で全文検索（クライアントのみ、サーバ不要） |

### Markdown → HTML 変換フロー

1. `articles/*.md` を `gray-matter` で frontmatter + 本文に分解
2. 本文を `zenn-markdown-html` で HTML 化（zenn と同じ拡張記法に対応）
3. 出力 HTML 内の zenn-embedded mermaid `<iframe>` を正規表現で抽出
4. デコードした Mermaid ソースを `beautiful-mermaid` の `renderMermaidSVG()` に渡し SVG 文字列を取得
5. SVG 化に成功 → `<div class="mermaid-render">…SVG…</div>` に置換（**ランタイム不要**）
6. SVG 化に失敗（例: `gitGraph`）→ `<pre class="mermaid">…ソース…</pre>` を残し、記事に `needsClientMermaid = true` フラグを立てる
7. フラグが立った記事ページにだけ mermaid.js v11 を CDN から動的 import してクライアント描画

これにより、ほぼ全ての図は **静的 SVG**として配信され、JS ランタイムなしで即座に表示されます。

### 目次 (TOC)

`articles.mjs` の `extractToc()` が生成済み HTML から `<h2>` / `<h3>` を抽出して配列化し、`[slug].astro` の右サイドバーに sticky で表示します（モバイルでは記事冒頭の折りたたみ）。見出しの `id` は `zenn-markdown-html` が自動付与するため、追加実装は不要です。

### サイト内検索 (Pagefind)

- `npm run build` の後段で `pagefind --site dist` を実行し、`dist/pagefind/` に静的検索インデックスを生成
- `<div data-pagefind-body>` で囲った記事本文だけがインデックス化対象（ヘッダーや TOC は除外）
- `Layout.astro` のヘッダーで Pagefind Default UI を遅延ロード
- `processResult` で `base` プレフィックス (`/zenn-contents/`) を結果 URL に補正
- 日本語は character-level マッチ（Pagefind は ja のステミング非対応だが実用には十分）

### タグ検索

- `pages/tags/index.astro`: 全タグをカウント付きでクラウド表示（記事+本を統合）
- `pages/tags/[topic].astro`: タグごとの記事・本一覧（frontmatter の `topics` から `getStaticPaths` で動的生成）
- 記事/本ページのトピックチップは各タグページへのリンクになっている

### 本 (books)

`books/<slug>/` 配下を以下の構造で読み込みます：

```
books/
└── n8n-guide_202505/
    ├── config.yaml          # title / summary / topics / published / published_at / price
    ├── cover.png            # 表紙画像
    ├── 1.introduction.md    # 章 (`N.<name>.md` で順序を表現、frontmatter は title のみ)
    ├── 2.core-features.md
    └── ...
```

- `loadBooks()` が `config.yaml` を `js-yaml` でパースし、章ファイル名から `(order, name)` を抽出してソート
- 章 URL slug は `1-introduction` のように `.` を `-` に置換
- 表紙画像は `public/books-assets` symlink 経由で `/zenn-contents/books-assets/<slug>/cover.png` として配信
- チャプター内の `/images/...` 参照は記事と同じく `${base}images/...` に書き換え
- チャプターページにも TOC サイドバーと前後ナビゲーションを設置

### ローカル動作確認

```bash
cd site
npm install
npm run dev      # http://localhost:4321/zenn-contents/
npm run build    # dist/ に静的サイト生成
npm run preview  # dist/ をプレビュー
```

### フロントマター仕様

`articles/*.md` の先頭で zenn と同じ frontmatter を期待しています：

```yaml
---
title: "技術調査 - 1Password CLI"
emoji: "🔐"
type: "tech"
topics: ["1Password", "CLI", "Security"]
published: true            # false なら「下書き」セクションに分類（バッジ表示）
published_at: 2026-02-26   # 未指定ならファイル名末尾の YYYYMMDD から推定
---
```

並び順は `published_at` または slug 末尾の日付の降順です。

## GitHub Actions / Pages

ワークフロー: [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)

### トリガー

- `main` への push で以下のパスが変わった場合
  - `articles/**`（記事追加・編集）
  - `site/**`（ビルド設定変更）
  - `.github/workflows/pages.yml`（ワークフロー本体）
- `workflow_dispatch`（手動実行）

### ジョブ構成

```
build  ─┐
        ├─ actions/checkout
        ├─ actions/setup-node (Node 20, npm cache: site/package-lock.json)
        ├─ npm ci          (working-directory: site)
        ├─ npm run build   (working-directory: site)
        │                  └─ astro build && pagefind --site dist
        ├─ actions/configure-pages
        └─ actions/upload-pages-artifact  (path: site/dist)

deploy ─┐ (needs: build)
        └─ actions/deploy-pages   (environment: github-pages)
```

`concurrency: pages` で同時実行を抑制（途中キャンセルはしない設定）。

### 初回セットアップ

リポジトリ側で 1 度だけ設定が必要です：

1. **Repository → Settings → Pages**
2. **Source** を **GitHub Actions** に変更

これで `main` push 後の Actions 実行から自動で <https://suwa-sh.github.io/zenn-contents/> に反映されます。

### 必要な権限

ワークフロー側で宣言済み（追加設定不要）：

```yaml
permissions:
  contents: read     # checkout 用
  pages: write       # Pages へのデプロイ用
  id-token: write    # OIDC トークン（deploy-pages が利用）
```
