/**
 * Metaobject定義一括セットアップAPI
 *
 * POST /api/admin/metaobject-setup
 *
 * 管理画面の「連携していない70%」を解決するための Shopify Metaobject 定義を
 * 一括作成する。CEOが1回呼び出すだけで6種の定義が作成され、以降は
 * 管理画面のCMS系タブが Metaobject CRUD 経由で実際に動作するようになる。
 *
 * 作成される定義:
 * 1. astromeda_article_content     記事コンテンツ
 * 2. astromeda_ip_banner           IPバナー
 * 3. astromeda_hero_banner         ヒーローバナー
 * 4. astromeda_seo_article         SEO記事
 * 5. astromeda_custom_option       カスタマイズオプション（商品プルダウン）
 * 6. astromeda_campaign            マーケティングキャンペーン
 *
 * 冪等性: 既に存在する定義は「ALREADY EXISTS」としてskipし、成功扱いとする。
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC (settings.edit) → Origin-CSRF → AuditLog
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.metaobject-setup';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

interface FieldDef {
  key: string;
  name: string;
  type: string;
}

interface MetaobjectDefinitionSpec {
  type: string;
  name: string;
  fieldDefinitions: FieldDef[];
  description: string;
}

// ── 6種の Metaobject 定義仕様 ──
const METAOBJECT_DEFINITIONS: MetaobjectDefinitionSpec[] = [
  {
    type: 'astromeda_article_content',
    name: 'Astromeda 記事コンテンツ',
    description: 'ContentWriter Agent が生成する記事。管理画面「コンテンツ」タブで管理。',
    fieldDefinitions: [
      { key: 'title', name: 'タイトル', type: 'single_line_text_field' },
      { key: 'slug', name: 'スラッグ', type: 'single_line_text_field' },
      { key: 'body_html', name: '本文HTML', type: 'multi_line_text_field' },
      { key: 'author', name: '著者', type: 'single_line_text_field' },
      { key: 'published_at', name: '公開日時', type: 'date_time' },
      { key: 'featured_image', name: 'サムネイル画像', type: 'file_reference' },
      { key: 'is_published', name: '公開中', type: 'boolean' },
    ],
  },
  {
    type: 'astromeda_ip_banner',
    name: 'Astromeda IPバナー',
    description: 'トップページIPコラボグリッドのバナー。管理画面「ホームページCMS」で管理。',
    fieldDefinitions: [
      { key: 'name', name: 'IP名', type: 'single_line_text_field' },
      { key: 'handle', name: 'Shopifyコレクションハンドル', type: 'single_line_text_field' },
      { key: 'image', name: 'バナー画像', type: 'file_reference' },
      { key: 'tagline', name: 'タグライン', type: 'single_line_text_field' },
      { key: 'label', name: 'ラベル（NEW/HOT/COLLAB）', type: 'single_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
    ],
  },
  {
    type: 'astromeda_hero_banner',
    name: 'Astromeda ヒーローバナー',
    description: 'トップページHeroスライダーのバナー。管理画面「ホームページCMS > ヒーローバナー」で管理。',
    fieldDefinitions: [
      { key: 'title', name: 'タイトル', type: 'single_line_text_field' },
      { key: 'subtitle', name: 'サブタイトル', type: 'single_line_text_field' },
      { key: 'image', name: '背景画像', type: 'file_reference' },
      { key: 'link_url', name: 'リンク先URL', type: 'url' },
      { key: 'cta_label', name: 'CTAボタン文言', type: 'single_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
      { key: 'start_at', name: '表示開始日時', type: 'date_time' },
      { key: 'end_at', name: '表示終了日時', type: 'date_time' },
    ],
  },
  {
    type: 'astromeda_seo_article',
    name: 'Astromeda SEO記事',
    description: 'SEO最適化記事。管理画面「コンテンツ > SEO」で管理。',
    fieldDefinitions: [
      { key: 'title', name: 'タイトル', type: 'single_line_text_field' },
      { key: 'slug', name: 'スラッグ', type: 'single_line_text_field' },
      { key: 'meta_description', name: 'メタディスクリプション', type: 'multi_line_text_field' },
      { key: 'keywords', name: 'キーワード（カンマ区切り）', type: 'single_line_text_field' },
      { key: 'body_markdown', name: '本文マークダウン', type: 'multi_line_text_field' },
      { key: 'target_keyword_volume', name: '目標検索ボリューム', type: 'number_integer' },
      { key: 'is_published', name: '公開中', type: 'boolean' },
    ],
  },
  {
    type: 'astromeda_custom_option',
    name: 'Astromeda カスタマイズオプション',
    description: '商品詳細ページのプルダウンオプション。管理画面「カスタマイズオプション管理」で管理。',
    fieldDefinitions: [
      { key: 'name', name: 'オプション名（例: CPU選択）', type: 'single_line_text_field' },
      { key: 'category', name: 'カテゴリ（cpu/gpu/memory/etc）', type: 'single_line_text_field' },
      { key: 'choices_json', name: '選択肢JSON（配列）', type: 'multi_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_required', name: '必須', type: 'boolean' },
      { key: 'applies_to_tags', name: '適用商品タグ（カンマ区切り）', type: 'single_line_text_field' },
    ],
  },
  {
    type: 'astromeda_campaign',
    name: 'Astromeda マーケティングキャンペーン',
    description: 'PromotionAgent が生成するキャンペーン。管理画面「マーケティング > キャンペーン」で管理。',
    fieldDefinitions: [
      { key: 'title', name: 'キャンペーン名', type: 'single_line_text_field' },
      { key: 'description', name: '説明', type: 'multi_line_text_field' },
      { key: 'discount_code', name: '割引コード', type: 'single_line_text_field' },
      { key: 'discount_percent', name: '割引率（％）', type: 'number_integer' },
      { key: 'start_at', name: '開始日時', type: 'date_time' },
      { key: 'end_at', name: '終了日時', type: 'date_time' },
      { key: 'target_tags', name: '対象商品タグ（カンマ区切り）', type: 'single_line_text_field' },
      { key: 'status', name: 'ステータス（active/planned/completed）', type: 'single_line_text_field' },
    ],
  },
  // ── v159: カテゴリカード (維持) ──
  {
    type: 'astromeda_category_card',
    name: 'Astromeda カテゴリカード',
    description: 'トップページのカテゴリクイックナビ（ゲーミングPC / ガジェット / グッズ等）。',
    fieldDefinitions: [
      { key: 'title', name: 'カテゴリ名', type: 'single_line_text_field' },
      { key: 'description', name: '説明', type: 'multi_line_text_field' },
      { key: 'price_from', name: '最低価格', type: 'number_integer' },
      { key: 'image', name: 'カード画像', type: 'file_reference' },
      { key: 'link_url', name: 'リンクURL', type: 'url' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
    ],
  },
  // ── v159: 新規 7 タイプ ──
  {
    type: 'astromeda_site_config',
    name: 'Astromeda サイト設定',
    description: 'ブランド名・会社名・URL・テーマ・ナビゲーション・フッター・SNS・連絡先の一括設定。',
    fieldDefinitions: [
      { key: 'brand_name', name: 'ブランド名', type: 'single_line_text_field' },
      { key: 'company_name', name: '会社名', type: 'single_line_text_field' },
      { key: 'store_url', name: 'ストアURL', type: 'url' },
      { key: 'theme_json', name: 'テーマ設定JSON', type: 'multi_line_text_field' },
      { key: 'nav_items_json', name: 'ナビゲーション項目JSON', type: 'multi_line_text_field' },
      { key: 'footer_links_json', name: 'フッターリンクJSON', type: 'multi_line_text_field' },
      { key: 'footer_sections_json', name: 'フッターセクションJSON', type: 'multi_line_text_field' },
      { key: 'social_links_json', name: 'SNSリンクJSON', type: 'multi_line_text_field' },
      { key: 'contact_phone', name: '連絡先電話', type: 'single_line_text_field' },
      { key: 'contact_email', name: '連絡先メール', type: 'single_line_text_field' },
    ],
  },
  {
    type: 'astromeda_pc_color',
    name: 'Astromeda PCカラー',
    description: 'PCShowcase 8色カラーバリエーション。hex/gradient/dark判定/コレクション連携。',
    fieldDefinitions: [
      { key: 'name', name: 'カラー名', type: 'single_line_text_field' },
      { key: 'slug', name: 'スラッグ', type: 'single_line_text_field' },
      { key: 'hex_color', name: 'HEXカラー', type: 'single_line_text_field' },
      { key: 'gradient_color', name: 'グロー/グラデーション色', type: 'single_line_text_field' },
      { key: 'is_dark', name: 'ダークカラー', type: 'boolean' },
      { key: 'collection_handle', name: 'コレクションハンドル', type: 'single_line_text_field' },
      { key: 'color_keywords', name: 'カラーキーワード（カンマ区切り）', type: 'single_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
      { key: 'image_url', name: 'バナー画像URL（トップページ8色カラーで表示）', type: 'single_line_text_field' },
    ],
  },
  {
    type: 'astromeda_pc_tier',
    name: 'Astromeda PCティア',
    description: 'GAMER/STREAMER/CREATORティアの価格帯・スペック・ベンチマーク。',
    fieldDefinitions: [
      { key: 'tier_name', name: 'ティア名', type: 'single_line_text_field' },
      { key: 'gpu_range', name: 'GPU範囲', type: 'single_line_text_field' },
      { key: 'cpu_range', name: 'CPU範囲', type: 'single_line_text_field' },
      { key: 'ram', name: 'RAM', type: 'single_line_text_field' },
      { key: 'base_price', name: '基本価格', type: 'number_integer' },
      { key: 'is_popular', name: '人気', type: 'boolean' },
      { key: 'benchmarks_json', name: 'ベンチマークJSON', type: 'multi_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
    ],
  },
  {
    type: 'astromeda_ugc_review',
    name: 'Astromeda UGCレビュー',
    description: 'トップページのユーザーレビューカルーセル。',
    fieldDefinitions: [
      { key: 'username', name: 'ユーザー名', type: 'single_line_text_field' },
      { key: 'review_text', name: 'レビュー本文', type: 'multi_line_text_field' },
      { key: 'accent_color', name: 'アクセントカラー', type: 'single_line_text_field' },
      { key: 'rating', name: '評価', type: 'number_integer' },
      { key: 'date_label', name: '日付ラベル', type: 'single_line_text_field' },
      { key: 'likes', name: 'いいね数', type: 'number_integer' },
      { key: 'product_name', name: '商品名', type: 'single_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
    ],
  },
  {
    type: 'astromeda_marquee_item',
    name: 'Astromeda マーキーアイテム',
    description: 'トップページ上部のスクロールテキスト。',
    fieldDefinitions: [
      { key: 'text', name: 'テキスト', type: 'single_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
    ],
  },
  {
    type: 'astromeda_legal_info',
    name: 'Astromeda 法的情報',
    description: '会社概要・特定商取引法・保証・プライバシーポリシー情報。',
    fieldDefinitions: [
      { key: 'company_json', name: '会社概要JSON', type: 'multi_line_text_field' },
      { key: 'tokusho_json', name: '特定商取引法JSON', type: 'multi_line_text_field' },
      { key: 'warranty_json', name: '保証・修理JSON', type: 'multi_line_text_field' },
      { key: 'privacy_text', name: 'プライバシーポリシー本文', type: 'multi_line_text_field' },
    ],
  },
];

export async function action({ request, context }: Route.ActionArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  // Origin/Referer CSRF検証
  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.metaobject-setup', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const sessionFromContext = (context as unknown as { session?: AppSession }).session;
    const session = sessionFromContext ?? await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]);

    const { requirePermission } = await import('~/lib/rbac');
    const role = requirePermission(session as AppSession, 'settings.edit');

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    // リクエストボディをパース（action パラメータによる分岐）
    let rawBody: {action?: string} = {};
    try {
      const text = await request.clone().text();
      if (text) rawBody = JSON.parse(text) as {action?: string};
    } catch {
      rawBody = {};
    }

    // Sprint 4: 既存 astromeda_product_shelf 定義に subtitle/limit/sort_key フィールドを append
    if (rawBody.action === 'update_product_shelf_schema') {
      const fieldsToAdd: FieldDef[] = [
        { key: 'subtitle', name: 'サブタイトル（英語キャッチ等）', type: 'single_line_text_field' },
        { key: 'limit', name: '最大表示件数', type: 'number_integer' },
        { key: 'sort_key', name: '並び順キー（manual/best_selling/newest）', type: 'single_line_text_field' },
      ];
      try {
        const result = await (client as unknown as {
          updateMetaobjectDefinitionAppendFields: (
            type: string,
            fields: FieldDef[],
          ) => Promise<{id: string; addedCount: number}>;
        }).updateMetaobjectDefinitionAppendFields('astromeda_product_shelf', fieldsToAdd);

        auditLog({
          action: 'settings_change',
          role,
          resource: 'api/admin/metaobject-setup',
          detail: `update_product_shelf_schema: +${result.addedCount} fields`,
          success: true,
        });
        return data({
          success: true,
          action: 'update_product_shelf_schema',
          definitionId: result.id,
          addedCount: result.addedCount,
          requestedFields: fieldsToAdd.map((f) => f.key),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        auditLog({
          action: 'settings_change',
          role,
          resource: 'api/admin/metaobject-setup',
          detail: `update_product_shelf_schema failed: ${msg}`,
          success: false,
        });
        return data({success: false, error: `商品シェルフスキーマ更新失敗: ${msg}`}, {status: 500});
      }
    }

    const results: Array<{
      type: string;
      name: string;
      status: 'created' | 'already_exists' | 'error';
      id?: string;
      error?: string;
    }> = [];

    for (const def of METAOBJECT_DEFINITIONS) {
      try {
        const created = await (client as unknown as {
          createMetaobjectDefinition: (
            type: string,
            name: string,
            fieldDefinitions: FieldDef[],
          ) => Promise<{ id: string }>;
        }).createMetaobjectDefinition(def.type, def.name, def.fieldDefinitions);

        results.push({
          type: def.type,
          name: def.name,
          status: 'created',
          id: created.id,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Shopify の duplicate-type エラーは「既存」として扱う
        if (msg.includes('already') || msg.includes('exists') || msg.includes('taken')) {
          results.push({
            type: def.type,
            name: def.name,
            status: 'already_exists',
          });
        } else {
          results.push({
            type: def.type,
            name: def.name,
            status: 'error',
            error: msg,
          });
        }
      }
    }

    auditLog({
      action: 'settings_change',
      role,
      resource: 'api/admin/metaobject-setup',
      detail: `setup ${results.filter(r => r.status === 'created').length} new / ${results.filter(r => r.status === 'already_exists').length} existing / ${results.filter(r => r.status === 'error').length} errors`,
      success: results.every(r => r.status !== 'error'),
    });

    const summary = {
      total: METAOBJECT_DEFINITIONS.length,
      created: results.filter(r => r.status === 'created').length,
      alreadyExists: results.filter(r => r.status === 'already_exists').length,
      errors: results.filter(r => r.status === 'error').length,
    };

    return data({
      success: summary.errors === 0,
      summary,
      results,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data(
      { success: false, error: `Metaobject setup失敗: ${msg}` },
      { status: 500 },
    );
  }
}

export async function loader() {
  // GET は「定義仕様の確認のみ」を返す（副作用なし）
  return data({
    message: 'POST this endpoint to create 13 Metaobject definitions',
    definitions: METAOBJECT_DEFINITIONS.map(d => ({
      type: d.type,
      name: d.name,
      description: d.description,
      fieldCount: d.fieldDefinitions.length,
    })),
  });
}
