/**
 * Discount Code (Basic) CRUD API — patch 0069 (管理画面完結化 P5)
 *
 * CEO 指摘「Shopify admin を開かせず管理画面で完結させたい」の P5。
 * Shopify の Discount Code Basic を admin から一覧・作成・削除できるようにする。
 * これによりキャンペーンコード (例: SPRING10 で 10% OFF) を CEO が単独発行できる。
 *
 * 効果器: キャンペーン配信（心臓→末梢までホルモンを流す）
 *
 * GET:
 *   - /api/admin/discounts?limit=50&cursor=xxx
 *
 * POST:
 *   - create:  { action: "create", title, code, kind: "percentage"|"fixed_amount",
 *               percentage?, fixedAmount?, startsAt, endsAt?, usageLimit?, appliesOncePerCustomer? }
 *   - delete:  { action: "delete", id, confirm: true }
 *
 * セキュリティ: RateLimit → CSRF → AdminAuth → RBAC(marketing.edit) → Zod → AuditLog
 *
 * 必要 Shopify scope: read_discounts, write_discounts
 * (未付与の場合は app v9 で scope 拡張＋OAuth 再認可が必要)
 */

import {data} from 'react-router';
import type {Route} from './+types/api.admin.discounts';
import {z} from 'zod';
import {applyRateLimit, RATE_LIMIT_PRESETS} from '~/lib/rate-limiter';
import {requirePermission} from '~/lib/rbac';
import {auditLog} from '~/lib/audit-log';
import {AppSession} from '~/lib/session';
import {verifyCsrfForAdmin} from '~/lib/csrf-middleware';

// ━━━ Zod スキーマ ━━━

/** Shopify Discount Code は英数字＋一部記号（チェックアウト入力用なので大文字推奨）*/
const DiscountCode = z
  .string()
  .min(1, 'code は必須')
  .max(40, 'code は 40 文字以内')
  .regex(/^[A-Za-z0-9_\-]+$/, 'code は英数字・アンダースコア・ハイフンのみ');

const GidDiscountNode = z
  .string()
  .regex(
    /^gid:\/\/shopify\/DiscountCodeNode\/\d+$/,
    '無効な割引 ID です（gid://shopify/DiscountCodeNode/... が必要）',
  );

const IsoDateTime = z.string().refine(
  (v) => !Number.isNaN(Date.parse(v)),
  'startsAt/endsAt は ISO 8601 形式の日時が必要です',
);

const CreatePercentageSchema = z
  .object({
    action: z.literal('create'),
    title: z.string().min(1).max(255),
    code: DiscountCode,
    kind: z.literal('percentage'),
    percentage: z
      .number()
      .gt(0, 'percentage は 0 より大きい必要があります')
      .lte(1, 'percentage は 1 以下 (= 100%) である必要があります'),
    startsAt: IsoDateTime,
    endsAt: IsoDateTime.nullable().optional(),
    usageLimit: z.number().int().positive().nullable().optional(),
    appliesOncePerCustomer: z.boolean().optional().default(false),
  })
  .strict();

const CreateFixedAmountSchema = z
  .object({
    action: z.literal('create'),
    title: z.string().min(1).max(255),
    code: DiscountCode,
    kind: z.literal('fixed_amount'),
    fixedAmount: z.number().positive('fixedAmount は 0 より大きい必要があります'),
    startsAt: IsoDateTime,
    endsAt: IsoDateTime.nullable().optional(),
    usageLimit: z.number().int().positive().nullable().optional(),
    appliesOncePerCustomer: z.boolean().optional().default(false),
  })
  .strict();

const DeleteSchema = z
  .object({
    action: z.literal('delete'),
    id: GidDiscountNode,
    /** UI 確認の二重化（誤削除防止） */
    confirm: z.literal(true),
  })
  .strict();

const ActionSchema = z.discriminatedUnion('action', [
  CreatePercentageSchema,
  CreateFixedAmountSchema,
  DeleteSchema,
]);

// ━━━ GET: 一覧 ━━━

export async function loader({request, context}: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.discounts', RATE_LIMIT_PRESETS.admin);
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
    // 閲覧は marketing.view が最小権限（存在しない場合は marketing.edit にフォールバック）
    let role: string;
    try {
      role = requirePermission(session as AppSession, 'marketing.view');
    } catch {
      role = requirePermission(session as AppSession, 'marketing.edit');
    }

    const {setAdminEnv, getAdminClient} = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    const url = new URL(request.url);
    const first = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100);
    const cursor = url.searchParams.get('cursor') || undefined;

    const {items, pageInfo} = await client.listDiscountCodes(first, cursor);

    auditLog({
      action: 'api_access',
      role,
      resource: 'api/admin/discounts [GET]',
      success: true,
      detail: `items=${items.length}`,
    });

    return data({success: true, discounts: items, pageInfo, total: items.length});
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    auditLog({
      action: 'api_error',
      role: 'unknown',
      resource: 'api/admin/discounts [GET]',
      success: false,
      detail: msg,
    });
    return data(
      {success: false, error: `割引コード取得に失敗しました: ${msg}`},
      {status: 500},
    );
  }
}

// ━━━ POST: create / delete ━━━

export async function action({request, context}: Route.ActionArgs) {
  const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.discounts', RATE_LIMIT_PRESETS.admin);
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
    const role = requirePermission(session as AppSession, 'marketing.edit');

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({success: false, error: 'Invalid JSON body'}, {status: 400});
    }

    const parsed = ActionSchema.safeParse(rawBody);
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
        const created =
          body.kind === 'percentage'
            ? await client.createDiscountCodeBasic({
                title: body.title,
                code: body.code,
                kind: 'percentage',
                percentage: body.percentage,
                startsAt: body.startsAt,
                endsAt: body.endsAt ?? null,
                usageLimit: body.usageLimit ?? null,
                appliesOncePerCustomer: body.appliesOncePerCustomer,
              })
            : await client.createDiscountCodeBasic({
                title: body.title,
                code: body.code,
                kind: 'fixed_amount',
                fixedAmount: body.fixedAmount,
                startsAt: body.startsAt,
                endsAt: body.endsAt ?? null,
                usageLimit: body.usageLimit ?? null,
                appliesOncePerCustomer: body.appliesOncePerCustomer,
              });
        auditLog({
          action: 'discount_create',
          role,
          resource: `api/admin/discounts [${body.code}]`,
          success: true,
          detail: `kind=${body.kind} id=${created.id}`,
        });
        return data({success: true, id: created.id, code: created.code, title: created.title});
      }
      case 'delete': {
        const {deletedId, notFound} = await client.deleteDiscountCode(body.id);
        auditLog({
          action: 'discount_delete',
          role,
          resource: `api/admin/discounts [${body.id}]`,
          success: true,
          detail: notFound ? 'not_found (idempotent)' : `deleted=${deletedId ?? body.id}`,
        });
        return data({
          success: true,
          deletedId: deletedId ?? (notFound ? null : body.id),
          notFound,
        });
      }
      default: {
        const _: never = body;
        return data({success: false, error: 'Unknown action'}, {status: 400});
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    auditLog({
      action: 'api_error',
      role: 'unknown',
      resource: 'api/admin/discounts [POST]',
      success: false,
      detail: msg,
    });
    return data(
      {success: false, error: `割引コード操作に失敗しました: ${msg}`},
      {status: 500},
    );
  }
}
