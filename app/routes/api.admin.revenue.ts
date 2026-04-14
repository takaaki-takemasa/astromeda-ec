/**
 * Admin API — 売上データ手動取得
 *
 * GET /api/admin/revenue?days=7
 * Shopify Admin APIから直接売上データを取得。
 * Webhook未接続のため、ダッシュボードからの手動トリガーで代替。
 *
 * 医学メタファー: 血液検査（臨時の診断）
 * Webhook = 自律神経（常時モニタリング）が未稼働のため、
 * 手動の血液検査（API直接取得）で健康状態（売上状況）を確認。
 */

import { data } from 'react-router';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';

export async function loader({ request, context }: { request: Request; context: { env: Env } }) {
  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  const url = new URL(request.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '7'), 1), 90);

  try {
    // RBAC: revenue.view permission required
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'revenue.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/revenue [GET]', success: true });
    const { setBridgeEnv } = await import('~/lib/agent-bridge');
    setBridgeEnv(context.env as unknown as Record<string, string | undefined>);

    const { getAdminClient } = await import('../../agents/core/shopify-admin.js');
    const client = getAdminClient();

    if (!client) {
      return data({
        success: false,
        error: 'Shopify Admin APIが未設定です（PRIVATE_STOREFRONT_API_TOKEN必要）',
        mock: true,
        revenue: {
          totalRevenue: 0,
          orderCount: 0,
          averageOrderValue: 0,
          currency: 'JPY',
          isMock: true,
        },
      });
    }

    // Shopify Admin API から直接売上取得
    const summary = await client.getOrderSummary(days);

    return data({
      success: true,
      mock: false,
      period: `${days}日間`,
      revenue: {
        totalRevenue: summary.totalRevenue,
        orderCount: summary.totalOrders,
        averageOrderValue: summary.avgOrderValue,
        currency: summary.currency || 'JPY',
      },
      fetchedAt: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[revenue API] Error:', error);
    }
    return data({
      success: false,
      error: 'Shopify APIからの取得に失敗しました',
      mock: true,
      revenue: {
        totalRevenue: 0,
        orderCount: 0,
        averageOrderValue: 0,
        currency: 'JPY',
        isMock: true,
      },
    }, { status: 200 }); // UIにはデータを返す（エラーでもモック表示）
  }
}
