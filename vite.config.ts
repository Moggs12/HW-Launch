import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { THEME } from './src/content/theme';

/* Fills the page title/fonts from the theme file and writes the PWA manifest from it too,
   so the name and colours only ever live in src/content/theme.ts. */
function themePlugin(): Plugin {
  const manifest = () => JSON.stringify({
    name: THEME.name,
    short_name: THEME.shortName,
    start_url: './',
    scope: './',
    display: 'fullscreen',
    orientation: 'any',
    background_color: THEME.colors.sky,
    theme_color: THEME.colors.sky,
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
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

export default defineConfig({
  base: './',            // works on GitHub Pages (/HW-Launch/) and inside a Capacitor app
  build: { target: 'es2022', chunkSizeWarningLimit: 700 },   // three.js is most of the bundle
  plugins: [themePlugin()],
  test: { include: ['src/**/*.test.ts'] },
});
