/**
 * URL リダイレクト管理 API — patch 0066 (管理画面完結化 P2)
 *
 * CEO 指摘「Shopify で先にやって管理画面に戻る二段階をやめたい」に応え、
 * 管理画面から Shopify URL リダイレクトを CRUD する API。
 *
 * 効果器: 記憶の再経路化（旧URL→新URLへ神経経路を接続）
 *
 * GET:
 *   - 一覧: ?limit=50&cursor=xxx&query=xxx
 * POST:
 *   - create: 新規リダイレクト作成
 *   - update: path / target の更新
 *   - delete: リダイレクト削除
 *
 * セキュリティ: RateLimit → CSRF → AdminAuth → RBAC → Zod → AuditLog
 */

import {data} from 'react-router';
import type {Route} from './+types/api.admin.redirects';
import {z} from 'zod';
import {applyRateLimit, RATE_LIMIT_PRESETS} from '~/lib/rate-limiter';
import {requirePermission} from '~/lib/rbac';
import {auditLog} from '~/lib/audit-log';
import {AppSession} from '~/lib/session';
import {verifyCsrfForAdmin} from '~/lib/csrf-middleware';

// ━━━ Zod スキーマ ━━━

const GidUrlRedirect = z
  .string()
  .regex(/^gid:\/\/shopify\/UrlRedirect\/\d+$/, '無効な urlRedirect ID です');

/**
 * path: リダイレクト元（ストア内の相対パス）
 *   - 先頭スラッシュ必須
 *   - 最大 2048 文字（Shopify 仕様）
 *   - 外部 URL（http/https 始まり）は不可
 */
const PathSchema = z
  .string()
  .min(1, 'path は必須です')
  .max(2048, 'path は 2048 文字以内')
  .regex(/^\//, 'path は / で始まる相対パスである必要があります')
  .refine((v) => !/^\/?https?:/i.test(v), {message: 'path に絶対URLは指定できません'});

/**
 * target: リダイレクト先
 *   - 相対パス（/ で始まる）または絶対 URL (http/https)
 *   - javascript:, data:, file: 等の危険スキームは排除
 */
const TargetSchema = z
  .string()
  .min(1, 'target は必須です')
  .max(2048, 'target は 2048 文字以内')
  .refine(
    (v) => v.startsWith('/') || /^https?:\/\//i.test(v),
    {message: 'target は / から始まる相対パスか http(s):// で始まる絶対URL'},
  )
  .refine((v) => !/^\s*(javascript|data|file|vbscript):/i.test(v), {
    message: '危険なスキームは指定できません',
  });

const CreateSchema = z
  .object({
    action: z.literal('create'),
    path: PathSchema,
    target: TargetSchema,
  })
  .strict();

const UpdateSchema = z
  .object({
    action: z.literal('update'),
    id: GidUrlRedirect,
    path: PathSchema,
    target: TargetSchema,
  })
  .strict();

const DeleteSchema = z
  .object({
    action: z.literal('delete'),
    id: GidUrlRedirect,
    // patch 0114: P1-4 削除確認の二重化（誤削除防止）
    confirm: z.literal(true, {
      errorMap: () => ({ message: '削除には確認 (confirm:true) が必要です' }),
    }),
  })
  .strict();

const RedirectActionSchema = z.discriminatedUnion('action', [
  CreateSchema,
  UpdateSchema,
  DeleteSchema,
]);

// ━━━ GET: 一覧取得 ━━━

export async function loader({request, context}: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.redirects', RATE_LIMIT_PRESETS.admin);
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
    const first = Math.min(
      Math.max(Number(url.searchParams.get('limit')) || 50, 1),
      100,
    );
    const queryStr = url.searchParams.get('query') || undefined;
    const cursor = url.searchParams.get('cursor') || undefined;

    auditLog({
      action: 'api_access',
      role,
      resource: 'api/admin/redirects [GET]',
      success: true,
    });

    const {items, pageInfo} = await client.listUrlRedirects(first, queryStr, cursor);
    return data({success: true, redirects: items, pageInfo, total: items.length});
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    auditLog({
      action: 'api_error',
      role: 'unknown',
      resource: 'api/admin/redirects [GET]',
      success: false,
      detail: msg,
    });
    return data(
      {success: false, error: `リダイレクト取得に失敗しました: ${msg}`},
      {status: 500},
    );
  }
}

// ━━━ POST: CRUD ━━━

export async function action({request, context}: Route.ActionArgs) {
  const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.redirects', RATE_LIMIT_PRESETS.admin);
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

    const parsed = RedirectActionSchema.safeParse(rawBody);
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
        const result = await client.createUrlRedirect({path: body.path, target: body.target});
        auditLog({
          action: 'url_redirect_create',
          role,
          resource: `api/admin/redirects [${result.path} → ${result.target}]`,
          success: true,
          detail: `id=${result.id}`,
        });
        return data({success: true, id: result.id, path: result.path, target: result.target});
      }
      case 'update': {
        const result = await client.updateUrlRedirect(body.id, {
          path: body.path,
          target: body.target,
        });
        auditLog({
          action: 'url_redirect_update',
          role,
          resource: `api/admin/redirects [${result.path} → ${result.target}]`,
          success: true,
          detail: `id=${body.id}`,
        });
        return data({success: true, id: result.id, path: result.path, target: result.target});
      }
      case 'delete': {
        await client.deleteUrlRedirect(body.id);
        auditLog({
          action: 'url_redirect_delete',
          role,
          resource: `api/admin/redirects [${body.id}]`,
          success: true,
        });
        return data({success: true, id: body.id});
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
      resource: 'api/admin/redirects [POST]',
      success: false,
      detail: msg,
    });
    return data(
      {success: false, error: `リダイレクト操作に失敗しました: ${msg}`},
      {status: 500},
    );
  }
}
