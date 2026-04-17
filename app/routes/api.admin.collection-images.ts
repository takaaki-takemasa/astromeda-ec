/**
 * Shopify コレクション画像一括取得 API — POST /api/admin/collection-images
 *
 * 管理画面のプレビューで「IPバナー画像が未設定でも Shopify コレクション画像を
 * フォールバック表示する」ために、handle[] → image URL[] をまとめて返す。
 *
 * Storefront API（公開・読み取り専用）を使用するため、機密データは流出しない。
 * ただし Admin 画面専用エンドポイントとして Admin Auth を必須にする。
 *
 * リクエスト: POST { handles: ["one-piece-bountyrush-collaboration", "naruto-shippuden", ...] }
 * レスポンス: { success: true, images: { "one-piece-bountyrush-collaboration": "https://cdn.shopify.com/...", ... } }
 *
 * セキュリティ: RateLimit → CSRF → AdminAuth → RBAC (products.edit)
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.collection-images';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

// エイリアス化: GraphQL の alias は英数アンダースコアのみ許容
function toAlias(handle: string): string {
  return 'h_' + handle.replace(/[^a-zA-Z0-9]/g, '_');
}

interface CollectionNode {
  id: string;
  title: string;
  handle: string;
  image?: { url?: string } | null;
  products?: { nodes?: Array<{ featuredImage?: { url?: string } | null }> };
}

export async function action({ request, context }: Route.ActionArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(
    request,
    'api.admin.collection-images',
    RATE_LIMIT_PRESETS.admin,
  );
  if (limited) return limited;

  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const sessionFromContext = (context as unknown as { session?: AppSession }).session;
    const session =
      sessionFromContext ??
      (await AppSession.init(request, [
        String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
      ]));

    const { requirePermission } = await import('~/lib/rbac');
    const role = requirePermission(session as AppSession, 'products.edit');

    let body: { handles?: unknown } = {};
    try {
      body = (await request.json()) as { handles?: unknown };
    } catch {
      return data({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const handles = Array.isArray(body.handles)
      ? (body.handles as unknown[])
          .filter((h): h is string => typeof h === 'string')
          .map((h) => h.trim())
          .filter((h) => /^[a-z0-9][a-z0-9\-]{0,200}$/i.test(h))
      : [];

    if (handles.length === 0) {
      return data({ success: true, images: {} });
    }

    // 一括クエリを組み立て（alias を使って1リクエストで複数 collection を取る）
    const aliasMap = new Map<string, string>();
    const bodyParts: string[] = [];
    for (const h of handles) {
      const alias = toAlias(h);
      aliasMap.set(alias, h);
      bodyParts.push(
        `${alias}: collectionByHandle(handle: "${h}") { handle image { url } products(first: 1) { nodes { featuredImage { url } } } }`,
      );
    }
    const gql = `#graphql
      query CollectionImages {
        ${bodyParts.join('\n        ')}
      }
    `;

    const storefront = (context as unknown as { storefront?: { query: (q: string) => Promise<unknown> } })
      .storefront;
    if (!storefront) {
      return data(
        { success: false, error: 'Storefront client unavailable' },
        { status: 500 },
      );
    }

    const result = (await storefront.query(gql)) as Record<string, CollectionNode | null>;

    const images: Record<string, string> = {};
    for (const [alias, handle] of aliasMap.entries()) {
      const node = result?.[alias];
      if (!node) continue;
      const url =
        node.image?.url ||
        node.products?.nodes?.[0]?.featuredImage?.url ||
        '';
      if (url) images[handle] = url;
    }

    auditLog({
      action: 'api_access',
      role,
      resource: 'api/admin/collection-images',
      detail: `fetched ${Object.keys(images).length}/${handles.length} handles`,
      success: true,
    });

    return data({ success: true, images });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: msg }, { status: 500 });
  }
}

export async function loader() {
  return data({
    message:
      'POST with { handles: string[] } to fetch Shopify collection hero images by handle.',
    security: 'Admin auth required. Storefront API read-only under the hood.',
  });
}
