import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://suwa-sh.github.io',
  base: '/zenn-contents/',
  outDir: './dist',
  trailingSlash: 'always',
});
