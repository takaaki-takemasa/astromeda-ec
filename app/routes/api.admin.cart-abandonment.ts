/**
 * Admin API — カート離脱率エンドポイント
 *
 * GET /api/admin/cart-abandonment?days=30
 * Shopify Admin APIから放棄チェックアウトを取得し、離脱率を算出
 *
 * 医学メタファー: 心臓のポンプ効率（心拍出量）
 * カート → 購入完了 = 血液が心臓から全身へ送られるプロセス
 * 離脱 = 血液が送り出されずに滞留（うっ血）→ ECの健全性指標
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.cart-abandonment';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';

interface AbandonedCheckout {
  id: string;
  createdAt: string;
  totalPrice: string;
  currencyCode: string;
  lineItemCount: number;
  customerEmail: string | null;
  recoveryUrl: string | null;
  completedAt: string | null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.cart-abandonment', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  try {
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'analytics.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/cart-abandonment [GET]', success: true });

    const url = new URL(request.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30'), 1), 90);

    const { setBridgeEnv } = await import('~/lib/agent-bridge');
    setBridgeEnv(context.env as unknown as Record<string, string | undefined>);

    const { getAdminClient } = await import('../../agents/core/shopify-admin.js');
    const client = getAdminClient();

    if (!client?.available) {
      return data({
        success: false,
        error: 'Shopify Admin API未設定',
        abandonmentRate: 0,
        totalCheckouts: 0,
        abandonedCheckouts: 0,
        completedCheckouts: 0,
        abandonedValue: 0,
        recentAbandoned: [],
        period: `${days}日間`,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Shopify Admin API: 放棄チェックアウトを取得
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const gql = `
      query AbandonedCheckouts($first: Int!, $query: String) {
        abandonedCheckouts(first: $first, sortKey: CREATED_AT, reverse: true, query: $query) {
          nodes {
            id
            createdAt
            totalPriceSet { presentmentMoney { amount currencyCode } }
            lineItems(first: 5) { nodes { title quantity } }
            customer { email }
          }
        }
      }
    `;

    let abandonedList: AbandonedCheckout[] = [];
    let totalAbandoned = 0;
    let abandonedValue = 0;

    try {
      const result = await client.query<{
        abandonedCheckouts: {
          nodes: Array<{
            id: string;
            createdAt: string;
            totalPriceSet: { presentmentMoney: { amount: string; currencyCode: string } };
            lineItems: { nodes: Array<{ title: string; quantity: number }> };
            customer: { email: string } | null;
          }>;
        };
      }>(gql, { first: 250, query: `created_at:>='${since}'` });

      const nodes = result.abandonedCheckouts?.nodes || [];
      totalAbandoned = nodes.length;

      for (const node of nodes) {
        const amount = parseFloat(node.totalPriceSet?.presentmentMoney?.amount || '0');
        abandonedValue += amount;
      }

      // 最新20件をリスト化
      abandonedList = nodes.slice(0, 20).map(node => ({
        id: node.id,
        createdAt: node.createdAt,
        totalPrice: node.totalPriceSet?.presentmentMoney?.amount || '0',
        currencyCode: node.totalPriceSet?.presentmentMoney?.currencyCode || 'JPY',
        lineItemCount: node.lineItems?.nodes?.length || 0,
        customerEmail: node.customer?.email || null,
        recoveryUrl: null,
        completedAt: null,
      }));
    } catch {
      // abandonedCheckouts APIが利用不可の場合（プランによる制限等）
    }

    // 完了注文数を取得して離脱率を算出
    const orderSummary = await client.getOrderSummary(days);
    const completedCheckouts = orderSummary.totalOrders;
    const totalCheckouts = completedCheckouts + totalAbandoned;
    const abandonmentRate = totalCheckouts > 0
      ? Math.round((totalAbandoned / totalCheckouts) * 10000) / 100
      : 0;

    return data({
      success: true,
      abandonmentRate,
      totalCheckouts,
      abandonedCheckouts: totalAbandoned,
      completedCheckouts,
      abandonedValue: Math.round(abandonedValue),
      recentAbandoned: abandonedList,
      period: `${days}日間`,
      fetchedAt: new Date().toISOString(),
    }, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('[cart-abandonment API] Error:', error);
    return data({
      success: false,
      error: 'カート離脱データの取得に失敗しました',
      abandonmentRate: 0,
      totalCheckouts: 0,
      abandonedCheckouts: 0,
      completedCheckouts: 0,
      abandonedValue: 0,
      recentAbandoned: [],
      period: '30日間',
    }, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}
