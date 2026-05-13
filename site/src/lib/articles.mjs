import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import {
  renderMarkdown,
  normalizeDate,
  extractDateFromSlug,
} from './render.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTICLES_DIR = path.resolve(__dirname, '../../../articles');

export function loadArticles() {
  return fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const raw = fs.readFileSync(path.join(ARTICLES_DIR, f), 'utf8');
      const { data, content } = matter(raw);
      const slug = f.replace(/\.md$/, '');
      const { html, needsClientMermaid, toc } = renderMarkdown(content);
      const publishedAt = normalizeDate(data.published_at) || extractDateFromSlug(slug);
      const description = content
        .replace(/^---[\s\S]*?---/, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[#>*_`~|\-]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 140);
      return {
        slug,
        title: data.title ?? slug,
        emoji: data.emoji || '📝',
        type: data.type || 'tech',
        topics: data.topics || [],
        published: data.published !== false,
        publishedAt,
        description,
        html,
        needsClientMermaid,
        toc,
      };
    })
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
}
