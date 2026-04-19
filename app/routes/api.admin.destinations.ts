/**
 * GET /api/admin/destinations
 *
 * patch 0042 (2026-04-19) — UrlPicker バックエンド
 *
 * バナーの「リンク先」で選ぶ候補を一括返却する。非エンジニア向け UI のために
 * 検索つきドロップダウンの選択肢として使う。
 *
 * Response:
 *   {
 *     success: true,
 *     catalog: {
 *       collections:  [{ label, value, hint? }, ...],   // Shopify コレクション
 *       static_pages: [{ label, value, hint? }, ...],   // astromeda_static_page
 *       blogs:        [{ label, value, hint? }, ...],   // astromeda_article_content
 *       seos:         [{ label, value, hint? }, ...],   // astromeda_seo_article
 *     }
 *   }
 *
 * 各 option は:
 *   label = 人間向け日本語表示名
 *   value = Shopify handle / CMS slug (URL の最後のパス片)
 *   hint  = 補足（件数や更新日など）
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC(products.edit) → AuditLog
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.destinations';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';

// ── Option shape (must match UrlPicker's DestinationOption) ──
interface DestinationOption {
  label: string;
  value: string;
  hint?: string;
}

interface DestinationCatalog {
  collections: DestinationOption[];
  static_pages: DestinationOption[];
  blogs: DestinationOption[];
  seos: DestinationOption[];
}

// ── Admin client ──
async function getAdminClientFromContext(contextEnv: Env) {
  const { setAdminEnv, getAdminClient } = await import(
    '../../agents/core/shopify-admin.js'
  );
  setAdminEnv(contextEnv);
  return getAdminClient();
}

async function authenticateAdmin(request: Request, contextEnv: Env, context: unknown) {
  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, contextEnv);
  if (!auth.authenticated) return { error: auth.response };

  const sessionFromContext = (context as { session?: AppSession }).session;
  const session =
    sessionFromContext ??
    (await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]));

  const { requirePermission } = await import('~/lib/rbac');
  const role = requirePermission(session as AppSession, 'products.edit');
  return { role, session };
}

// ── GraphQL: collections with optional image/product count ──
const COLLECTIONS_QUERY = `{
  collections(first: 250, sortKey: TITLE) {
    nodes {
      id
      handle
      title
      productsCount { count }
    }
  }
}`;

// ── GraphQL: metaobjects list for pages/blogs/seo ──
function metaobjectListQuery(type: string): string {
  return `{
    metaobjects(type: "${type}", first: 100, sortKey: "updated_at") {
      nodes {
        id
        handle
        updatedAt
        fields { key value }
      }
    }
  }`;
}

interface MetaobjectNode {
  id: string;
  handle: string;
  updatedAt: string;
  fields: Array<{ key: string; value: string }>;
}

function fieldValue(node: MetaobjectNode, key: string): string | undefined {
  return node.fields.find((f) => f.key === key)?.value;
}

/**
 * astromeda_static_page の title/slug を抽出。slug 欠落時は handle で代替。
 */
function mapStaticPages(nodes: MetaobjectNode[]): DestinationOption[] {
  return nodes
    .map((n) => {
      const slug = fieldValue(n, 'slug') || n.handle;
      const title = fieldValue(n, 'title') || fieldValue(n, 'page_title') || slug;
      return {
        label: title,
        value: slug.startsWith('/') ? slug : `/${slug}`, // UrlPicker の extractSlug は先頭 / を落とす
        hint: slug,
      };
    })
    // UrlPicker の buildUrl('static_page', slug) は slug に / がなければ '/' + slug になるので
    // value は「/プレフィックスなしの素の slug」にして揃える
    .map((o) => ({ ...o, value: o.value.replace(/^\//, '') }));
}

/**
 * astromeda_article_content (= blog) の title/handle を抽出
 */
function mapBlogs(nodes: MetaobjectNode[]): DestinationOption[] {
  return nodes.map((n) => {
    const slug = fieldValue(n, 'slug') || n.handle;
    const title = fieldValue(n, 'title') || fieldValue(n, 'headline') || slug;
    return {
      label: title,
      value: slug,
      hint: `${n.updatedAt.slice(0, 10)} 更新`,
    };
  });
}

/**
 * astromeda_seo_article
 */
function mapSeos(nodes: MetaobjectNode[]): DestinationOption[] {
  return nodes.map((n) => {
    const slug = fieldValue(n, 'slug') || n.handle;
    const title = fieldValue(n, 'title') || slug;
    return {
      label: title,
      value: slug,
      hint: `${n.updatedAt.slice(0, 10)} 更新`,
    };
  });
}

// ── Loader ──
export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.destinations', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  try {
    const authResult = await authenticateAdmin(request, contextEnv, context);
    if ('error' in authResult) return authResult.error;

    const client = await getAdminClientFromContext(contextEnv);

    // 4 並列取得。個別失敗はログに留めて空配列にフォールバックする
    const [collRes, pageRes, blogRes, seoRes] = await Promise.allSettled([
      client.query<{
        collections: {
          nodes: Array<{ id: string; handle: string; title: string; productsCount?: { count: number } }>;
        };
      }>(COLLECTIONS_QUERY),
      client.query<{ metaobjects: { nodes: MetaobjectNode[] } }>(
        metaobjectListQuery('astromeda_static_page'),
      ),
      client.query<{ metaobjects: { nodes: MetaobjectNode[] } }>(
        metaobjectListQuery('astromeda_article_content'),
      ),
      client.query<{ metaobjects: { nodes: MetaobjectNode[] } }>(
        metaobjectListQuery('astromeda_seo_article'),
      ),
    ]);

    const collections: DestinationOption[] =
      collRes.status === 'fulfilled'
        ? collRes.value.collections.nodes.map((c) => ({
            label: c.title,
            value: c.handle,
            hint: c.productsCount ? `${c.productsCount.count} 商品` : undefined,
          }))
        : [];

    const static_pages: DestinationOption[] =
      pageRes.status === 'fulfilled' ? mapStaticPages(pageRes.value.metaobjects.nodes) : [];

    const blogs: DestinationOption[] =
      blogRes.status === 'fulfilled' ? mapBlogs(blogRes.value.metaobjects.nodes) : [];

    const seos: DestinationOption[] =
      seoRes.status === 'fulfilled' ? mapSeos(seoRes.value.metaobjects.nodes) : [];

    const catalog: DestinationCatalog = { collections, static_pages, blogs, seos };

    auditLog({
      action: 'api_access',
      role: authResult.role,
      resource: 'api/admin/destinations',
      detail: `cols=${collections.length} pages=${static_pages.length} blogs=${blogs.length} seos=${seos.length}`,
      success: true,
    });

    return data({ success: true, catalog });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: msg, catalog: { collections: [], static_pages: [], blogs: [], seos: [] } }, { status: 500 });
  }
}
