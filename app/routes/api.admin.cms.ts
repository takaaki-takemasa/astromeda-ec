/**
 * CMS ダッシュボード API — GET /api/admin/cms
 *
 * 全 Metaobject セクションのステータスを一括返却。
 * サイトマップやダッシュボードの件数プレビューに使用。
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.cms';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { loadAllCMSData, type CMSData } from '~/lib/cms-loader';

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.cms', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  try {
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const sharedSession = (context as unknown as { session?: AppSession }).session;
    const session = sharedSession ?? await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]);

    const { requirePermission } = await import('~/lib/rbac');
    const role = requirePermission(session, 'products.view');

    // Admin client 初期化
    let adminClient: Awaited<ReturnType<typeof import('../../agents/core/shopify-admin.js').getAdminClient>> | null = null;
    try {
      const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
      setAdminEnv(contextEnv);
      adminClient = getAdminClient();
    } catch {
      adminClient = null;
    }

    const cms: CMSData = await loadAllCMSData(adminClient);

    auditLog({ action: 'api_access', role, resource: 'api/admin/cms', success: true });

    return data({
      success: true,
      summary: {
        collabs: cms.metaCollabs.length,
        banners: cms.metaBanners.length,
        colors: cms.metaColors.length,
        categoryCards: cms.metaCategoryCards.length,
        productShelves: cms.metaProductShelves.length,
        aboutSections: cms.metaAboutSections.length,
        footerConfigs: cms.metaFooterConfigs.length,
        total: cms.metaCollabs.length + cms.metaBanners.length + cms.metaColors.length +
               cms.metaCategoryCards.length + cms.metaProductShelves.length +
               cms.metaAboutSections.length + cms.metaFooterConfigs.length,
      },
      data: cms,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data(
      { success: false, error: `CMS データ取得失敗: ${msg}` },
      { status: 500 },
    );
  }
}
