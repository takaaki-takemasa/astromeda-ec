/**
 * Admin API — Quick Actions エンドポイント
 *
 * GET  /api/admin/quick-actions          → アクション一覧取得
 * POST /api/admin/quick-actions          → アクション実行
 *
 * ダッシュボードからワンクリックでエージェントタスクを実行する。
 */

import {data} from 'react-router';
import type {Route} from './+types/api.admin.quick-actions';
import {QuickActionSchema} from '~/lib/api-schemas';
import {requirePermission} from '~/lib/rbac';
import {auditLog} from '~/lib/audit-log';
import {AppSession} from '~/lib/session';
import {verifyCsrfForAdmin} from '~/lib/csrf-middleware';

export async function loader({request, context}: Route.LoaderArgs) {
  const {verifyAdminAuth} = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  try {
    // RBAC: agents.control permission required
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'agents.control');
    auditLog({action: 'api_access', role, resource: 'api/admin/quick-actions [GET]', success: true});
    const {getQuickActions, setBridgeEnv} = await import('~/lib/agent-bridge');
    setBridgeEnv(context.env as unknown as Record<string, string | undefined>);
    const actions = getQuickActions();

    return data(
      {actions, timestamp: Date.now()},
      {headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}},
    );
  } catch (error) {
    return data(
      {actions: [], error: 'Failed to load quick actions', timestamp: Date.now()},
      {status: 500, headers: {'Content-Type': 'application/json'}},
    );
  }
}

export async function action({request, context}: Route.ActionArgs) {
  const csrfError = await verifyCsrfForAdmin(request, context.env);
  if (csrfError) return csrfError;

  const {verifyAdminAuth} = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  if (request.method !== 'POST') {
    return data({error: 'Method not allowed'}, {status: 405});
  }

  try {
    // RBAC: agents.control permission required
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'agents.control');
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({error: 'Invalid JSON body'}, {status: 400});
    }

    const validation = QuickActionSchema.safeParse(rawBody);
    if (!validation.success) {
      return data({
        error: '入力値が無効です',
        details: validation.error.errors.map(e => e.message),
      }, {status: 400});
    }

    const {actionId, params} = validation.data;

    const {executeQuickAction, setBridgeEnv} = await import('~/lib/agent-bridge');
    setBridgeEnv(context.env as unknown as Record<string, string | undefined>);

    const result = await executeQuickAction(actionId, params);

    return data(result, {
      headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
    });
  } catch (error) {
    console.error('[quick-actions] Error:', error);
    return data(
      {
        success: false,
        error: 'アクション実行中にエラーが発生しました',
        timestamp: Date.now(),
      },
      {status: 500, headers: {'Content-Type': 'application/json'}},
    );
  }
}
