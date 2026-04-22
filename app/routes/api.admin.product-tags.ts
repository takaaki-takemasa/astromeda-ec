/**
 * 商品タグ列挙 API — patch 0098 R0
 *
 * GET: Shopify ストアに存在する商品タグ一覧＋件数推計を返す
 *   response: { success, tags: Array<{ name, productCount }> }
 *
 * 件数は products(first:250) サンプリングによる推計
 * （200 以上の商品を持つタグは productCount が実体より少ない可能性あり）
 *
 * patch 0117: クエリパラメータ `?excludePulldown=true` でプルダウン部品マーカー
 *   タグ (pulldown-component / globo-product-options) を結果から除外する。
 *   商品編集タブ等、製品文脈の TagPicker から「部品タグ」が混入するのを防ぐ。
 *   既定 false で後方互換。
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC(products.view) → AuditLog
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.product-tags';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { PULLDOWN_COMPONENT_TAG } from '~/lib/pulldown-classifier';

/**
 * patch 0117: 製品文脈の TagPicker から除外するパーツマーカータグ。
 * - PULLDOWN_COMPONENT_TAG ('pulldown-component'): patch 0103 で 494 商品に付与した canonical マーカー
 * - 'globo-product-options': 旧 Globo Options 由来のレガシーマーカー (282 件)
 */
const PULLDOWN_MARKER_TAGS = new Set<string>([
  PULLDOWN_COMPONENT_TAG,
  'globo-product-options',
]);

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

    // patch 0117: ?excludePulldown=true で部品マーカータグ (pulldown-component / globo-product-options)
    // を結果から除外する。製品出品 UI で「部品タグ」が候補に混入しないようにするため。
    const url = new URL(request.url);
    const excludePulldown = url.searchParams.get('excludePulldown') === 'true';

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
    let tags = tagNames.map((name) => ({
      name,
      productCount: countMap.get(name) || 0,
    }));

    // patch 0117: 部品マーカータグを除外（excludePulldown=true 時のみ）
    let excludedCount = 0;
    if (excludePulldown) {
      const before = tags.length;
      tags = tags.filter((t) => !PULLDOWN_MARKER_TAGS.has(t.name));
      excludedCount = before - tags.length;
    }

    // 名前順にソート（日本語 locale）
    tags.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    return data({
      success: true,
      tags,
      total: tags.length,
      sampledProductCount: sampled.length,
      excludePulldown,
      excludedCount,
      note: sampled.length >= 250
        ? '商品数が 250 件を超えるため件数は最新 250 件のサンプル推計です'
        : '全商品を走査した正確な件数です',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `商品タグ取得失敗: ${msg}` }, { status: 500 });
  }
}
