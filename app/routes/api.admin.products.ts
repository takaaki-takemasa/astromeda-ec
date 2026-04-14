/**
 * 商品管理API — CMS Phase A（商品CRUD）
 *
 * GET:  商品一覧取得（ページネーション対応）
 * POST: 商品作成 / 更新 / 削除
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC → AuditLog → CSRF(POST) → Zod
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.products';
import { ProductActionSchema } from '~/lib/api-schemas';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

// ── 設定定数 ──
const PRODUCT_LIST_DEFAULT_LIMIT = 20;
const PRODUCT_LIST_MAX_LIMIT = 50;

// ── GET: 商品一覧 ──

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.products', RATE_LIMIT_PRESETS.admin);
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
    auditLog({ action: 'api_access', role, resource: 'api/admin/products [GET]', success: true });

    // クエリパラメータ解析
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') || undefined;
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || PRODUCT_LIST_DEFAULT_LIMIT, 1), PRODUCT_LIST_MAX_LIMIT);
    const query = url.searchParams.get('query') || undefined;
    const status = url.searchParams.get('status') || undefined;

    // Shopify Admin API 呼び出し
    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    const graphqlQuery = buildProductsQuery(limit, cursor, query, status);
    const result = await (client as unknown as { query: <T>(q: string) => Promise<T> }).query<{
      products: {
        edges: Array<{
          cursor: string;
          node: {
            id: string;
            title: string;
            handle: string;
            status: string;
            productType: string;
            vendor: string;
            tags: string[];
            totalInventory: number;
            priceRangeV2: {
              minVariantPrice: { amount: string; currencyCode: string };
              maxVariantPrice: { amount: string; currencyCode: string };
            };
            images: { edges: Array<{ node: { url: string } }> };
            updatedAt: string;
            createdAt: string;
          };
        }>;
        pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; endCursor: string | null };
      };
    }>(graphqlQuery);

    const products = result.products.edges.map(({ cursor: c, node }) => ({
      id: node.id,
      title: node.title,
      handle: node.handle,
      status: node.status,
      productType: node.productType,
      vendor: node.vendor,
      tags: node.tags,
      totalInventory: node.totalInventory,
      priceRange: node.priceRangeV2,
      imageUrl: node.images.edges[0]?.node.url || null,
      updatedAt: node.updatedAt,
      createdAt: node.createdAt,
      cursor: c,
    }));

    return data({
      success: true,
      products,
      pageInfo: result.products.pageInfo,
      total: products.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `商品一覧の取得に失敗しました: ${msg}` }, { status: 500 });
  }
}

// ── POST: 商品作成/更新/削除 ──

export async function action({ request, context }: Route.ActionArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.products', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const session = await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]);

    // JSON パース
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Zod バリデーション
    const validation = ProductActionSchema.safeParse(rawBody);
    if (!validation.success) {
      return data({
        error: '入力値が無効です',
        details: validation.error.errors.map((e) => e.message),
      }, { status: 400 });
    }

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    const validated = validation.data;

    switch (validated.action) {
      case 'create': {
        const role = requirePermission(session, 'products.edit');
        const result = await client.createProduct(validated.product);
        auditLog({
          action: 'product_create',
          role,
          resource: `product/${result.id}`,
          success: true,
        });
        return data({ success: true, product: result });
      }

      case 'update': {
        const role = requirePermission(session, 'products.edit');
        const result = await client.updateProduct(validated.productId, validated.product);
        auditLog({
          action: 'product_update',
          role,
          resource: `product/${validated.productId}`,
          success: true,
        });
        return data({ success: true, product: result });
      }

      case 'delete': {
        const role = requirePermission(session, 'products.delete');
        const result = await client.deleteProduct(validated.productId);
        auditLog({
          action: 'product_delete',
          role,
          resource: `product/${validated.productId}`,
          success: result,
        });
        return data({ success: result });
      }

      default:
        return data({ error: '不明なアクションです' }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `商品操作に失敗しました: ${msg}` }, { status: 500 });
  }
}

// ── GraphQLクエリビルダー ──

function buildProductsQuery(limit: number, cursor?: string, query?: string, status?: string): string {
  const filters: string[] = [];
  if (query) filters.push(query.replace(/"/g, '\\"'));
  if (status) filters.push(`status:${status}`);
  const filterStr = filters.length > 0 ? filters.join(' AND ') : '';

  const afterClause = cursor ? `, after: "${cursor}"` : '';
  const queryClause = filterStr ? `, query: "${filterStr}"` : '';

  return `{
    products(first: ${limit}${afterClause}${queryClause}) {
      edges {
        cursor
        node {
          id
          title
          handle
          status
          productType
          vendor
          tags
          totalInventory
          priceRangeV2 {
            minVariantPrice { amount currencyCode }
            maxVariantPrice { amount currencyCode }
          }
          images(first: 1) {
            edges { node { url } }
          }
          updatedAt
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        endCursor
      }
    }
  }`;
}
