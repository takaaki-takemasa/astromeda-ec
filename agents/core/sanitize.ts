/**
 * XSS Sanitizer — 免疫系の白血球（S-02）
 *
 * サーバーサイドHTML/テキストサニタイズ。
 * DOMPurifyはブラウザ依存のためOxygen Worker環境では使えない。
 * 代わりに厳格な正規表現ベースのサニタイズを実装。
 *
 * 設計原則（予防医学）:
 * - デフォルトは最も厳格（全HTMLタグ除去）
 * - 許可リスト方式（deny-by-default）
 * - 属性も許可リスト方式
 * - イベントハンドラ属性は絶対に許可しない
 */

// ── 許可するHTMLタグ（最小限）──
const ALLOWED_TAGS = new Set([
  'b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span',
  'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);

// ── 許可する属性（最小限）──
const ALLOWED_ATTRS = new Set([
  'href', 'title', 'class', 'id', 'target', 'rel',
]);

// ── 危険パターン（イベントハンドラ、javascript:、data:等）──
const DANGEROUS_PATTERNS = [
  /on\w+\s*=/gi,                    // onclick=, onerror=, onload= 等
  /javascript\s*:/gi,               // javascript: URL
  /vbscript\s*:/gi,                 // vbscript: URL
  /data\s*:\s*text\/html/gi,        // data:text/html
  /<script[\s>]/gi,                 // <script> タグ
  /<\/script>/gi,                   // </script> タグ
  /<iframe[\s>]/gi,                 // <iframe> タグ
  /<\/iframe>/gi,                   // </iframe> タグ
  /<object[\s>]/gi,                 // <object> タグ
  /<embed[\s>]/gi,                  // <embed> タグ
  /<form[\s>]/gi,                   // <form> タグ
  /<input[\s>]/gi,                  // <input> タグ
  /<textarea[\s>]/gi,               // <textarea> タグ
  /<style[\s>]/gi,                  // <style> タグ（CSS injection）
  /<link[\s>]/gi,                   // <link> タグ
  /<meta[\s>]/gi,                   // <meta> タグ
  /expression\s*\(/gi,             // CSS expression()
  /url\s*\(\s*['"]?\s*javascript/gi, // CSS url(javascript:)
  /@import/gi,                      // CSS @import
  /&#/g,                            // HTML entity encoding bypass
  /\\u00/gi,                        // Unicode encoding bypass
];

/**
 * テキストから全HTMLタグを除去（最も厳格）
 * 管理画面の表示用テキストに使用
 */
export function sanitizeText(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '')     // 全HTMLタグ除去
    .replace(/&lt;/g, '<')       // エンティティ復元
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .trim();
}

/**
 * 危険なパターンを除去（HTMLは保持、攻撃コードのみ除去）
 * Content APIの出力に使用
 */
export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== 'string') return '';

  let result = input;

  // Step 0: 危険タグを中身ごと除去（script, style, iframe, object, embed, form）
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  result = result.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  result = result.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
  result = result.replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '');
  result = result.replace(/<embed\b[^>]*>[\s\S]*?<\/embed>/gi, '');
  result = result.replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, '');

  // Step 1: 残りの危険パターンを除去
  for (const pattern of DANGEROUS_PATTERNS) {
    result = result.replace(pattern, '');
  }

  // Step 2: 許可されていないタグを除去
  result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tagName) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';

    // 開きタグの場合、許可されていない属性を除去
    if (!match.startsWith('</')) {
      return match.replace(/\s+([a-zA-Z-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/g, (attrMatch, attrName) => {
        if (!ALLOWED_ATTRS.has(attrName.toLowerCase())) return '';
        return attrMatch;
      });
    }

    return match;
  });

  return result.trim();
}

/**
 * URLが安全か検証（javascript:, data: を拒否）
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim().toLowerCase();
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('data:text/html')
  ) {
    return '';
  }
  return url.trim();
}

/**
 * JSON入力のサニタイズ（ネストされたオブジェクトの文字列値を全てサニタイズ）
 */
export function sanitizeJsonValues(obj: unknown): unknown {
  if (typeof obj === 'string') return sanitizeText(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeJsonValues);
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[sanitizeText(key)] = sanitizeJsonValues(value);
    }
    return result;
  }
  return obj;
}

/**
 * 入力文字列が危険なパターンを含むか検出
 * WAF（Web Application Firewall）的な用途
 */
export function detectXssAttempt(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  return DANGEROUS_PATTERNS.some(pattern => {
    pattern.lastIndex = 0; // Reset regex state
    return pattern.test(input);
  });
}
