/**
 * 画像アップロード API — Sprint 7
 *
 * POST actions:
 *   staged_upload: Shopify staged upload URL を取得
 *   attach_product: 商品にメディアを紐付け
 *   create_file: staged upload 完了後にファイルを登録
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC → AuditLog → CSRF(POST) → Zod
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.images';
import { z } from 'zod';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

const ImageActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('staged_upload'),
    filename: z.string().min(1).max(255),
    mimeType: z.string().regex(/^image\/(jpeg|png|gif|webp)$/, '対応形式: JPEG/PNG/GIF/WebP'),
    fileSize: z.number().int().min(1).max(20_971_520), // 20MB
  }).strict(),
  z.object({
    action: z.literal('attach_product'),
    productId: z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/),
    resourceUrl: z.string().url(),
    alt: z.string().max(500).optional().default(''),
  }).strict(),
  z.object({
    action: z.literal('create_file'),
    resourceUrl: z.string().url(),
    alt: z.string().max(500).optional().default(''),
  }).strict(),
]);

export async function action({ request, context }: Route.ActionArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.images', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const sharedSession = (context as unknown as {session?: AppSession}).session;
    const session = sharedSession ?? await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = ImageActionSchema.safeParse(rawBody);
    if (!validation.success) {
      return data({
        error: '入力値が無効です',
        details: validation.error.errors.map((e) => e.message),
      }, { status: 400 });
    }

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();
    const v = validation.data;

    switch (v.action) {
      case 'staged_upload': {
        const role = requirePermission(session, 'products.edit');
        const result = await client.createStagedUpload(v.filename, v.mimeType, v.fileSize);
        auditLog({ action: 'settings_change', role, resource: 'staged_upload', detail: v.filename, success: true });
        return data({ success: true, stagedTarget: result });
      }

      case 'attach_product': {
        const role = requirePermission(session, 'products.edit');
        const result = await client.productImageCreate(v.productId, v.resourceUrl, v.alt);
        auditLog({ action: 'product_update', role, resource: `product/${v.productId}/media`, detail: 'image_attach', success: true });
        return data({ success: true, media: result });
      }

      case 'create_file': {
        const role = requirePermission(session, 'products.edit');
        const result = await client.createFileFromUrl(v.resourceUrl, v.alt);
        auditLog({ action: 'settings_change', role, resource: `file/${result.id}`, detail: 'file_create', success: true });
        return data({ success: true, file: result });
      }

      default:
        return data({ error: '不明なアクションです' }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `画像操作失敗: ${msg}` }, { status: 500 });
  }
}
