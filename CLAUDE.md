# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

Zenn の記事・本のコンテンツリポジトリ。同じ Markdown を 2 系統で公開する。

- Zenn 本体: `articles/` `books/` を zenn-cli が配信（`published: true` のみ）
- GitHub Pages: `site/` の Astro が同じ Markdown を静的サイト化（**下書きも含めて全件公開**）
  - <https://suwa-sh.github.io/zenn-contents/>

## コマンド

ルート（Zenn 側）:

```bash
make article       # npx zenn new:article
make book          # npx zenn new:book
make preview       # localhost:18000 でプレビュー起動（PID を .zenn-preview.pid に記録）
make preview-down  # プレビュー停止
make readme        # frontmatter から README.md を再生成
make push          # readme 生成 → add/commit "chore" → pull → push origin main
```

`site/` 配下（Pages 側）:

```bash
cd site
npm run dev     # Astro 開発サーバー
npm run build   # OGP 生成 → astro build → pagefind インデックス生成
```

テストは無い（`npm test` はエラーを返すだけ）。lint 設定も無い。

## ファイル規約

- 記事: `articles/<slug>_YYYYMMDD.md`
- 記事内画像: `images/<slug>_YYYYMMDD/` に置き、本文からは `/images/...` で参照
- 本: `books/<slug>_YYYYMM/` に `config.yaml` + `<n>.<name>.md` + `cover.png`
- frontmatter: `title` / `emoji` / `type` (`tech` or `idea`) / `topics` (CamelCase, 2〜5) / `published`

`README.md` は `scripts/generate-zenn-readme.py` の生成物。手で編集せず `make readme` を使う。
このスクリプトは副作用として `published_at` のダブルクォートも除去する。

## コンテンツ方針ファイル

- `zenn-content-policy.yaml`: 一般記事の topics / emoji / 評価閾値
- `tech-content-policy.yaml`: 技術調査記事のタイトル型・type 振分け・レビュー観点

いずれも記事生成スキルと analytics agent の契約点。編集時は `updated_at` と `updated_by` を必ず更新する。

## site のビルド構成

詳細は `site/README.md` を参照。要点のみ:

- Markdown → HTML は `zenn-markdown-html` で Zenn 互換に変換
- Mermaid は `beautiful-mermaid` で**ビルド時に SVG 化**、非対応図（`gitGraph` 等）だけ CDN の mermaid で client 描画
- 全文検索は Pagefind（ビルド後に静的 index を生成）
- `site/public/images` と `site/public/books-assets` はリポジトリルートへの symlink

## デプロイ

`.github/workflows/pages.yml` が `articles/**` `books/**` `site/**` の push で発火し、`site/` をビルドして Pages に deploy する。
