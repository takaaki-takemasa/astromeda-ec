/**
 * Admin API — 商品ランキングエンドポイント
 *
 * GET /api/admin/product-ranking?days=30&limit=20
 * Shopify Admin APIから注文データを集計し、売上ランキングを返す
 *
 * 医学メタファー: 臓器パフォーマンス評価
 * 各商品（臓器）がどれだけの「血流」（売上）を生み出しているかを評価。
 * 高パフォーマンス臓器を強化し、低機能臓器は治療（改善）を検討する。
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.product-ranking';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';

interface RankedProduct {
  rank: number;
  productTitle: string;
  handle: string;
  totalQuantity: number;
  totalRevenue: number;
  orderCount: number;
  avgPrice: number;
  imageUrl: string | null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.product-ranking', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  try {
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'analytics.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/product-ranking [GET]', success: true });

    const url = new URL(request.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30'), 1), 90);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20'), 1), 100);

    const { setBridgeEnv } = await import('~/lib/agent-bridge');
    setBridgeEnv(context.env as unknown as Record<string, string | undefined>);

    const { getAdminClient } = await import('../../agents/core/shopify-admin.js');
    const client = getAdminClient();

    if (!client?.available) {
      return data({
        success: false,
        error: 'Shopify Admin API未設定',
        rankings: [],
        period: `${days}日間`,
        total: 0,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // 指定期間の注文から商品別売上を集計
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const orders = await client.getRecentOrders(250, `created_at:>='${since}'`);

    // 商品別集計マップ
    const productMap = new Map<string, {
      title: string;
      handle: string;
      totalQuantity: number;
      totalRevenue: number;
      orderIds: Set<string>;
      imageUrl: string | null;
      prices: number[];
    }>();

    for (const order of orders) {
      for (const item of (order.lineItems?.nodes || [])) {
        const handle = item.variant?.product?.handle || 'unknown';
        const existing = productMap.get(handle);

        const price = parseFloat(item.variant?.price || '0');
        const revenue = price * item.quantity;

        if (existing) {
          existing.totalQuantity += item.quantity;
          existing.totalRevenue += revenue;
          existing.orderIds.add(order.id);
          existing.prices.push(price);
        } else {
          productMap.set(handle, {
            title: item.title,
            handle,
            totalQuantity: item.quantity,
            totalRevenue: revenue,
            orderIds: new Set([order.id]),
            imageUrl: null,
            prices: [price],
          });
        }
      }
    }

    // ランキング生成（売上金額降順）
    const rankings: RankedProduct[] = Array.from(productMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit)
      .map((p, i) => ({
        rank: i + 1,
        productTitle: p.title,
        handle: p.handle,
        totalQuantity: p.totalQuantity,
        totalRevenue: Math.round(p.totalRevenue),
        orderCount: p.orderIds.size,
        avgPrice: p.prices.length > 0 ? Math.round(p.prices.reduce((a, b) => a + b, 0) / p.prices.length) : 0,
        imageUrl: p.imageUrl,
      }));

    return data({
      success: true,
      rankings,
      period: `${days}日間`,
      total: productMap.size,
      totalRevenue: Math.round(Array.from(productMap.values()).reduce((sum, p) => sum + p.totalRevenue, 0)),
      totalOrders: orders.length,
      fetchedAt: new Date().toISOString(),
    }, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('[product-ranking API] Error:', error);
    return data({
      success: false,
      error: '商品ランキングの取得に失敗しました',
      rankings: [],
      period: '30日間',
      total: 0,
    }, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}
