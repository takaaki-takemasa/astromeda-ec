/**
 * Admin API — 顧客LTVエンドポイント
 *
 * GET /api/admin/customer-ltv?days=90&limit=20
 * Shopify Admin APIから顧客別注文履歴を集計し、LTV（顧客生涯価値）を算出
 *
 * 医学メタファー: 患者カルテ（長期健康記録）
 * 各顧客の「生涯の診療記録」（購入履歴）から、
 * 長期的な貢献度（LTV）と再来院率（リピート率）を評価する。
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.customer-ltv';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';

interface CustomerLTV {
  customerId: string;
  email: string | null;
  totalOrders: number;
  totalSpent: number;
  avgOrderValue: number;
  firstOrderDate: string;
  lastOrderDate: string;
  daysSinceLastOrder: number;
  isRepeat: boolean;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.customer-ltv', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  try {
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'analytics.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/customer-ltv [GET]', success: true });

    const url = new URL(request.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '90'), 1), 365);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20'), 1), 100);

    const { setBridgeEnv } = await import('~/lib/agent-bridge');
    setBridgeEnv(context.env as unknown as Record<string, string | undefined>);

    const { getAdminClient } = await import('../../agents/core/shopify-admin.js');
    const client = getAdminClient();

    if (!client?.available) {
      return data({
        success: false,
        error: 'Shopify Admin API未設定',
        customers: [],
        summary: { totalCustomers: 0, avgLTV: 0, repeatRate: 0, topCustomerSpent: 0 },
        period: `${days}日間`,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Shopify Admin API: 顧客データを注文数降順で取得
    const gql = `
      query TopCustomers($first: Int!) {
        customers(first: $first, sortKey: TOTAL_SPENT, reverse: true) {
          nodes {
            id
            email
            ordersCount
            totalSpentV2 { amount currencyCode }
            firstOrder: orders(first: 1, sortKey: CREATED_AT) {
              nodes { createdAt }
            }
            lastOrder: orders(first: 1, sortKey: CREATED_AT, reverse: true) {
              nodes { createdAt }
            }
          }
        }
      }
    `;

    let customers: CustomerLTV[] = [];
    let totalCustomers = 0;
    let repeatCustomers = 0;
    let totalSpentAll = 0;

    try {
      const result = await client.query<{
        customers: {
          nodes: Array<{
            id: string;
            email: string | null;
            ordersCount: string;
            totalSpentV2: { amount: string; currencyCode: string };
            firstOrder: { nodes: Array<{ createdAt: string }> };
            lastOrder: { nodes: Array<{ createdAt: string }> };
          }>;
        };
      }>(gql, { first: 250 });

      const nodes = result.customers?.nodes || [];
      const now = Date.now();

      for (const node of nodes) {
        const orderCount = parseInt(node.ordersCount || '0');
        const totalSpent = parseFloat(node.totalSpentV2?.amount || '0');
        const firstOrderDate = node.firstOrder?.nodes?.[0]?.createdAt || '';
        const lastOrderDate = node.lastOrder?.nodes?.[0]?.createdAt || '';

        const daysSinceLastOrder = lastOrderDate
          ? Math.floor((now - new Date(lastOrderDate).getTime()) / 86400000)
          : 999;

        // 期間フィルタ: 最終注文が指定期間内の顧客のみ
        if (daysSinceLastOrder > days && days < 365) continue;

        const isRepeat = orderCount >= 2;
        totalCustomers++;
        totalSpentAll += totalSpent;
        if (isRepeat) repeatCustomers++;

        customers.push({
          customerId: node.id,
          email: node.email,
          totalOrders: orderCount,
          totalSpent: Math.round(totalSpent),
          avgOrderValue: orderCount > 0 ? Math.round(totalSpent / orderCount) : 0,
          firstOrderDate,
          lastOrderDate,
          daysSinceLastOrder,
          isRepeat,
        });
      }
    } catch {
      // Customer API利用不可時はフォールバック
    }

    // LTV降順でソート
    customers.sort((a, b) => b.totalSpent - a.totalSpent);
    const topCustomers = customers.slice(0, limit);

    const avgLTV = totalCustomers > 0 ? Math.round(totalSpentAll / totalCustomers) : 0;
    const repeatRate = totalCustomers > 0
      ? Math.round((repeatCustomers / totalCustomers) * 10000) / 100
      : 0;

    return data({
      success: true,
      customers: topCustomers,
      summary: {
        totalCustomers,
        avgLTV,
        repeatRate,
        topCustomerSpent: topCustomers[0]?.totalSpent || 0,
        repeatCustomers,
      },
      period: `${days}日間`,
      fetchedAt: new Date().toISOString(),
    }, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('[customer-ltv API] Error:', error);
    return data({
      success: false,
      error: '顧客LTVデータの取得に失敗しました',
      customers: [],
      summary: { totalCustomers: 0, avgLTV: 0, repeatRate: 0, topCustomerSpent: 0 },
      period: '90日間',
    }, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}
