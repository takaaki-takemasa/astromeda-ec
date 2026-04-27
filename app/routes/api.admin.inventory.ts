/**
 * 在庫管理 API — patch 0160
 *
 * 双方向同期:
 *  - GET: Shopify から最新の在庫数を取得 (= Shopify が SoT)
 *  - POST set: 絶対値で在庫を上書き → Shopify に即反映
 *  - POST adjust: 差分 (+N / -N) で在庫を調整 → Shopify に即反映
 *  - POST bulk_set / bulk_adjust: 複数 variant を一度に更新
 *
 * Shopify 側で誰かが在庫を変更しても、admin で再読込すれば最新が見えます
 * (= リアルタイム同期の代わりにオンデマンド取得)。
 */

import {data, type LoaderFunctionArgs, type ActionFunctionArgs} from 'react-router';
import {z} from 'zod';
import {applyRateLimit, RATE_LIMIT_PRESETS} from '~/lib/rate-limiter';
import {requirePermission} from '~/lib/rbac';
import {auditLog, actorFromSession} from '~/lib/audit-log';
import {AppSession} from '~/lib/session';
import {verifyCsrfForAdmin} from '~/lib/csrf-middleware';

const GidVariant = z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/, '無効な variantId');
const GidInventoryItem = z.string().regex(/^gid:\/\/shopify\/InventoryItem\/\d+$/, '無効な inventoryItemId');
const GidLocation = z.string().regex(/^gid:\/\/shopify\/Location\/\d+$/, '無効な locationId');

const SetSchema = z.object({
  action: z.literal('set'),
  inventoryItemId: GidInventoryItem,
  locationId: GidLocation,
  quantity: z.number().int().min(0).max(1_000_000),
}).strict();

const AdjustSchema = z.object({
  action: z.literal('adjust'),
  inventoryItemId: GidInventoryItem,
  locationId: GidLocation,
  delta: z.number().int().min(-1_000_000).max(1_000_000),
}).strict();

const BulkSetSchema = z.object({
  action: z.literal('bulk_set'),
  changes: z.array(z.object({
    inventoryItemId: GidInventoryItem,
    locationId: GidLocation,
    quantity: z.number().int().min(0).max(1_000_000),
  })).min(1).max(250),
}).strict();

const BulkAdjustSchema = z.object({
  action: z.literal('bulk_adjust'),
  changes: z.array(z.object({
    inventoryItemId: GidInventoryItem,
    locationId: GidLocation,
    delta: z.number().int().min(-1_000_000).max(1_000_000),
  })).min(1).max(250),
}).strict();

const BodySchema = z.union([SetSchema, AdjustSchema, BulkSetSchema, BulkAdjustSchema]);

async function getSession(request: Request, context: unknown, contextEnv: Env): Promise<AppSession> {
  const sharedSession = (context as {session?: AppSession}).session;
  if (sharedSession) return sharedSession;
  return AppSession.init(request, [
    String((contextEnv as unknown as {SESSION_SECRET?: string}).SESSION_SECRET || ''),
  ]);
}

async function getAdminClient(contextEnv: Env) {
  const {setAdminEnv, getAdminClient: getClient} = await import('../../agents/core/shopify-admin.js');
  setAdminEnv(contextEnv as unknown as Record<string, string | undefined>);
  return getClient();
}

// ── GET: 在庫一覧 (variant 単位 + location 別) ──

export async function loader({request, context}: LoaderFunctionArgs) {
  const limited = applyRateLimit(request, 'api.admin.inventory', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);

  try {
    const session = await getSession(request, context, contextEnv);
    const role = requirePermission(session, 'products.view');

    const url = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50'), 1), 250);
    const cursor = url.searchParams.get('cursor') || null;
    const queryStr = url.searchParams.get('query') || null;

    const client = await getAdminClient(contextEnv);

    // location list は read_locations scope が必要なため、無い環境ではスキップ
    // 代わりに variant から取れる location.id を集約して location 名は admin UI 側で
    // location id の最後の数字を 表示する (拠点が複数あれば後で scope 追加で対応)
    let locations: Array<{id: string; name: string; isActive: boolean}> = [];
    try {
      const locResp = await client.query<{
        locations: {nodes: Array<{id: string; name: string; isActive: boolean}>};
      }>(`{ locations(first: 20) { nodes { id name isActive } } }`);
      locations = (locResp.locations?.nodes || []).filter((l) => l.isActive);
    } catch {
      // read_locations scope がない場合は空のままにする (UI が代わりに id を表示)
      locations = [];
    }

    // variant list with inventory levels per location
    // location.name は read_locations scope が必要なため id だけ取得
    // sortKey: ProductVariantSortKeys = ID/INVENTORY_LEVELS_AVAILABLE/NAME/SKU/TITLE/RELEVANCE のみ
    // (UPDATED_AT は無効なため指定なし → API デフォルト順)
    const gql = `
      query Inventory($first: Int!, $after: String, $query: String) {
        productVariants(first: $first, after: $after, query: $query) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            title
            sku
            price
            updatedAt
            product {
              id
              title
              handle
              featuredImage { url altText }
              status
            }
            inventoryItem {
              id
              tracked
              inventoryLevels(first: 10) {
                nodes {
                  id
                  location { id }
                  quantities(names: ["available", "incoming", "committed", "on_hand"]) {
                    name
                    quantity
                  }
                }
              }
            }
          }
        }
      }
    `;

    const res = await client.query<{
      productVariants: {
        pageInfo: {hasNextPage: boolean; endCursor: string | null};
        nodes: Array<{
          id: string;
          title: string;
          sku: string | null;
          price: string;
          updatedAt: string;
          product: {id: string; title: string; handle: string; featuredImage: {url: string; altText: string | null} | null; status: string};
          inventoryItem: {
            id: string;
            tracked: boolean;
            inventoryLevels: {
              nodes: Array<{
                id: string;
                location: {id: string};
                quantities: Array<{name: string; quantity: number}>;
              }>;
            };
          } | null;
        }>;
      };
    }>(gql, {first: limit, after: cursor, query: queryStr});

    // location id → name のマップ (read_locations 取れた場合)
    const locNameMap = new Map(locations.map((l) => [l.id, l.name]));

    const items = res.productVariants.nodes.map((v) => {
      const levels = v.inventoryItem?.inventoryLevels?.nodes || [];
      const flatLevels = levels.map((lvl) => {
        const q = (name: string) => lvl.quantities.find((x) => x.name === name)?.quantity ?? 0;
        const locId = lvl.location.id;
        // location 名: API から取得 → fallback に gid の末尾数字で「拠点 #ID」表示
        const locName = locNameMap.get(locId) || `拠点 #${(locId.split('/').pop() || '?')}`;
        return {
          inventoryLevelId: lvl.id,
          locationId: locId,
          locationName: locName,
          available: q('available'),
          incoming: q('incoming'),
          committed: q('committed'),
          onHand: q('on_hand'),
        };
      });
      return {
        variantId: v.id,
        variantTitle: v.title,
        sku: v.sku,
        price: v.price,
        updatedAt: v.updatedAt,
        product: v.product,
        inventoryItemId: v.inventoryItem?.id || null,
        tracked: v.inventoryItem?.tracked ?? false,
        levels: flatLevels,
        // 合計 (全 location 合算)
        totalAvailable: flatLevels.reduce((s, l) => s + l.available, 0),
      };
    });

    auditLog({
      action: 'api_access',
      role,
      ...actorFromSession(session),
      resource: 'api/admin/inventory [GET]',
      success: true,
    });

    return data({
      success: true,
      locations,
      items,
      pageInfo: res.productVariants.pageInfo,
      total: items.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    auditLog({
      action: 'api_error',
      role: null,
      resource: 'api/admin/inventory [GET]',
      success: false,
      detail: msg,
    });
    return data({success: false, error: msg}, {status: 500});
  }
}

// ── POST: 在庫の編集 (set / adjust / bulk_*) ──

export async function action({request, context}: ActionFunctionArgs) {
  const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.inventory', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  if (request.method !== 'POST') {
    return data({error: 'Method not allowed'}, {status: 405});
  }

  let body: z.infer<typeof BodySchema>;
  try {
    const json = await request.json();
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return data({success: false, error: 'リクエストの形式が不正です', issues: parsed.error.issues}, {status: 400});
    }
    body = parsed.data;
  } catch {
    return data({success: false, error: 'JSON の解析に失敗しました'}, {status: 400});
  }

  try {
    const session = await getSession(request, context, contextEnv);
    const role = requirePermission(session, 'products.edit');
    const actor = actorFromSession(session);
    const client = await getAdminClient(contextEnv);

    // 絶対値で上書き (inventorySetQuantities: 2024-04+)
    const setQuantitiesGql = `
      mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          inventoryAdjustmentGroup { id changes { delta name } }
          userErrors { field message code }
        }
      }
    `;

    if (body.action === 'set') {
      const res = await client.query<{
        inventorySetQuantities: {
          inventoryAdjustmentGroup: {id: string; changes: Array<{delta: number; name: string}>} | null;
          userErrors: Array<{field: string[]; message: string; code: string | null}>;
        };
      }>(setQuantitiesGql, {
        input: {
          name: 'available',
          reason: 'correction',
          ignoreCompareQuantity: true,
          quantities: [{
            inventoryItemId: body.inventoryItemId,
            locationId: body.locationId,
            quantity: body.quantity,
          }],
        },
      });
      const {inventoryAdjustmentGroup, userErrors} = res.inventorySetQuantities;
      if (userErrors.length > 0) {
        return data({success: false, error: userErrors.map((e) => e.message).join('; ')}, {status: 400});
      }
      auditLog({
        action: 'product_edit',
        role,
        ...actor,
        resource: `inventory/${body.inventoryItemId} @ ${body.locationId}`,
        detail: `set quantity=${body.quantity}`,
        success: true,
      });
      return data({success: true, adjustmentGroupId: inventoryAdjustmentGroup?.id || null});
    }

    if (body.action === 'adjust') {
      const result = await client.inventoryAdjustQuantity(body.inventoryItemId, body.locationId, body.delta);
      auditLog({
        action: 'product_edit',
        role,
        ...actor,
        resource: `inventory/${body.inventoryItemId} @ ${body.locationId}`,
        detail: `adjust delta=${body.delta}`,
        success: true,
      });
      return data({success: true, ...result});
    }

    if (body.action === 'bulk_set') {
      const res = await client.query<{
        inventorySetQuantities: {
          inventoryAdjustmentGroup: {id: string; changes: Array<{delta: number; name: string}>} | null;
          userErrors: Array<{field: string[]; message: string; code: string | null}>;
        };
      }>(setQuantitiesGql, {
        input: {
          name: 'available',
          reason: 'correction',
          ignoreCompareQuantity: true,
          quantities: body.changes.map((c) => ({
            inventoryItemId: c.inventoryItemId,
            locationId: c.locationId,
            quantity: c.quantity,
          })),
        },
      });
      const {inventoryAdjustmentGroup, userErrors} = res.inventorySetQuantities;
      if (userErrors.length > 0) {
        return data({success: false, error: userErrors.map((e) => e.message).join('; ')}, {status: 400});
      }
      auditLog({
        action: 'product_edit',
        role,
        ...actor,
        resource: 'inventory [bulk_set]',
        detail: `${body.changes.length} variants set`,
        success: true,
      });
      return data({success: true, adjustmentGroupId: inventoryAdjustmentGroup?.id || null, count: body.changes.length});
    }

    if (body.action === 'bulk_adjust') {
      // inventoryAdjustQuantities (複数形) を直接呼ぶ
      const adjustGql = `
        mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
          inventoryAdjustQuantities(input: $input) {
            inventoryAdjustmentGroup { id changes { delta name } }
            userErrors { field message }
          }
        }
      `;
      const res = await client.query<{
        inventoryAdjustQuantities: {
          inventoryAdjustmentGroup: {id: string; changes: Array<{delta: number; name: string}>} | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(adjustGql, {
        input: {
          reason: 'correction',
          name: 'available',
          changes: body.changes.map((c) => ({
            inventoryItemId: c.inventoryItemId,
            locationId: c.locationId,
            delta: c.delta,
          })),
        },
      });
      const {inventoryAdjustmentGroup, userErrors} = res.inventoryAdjustQuantities;
      if (userErrors.length > 0) {
        return data({success: false, error: userErrors.map((e) => e.message).join('; ')}, {status: 400});
      }
      auditLog({
        action: 'product_edit',
        role,
        ...actor,
        resource: 'inventory [bulk_adjust]',
        detail: `${body.changes.length} variants adjusted`,
        success: true,
      });
      return data({success: true, adjustmentGroupId: inventoryAdjustmentGroup?.id || null, count: body.changes.length});
    }

    return data({success: false, error: 'Unknown action'}, {status: 400});
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    auditLog({action: 'api_error', role: null, resource: 'api/admin/inventory [POST]', success: false, detail: msg});
    return data({success: false, error: msg}, {status: 500});
  }
}
