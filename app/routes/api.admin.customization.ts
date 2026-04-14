/**
 * カスタマイズオプション管理API — CMS Phase C
 *
 * GET:  メタオブジェクト「astromeda_customization」から全オプション取得
 * POST: オプション作成 / 更新 / 削除 / 定義初期化
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

// ── メタオブジェクトタイプ名 ──
const METAOBJECT_TYPE = 'astromeda_customization';

// ── Zod スキーマ ──
const safeString = (maxLen: number = 500) =>
  z.string().max(maxLen).refine(
    (s) => !/<[^>]*>/g.test(s),
    { message: 'HTMLタグは使用できません' },
  );

const OptionItemSchema = z.object({
  value: safeString(500),
  label: safeString(500),
}).strict();

const CustomizationActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('init_definition'),
  }).strict(),
  z.object({
    action: z.literal('create'),
    handle: safeString(100),
    name: safeString(255),
    options: z.array(OptionItemSchema).min(1).max(50),
    dependsOnField: safeString(255).optional(),
    dependsOnValue: safeString(255).optional(),
    sortOrder: z.number().int().min(0).max(999).optional().default(0),
  }).strict(),
  z.object({
    action: z.literal('update'),
    metaobjectId: z.string().min(1),
    name: safeString(255).optional(),
    options: z.array(OptionItemSchema).min(1).max(50).optional(),
    dependsOnField: safeString(255).optional(),
    dependsOnValue: safeString(255).optional(),
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
      const fields: Record<string, string> = {};
      for (const f of mo.fields) {
        fields[f.key] = f.value;
      }
      return {
        id: mo.id,
        handle: mo.handle,
        name: fields['name'] || '',
        options: safeJsonParse(fields['options'], []),
        dependsOnField: fields['depends_on_field'] || null,
        dependsOnValue: fields['depends_on_value'] || null,
        sortOrder: parseInt(fields['sort_order'] || '0', 10),
      };
    });

    // ソート順で返す
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
    const validated = validation.data;

    switch (validated.action) {
      case 'init_definition': {
        const role = requirePermission(session, 'products.edit');
        const result = await client.createMetaobjectDefinition(
          METAOBJECT_TYPE,
          'Astromeda カスタマイズオプション',
          [
            { key: 'name', name: 'オプション名', type: 'single_line_text_field' },
            { key: 'options', name: 'オプション一覧 (JSON)', type: 'multi_line_text_field' },
            { key: 'depends_on_field', name: '依存フィールド', type: 'single_line_text_field' },
            { key: 'depends_on_value', name: '依存値', type: 'single_line_text_field' },
            { key: 'sort_order', name: '表示順', type: 'number_integer' },
          ],
        );
        auditLog({ action: 'customization_init', role, resource: `metaobject_definition/${METAOBJECT_TYPE}`, success: true });
        return data({ success: true, definitionId: result.id });
      }

      case 'create': {
        const role = requirePermission(session, 'products.edit');
        const fields = [
          { key: 'name', value: validated.name },
          { key: 'options', value: JSON.stringify(validated.options) },
          { key: 'sort_order', value: String(validated.sortOrder) },
        ];
        if (validated.dependsOnField) {
          fields.push({ key: 'depends_on_field', value: validated.dependsOnField });
        }
        if (validated.dependsOnValue) {
          fields.push({ key: 'depends_on_value', value: validated.dependsOnValue });
        }

        const result = await client.createMetaobject(METAOBJECT_TYPE, validated.handle, fields);
        auditLog({ action: 'customization_create', role, resource: `metaobject/${result.id}`, success: true });
        return data({ success: true, metaobject: result });
      }

      case 'update': {
        const role = requirePermission(session, 'products.edit');
        const fields: Array<{ key: string; value: string }> = [];
        if (validated.name) fields.push({ key: 'name', value: validated.name });
        if (validated.options) fields.push({ key: 'options', value: JSON.stringify(validated.options) });
        if (validated.sortOrder !== undefined) fields.push({ key: 'sort_order', value: String(validated.sortOrder) });
        if (validated.dependsOnField !== undefined) fields.push({ key: 'depends_on_field', value: validated.dependsOnField });
        if (validated.dependsOnValue !== undefined) fields.push({ key: 'depends_on_value', value: validated.dependsOnValue });

        const result = await client.updateMetaobject(validated.metaobjectId, fields);
        auditLog({ action: 'customization_update', role, resource: `metaobject/${validated.metaobjectId}`, success: true });
        return data({ success: true, metaobject: result });
      }

      case 'delete': {
        const role = requirePermission(session, 'products.delete');
        const result = await client.deleteMetaobject(validated.metaobjectId);
        auditLog({ action: 'customization_delete', role, resource: `metaobject/${validated.metaobjectId}`, success: result });
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

function safeJsonParse<T>(str: string | undefined, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}
