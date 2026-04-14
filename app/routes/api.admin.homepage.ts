/**
 * ホームページCMS管理API — CMS Phase D
 *
 * GET:  メタオブジェクト「astromeda_homepage_collabs」「astromeda_homepage_banners」取得
 * POST: IPコラボ作成/更新/削除、バナー管理、定義初期化
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC → AuditLog → CSRF(POST) → Zod
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.homepage';
import { z } from 'zod';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

// ── メタオブジェクトタイプ ──
const COLLABS_TYPE = 'astromeda_homepage_collabs';
const BANNERS_TYPE = 'astromeda_homepage_banners';

// ── Zod スキーマ ──
const safeString = (maxLen: number = 500) =>
  z.string().max(maxLen).refine(
    (s) => !/<[^>]*>/g.test(s),
    { message: 'HTMLタグは使用できません' },
  );

const HomepageActionSchema = z.discriminatedUnion('action', [
  // 定義初期化
  z.object({
    action: z.literal('init_definitions'),
  }).strict(),

  // IPコラボ作成
  z.object({
    action: z.literal('create_collab'),
    handle: safeString(100),
    name: safeString(255),
    shopHandle: safeString(255),
    theme: safeString(50).optional().default('default'),
    featured: z.boolean().optional().default(false),
    sortOrder: z.number().int().min(0).max(999).optional().default(0),
  }).strict(),

  // IPコラボ更新
  z.object({
    action: z.literal('update_collab'),
    metaobjectId: z.string().min(1),
    name: safeString(255).optional(),
    shopHandle: safeString(255).optional(),
    theme: safeString(50).optional(),
    featured: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
  }).strict(),

  // IPコラボ削除
  z.object({
    action: z.literal('delete_collab'),
    metaobjectId: z.string().min(1),
  }).strict(),

  // ヒーローバナー作成
  z.object({
    action: z.literal('create_banner'),
    handle: safeString(100),
    title: safeString(255),
    collectionHandle: safeString(255).optional(),
    linkUrl: safeString(2048).optional(),
    sortOrder: z.number().int().min(0).max(99).optional().default(0),
    active: z.boolean().optional().default(true),
  }).strict(),

  // ヒーローバナー更新
  z.object({
    action: z.literal('update_banner'),
    metaobjectId: z.string().min(1),
    title: safeString(255).optional(),
    collectionHandle: safeString(255).optional(),
    linkUrl: safeString(2048).optional(),
    sortOrder: z.number().int().min(0).max(99).optional(),
    active: z.boolean().optional(),
  }).strict(),

  // ヒーローバナー削除
  z.object({
    action: z.literal('delete_banner'),
    metaobjectId: z.string().min(1),
  }).strict(),
]);

// ── GET ──

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.homepage', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  try {
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const session = await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]);
    const role = requirePermission(session, 'products.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/homepage [GET]', success: true });

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    // 並列取得
    const [collabsRaw, bannersRaw] = await Promise.all([
      client.getMetaobjects(COLLABS_TYPE, 100).catch(() => [] as Array<{id: string; handle: string; fields: Array<{key: string; value: string}>}>),
      client.getMetaobjects(BANNERS_TYPE, 50).catch(() => [] as Array<{id: string; handle: string; fields: Array<{key: string; value: string}>}>),
    ]);

    const collabs = collabsRaw.map((mo) => {
      const f = fieldsToMap(mo.fields);
      return {
        id: mo.id,
        handle: mo.handle,
        name: f['name'] || '',
        shopHandle: f['shop_handle'] || '',
        theme: f['theme'] || 'default',
        featured: f['featured'] === 'true',
        sortOrder: parseInt(f['sort_order'] || '0', 10),
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder);

    const banners = bannersRaw.map((mo) => {
      const f = fieldsToMap(mo.fields);
      return {
        id: mo.id,
        handle: mo.handle,
        title: f['title'] || '',
        collectionHandle: f['collection_handle'] || null,
        linkUrl: f['link_url'] || null,
        sortOrder: parseInt(f['sort_order'] || '0', 10),
        active: f['active'] !== 'false',
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder);

    return data({
      success: true,
      collabs,
      banners,
      stats: {
        totalCollabs: collabs.length,
        featuredCollabs: collabs.filter((c) => c.featured).length,
        totalBanners: banners.length,
        activeBanners: banners.filter((b) => b.active).length,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `ホームページデータ取得失敗: ${msg}` }, { status: 500 });
  }
}

// ── POST ──

export async function action({ request, context }: Route.ActionArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.homepage', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const session = await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = HomepageActionSchema.safeParse(rawBody);
    if (!validation.success) {
      return data({
        error: '入力値が無効です',
        details: validation.error.errors.map((e) => e.message),
      }, { status: 400 });
    }

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();
    const v = validation.data;

    switch (v.action) {
      case 'init_definitions': {
        const role = requirePermission(session, 'products.edit');

        const [collabsDef, bannersDef] = await Promise.all([
          client.createMetaobjectDefinition(COLLABS_TYPE, 'ホームページ IPコラボ', [
            { key: 'name', name: 'IP名', type: 'single_line_text_field' },
            { key: 'shop_handle', name: 'Shopifyコレクションハンドル', type: 'single_line_text_field' },
            { key: 'theme', name: 'テーマ', type: 'single_line_text_field' },
            { key: 'featured', name: 'フィーチャー', type: 'single_line_text_field' },
            { key: 'sort_order', name: '表示順', type: 'number_integer' },
          ]),
          client.createMetaobjectDefinition(BANNERS_TYPE, 'ホームページ バナー', [
            { key: 'title', name: 'バナータイトル', type: 'single_line_text_field' },
            { key: 'collection_handle', name: 'コレクションハンドル', type: 'single_line_text_field' },
            { key: 'link_url', name: 'リンクURL', type: 'single_line_text_field' },
            { key: 'sort_order', name: '表示順', type: 'number_integer' },
            { key: 'active', name: '有効', type: 'single_line_text_field' },
          ]),
        ]);

        auditLog({ action: 'homepage_init', role, resource: 'metaobject_definitions', success: true });
        return data({ success: true, collabsDefId: collabsDef.id, bannersDefId: bannersDef.id });
      }

      case 'create_collab': {
        const role = requirePermission(session, 'products.edit');
        const fields = [
          { key: 'name', value: v.name },
          { key: 'shop_handle', value: v.shopHandle },
          { key: 'theme', value: v.theme },
          { key: 'featured', value: String(v.featured) },
          { key: 'sort_order', value: String(v.sortOrder) },
        ];
        const result = await client.createMetaobject(COLLABS_TYPE, v.handle, fields);
        auditLog({ action: 'collab_create', role, resource: `metaobject/${result.id}`, success: true });
        return data({ success: true, metaobject: result });
      }

      case 'update_collab': {
        const role = requirePermission(session, 'products.edit');
        const fields: Array<{ key: string; value: string }> = [];
        if (v.name) fields.push({ key: 'name', value: v.name });
        if (v.shopHandle) fields.push({ key: 'shop_handle', value: v.shopHandle });
        if (v.theme) fields.push({ key: 'theme', value: v.theme });
        if (v.featured !== undefined) fields.push({ key: 'featured', value: String(v.featured) });
        if (v.sortOrder !== undefined) fields.push({ key: 'sort_order', value: String(v.sortOrder) });

        const result = await client.updateMetaobject(v.metaobjectId, fields);
        auditLog({ action: 'collab_update', role, resource: `metaobject/${v.metaobjectId}`, success: true });
        return data({ success: true, metaobject: result });
      }

      case 'delete_collab': {
        const role = requirePermission(session, 'products.delete');
        const result = await client.deleteMetaobject(v.metaobjectId);
        auditLog({ action: 'collab_delete', role, resource: `metaobject/${v.metaobjectId}`, success: result });
        return data({ success: result });
      }

      case 'create_banner': {
        const role = requirePermission(session, 'products.edit');
        const fields = [
          { key: 'title', value: v.title },
          { key: 'sort_order', value: String(v.sortOrder) },
          { key: 'active', value: String(v.active) },
        ];
        if (v.collectionHandle) fields.push({ key: 'collection_handle', value: v.collectionHandle });
        if (v.linkUrl) fields.push({ key: 'link_url', value: v.linkUrl });

        const result = await client.createMetaobject(BANNERS_TYPE, v.handle, fields);
        auditLog({ action: 'banner_create', role, resource: `metaobject/${result.id}`, success: true });
        return data({ success: true, metaobject: result });
      }

      case 'update_banner': {
        const role = requirePermission(session, 'products.edit');
        const fields: Array<{ key: string; value: string }> = [];
        if (v.title) fields.push({ key: 'title', value: v.title });
        if (v.collectionHandle !== undefined) fields.push({ key: 'collection_handle', value: v.collectionHandle });
        if (v.linkUrl !== undefined) fields.push({ key: 'link_url', value: v.linkUrl });
        if (v.sortOrder !== undefined) fields.push({ key: 'sort_order', value: String(v.sortOrder) });
        if (v.active !== undefined) fields.push({ key: 'active', value: String(v.active) });

        const result = await client.updateMetaobject(v.metaobjectId, fields);
        auditLog({ action: 'banner_update', role, resource: `metaobject/${v.metaobjectId}`, success: true });
        return data({ success: true, metaobject: result });
      }

      case 'delete_banner': {
        const role = requirePermission(session, 'products.delete');
        const result = await client.deleteMetaobject(v.metaobjectId);
        auditLog({ action: 'banner_delete', role, resource: `metaobject/${v.metaobjectId}`, success: result });
        return data({ success: result });
      }

      default:
        return data({ error: '不明なアクションです' }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `ホームページ操作失敗: ${msg}` }, { status: 500 });
  }
}

// ── ヘルパー ──

function fieldsToMap(fields: Array<{ key: string; value: string }>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of fields) m[f.key] = f.value;
  return m;
}
