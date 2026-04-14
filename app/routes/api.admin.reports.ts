/**
 * レポート閲覧API — L15感覚統合（データ分析可視化）
 *
 * DataAnalyst / InsightAgent / ConversionAgent の出力をCEOが閲覧するためのAPI
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.reports';
import { setBridgeEnv, ensureInitialized } from '~/lib/agent-bridge';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';

interface RegisteredAgent {
  id: string;
  getState?: () => Record<string, unknown>;
}

interface ReportData {
  generatedAt?: number;
  [key: string]: unknown;
}

interface InsightData {
  impact?: 'high' | 'medium' | 'low';
  generatedAt?: number;
  [key: string]: unknown;
}

interface FunnelData {
  steps: Array<{ step: number; name: string; users: number; conversionRate: number; dropoffRate: number }>;
  overallConversionRate?: number;
  note?: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  try {
    // 免疫チェック: 認証なしアクセスを遮断
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const auth = await verifyAdminAuth(request, (context as unknown as { env: Env }).env);
    if (!auth.authenticated) return auth.response;

    // RBAC: analytics.view permission required
    const session = await AppSession.init(request, [(context as unknown as { env: Env }).env.SESSION_SECRET]);
    const role = requirePermission(session, 'analytics.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/reports [GET]', success: true });

    setBridgeEnv((context as unknown as { env: Env }).env || {});
    await ensureInitialized();

    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'all';

    const { getRegisteredAgents } = await import('../../agents/registration/agent-registration.js');
    const agents = (getRegisteredAgents?.() || []) as RegisteredAgent[];

    const dataAnalyst = agents.find((a: RegisteredAgent) => a.id === 'data-analyst');
    const insightAgent = agents.find((a: RegisteredAgent) => a.id === 'insight-agent');
    const conversionAgent = agents.find((a: RegisteredAgent) => a.id === 'conversion-agent');

    let reports: ReportData[] = [];
    let insights: InsightData[] = [];
    let funnel: FunnelData | null = null;
    let forecast: unknown = null;

    // DataAnalyst レポート
    if (dataAnalyst?.getState) {
      const state = dataAnalyst.getState() as Record<string, unknown>;
      if ((state.reportHistory as Map<string, unknown> | undefined)?.values) {
        reports = Array.from((state.reportHistory as Map<string, unknown>).values());
      }
    }

    // InsightAgent インサイト
    if (insightAgent?.getState) {
      const state = insightAgent.getState() as Record<string, unknown>;
      if ((state.insights as Map<string, unknown> | undefined)?.values) insights = Array.from((state.insights as Map<string, unknown>).values());
    }

    // ConversionAgent ファネル
    if (conversionAgent?.getState) {
      const state = conversionAgent.getState();
      if (state.lastFunnel) funnel = state.lastFunnel;
    }

    // ファネルフォールバック（値0 — エージェント未起動時は「データ収集中」をUIで表示）
    if (!funnel) {
      funnel = {
        steps: [
          { step: 1, name: 'サイト訪問', users: 0, conversionRate: 0, dropoffRate: 0 },
          { step: 2, name: '商品閲覧', users: 0, conversionRate: 0, dropoffRate: 0 },
          { step: 3, name: 'カート追加', users: 0, conversionRate: 0, dropoffRate: 0 },
          { step: 4, name: '購入完了', users: 0, conversionRate: 0, dropoffRate: 0 },
        ],
        overallConversionRate: 0,
        isFallback: true,
        note: 'エージェント未起動 — 実データはConversionAgent稼働後に自動更新',
      };
    }

    // インサイトフォールバック（空配列 — ハードコードインサイトは削除）
    // InsightAgentが起動すれば実データが入る

    return data({
      success: true,
      reports: reports.sort((a: ReportData, b: ReportData) => (b.generatedAt || 0) - (a.generatedAt || 0)),
      insights: insights.sort((a: InsightData, b: InsightData) => {
        const impactOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
        return (impactOrder[b.impact || ''] || 0) - (impactOrder[a.impact || ''] || 0);
      }),
      funnel,
      forecast,
      agentStatus: {
        dataAnalyst: !!dataAnalyst,
        insightAgent: !!insightAgent,
        conversionAgent: !!conversionAgent,
      },
    });
  } catch (error) {
    return data({
      success: true,
      reports: [],
      insights: [],
      funnel: null,
      forecast: null,
      agentStatus: { dataAnalyst: false, insightAgent: false, conversionAgent: false },
    });
  }
}
