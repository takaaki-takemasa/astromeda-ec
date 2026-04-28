/**
 * /api/admin/migrate-tag4window — 4 用途別タグ構造の Shopify Metaobject 定義 idempotent migration
 *
 * patch 0190-fu (2026-04-28): patch 0190-0193 の補完。CMS schema (cms-field-validator) に
 * 追加した新フィールド/新タイプを Shopify 側にも反映する。
 *
 * 5 操作 (全部 idempotent — 何度叩いても安全):
 *   1. astromeda_ip_banner    に accepting_tags フィールド追加
 *   2. astromeda_hero_banner  に accepting_tags フィールド追加
 *   3. astromeda_marquee_item に accepting_tags フィールド追加
 *   4. astromeda_product_content 定義新規作成 (target_tag/heading/content_html/image_url/display_order/is_active)
 *   5. astromeda_related_group   定義新規作成 (group_tag/group_label/display_order/max_items/is_active)
 *
 * 認証: admin owner / admin のみ (RBAC)
 */
import type {LoaderFunctionArgs, ActionFunctionArgs} from 'react-router';
import {AppSession} from '~/lib/session';

interface Env {
  SESSION_SECRET?: string;
  [k: string]: unknown;
}

const ACCEPTING_TAGS_FIELD = {
  key: 'accepting_tags',
  name: 'クリック後の表示商品を絞り込むタグ',
  type: 'single_line_text_field' as const,
  description: 'バナーをクリックした後の商品一覧で表示する商品を絞り込むタグ (banner-target:* 推奨)',
};

const PRODUCT_CONTENT_DEF = {
  type: 'astromeda_product_content',
  name: '商品コンテンツ (商品ページ下段)',
  fieldDefinitions: [
    {key: 'target_tag', name: '対象タグ (この値が商品 tags にあれば表示)', type: 'single_line_text_field' as const, required: true},
    {key: 'heading', name: '見出し (H2)', type: 'single_line_text_field' as const},
    {key: 'content_html', name: '本文 HTML', type: 'multi_line_text_field' as const},
    {key: 'image_url', name: '代表画像 URL', type: 'single_line_text_field' as const},
    {key: 'display_order', name: '並び順 (数字小さい=上)', type: 'number_integer' as const},
    {key: 'is_active', name: '公開する', type: 'boolean' as const},
  ],
};

const RELATED_GROUP_DEF = {
  type: 'astromeda_related_group',
  name: '関連製品グループ (商品ページ下段)',
  fieldDefinitions: [
    {key: 'group_tag', name: 'グループタグ (related-group:* 推奨)', type: 'single_line_text_field' as const, required: true},
    {key: 'group_label', name: '見出し (例: その他モデル / マウスパッド)', type: 'single_line_text_field' as const},
    {key: 'display_order', name: '並び順', type: 'number_integer' as const},
    {key: 'max_items', name: '最大表示件数 (既定 4)', type: 'number_integer' as const},
    {key: 'is_active', name: '公開する', type: 'boolean' as const},
  ],
};

interface MigrationResult {
  type: string;
  action: 'created' | 'field-added' | 'unchanged' | 'failed';
  fieldsAdded?: string[];
  error?: string;
}

async function ensureAcceptingTagsField(
  client: {
    getMetaobjectDefinitionByType: (t: string) => Promise<{id: string; fieldDefinitions: Array<{key: string}>} | null>;
    updateMetaobjectDefinition: (id: string, fields: Array<{key: string; name: string; type: string}>) => Promise<unknown>;
  },
  type: string,
): Promise<MigrationResult> {
  try {
    const def = await client.getMetaobjectDefinitionByType(type);
    if (!def) return {type, action: 'failed', error: '定義が存在しません'};
    const has = def.fieldDefinitions.some((f) => f.key === 'accepting_tags');
    if (has) return {type, action: 'unchanged'};
    await client.updateMetaobjectDefinition(def.id, [
      {key: ACCEPTING_TAGS_FIELD.key, name: ACCEPTING_TAGS_FIELD.name, type: ACCEPTING_TAGS_FIELD.type},
    ]);
    return {type, action: 'field-added', fieldsAdded: ['accepting_tags']};
  } catch (e) {
    return {type, action: 'failed', error: (e as Error).message};
  }
}

async function ensureDefinition(
  client: {
    getMetaobjectDefinitionByType: (t: string) => Promise<{id: string; fieldDefinitions: Array<{key: string}>} | null>;
    updateMetaobjectDefinition: (id: string, fields: Array<{key: string; name: string; type: string}>) => Promise<unknown>;
    query: <T>(gql: string, vars: Record<string, unknown>) => Promise<T>;
  },
  def: typeof PRODUCT_CONTENT_DEF | typeof RELATED_GROUP_DEF,
): Promise<MigrationResult> {
  try {
    const existing = await client.getMetaobjectDefinitionByType(def.type);
    if (existing) {
      // 既存 → 不足フィールドを追加
      const have = new Set(existing.fieldDefinitions.map((f) => f.key));
      const missing = def.fieldDefinitions.filter((f) => !have.has(f.key));
      if (missing.length === 0) return {type: def.type, action: 'unchanged'};
      await client.updateMetaobjectDefinition(
        existing.id,
        missing.map((f) => ({key: f.key, name: f.name, type: f.type})),
      );
      return {type: def.type, action: 'field-added', fieldsAdded: missing.map((f) => f.key)};
    }
    // 新規作成
    const gql = `
      mutation defCreate($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition { id type }
          userErrors { field message }
        }
      }
    `;
    const res = await client.query<{
      metaobjectDefinitionCreate: {
        metaobjectDefinition: {id: string; type: string} | null;
        userErrors: Array<{field: string[]; message: string}>;
      };
    }>(gql, {
      definition: {
        type: def.type,
        name: def.name,
        access: {storefront: 'PUBLIC_READ'},
        fieldDefinitions: def.fieldDefinitions.map((f) => ({
          key: f.key,
          name: f.name,
          type: f.type,
          ...(f.required ? {required: true} : {}),
        })),
      },
    });
    const {metaobjectDefinition, userErrors} = res.metaobjectDefinitionCreate;
    if (userErrors && userErrors.length > 0) {
      return {type: def.type, action: 'failed', error: userErrors.map((e) => e.message).join('; ')};
    }
    if (!metaobjectDefinition) return {type: def.type, action: 'failed', error: '空レスポンス'};
    return {type: def.type, action: 'created', fieldsAdded: def.fieldDefinitions.map((f) => f.key)};
  } catch (e) {
    return {type: def.type, action: 'failed', error: (e as Error).message};
  }
}

async function authenticate(request: Request, env: Env): Promise<{ok: boolean; role?: string}> {
  if (!env.SESSION_SECRET) return {ok: false};
  try {
    const session = await AppSession.init(request, [env.SESSION_SECRET]);
    if (session.get('isAdmin') !== true) return {ok: false};
    const role = (session.get('role') as string) ?? 'admin';
    if (role !== 'owner' && role !== 'admin') return {ok: false, role};
    return {ok: true, role};
  } catch {
    return {ok: false};
  }
}

export async function loader({request, context}: LoaderFunctionArgs) {
  // GET: 現状の migration 状態を確認するだけ (action なし)
  const env = context.env as Env;
  const auth = await authenticate(request, env);
  if (!auth.ok) {
    return new Response(JSON.stringify({success: false, error: 'Unauthorized'}), {
      status: 401,
      headers: {'Content-Type': 'application/json'},
    });
  }
  return new Response(
    JSON.stringify({
      success: true,
      message: 'POST this endpoint to run migrations',
      operations: [
        'astromeda_ip_banner: add accepting_tags field',
        'astromeda_hero_banner: add accepting_tags field',
        'astromeda_marquee_item: add accepting_tags field',
        'astromeda_product_content: create definition',
        'astromeda_related_group: create definition',
      ],
    }),
    {headers: {'Content-Type': 'application/json'}},
  );
}

export async function action({request, context}: ActionFunctionArgs) {
  const env = context.env as Env;
  const auth = await authenticate(request, env);
  if (!auth.ok) {
    return new Response(JSON.stringify({success: false, error: 'Unauthorized'}), {
      status: 401,
      headers: {'Content-Type': 'application/json'},
    });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({success: false, error: 'POST only'}), {
      status: 405,
      headers: {'Content-Type': 'application/json'},
    });
  }
  try {
    const {setAdminEnv, getAdminClient} = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(env);
    const client = getAdminClient();
    const results: MigrationResult[] = [];
    // 1-3: banner 3 タイプに accepting_tags 追加
    for (const type of ['astromeda_ip_banner', 'astromeda_hero_banner', 'astromeda_marquee_item']) {
      results.push(await ensureAcceptingTagsField(client, type));
    }
    // 4: astromeda_product_content 定義
    results.push(await ensureDefinition(client, PRODUCT_CONTENT_DEF));
    // 5: astromeda_related_group 定義
    results.push(await ensureDefinition(client, RELATED_GROUP_DEF));

    const ok = results.every((r) => r.action !== 'failed');
    return new Response(
      JSON.stringify({success: ok, results}, null, 2),
      {status: ok ? 200 : 500, headers: {'Content-Type': 'application/json'}},
    );
  } catch (e) {
    return new Response(
      JSON.stringify({success: false, error: (e as Error).message}),
      {status: 500, headers: {'Content-Type': 'application/json'}},
    );
  }
}
