/**
 * ナビゲーションメニュー管理 API — patch 0070 (管理画面完結化 P6)
 *
 * CEO 指摘「Shopify admin を開かずに管理画面で完結させたい」に応える最後の血流経路。
 * ヘッダー/フッターの navigation menu を admin UI から CRUD する。
 *
 * 効果器: 末梢神経の再配線（ユーザー動線をラベル単位で組み替える）
 *
 * GET:
 *   - 一覧: ?limit=50&cursor=xxx
 *   - 詳細: ?id=gid://shopify/Menu/123 (items ツリー込み)
 * POST:
 *   - create: 新規メニュー作成
 *   - update: title / handle / items を丸ごと置換
 *   - delete: メニュー削除 (既定 menu は Shopify 側で拒否)
 *
 * セキュリティ: RateLimit → CSRF → AdminAuth → RBAC → Zod → AuditLog
 * 必要 scope: read_online_store_navigation, write_online_store_navigation
 */

import {data} from 'react-router';
import type {Route} from './+types/api.admin.menus';
import {z} from 'zod';
import {applyRateLimit, RATE_LIMIT_PRESETS} from '~/lib/rate-limiter';
import {requirePermission} from '~/lib/rbac';
import {auditLog} from '~/lib/audit-log';
import {AppSession} from '~/lib/session';
import {verifyCsrfForAdmin} from '~/lib/csrf-middleware';
import type {ShopifyMenuItem, ShopifyMenuItemType} from '../../agents/core/shopify-admin.js';

// ━━━ Zod スキーマ ━━━

const GidMenu = z
  .string()
  .regex(/^gid:\/\/shopify\/Menu\/\d+$/, '無効な menu ID です');

/** menu item の handle として安全な文字範囲 (英数字 + ハイフン + アンダースコア) */
const HandleSchema = z
  .string()
  .min(1, 'handle は必須です')
  .max(60, 'handle は 60 文字以内')
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'handle は英数字/ハイフン/アンダースコアのみ');

const TitleSchema = z
  .string()
  .min(1, 'title は必須です')
  .max(120, 'title は 120 文字以内');

/** MenuItemType enum (Shopify 2025-10 schema) */
const MenuItemTypeSchema = z.enum([
  'FRONTPAGE',
  'COLLECTION',
  'COLLECTIONS',
  'CATALOG',
  'PRODUCT',
  'PAGE',
  'BLOG',
  'ARTICLE',
  'SEARCH',
  'SHOP_POLICY',
  'CUSTOMER_ACCOUNT_PAGE',
  'METAOBJECT',
  'HTTP',
]);

/** resourceId: GID 形式 (HTTP 以外の type で使う) */
const ResourceIdSchema = z
  .string()
  .regex(/^gid:\/\/shopify\/[A-Za-z]+\/\d+$/, '無効な resourceId です (gid 形式で指定)');

/** url: HTTP 型の URL (相対 or http/https, 危険スキーム排除) */
const MenuUrlSchema = z
  .string()
  .min(1, 'url は必須です')
  .max(2048, 'url は 2048 文字以内')
  .refine((v) => v.startsWith('/') || /^https?:\/\//i.test(v), {
    message: 'url は / で始まる相対パスか http(s):// で始まる絶対URL',
  })
  .refine((v) => !/^\s*(javascript|data|file|vbscript):/i.test(v), {
    message: '危険なスキームは指定できません',
  });

const TagsSchema = z.array(z.string().max(80)).max(20).optional();

/**
 * 再帰メニュー項目 schema (深さ 3 まで)
 * Shopify 仕様で depth=3 以上は受け付けないので上限を切る
 */
type MenuItemInputRaw = {
  id?: string;
  title: string;
  type: ShopifyMenuItemType;
  resourceId?: string;
  url?: string;
  tags?: string[];
  items?: MenuItemInputRaw[];
};

const MenuItemBaseShape = {
  id: z.string().regex(/^gid:\/\/shopify\/MenuItem\/\d+$/, '無効な menuItem ID').optional(),
  title: TitleSchema,
  type: MenuItemTypeSchema,
  resourceId: ResourceIdSchema.optional(),
  url: MenuUrlSchema.optional(),
  tags: TagsSchema,
};

/** depth 3 のリーフ (children 不可) */
const MenuItemLeafSchema: z.ZodType<MenuItemInputRaw> = z.object(MenuItemBaseShape).strict();

/** depth 2 (children は depth 3 まで) */
const MenuItemDepth2Schema: z.ZodType<MenuItemInputRaw> = z
  .object({
    ...MenuItemBaseShape,
    items: z.array(MenuItemLeafSchema).max(30).optional(),
  })
  .strict();

/** depth 1 (children は depth 2 まで) */
const MenuItemDepth1Schema: z.ZodType<MenuItemInputRaw> = z
  .object({
    ...MenuItemBaseShape,
    items: z.array(MenuItemDepth2Schema).max(30).optional(),
  })
  .strict();

const MenuItemsSchema = z.array(MenuItemDepth1Schema).max(40);

const CreateSchema = z
  .object({
    action: z.literal('create'),
    title: TitleSchema,
    handle: HandleSchema,
    items: MenuItemsSchema.optional(),
  })
  .strict();

const UpdateSchema = z
  .object({
    action: z.literal('update'),
    id: GidMenu,
    title: TitleSchema,
    handle: HandleSchema,
    items: MenuItemsSchema,
  })
  .strict();

const DeleteSchema = z
  .object({
    action: z.literal('delete'),
    id: GidMenu,
  })
  .strict();

// patch 0069 で学んだ Zod の罠:
//   discriminatedUnion は discriminator field の全 variant で値が unique でないと
//   module-load 時に同期 throw する。create/update/delete は値が全て別なので OK。
const MenuActionSchema = z.discriminatedUnion('action', [CreateSchema, UpdateSchema, DeleteSchema]);

// ━━━ GET: 一覧取得 or 詳細取得 ━━━

export async function loader({request, context}: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.menus', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);

  try {
    const {verifyAdminAuth} = await import('~/lib/admin-auth');
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const sessionFromContext = (context as unknown as {session?: AppSession}).session;
    const session =
      sessionFromContext ??
      (await AppSession.init(request, [
        String((contextEnv as unknown as {SESSION_SECRET?: string}).SESSION_SECRET || ''),
      ]));
    const role = requirePermission(session as AppSession, 'products.view');

    const {setAdminEnv, getAdminClient} = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv as unknown as Record<string, string | undefined>);
    const client = getAdminClient();

    const url = new URL(request.url);
    const idParam = url.searchParams.get('id');

    // 詳細取得モード
    if (idParam) {
      if (!/^gid:\/\/shopify\/Menu\/\d+$/.test(idParam)) {
        return data(
          {success: false, error: '無効な menu ID です'},
          {status: 400},
        );
      }
      auditLog({
        action: 'api_access',
        role,
        resource: `api/admin/menus [GET id=${idParam}]`,
        success: true,
      });
      const menu = await client.getMenu(idParam);
      return data({success: true, menu});
    }

    // 一覧モード
    const first = Math.min(
      Math.max(Number(url.searchParams.get('limit')) || 50, 1),
      100,
    );
    const cursor = url.searchParams.get('cursor') || undefined;

    auditLog({
      action: 'api_access',
      role,
      resource: 'api/admin/menus [GET]',
      success: true,
    });

    const {items, pageInfo} = await client.listMenus(first, cursor);
    return data({success: true, menus: items, pageInfo, total: items.length});
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    auditLog({
      action: 'api_error',
      role: null,
      resource: 'api/admin/menus [GET]',
      success: false,
      detail: msg,
    });
    return data(
      {success: false, error: `メニュー取得に失敗しました: ${msg}`},
      {status: 500},
    );
  }
}

// ━━━ POST: CRUD ━━━

export async function action({request, context}: Route.ActionArgs) {
  const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.menus', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  if (request.method !== 'POST') {
    return data({error: 'Method not allowed'}, {status: 405});
  }

  try {
    const {verifyAdminAuth} = await import('~/lib/admin-auth');
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const sessionFromContext = (context as unknown as {session?: AppSession}).session;
    const session =
      sessionFromContext ??
      (await AppSession.init(request, [
        String((contextEnv as unknown as {SESSION_SECRET?: string}).SESSION_SECRET || ''),
      ]));
    const role = requirePermission(session as AppSession, 'products.edit');

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({success: false, error: 'Invalid JSON body'}, {status: 400});
    }

    const parsed = MenuActionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return data(
        {
          success: false,
          error: '入力値が無効です',
          details: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
        },
        {status: 400},
      );
    }

    const body = parsed.data;

    const {setAdminEnv, getAdminClient} = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv as unknown as Record<string, string | undefined>);
    const client = getAdminClient();

    switch (body.action) {
      case 'create': {
        const result = await client.createMenu({
          title: body.title,
          handle: body.handle,
          items: (body.items ?? []) as ShopifyMenuItem[],
        });
        auditLog({
          action: 'menu_create',
          role,
          resource: `api/admin/menus [${result.handle}]`,
          success: true,
          detail: `id=${result.id} title=${result.title}`,
        });
        return data({success: true, id: result.id, handle: result.handle, title: result.title});
      }
      case 'update': {
        // patch 0113 (P1-3, 全保存パターン監査 2026-04-22):
        // menuUpdate は items[] 全置換が Shopify 仕様。事前に現在値を取得して
        // updateMenu に渡し、kept/added/removed/renamed の diff を計算する。
        // 失敗 (権限不足/idなし等) は致命ではないので catch して silent fallback。
        let currentItems: ShopifyMenuItem[] | undefined;
        try {
          const currentMenu = await client.getMenu(body.id);
          currentItems = currentMenu?.items;
        } catch {
          currentItems = undefined;
        }

        const result = await client.updateMenu(body.id, {
          title: body.title,
          handle: body.handle,
          items: body.items as ShopifyMenuItem[],
          currentItems,
        });

        const diffStr = result.diff
          ? `kept=${result.diff.kept} added=${result.diff.added} removed=${result.diff.removed} renamed=${result.diff.renamed} (current=${result.diff.totalCurrent} incoming=${result.diff.totalIncoming})`
          : `items=${body.items.length} (no diff baseline)`;

        auditLog({
          action: 'menu_update',
          role,
          resource: `api/admin/menus [${result.handle}]`,
          success: true,
          detail: `id=${body.id} ${diffStr}`,
        });
        return data({
          success: true,
          id: result.id,
          handle: result.handle,
          title: result.title,
          diff: result.diff,
        });
      }
      case 'delete': {
        const result = await client.deleteMenu(body.id);
        auditLog({
          action: 'menu_delete',
          role,
          resource: `api/admin/menus [${body.id}]`,
          success: true,
          detail: result.notFound ? 'not-found (idempotent)' : 'deleted',
        });
        return data({success: true, id: body.id, notFound: result.notFound});
      }
      default: {
        // exhaustive check
        const _: never = body;
        return data({success: false, error: 'Unknown action'}, {status: 400});
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    auditLog({
      action: 'api_error',
      role: null,
      resource: 'api/admin/menus [POST]',
      success: false,
      detail: msg,
    });
    return data(
      {success: false, error: `メニュー操作に失敗しました: ${msg}`},
      {status: 500},
    );
  }
}
