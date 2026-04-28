/**
 * 統一CMS管理API — GET/POST /api/admin/cms
 *
 * 全Metaobjectタイプの読み取り・作成・更新・削除を1エンドポイントで処理。
 * type パラメータで対象タイプを指定、action パラメータで操作を指定。
 *
 * GET:  ?type=astromeda_site_config  → 指定タイプのMetaobject一覧取得
 * POST: { type, action: 'create'|'update'|'delete', ... }
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC → AuditLog → CSRF(POST)
 *
 * v164 rebuild: 2026-04-17
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.cms';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';
import { validateAndSanitizeFields, validateHandle } from '~/lib/cms-field-validator';
import { normalizeFileReferenceFieldsByType } from '~/lib/image-resolver';
import { validateExpectedUpdatedAt, casConflictResponse } from '~/lib/expected-updated-at';
import { computeMetaobjectDiff } from '~/lib/audit-snapshot';

// 管理可能な Metaobject タイプ一覧
const ALLOWED_TYPES = [
  'astromeda_site_config',
  'astromeda_pc_color',
  'astromeda_pc_tier',
  'astromeda_ugc_review',
  'astromeda_marquee_item',
  'astromeda_category_card',
  'astromeda_legal_info',
  'astromeda_ip_banner',
  'astromeda_hero_banner',
  'astromeda_article_content',
  'astromeda_seo_article',
  'astromeda_custom_option',
  'astromeda_campaign',
  'astromeda_about_section',
  'astromeda_product_shelf',
  'astromeda_static_page',
  'astromeda_faq_item',
  'astromeda_gaming_feature_card',
  'astromeda_gaming_parts_card',
  'astromeda_gaming_price_range',
  'astromeda_gaming_hero_slide',
  'astromeda_gaming_contact',
  // patch 0166 (2026-04-27): セクション単位 HTML/CSS 上書き (他社デザイン会社向け一括変更基盤)
  'astromeda_section_override',
  // patch 0192 (2026-04-28): 商品個別ページ下段の説明セクション
  'astromeda_product_content',
  // patch 0193 (2026-04-28): 商品個別ページ下段の関連製品グループ
  'astromeda_related_group',
] as const;

type AllowedType = (typeof ALLOWED_TYPES)[number];

function isAllowedType(t: string): t is AllowedType {
  return (ALLOWED_TYPES as readonly string[]).includes(t);
}

// GraphQL クエリ: Metaobject 一覧取得
function buildListQuery(type: string, first: number = 50): string {
  return `{
    metaobjects(type: "${type}", first: ${first}, sortKey: "id") {
      nodes {
        id
        handle
        type
        updatedAt
        fields {
          key
          value
        }
      }
    }
  }`;
}

async function getAdminClientFromContext(contextEnv: Env) {
  const { setAdminEnv, getAdminClient } = await import(
    '../../agents/core/shopify-admin.js'
  );
  setAdminEnv(contextEnv);
  // 完全な AdminClient を返す（image-resolver の createFileFromStagedUpload も使う）
  return getAdminClient();
}

async function authenticateAdmin(request: Request, contextEnv: Env, context: unknown) {
  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, contextEnv);
  if (!auth.authenticated) return { error: auth.response };

  const sessionFromContext = (context as { session?: AppSession }).session;
  const session =
    sessionFromContext ??
    (await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]));

  const { requirePermission } = await import('~/lib/rbac');
  const role = requirePermission(session as AppSession, 'products.edit');

  return { role, session };
}

// ── GET: Metaobject 一覧取得 ──
export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.cms', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  try {
    const authResult = await authenticateAdmin(request, contextEnv, context);
    if ('error' in authResult) return authResult.error;

    const url = new URL(request.url);
    const type = url.searchParams.get('type');

    if (!type || !isAllowedType(type)) {
      return data({
        success: true,
        types: ALLOWED_TYPES,
        message: 'Specify ?type= to get metaobjects of that type',
      });
    }

    const client = await getAdminClientFromContext(contextEnv);
    const result = await client.query<{
      metaobjects: {
        nodes: Array<{
          id: string;
          handle: string;
          type: string;
          updatedAt: string;
          fields: Array<{ key: string; value: string }>;
        }>;
      };
    }>(buildListQuery(type));

    // fields配列をオブジェクトに変換して返す
    const items = result.metaobjects.nodes.map((node) => {
      const fieldObj: Record<string, string> = {};
      node.fields.forEach((f) => {
        fieldObj[f.key] = f.value;
      });
      return {
        id: node.id,
        handle: node.handle,
        type: node.type,
        updatedAt: node.updatedAt,
        ...fieldObj,
      };
    });

    auditLog({
      action: 'api_access',
      role: authResult.role,
      resource: `api/admin/cms?type=${type}`,
      success: true,
    });

    return data({ success: true, type, items, total: items.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: msg }, { status: 500 });
  }
}

// ── POST: create / update / delete ──
export async function action({ request, context }: Route.ActionArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.cms', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const authResult = await authenticateAdmin(request, contextEnv, context);
    if ('error' in authResult) return authResult.error;

    const body = await request.json();
    const { type, action: cmsAction, ...payload } = body as {
      type: string;
      action: string;
      [key: string]: unknown;
    };

    if (!type || !isAllowedType(type)) {
      return data(
        { success: false, error: `Invalid type. Allowed: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    // patch 0184 P0 (2026-04-27): vendor 深層防御 — vendor は astromeda_section_override
    // の gpc_* セクションのみ編集可能。それ以外の Metaobject 型 (hero_banner / pc_color /
    // legal_info / site_config 等) は全て 403。CEO「ベンダーが触れるところのみ」要件への
    // server-side 強制。Sidebar の hide だけでは API 直叩きで漏洩するため必須。
    if (authResult.role === 'vendor') {
      if (type !== 'astromeda_section_override') {
        return data(
          { success: false, error: 'ベンダーはセクション上書き以外の編集ができません' },
          { status: 403 },
        );
      }
      // section_override の場合、section_key が gpc_* のみ許可
      const fieldsForGuard = payload.fields as Array<{ key: string; value: string }> | undefined;
      const sectionKeyField = fieldsForGuard?.find((f) => f.key === 'section_key');
      // create では handle = section_key (canonical), update では fields に含まれる
      const handleForGuard = String(payload.handle || '');
      const sectionKeyValue = sectionKeyField?.value || handleForGuard;
      if (sectionKeyValue && !sectionKeyValue.startsWith('gpc_')) {
        return data(
          { success: false, error: 'ベンダーはゲーミングPC関連セクション (gpc_*) のみ編集可能です' },
          { status: 403 },
        );
      }
    }

    const client = await getAdminClientFromContext(contextEnv);

    switch (cmsAction) {
      case 'create': {
        const handle = String(payload.handle || '');
        const fields = payload.fields as Array<{ key: string; value: string }>;
        if (!handle || !fields || !Array.isArray(fields)) {
          return data(
            { success: false, error: 'handle and fields[] are required for create' },
            { status: 400 },
          );
        }

        // S3: ハンドルバリデーション
        const handleError = validateHandle(handle);
        if (handleError) {
          return data({ success: false, error: handleError }, { status: 400 });
        }

        // S3: フィールドバリデーション＆サニタイズ
        const validation = validateAndSanitizeFields(type, fields, 'create');
        if (!validation.valid) {
          return data(
            {
              success: false,
              error: 'バリデーションエラー',
              details: validation.errors,
            },
            { status: 400 },
          );
        }

        // patch 0026: file_reference キーは URL→GID 変換を挟む（無効値は drop）
        const imgNotes = await normalizeFileReferenceFieldsByType(
          client,
          type,
          validation.sanitizedFields,
          handle,
        );

        const created = await client.createMetaobject(type, handle, validation.sanitizedFields);
        // patch 0116 (P2-6): AuditLog before/after snapshot
        const diff = computeMetaobjectDiff(undefined, validation.sanitizedFields);
        auditLog({
          action: 'content_create',
          role: authResult.role,
          resource: `cms/${type}/${handle}`,
          detail: imgNotes.length ? imgNotes.join('; ') : undefined,
          success: true,
          ...diff,
        });
        return data({ success: true, id: created.id, handle, imageNotes: imgNotes });
      }

      case 'update': {
        const id = String(payload.id || '');
        const fields = payload.fields as Array<{ key: string; value: string }>;
        // patch 0112 (P0-2, 全保存パターン監査 2026-04-22):
        // 空文字フィールドは update 時に「未送信」扱い (preserve)。明示クリアは clearFields に
        // フィールドキーを列挙するか、value に '__CLEAR__' を入れて指示する。
        const clearFields = Array.isArray(payload.clearFields)
          ? (payload.clearFields as string[]).filter((k) => typeof k === 'string')
          : undefined;
        // patch 0115 (P2-5, 全保存パターン監査 2026-04-22):
        // 楽観的ロック (CAS) — expectedUpdatedAt 送信時のみ発火。送信任意・後方互換。
        const expectedUpdatedAt = typeof payload.expectedUpdatedAt === 'string'
          ? (payload.expectedUpdatedAt as string)
          : undefined;

        if (!id || !fields || !Array.isArray(fields)) {
          return data(
            { success: false, error: 'id and fields[] are required for update' },
            { status: 400 },
          );
        }

        // S3: GID形式バリデーション
        if (!id.startsWith('gid://shopify/Metaobject/')) {
          return data(
            { success: false, error: 'IDの形式が正しくありません（保存データのIDではありません）' },
            { status: 400 },
          );
        }

        // patch 0115: P2-5 楽観的ロック CAS — 別ユーザーの上書きを 409 で防ぐ
        // patch 0116 (P2-6): current は CAS と AuditLog before snapshot で共有 (Shopify API 1回)
        const current = await client
          .getMetaobjectById(id)
          .catch(() => null as Awaited<ReturnType<typeof client.getMetaobjectById>> | null);
        if (expectedUpdatedAt) {
          const cas = validateExpectedUpdatedAt(current, expectedUpdatedAt);
          if (!cas.ok) {
            auditLog({
              action: 'content_update',
              role: authResult.role,
              resource: `cms/${type}/${id}`,
              detail: 'content_update_cas_conflict',
              success: false,
            });
            return casConflictResponse(current, cas.currentUpdatedAt);
          }
        }

        // S3: フィールドバリデーション＆サニタイズ
        // patch 0112: clearFields を 4 番目に渡す (空文字 preserve / 明示クリア対応)
        const validation = validateAndSanitizeFields(type, fields, 'update', clearFields);
        if (!validation.valid) {
          return data(
            {
              success: false,
              error: 'バリデーションエラー',
              details: validation.errors,
            },
            { status: 400 },
          );
        }

        // patch 0026: file_reference キーは URL→GID 変換を挟む（無効値は drop）
        const imgNotes = await normalizeFileReferenceFieldsByType(
          client,
          type,
          validation.sanitizedFields,
          id,
        );

        const updated = await client.updateMetaobject(id, validation.sanitizedFields);
        // patch 0116 (P2-6): AuditLog before/after snapshot
        const diff = computeMetaobjectDiff(current?.fields, validation.sanitizedFields);
        auditLog({
          action: 'content_update',
          role: authResult.role,
          resource: `cms/${type}/${id}`,
          detail: imgNotes.length ? imgNotes.join('; ') : undefined,
          success: true,
          ...diff,
        });
        return data({ success: true, id: updated.id, imageNotes: imgNotes });
      }

      case 'delete': {
        const id = String(payload.id || '');
        if (!id) {
          return data(
            { success: false, error: 'id is required for delete' },
            { status: 400 },
          );
        }

        // S3: GID形式バリデーション
        if (!id.startsWith('gid://shopify/Metaobject/')) {
          return data(
            { success: false, error: 'IDの形式が正しくありません（保存データのIDではありません）' },
            { status: 400 },
          );
        }

        // patch 0114: P1-4 削除確認の二重化（誤削除防止）
        // クライアントは ConfirmDialog 通過後に必ず confirm:true を送る。
        if ((payload as { confirm?: unknown }).confirm !== true) {
          return data(
            { success: false, error: '削除には確認 (confirm:true) が必要です' },
            { status: 400 },
          );
        }

        // patch 0116 (P2-6): 削除前に before snapshot を取る (失敗しても続行)
        const currentBeforeDelete = await client
          .getMetaobjectById(id)
          .catch(() => null as Awaited<ReturnType<typeof client.getMetaobjectById>> | null);
        const deleted = await client.deleteMetaobject(id);
        const diff = computeMetaobjectDiff(currentBeforeDelete?.fields, undefined);
        auditLog({
          action: 'content_delete',
          role: authResult.role,
          resource: `cms/${type}/${id}`,
          success: true,
          ...diff,
        });
        return data({ success: true, deletedId: deleted.deletedId });
      }

      default:
        return data(
          { success: false, error: `Unknown action: ${cmsAction}. Use create/update/delete.` },
          { status: 400 },
        );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: msg }, { status: 500 });
  }
}
