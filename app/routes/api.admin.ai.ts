/**
 * Admin API — AI判断ダッシュボード
 *
 * GET  /api/admin/ai          → AI使用状況 + 判断履歴 + Pipeline連携統計
 * POST /api/admin/ai          → AI判断要求（Pipeline実行判断、データ分析）
 *
 * 医学メタファー: 大脳新皮質モニター（脳波計=EEG）
 * AIBrainの思考プロセスを可視化し、判断の透明性を確保する。
 *
 * RBAC: owner/admin → 全操作可能。viewer → 閲覧のみ。
 */

import { data } from 'react-router';
import { AIActionSchema } from '~/lib/api-schemas';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

export async function loader({ request, context }: { request: Request; context: { env: Env } }) {
  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env);
  if (!auth.authenticated) return auth.response;

  try {
    // RBAC: agents.view permission required
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'agents.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/ai [GET]', success: true });
    const env = context.env;
    const { getAIBrain, setAIBrainEnv } = await import('../../agents/core/ai-brain.js');
    const { getAIPipelineBridge } = await import('../../agents/core/ai-pipeline-bridge.js');

    // API Key設定（環境変数から）
    if (env.ANTHROPIC_API_KEY) {
      setAIBrainEnv(env.ANTHROPIC_API_KEY);
    }

    const brain = getAIBrain();
    const bridge = getAIPipelineBridge();
    const usage = brain.getUsage();
    const bridgeStats = bridge.getStats();
    const recentDecisions = bridge.getDecisionHistory(undefined, 20);

    return data({
      success: true,
      ai: {
        available: brain.available,
        model: 'claude-sonnet-4-20250514',
        usage: {
          date: usage.date,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          estimatedCostUSD: Math.round(usage.estimatedCostUSD * 100) / 100,
          requestCount: usage.requestCount,
          dailyLimitUSD: 5.0,
          remainingBudget: Math.max(0, 5.0 - usage.estimatedCostUSD),
        },
      },
      pipeline: {
        totalDecisions: bridgeStats.totalDecisions,
        executeCount: bridgeStats.executeCount,
        skipCount: bridgeStats.skipCount,
        pauseCount: bridgeStats.pauseCount,
        abortCount: bridgeStats.abortCount,
        avgConfidence: Math.round(bridgeStats.avgConfidence * 100),
        approvalRequired: bridgeStats.approvalRequired,
      },
      recentDecisions: recentDecisions.map(d => ({
        pipelineId: d.pipelineId,
        stepId: d.stepId,
        action: d.action,
        reasoning: d.decision.reasoning,
        confidence: Math.round(d.decision.confidence * 100),
        riskLevel: d.decision.riskLevel,
        requiresApproval: d.decision.requiresApproval,
        timestamp: d.timestamp,
      })),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[AI API] Error:', error);
    return data({
      success: false,
      error: 'AI情報の取得に失敗しました',
      ai: { available: false },
      pipeline: {},
      recentDecisions: [],
    });
  }
}

export async function action({ request, context }: { request: Request; context: { env: Env } }) {
  const csrfError = await verifyCsrfForAdmin(request, context.env);
  if (csrfError) return csrfError;

  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env);
  if (!auth.authenticated) return auth.response;

  try {
    // RBAC: agents.control permission required
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'agents.control');
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = AIActionSchema.safeParse(rawBody);
    if (!validation.success) {
      return data({
        success: false,
        error: '入力値が無効です',
        details: validation.error.errors.map(e => e.message),
      }, { status: 400 });
    }

    const { action: aiAction, dataType, question, pipelineId } = validation.data;

    const env = context.env as Env;
    const { getAIBrain, setAIBrainEnv } = await import('../../agents/core/ai-brain.js');

    if (env.ANTHROPIC_API_KEY) {
      setAIBrainEnv(env.ANTHROPIC_API_KEY);
    }

    const brain = getAIBrain();

    switch (aiAction) {
      case 'analyze': {
        if (!question) {
          return data({ success: false, error: '分析する質問を入力してください' }, { status: 400 });
        }

        const analysis = await brain.analyze({
          agentId: 'admin-dashboard',
          data: { dataType, requestedAt: Date.now() },
          question,
        });

        return data({ success: true, analysis });
      }

      case 'assessRisk': {
        if (!pipelineId) {
          return data({ success: false, error: 'pipelineIdが必要です' }, { status: 400 });
        }

        const { getAIPipelineBridge } = await import('../../agents/core/ai-pipeline-bridge.js');
        const bridge = getAIPipelineBridge();

        // パイプライン定義をダミーで構築（実際はPipelineEngineから取得）
        return data({
          success: true,
          message: 'リスク評価にはパイプライン定義の登録が必要です',
          hint: 'PipelineEngineにパイプラインを登録してからリスク評価を実行してください',
        });
      }

      case 'getUsage': {
        const usage = brain.getUsage();
        return data({
          success: true,
          usage: {
            ...usage,
            estimatedCostUSD: Math.round(usage.estimatedCostUSD * 100) / 100,
          },
        });
      }

      default:
        return data({ success: false, error: `不明なアクション: ${aiAction}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[AI API] Action error:', error);
    return data({ success: false, error: 'AI処理中にエラーが発生しました' }, { status: 500 });
  }
}
