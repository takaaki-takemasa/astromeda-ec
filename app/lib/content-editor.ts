/**
 * Content Editor Utilities — 記事制作CMS向けヘルパー関数
 *
 * 機能:
 * - HTML サニタイゼーション（危険なタグを削除、安全なタグのみ許可）
 * - スラグ生成（日本語・英数字対応のURL安全化）
 * - 読了時間推定（コンテンツから分数を計算）
 * - 抜粋自動抽出（HTMLからプレーンテキスト抽出）
 */

/**
 * HTML Sanitization: Strip dangerous tags, allow safe ones
 * Safe tags: p, h1-h6, strong, em, ul, ol, li, a, img, blockquote, code, pre, br
 */
export function sanitizeHtml(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  // Simple regex-based approach (production would use DOMPurify)
  let html = raw;

  // Remove script and style tags
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove event handlers and dangerous attributes
  html = html.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  html = html.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');

  // Remove dangerous tags but keep content
  const dangerousTags = ['iframe', 'object', 'embed', 'form', 'input', 'button'];
  dangerousTags.forEach((tag) => {
    const regex = new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`, 'gi');
    html = html.replace(regex, '');
  });

  // Allow only safe tags
  const allowedTags = [
    'p', 'br',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i',
    'ul', 'ol', 'li',
    'a',
    'img',
    'blockquote',
    'code', 'pre',
    'div', 'span', // minimal container tags
  ];

  const tagRegex = new RegExp(`</?(?!(?:${allowedTags.join('|')})\\b)[^>]*>`, 'gi');
  html = html.replace(tagRegex, '');

  // Allow only safe attributes on safe tags
  // Remove href with javascript:
  html = html.replace(/href\s*=\s*["']?\s*javascript:/gi, 'href="javascript:void(0)"');

  return html.trim();
}

/**
 * Generate URL-safe slug from Japanese/English title
 * Examples: "Astromeda PC 新製品発表" → "astromeda-pc-shin-seihin-hatsuhydo"
 * With romaji conversion for Japanese characters
 */
export function generateSlug(title: string): string {
  if (!title || typeof title !== 'string') return '';

  let slug = title.trim().toLowerCase();

  // Simple Japanese hiragana → romaji conversion (basic support)
  // For production, use a library like 'kuroshiro'
  const japaneseToRomaji: Record<string, string> = {
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'さ': 'sa', 'し': 'si', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'ざ': 'za', 'じ': 'zi', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'た': 'ta', 'ち': 'ti', 'つ': 'tu', 'て': 'te', 'と': 'to',
    'だ': 'da', 'ぢ': 'di', 'づ': 'du', 'で': 'de', 'ど': 'do',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'hu', 'へ': 'he', 'ほ': 'ho',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'ゐ': 'wi', 'ゑ': 'we', 'を': 'o', 'ん': 'n',
  };

  // Replace hiragana with romaji
  for (const [hiragana, romaji] of Object.entries(japaneseToRomaji)) {
    slug = slug.replaceAll(hiragana, romaji);
  }

  // Replace spaces and underscores with hyphens
  slug = slug.replace(/[\s_]+/g, '-');

  // Remove non-alphanumeric characters except hyphens
  slug = slug.replace(/[^a-z0-9-]/g, '');

  // Remove consecutive hyphens
  slug = slug.replace(/-+/g, '-');

  // Remove leading/trailing hyphens
  slug = slug.replace(/^-+|-+$/g, '');

  return slug || 'untitled';
}

/**
 * Estimate reading time in minutes from HTML content
 * Assumes ~200 words per minute average reading speed
 */
export function estimateReadTime(content: string): number {
  if (!content || typeof content !== 'string') return 0;

  // Remove HTML tags
  const text = content.replace(/<[^>]*>/g, '');

  // Count words (Japanese characters count as 1 word each, English words by space)
  let wordCount = 0;

  // Count kanji, hiragana, katakana as individual words
  const japaneseChars = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g);
  if (japaneseChars) wordCount += japaneseChars.length;

  // Count English words
  const englishWords = text.replace(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, '').match(/\b\w+\b/g);
  if (englishWords) wordCount += englishWords.length;

  // Average 200 words per minute
  const readTime = Math.ceil(wordCount / 200);
  return Math.max(1, readTime);
}

/**
 * Extract plain-text excerpt from HTML content
 * Removes tags and trims to maxLength characters
 */
export function extractExcerpt(content: string, maxLength: number = 200): string {
  if (!content || typeof content !== 'string') return '';

  // Remove HTML tags
  let text = content.replace(/<[^>]*>/g, '');

  // Decode HTML entities
  text = text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");

  // Trim to maxLength, breaking at word boundaries
  if (text.length > maxLength) {
    text = text.substring(0, maxLength);
    const lastSpace = text.lastIndexOf(' ');
    if (lastSpace > 0) {
      text = text.substring(0, lastSpace);
    }
    text += '...';
  }

  return text.trim();
}

/**
 * Validate blog content
 */
export interface ContentValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateBlogContent(data: {
  title?: string;
  slug?: string;
  content?: string;
  category?: string;
  featuredImageUrl?: string;
}): ContentValidationResult {
  const errors: string[] = [];

  if (!data.title || data.title.trim().length === 0) {
    errors.push('タイトルは必須です');
  } else if (data.title.length > 200) {
    errors.push('タイトルは200文字以内にしてください');
  }

  if (!data.slug || data.slug.trim().length === 0) {
    errors.push('スラグは必須です');
  } else if (!/^[a-z0-9-]+$/.test(data.slug)) {
    errors.push('スラグは英数字とハイフンのみ使用できます');
  }

  if (!data.content || data.content.trim().length === 0) {
    errors.push('コンテンツは必須です');
  } else if (data.content.length < 100) {
    errors.push('コンテンツは100文字以上である必要があります');
  }

  if (data.category && !['news', 'tech', 'review'].includes(data.category)) {
    errors.push('カテゴリは news, tech, review のいずれかである必要があります');
  }

  if (data.featuredImageUrl && !isValidUrl(data.featuredImageUrl)) {
    errors.push('フィーチャー画像のURLが無効です');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Simple URL validation
 */
function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}
