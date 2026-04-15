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
  // ── Sprint 2 / M4: ページ編集向け Metaobject 5種 ──
  {
    type: 'astromeda_pc_color_model',
    name: 'Astromeda PCカラーモデル',
    description: 'トップページ PCShowcase のカラーバリエーション。管理画面「ページ編集 > PCカラー」で管理。',
    fieldDefinitions: [
      { key: 'name', name: 'カラー名（例: ホワイト）', type: 'single_line_text_field' },
      { key: 'handle', name: 'コレクションハンドル', type: 'single_line_text_field' },
      { key: 'image', name: 'カラー画像', type: 'file_reference' },
      { key: 'color_code', name: 'カラーコード（#RRGGBB）', type: 'single_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
    ],
  },
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
  {
    type: 'astromeda_product_shelf',
    name: 'Astromeda 商品シェルフ',
    description: 'トップページの特集商品シェルフ（PRODUCT_IDS の順序で表示）。',
    fieldDefinitions: [
      { key: 'title', name: 'シェルフタイトル', type: 'single_line_text_field' },
      { key: 'product_ids_json', name: '商品GID配列（JSON）', type: 'multi_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
    ],
  },
  {
    type: 'astromeda_about_section',
    name: 'Astromeda Aboutセクション',
    description: 'About / 会社紹介ページ各セクションの本文・画像。',
    fieldDefinitions: [
      { key: 'title', name: 'セクションタイトル', type: 'single_line_text_field' },
      { key: 'body_html', name: '本文HTML', type: 'multi_line_text_field' },
      { key: 'image', name: '画像', type: 'file_reference' },
      { key: 'link_url', name: 'リンクURL', type: 'url' },
      { key: 'link_label', name: 'リンクラベル', type: 'single_line_text_field' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
    ],
  },
  {
    type: 'astromeda_footer_config',
    name: 'Astromeda フッター設定',
    description: 'フッターのセクション別リンク群（LINKS_JSON で構造化）。',
    fieldDefinitions: [
      { key: 'section_title', name: 'セクション名', type: 'single_line_text_field' },
      { key: 'links_json', name: 'リンク配列（JSON: [{label,url}...]）', type: 'multi_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
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
    message: 'POST this endpoint to create 6 Metaobject definitions',
    definitions: METAOBJECT_DEFINITIONS.map(d => ({
      type: d.type,
      name: d.name,
      description: d.description,
      fieldCount: d.fieldDefinitions.length,
    })),
  });
}
