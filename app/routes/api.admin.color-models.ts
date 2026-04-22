/**
 * PC カラーモデル管理API — Sprint 2 Part 4-A
 *
 * GET:  Metaobject「astromeda_pc_color」一覧取得
 * POST: create / update / delete
 *
 * Metaobject 定義は api/admin/metaobject-setup で一括作成（本ファイルからは作成しない）
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC → AuditLog → CSRF(POST) → Zod
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.color-models';
import { z } from 'zod';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';
import { expectedUpdatedAtField, validateExpectedUpdatedAt, casConflictResponse } from '~/lib/expected-updated-at';
import { computeMetaobjectDiff } from '~/lib/audit-snapshot';

// ── Metaobject 型名（metaobject-setup.ts と整合） ──
const METAOBJECT_TYPE = 'astromeda_pc_color';

// ── Zod スキーマ ──
const safeString = (maxLen: number = 500) =>
  z.string().max(maxLen).refine(
    (s) => !/<[^>]*>/g.test(s),
    { message: 'HTMLタグは使用できません' },
  );

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'カラーコードは #RRGGBB 形式で指定してください');

const ColorModelActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    handle: safeString(100),
    name: safeString(255),
    slug: safeString(255),
    image: safeString(2048).optional(),
    colorCode: hexColor,
    sortOrder: z.number().int().min(0).max(999).optional().default(0),
    isActive: z.boolean().optional().default(true),
  }).strict(),
  z.object({
    action: z.literal('update'),
    metaobjectId: z.string().min(1),
    name: safeString(255).optional(),
    slug: safeString(255).optional(),
    image: safeString(2048).optional(),
    colorCode: hexColor.optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    isActive: z.boolean().optional(),
    // patch 0115: P2-5 楽観的ロック (CAS) — クライアントが initial GET 時の updatedAt を送ると、
    // mutation 直前に最新値と比較して別ユーザーの上書きを検出する。
    // 未送信なら CAS スキップ（後方互換）。
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

// ── GET: 一覧取得 ──

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.color-models', RATE_LIMIT_PRESETS.admin);
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
    auditLog({ action: 'api_access', role, resource: 'api/admin/color-models [GET]', success: true });

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    const metaobjects = await client.getMetaobjects(METAOBJECT_TYPE, 100);

    const colorModels = metaobjects.map((mo) => {
      const f = fieldsToMap(mo.fields);
      // patch 0026: Metaobject 定義のフィールド名は hex_color / image_url。
      // 旧コードは color_code / image を書き込んでいたため空振りし #000000 固定になっていた。
      // 読み取り側は両方見て、Metaobject 正規名を優先する。
      return {
        id: mo.id,
        handle: mo.handle,
        // patch 0115: P2-5 楽観的ロック CAS の比較対象。client は edit modal load 時にこれを保持し
        // 保存時に expectedUpdatedAt として送る。サーバ側で最新値と比較し不一致なら 409 を返す。
        updatedAt: mo.updatedAt,
        name: f['name'] || '',
        slug: f['slug'] || '',
        image: f['image_url'] || f['image'] || null,
        colorCode: f['hex_color'] || f['color_code'] || '#000000',
        sortOrder: parseInt(f['display_order'] || '0', 10),
        isActive: f['is_active'] === 'true',
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder);

    return data({ success: true, colorModels, total: colorModels.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `PCカラーモデル取得失敗: ${msg}` }, { status: 500 });
  }
}

// ── POST: CRUD ──

export async function action({ request, context }: Route.ActionArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.color-models', RATE_LIMIT_PRESETS.admin);
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

    const validation = ColorModelActionSchema.safeParse(rawBody);
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
        // patch 0026: Metaobject 定義と整合する hex_color / image_url キーで書き込む。
        // 旧コードの color_code / image は定義に存在しないキーで、Shopify 側が黙って捨てていた。
        const fields: Array<{ key: string; value: string }> = [
          { key: 'name', value: v.name },
          { key: 'slug', value: v.slug },
          { key: 'hex_color', value: v.colorCode },
          { key: 'display_order', value: String(v.sortOrder) },
          { key: 'is_active', value: String(v.isActive) },
        ];
        if (v.image) fields.push({ key: 'image_url', value: v.image });

        const result = await client.createMetaobject(METAOBJECT_TYPE, v.handle, fields);
        // patch 0116: P2-6 — before/after snapshot (新規作成: before=null)
        const diff = computeMetaobjectDiff(undefined, fields);
        auditLog({ action: 'settings_change', role, resource: `metaobject/${result.id}`, detail: 'color_model_create', success: true, ...diff });
        return data({ success: true, metaobject: result });
      }

      case 'update': {
        const role = requirePermission(session, 'products.edit');

        // patch 0115: P2-5 楽観的ロック CAS + patch 0116: P2-6 before/after snapshot
        // 両方で current を共有 (Shopify API call を1回に集約)
        const current = await client.getMetaobjectById(v.metaobjectId);

        if (v.expectedUpdatedAt) {
          const cas = validateExpectedUpdatedAt(current, v.expectedUpdatedAt);
          if (!cas.ok) {
            auditLog({ action: 'settings_change', role, resource: `metaobject/${v.metaobjectId}`, detail: 'color_model_update_cas_conflict', success: false });
            return casConflictResponse(current, cas.currentUpdatedAt);
          }
        }

        const fields: Array<{ key: string; value: string }> = [];
        if (v.name !== undefined) fields.push({ key: 'name', value: v.name });
        if (v.slug !== undefined) fields.push({ key: 'slug', value: v.slug });
        if (v.image !== undefined) fields.push({ key: 'image_url', value: v.image });
        if (v.colorCode !== undefined) fields.push({ key: 'hex_color', value: v.colorCode });
        if (v.sortOrder !== undefined) fields.push({ key: 'display_order', value: String(v.sortOrder) });
        if (v.isActive !== undefined) fields.push({ key: 'is_active', value: String(v.isActive) });

        const result = await client.updateMetaobject(v.metaobjectId, fields);
        // patch 0116: P2-6 — before/after snapshot
        const diff = computeMetaobjectDiff(current?.fields, fields);
        auditLog({ action: 'settings_change', role, resource: `metaobject/${v.metaobjectId}`, detail: 'color_model_update', success: true, ...diff });
        return data({ success: true, metaobject: result });
      }

      case 'delete': {
        const role = requirePermission(session, 'products.edit');
        // patch 0116: P2-6 — 削除前にスナップショットを取得 (before=現在値, after=null)
        const current = await client.getMetaobjectById(v.metaobjectId).catch(() => null);
        const result = await client.deleteMetaobject(v.metaobjectId);
        const diff = computeMetaobjectDiff(current?.fields, undefined);
        auditLog({ action: 'settings_change', role, resource: `metaobject/${v.metaobjectId}`, detail: 'color_model_delete', success: result, ...diff });
        return data({ success: result });
      }

      default:
        return data({ error: '不明なアクションです' }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `PCカラーモデル操作失敗: ${msg}` }, { status: 500 });
  }
}

// ── ヘルパー ──

function fieldsToMap(fields: Array<{ key: string; value: string }>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of fields) m[f.key] = f.value;
  return m;
}
