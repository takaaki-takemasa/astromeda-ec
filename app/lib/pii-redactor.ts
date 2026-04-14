/**
 * PII Redactor — 免疫系の病原体マスキング
 *
 * エラーメッセージやログから個人情報を自動マスク。
 * 医学メタファー: 白血球がバクテリアを認識し除去するように、
 * 個人識別情報（PII）を検出・マスキングする。
 */

const PII_PATTERNS: Array<[RegExp, string]> = [
  // API keys/tokens (shpat_*, sk_live_*, pk_live_, Bearer, etc.) — MUST come FIRST to avoid overlaps
  [/\b(shpat_|sk_live_|sk_test_|pk_live_|pk_test_)[a-zA-Z0-9_-]{20,}\b/g, '[TOKEN_REDACTED]'],
  [/Bearer\s[a-zA-Z0-9_.-]+/g, '[TOKEN_REDACTED]'],

  // Credit card numbers (16-digit with optional separators - spaces or hyphens)
  [/\b[0-9]{4}[\s-][0-9]{4}[\s-][0-9]{4}[\s-][0-9]{4}\b/g, '[CARD_REDACTED]'],
  [/\b[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{4}\b/g, '[CARD_REDACTED]'],
  [/\b[0-9]{16}\b/g, '[CARD_REDACTED]'],

  // Email addresses
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]'],

  // Japanese phone numbers (0-prefix) — BEFORE postal codes
  // Must have word boundary at start to avoid matching postal codes like 〒100-0001
  [/\b0[0-9]{1,4}[-\s]?[0-9]{1,4}[-\s]?[0-9]{3,4}\b/g, '[PHONE_REDACTED]'],

  // Japanese postal codes (〒 prefix or standalone 3-4 digit format)
  [/〒\d{3}[-\s]?\d{4}/g, '[POSTAL_REDACTED]'],

  // IP addresses (IPv4)
  [/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, '[IP_REDACTED]'],

  // Social Security Numbers / マイナンバー-like (xxx-xx-xxxx) — LAST as it overlaps with other patterns
  [/\b[0-9]{3}[-][0-9]{2}[-][0-9]{4}\b/g, '[SSN_REDACTED]'],
];

/**
 * Redact personally identifiable information from a string.
 * Uses a set of regex patterns to detect and mask PII.
 *
 * @param text - The input string that may contain PII
 * @returns The text with PII replaced by redaction markers
 */
export function redactPII(text: string): string {
  let result = text;
  for (const [pattern, replacement] of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Redact PII from an object's string properties (non-mutating).
 * Recursively processes nested objects and arrays.
 *
 * @param obj - The object to redact
 * @returns A new object with redacted string values
 */
export function redactPIIFromObject(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return redactPII(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(redactPIIFromObject);
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactPIIFromObject(value);
    }
    return result;
  }

  return obj;
}
