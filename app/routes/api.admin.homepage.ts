/**
 * ホームページCMS管理API — CMS Phase D
 *
 * GET:  Metaobject「astromeda_ip_banner」「astromeda_hero_banner」取得
 * POST: IPコラボ（ip_banner）・ヒーローバナー（hero_banner）CRUD
 *
 * Metaobject 定義は api/admin/metaobject-setup で一括作成（本ファイルからは作成しない）
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

// ── Metaobject 型名（metaobject-setup.ts と整合） ──
const COLLABS_TYPE = 'astromeda_ip_banner';
const BANNERS_TYPE = 'astromeda_hero_banner';

// ── Zod スキーマ ──
const safeString = (maxLen: number = 500) =>
  z.string().max(maxLen).refine(
    (s) => !/<[^>]*>/g.test(s),
    { message: 'HTMLタグは使用できません' },
  );

const HomepageActionSchema = z.discriminatedUnion('action', [
  // IPコラボ作成（入力名はフロントエンド互換のため旧名を維持）
  z.object({
    action: z.literal('create_collab'),
    handle: safeString(100),
    name: safeString(255),
    shopHandle: safeString(255),          // → collection_handle
    theme: safeString(50).optional(),     // 旧フィールド（互換のため受け取るが書き込まない）
    featured: z.boolean().optional().default(true), // → is_active
    sortOrder: z.number().int().min(0).max(999).optional().default(0), // → display_order
    image: safeString(2048).optional(),
    tagline: safeString(255).optional(),
    label: safeString(50).optional(),
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
    image: safeString(2048).optional(),
    tagline: safeString(255).optional(),
    label: safeString(50).optional(),
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
    subtitle: safeString(255).optional(),
    image: safeString(2048).optional(),
    linkUrl: safeString(2048).optional(),
    ctaLabel: safeString(100).optional(),
    collectionHandle: safeString(255).optional(), // 互換のため受け取るが書き込まない
    sortOrder: z.number().int().min(0).max(99).optional().default(0),
    active: z.boolean().optional().default(true),
    startAt: safeString(50).optional(),
    endAt: safeString(50).optional(),
  }).strict(),

  // ヒーローバナー更新
  z.object({
    action: z.literal('update_banner'),
    metaobjectId: z.string().min(1),
    title: safeString(255).optional(),
    subtitle: safeString(255).optional(),
    image: safeString(2048).optional(),
    linkUrl: safeString(2048).optional(),
    ctaLabel: safeString(100).optional(),
    collectionHandle: safeString(255).optional(),
    sortOrder: z.number().int().min(0).max(99).optional(),
    active: z.boolean().optional(),
    startAt: safeString(50).optional(),
    endAt: safeString(50).optional(),
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
        shopHandle: f['collection_handle'] || '',
        image: f['image'] || null,
        tagline: f['tagline'] || null,
        label: f['label'] || null,
        sortOrder: parseInt(f['display_order'] || '0', 10),
        featured: f['is_active'] === 'true',
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder);

    const banners = bannersRaw.map((mo) => {
      const f = fieldsToMap(mo.fields);
      return {
        id: mo.id,
        handle: mo.handle,
        title: f['title'] || '',
        subtitle: f['subtitle'] || null,
        image: f['image'] || null,
        linkUrl: f['link_url'] || null,
        ctaLabel: f['cta_label'] || null,
        sortOrder: parseInt(f['display_order'] || '0', 10),
        active: f['is_active'] === 'true',
        startAt: f['start_at'] || null,
        endAt: f['end_at'] || null,
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
      case 'create_collab': {
        const role = requirePermission(session, 'products.edit');
        const fields: Array<{ key: string; value: string }> = [
          { key: 'name', value: v.name },
          { key: 'collection_handle', value: v.shopHandle },
          { key: 'display_order', value: String(v.sortOrder) },
          { key: 'is_active', value: String(v.featured) },
        ];
        if (v.image) fields.push({ key: 'image', value: v.image });
        if (v.tagline) fields.push({ key: 'tagline', value: v.tagline });
        if (v.label) fields.push({ key: 'label', value: v.label });
        const result = await client.createMetaobject(COLLABS_TYPE, v.handle, fields);
        auditLog({ action: 'collab_create', role, resource: `metaobject/${result.id}`, success: true });
        return data({ success: true, metaobject: result });
      }

      case 'update_collab': {
        const role = requirePermission(session, 'products.edit');
        const fields: Array<{ key: string; value: string }> = [];
        if (v.name !== undefined) fields.push({ key: 'name', value: v.name });
        if (v.shopHandle !== undefined) fields.push({ key: 'collection_handle', value: v.shopHandle });
        if (v.featured !== undefined) fields.push({ key: 'is_active', value: String(v.featured) });
        if (v.sortOrder !== undefined) fields.push({ key: 'display_order', value: String(v.sortOrder) });
        if (v.image !== undefined) fields.push({ key: 'image', value: v.image });
        if (v.tagline !== undefined) fields.push({ key: 'tagline', value: v.tagline });
        if (v.label !== undefined) fields.push({ key: 'label', value: v.label });

        const result = await client.updateMetaobject(v.metaobjectId, fields);
        auditLog({ action: 'collab_update', role, resource: `metaobject/${v.metaobjectId}`, success: true });
        return data({ success: true, metaobject: result });
      }

      case 'delete_collab': {
        const role = requirePermission(session, 'products.edit');
        const result = await client.deleteMetaobject(v.metaobjectId);
        auditLog({ action: 'collab_delete', role, resource: `metaobject/${v.metaobjectId}`, success: result });
        return data({ success: result });
      }

      case 'create_banner': {
        const role = requirePermission(session, 'products.edit');
        const fields: Array<{ key: string; value: string }> = [
          { key: 'title', value: v.title },
          { key: 'display_order', value: String(v.sortOrder) },
          { key: 'is_active', value: String(v.active) },
        ];
        if (v.subtitle) fields.push({ key: 'subtitle', value: v.subtitle });
        if (v.image) fields.push({ key: 'image', value: v.image });
        if (v.linkUrl) fields.push({ key: 'link_url', value: v.linkUrl });
        if (v.ctaLabel) fields.push({ key: 'cta_label', value: v.ctaLabel });
        if (v.startAt) fields.push({ key: 'start_at', value: v.startAt });
        if (v.endAt) fields.push({ key: 'end_at', value: v.endAt });

        const result = await client.createMetaobject(BANNERS_TYPE, v.handle, fields);
        auditLog({ action: 'banner_create', role, resource: `metaobject/${result.id}`, success: true });
        return data({ success: true, metaobject: result });
      }

      case 'update_banner': {
        const role = requirePermission(session, 'products.edit');
        const fields: Array<{ key: string; value: string }> = [];
        if (v.title !== undefined) fields.push({ key: 'title', value: v.title });
        if (v.subtitle !== undefined) fields.push({ key: 'subtitle', value: v.subtitle });
        if (v.image !== undefined) fields.push({ key: 'image', value: v.image });
        if (v.linkUrl !== undefined) fields.push({ key: 'link_url', value: v.linkUrl });
        if (v.ctaLabel !== undefined) fields.push({ key: 'cta_label', value: v.ctaLabel });
        if (v.sortOrder !== undefined) fields.push({ key: 'display_order', value: String(v.sortOrder) });
        if (v.active !== undefined) fields.push({ key: 'is_active', value: String(v.active) });
        if (v.startAt !== undefined) fields.push({ key: 'start_at', value: v.startAt });
        if (v.endAt !== undefined) fields.push({ key: 'end_at', value: v.endAt });

        const result = await client.updateMetaobject(v.metaobjectId, fields);
        auditLog({ action: 'banner_update', role, resource: `metaobject/${v.metaobjectId}`, success: true });
        return data({ success: true, metaobject: result });
      }

      case 'delete_banner': {
        const role = requirePermission(session, 'products.edit');
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
