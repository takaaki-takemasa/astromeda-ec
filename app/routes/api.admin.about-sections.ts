/**
 * ABOUT セクション管理API — Sprint 2 Part 4-A
 *
 * GET:  Metaobject「astromeda_about_section」一覧取得
 * POST: create / update / delete
 *
 * Metaobject 定義は api/admin/metaobject-setup で一括作成（本ファイルからは作成しない）
 * 注: このスキーマには display_order が存在しない。順序は Shopify 側の作成順で固定。
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC → AuditLog → CSRF(POST) → Zod
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.about-sections';
import { z } from 'zod';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';
import { normalizeFileReferenceField } from '~/lib/image-resolver';
import { expectedUpdatedAtField, validateExpectedUpdatedAt, casConflictResponse } from '~/lib/expected-updated-at';
import { computeFieldDiff, computeMetaobjectDiff } from '~/lib/audit-snapshot';

const METAOBJECT_TYPE = 'astromeda_about_section';

const safeString = (maxLen: number = 500) =>
  z.string().max(maxLen).refine(
    (s) => !/<[^>]*>/g.test(s),
    { message: 'HTMLタグは使用できません' },
  );

// body_html は HTML を含むため <script> のみ禁止に緩和
const safeHtml = (maxLen: number = 10_000) =>
  z.string().max(maxLen).refine(
    (s) => !/<script[\s\S]*?>/i.test(s),
    { message: '<script>タグは使用できません' },
  );

const AboutSectionActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    handle: safeString(100),
    title: safeString(255),
    bodyHtml: safeHtml(10_000).optional().default(''),
    image: safeString(2048).optional(),
    linkUrl: safeString(2048),
    linkLabel: safeString(100),
    isActive: z.boolean().optional().default(true),
  }).strict(),
  z.object({
    action: z.literal('update'),
    metaobjectId: z.string().min(1),
    title: safeString(255).optional(),
    bodyHtml: safeHtml(10_000).optional(),
    image: safeString(2048).optional(),
    linkUrl: safeString(2048).optional(),
    linkLabel: safeString(100).optional(),
    isActive: z.boolean().optional(),
    // patch 0115: P2-5 楽観的ロック (CAS) — 別ユーザーの上書きを 409 で防ぐ。送信任意・後方互換。
    expectedUpdatedAt: expectedUpdatedAtField,
  }).strict(),
  z.object({
    action: z.literal('delete'),
    metaobjectId: z.string().min(1),
    // patch 0114: P1-4 削除確認の二重化（誤削除防止）
    confirm: z.literal(true, {
      errorMap: () => ({ message: '削除には確認 (confirm:true) が必要です' }),
    }),
  }).strict(),
]);

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.about-sections', RATE_LIMIT_PRESETS.admin);
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
    auditLog({ action: 'api_access', role, resource: 'api/admin/about-sections [GET]', success: true });

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    const metaobjects = await client.getMetaobjects(METAOBJECT_TYPE, 50);

    const aboutSections = metaobjects.map((mo) => {
      const f = fieldsToMap(mo.fields);
      return {
        id: mo.id,
        handle: mo.handle,
        // patch 0115: P2-5 楽観的ロック CAS の比較対象（client は edit modal load 時に保持）
        updatedAt: mo.updatedAt,
        title: f['title'] || '',
        bodyHtml: f['body_html'] || '',
        image: f['image'] || null,
        linkUrl: f['link_url'] || '',
        linkLabel: f['link_label'] || '',
        isActive: f['is_active'] === 'true',
      };
    });

    return data({ success: true, aboutSections, total: aboutSections.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `ABOUTセクション取得失敗: ${msg}` }, { status: 500 });
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.about-sections', RATE_LIMIT_PRESETS.admin);
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

    const validation = AboutSectionActionSchema.safeParse(rawBody);
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
      case 'create': {
        const role = requirePermission(session, 'products.edit');
        const fields: Array<{ key: string; value: string }> = [
          { key: 'title', value: v.title },
          { key: 'body_html', value: v.bodyHtml },
          { key: 'link_url', value: v.linkUrl },
          { key: 'link_label', value: v.linkLabel },
          { key: 'is_active', value: String(v.isActive) },
        ];
        if (v.image) fields.push({ key: 'image', value: v.image });

        // patch 0026: file_reference は GID しか受け付けないため、URL→GID 変換を挟む。
        const imgNotes = await normalizeFileReferenceField(client, fields, 'image', v.title);
        const result = await client.createMetaobject(METAOBJECT_TYPE, v.handle, fields);
        // patch 0116: P2-6 — before/after snapshot (新規作成: before=null)
        const diff = computeMetaobjectDiff(undefined, fields);
        auditLog({ action: 'settings_change', role, resource: `metaobject/${result.id}`, detail: `about_section_create${imgNotes.length ? '; ' + imgNotes.join('; ') : ''}`, success: true, ...diff });
        return data({ success: true, metaobject: result, imageNotes: imgNotes });
      }

      case 'update': {
        const role = requirePermission(session, 'products.edit');

        // patch 0115: P2-5 楽観的ロック CAS + patch 0116: P2-6 before/after snapshot
        // 両方で current を共有 (Shopify API call を1回に集約)
        const current = await client.getMetaobjectById(v.metaobjectId);

        if (v.expectedUpdatedAt) {
          const cas = validateExpectedUpdatedAt(current, v.expectedUpdatedAt);
          if (!cas.ok) {
            auditLog({ action: 'settings_change', role, resource: `metaobject/${v.metaobjectId}`, detail: 'about_section_update_cas_conflict', success: false });
            return casConflictResponse(current, cas.currentUpdatedAt);
          }
        }

        const fields: Array<{ key: string; value: string }> = [];
        if (v.title !== undefined) fields.push({ key: 'title', value: v.title });
        if (v.bodyHtml !== undefined) fields.push({ key: 'body_html', value: v.bodyHtml });
        if (v.image !== undefined) fields.push({ key: 'image', value: v.image });
        if (v.linkUrl !== undefined) fields.push({ key: 'link_url', value: v.linkUrl });
        if (v.linkLabel !== undefined) fields.push({ key: 'link_label', value: v.linkLabel });
        if (v.isActive !== undefined) fields.push({ key: 'is_active', value: String(v.isActive) });

        // patch 0026: file_reference は GID しか受け付けないため、URL→GID 変換を挟む。
        const imgNotes = await normalizeFileReferenceField(client, fields, 'image', v.title || 'about_section');
        const result = await client.updateMetaobject(v.metaobjectId, fields);
        // patch 0116: P2-6 — before/after snapshot
        const diff = computeMetaobjectDiff(current?.fields, fields);
        auditLog({ action: 'settings_change', role, resource: `metaobject/${v.metaobjectId}`, detail: `about_section_update${imgNotes.length ? '; ' + imgNotes.join('; ') : ''}`, success: true, ...diff });
        return data({ success: true, metaobject: result, imageNotes: imgNotes });
      }

      case 'delete': {
        const role = requirePermission(session, 'products.edit');
        // patch 0116: P2-6 — 削除前にスナップショットを取得 (before=現在値, after=null)
        const current = await client.getMetaobjectById(v.metaobjectId).catch(() => null);
        const result = await client.deleteMetaobject(v.metaobjectId);
        const diff = computeMetaobjectDiff(current?.fields, undefined);
        auditLog({ action: 'settings_change', role, resource: `metaobject/${v.metaobjectId}`, detail: 'about_section_delete', success: result, ...diff });
        return data({ success: result });
      }

      default:
        return data({ error: '不明なアクションです' }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `ABOUTセクション操作失敗: ${msg}` }, { status: 500 });
  }
}

function fieldsToMap(fields: Array<{ key: string; value: string }>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of fields) m[f.key] = f.value;
  return m;
}
