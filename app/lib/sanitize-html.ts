/**
 * HTML サニタイズユーティリティ（免疫系 — 異物排除）
 *
 * Shopify APIから返されるHTMLは基本的に安全だが、
 * 多層防御（defense in depth）の原則に従い、
 * script/iframe/event handler等の危険要素を除去する。
 *
 * 人体の免疫系と同じく、正常な細胞（安全なHTML要素）は通し、
 * 異物（悪意あるスクリプト）のみ排除する。
 */

// 許可するHTMLタグ（ホワイトリスト方式 = 自己と非自己の識別）
const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote',
  'pre', 'code', 'hr', 'sup', 'sub', 'small', 'mark',
]);

// 許可する属性（タグ別）
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  span: new Set(['class', 'style']),
  div: new Set(['class', 'style']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
  '*': new Set(['class', 'id']),  // 全タグ共通
};

/**
 * HTMLをサニタイズしてXSSを防止する
 * - script, iframe, object, embed, form タグを除去
 * - on* イベントハンドラ属性を除去
 * - javascript: URLを除去
 * - data: URLを除去（img以外）
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  return html
    // scriptタグとその内容を完全除去
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // iframe, object, embed, form タグを除去
    .replace(/<\/?(?:iframe|object|embed|form|input|textarea|button)\b[^>]*>/gi, '')
    // on* イベントハンドラ属性を除去（onclick, onerror, onload等）
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    // javascript: プロトコルを除去
    .replace(/javascript\s*:/gi, 'blocked:')
    // vbscript: プロトコルを除去
    .replace(/vbscript\s*:/gi, 'blocked:')
    // data: URL を href属性で除去（画像srcは許可）
    .replace(/(<a\b[^>]*\s+href\s*=\s*["'])data:/gi, '$1blocked:')
    // style内のexpression()を除去（IE向けXSS）
    .replace(/expression\s*\(/gi, 'blocked(')
    // base64エンコードされたスクリプトパターンを除去
    .replace(/<[^>]*\s+src\s*=\s*["']data:text\/html[^"']*["'][^>]*>/gi, '');
}

/**
 * Shopify商品説明用の軽量サニタイズ
 * Shopify管理画面で入力されたHTMLは比較的安全だが念のため処理
 */
export function sanitizeProductDescription(html: string): string {
  return sanitizeHtml(html);
}
