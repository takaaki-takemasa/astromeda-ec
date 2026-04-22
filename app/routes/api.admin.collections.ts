/**
 * コレクション管理 API — patch 0064 (管理画面完結化 P0)
 *
 * CEO 指摘「Shopify で先にやって管理画面に戻る二段階をやめたい」に応え、
 * 管理画面から Shopify コレクションを CRUD する API。
 *
 * GET:
 *   - 一覧: ?limit=50&cursor=xxx&query=xxx
 *   - 詳細: ?id=gid://shopify/Collection/...
 * POST:
 *   - create: 新規コレクション作成（手動 or スマート: ruleSet 指定）
 *   - update: タイトル/本文/画像/ルールセット等の更新
 *   - delete: コレクション削除
 *
 * セキュリティ: RateLimit → CSRF → AdminAuth → RBAC → Zod → AuditLog
 */

import {data} from 'react-router';
import type {Route} from './+types/api.admin.collections';
import {z} from 'zod';
import {applyRateLimit, RATE_LIMIT_PRESETS} from '~/lib/rate-limiter';
import {requirePermission} from '~/lib/rbac';
import {auditLog} from '~/lib/audit-log';
import {AppSession} from '~/lib/session';
import {verifyCsrfForAdmin} from '~/lib/csrf-middleware';
import {expectedUpdatedAtField, validateExpectedUpdatedAt, casConflictResponse} from '~/lib/expected-updated-at';

// ── Zod スキーマ ──

const GidCollection = z
  .string()
  .regex(/^gid:\/\/shopify\/Collection\/\d+$/, '無効な collectionId です');

const SmartRule = z
  .object({
    column: z.enum([
      'TAG',
      'TITLE',
      'TYPE',
      'VENDOR',
      'VARIANT_PRICE',
      'IS_PRICE_REDUCED',
      'VARIANT_COMPARE_AT_PRICE',
      'VARIANT_WEIGHT',
      'VARIANT_INVENTORY',
    ]),
    relation: z.enum([
      'EQUALS',
      'NOT_EQUALS',
      'GREATER_THAN',
      'LESS_THAN',
      'STARTS_WITH',
      'ENDS_WITH',
      'CONTAINS',
      'NOT_CONTAINS',
      'IS_SET',
      'IS_NOT_SET',
    ]),
    condition: z.string().min(1).max(255),
  })
  .strict();

const RuleSetSchema = z
  .object({
    appliedDisjunctively: z.boolean(),
    rules: z.array(SmartRule).min(1).max(20),
  })
  .strict();

const ImageSchema = z
  .object({
    id: z.string().regex(/^gid:\/\/shopify\/(MediaImage|GenericFile)\/\d+$/).optional(),
    src: z.string().url().max(2048).optional(),
    altText: z.string().max(500).optional(),
  })
  .strict()
  .refine((v) => !!v.id || !!v.src, {message: 'image には id か src のいずれかが必要です'});

const CollectionInputShape = {
  title: z.string().min(1).max(255),
  descriptionHtml: z.string().max(65_535).optional(),
  handle: z
    .string()
    .regex(/^[a-z0-9][a-z0-9\-]{0,200}$/i, 'handle は 英数字とハイフンのみ')
    .optional(),
  image: ImageSchema.optional(),
  ruleSet: RuleSetSchema.optional(),
  seo: z
    .object({
      title: z.string().max(255).optional(),
      description: z.string().max(2048).optional(),
    })
    .strict()
    .optional(),
  sortOrder: z
    .enum([
      'MANUAL',
      'BEST_SELLING',
      'ALPHA_ASC',
      'ALPHA_DESC',
      'PRICE_ASC',
      'PRICE_DESC',
      'CREATED',
      'CREATED_DESC',
    ])
    .optional(),
  templateSuffix: z.string().max(255).optional(),
};

const CreateSchema = z
  .object({
    action: z.literal('create'),
    ...CollectionInputShape,
  })
  .strict();

const UpdateSchema = z
  .object({
    action: z.literal('update'),
    id: GidCollection,
    title: z.string().min(1).max(255).optional(),
    descriptionHtml: z.string().max(65_535).optional(),
    handle: z
      .string()
      .regex(/^[a-z0-9][a-z0-9\-]{0,200}$/i)
      .optional(),
    image: ImageSchema.nullable().optional(),
    ruleSet: RuleSetSchema.nullable().optional(),
    seo: z
      .object({
        title: z.string().max(255).optional(),
        description: z.string().max(2048).optional(),
      })
      .strict()
      .optional(),
    sortOrder: CreateSchema.shape.sortOrder,
    templateSuffix: z.string().max(255).optional(),
    // patch 0115: P2-5 楽観的ロック (CAS) — 別ユーザーの上書きを 409 で防ぐ。送信任意・後方互換。
    expectedUpdatedAt: expectedUpdatedAtField,
  })
  .strict();

const DeleteSchema = z
  .object({
    action: z.literal('delete'),
    id: GidCollection,
    // patch 0114: P1-4 削除確認の二重化（誤削除防止）
    confirm: z.literal(true, {
      errorMap: () => ({ message: '削除には確認 (confirm:true) が必要です' }),
    }),
  })
  .strict();

const CollectionActionSchema = z.discriminatedUnion('action', [
  CreateSchema,
  UpdateSchema,
  DeleteSchema,
]);

// ── GET: 一覧 or 詳細 ──

export async function loader({request, context}: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.collections', RATE_LIMIT_PRESETS.admin);
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
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    const url = new URL(request.url);
    const idParam = url.searchParams.get('id');

    // 詳細取得モード
    if (idParam) {
      const parsed = GidCollection.safeParse(idParam);
      if (!parsed.success) {
        return data({success: false, error: '無効な collectionId です'}, {status: 400});
      }
      auditLog({
        action: 'api_access',
        role,
        resource: `api/admin/collections [GET detail ${idParam}]`,
        success: true,
      });
      const collection = await client.getCollectionDetail(idParam);
      if (!collection) {
        return data({success: false, error: 'コレクションが見つかりません'}, {status: 404});
      }
      return data({success: true, collection});
    }

    // 一覧モード
    const first = Math.min(
      Math.max(Number(url.searchParams.get('limit')) || 50, 1),
      100,
    );
    const queryStr = url.searchParams.get('query') || undefined;
    const cursor = url.searchParams.get('cursor') || undefined;

    auditLog({
      action: 'api_access',
      role,
      resource: 'api/admin/collections [GET]',
      success: true,
    });

    const {collections, pageInfo} = await client.listCollectionsAdmin(first, queryStr, cursor);
    return data({success: true, collections, pageInfo, total: collections.length});
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    auditLog({
      action: 'api_error',
      role: 'unknown',
      resource: 'api/admin/collections [GET]',
      success: false,
      detail: msg,
    });
    return data(
      {success: false, error: `コレクション取得に失敗しました: ${msg}`},
      {status: 500},
    );
  }
}

// ── POST: CRUD ──

export async function action({request, context}: Route.ActionArgs) {
  const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.collections', RATE_LIMIT_PRESETS.admin);
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

    const parsed = CollectionActionSchema.safeParse(rawBody);
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
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    switch (body.action) {
      case 'create': {
        const {action: _ignored, ...input} = body;
        // image.id が MediaImage GID 以外の場合は src のみ送る（Shopify 側仕様に合わせる）
        const result = await client.createCollection(input);
        auditLog({
          action: 'collection_create',
          role,
          resource: `api/admin/collections [${result.handle}]`,
          success: true,
          detail: `id=${result.id} title=${body.title}`,
        });
        return data({success: true, id: result.id, handle: result.handle});
      }
      case 'update': {
        const {action: _ignored, id, expectedUpdatedAt, ...fields} = body;

        // patch 0115: P2-5 楽観的ロック CAS — expectedUpdatedAt 送信時のみ発火
        if (expectedUpdatedAt) {
          const current = await client.getCollectionDetail(id);
          const cas = validateExpectedUpdatedAt(current, expectedUpdatedAt);
          if (!cas.ok) {
            auditLog({
              action: 'collection_update',
              role,
              resource: `api/admin/collections [${id}]`,
              detail: 'collection_update_cas_conflict',
              success: false,
            });
            return casConflictResponse(current, cas.currentUpdatedAt);
          }
        }

        // null を明示的に渡したいケース（image/ruleSet 削除）は現状未対応 — Shopify は undefined 無視
        const cleaned = Object.fromEntries(
          Object.entries(fields).filter(([, v]) => v !== null && v !== undefined),
        ) as Parameters<typeof client.updateCollection>[1];
        const result = await client.updateCollection(id, cleaned);
        auditLog({
          action: 'collection_update',
          role,
          resource: `api/admin/collections [${result.handle}]`,
          success: true,
          detail: `id=${id} fields=${Object.keys(cleaned).join(',')}`,
        });
        return data({success: true, id: result.id, handle: result.handle});
      }
      case 'delete': {
        const {id} = body;
        await client.deleteCollection(id);
        auditLog({
          action: 'collection_delete',
          role,
          resource: `api/admin/collections [${id}]`,
          success: true,
        });
        return data({success: true, id});
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
      role: 'unknown',
      resource: 'api/admin/collections [POST]',
      success: false,
      detail: msg,
    });
    return data(
      {success: false, error: `コレクション操作に失敗しました: ${msg}`},
      {status: 500},
    );
  }
}
