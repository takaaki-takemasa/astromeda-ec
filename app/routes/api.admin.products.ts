/**
 * 商品管理API — CMS Phase A + Sprint 1 拡張
 *
 * GET:
 *   - 一覧: 既存のページネーション対応
 *   - 詳細: ?id=gid://shopify/Product/... で単一商品の全フィールド取得
 * POST actions:
 *   既存: create / update / delete
 *   Sprint 1 追加: variant_update / variants_bulk_update / inventory_adjust /
 *                  image_upload / image_delete / image_reorder / publish / unpublish
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC → AuditLog → CSRF(POST) → Zod
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.products';
import { z } from 'zod';
import { ProductActionSchema } from '~/lib/api-schemas';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';
import { isPulldownComponent } from '~/lib/pulldown-classifier';
import { validateExpectedUpdatedAt, casConflictResponse } from '~/lib/expected-updated-at';
import { computeFieldDiff } from '~/lib/audit-snapshot';

// ── 設定定数 ──
const PRODUCT_LIST_DEFAULT_LIMIT = 20;
const PRODUCT_LIST_MAX_LIMIT = 50;

// ── 拡張アクション Zod スキーマ ──
const GidProduct = z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/, '無効な productId です');
const GidVariant = z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/, '無効な variantId です');
const GidMedia = z.string().regex(/^gid:\/\/shopify\/MediaImage\/\d+$/, '無効な imageId です');
const GidInventoryItem = z.string().regex(/^gid:\/\/shopify\/InventoryItem\/\d+$/, '無効な inventoryItemId です');
const GidLocation = z.string().regex(/^gid:\/\/shopify\/Location\/\d+$/, '無効な locationId です');
const GidPublication = z.string().regex(/^gid:\/\/shopify\/Publication\/\d+$/, '無効な publicationId です');

const VariantUpdateFieldsSchema = z.object({
  price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  compareAtPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  sku: z.string().max(255).optional(),
  barcode: z.string().max(255).optional(),
  taxable: z.boolean().optional(),
  inventoryPolicy: z.enum(['DENY', 'CONTINUE']).optional(),
}).strict();

const ExtendedProductActionSchema = z.discriminatedUnion('action', [
  // 単一バリアント更新
  z.object({
    action: z.literal('variant_update'),
    productId: GidProduct,
    variantId: GidVariant,
    fields: VariantUpdateFieldsSchema,
  }).strict(),

  // 複数バリアント一括更新
  z.object({
    action: z.literal('variants_bulk_update'),
    productId: GidProduct,
    variants: z.array(
      VariantUpdateFieldsSchema.extend({
        id: GidVariant,
      }).strict(),
    ).min(1).max(100),
  }).strict(),

  // 在庫調整（相対デルタ）
  z.object({
    action: z.literal('inventory_adjust'),
    inventoryItemId: GidInventoryItem,
    locationId: GidLocation,
    delta: z.number().int().refine((n) => n !== 0, { message: 'delta は 0 以外' }),
  }).strict(),

  // 画像アップロード
  z.object({
    action: z.literal('image_upload'),
    productId: GidProduct,
    src: z.string().url().max(2048),
    altText: z.string().max(500).optional(),
  }).strict(),

  // 画像削除
  z.object({
    action: z.literal('image_delete'),
    productId: GidProduct,
    imageId: GidMedia,
  }).strict(),

  // 画像並び替え
  z.object({
    action: z.literal('image_reorder'),
    productId: GidProduct,
    imageIds: z.array(GidMedia).min(1).max(100),
  }).strict(),

  // 公開
  z.object({
    action: z.literal('publish'),
    productId: GidProduct,
    publicationIds: z.array(GidPublication).min(1).max(20),
  }).strict(),

  // 非公開
  z.object({
    action: z.literal('unpublish'),
    productId: GidProduct,
    publicationIds: z.array(GidPublication).min(1).max(20),
  }).strict(),

  // patch 0065: タグ一括付与（Smart Collection 所属を即時切替）
  z.object({
    action: z.literal('tags_bulk_add'),
    productIds: z.array(GidProduct).min(1).max(250),
    tags: z.array(z.string().min(1).max(255)).min(1).max(50),
  }).strict(),

  // patch 0065: タグ一括削除
  z.object({
    action: z.literal('tags_bulk_remove'),
    productIds: z.array(GidProduct).min(1).max(250),
    tags: z.array(z.string().min(1).max(255)).min(1).max(50),
  }).strict(),
]);

// ── GET: 一覧 or 詳細 ──

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

    const url = new URL(request.url);
    const idParam = url.searchParams.get('id');

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    // 詳細取得モード: ?id=gid://shopify/Product/... 指定時
    if (idParam) {
      const parsed = GidProduct.safeParse(idParam);
      if (!parsed.success) {
        return data({ success: false, error: '無効な productId です' }, { status: 400 });
      }
      auditLog({ action: 'api_access', role, resource: `api/admin/products [GET detail ${idParam}]`, success: true });
      const product = await client.getProductDetail(idParam);
      if (!product) {
        return data({ success: false, error: '商品が見つかりません' }, { status: 404 });
      }
      return data({ success: true, product });
    }

    // 一覧モード
    auditLog({ action: 'api_access', role, resource: 'api/admin/products [GET]', success: true });

    const cursor = url.searchParams.get('cursor') || undefined;
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || PRODUCT_LIST_DEFAULT_LIMIT, 1), PRODUCT_LIST_MAX_LIMIT);
    const query = url.searchParams.get('query') || undefined;
    const status = url.searchParams.get('status') || undefined;
    // patch 0100: プルダウン部品 (Globo 旧データ: tags 空 + productType 空) を既定で隠す。
    // CEO 指摘「商品一覧をクリックすると製品名の下に大量にプルダウンが羅列する」対応。
    // 中学生が商品一覧で「完成商品」と「部品」を混同しないように、明示的に含める指示がない限り除外する。
    const showComponents = url.searchParams.get('showComponents') === 'true';

    // post-filter で 20件確保するため多めに取得。結果 limit 超過分はカーソル継続で対応。
    const fetchLimit = showComponents ? limit : Math.min(PRODUCT_LIST_MAX_LIMIT, limit * 2);
    const graphqlQuery = buildProductsQuery(fetchLimit, cursor, query, status);
    const result = await (client as unknown as { query: <T>(q: string) => Promise<T> }).query<{
      productsCount: { count: number } | null;
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

    // patch 0103: pulldown-classifier.ts に canonical 化。
    // 旧 patch 0100/0102 のヒューリスティクス (tags=[] / globo-product-options / 延長保証)
    // に加えて 'pulldown-component' canonical タグも検出。
    // 「部品を含める」トグルが ON のときだけ全件返す。OFF のときは limit 件にトリムする。
    const filteredProducts = showComponents
      ? products
      : products.filter((p) => !isPulldownComponent(p));
    const visibleProducts = filteredProducts.slice(0, limit);
    const hiddenComponentCount = showComponents
      ? 0
      : products.filter((p) => isPulldownComponent(p)).length;

    // patch 0094: Shopify 実総件数 (フィルタ適用後の件数)。Dashboard 50+ 頭打ち解消。
    const totalProducts = result.productsCount?.count ?? null;

    return data({
      success: true,
      products: visibleProducts,
      pageInfo: result.products.pageInfo,
      total: visibleProducts.length,
      totalProducts,
      hiddenComponentCount, // patch 0100: 「部品を含める」トグル用の隠しカウント
      showComponents, // patch 0100: 現在の表示モードをクライアントに返す
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `商品データ取得に失敗しました: ${msg}` }, { status: 500 });
  }
}

// ── POST: 商品CRUD + バリアント/在庫/画像/公開 ──

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

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    // 1) 拡張アクション（Sprint 1）を先に試す
    const extValidation = ExtendedProductActionSchema.safeParse(rawBody);
    if (extValidation.success) {
      const v = extValidation.data;

      switch (v.action) {
        case 'variant_update': {
          const role = requirePermission(session, 'products.edit');
          const result = await client.productVariantsBulkUpdate(v.productId, [
            { id: v.variantId, ...v.fields },
          ]);
          auditLog({ action: 'product_update', role, resource: `variant/${v.variantId}`, success: true });
          return data({ success: true, variants: result });
        }

        case 'variants_bulk_update': {
          const role = requirePermission(session, 'products.edit');
          const result = await client.productVariantsBulkUpdate(v.productId, v.variants);
          auditLog({
            action: 'product_update',
            role,
            resource: `product/${v.productId}`,
            detail: `bulk variants=${v.variants.length}`,
            success: true,
          });
          return data({ success: true, variants: result });
        }

        case 'inventory_adjust': {
          const role = requirePermission(session, 'products.edit');
          const result = await client.inventoryAdjustQuantity(v.inventoryItemId, v.locationId, v.delta);
          auditLog({
            action: 'product_update',
            role,
            resource: `inventory/${v.inventoryItemId}`,
            detail: `delta=${v.delta}`,
            success: true,
          });
          return data({ success: true, adjustment: result });
        }

        case 'image_upload': {
          const role = requirePermission(session, 'products.edit');
          const result = await client.productImageCreate(v.productId, v.src, v.altText);
          auditLog({
            action: 'product_update',
            role,
            resource: `product/${v.productId}/image/${result.id}`,
            success: true,
          });
          return data({ success: true, image: result });
        }

        case 'image_delete': {
          const role = requirePermission(session, 'products.edit');
          const result = await client.productImageDelete(v.productId, v.imageId);
          auditLog({
            action: 'product_update',
            role,
            resource: `product/${v.productId}/image/${v.imageId}`,
            detail: 'deleted',
            success: result,
          });
          return data({ success: result });
        }

        case 'image_reorder': {
          const role = requirePermission(session, 'products.edit');
          const result = await client.productImageReorder(v.productId, v.imageIds);
          auditLog({
            action: 'product_update',
            role,
            resource: `product/${v.productId}/images`,
            detail: `reorder count=${v.imageIds.length}`,
            success: result,
          });
          return data({ success: result });
        }

        case 'publish': {
          const role = requirePermission(session, 'products.edit');
          const result = await client.productPublish(v.productId, v.publicationIds);
          auditLog({
            action: 'product_update',
            role,
            resource: `product/${v.productId}`,
            detail: `publish to ${v.publicationIds.length} channels`,
            success: result,
          });
          return data({ success: result });
        }

        case 'unpublish': {
          const role = requirePermission(session, 'products.edit');
          const result = await client.productUnpublish(v.productId, v.publicationIds);
          auditLog({
            action: 'product_update',
            role,
            resource: `product/${v.productId}`,
            detail: `unpublish from ${v.publicationIds.length} channels`,
            success: result,
          });
          return data({ success: result });
        }

        // patch 0065: タグ一括付与
        case 'tags_bulk_add': {
          const role = requirePermission(session, 'products.edit');
          const results = await client.bulkAddTagsToProducts(v.productIds, v.tags);
          const ok = results.filter((r) => r.success).length;
          const failed = results.length - ok;
          auditLog({
            action: 'product_bulk_tag',
            role,
            resource: `products (${v.productIds.length} items)`,
            detail: `add tags=[${v.tags.join(', ')}] ok=${ok} failed=${failed}`,
            success: failed === 0,
          });
          return data({
            success: failed === 0,
            results,
            summary: { total: results.length, ok, failed, tags: v.tags },
          });
        }

        // patch 0065: タグ一括削除
        case 'tags_bulk_remove': {
          const role = requirePermission(session, 'products.edit');
          const results = await client.bulkRemoveTagsFromProducts(v.productIds, v.tags);
          const ok = results.filter((r) => r.success).length;
          const failed = results.length - ok;
          auditLog({
            action: 'product_bulk_tag',
            role,
            resource: `products (${v.productIds.length} items)`,
            detail: `remove tags=[${v.tags.join(', ')}] ok=${ok} failed=${failed}`,
            success: failed === 0,
          });
          return data({
            success: failed === 0,
            results,
            summary: { total: results.length, ok, failed, tags: v.tags },
          });
        }

        default:
          return data({ error: '不明なアクションです' }, { status: 400 });
      }
    }

    // 2) 既存アクション（create/update/delete）へフォールバック
    const validation = ProductActionSchema.safeParse(rawBody);
    if (!validation.success) {
      return data({
        error: '入力値が無効です',
        details: validation.error.errors.map((e) => e.message),
      }, { status: 400 });
    }

    const validated = validation.data;

    switch (validated.action) {
      case 'create': {
        const role = requirePermission(session, 'products.edit');
        // patch 0171 (P0): vendor は IP コラボ商品 (NARUTO/呪術廻戦/ホロライブ等) を作成不可
        const {assertVendorCanCreateProduct} = await import('~/lib/vendor-scope');
        assertVendorCanCreateProduct(role, {
          title: (validated.product as {title?: string}).title,
          tags: (validated.product as {tags?: string[]}).tags,
        });
        const result = await client.createProduct(validated.product);
        // patch 0116: P2-6 — before/after snapshot (新規作成: before=null)
        const diff = computeFieldDiff(null, validated.product as unknown as Record<string, unknown>);
        auditLog({
          action: 'product_create',
          role,
          resource: `product/${result.id}`,
          success: true,
          ...diff,
        });
        return data({ success: true, product: result });
      }

      case 'update': {
        const role = requirePermission(session, 'products.edit');
        // patch 0171 (P0): vendor は IP コラボ商品の編集不可
        const {assertVendorCanEditProduct} = await import('~/lib/vendor-scope');
        await assertVendorCanEditProduct(role, validated.productId, {
          getProduct: async (id: string) => {
            const p = await client.getProductDetail(id).catch(() => null);
            if (!p) return null;
            const pp = p as {id: string; title?: string; tags?: string[]; productType?: string};
            return {id: pp.id, title: pp.title || '', tags: pp.tags || [], productType: pp.productType};
          },
        });

        // patch 0115: P2-5 楽観的ロック CAS + patch 0116: P2-6 before/after snapshot
        // 両方で current を共有 (Shopify API call を1回に集約)
        const current = await client.getProductDetail(validated.productId);

        const expectedUpdatedAt = (validated as { expectedUpdatedAt?: string }).expectedUpdatedAt;
        if (expectedUpdatedAt) {
          const cas = validateExpectedUpdatedAt(current, expectedUpdatedAt);
          if (!cas.ok) {
            auditLog({
              action: 'product_update',
              role,
              resource: `product/${validated.productId}`,
              detail: 'product_update_cas_conflict',
              success: false,
            });
            return casConflictResponse(current, cas.currentUpdatedAt);
          }
        }

        // patch 0111 (P0-1, 全保存パターン監査 2026-04-22):
        // tags は productUpdate に渡さない (Shopify 仕様で全置換になり patch 0110 の手動 pulldown が消える)。
        // tagsAdd / tagsRemove で差分送信 (Shopify tagsAdd / tagsRemove mutation は冪等で他タグを保持)。
        const result = await client.updateProduct(validated.productId, validated.product);

        // patch 0116: P2-6 — productUpdate の before/after snapshot
        // current から validated.product のキーだけを抽出して diff 対象にする
        const updateKeys = Object.keys(validated.product as object);
        const beforeSubset: Record<string, unknown> = {};
        if (current && typeof current === 'object') {
          for (const k of updateKeys) {
            beforeSubset[k] = (current as Record<string, unknown>)[k];
          }
        }
        const productDiff = computeFieldDiff(
          current ? beforeSubset : null,
          validated.product as unknown as Record<string, unknown>,
        );

        // タグ追加 (差分のみ)
        const tagsAddArr = (validated as { tagsAdd?: string[] }).tagsAdd ?? [];
        const tagsRemoveArr = (validated as { tagsRemove?: string[] }).tagsRemove ?? [];
        let tagsAddResult: { ok: number; failed: number } | null = null;
        let tagsRemoveResult: { ok: number; failed: number } | null = null;
        if (tagsAddArr.length > 0) {
          const r = await client.bulkAddTagsToProducts([validated.productId], tagsAddArr);
          const ok = r.filter((x) => x.success).length;
          tagsAddResult = { ok, failed: r.length - ok };
          // patch 0116: P2-6 — タグ追加も diff 構造化 (before=空配列, after=追加されたタグ)
          const tagsAddDiff = computeFieldDiff(
            { addedTags: [] as string[] },
            { addedTags: tagsAddArr },
          );
          auditLog({
            action: 'product_bulk_tag',
            role,
            resource: `product/${validated.productId}`,
            detail: `add tags=[${tagsAddArr.join(', ')}] ok=${ok} failed=${r.length - ok}`,
            success: tagsAddResult.failed === 0,
            ...tagsAddDiff,
          });
        }
        if (tagsRemoveArr.length > 0) {
          const r = await client.bulkRemoveTagsFromProducts([validated.productId], tagsRemoveArr);
          const ok = r.filter((x) => x.success).length;
          tagsRemoveResult = { ok, failed: r.length - ok };
          // patch 0116: P2-6 — タグ削除も diff 構造化 (before=削除対象, after=空配列)
          const tagsRemoveDiff = computeFieldDiff(
            { removedTags: tagsRemoveArr },
            { removedTags: [] as string[] },
          );
          auditLog({
            action: 'product_bulk_tag',
            role,
            resource: `product/${validated.productId}`,
            detail: `remove tags=[${tagsRemoveArr.join(', ')}] ok=${ok} failed=${r.length - ok}`,
            success: tagsRemoveResult.failed === 0,
            ...tagsRemoveDiff,
          });
        }

        auditLog({
          action: 'product_update',
          role,
          resource: `product/${validated.productId}`,
          detail: `tags +${tagsAddArr.length}/-${tagsRemoveArr.length}`,
          success: true,
          ...productDiff,
        });
        return data({
          success: true,
          product: result,
          tagsAdd: tagsAddResult,
          tagsRemove: tagsRemoveResult,
        });
      }

      case 'delete': {
        const role = requirePermission(session, 'products.edit');
        // patch 0171 (P0): vendor は IP コラボ商品を削除不可
        const {assertVendorCanEditProduct} = await import('~/lib/vendor-scope');
        await assertVendorCanEditProduct(role, validated.productId, {
          getProduct: async (id: string) => {
            const p = await client.getProductDetail(id).catch(() => null);
            if (!p) return null;
            const pp = p as {id: string; title?: string; tags?: string[]; productType?: string};
            return {id: pp.id, title: pp.title || '', tags: pp.tags || [], productType: pp.productType};
          },
        });
        // patch 0116: P2-6 — 削除前にスナップショットを取得 (before=現在値, after=null)
        const current = await client.getProductDetail(validated.productId).catch(() => null);
        const result = await client.deleteProduct(validated.productId);
        const diff = computeFieldDiff(
          current ? (current as unknown as Record<string, unknown>) : null,
          null,
        );
        auditLog({
          action: 'product_delete',
          role,
          resource: `product/${validated.productId}`,
          success: result,
          ...diff,
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
  // patch 0094: productsCount({query}) 同一フィルタで総件数取得 (Dashboard 50+ 頭打ち解消)
  const countQueryClause = filterStr ? `(query: "${filterStr}")` : '';

  return `{
    productsCount${countQueryClause} { count }
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
