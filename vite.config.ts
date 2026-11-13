import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { THEME } from './src/content/theme';

/* "0.2.0 · abc1234": shown small on the home screen so we can tell which version a phone is running */
function buildLabel() {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
  let sha = (process.env.GITHUB_SHA ?? '').slice(0, 7);
  if (!sha) { try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { sha = 'dev'; } }
  return `${version} · ${sha}`;
}

/* Fills the page title/fonts from the theme file and writes the PWA manifest from it too,
   so the name and colours only ever live in src/content/theme.ts. */
function themePlugin(): Plugin {
  const manifest = () => JSON.stringify({
    name: THEME.name,
    short_name: THEME.shortName,
    id: './',
    start_url: './',
    scope: './',
    display: 'fullscreen',          // iOS treats this as standalone; Android hides the bars
    display_override: ['fullscreen', 'standalone'],
    orientation: 'any',
    background_color: THEME.colors.sky,
    theme_color: THEME.colors.sky,
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: 'icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }, null, 2);
  return {
    name: 'theme',
    transformIndexHtml: {
      order: 'pre',
      handler: html => html
        .replaceAll('%THEME_NAME%', THEME.name)
        .replaceAll('%THEME_SHORT%', THEME.shortName)
        .replaceAll('%THEME_SKY%', THEME.colors.sky)
        .replaceAll('%THEME_FONTS%', THEME.fonts.googleFontsUrl),
    },
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json'); res.end(manifest());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest() });
    },
  };
}

/* Turns public/sw.js into the real service worker: VERSION becomes a hash of every built file and
   PRECACHE lists them, so each deploy is picked up by installed phones and the whole game works offline. */
function swPlugin(): Plugin {
  const skip = (p: string) => p === 'sw.js' || p.endsWith('.txt') || p.endsWith('.map');
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap(d => d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]);
  return {
    name: 'service-worker',
    apply: 'build',
    writeBundle(options) {
      const out = options.dir!;
      const files = walk(out).map(f => relative(out, f).replace(/\\/g, '/')).filter(p => !skip(p)).sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(out, f)));
      const template = readFileSync('public/sw.js', 'utf8');
      if (!template.includes('__SW_VERSION__') || !template.includes('/*__SW_PRECACHE__*/')) throw new Error('public/sw.js is missing its build placeholders');
      const sw = template
        .replace('__SW_VERSION__', hash.digest('hex').slice(0, 12))
        .replace('/*__SW_PRECACHE__*/', files.map(f => `, './${f}'`).join(''));
      writeFileSync(join(out, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  base: './',            // works on GitHub Pages (/HW-Launch/) and inside a Capacitor app
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 700,   // three.js alone is ~500 kB; it gets its own chunk below
    rollupOptions: {
      // three.js in its own file: it only changes when we upgrade it, so phones keep it across game updates
      output: { manualChunks: id => id.includes('node_modules/three/') ? 'three' : undefined },
    },
  },
  plugins: [themePlugin(), swPlugin()],
  define: { __BUILD__: JSON.stringify(buildLabel()) },
  test: { include: ['src/**/*.test.ts'] },
});
