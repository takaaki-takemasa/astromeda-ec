/**
 * Shopify Files ライブラリ管理 API — patch 0067 (管理画面完結化 P3)
 *
 * CEO 指摘「Shopify で先にやって管理画面に戻る二段階をやめたい」の P3。
 * Shopify Files ライブラリ（画像/動画/汎用ファイル）を管理画面から一覧・削除できるようにする。
 * アップロード（fileCreate）は既存 /api/admin/images に配管済み。
 *
 * 効果器: 倉庫の棚卸し（在庫の可視化と撤去）
 *
 * GET:
 *   - 一覧: ?limit=50&cursor=xxx&query=xxx&type=IMAGE|VIDEO|FILE
 *   - query は Shopify Files 検索構文
 *     例) media_type:IMAGE AND filename:hero*
 *   - type=IMAGE | VIDEO | FILE は media_type への簡易マッピング
 *
 * POST:
 *   - delete_single: { action: "delete", id: gid } 単一削除
 *   - delete_bulk:   { action: "delete_bulk", ids: [gid, ...] } 複数削除
 *
 * セキュリティ: RateLimit → CSRF → AdminAuth → RBAC → Zod → AuditLog
 */

import {data} from 'react-router';
import type {Route} from './+types/api.admin.files';
import {z} from 'zod';
import {applyRateLimit, RATE_LIMIT_PRESETS} from '~/lib/rate-limiter';
import {requirePermission} from '~/lib/rbac';
import {auditLog} from '~/lib/audit-log';
import {AppSession} from '~/lib/session';
import {verifyCsrfForAdmin} from '~/lib/csrf-middleware';

// ━━━ Zod スキーマ ━━━

const GidFile = z
  .string()
  .regex(
    /^gid:\/\/shopify\/(MediaImage|GenericFile|Video)\/\d+$/,
    '無効な file ID です（MediaImage/GenericFile/Video のいずれかの gid が必要）',
  );

const DeleteSingleSchema = z
  .object({
    action: z.literal('delete'),
    id: GidFile,
  })
  .strict();

const DeleteBulkSchema = z
  .object({
    action: z.literal('delete_bulk'),
    ids: z.array(GidFile).min(1, 'ids は 1 件以上必要').max(100, 'ids は最大 100 件'),
  })
  .strict();

const FilesActionSchema = z.discriminatedUnion('action', [
  DeleteSingleSchema,
  DeleteBulkSchema,
]);

// ━━━ 便利関数: UI からの簡易 type を Shopify 検索構文に変換 ━━━

function buildFilesQuery(queryRaw: string | null, typeRaw: string | null): string | undefined {
  const clauses: string[] = [];

  if (typeRaw) {
    const t = typeRaw.toUpperCase();
    if (t === 'IMAGE') clauses.push('media_type:IMAGE');
    else if (t === 'VIDEO') clauses.push('media_type:VIDEO');
    else if (t === 'FILE') clauses.push('media_type:GENERIC_FILE');
    // 他の値は無視（自由文字列を認めない）
  }

  if (queryRaw) {
    // ユーザーのフリーテキストは filename サーフェスのみに絞る（安全策）
    // 一文字コロンが混じっている場合は高度検索として通す
    const safeFree = queryRaw.trim().replace(/[\s"']/g, ' ').slice(0, 200);
    if (safeFree) {
      if (safeFree.includes(':')) {
        clauses.push(`(${safeFree})`);
      } else {
        clauses.push(`filename:*${safeFree}*`);
      }
    }
  }

  return clauses.length > 0 ? clauses.join(' AND ') : undefined;
}

// ━━━ GET: 一覧取得 ━━━

export async function loader({request, context}: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.files', RATE_LIMIT_PRESETS.admin);
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
    const cursor = url.searchParams.get('cursor') || undefined;
    const queryRaw = url.searchParams.get('query');
    const typeRaw = url.searchParams.get('type');
    const finalQuery = buildFilesQuery(queryRaw, typeRaw);

    auditLog({
      action: 'api_access',
      role,
      resource: 'api/admin/files [GET]',
      success: true,
      detail: finalQuery ? `query=${finalQuery}` : undefined,
    });

    const {items, pageInfo} = await client.listFiles(first, finalQuery, cursor);
    return data({success: true, files: items, pageInfo, total: items.length});
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    auditLog({
      action: 'api_error',
      role: 'unknown',
      resource: 'api/admin/files [GET]',
      success: false,
      detail: msg,
    });
    return data(
      {success: false, error: `ファイル取得に失敗しました: ${msg}`},
      {status: 500},
    );
  }
}

// ━━━ POST: 削除 ━━━

export async function action({request, context}: Route.ActionArgs) {
  const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.files', RATE_LIMIT_PRESETS.admin);
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

    const parsed = FilesActionSchema.safeParse(rawBody);
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
      case 'delete': {
        const {deletedFileIds} = await client.deleteFiles([body.id]);
        auditLog({
          action: 'file_delete',
          role,
          resource: `api/admin/files [${body.id}]`,
          success: true,
          detail: `deleted=${deletedFileIds.length}`,
        });
        return data({
          success: true,
          deletedFileIds,
          requested: 1,
          deleted: deletedFileIds.length,
        });
      }
      case 'delete_bulk': {
        const {deletedFileIds} = await client.deleteFiles(body.ids);
        auditLog({
          action: 'file_delete',
          role,
          resource: `api/admin/files [bulk:${body.ids.length}]`,
          success: true,
          detail: `requested=${body.ids.length} deleted=${deletedFileIds.length}`,
        });
        return data({
          success: true,
          deletedFileIds,
          requested: body.ids.length,
          deleted: deletedFileIds.length,
        });
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
      resource: 'api/admin/files [POST]',
      success: false,
      detail: msg,
    });
    return data(
      {success: false, error: `ファイル操作に失敗しました: ${msg}`},
      {status: 500},
    );
  }
}
