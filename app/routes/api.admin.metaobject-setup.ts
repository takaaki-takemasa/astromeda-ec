/**
 * Metaobject定義一括セットアップAPI
 *
 * POST /api/admin/metaobject-setup
 *
 * 管理画面の「連携していない70%」を解決するための Shopify Metaobject 定義を
 * 一括作成する。CEOが1回呼び出すだけで6種の定義が作成され、以降は
 * 管理画面のCMS系タブが Metaobject CRUD 経由で実際に動作するようになる。
 *
 * 作成される定義（13種）:
 * 1.  astromeda_article_content     記事コンテンツ
 * 2.  astromeda_ip_banner           IPバナー
 * 3.  astromeda_hero_banner         ヒーローバナー
 * 4.  astromeda_seo_article         SEO記事
 * 5.  astromeda_custom_option       カスタマイズオプション（商品プルダウン）
 * 6.  astromeda_campaign            マーケティングキャンペーン
 * 7.  astromeda_site_config         サイト設定（テーマ/ナビ/フッター/連絡先/SNS）
 * 8.  astromeda_pc_color            PCカラーバリエーション（8色）
 * 9.  astromeda_pc_tier             PC製品ティア（GAMER/STREAMER/CREATOR）
 * 10. astromeda_ugc_review          ユーザーレビュー
 * 11. astromeda_marquee_item        マーキーテキスト
 * 12. astromeda_category_card       カテゴリカード（トップページ）
 * 13. astromeda_legal_info          法務情報（特商法/保証/プライバシー）
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
      { key: 'collection_handle', name: 'Shopifyコレクションハンドル', type: 'single_line_text_field' },
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
  // ── 7. サイト設定（テーマ/ナビ/フッター/連絡先/SNS）──
  {
    type: 'astromeda_site_config',
    name: 'Astromeda サイト設定',
    description: 'サイト全体の設定。テーマカラー/ナビゲーション/フッター/連絡先/SNSリンク。管理画面「サイト設定」で管理。',
    fieldDefinitions: [
      { key: 'brand_name', name: 'ブランド名', type: 'single_line_text_field' },
      { key: 'company_name', name: '会社名', type: 'single_line_text_field' },
      { key: 'store_url', name: 'ストアURL', type: 'single_line_text_field' },
      { key: 'theme_json', name: 'テーマカラーJSON', type: 'multi_line_text_field' },
      { key: 'nav_items_json', name: 'ナビゲーション項目JSON', type: 'multi_line_text_field' },
      { key: 'footer_links_json', name: 'フッターリンクJSON', type: 'multi_line_text_field' },
      { key: 'footer_sections_json', name: 'フッターセクションJSON', type: 'multi_line_text_field' },
      { key: 'social_links_json', name: 'SNSリンクJSON', type: 'multi_line_text_field' },
      { key: 'contact_phone', name: '電話番号', type: 'single_line_text_field' },
      { key: 'contact_email', name: 'メールアドレス', type: 'single_line_text_field' },
    ],
  },
  // ── 8. PCカラーバリエーション ──
  {
    type: 'astromeda_pc_color',
    name: 'Astromeda PCカラー',
    description: 'トップページ8色カラーモデル。管理画面「サイト設定 > PCカラー」で管理。',
    fieldDefinitions: [
      { key: 'name', name: 'カラー名（日本語）', type: 'single_line_text_field' },
      { key: 'slug', name: 'スラッグ（英語）', type: 'single_line_text_field' },
      { key: 'hex_color', name: 'HEXカラーコード', type: 'single_line_text_field' },
      { key: 'gradient_color', name: 'グラデーションカラー', type: 'single_line_text_field' },
      { key: 'is_dark', name: 'ダークテーマ', type: 'boolean' },
      { key: 'collection_handle', name: 'Shopifyコレクションハンドル', type: 'single_line_text_field' },
      { key: 'color_keywords', name: 'カラー判定キーワード（カンマ区切り）', type: 'single_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
      { key: 'image_url', name: 'バナー画像URL（トップページ8色カラーで表示）', type: 'single_line_text_field' },
    ],
  },
  // ── 9. PCティア ──
  {
    type: 'astromeda_pc_tier',
    name: 'Astromeda PCティア',
    description: 'GAMER/STREAMER/CREATORの製品ティア定義。管理画面「サイト設定 > PCティア」で管理。',
    fieldDefinitions: [
      { key: 'tier_name', name: 'ティア名', type: 'single_line_text_field' },
      { key: 'gpu_range', name: 'GPU範囲', type: 'single_line_text_field' },
      { key: 'cpu_range', name: 'CPU範囲', type: 'single_line_text_field' },
      { key: 'ram', name: 'RAM', type: 'single_line_text_field' },
      { key: 'base_price', name: '最低価格（税込）', type: 'number_integer' },
      { key: 'is_popular', name: '人気ティア', type: 'boolean' },
      { key: 'benchmarks_json', name: 'ベンチマークJSON', type: 'multi_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
    ],
  },
  // ── 10. ユーザーレビュー ──
  {
    type: 'astromeda_ugc_review',
    name: 'Astromeda ユーザーレビュー',
    description: 'トップページREVIEWSセクションのUGCレビュー。管理画面「コンテンツ > レビュー」で管理。',
    fieldDefinitions: [
      { key: 'username', name: 'ユーザー名', type: 'single_line_text_field' },
      { key: 'review_text', name: 'レビュー本文', type: 'multi_line_text_field' },
      { key: 'accent_color', name: 'アクセントカラー', type: 'single_line_text_field' },
      { key: 'rating', name: '評価（1-5）', type: 'number_integer' },
      { key: 'date_label', name: '日付ラベル', type: 'single_line_text_field' },
      { key: 'likes', name: 'いいね数', type: 'number_integer' },
      { key: 'product_name', name: '商品名', type: 'single_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
    ],
  },
  // ── 11. マーキーテキスト ──
  {
    type: 'astromeda_marquee_item',
    name: 'Astromeda マーキーテキスト',
    description: 'トップページスクロールマーキーのテキスト。管理画面「コンテンツ > マーキー」で管理。',
    fieldDefinitions: [
      { key: 'text', name: 'テキスト', type: 'single_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
    ],
  },
  // ── 12. カテゴリカード ──
  {
    type: 'astromeda_category_card',
    name: 'Astromeda カテゴリカード',
    description: 'トップページCATEGORYセクションのカード。管理画面「ホームページCMS > カテゴリ」で管理。',
    fieldDefinitions: [
      { key: 'name', name: 'カテゴリ名', type: 'single_line_text_field' },
      { key: 'subtitle', name: 'サブタイトル', type: 'single_line_text_field' },
      { key: 'route', name: 'リンク先パス', type: 'single_line_text_field' },
      { key: 'price_label', name: '価格ラベル', type: 'single_line_text_field' },
      { key: 'accent_color', name: 'アクセントカラー', type: 'single_line_text_field' },
      { key: 'bg_color', name: '背景カラー', type: 'single_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
    ],
  },
  // ── 13. 法務情報 ──
  {
    type: 'astromeda_legal_info',
    name: 'Astromeda 法務情報',
    description: '特定商取引法表記/保証/プライバシーポリシー。管理画面「サイト設定 > 法務」で管理。',
    fieldDefinitions: [
      { key: 'company_json', name: '会社概要JSON', type: 'multi_line_text_field' },
      { key: 'tokusho_json', name: '特定商取引法表記JSON', type: 'multi_line_text_field' },
      { key: 'warranty_json', name: '保証情報JSON', type: 'multi_line_text_field' },
      { key: 'privacy_text', name: 'プライバシーポリシー', type: 'multi_line_text_field' },
    ],
  },
  // ── 14. ABOUT セクション ──
  {
    type: 'astromeda_about_section',
    name: 'Astromeda ABOUTセクション',
    description: 'トップページ「ASTROMEDAとは？」コンパクトバナー。管理画面「ホームページCMS > ABOUT」で管理。',
    fieldDefinitions: [
      { key: 'title', name: 'タイトル', type: 'single_line_text_field' },
      { key: 'body_html', name: '説明文（HTML可）', type: 'multi_line_text_field' },
      { key: 'image', name: '画像', type: 'file_reference' },
      { key: 'link_url', name: 'リンク先URL', type: 'single_line_text_field' },
      { key: 'link_label', name: 'CTAボタン文言', type: 'single_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
    ],
  },
  // ── 15. 商品シェルフ ──
  {
    type: 'astromeda_product_shelf',
    name: 'Astromeda 商品シェルフ',
    description: 'トップページ「NEW ARRIVALS」等の商品並び。管理画面「ホームページCMS > 商品シェルフ」で管理。',
    fieldDefinitions: [
      { key: 'title', name: 'セクション見出し', type: 'single_line_text_field' },
      { key: 'subtitle', name: 'サブタイトル', type: 'single_line_text_field' },
      { key: 'product_ids_json', name: '商品ID JSON配列', type: 'multi_line_text_field' },
      { key: 'limit', name: '表示件数', type: 'number_integer' },
      { key: 'sort_key', name: '並び順（manual/best_selling/newest）', type: 'single_line_text_field' },
      { key: 'display_order', name: '表示順', type: 'number_integer' },
      { key: 'is_active', name: '表示中', type: 'boolean' },
    ],
  },
  // ── 16. 固定ページ（保証/FAQ/こだわり/お問い合わせ等） ──
  {
    type: 'astromeda_static_page',
    name: 'Astromeda 固定ページ',
    description: '保証/FAQ/こだわり/お問い合わせ等の固定ページ。管理画面「サイト設定 > 固定ページ」で管理。',
    fieldDefinitions: [
      { key: 'title', name: 'ページタイトル', type: 'single_line_text_field' },
      { key: 'page_slug', name: 'ページパス（例: warranty, faq）', type: 'single_line_text_field' },
      { key: 'meta_description', name: 'メタディスクリプション', type: 'multi_line_text_field' },
      { key: 'body_html', name: '本文HTML', type: 'multi_line_text_field' },
      { key: 'sections_json', name: 'セクションJSON（見出し+本文リスト）', type: 'multi_line_text_field' },
      { key: 'updated_label', name: '最終更新日ラベル', type: 'single_line_text_field' },
      { key: 'is_published', name: '公開中', type: 'boolean' },
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

    const typedClient = client as unknown as {
      createMetaobjectDefinition: (
        type: string,
        name: string,
        fieldDefinitions: FieldDef[],
      ) => Promise<{ id: string }>;
      getMetaobjectDefinition: (
        type: string,
      ) => Promise<{ id: string; fieldDefinitions: Array<{ key: string; name: string }> } | null>;
      updateMetaobjectDefinition: (
        id: string,
        fieldDefinitionsToAdd: FieldDef[],
      ) => Promise<{ id: string }>;
    };

    const results: Array<{
      type: string;
      name: string;
      status: 'created' | 'already_exists' | 'updated' | 'error';
      id?: string;
      fieldsAdded?: number;
      error?: string;
    }> = [];

    for (const def of METAOBJECT_DEFINITIONS) {
      try {
        const created = await typedClient.createMetaobjectDefinition(
          def.type, def.name, def.fieldDefinitions,
        );
        results.push({
          type: def.type,
          name: def.name,
          status: 'created',
          id: created.id,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Shopify の duplicate-type エラーは「既存」として扱う → 不足フィールドを追加
        if (msg.includes('already') || msg.includes('exists') || msg.includes('taken')) {
          // 既存定義のフィールドを取得し、不足分を追加
          try {
            const existing = await typedClient.getMetaobjectDefinition(def.type);
            if (existing) {
              const existingKeys = new Set(existing.fieldDefinitions.map(f => f.key));
              const missingFields = def.fieldDefinitions.filter(f => !existingKeys.has(f.key));

              if (missingFields.length > 0) {
                await typedClient.updateMetaobjectDefinition(existing.id, missingFields);
                results.push({
                  type: def.type,
                  name: def.name,
                  status: 'updated',
                  id: existing.id,
                  fieldsAdded: missingFields.length,
                });
              } else {
                results.push({
                  type: def.type,
                  name: def.name,
                  status: 'already_exists',
                  id: existing.id,
                });
              }
            } else {
              results.push({
                type: def.type,
                name: def.name,
                status: 'already_exists',
              });
            }
          } catch (updateErr) {
            const updateMsg = updateErr instanceof Error ? updateErr.message : String(updateErr);
            results.push({
              type: def.type,
              name: def.name,
              status: 'error',
              error: `既存定義の更新失敗: ${updateMsg}`,
            });
          }
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
      detail: `setup ${results.filter(r => r.status === 'created').length} new / ${results.filter(r => r.status === 'updated').length} updated / ${results.filter(r => r.status === 'already_exists').length} existing / ${results.filter(r => r.status === 'error').length} errors`,
      success: results.every(r => r.status !== 'error'),
    });

    const summary = {
      total: METAOBJECT_DEFINITIONS.length,
      created: results.filter(r => r.status === 'created').length,
      updated: results.filter(r => r.status === 'updated').length,
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
    message: 'POST this endpoint to create/update 13 Metaobject definitions',
    definitions: METAOBJECT_DEFINITIONS.map(d => ({
      type: d.type,
      name: d.name,
      description: d.description,
      fieldCount: d.fieldDefinitions.length,
    })),
  });
}
