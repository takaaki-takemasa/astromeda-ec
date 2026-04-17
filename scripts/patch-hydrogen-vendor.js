/**
 * ============================================================
 * Hydrogen vendor COMPAT_DATE Patch — ローカル workerd 互換調整
 *
 * node_modules/@shopify/hydrogen/dist/vite/chunk-*.js 内の
 * COMPAT_DATE を、インストール済み workerd のビルド日付 -1 日に
 * 揃える冪等スクリプト。npm install で消える手動パッチを
 * postinstall から常時再適用するために使う。
 * ============================================================
 */
import {readdirSync, readFileSync, writeFileSync, existsSync, statSync} from 'fs';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, '..');

const HYDROGEN_VITE_DIR = join(
  ROOT,
  'node_modules',
  '@shopify',
  'hydrogen',
  'dist',
  'vite',
);

const WORKERD_PKG = join(ROOT, 'node_modules', 'workerd', 'package.json');

const COMPAT_DATE_RE = /var\s+COMPAT_DATE\s*=\s*"(\d{4}-\d{2}-\d{2})"/;

function getWorkerdBuildDate() {
  if (!existsSync(WORKERD_PKG)) return null;
  try {
    const {version} = JSON.parse(readFileSync(WORKERD_PKG, 'utf8'));
    const m = /^\d+\.(\d{4})(\d{2})(\d{2})\./.exec(version || '');
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
  } catch {
    return null;
  }
}

function isAfter(a, b) {
  return a.localeCompare(b) > 0;
}

function main() {
  if (!existsSync(HYDROGEN_VITE_DIR)) {
    console.log('[hydrogen-patch] @shopify/hydrogen/dist/vite not found — skipping');
    return;
  }

  const workerdDate = getWorkerdBuildDate();
  if (!workerdDate) {
    console.log('[hydrogen-patch] workerd version を解釈できませんでした — skipping');
    return;
  }

  const targetDate = (() => {
    const d = new Date(workerdDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  let patched = 0;
  let skipped = 0;

  for (const entry of readdirSync(HYDROGEN_VITE_DIR)) {
    if (!entry.startsWith('chunk-') || !entry.endsWith('.js')) continue;
    const filePath = join(HYDROGEN_VITE_DIR, entry);
    if (!statSync(filePath).isFile()) continue;

    const code = readFileSync(filePath, 'utf8');
    const m = COMPAT_DATE_RE.exec(code);
    if (!m) continue;

    const current = m[1];
    if (!isAfter(current, targetDate)) {
      skipped++;
      continue;
    }

    const patchedCode = code.replace(
      COMPAT_DATE_RE,
      `var COMPAT_DATE = "${targetDate}"`,
    );
    writeFileSync(filePath, patchedCode);
    console.log(
      `[hydrogen-patch] ${entry}: COMPAT_DATE ${current} -> ${targetDate}`,
    );
    patched++;
  }

  if (patched === 0 && skipped === 0) {
    console.log('[hydrogen-patch] COMPAT_DATE を含むチャンクが見つかりませんでした');
  } else {
    console.log(
      `[hydrogen-patch] done. patched=${patched}, skipped=${skipped}, targetDate=${targetDate}, workerdDate=${workerdDate}`,
    );
  }
}

main();