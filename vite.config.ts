import {defineConfig} from 'vite';
import {hydrogen} from '@shopify/hydrogen/vite';
import {oxygen} from '@shopify/mini-oxygen/vite';
import {reactRouter} from '@react-router/dev/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath, URL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {sourceBundlePlugin} from './vite-source-bundle';

// Dropbox/sandbox locks dist/ files — patch fs operations to ignore permission errors
// and ensure directories are recreated after failed removals
const IGNORE_CODES = new Set(['EPERM', 'EACCES', 'ENOTEMPTY', 'EBUSY']);
const _rmSync = fs.rmSync.bind(fs);
(fs as any).rmSync = function (p: string, opts?: object) {
  try { _rmSync(p, opts); } catch (e: any) {
    if (IGNORE_CODES.has(e.code)) return;
    throw e;
  }
};
const _rmdirSync = fs.rmdirSync.bind(fs);
(fs as any).rmdirSync = function (p: string, opts?: object) {
  try { _rmdirSync(p); } catch (e: any) {
    if (IGNORE_CODES.has(e.code)) return;
    throw e;
  }
};
function ensureDistDirs(): import('vite').Plugin {
  return {
    name: 'ensure-dist-dirs',
    enforce: 'pre' as const,
    buildStart() {
      const base = process.cwd();
      for (const d of ['dist/client', 'dist/server']) {
        fs.mkdirSync(path.join(base, d), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    // Plugin order matters (M1 audit 2026-04-09):
    // 1) ensureDistDirs + sourceBundle: pre-build housekeeping
    // 2) hydrogen → oxygen → reactRouter: canonical Shopify stack order
    //    (hydrogen must wire context before oxygen sets up worker;
    //     reactRouter consumes both)
    // 3) tsconfigPaths: alias resolution
    // 4) tailwindcss: CSS transform runs last so it sees final asset graph
    ensureDistDirs(),
    sourceBundlePlugin(),
    hydrogen(),
    oxygen(),
    reactRouter(),
    tsconfigPaths(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      // Oxygen/Workers fix: hydrogen-middleware.ts (DEV専用) がSSRバンドルに混入し
      // `import { createRequire } from "module"` が Workers で "No such module" エラーを起こす。
      // Node.js `module` builtin をno-op shimに差し替えてバンドルを通す。
      'module': fileURLToPath(new URL('./app/lib/worker-shims/module.ts', import.meta.url)),
    },
  },
  build: {
    // Allow a strict Content-Security-Policy
    // without inlining assets as base64:
    assetsInlineLimit: 0,
    // Dropbox locks dist/ on Windows — skip emptyOutDir to avoid EPERM
    emptyOutDir: false,
    // Redirect manifest to non-dotfile path (sandbox limitation: dotfile dirs fail in mounted paths)
    manifest: 'vite-manifest.json',
    ssrManifest: 'vite-ssr-manifest.json',
    // Externalize server-only DB packages from both client and SSR bundles
    rollupOptions: {
      external: [
        'postgres',
        'cloudflare:sockets',
      ],
    },
  },
  ssr: {
    external: ['postgres'],
    optimizeDeps: {
      /**
       * Include dependencies here if they throw CJS<>ESM errors.
       * For example, for the following error:
       *
       * > ReferenceError: module is not defined
       * >   at /Users/.../node_modules/some-package/index.js:1:1
       *
       * CJS/ESM can be fixed by adding the package name here:
       */
      include: [],
    },
  },
});
