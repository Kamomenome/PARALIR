import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { gitCommit } from './tools/commit';

/**
 * The browser refuses every connection too, not only the app's own blocking (008 FR-812, 009 FR-917). Build only:
 * the dev server needs its websocket. wasm for the on-device AI; workers and the AI's loader are blob URLs.
 */
const CSP = {
  // The web version (009 FR-915): its own files from where it is served, nothing else.
  web: [
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval' blob:",
    "worker-src 'self' blob:",
    "connect-src 'self' blob: data:",
    "img-src 'self' blob: data:",
    "style-src 'self' 'unsafe-inline'",
    "base-uri 'none'",
    "form-action 'none'",
  ],
  // The download version (009 FR-916): everything is inline in one HTML file.
  single: [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'wasm-unsafe-eval' blob: data:",
    'worker-src blob: data:',
    'connect-src data: blob:',
    'img-src data: blob:',
    "style-src 'unsafe-inline'",
    "base-uri 'none'",
    "form-action 'none'",
  ],
};

function contentSecurityPolicy(kind: keyof typeof CSP): Plugin {
  return {
    name: 'paralir-csp',
    apply: 'build',
    transformIndexHtml: (html) => {
      const out = html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP[kind].join('; ')}" />`);
      // The single file reads nothing beside it: its icons go inside it too (014).
      if (kind !== 'single') return out;
      return out.replace(/href="\.\/(brand\/[^"]+\.png)"/g, (_m, f: string) => `href="data:image/png;base64,${readFileSync(`public/${f}`).toString('base64')}"`);
    },
  };
}

// `vite build`: the web version in dist/ (relative paths, so it works under any folder, e.g. GitHub Pages).
// `vite build --mode single`: the download version, one dist-single/index.html that opens by double-click (research R-03).
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [contentSecurityPolicy('single'), viteSingleFile()] : [contentSecurityPolicy('web')],
    // Written into saved recipes so a work says which build made it (008 FR-802).
    define: { __APP_COMMIT__: JSON.stringify(gitCommit()) },
    // Classic (iife) workers: module workers from blob URLs do not start on file:// pages.
    worker: { format: 'iife' },
    build: { target: 'es2022', outDir: single ? 'dist-single' : 'dist', emptyOutDir: true, assetsInlineLimit: single ? undefined : 0 },
  };
});
