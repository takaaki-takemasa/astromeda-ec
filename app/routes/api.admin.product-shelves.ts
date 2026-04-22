/**
 * 商品シェルフ管理API — Sprint 2 Part 4-A
 *
 * GET:  Metaobject「astromeda_product_shelf」一覧取得
 * POST: create / update / delete
 *
 * Metaobject 定義は api/admin/metaobject-setup で一括作成（本ファイルからは作成しない）
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC → AuditLog → CSRF(POST) → Zod
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.product-shelves';
import { z } from 'zod';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';
import { expectedUpdatedAtField, validateExpectedUpdatedAt, casConflictResponse } from '~/lib/expected-updated-at';
import { computeMetaobjectDiff } from '~/lib/audit-snapshot';

const METAOBJECT_TYPE = 'astromeda_product_shelf';

const safeString = (maxLen: number = 500) =>
  z.string().max(maxLen).refine(
    (s) => !/<[^>]*>/g.test(s),
    { message: 'HTMLタグは使用できません' },
  );

const productGid = z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/, '無効な商品GIDです');
const sortKeyEnum = z.enum(['manual', 'best_selling', 'newest']);

const ProductShelfActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    handle: safeString(100),
    title: safeString(255),
    subtitle: safeString(255).optional().default(''),
    productIds: z.array(productGid).min(1).max(50),
    limit: z.number().int().min(1).max(24).optional().default(6),
    sortKey: sortKeyEnum.optional().default('manual'),
    sortOrder: z.number().int().min(0).max(999).optional().default(0),
    isActive: z.boolean().optional().default(true),
  }).strict(),
  z.object({
    action: z.literal('update'),
    metaobjectId: z.string().min(1),
    title: safeString(255).optional(),
    subtitle: safeString(255).optional(),
    productIds: z.array(productGid).min(1).max(50).optional(),
    limit: z.number().int().min(1).max(24).optional(),
    sortKey: sortKeyEnum.optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    isActive: z.boolean().optional(),
    // patch 0115: P2-5 楽観的ロック (CAS) — 別ユーザーの上書きを 409 で防ぐ。送信任意・後方互換。
    expectedUpdatedAt: expectedUpdatedAtField,
  }).strict(),
  z.object({
    action: z.literal('delete'),
    metaobjectId: z.string().min(1),
    // patch 0114: P1-4 削除確認の二重化（誤削除防止）
    confirm: z.literal(true, {
      errorMap: () => ({ message: '削除には確認 (confirm:true) が必要です' }),
    }),
  }).strict(),
]);

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.product-shelves', RATE_LIMIT_PRESETS.admin);
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
    auditLog({ action: 'api_access', role, resource: 'api/admin/product-shelves [GET]', success: true });

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    const metaobjects = await client.getMetaobjects(METAOBJECT_TYPE, 50);

    const productShelves = metaobjects.map((mo) => {
      const f = fieldsToMap(mo.fields);
      let productIds: string[] = [];
      try {
        const parsed = JSON.parse(f['product_ids_json'] || '[]');
        if (Array.isArray(parsed)) {
          productIds = parsed.filter((x): x is string => typeof x === 'string');
        }
      } catch {
        productIds = [];
      }
      const rawLimit = parseInt(f['limit'] || '6', 10);
      const limit = Number.isFinite(rawLimit) && rawLimit >= 1 && rawLimit <= 24 ? rawLimit : 6;
      const sortKey = (['manual', 'best_selling', 'newest'] as const).includes(
        f['sort_key'] as 'manual' | 'best_selling' | 'newest',
      )
        ? (f['sort_key'] as 'manual' | 'best_selling' | 'newest')
        : 'manual';
      return {
        id: mo.id,
        handle: mo.handle,
        // patch 0115: P2-5 楽観的ロック CAS の比較対象（client は edit modal load 時に保持）
        updatedAt: mo.updatedAt,
        title: f['title'] || '',
        subtitle: f['subtitle'] || '',
        productIds,
        limit,
        sortKey,
        sortOrder: parseInt(f['display_order'] || '0', 10),
        isActive: f['is_active'] === 'true',
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder);

    return data({ success: true, productShelves, total: productShelves.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `商品シェルフ取得失敗: ${msg}` }, { status: 500 });
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.product-shelves', RATE_LIMIT_PRESETS.admin);
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

    const validation = ProductShelfActionSchema.safeParse(rawBody);
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
      case 'create': {
        const role = requirePermission(session, 'products.edit');
        const fields: Array<{ key: string; value: string }> = [
          { key: 'title', value: v.title },
          { key: 'subtitle', value: v.subtitle },
          { key: 'product_ids_json', value: JSON.stringify(v.productIds) },
          { key: 'limit', value: String(v.limit) },
          { key: 'sort_key', value: v.sortKey },
          { key: 'display_order', value: String(v.sortOrder) },
          { key: 'is_active', value: String(v.isActive) },
        ];

        const result = await client.createMetaobject(METAOBJECT_TYPE, v.handle, fields);
        // patch 0116: P2-6 — before/after snapshot (新規作成: before=null)
        const diff = computeMetaobjectDiff(undefined, fields);
        auditLog({ action: 'settings_change', role, resource: `metaobject/${result.id}`, detail: 'product_shelf_create', success: true, ...diff });
        return data({ success: true, metaobject: result });
      }

      case 'update': {
        const role = requirePermission(session, 'products.edit');

        // patch 0115: P2-5 楽観的ロック CAS + patch 0116: P2-6 before/after snapshot
        // 両方で current を共有 (Shopify API call を1回に集約)
        const current = await client.getMetaobjectById(v.metaobjectId);

        if (v.expectedUpdatedAt) {
          const cas = validateExpectedUpdatedAt(current, v.expectedUpdatedAt);
          if (!cas.ok) {
            auditLog({ action: 'settings_change', role, resource: `metaobject/${v.metaobjectId}`, detail: 'product_shelf_update_cas_conflict', success: false });
            return casConflictResponse(current, cas.currentUpdatedAt);
          }
        }

        const fields: Array<{ key: string; value: string }> = [];
        if (v.title !== undefined) fields.push({ key: 'title', value: v.title });
        if (v.subtitle !== undefined) fields.push({ key: 'subtitle', value: v.subtitle });
        if (v.productIds !== undefined) fields.push({ key: 'product_ids_json', value: JSON.stringify(v.productIds) });
        if (v.limit !== undefined) fields.push({ key: 'limit', value: String(v.limit) });
        if (v.sortKey !== undefined) fields.push({ key: 'sort_key', value: v.sortKey });
        if (v.sortOrder !== undefined) fields.push({ key: 'display_order', value: String(v.sortOrder) });
        if (v.isActive !== undefined) fields.push({ key: 'is_active', value: String(v.isActive) });

        const result = await client.updateMetaobject(v.metaobjectId, fields);
        // patch 0116: P2-6 — before/after snapshot
        const diff = computeMetaobjectDiff(current?.fields, fields);
        auditLog({ action: 'settings_change', role, resource: `metaobject/${v.metaobjectId}`, detail: 'product_shelf_update', success: true, ...diff });
        return data({ success: true, metaobject: result });
      }

      case 'delete': {
        const role = requirePermission(session, 'products.edit');
        // patch 0116: P2-6 — 削除前にスナップショットを取得 (before=現在値, after=null)
        const current = await client.getMetaobjectById(v.metaobjectId).catch(() => null);
        const result = await client.deleteMetaobject(v.metaobjectId);
        const diff = computeMetaobjectDiff(current?.fields, undefined);
        auditLog({ action: 'settings_change', role, resource: `metaobject/${v.metaobjectId}`, detail: 'product_shelf_delete', success: result, ...diff });
        return data({ success: result });
      }

      default:
        return data({ error: '不明なアクションです' }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `商品シェルフ操作失敗: ${msg}` }, { status: 500 });
  }
}

function fieldsToMap(fields: Array<{ key: string; value: string }>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of fields) m[f.key] = f.value;
  return m;
}
