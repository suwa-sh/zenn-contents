import zennMarkdownHtml from 'zenn-markdown-html';
import { renderMermaidSVG } from 'beautiful-mermaid';

export const markdownToHtml = zennMarkdownHtml.default ?? zennMarkdownHtml;

export const BASE = (process.env.BASE_URL || '/zenn-contents/').replace(/\/?$/, '/');

const MERMAID_IFRAME_RE =
  /<span class="embed-block zenn-embedded zenn-embedded-mermaid"><iframe\b[^>]*\sdata-content="([^"]+)"[^>]*><\/iframe><\/span>/g;

function sanitizeMermaid(src) {
  const lines = src.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim().length > 0);
  if (headerIdx >= 0) {
    lines[headerIdx] = lines[headerIdx].replace(/;\s*$/, '');
  }
  return lines.join('\n');
}

const HEADING_RE = /<h([23])\s[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;

export function extractToc(html) {
  const toc = [];
  for (const m of html.matchAll(HEADING_RE)) {
    const level = Number(m[1]);
    const id = m[2];
    const inner = m[3]
      .replace(/<a\b[^>]*class="header-anchor-link"[^>]*>.*?<\/a>/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (inner) toc.push({ level, id, text: inner });
  }
  return toc;
}

export function rewriteAssetPaths(html) {
  return html.replace(/((?:src|href)=")\/images\//g, `$1${BASE}images/`);
}

export function replaceMermaidEmbeds(html) {
  let needsClientMermaid = false;
  const out = html.replace(MERMAID_IFRAME_RE, (_match, encoded) => {
    const source = sanitizeMermaid(decodeURIComponent(encoded));
    try {
      const svg = renderMermaidSVG(source, { transparent: true });
      return `<div class="mermaid-render">${svg}</div>`;
    } catch {
      needsClientMermaid = true;
      const escaped = source
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<pre class="mermaid">${escaped}</pre>`;
    }
  });
  return { html: out, needsClientMermaid };
}

export function renderMarkdown(md) {
  const rendered = markdownToHtml(md, { embedOrigin: 'https://embed.zenn.studio' });
  const rawHtml = typeof rendered === 'string' ? rendered : rendered.html;
  const withAssets = rewriteAssetPaths(rawHtml);
  const { html, needsClientMermaid } = replaceMermaidEmbeds(withAssets);
  const toc = extractToc(html);
  return { html, needsClientMermaid, toc };
}

export function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function extractDateFromSlug(slug) {
  const m = slug.match(/(\d{8})$/);
  if (!m) return null;
  const d = m[1];
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
