/**
 * Admin API — 承認キュー管理
 *
 * GET  /api/admin/approvals         → 承認待ち一覧 + 統計
 * POST /api/admin/approvals         → 承認/却下アクション
 *
 * 医学メタファー: 前頭前皮質（Prefrontal Cortex）への入力と出力
 * AIが「これをやっていいですか？」と聞き、人間が「OK/NG」を返す。
 * これは脳の意思決定回路そのもの。
 *
 * 非エンジニア向け: ダッシュボードの「承認待ち」タブに表示される
 * リクエストを「承認」「却下」するためのAPI。
 */

import { data } from 'react-router';
import { ApprovalActionSchema } from '~/lib/api-schemas';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

export async function loader({ request, context }: { request: Request; context: { env: Env } }) {
  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  try {
    // RBAC: approvals.view permission required
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'approvals.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/approvals [GET]', success: true });
    const { getApprovalQueue } = await import('../../agents/core/approval-queue.js');
    const queue = getApprovalQueue();

    // 期限切れ処理を先に実行
    const expiredCount = await queue.processExpired();

    const pending = await queue.getPendingRequests();
    const stats = await queue.getStats();
    const all = await queue.getAllRequests();

    // 直近の処理済み（承認/却下/期限切れ）最新20件
    const recent = all
      .filter(r => r.status !== 'pending')
      .sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0))
      .slice(0, 20);

    return data({
      success: true,
      pending,
      recent,
      stats,
      expiredProcessed: expiredCount,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[approvals API] Error:', error);
    return data({
      success: false,
      error: '承認キューの取得に失敗しました',
      pending: [],
      recent: [],
      stats: { pending: 0, approved: 0, rejected: 0, expired: 0, autoApproved: 0, avgResponseTimeMs: 0 },
    });
  }
}

export async function action({ request, context }: { request: Request; context: { env: Env } }) {
  const csrfError = await verifyCsrfForAdmin(request, context.env);
  if (csrfError) return csrfError;

  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  try {
    // RBAC: approvals.decide permission required
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'approvals.decide');

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = ApprovalActionSchema.safeParse(rawBody);
    if (!validation.success) {
      return data({
        success: false,
        error: '入力値が無効です',
        details: validation.error.errors.map(e => e.message),
      }, { status: 400 });
    }

    const { requestId, decision, reason } = validation.data;

    const { getApprovalQueue } = await import('../../agents/core/approval-queue.js');
    const queue = getApprovalQueue();

    let result;
    if (decision === 'approve') {
      result = await queue.approve(requestId, 'owner');
    } else {
      result = await queue.reject(requestId, reason || '', 'owner');
    }

    auditLog({
      action: 'approval_decide',
      role,
      resource: requestId,
      detail: `decision=${decision}`,
      success: !!result,
    });

    if (!result) {
      return data({ success: false, error: 'リクエストが見つからないか、既に処理済みです' }, { status: 404 });
    }

    // FeedbackCollectorに記録（学習データ）
    try {
      const { getFeedbackCollector } = await import('../../agents/core/feedback-collector.js');
      const fc = getFeedbackCollector();
      fc.recordHumanApproval(result.agentId, result.action, decision === 'approve', {
        decision,
        reason,
      });
    } catch {
      // FeedbackCollector未初期化は無視
    }

    return data({
      success: true,
      request: result,
    });
  } catch (error) {
    console.error('[approvals API] Action error:', error);
    return data({
      success: false,
      error: '承認処理中にエラーが発生しました',
    }, { status: 500 });
  }
}
