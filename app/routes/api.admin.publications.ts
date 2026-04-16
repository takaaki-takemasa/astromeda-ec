/**
 * Shopify Publications API — Sprint 6 Gap 5
 *
 * GET: 公開チャネル一覧取得（商品公開タブのチェックボックスピッカー用）
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC → AuditLog
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.publications';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.publications', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  try {
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const sharedSession = (context as unknown as {session?: AppSession}).session;
    const session = sharedSession ?? await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]);
    const role = requirePermission(session, 'products.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/publications [GET]', success: true });

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    const publications = await client.getPublications(50);

    return data({ success: true, publications, total: publications.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `公開チャネル取得失敗: ${msg}` }, { status: 500 });
  }
}
