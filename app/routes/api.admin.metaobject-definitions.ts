/**
 * Metaobject 定義 CRUD API — patch 0068 (管理画面完結化 P4)
 *
 * CEO 指摘「Shopify admin を開かせず管理画面で完結させたい」の P4。
 * Shopify の Metaobject 定義（CMS の型）を admin から一覧・作成・フィールド追加・削除できるようにする。
 * これにより、新しい CMS タイプ（例: 新シリーズのランディング用）を Shopify admin に行かずに立てられる。
 *
 * 効果器: 遺伝子ライブラリ管理（幹細胞の DNA 設計図を増減する）
 *
 * GET:
 *   - /api/admin/metaobject-definitions?limit=50&cursor=xxx
 *   - 1 件詳細:  /api/admin/metaobject-definitions?type=astromeda_marquee_item
 *
 * POST:
 *   - create:     { action: "create", type, name, description?, fields: [{key,name,type,required?}, ...] }
 *   - add_fields: { action: "add_fields", id, fields: [...] }   // 既存定義にフィールド追加
 *   - delete:     { action: "delete", id }                      // 実体 Metaobject 諸共削除（要確認）
 *
 * セキュリティ: RateLimit → CSRF → AdminAuth → RBAC(settings.edit) → Zod → AuditLog
 */

import {data} from 'react-router';
import type {Route} from './+types/api.admin.metaobject-definitions';
import {z} from 'zod';
import {applyRateLimit, RATE_LIMIT_PRESETS} from '~/lib/rate-limiter';
import {requirePermission} from '~/lib/rbac';
import {auditLog} from '~/lib/audit-log';
import {AppSession} from '~/lib/session';
import {verifyCsrfForAdmin} from '~/lib/csrf-middleware';

// ━━━ Zod スキーマ ━━━

/** Shopify 側の Metaobject 定義 type は [a-z0-9_]{1,63} (予約語 $app:/app: プレフィックス禁止) */
const MetaobjectType = z
  .string()
  .min(1, 'type は必須')
  .max(63, 'type は 63 文字以内')
  .regex(/^[a-z][a-z0-9_]*$/, 'type は英小文字で始まる英数字+アンダースコアのみ');

/** field key も同様 */
const FieldKey = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z][a-z0-9_]*$/, 'field key は英小文字で始まる英数字+アンダースコアのみ');

/**
 * Shopify が受け入れる field type（主要なもののみ許可、未対応は拒否）
 * 参考: https://shopify.dev/docs/api/admin-graphql/latest/scalars/fieldtype
 */
const AllowedFieldTypes = z.enum([
  'single_line_text_field',
  'multi_line_text_field',
  'number_integer',
  'number_decimal',
  'boolean',
  'date',
  'date_time',
  'url',
  'color',
  'json',
  'money',
  'rating',
  'dimension',
  'volume',
  'weight',
  'file_reference',
  'product_reference',
  'collection_reference',
  'variant_reference',
  'page_reference',
  'metaobject_reference',
  'mixed_reference',
  'rich_text_field',
  // list 系は Shopify 2024-01+ で `list.<type>` 形式
  'list.single_line_text_field',
  'list.number_integer',
  'list.file_reference',
  'list.product_reference',
  'list.collection_reference',
  'list.variant_reference',
  'list.metaobject_reference',
]);

const FieldSpec = z
  .object({
    key: FieldKey,
    name: z.string().min(1, 'name は必須').max(100),
    type: AllowedFieldTypes,
    required: z.boolean().optional().default(false),
    description: z.string().max(500).optional(),
  })
  .strict();

const GidMetaobjectDefinition = z
  .string()
  .regex(
    /^gid:\/\/shopify\/MetaobjectDefinition\/\d+$/,
    '無効な定義 ID です（gid://shopify/MetaobjectDefinition/... が必要）',
  );

const CreateSchema = z
  .object({
    action: z.literal('create'),
    type: MetaobjectType,
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    fields: z.array(FieldSpec).min(1, 'fields は 1 件以上必要').max(50, 'fields は最大 50 件'),
  })
  .strict();

const AddFieldsSchema = z
  .object({
    action: z.literal('add_fields'),
    id: GidMetaobjectDefinition,
    fields: z.array(FieldSpec).min(1).max(50),
  })
  .strict();

const DeleteSchema = z
  .object({
    action: z.literal('delete'),
    id: GidMetaobjectDefinition,
    /** 明示的に true を要求する安全弁。UI 側で確認ダイアログを挟ませる。 */
    confirm: z.literal(true),
  })
  .strict();

const ActionSchema = z.discriminatedUnion('action', [
  CreateSchema,
  AddFieldsSchema,
  DeleteSchema,
]);

// ━━━ GET: 一覧 / 単一定義詳細 ━━━

export async function loader({request, context}: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.metaobject-definitions', RATE_LIMIT_PRESETS.admin);
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
    // 閲覧は settings.view が最小権限（存在しない場合は settings.edit にフォールバック）
    let role: string;
    try {
      role = requirePermission(session as AppSession, 'settings.view');
    } catch {
      role = requirePermission(session as AppSession, 'settings.edit');
    }

    const {setAdminEnv, getAdminClient} = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    const url = new URL(request.url);
    const typeParam = url.searchParams.get('type');

    // ── 単一定義詳細 ──
    if (typeParam) {
      const def = await client.getMetaobjectDefinitionFull({type: typeParam});
      auditLog({
        action: 'api_access',
        role,
        resource: `api/admin/metaobject-definitions [GET type=${typeParam}]`,
        success: true,
      });
      if (!def) {
        return data({success: false, error: `定義が見つかりません: ${typeParam}`}, {status: 404});
      }
      return data({success: true, definition: def});
    }

    // ── 一覧 ──
    const first = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100);
    const cursor = url.searchParams.get('cursor') || undefined;

    const {items, pageInfo} = await client.listMetaobjectDefinitions(first, cursor);

    auditLog({
      action: 'api_access',
      role,
      resource: 'api/admin/metaobject-definitions [GET]',
      success: true,
      detail: `items=${items.length}`,
    });

    return data({success: true, definitions: items, pageInfo, total: items.length});
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    auditLog({
      action: 'api_error',
      role: 'unknown',
      resource: 'api/admin/metaobject-definitions [GET]',
      success: false,
      detail: msg,
    });
    return data(
      {success: false, error: `定義取得に失敗しました: ${msg}`},
      {status: 500},
    );
  }
}

// ━━━ POST: create / add_fields / delete ━━━

export async function action({request, context}: Route.ActionArgs) {
  const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.metaobject-definitions', RATE_LIMIT_PRESETS.admin);
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
    const role = requirePermission(session as AppSession, 'settings.edit');

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
        const {id} = await client.createMetaobjectDefinition(
          body.type,
          body.name,
          body.fields.map((f) => ({key: f.key, name: f.name, type: f.type})),
        );
        auditLog({
          action: 'metaobject_definition_create',
          role,
          resource: `api/admin/metaobject-definitions [${body.type}]`,
          success: true,
          detail: `fields=${body.fields.length} id=${id}`,
        });
        return data({success: true, id, type: body.type, fieldsAdded: body.fields.length});
      }
      case 'add_fields': {
        const {id} = await client.updateMetaobjectDefinition(
          body.id,
          body.fields.map((f) => ({key: f.key, name: f.name, type: f.type})),
        );
        auditLog({
          action: 'metaobject_definition_update',
          role,
          resource: `api/admin/metaobject-definitions [${body.id}]`,
          success: true,
          detail: `fieldsAdded=${body.fields.length}`,
        });
        return data({success: true, id, fieldsAdded: body.fields.length});
      }
      case 'delete': {
        const {deletedId, notFound} = await client.deleteMetaobjectDefinition(body.id);
        auditLog({
          action: 'metaobject_definition_delete',
          role,
          resource: `api/admin/metaobject-definitions [${body.id}]`,
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
      resource: 'api/admin/metaobject-definitions [POST]',
      success: false,
      detail: msg,
    });
    return data(
      {success: false, error: `定義操作に失敗しました: ${msg}`},
      {status: 500},
    );
  }
}
