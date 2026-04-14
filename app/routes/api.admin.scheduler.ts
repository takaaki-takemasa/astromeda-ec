/**
 * Admin API — スケジューラー手動トリガー
 *
 * POST /api/admin/scheduler
 * Oxygen環境ではバックグラウンドジョブが30秒制限のため、
 * スケジュール済みタスクを手動トリガーで実行。
 *
 * 医学メタファー: 強制呼吸（自律神経の手動代替）
 * 通常は自律神経（バックグラウンド）が呼吸を制御するが、
 * Oxygen制約により手動で「深呼吸」（スケジュール実行）を行う。
 *
 * GET /api/admin/scheduler — スケジュール一覧取得
 * POST /api/admin/scheduler — 指定パイプラインを手動実行
 */

import { data } from 'react-router';
import { SchedulerActionSchema } from '~/lib/api-schemas';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

export async function loader({ request, context }: { request: Request; context: { env: Env } }) {
  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  try {
    // RBAC: pipelines.view permission required
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'pipelines.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/scheduler [GET]', success: true });
    const { setBridgeEnv } = await import('~/lib/agent-bridge');
    setBridgeEnv(context.env as unknown as Record<string, string | undefined>);

    // スケジューラーから全スケジュール取得
    const { Scheduler, DEFAULT_SCHEDULES } = await import('../../agents/core/scheduler.js');

    return data({
      schedules: DEFAULT_SCHEDULES.map((s: Record<string, unknown>) => ({
        pipelineId: s.pipelineId,
        intervalMinutes: s.intervalMinutes,
        description: (s.description as string | undefined) || (s.pipelineId as string),
        enabled: s.enabled !== false,
      })),
      totalSchedules: DEFAULT_SCHEDULES.length,
      note: 'Oxygen環境では自動実行不可。手動トリガーで代替。',
    });
  } catch (error) {
    console.error('[scheduler API] Error:', error);
    return data({
      schedules: [],
      totalSchedules: 0,
      error: 'スケジュール情報の取得に失敗しました',
    });
  }
}

export async function action({ request, context }: { request: Request; context: { env: Env } }) {
  const csrfError = await verifyCsrfForAdmin(request, context.env);
  if (csrfError) return csrfError;

  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // RBAC: pipelines.execute permission required
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'pipelines.execute');
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = SchedulerActionSchema.safeParse(rawBody);
    if (!validation.success) {
      return data({
        error: '入力値が無効です',
        details: validation.error.errors.map(e => e.message),
      }, { status: 400 });
    }

    const { pipelineId } = validation.data;

    const { setBridgeEnv } = await import('~/lib/agent-bridge');
    setBridgeEnv(context.env as unknown as Record<string, string | undefined>);

    // Quick Action経由でパイプライン実行
    const { executeQuickAction } = await import('~/lib/agent-bridge');
    const result = await executeQuickAction(pipelineId);

    auditLog({
      action: 'pipeline_execute',
      role,
      resource: pipelineId,
      detail: 'manual scheduler trigger',
      success: result.success === true,
    });

    return data({
      success: true,
      pipelineId,
      result: result || { status: 'executed' },
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[scheduler API] Action error:', error);
    return data({
      success: false,
      error: 'パイプライン実行中にエラーが発生しました',
    });
  }
}
