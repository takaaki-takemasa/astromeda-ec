/**
 * CMS フィールドバリデーション & サニタイズ（S3 セキュリティ強化）
 *
 * Metaobject 定義のフィールド型に基づいて入力値を検証・無害化する。
 * api.admin.cms.ts の POST handler で使用。
 *
 * 防御対象:
 * - Stored XSS（HTML/スクリプト注入）
 * - 型不一致（数値フィールドに文字列等）
 * - 過剰な長さ（DoS / ストレージ浪費）
 * - 改行注入（single_line_text_field）
 *
 * v164 rebuild: 2026-04-17
 */

import { sanitizeHtml } from '~/lib/sanitize-html';

// ── フィールド型定義（metaobject-setup.ts の13定義から集約）──

type FieldType =
  | 'single_line_text_field'
  | 'multi_line_text_field'
  | 'number_integer'
  | 'boolean'
  | 'date_time'
  | 'url'
  | 'file_reference';

interface FieldSpec {
  type: FieldType;
  maxLength?: number;
  required?: boolean;
}

// 全13 Metaobject タイプのフィールドスキーマ
const FIELD_SCHEMAS: Record<string, Record<string, FieldSpec>> = {
  astromeda_article_content: {
    title: { type: 'single_line_text_field', maxLength: 200, required: true },
    slug: { type: 'single_line_text_field', maxLength: 100, required: true },
    body_html: { type: 'multi_line_text_field', maxLength: 50000 },
    author: { type: 'single_line_text_field', maxLength: 100 },
    published_at: { type: 'date_time' },
    featured_image: { type: 'file_reference' },
    is_published: { type: 'boolean' },
  },
  astromeda_ip_banner: {
    name: { type: 'single_line_text_field', maxLength: 200, required: true },
    collection_handle: { type: 'single_line_text_field', maxLength: 200 },
    image: { type: 'file_reference' },
    tagline: { type: 'single_line_text_field', maxLength: 300 },
    label: { type: 'single_line_text_field', maxLength: 50 },
    display_order: { type: 'number_integer' },
    is_active: { type: 'boolean' },
  },
  astromeda_hero_banner: {
    title: { type: 'single_line_text_field', maxLength: 200, required: true },
    subtitle: { type: 'single_line_text_field', maxLength: 300 },
    image: { type: 'file_reference' },
    link_url: { type: 'url' },
    cta_label: { type: 'single_line_text_field', maxLength: 100 },
    display_order: { type: 'number_integer' },
    is_active: { type: 'boolean' },
    start_at: { type: 'date_time' },
    end_at: { type: 'date_time' },
  },
  astromeda_seo_article: {
    title: { type: 'single_line_text_field', maxLength: 200, required: true },
    slug: { type: 'single_line_text_field', maxLength: 100, required: true },
    meta_description: { type: 'multi_line_text_field', maxLength: 500 },
    keywords: { type: 'single_line_text_field', maxLength: 500 },
    body_markdown: { type: 'multi_line_text_field', maxLength: 50000 },
    target_keyword_volume: { type: 'number_integer' },
    is_published: { type: 'boolean' },
  },
  astromeda_custom_option: {
    name: { type: 'single_line_text_field', maxLength: 200, required: true },
    category: { type: 'single_line_text_field', maxLength: 100 },
    choices_json: { type: 'multi_line_text_field', maxLength: 10000 },
    display_order: { type: 'number_integer' },
    is_required: { type: 'boolean' },
    applies_to_tags: { type: 'single_line_text_field', maxLength: 500 },
  },
  astromeda_campaign: {
    title: { type: 'single_line_text_field', maxLength: 200, required: true },
    description: { type: 'multi_line_text_field', maxLength: 5000 },
    discount_code: { type: 'single_line_text_field', maxLength: 100 },
    discount_percent: { type: 'number_integer' },
    start_at: { type: 'date_time' },
    end_at: { type: 'date_time' },
    target_tags: { type: 'single_line_text_field', maxLength: 500 },
    status: { type: 'single_line_text_field', maxLength: 50 },
  },
  astromeda_site_config: {
    brand_name: { type: 'single_line_text_field', maxLength: 100 },
    company_name: { type: 'single_line_text_field', maxLength: 200 },
    store_url: { type: 'single_line_text_field', maxLength: 300 },
    theme_json: { type: 'multi_line_text_field', maxLength: 20000 },
    nav_items_json: { type: 'multi_line_text_field', maxLength: 10000 },
    footer_links_json: { type: 'multi_line_text_field', maxLength: 10000 },
    footer_sections_json: { type: 'multi_line_text_field', maxLength: 10000 },
    social_links_json: { type: 'multi_line_text_field', maxLength: 5000 },
    contact_phone: { type: 'single_line_text_field', maxLength: 50 },
    contact_email: { type: 'single_line_text_field', maxLength: 200 },
  },
  astromeda_pc_color: {
    name: { type: 'single_line_text_field', maxLength: 100, required: true },
    slug: { type: 'single_line_text_field', maxLength: 50, required: true },
    hex_color: { type: 'single_line_text_field', maxLength: 20 },
    gradient_color: { type: 'single_line_text_field', maxLength: 20 },
    is_dark: { type: 'boolean' },
    collection_handle: { type: 'single_line_text_field', maxLength: 200 },
    color_keywords: { type: 'single_line_text_field', maxLength: 500 },
    image_url: { type: 'single_line_text_field', maxLength: 2000 },
    display_order: { type: 'number_integer' },
    is_active: { type: 'boolean' },
  },
  astromeda_pc_tier: {
    tier_name: { type: 'single_line_text_field', maxLength: 100, required: true },
    gpu_range: { type: 'single_line_text_field', maxLength: 200 },
    cpu_range: { type: 'single_line_text_field', maxLength: 200 },
    ram: { type: 'single_line_text_field', maxLength: 50 },
    base_price: { type: 'number_integer' },
    is_popular: { type: 'boolean' },
    benchmarks_json: { type: 'multi_line_text_field', maxLength: 10000 },
    display_order: { type: 'number_integer' },
  },
  astromeda_ugc_review: {
    username: { type: 'single_line_text_field', maxLength: 100, required: true },
    review_text: { type: 'multi_line_text_field', maxLength: 2000, required: true },
    accent_color: { type: 'single_line_text_field', maxLength: 20 },
    rating: { type: 'number_integer' },
    date_label: { type: 'single_line_text_field', maxLength: 50 },
    likes: { type: 'number_integer' },
    product_name: { type: 'single_line_text_field', maxLength: 200 },
    display_order: { type: 'number_integer' },
    is_active: { type: 'boolean' },
  },
  astromeda_marquee_item: {
    text: { type: 'single_line_text_field', maxLength: 500, required: true },
    display_order: { type: 'number_integer' },
    is_active: { type: 'boolean' },
  },
  astromeda_category_card: {
    name: { type: 'single_line_text_field', maxLength: 100, required: true },
    subtitle: { type: 'single_line_text_field', maxLength: 200 },
    route: { type: 'single_line_text_field', maxLength: 300 },
    price_label: { type: 'single_line_text_field', maxLength: 50 },
    accent_color: { type: 'single_line_text_field', maxLength: 20 },
    bg_color: { type: 'single_line_text_field', maxLength: 50 },
    display_order: { type: 'number_integer' },
    is_active: { type: 'boolean' },
  },
  astromeda_legal_info: {
    company_json: { type: 'multi_line_text_field', maxLength: 20000 },
    tokusho_json: { type: 'multi_line_text_field', maxLength: 20000 },
    warranty_json: { type: 'multi_line_text_field', maxLength: 20000 },
    privacy_text: { type: 'multi_line_text_field', maxLength: 50000 },
  },
};

// ── バリデーションエラー ──

export interface ValidationError {
  key: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  sanitizedFields: Array<{ key: string; value: string }>;
}

// ── ISO 8601 日時パターン ──
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

// ── URL パターン（http/https のみ許可）──
const URL_PATTERN = /^https?:\/\/.+/i;

// ── 単一行テキストのサニタイズ ──
function sanitizeSingleLine(value: string): string {
  return value
    .replace(/[\r\n]/g, ' ')       // 改行除去
    .replace(/<[^>]*>/g, '')        // HTMLタグ除去
    .replace(/\s+/g, ' ')          // 連続空白を1つに
    .trim();
}

// ── 複数行テキストのサニタイズ ──
function sanitizeMultiLine(value: string): string {
  // body_html 等のHTMLコンテンツと、JSON等の非HTMLコンテンツを判定
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(value);
  if (looksLikeHtml) {
    return sanitizeHtml(value);
  }
  // JSON文字列はそのまま返す（ただしスクリプト注入だけ除去）
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:');
}

/**
 * フィールド配列をバリデーション＆サニタイズする
 *
 * @param type Metaobject タイプ名（例: 'astromeda_ip_banner'）
 * @param fields POST されたフィールド配列
 * @param action 'create' | 'update' — create 時は required チェックを厳格化
 * @returns バリデーション結果（sanitizedFields にサニタイズ済みフィールドを格納）
 */
export function validateAndSanitizeFields(
  type: string,
  fields: Array<{ key: string; value: string }>,
  action: 'create' | 'update' = 'create',
): ValidationResult {
  const schema = FIELD_SCHEMAS[type];
  const errors: ValidationError[] = [];
  const sanitizedFields: Array<{ key: string; value: string }> = [];

  // スキーマが未定義のタイプ → フィールドは通すがサニタイズだけ実施
  if (!schema) {
    for (const field of fields) {
      sanitizedFields.push({
        key: field.key,
        value: sanitizeSingleLine(String(field.value ?? '')),
      });
    }
    return { valid: true, errors: [], sanitizedFields };
  }

  // create 時の required チェック
  if (action === 'create') {
    const providedKeys = new Set(fields.map((f) => f.key));
    for (const [key, spec] of Object.entries(schema)) {
      if (spec.required && !providedKeys.has(key)) {
        errors.push({ key, message: `必須フィールド「${key}」が未指定です` });
      }
    }
  }

  // 各フィールドの型バリデーション＋サニタイズ
  for (const field of fields) {
    const spec = schema[field.key];
    const rawValue = String(field.value ?? '');

    // スキーマにないフィールドはスキップ（不正フィールド注入防止）
    if (!spec) {
      errors.push({ key: field.key, message: `未定義フィールド「${field.key}」は許可されていません` });
      continue;
    }

    // 空値は許可（required チェックは上で済み）
    if (rawValue === '' || rawValue === 'null' || rawValue === 'undefined') {
      sanitizedFields.push({ key: field.key, value: '' });
      continue;
    }

    switch (spec.type) {
      case 'single_line_text_field': {
        const sanitized = sanitizeSingleLine(rawValue);
        if (spec.maxLength && sanitized.length > spec.maxLength) {
          errors.push({
            key: field.key,
            message: `「${field.key}」は${spec.maxLength}文字以内にしてください（現在${sanitized.length}文字）`,
          });
        }
        sanitizedFields.push({ key: field.key, value: sanitized });
        break;
      }

      case 'multi_line_text_field': {
        const sanitized = sanitizeMultiLine(rawValue);
        if (spec.maxLength && sanitized.length > spec.maxLength) {
          errors.push({
            key: field.key,
            message: `「${field.key}」は${spec.maxLength}文字以内にしてください（現在${sanitized.length}文字）`,
          });
        }
        sanitizedFields.push({ key: field.key, value: sanitized });
        break;
      }

      case 'number_integer': {
        const num = Number(rawValue);
        if (!Number.isFinite(num) || !Number.isInteger(num)) {
          errors.push({ key: field.key, message: `「${field.key}」は整数を指定してください` });
          sanitizedFields.push({ key: field.key, value: '0' });
        } else {
          sanitizedFields.push({ key: field.key, value: String(num) });
        }
        break;
      }

      case 'boolean': {
        const lower = rawValue.toLowerCase();
        if (lower !== 'true' && lower !== 'false') {
          errors.push({ key: field.key, message: `「${field.key}」は true/false を指定してください` });
          sanitizedFields.push({ key: field.key, value: 'false' });
        } else {
          sanitizedFields.push({ key: field.key, value: lower });
        }
        break;
      }

      case 'date_time': {
        if (!ISO_DATE_PATTERN.test(rawValue)) {
          errors.push({
            key: field.key,
            message: `「${field.key}」はISO 8601形式（例: 2026-04-16T12:00:00Z）を指定してください`,
          });
        }
        // 日時はサニタイズ不要（パターン検証で十分）
        sanitizedFields.push({ key: field.key, value: rawValue });
        break;
      }

      case 'url': {
        if (!URL_PATTERN.test(rawValue)) {
          errors.push({
            key: field.key,
            message: `「${field.key}」はhttp://またはhttps://で始まるURLを指定してください`,
          });
        }
        // javascript: / data: プロトコル排除
        const cleanUrl = rawValue
          .replace(/javascript\s*:/gi, 'blocked:')
          .replace(/data\s*:/gi, 'blocked:');
        sanitizedFields.push({ key: field.key, value: cleanUrl });
        break;
      }

      case 'file_reference': {
        // Shopify file reference GID — そのまま通す（gid://shopify/... 形式）
        sanitizedFields.push({ key: field.key, value: rawValue });
        break;
      }

      default: {
        // 未知の型はサニタイズだけして通す
        sanitizedFields.push({ key: field.key, value: sanitizeSingleLine(rawValue) });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedFields,
  };
}

/**
 * handle のバリデーション
 * Shopify Metaobject ハンドルは英数字・ハイフン・アンダースコアのみ
 */
export function validateHandle(handle: string): string | null {
  if (!handle) return 'ハンドルは必須です';
  if (handle.length > 200) return 'ハンドルは200文字以内にしてください';
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(handle)) {
    return 'ハンドルは英小文字・数字・ハイフン・アンダースコアのみ使用可能です（先頭は英数字）';
  }
  return null; // OK
}
