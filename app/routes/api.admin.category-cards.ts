/**
 * カテゴリカード管理API — Sprint 2 Part 4-A
 *
 * GET:  Metaobject「astromeda_category_card」一覧取得
 * POST: create / update / delete
 *
 * Metaobject 定義は api/admin/metaobject-setup で一括作成（本ファイルからは作成しない）
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC → AuditLog → CSRF(POST) → Zod
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.category-cards';
import { z } from 'zod';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';
import { normalizeFileReferenceField } from '~/lib/image-resolver';
import { expectedUpdatedAtField, validateExpectedUpdatedAt, casConflictResponse } from '~/lib/expected-updated-at';

const METAOBJECT_TYPE = 'astromeda_category_card';

const safeString = (maxLen: number = 500) =>
  z.string().max(maxLen).refine(
    (s) => !/<[^>]*>/g.test(s),
    { message: 'HTMLタグは使用できません' },
  );

const CategoryCardActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    handle: safeString(100),
    title: safeString(255),
    description: safeString(500).optional().default(''),
    priceFrom: z.number().int().min(0).max(99999999).optional().default(0),
    image: safeString(2048).optional(),
    linkUrl: safeString(2048),
    sortOrder: z.number().int().min(0).max(999).optional().default(0),
    isActive: z.boolean().optional().default(true),
  }).strict(),
  z.object({
    action: z.literal('update'),
    metaobjectId: z.string().min(1),
    title: safeString(255).optional(),
    description: safeString(500).optional(),
    priceFrom: z.number().int().min(0).max(99999999).optional(),
    image: safeString(2048).optional(),
    linkUrl: safeString(2048).optional(),
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
  const limited = applyRateLimit(request, 'api.admin.category-cards', RATE_LIMIT_PRESETS.admin);
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
    auditLog({ action: 'api_access', role, resource: 'api/admin/category-cards [GET]', success: true });

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    const metaobjects = await client.getMetaobjects(METAOBJECT_TYPE, 100);

    const categoryCards = metaobjects.map((mo) => {
      const f = fieldsToMap(mo.fields);
      const priceRaw = f['price_from'];
      return {
        id: mo.id,
        handle: mo.handle,
        // patch 0115: P2-5 楽観的ロック CAS の比較対象（client は edit modal load 時に保持）
        updatedAt: mo.updatedAt,
        title: f['title'] || '',
        description: f['description'] || '',
        priceFrom: priceRaw ? parseInt(priceRaw, 10) : 0,
        image: f['image'] || null,
        linkUrl: f['link_url'] || '',
        sortOrder: parseInt(f['display_order'] || '0', 10),
        isActive: f['is_active'] === 'true',
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder);

    return data({ success: true, categoryCards, total: categoryCards.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `カテゴリカード取得失敗: ${msg}` }, { status: 500 });
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.category-cards', RATE_LIMIT_PRESETS.admin);
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

    const validation = CategoryCardActionSchema.safeParse(rawBody);
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
          { key: 'description', value: v.description },
          { key: 'price_from', value: String(v.priceFrom) },
          { key: 'link_url', value: v.linkUrl },
          { key: 'display_order', value: String(v.sortOrder) },
          { key: 'is_active', value: String(v.isActive) },
        ];
        if (v.image) fields.push({ key: 'image', value: v.image });

        // patch 0026: file_reference は GID しか受け付けないため、URL→GID 変換を挟む。
        const imgNotes = await normalizeFileReferenceField(client, fields, 'image', v.title);
        const result = await client.createMetaobject(METAOBJECT_TYPE, v.handle, fields);
        auditLog({ action: 'settings_change', role, resource: `metaobject/${result.id}`, detail: `category_card_create${imgNotes.length ? '; ' + imgNotes.join('; ') : ''}`, success: true });
        return data({ success: true, metaobject: result, imageNotes: imgNotes });
      }

      case 'update': {
        const role = requirePermission(session, 'products.edit');

        // patch 0115: P2-5 楽観的ロック CAS — expectedUpdatedAt 送信時のみ発火
        if (v.expectedUpdatedAt) {
          const current = await client.getMetaobjectById(v.metaobjectId);
          const cas = validateExpectedUpdatedAt(current, v.expectedUpdatedAt);
          if (!cas.ok) {
            auditLog({ action: 'settings_change', role, resource: `metaobject/${v.metaobjectId}`, detail: 'category_card_update_cas_conflict', success: false });
            return casConflictResponse(current, cas.currentUpdatedAt);
          }
        }

        const fields: Array<{ key: string; value: string }> = [];
        if (v.title !== undefined) fields.push({ key: 'title', value: v.title });
        if (v.description !== undefined) fields.push({ key: 'description', value: v.description });
        if (v.priceFrom !== undefined) fields.push({ key: 'price_from', value: String(v.priceFrom) });
        if (v.image !== undefined) fields.push({ key: 'image', value: v.image });
        if (v.linkUrl !== undefined) fields.push({ key: 'link_url', value: v.linkUrl });
        if (v.sortOrder !== undefined) fields.push({ key: 'display_order', value: String(v.sortOrder) });
        if (v.isActive !== undefined) fields.push({ key: 'is_active', value: String(v.isActive) });

        // patch 0026: file_reference は GID しか受け付けないため、URL→GID 変換を挟む。
        const imgNotes = await normalizeFileReferenceField(client, fields, 'image', v.title || 'category_card');
        const result = await client.updateMetaobject(v.metaobjectId, fields);
        auditLog({ action: 'settings_change', role, resource: `metaobject/${v.metaobjectId}`, detail: `category_card_update${imgNotes.length ? '; ' + imgNotes.join('; ') : ''}`, success: true });
        return data({ success: true, metaobject: result, imageNotes: imgNotes });
      }

      case 'delete': {
        const role = requirePermission(session, 'products.edit');
        const result = await client.deleteMetaobject(v.metaobjectId);
        auditLog({ action: 'settings_change', role, resource: `metaobject/${v.metaobjectId}`, detail: 'category_card_delete', success: result });
        return data({ success: result });
      }

      default:
        return data({ error: '不明なアクションです' }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `カテゴリカード操作失敗: ${msg}` }, { status: 500 });
  }
}

function fieldsToMap(fields: Array<{ key: string; value: string }>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of fields) m[f.key] = f.value;
  return m;
}
