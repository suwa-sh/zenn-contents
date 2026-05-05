#!/usr/bin/env python3
"""Zenn の articles / books の frontmatter から README.md を生成するスクリプト。

Usage:
    python scripts/generate-zenn-readme.py
    python scripts/generate-zenn-readme.py --zenn-dir .
"""

import argparse
import re
import sys
from pathlib import Path
from typing import Dict, List


def fix_published_at_quotes(filepath):
    # type: (Path) -> None
    """frontmatter 内の published_at の値がダブルクォートで括られていたら除去してファイルを上書きする。"""
    text = filepath.read_text(encoding="utf-8")
    fixed = re.sub(
        r'^(published_at:\s*)"(.+)"',
        r"\1\2",
        text,
        count=1,
        flags=re.MULTILINE,
    )
    if fixed != text:
        filepath.write_text(fixed, encoding="utf-8")
        print(f"Fixed published_at quotes: {filepath}", file=sys.stderr)


def parse_frontmatter(filepath):
    # type: (Path) -> Dict
    """Markdown ファイルの YAML frontmatter を簡易パースする。"""
    fix_published_at_quotes(filepath)
    text = filepath.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not m:
        return {}
    fm = m.group(1)

    title = ""
    tm = re.search(r'^title:\s*"(.*)"', fm, re.MULTILINE)
    if tm:
        title = tm.group(1)

    date = ""
    dm = re.search(r"^published_at:\s*(\S+)", fm, re.MULTILINE)
    if dm:
        date = dm.group(1)

    emoji = ""
    em = re.search(r"^emoji:\s*\"?(.*?)\"?\s*$", fm, re.MULTILINE)
    if em:
        emoji = em.group(1).strip('"')

    article_type = ""
    atm = re.search(r"^type:\s*\"?(\w+)\"?", fm, re.MULTILINE)
    if atm:
        article_type = atm.group(1)

    topics = []
    gm = re.search(r"^topics:\s*\[([^\]]*)\]", fm, re.MULTILINE)
    if gm:
        raw = gm.group(1)
        topics = [t.strip().strip('"').strip("'") for t in raw.split(",") if t.strip()]

    published = True
    pm = re.search(r"^published:\s*(\S+)", fm, re.MULTILINE)
    if pm:
        published = pm.group(1).lower() != "false"

    return {
        "title": title,
        "date": date,
        "emoji": emoji,
        "type": article_type,
        "topics": topics,
        "published": published,
        "filename": filepath.name,
    }


def parse_book_config(config_path):
    # type: (Path) -> Dict
    """books の config.yaml を簡易パースする。"""
    fix_published_at_quotes(config_path)
    text = config_path.read_text(encoding="utf-8")

    title = ""
    tm = re.search(r'^title:\s*"(.*)"', text, re.MULTILINE)
    if tm:
        title = tm.group(1)

    summary = ""
    sm = re.search(r'^summary:\s*"(.*)"', text, re.MULTILINE)
    if sm:
        summary = sm.group(1)

    date = ""
    dm = re.search(r"^published_at:\s*(\S+)", text, re.MULTILINE)
    if dm:
        date = dm.group(1)

    topics = []
    gm = re.search(r"^topics:\s*\[([^\]]*)\]", text, re.MULTILINE | re.DOTALL)
    if gm:
        raw = gm.group(1)
        topics = [t.strip().strip('"').strip("'") for t in raw.split(",") if t.strip()]

    return {
        "title": title,
        "summary": summary,
        "date": date,
        "topics": topics,
        "slug": config_path.parent.name,
    }


def collect_articles(articles_dir):
    # type: (Path) -> List[Dict]
    """articles ディレクトリから記事情報を収集する。"""
    entries = []
    for md_path in sorted(articles_dir.glob("*.md")):
        fm = parse_frontmatter(md_path)
        if fm and fm.get("title"):
            entries.append(fm)
    entries.sort(key=lambda e: e.get("date", ""), reverse=True)
    return entries


def collect_books(books_dir):
    # type: (Path) -> List[Dict]
    """books ディレクトリから本情報を収集する。"""
    entries = []
    for config_path in sorted(books_dir.glob("*/config.yaml")):
        info = parse_book_config(config_path)
        if info and info.get("title"):
            entries.append(info)
    entries.sort(key=lambda e: e.get("date", ""), reverse=True)
    return entries


def generate_readme(zenn_dir):
    # type: (Path) -> None
    """README.md を生成する。"""
    lines = ["# Zenn Contents", ""]

    # Books
    books_dir = zenn_dir / "books"
    if books_dir.exists():
        books = collect_books(books_dir)
        if books:
            lines.append("## Books")
            lines.append("")
            lines.append("| date | title | topics |")
            lines.append("|------|-------|--------|")
            for b in books:
                title = b.get("title", "").replace("|", "\\|")
                date = b.get("date", "")
                topics = ", ".join(b.get("topics", []))
                slug = b.get("slug", "")
                lines.append(f"| {date} | [{title}](books/{slug}/) | {topics} |")
            lines.append("")

    # Articles
    articles_dir = zenn_dir / "articles"
    published_articles = []
    draft_articles = []
    if articles_dir.exists():
        articles = collect_articles(articles_dir)
        for a in articles:
            if a.get("published", True):
                published_articles.append(a)
            else:
                draft_articles.append(a)

    def append_article_table(article_list):
        lines.append("| date | title | topics |")
        lines.append("|------|-------|--------|")
        for a in article_list:
            title = a.get("title", "").replace("|", "\\|")
            emoji = a.get("emoji", "")
            date = a.get("date", "")
            topics = ", ".join(a.get("topics", []))
            filename = a.get("filename", "")
            display = f"{emoji} {title}" if emoji else title
            lines.append(
                f"| {date} | [{display}](articles/{filename}) | {topics} |"
            )
        lines.append("")

    if published_articles:
        lines.append(f"## Articles ({len(published_articles)})")
        lines.append("")
        append_article_table(published_articles)

    if draft_articles:
        lines.append(f"## 下書き ({len(draft_articles)})")
        lines.append("")
        append_article_table(draft_articles)

    readme_path = zenn_dir / "README.md"
    readme_path.write_text("\n".join(lines), encoding="utf-8")
    total = len(published_articles) + len(draft_articles)
    print(
        f"Generated {readme_path} with {len(books if books_dir.exists() else [])} books,"
        f" {len(published_articles)} articles, {len(draft_articles)} drafts.",
        file=sys.stderr,
    )


def main():
    parser = argparse.ArgumentParser(
        description="Zenn の articles/books から README.md を生成"
    )
    parser.add_argument(
        "--zenn-dir",
        default=".",
        help="Zenn コンテンツのディレクトリ (default: .)",
    )
    args = parser.parse_args()

    zenn_dir = Path(args.zenn_dir)
    if not zenn_dir.exists():
        print(f"ERROR: {zenn_dir} does not exist.", file=sys.stderr)
        sys.exit(1)

    generate_readme(zenn_dir)


if __name__ == "__main__":
    main()
