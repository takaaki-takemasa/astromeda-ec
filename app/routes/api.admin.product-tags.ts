/**
 * 商品タグ列挙 API — patch 0098 R0
 *
 * GET: Shopify ストアに存在する商品タグ一覧＋件数推計を返す
 *   response: { success, tags: Array<{ name, productCount }> }
 *
 * 件数は products(first:250) サンプリングによる推計
 * （200 以上の商品を持つタグは productCount が実体より少ない可能性あり）
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC(products.view) → AuditLog
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.product-tags';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.product-tags', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  try {
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const session = await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]);
    const role = requirePermission(session, 'products.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/product-tags [GET]', success: true });

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    // 1) shop.productTags で全タグ列挙（最大 250 種）
    const tagNames = await client.listProductTags(250);

    // 2) products サンプリング（first:250）でタグ出現数を推計
    const sampled = await client.getProducts(250);
    const countMap = new Map<string, number>();
    for (const p of sampled) {
      for (const tag of p.tags || []) {
        countMap.set(tag, (countMap.get(tag) || 0) + 1);
      }
    }

    // 3) shop.productTags の全タグに対して件数マージ（存在しないタグは 0 件）
    const tags = tagNames.map((name) => ({
      name,
      productCount: countMap.get(name) || 0,
    }));

    // 名前順にソート（日本語 locale）
    tags.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    return data({
      success: true,
      tags,
      total: tags.length,
      sampledProductCount: sampled.length,
      note: sampled.length >= 250
        ? '商品数が 250 件を超えるため件数は最新 250 件のサンプル推計です'
        : '全商品を走査した正確な件数です',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `商品タグ取得失敗: ${msg}` }, { status: 500 });
  }
}
