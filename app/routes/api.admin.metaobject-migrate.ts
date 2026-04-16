/**
 * Metaobject マイグレーション API — POST /api/admin/metaobject-migrate
 *
 * 既存の Metaobject 定義に新規フィールドを追加（既存データ保全）。
 * metaobject-setup.ts の一括作成とは別に、既存定義への差分更新を行う。
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC (settings.edit) → AuditLog
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.metaobject-migrate';
import { z } from 'zod';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

const MigrateActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('append_fields'),
    metaobjectType: z.string().min(1).max(100),
    fields: z.array(
      z.object({
        key: z.string().min(1).max(64),
        name: z.string().min(1).max(128),
        type: z.string().min(1).max(64),
      }).strict(),
    ).min(1).max(20),
  }).strict(),
  z.object({
    action: z.literal('check_definition'),
    metaobjectType: z.string().min(1).max(100),
  }).strict(),
]);

export async function action({ request, context }: Route.ActionArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.metaobject-migrate', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const sharedSession = (context as unknown as { session?: AppSession }).session;
    const session = sharedSession ?? await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]);

    const { requirePermission } = await import('~/lib/rbac');
    const role = requirePermission(session as AppSession, 'settings.edit');

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = MigrateActionSchema.safeParse(rawBody);
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
      case 'check_definition': {
        const def = await client.getMetaobjectDefinitionByType(v.metaobjectType);
        return data({
          success: true,
          exists: !!def,
          definitionId: def?.id || null,
          type: v.metaobjectType,
        });
      }

      case 'append_fields': {
        const result = await client.updateMetaobjectDefinitionAppendFields(
          v.metaobjectType,
          v.fields,
        );
        auditLog({
          action: 'settings_change',
          role,
          resource: `metaobject_definition/${v.metaobjectType}`,
          detail: `migrate: +${result.addedCount} fields (${v.fields.map((f) => f.key).join(',')})`,
          success: true,
        });
        return data({
          success: true,
          definitionId: result.id,
          addedCount: result.addedCount,
          requestedFields: v.fields.map((f) => f.key),
        });
      }

      default:
        return data({ error: '不明なアクションです' }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data(
      { success: false, error: `マイグレーション失敗: ${msg}` },
      { status: 500 },
    );
  }
}

export async function loader() {
  return data({
    message: 'POST with action=check_definition or action=append_fields',
    actions: ['check_definition', 'append_fields'],
  });
}
