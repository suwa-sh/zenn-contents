import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { renderMarkdown, normalizeDate, BASE } from './render.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = path.resolve(__dirname, '../../../books');

const CHAPTER_RE = /^(\d+)\.(.+)\.md$/;

function loadChapter(bookSlug, file) {
  const m = file.match(CHAPTER_RE);
  if (!m) return null;
  const order = Number(m[1]);
  const name = m[2];
  const slug = `${order}-${name}`;
  const raw = fs.readFileSync(path.join(BOOKS_DIR, bookSlug, file), 'utf8');
  const { data, content } = matter(raw);
  const { html, needsClientMermaid, toc } = renderMarkdown(content);
  return {
    order,
    slug,
    title: data.title ?? name,
    html,
    needsClientMermaid,
    toc,
  };
}

export function loadBooks() {
  if (!fs.existsSync(BOOKS_DIR)) return [];
  return fs
    .readdirSync(BOOKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const bookSlug = d.name;
      const dir = path.join(BOOKS_DIR, bookSlug);
      const configPath = ['config.yaml', 'config.yml']
        .map((f) => path.join(dir, f))
        .find((p) => fs.existsSync(p));
      if (!configPath) return null;
      const config = yaml.load(fs.readFileSync(configPath, 'utf8')) || {};
      const chapters = fs
        .readdirSync(dir)
        .filter((f) => CHAPTER_RE.test(f))
        .map((f) => loadChapter(bookSlug, f))
        .filter(Boolean)
        .sort((a, b) => a.order - b.order);
      const coverFile = ['cover.png', 'cover.jpg', 'cover.jpeg', 'cover.webp']
        .find((f) => fs.existsSync(path.join(dir, f)));
      const cover = coverFile ? `${BASE}books-assets/${bookSlug}/${coverFile}` : null;
      const publishedAt = normalizeDate(config.published_at);
      return {
        slug: bookSlug,
        title: config.title ?? bookSlug,
        summary: config.summary ?? '',
        topics: config.topics ?? [],
        published: config.published !== false,
        publishedAt,
        price: config.price ?? 0,
        cover,
        chapters,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
}
