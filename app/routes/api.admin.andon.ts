/**
 * Admin API — Andon Cord 操作エンドポイント
 *
 * POST /api/admin/andon
 * Body: { action: 'pull' | 'clear', reason: string }
 *
 * Commander経由で全Agentの緊急停止/再開を制御する
 */

import {data} from 'react-router';
import type {Route} from './+types/api.admin.andon';
import {AndonActionSchema} from '~/lib/api-schemas';
import {requirePermission} from '~/lib/rbac';
import {auditLog} from '~/lib/audit-log';
import {AppSession} from '~/lib/session';
import {verifyCsrfForAdmin} from '~/lib/csrf-middleware';

// GET: 現在のAndon状態＋アクティブアラート取得
export async function loader({request, context}: Route.LoaderArgs) {
  const {verifyAdminAuth} = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  try {
    const {setBridgeEnv, getAdminStatus} = await import('~/lib/agent-bridge');
    setBridgeEnv(context.env as unknown as Record<string, string | undefined>);
    const status = await getAdminStatus();

    // CircuitBreakerの状態からアラート生成
    const alerts: Array<{type: string; message: string; timestamp: number; severity: 'critical' | 'warning' | 'info'}> = [];

    if (status.system.andonStatus === 'red') {
      alerts.push({type: 'andon', message: 'Andon発動中 — 全Agent緊急停止', timestamp: Date.now(), severity: 'critical'});
    }
    if (status.agents.error > 0) {
      alerts.push({type: 'agent', message: `${status.agents.error}体のAgentがエラー状態`, timestamp: Date.now(), severity: 'warning'});
    }
    if (status.bus.deadLetters > 0) {
      alerts.push({type: 'deadletter', message: `${status.bus.deadLetters}件の未処理メッセージ`, timestamp: Date.now(), severity: 'warning'});
    }

    return data({
      andonStatus: status.system.andonStatus,
      alerts,
      total: alerts.length,
    }, {headers: {'Cache-Control': 'no-store'}});
  } catch {
    return data({
      andonStatus: 'yellow',
      alerts: [],
      total: 0,
    }, {headers: {'Cache-Control': 'no-store'}});
  }
}

export async function action({request, context}: Route.ActionArgs) {
  const csrfError = await verifyCsrfForAdmin(request, context.env);
  if (csrfError) return csrfError;

  const {verifyAdminAuth} = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  // Zodスキーマによるリクエストボディ検証（S-04 免疫受容体）
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return data({error: 'Invalid JSON body'}, {status: 400});
  }

  const validation = AndonActionSchema.safeParse(rawBody);
  if (!validation.success) {
    return data({error: '入力値が無効です', details: validation.error.errors.map(e => e.message)}, {status: 400});
  }

  const {action: andonAction, reason} = validation.data;

  try {
    // RBAC: andon.clear permission required (andon.view is implicit)
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const permission = andonAction === 'clear' ? 'andon.clear' : 'andon.view';
    const role = requirePermission(session, permission);
    const {toggleAndonCord} = await import('~/lib/agent-bridge');
    const result = await toggleAndonCord(andonAction, reason);

    auditLog({
      action: andonAction === 'pull' ? 'andon_pull' : 'andon_clear',
      role,
      resource: 'andon-cord',
      detail: reason,
      success: result.success === true,
    });

    return data(result, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('[API admin/andon] Error:', error);
    return data(
      {success: false, error: 'Internal error'},
      {status: 500},
    );
  }
}
