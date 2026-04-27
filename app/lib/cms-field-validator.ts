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
    // patch 0154 (2026-04-24): excerpt フィールドを schema に追加 (patch 0153 既知バグ修正)。
    // AdminContent の form は以前から excerpt を送っていたが schema 未定義で「未定義フィールド」エラーだった。
    excerpt: { type: 'multi_line_text_field', maxLength: 500 },
    // patch 0154: AdminContent form が送る他フィールドも schema 化 (バリデーション通過のため)。
    content_type: { type: 'single_line_text_field', maxLength: 50 },
    status: { type: 'single_line_text_field', maxLength: 50 },
    tags: { type: 'single_line_text_field', maxLength: 500 },
    display_order: { type: 'number_integer' },
    // patch 0153 (2026-04-24): 記事を 1 つのコレクションに関連付ける。
    // storefront のコレクションページに「関連記事」リンクとして表示される。
    related_collection_handle: { type: 'single_line_text_field', maxLength: 200 },
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
  astromeda_about_section: {
    title: { type: 'single_line_text_field', maxLength: 200, required: true },
    body_html: { type: 'multi_line_text_field', maxLength: 20000 },
    image: { type: 'file_reference' },
    link_url: { type: 'single_line_text_field', maxLength: 500 },
    link_label: { type: 'single_line_text_field', maxLength: 100 },
    display_order: { type: 'number_integer' },
    is_active: { type: 'boolean' },
  },
  astromeda_product_shelf: {
    title: { type: 'single_line_text_field', maxLength: 200, required: true },
    subtitle: { type: 'single_line_text_field', maxLength: 300 },
    product_ids_json: { type: 'multi_line_text_field', maxLength: 5000 },
    limit: { type: 'number_integer' },
    sort_key: { type: 'single_line_text_field', maxLength: 50 },
    display_order: { type: 'number_integer' },
    is_active: { type: 'boolean' },
  },
  astromeda_static_page: {
    title: { type: 'single_line_text_field', maxLength: 200, required: true },
    page_slug: { type: 'single_line_text_field', maxLength: 100, required: true },
    meta_description: { type: 'multi_line_text_field', maxLength: 500 },
    body_html: { type: 'multi_line_text_field', maxLength: 50000 },
    sections_json: { type: 'multi_line_text_field', maxLength: 50000 },
    updated_label: { type: 'single_line_text_field', maxLength: 100 },
    is_published: { type: 'boolean' },
  },
  astromeda_faq_item: {
    question: { type: 'single_line_text_field', maxLength: 300, required: true },
    answer: { type: 'multi_line_text_field', maxLength: 5000, required: true },
    category: { type: 'single_line_text_field', maxLength: 50 },
    display_order: { type: 'number_integer' },
    is_active: { type: 'boolean' },
  },
  astromeda_gaming_feature_card: {
    label: { type: 'single_line_text_field', maxLength: 200, required: true },
    image_url: { type: 'single_line_text_field', maxLength: 2000 },
    link_url: { type: 'single_line_text_field', maxLength: 500 },
    display_order: { type: 'number_integer' },
    is_active: { type: 'boolean' },
  },
  astromeda_gaming_parts_card: {
    label: { type: 'single_line_text_field', maxLength: 200, required: true },
    image_url: { type: 'single_line_text_field', maxLength: 2000 },
    link_url: { type: 'single_line_text_field', maxLength: 500 },
    category: { type: 'single_line_text_field', maxLength: 20 },
    display_order: { type: 'number_integer' },
    is_active: { type: 'boolean' },
  },
  astromeda_gaming_price_range: {
    label: { type: 'single_line_text_field', maxLength: 200, required: true },
    link_url: { type: 'single_line_text_field', maxLength: 500 },
    display_order: { type: 'number_integer' },
    is_active: { type: 'boolean' },
  },
  // patch 0039
  astromeda_gaming_hero_slide: {
    alt_text: { type: 'single_line_text_field', maxLength: 200 },
    image_url: { type: 'single_line_text_field', maxLength: 2000 },
    link_url: { type: 'single_line_text_field', maxLength: 500 },
    display_order: { type: 'number_integer' },
    is_active: { type: 'boolean' },
  },
  astromeda_gaming_contact: {
    phone_number: { type: 'single_line_text_field', maxLength: 30 },
    phone_hours: { type: 'single_line_text_field', maxLength: 100 },
    line_url: { type: 'single_line_text_field', maxLength: 500 },
    line_label: { type: 'single_line_text_field', maxLength: 100 },
    line_hours: { type: 'single_line_text_field', maxLength: 100 },
    is_active: { type: 'boolean' },
  },
  // patch 0166 (2026-04-27): セクション単位 HTML/CSS 上書き
  // 他社デザイン会社が管理画面から HTML/CSS を上書きしてセクション単位でデザインを変える基盤。
  // mode: 'default' = 元のデザイン / 'custom_html' = HTML 完全上書き / 'custom_css' = CSS だけ上書き
  // custom_html / custom_css は sanitizeHtml で script/iframe/onclick/javascript: 除去 (multi_line_text_field 共通処理)
  astromeda_section_override: {
    section_key: { type: 'single_line_text_field', maxLength: 100, required: true },
    mode: { type: 'single_line_text_field', maxLength: 20 }, // 'default' | 'custom_html' | 'custom_css'
    custom_html: { type: 'multi_line_text_field', maxLength: 100000 },
    custom_css: { type: 'multi_line_text_field', maxLength: 100000 },
    is_active: { type: 'boolean' },
    notes: { type: 'multi_line_text_field', maxLength: 1000 },
    // patch 0185 (2026-04-27): セクション位置の並び替え
    // CSS order に渡されて GamingPCLanding 内でセクションの上下を入れ替えられる。
    // 未設定 (0) は JSX 上のソース順 (Hydrogen がそのまま render)。
    // vendor が drag-drop で 10/20/30/... と振り直す前提で 1 始まり。
    display_order: { type: 'number_integer' },
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
 * @param clearFields update 時に「明示的に空にする」フィールドキーの配列。
 *                   patch 0112 (P0-2): update 時に空文字を渡しても黙ってクリアしないよう、
 *                   クリア意図はこの配列で明示する必要がある。空文字 + clearFields 未指定 → 該当フィールドは
 *                   sanitizedFields に含めず、Shopify 側の値を preserve する。
 *                   セントネル値 '__CLEAR__' を rawValue に入れても明示クリアとして扱う。
 * @returns バリデーション結果（sanitizedFields にサニタイズ済みフィールドを格納）
 */
export function validateAndSanitizeFields(
  type: string,
  fields: Array<{ key: string; value: string }>,
  action: 'create' | 'update' = 'create',
  clearFields?: string[],
): ValidationResult {
  const schema = FIELD_SCHEMAS[type];
  const errors: ValidationError[] = [];
  const sanitizedFields: Array<{ key: string; value: string }> = [];
  const clearSet = new Set(clearFields ?? []);

  // スキーマが未定義のタイプ → フィールドは通すがサニタイズだけ実施
  if (!schema) {
    for (const field of fields) {
      const rawValue = String(field.value ?? '');
      // patch 0112: スキーマレス時も update + 空値 + 明示クリアなし → skip
      // (rawValue が空/null/undefined 文字列の時点で '__CLEAR__' とは別物なので clearSet チェックのみで充分)
      if (
        action === 'update' &&
        (rawValue === '' || rawValue === 'null' || rawValue === 'undefined') &&
        !clearSet.has(field.key)
      ) {
        continue;
      }
      const isExplicitClear = rawValue === '__CLEAR__' || clearSet.has(field.key);
      sanitizedFields.push({
        key: field.key,
        value: isExplicitClear ? '' : sanitizeSingleLine(rawValue),
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

    // patch 0112 (P0-2, 全保存パターン監査 2026-04-22):
    // update 時に空値を渡しても、明示クリア指定がない限り「未送信」として扱い preserve する。
    // 旧実装: 空値 → sanitizedFields に '' を push → metaobjectUpdate 経由で field を実際にクリア
    //         (例: IPバナーで「タイトルだけ修正」したら image_url が空欄保存で画像消失)
    // 新実装: action='update' で rawValue===''/null/undefined かつ clearFields にも __CLEAR__ にも含まれない
    //         → 配列に push しない → Shopify 側で field 値が preserve される (metaobjectUpdate は partial-safe)
    const isEmpty = rawValue === '' || rawValue === 'null' || rawValue === 'undefined';
    const isExplicitClear = rawValue === '__CLEAR__' || clearSet.has(field.key);

    if (isEmpty && !isExplicitClear) {
      if (action === 'update') {
        // 空値 + 明示クリアなし → 触らない (preserve)
        continue;
      }
      // create の場合は既存挙動: required は上で弾き済み・任意フィールドの空文字は push して空フィールド作成
      sanitizedFields.push({ key: field.key, value: '' });
      continue;
    }

    if (isExplicitClear) {
      // 明示クリア: rawValue が '__CLEAR__' でも clearFields 指定でも、空文字を push してフィールドをクリア
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
