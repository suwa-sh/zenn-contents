import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { loadArticles } from '../src/lib/articles.mjs';
import { loadBooks } from '../src/lib/books.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SITE_DIR, '..');
const OUT_DIR = path.resolve(SITE_DIR, 'public/og');
const FAVICON = path.resolve(SITE_DIR, 'public/favicon.png');
const SELF = fileURLToPath(import.meta.url);

const FONT_REGULAR_URL =
  'https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf';
const FONT_BOLD_URL =
  'https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Bold.otf';
const FONT_CACHE = path.resolve(__dirname, '.font-cache');

async function loadFont(url, name) {
  fs.mkdirSync(FONT_CACHE, { recursive: true });
  const cachePath = path.join(FONT_CACHE, name);
  if (fs.existsSync(cachePath)) return fs.readFileSync(cachePath);
  console.log(`[ogp] downloading font ${name}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font fetch failed: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(cachePath, buf);
  return buf;
}

function avatarDataUri() {
  const buf = fs.readFileSync(FAVICON);
  const mime = buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function el(type, props, ...children) {
  return { type, props: { ...props, children: children.length === 1 ? children[0] : children } };
}

function template({ title, avatar }) {
  return el(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: 1200,
        height: 630,
        background: 'linear-gradient(135deg,#3ea8ff,#1e3a8a)',
        padding: 40,
        fontFamily: 'Noto Sans JP',
      },
    },
    el(
      'div',
      {
        style: {
          display: 'flex',
          flex: 1,
          background: '#ffffff',
          borderRadius: 24,
          padding: '64px 72px',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        },
      },
      el(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: 60,
            fontWeight: 700,
            color: '#1a1a1a',
            lineHeight: 1.35,
            flex: 1,
          },
        },
        title,
      ),
      el(
        'div',
        {
          style: { display: 'flex', alignItems: 'center', gap: 20 },
        },
        el('img', {
          src: avatar,
          width: 80,
          height: 80,
          style: { borderRadius: 9999 },
        }),
        el(
          'div',
          { style: { display: 'flex', flexDirection: 'column' } },
          el(
            'div',
            { style: { fontSize: 28, fontWeight: 700, color: '#1a1a1a' } },
            'suwa-sh / 諏訪真一',
          ),
          el(
            'div',
            { style: { fontSize: 20, color: '#666' } },
            'zenn-contents',
          ),
        ),
      ),
    ),
  );
}

async function renderPng({ title, fonts, avatar }) {
  const node = template({ title, avatar });
  const svg = await satori(node, {
    width: 1200,
    height: 630,
    fonts,
  });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } })
    .render()
    .asPng();
  return png;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const [regular, bold] = await Promise.all([
    loadFont(FONT_REGULAR_URL, 'NotoSansCJKjp-Regular.otf'),
    loadFont(FONT_BOLD_URL, 'NotoSansCJKjp-Bold.otf'),
  ]);
  const fonts = [
    { name: 'Noto Sans JP', data: regular, weight: 400, style: 'normal' },
    { name: 'Noto Sans JP', data: bold, weight: 700, style: 'normal' },
  ];
  const avatar = avatarDataUri();

  const articles = loadArticles();
  const books = loadBooks();
  const selfMtime = fs.statSync(SELF).mtimeMs;

  const targets = [
    ...articles.map((a) => ({
      key: `articles__${a.slug}`,
      title: a.title,
      sources: [path.join(REPO_ROOT, 'articles', `${a.slug}.md`)],
    })),
    ...books.map((b) => {
      const bookDir = path.join(REPO_ROOT, 'books', b.slug);
      const sources = fs.existsSync(bookDir)
        ? fs.readdirSync(bookDir).map((f) => path.join(bookDir, f))
        : [];
      return { key: `books__${b.slug}`, title: b.title, sources };
    }),
  ];

  let generated = 0;
  let skipped = 0;
  for (const t of targets) {
    const outPath = path.join(OUT_DIR, `${t.key}.png`);
    if (fs.existsSync(outPath)) {
      const outMtime = fs.statSync(outPath).mtimeMs;
      const srcMtime = Math.max(
        selfMtime,
        ...t.sources.filter((p) => fs.existsSync(p)).map((p) => fs.statSync(p).mtimeMs),
      );
      if (outMtime >= srcMtime) {
        skipped++;
        continue;
      }
    }
    const png = await renderPng({ title: t.title, fonts, avatar });
    fs.writeFileSync(outPath, png);
    console.log(`[ogp] ${path.relative(SITE_DIR, outPath)}`);
    generated++;
  }
  console.log(`[ogp] generated ${generated}, skipped ${skipped} (up-to-date)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
