/**
 * Node.js `module` builtin shim for Cloudflare Workers / Oxygen
 *
 * hydrogen-middleware.ts（Vite DEVサーバー専用コード）が
 * production SSRバンドルに混入し、`import { createRequire } from "module"` が
 * Workers環境で "No such module" エラーを引き起こす。
 *
 * このshimはcreateRequireのno-op実装を提供し、
 * バンドル時のimport解決を成功させる。
 * 実行時にcreateRequireが呼ばれることはない（DEV専用コードパス）。
 */

export function createRequire(_filename: string | URL) {
  return function require(_id: string): never {
    throw new Error(
      '[Oxygen Worker] createRequire is not available in Cloudflare Workers. ' +
      'This code path should not be reached in production.',
    );
  };
}

export default { createRequire };
