/**
 * Admin API — 在庫アラートエンドポイント
 *
 * GET /api/admin/inventory-alerts?threshold=5
 * Shopify Admin APIから在庫データを取得し、低在庫商品をアラートとして返す
 *
 * 医学メタファー: 血液検査の赤血球数（在庫 = 酸素運搬能力）
 * 低在庫 = 貧血 → 即座にアラートを発し、補充（輸血）を促す
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.inventory-alerts';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';

interface InventoryAlert {
  productId: string;
  productTitle: string;
  handle: string;
  variantId: string;
  variantTitle: string;
  sku: string;
  inventoryQuantity: number;
  threshold: number;
  severity: 'critical' | 'warning' | 'info';
  imageUrl: string | null;
  price: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.inventory-alerts', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  try {
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'products.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/inventory-alerts [GET]', success: true });

    const url = new URL(request.url);
    const threshold = Math.min(Math.max(parseInt(url.searchParams.get('threshold') || '5'), 0), 100);

    const { setBridgeEnv } = await import('~/lib/agent-bridge');
    setBridgeEnv(context.env as unknown as Record<string, string | undefined>);

    const { getAdminClient } = await import('../../agents/core/shopify-admin.js');
    const client = getAdminClient();

    if (!client?.available) {
      return data({
        success: false,
        error: 'Shopify Admin API未設定',
        alerts: [],
        summary: { total: 0, critical: 0, warning: 0 },
        threshold,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Shopify Admin API: 在庫が閾値以下の商品を取得
    const products = await client.getProducts(250);

    const alerts: InventoryAlert[] = [];

    for (const product of products) {
      if (product.status !== 'ACTIVE') continue;

      for (const variant of (product.variants?.nodes || [])) {
        const qty = variant.inventoryQuantity ?? 0;
        if (qty <= threshold) {
          let severity: 'critical' | 'warning' | 'info' = 'info';
          if (qty <= 0) severity = 'critical';
          else if (qty <= Math.floor(threshold / 2)) severity = 'warning';

          alerts.push({
            productId: product.id,
            productTitle: product.title,
            handle: product.handle,
            variantId: variant.id,
            variantTitle: variant.title,
            sku: variant.sku || '',
            inventoryQuantity: qty,
            threshold,
            severity,
            imageUrl: product.featuredImage?.url || null,
            price: variant.price,
          });
        }
      }
    }

    // severity順（critical > warning > info）、同一severity内は在庫昇順
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => {
      const diff = severityOrder[a.severity] - severityOrder[b.severity];
      if (diff !== 0) return diff;
      return a.inventoryQuantity - b.inventoryQuantity;
    });

    return data({
      success: true,
      alerts: alerts.slice(0, 100),
      summary: {
        total: alerts.length,
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length,
      },
      threshold,
      fetchedAt: new Date().toISOString(),
    }, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('[inventory-alerts API] Error:', error);
    return data({
      success: false,
      error: '在庫アラートの取得に失敗しました',
      alerts: [],
      summary: { total: 0, critical: 0, warning: 0 },
      threshold: 5,
    }, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}
