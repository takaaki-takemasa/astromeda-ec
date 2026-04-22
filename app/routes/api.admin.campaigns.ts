/**
 * キャンペーン管理API — CMS
 *
 * GET:  Metaobject「astromeda_campaign」一覧 + 割引コード（PromotionAgent state 補完）
 *       + 年間セールカレンダーテンプレート（status:'template'）
 * POST: キャンペーン create / update / delete / activate / deactivate
 *
 * Metaobject 定義は api/admin/metaobject-setup で一括作成（本ファイルからは作成しない）
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC → AuditLog → CSRF(POST) → Zod
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.campaigns';
import { z } from 'zod';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';
import { expectedUpdatedAtField, validateExpectedUpdatedAt, casConflictResponse } from '~/lib/expected-updated-at';
import { computeMetaobjectDiff } from '~/lib/audit-snapshot';

// ── Metaobject 型名（metaobject-setup.ts と整合） ──
const METAOBJECT_TYPE = 'astromeda_campaign';

// ── Zod スキーマ ──
const safeString = (maxLen: number = 500) =>
  z.string().max(maxLen).refine(
    (s) => !/<[^>]*>/g.test(s),
    { message: 'HTMLタグは使用できません' },
  );

const CampaignActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    handle: safeString(100),
    title: safeString(255),
    description: safeString(2000).optional().default(''),
    discountCode: safeString(100).optional().default(''),
    discountPercent: z.number().int().min(0).max(100).optional().default(0),
    startAt: safeString(50).optional(),
    endAt: safeString(50).optional(),
    targetTags: safeString(500).optional().default(''),
    status: z.enum(['active', 'planned', 'completed']).optional().default('planned'),
  }).strict(),
  z.object({
    action: z.literal('update'),
    metaobjectId: z.string().min(1),
    title: safeString(255).optional(),
    description: safeString(2000).optional(),
    discountCode: safeString(100).optional(),
    discountPercent: z.number().int().min(0).max(100).optional(),
    startAt: safeString(50).optional(),
    endAt: safeString(50).optional(),
    targetTags: safeString(500).optional(),
    status: z.enum(['active', 'planned', 'completed']).optional(),
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
  z.object({
    action: z.literal('activate'),
    metaobjectId: z.string().min(1),
  }).strict(),
  z.object({
    action: z.literal('deactivate'),
    metaobjectId: z.string().min(1),
  }).strict(),
]);

// ── 年間セールカレンダーテンプレート ──
function buildSaleCalendarTemplate() {
  const year = new Date().getFullYear();
  return [
    { name: '新年セール', startDate: new Date(year, 0, 1).getTime(), endDate: new Date(year, 0, 7).getTime(), type: 'seasonal', discountRate: 0, status: 'template' },
    { name: '新生活応援', startDate: new Date(year, 2, 15).getTime(), endDate: new Date(year, 2, 31).getTime(), type: 'seasonal', discountRate: 0, status: 'template' },
    { name: 'GWセール', startDate: new Date(year, 4, 1).getTime(), endDate: new Date(year, 4, 6).getTime(), type: 'seasonal', discountRate: 0, status: 'template' },
    { name: '夏のボーナスセール', startDate: new Date(year, 6, 1).getTime(), endDate: new Date(year, 6, 15).getTime(), type: 'seasonal', discountRate: 0, status: 'template' },
    { name: 'お盆セール', startDate: new Date(year, 7, 10).getTime(), endDate: new Date(year, 7, 18).getTime(), type: 'seasonal', discountRate: 0, status: 'template' },
    { name: 'ブラックフライデー', startDate: new Date(year, 10, 22).getTime(), endDate: new Date(year, 10, 28).getTime(), type: 'seasonal', discountRate: 0, status: 'template' },
    { name: '年末年始セール', startDate: new Date(year, 11, 1).getTime(), endDate: new Date(year, 11, 25).getTime(), type: 'seasonal', discountRate: 0, status: 'template' },
  ];
}

// ── GET: キャンペーン一覧 ──

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.campaigns', RATE_LIMIT_PRESETS.admin);
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
    auditLog({ action: 'api_access', role, resource: 'api/admin/campaigns [GET]', success: true });

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status') || 'all';

    const metaobjects = await client.getMetaobjects(METAOBJECT_TYPE, 100).catch(
      () => [] as Array<{ id: string; handle: string; updatedAt: string; fields: Array<{ key: string; value: string }> }>,
    );

    let campaigns = metaobjects.map((mo) => {
      const f = fieldsToMap(mo.fields);
      return {
        id: mo.id,
        handle: mo.handle,
        // patch 0115: P2-5 楽観的ロック CAS の比較対象（client は edit modal load 時に保持）
        updatedAt: mo.updatedAt,
        title: f['title'] || '',
        description: f['description'] || '',
        discountCode: f['discount_code'] || '',
        discountPercent: parseInt(f['discount_percent'] || '0', 10),
        startAt: f['start_at'] || null,
        endAt: f['end_at'] || null,
        targetTags: f['target_tags'] || '',
        status: (f['status'] as 'active' | 'planned' | 'completed') || 'planned',
      };
    });

    if (statusFilter !== 'all') {
      campaigns = campaigns.filter((c) => c.status === statusFilter);
    }

    // 割引コードは PromotionAgent の state から補完
    let discountCodes: Record<string, unknown>[] = [];
    let agentActive = false;
    try {
      const { getRegisteredAgents } = await import('../../agents/registration/agent-registration.js');
      const agents = (getRegisteredAgents?.() || []) as Array<{ id: string; getState?: () => Record<string, unknown> }>;
      const promotionAgent = agents.find((a) => a.id === 'promotion-agent');
      agentActive = !!promotionAgent;
      if (promotionAgent?.getState) {
        const state = promotionAgent.getState() as Record<string, unknown>;
        const dc = state.discountCodes;
        if (dc && typeof (dc as Map<string, unknown>).values === 'function') {
          discountCodes = Array.from((dc as Map<string, unknown>).values()) as Record<string, unknown>[];
        } else if (Array.isArray(dc)) {
          discountCodes = dc as Record<string, unknown>[];
        }
      }
    } catch {
      // Agent 未登録時はスキップ
    }

    const saleCalendar = buildSaleCalendarTemplate();

    return data({
      success: true,
      campaigns,
      discountCodes,
      saleCalendar,
      total: campaigns.length,
      stats: {
        active: campaigns.filter((c) => c.status === 'active').length,
        planned: campaigns.filter((c) => c.status === 'planned').length,
        completed: campaigns.filter((c) => c.status === 'completed').length,
      },
      agentActive,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `キャンペーン取得失敗: ${msg}` }, { status: 500 });
  }
}

// ── POST: CRUD + activate/deactivate ──

export async function action({ request, context }: Route.ActionArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.campaigns', RATE_LIMIT_PRESETS.admin);
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

    const validation = CampaignActionSchema.safeParse(rawBody);
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
          { key: 'description', value: v.description },
          { key: 'discount_code', value: v.discountCode },
          { key: 'discount_percent', value: String(v.discountPercent) },
          { key: 'target_tags', value: v.targetTags },
          { key: 'status', value: v.status },
        ];
        if (v.startAt) fields.push({ key: 'start_at', value: v.startAt });
        if (v.endAt) fields.push({ key: 'end_at', value: v.endAt });

        const result = await client.createMetaobject(METAOBJECT_TYPE, v.handle, fields);
        // patch 0116: P2-6 — before/after snapshot (新規作成: before=null)
        const diff = computeMetaobjectDiff(undefined, fields);
        auditLog({ action: 'campaign_create', role, resource: `metaobject/${result.id}`, success: true, ...diff });
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
            auditLog({ action: 'campaign_update', role, resource: `metaobject/${v.metaobjectId}`, detail: 'campaign_update_cas_conflict', success: false });
            return casConflictResponse(current, cas.currentUpdatedAt);
          }
        }

        const fields: Array<{ key: string; value: string }> = [];
        if (v.title !== undefined) fields.push({ key: 'title', value: v.title });
        if (v.description !== undefined) fields.push({ key: 'description', value: v.description });
        if (v.discountCode !== undefined) fields.push({ key: 'discount_code', value: v.discountCode });
        if (v.discountPercent !== undefined) fields.push({ key: 'discount_percent', value: String(v.discountPercent) });
        if (v.startAt !== undefined) fields.push({ key: 'start_at', value: v.startAt });
        if (v.endAt !== undefined) fields.push({ key: 'end_at', value: v.endAt });
        if (v.targetTags !== undefined) fields.push({ key: 'target_tags', value: v.targetTags });
        if (v.status !== undefined) fields.push({ key: 'status', value: v.status });

        const result = await client.updateMetaobject(v.metaobjectId, fields);
        // patch 0116: P2-6 — before/after snapshot
        const diff = computeMetaobjectDiff(current?.fields, fields);
        auditLog({ action: 'campaign_update', role, resource: `metaobject/${v.metaobjectId}`, success: true, ...diff });
        return data({ success: true, metaobject: result });
      }

      case 'delete': {
        const role = requirePermission(session, 'products.edit');
        // patch 0116: P2-6 — 削除前にスナップショットを取得 (before=現在値, after=null)
        const current = await client.getMetaobjectById(v.metaobjectId).catch(() => null);
        const result = await client.deleteMetaobject(v.metaobjectId);
        const diff = computeMetaobjectDiff(current?.fields, undefined);
        auditLog({ action: 'campaign_delete', role, resource: `metaobject/${v.metaobjectId}`, success: result, ...diff });
        return data({ success: result });
      }

      case 'activate':
      case 'deactivate': {
        const role = requirePermission(session, 'products.edit');
        const newStatus = v.action === 'activate' ? 'active' : 'completed';
        // patch 0116: P2-6 — activate/deactivate も before/after を記録
        const current = await client.getMetaobjectById(v.metaobjectId).catch(() => null);
        const fields: Array<{ key: string; value: string }> = [{ key: 'status', value: newStatus }];
        const result = await client.updateMetaobject(v.metaobjectId, fields);
        const diff = computeMetaobjectDiff(current?.fields, fields);
        auditLog({
          action: 'campaign_update',
          role,
          resource: `metaobject/${v.metaobjectId}`,
          detail: `status=${newStatus}`,
          success: true,
          ...diff,
        });
        return data({ success: true, metaobject: result });
      }

      default:
        return data({ error: '不明なアクションです' }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `キャンペーン操作失敗: ${msg}` }, { status: 500 });
  }
}

// ── ヘルパー ──

function fieldsToMap(fields: Array<{ key: string; value: string }>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of fields) m[f.key] = f.value;
  return m;
}
