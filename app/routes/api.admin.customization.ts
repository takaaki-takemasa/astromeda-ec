/**
 * カスタマイズオプション管理API — CMS Phase C
 *
 * GET:  Metaobject「astromeda_custom_option」から全オプション取得
 * POST: オプション create / update / delete
 *
 * Metaobject 定義は api/admin/metaobject-setup で一括作成（本ファイルからは作成しない）
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC → AuditLog → CSRF(POST) → Zod
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.customization';
import { z } from 'zod';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

// ── Metaobject 型名（metaobject-setup.ts と整合） ──
const METAOBJECT_TYPE = 'astromeda_custom_option';

// ── Zod スキーマ ──
const safeString = (maxLen: number = 500) =>
  z.string().max(maxLen).refine(
    (s) => !/<[^>]*>/g.test(s),
    { message: 'HTMLタグは使用できません' },
  );

const ChoiceItemSchema = z.object({
  value: safeString(500),
  label: safeString(500),
}).strict();

const CustomizationActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    handle: safeString(100),
    name: safeString(255),
    // Sprint 6 Gap 2: choices は create 時に未入力を許容（後で update で追加可）
    choices: z.array(ChoiceItemSchema).max(50).optional().default([]),
    category: safeString(100).optional().default('general'),
    appliesToTags: safeString(500).optional().default(''),
    isRequired: z.boolean().optional().default(false),
    sortOrder: z.number().int().min(0).max(999).optional().default(0),
  }).strict(),
  z.object({
    action: z.literal('update'),
    metaobjectId: z.string().min(1),
    name: safeString(255).optional(),
    choices: z.array(ChoiceItemSchema).min(1).max(50).optional(),
    category: safeString(100).optional(),
    appliesToTags: safeString(500).optional(),
    isRequired: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
  }).strict(),
  z.object({
    action: z.literal('delete'),
    metaobjectId: z.string().min(1),
  }).strict(),
]);

// ── GET: カスタマイズオプション一覧 ──

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.customization', RATE_LIMIT_PRESETS.admin);
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
    auditLog({ action: 'api_access', role, resource: 'api/admin/customization [GET]', success: true });

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    const metaobjects = await client.getMetaobjects(METAOBJECT_TYPE, 100);

    const options = metaobjects.map((mo) => {
      const f = fieldsToMap(mo.fields);
      return {
        id: mo.id,
        handle: mo.handle,
        name: f['name'] || '',
        category: f['category'] || 'general',
        choices: safeJsonParse(f['choices_json'], [] as Array<{ value: string; label: string }>),
        appliesToTags: f['applies_to_tags'] || '',
        isRequired: f['is_required'] === 'true',
        sortOrder: parseInt(f['display_order'] || '0', 10),
      };
    });

    options.sort((a, b) => a.sortOrder - b.sortOrder);

    return data({ success: true, options, total: options.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `カスタマイズオプション取得失敗: ${msg}` }, { status: 500 });
  }
}

// ── POST: CRUD操作 ──

export async function action({ request, context }: Route.ActionArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.customization', RATE_LIMIT_PRESETS.admin);
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

    const validation = CustomizationActionSchema.safeParse(rawBody);
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
          { key: 'name', value: v.name },
          { key: 'category', value: v.category },
          { key: 'choices_json', value: JSON.stringify(v.choices) },
          { key: 'display_order', value: String(v.sortOrder) },
          { key: 'is_required', value: String(v.isRequired) },
          { key: 'applies_to_tags', value: v.appliesToTags },
        ];

        const result = await client.createMetaobject(METAOBJECT_TYPE, v.handle, fields);
        auditLog({ action: 'customization_create', role, resource: `metaobject/${result.id}`, success: true });
        return data({ success: true, metaobject: result });
      }

      case 'update': {
        const role = requirePermission(session, 'products.edit');
        const fields: Array<{ key: string; value: string }> = [];
        if (v.name !== undefined) fields.push({ key: 'name', value: v.name });
        if (v.category !== undefined) fields.push({ key: 'category', value: v.category });
        if (v.choices !== undefined) fields.push({ key: 'choices_json', value: JSON.stringify(v.choices) });
        if (v.sortOrder !== undefined) fields.push({ key: 'display_order', value: String(v.sortOrder) });
        if (v.isRequired !== undefined) fields.push({ key: 'is_required', value: String(v.isRequired) });
        if (v.appliesToTags !== undefined) fields.push({ key: 'applies_to_tags', value: v.appliesToTags });

        const result = await client.updateMetaobject(v.metaobjectId, fields);
        auditLog({ action: 'customization_update', role, resource: `metaobject/${v.metaobjectId}`, success: true });
        return data({ success: true, metaobject: result });
      }

      case 'delete': {
        const role = requirePermission(session, 'products.delete');
        const result = await client.deleteMetaobject(v.metaobjectId);
        auditLog({ action: 'customization_delete', role, resource: `metaobject/${v.metaobjectId}`, success: result });
        return data({ success: result });
      }

      default:
        return data({ error: '不明なアクションです' }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `カスタマイズ操作失敗: ${msg}` }, { status: 500 });
  }
}

// ── ヘルパー ──

function fieldsToMap(fields: Array<{ key: string; value: string }>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of fields) m[f.key] = f.value;
  return m;
}

function safeJsonParse<T>(str: string | undefined, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}
