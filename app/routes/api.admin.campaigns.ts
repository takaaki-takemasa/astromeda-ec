/**
 * キャンペーン管理API — L15感覚統合（マーケティング可視化）
 *
 * PromotionAgent のキャンペーン・割引コードをCEOが管理するためのAPI
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.campaigns';
import { setBridgeEnv, ensureInitialized } from '~/lib/agent-bridge';
import { CampaignActionSchema } from '~/lib/api-schemas';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

interface RegisteredAgent {
  id: string;
  getState?: () => Record<string, unknown>;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.campaigns', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  try {
    // 免疫チェック: 認証なしアクセスを遮断
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const auth = await verifyAdminAuth(request, (context as unknown as { env: Env }).env);
    if (!auth.authenticated) return auth.response;

    // RBAC: products.view permission required
    const session = await AppSession.init(request, [(context as unknown as { env: Env }).env.SESSION_SECRET]);
    const role = requirePermission(session, 'products.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/campaigns [GET]', success: true });

    setBridgeEnv((context as unknown as { env: Env }).env || {});
    await ensureInitialized();

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'all';

    const { getRegisteredAgents } = await import('../../agents/registration/agent-registration.js');
    const agents = (getRegisteredAgents?.() || []) as RegisteredAgent[];
    const promotionAgent = agents.find((a: RegisteredAgent) => a.id === 'promotion-agent');

    let campaigns: Record<string, unknown>[] = [];
    let discountCodes: Record<string, unknown>[] = [];
    let saleCalendar: Record<string, unknown>[] = [];

    if (promotionAgent?.getState) {
      const state = promotionAgent.getState() as Record<string, unknown>;
      if ((state.campaigns as Map<string, unknown> | undefined)?.values) campaigns = Array.from((state.campaigns as Map<string, unknown>).values()) as Record<string, unknown>[];
      if ((state.discountCodes as Map<string, unknown> | undefined)?.values) discountCodes = Array.from((state.discountCodes as Map<string, unknown>).values()) as Record<string, unknown>[];
      if (state.saleWindows) saleCalendar = state.saleWindows as Record<string, unknown>[];
    }

    // フォールバック: 年間セールカレンダーテンプレート
    // PromotionAgentが起動すれば実際のキャンペーン計画に上書きされる
    // source: 'template' でUIが「未確定テンプレート」と識別可能
    if (saleCalendar.length === 0) {
      const year = new Date().getFullYear();
      saleCalendar = [
        { name: '新年セール', startDate: new Date(year, 0, 1).getTime(), endDate: new Date(year, 0, 7).getTime(), type: 'seasonal', discountRate: 0, source: 'template' },
        { name: '新生活応援', startDate: new Date(year, 2, 15).getTime(), endDate: new Date(year, 2, 31).getTime(), type: 'seasonal', discountRate: 0, source: 'template' },
        { name: 'GWセール', startDate: new Date(year, 4, 1).getTime(), endDate: new Date(year, 4, 6).getTime(), type: 'seasonal', discountRate: 0, source: 'template' },
        { name: '夏のボーナスセール', startDate: new Date(year, 6, 1).getTime(), endDate: new Date(year, 6, 15).getTime(), type: 'seasonal', discountRate: 0, source: 'template' },
        { name: 'お盆セール', startDate: new Date(year, 7, 10).getTime(), endDate: new Date(year, 7, 18).getTime(), type: 'seasonal', discountRate: 0, source: 'template' },
        { name: 'ブラックフライデー', startDate: new Date(year, 10, 22).getTime(), endDate: new Date(year, 10, 28).getTime(), type: 'seasonal', discountRate: 0, source: 'template' },
        { name: '年末年始セール', startDate: new Date(year, 11, 1).getTime(), endDate: new Date(year, 11, 25).getTime(), type: 'seasonal', discountRate: 0, source: 'template' },
      ];
    }

    if (status !== 'all' && campaigns.length > 0) {
      campaigns = campaigns.filter(c => c.status === status);
    }

    return data({
      success: true,
      campaigns,
      discountCodes,
      saleCalendar,
      total: campaigns.length,
      stats: {
        active: campaigns.filter((c: Record<string, unknown>) => c.status === 'active').length,
        planned: campaigns.filter((c: Record<string, unknown>) => c.status === 'planned').length,
        completed: campaigns.filter((c: Record<string, unknown>) => c.status === 'completed').length,
      },
      agentActive: !!promotionAgent,
    });
  } catch (error) {
    return data({
      success: true,
      campaigns: [],
      discountCodes: [],
      saleCalendar: [],
      total: 0,
      stats: { active: 0, planned: 0, completed: 0 },
      agentActive: false,
    });
  }
}

// POST: キャンペーン操作
export async function action({ request, context }: Route.ActionArgs) {
  const csrfError = await verifyCsrfForAdmin(request, context.env);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.campaigns', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // 免疫チェック: 認証なしアクセスを遮断
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    // RBAC: products.edit permission required
    const session = await AppSession.init(request, [contextEnv.SESSION_SECRET || '']);
    const role = requirePermission(session, 'products.edit');

    setBridgeEnv(contextEnv);
    await ensureInitialized();

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = CampaignActionSchema.safeParse(rawBody);
    if (!validation.success) {
      return data({
        error: '入力値が無効です',
        details: validation.error.errors.map(e => e.message),
      }, { status: 400 });
    }

    const { action: act, campaign, campaignId, count } = validation.data;

    const { getRegisteredAgents } = await import('../../agents/registration/agent-registration.js');
    const agents = (getRegisteredAgents?.() || []) as RegisteredAgent[];
    const promotionAgent = agents.find((a: RegisteredAgent) => a.id === 'promotion-agent');

    if (!promotionAgent?.onCommand) {
      return data({ error: 'PromotionAgentが見つかりません' }, { status: 503 });
    }

    if (act === 'create') {
      const result = await promotionAgent.onCommand({
        action: 'create_campaign',
        params: campaign || {},
      });
      return data({ success: true, result });
    }

    if (act === 'activate' || act === 'deactivate' || act === 'delete' || act === 'list') {
      const result = await promotionAgent.onCommand({
        action: `campaign_${act}`,
        params: { campaignId: campaignId || '', count },
      });
      return data({ success: true, result });
    }
  } catch (error) {
    return data({ error: '操作に失敗しました' }, { status: 500 });
  }
}
