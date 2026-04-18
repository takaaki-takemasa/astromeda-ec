/**
 * CMS URL Normalizer
 *
 * CMS (Metaobject) 由来のリンクが絶対URLで入っていても、自サイト/旧サイトを指している場合は
 * 内部パスに畳み込む。React Router `<Link to>` に渡すと外部遷移と判定され
 * 現行サイト（shop.mining-base.co.jp）へ離脱してしまう問題の根治。
 *
 * 対応範囲:
 * - `https://shop.mining-base.co.jp/collections/new-arrivals` → `/collections/new-arrivals`
 * - `https://astromeda-ec-XXXX.o2.myshopify.dev/collections/foo` → `/collections/foo`
 * - `/collections/foo` → `/collections/foo`（そのまま）
 * - `https://example.com/...`（外部）→ そのまま（新タブで開く判定は呼び出し側）
 * - `mailto:` / `tel:` / `javascript:`（危険 scheme）→ `#` に置換
 *
 * patch 0012 (2026-04-18) で追加。
 */

// 自サイトとみなすホスト（絶対URLで入っていても内部パスに畳む対象）
const INTERNAL_HOSTS = new Set([
  'shop.mining-base.co.jp',
  'www.shop.mining-base.co.jp',
  'mining-base.co.jp',
  'www.mining-base.co.jp',
  'production-mining-base.myshopify.com',
  'staging-mining-base.myshopify.com',
]);

// Oxygen Preview / Production の自動生成ホストパターン
const OXYGEN_HOST_PATTERNS = [
  /\.o2\.myshopify\.dev$/i,
  /\.myshopify\.dev$/i,
];

function isInternalHost(host: string): boolean {
  const h = host.toLowerCase();
  if (INTERNAL_HOSTS.has(h)) return true;
  return OXYGEN_HOST_PATTERNS.some((re) => re.test(h));
}

const DANGEROUS_SCHEMES = /^(javascript|data|vbscript|file):/i;

/**
 * CMS 由来の URL 文字列を安全なリンク先に正規化する。
 *
 * @param raw CMS Metaobject に保存された URL 文字列（絶対/相対/外部）
 * @returns Link `to` に渡せる文字列。内部なら `/path` 形式、外部ならそのまま、危険 scheme は `#`
 */
export function toInternalPath(raw: string | null | undefined): string {
  if (!raw) return '#';
  const trimmed = raw.trim();
  if (!trimmed) return '#';

  // 危険 scheme は無効化
  if (DANGEROUS_SCHEMES.test(trimmed)) return '#';

  // 相対パスはそのまま返す（ただし `//` から始まるプロトコル相対は絶対URL扱い）
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  // 絶対URLとしてパース試行
  let parsed: URL;
  try {
    // プロトコル相対 URL `//host/path` を http:// に補完
    const candidate = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
    parsed = new URL(candidate);
  } catch {
    // URL としてパースできない → 相対として扱う
    return trimmed.startsWith('#') ? trimmed : `/${trimmed.replace(/^\/+/, '')}`;
  }

  // 自サイトホストなら内部パスに畳む
  if (isInternalHost(parsed.host)) {
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
  }

  // 外部リンクはそのまま返す（呼び出し側で target="_blank" 等を判断）
  return parsed.href;
}

/**
 * 正規化結果が外部リンクかどうかを判定する。
 * 呼び出し側で `target="_blank" rel="noopener"` を付ける判断に使う。
 */
export function isExternalHref(normalized: string): boolean {
  if (!normalized || normalized === '#') return false;
  return /^https?:\/\//i.test(normalized);
}
