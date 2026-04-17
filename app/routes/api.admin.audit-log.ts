/**
 * 監査ログ取得API — GET /api/admin/audit-log
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.audit-log';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { auditLog, getAuditLog, getAuditLogByAction, type AuditAction } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';

const AUDIT_LOG_DEFAULT_LIMIT = 100;
const AUDIT_LOG_MAX_LIMIT = 500;

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.audit-log', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  try {
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const sharedSession = (context as unknown as { session?: AppSession }).session;
    const session = sharedSession ?? await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]);

    const { requirePermission } = await import('~/lib/rbac');
    const role = requirePermission(session, 'products.view');

    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(url.searchParams.get('limit')) || AUDIT_LOG_DEFAULT_LIMIT, 1),
      AUDIT_LOG_MAX_LIMIT,
    );
    const actionFilter = url.searchParams.get('action') as AuditAction | null;

    const entries = actionFilter
      ? getAuditLogByAction(actionFilter, limit)
      : getAuditLog(limit);

    auditLog({
      action: 'api_access',
      role,
      resource: `api/admin/audit-log${actionFilter ? `?action=${actionFilter}` : ''}`,
      success: true,
    });

    return data({
      success: true,
      entries,
      total: entries.length,
      limit,
      action: actionFilter,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data(
      { success: false, error: `監査ログ取得に失敗しました: ${msg}` },
      { status: 500 },
    );
  }
}
