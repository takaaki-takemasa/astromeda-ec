/**
 * ============================================================
 * Shopify CLI Glob Patch — 免疫記憶の固定化
 *
 * 問題: プロジェクトパス "PC (2)" の括弧がShopify CLIの
 *       glob処理でエスケープされず、Worker file not foundエラー
 *
 * 解決: getUploadFiles内のglobパターンで特殊文字をエスケープ
 *
 * npm install 時に自動実行（postinstall hook）
 * ============================================================
 */
import {readFileSync, writeFileSync, existsSync} from 'fs';
import {join} from 'path';

const CLI_INDEX = join(
  import.meta.dirname || '.',
  '..',
  'node_modules',
  '@shopify',
  'cli',
  'dist',
  'index.js'
);

// パッチ対象のパターン
// 修正前: globパターンが括弧をエスケープしない
const UNPATCHED_WORKER = /(_wGlob\s*=\s*workerPath\.replace\(\/\\\\\/g,\s*"\/"\))((?!\.replace\(\/\[).)/;
const UNPATCHED_ASSET = /(_aGlob\s*=\s*assetPath\.replace\(\/\\\\\/g,\s*"\/"\))((?!\.replace\(\/\[).)/;

// 修正後: 特殊文字をglobエスケープ
const ESCAPE_SUFFIX = '.replace(/[()\\[\\]{}!*+?@|,]/g, "\\\\$&")';

// パッチ済みかの検出パターン
const ALREADY_PATCHED = /replace\(\/\[\(\)\[/;

function main() {
  if (!existsSync(CLI_INDEX)) {
    console.log('[patch] @shopify/cli not found — skipping');
    return;
  }

  let code = readFileSync(CLI_INDEX, 'utf8');

  // 既にパッチ済みか確認
  if (ALREADY_PATCHED.test(code)) {
    console.log('[patch] ✅ Shopify CLI glob patch already applied');
    return;
  }

  let patched = false;

  // Worker path のパッチ
  if (UNPATCHED_WORKER.test(code)) {
    code = code.replace(UNPATCHED_WORKER, `$1${ESCAPE_SUFFIX}$2`);
    patched = true;
    console.log('[patch] Worker glob pattern patched');
  }

  // Asset path のパッチ
  if (UNPATCHED_ASSET.test(code)) {
    code = code.replace(UNPATCHED_ASSET, `$1${ESCAPE_SUFFIX}$2`);
    patched = true;
    console.log('[patch] Asset glob pattern patched');
  }

  if (patched) {
    writeFileSync(CLI_INDEX, code, 'utf8');
    console.log('[patch] ✅ Shopify CLI patched successfully for "PC (2)" path');
  } else {
    // パターンが変わっている可能性 — 手動確認を推奨
    console.log('[patch] ⚠️ Patch patterns not found — CLI may have been updated');
    console.log('[patch]    Check node_modules/@shopify/cli/dist/index.js manually');
  }
}

main();
