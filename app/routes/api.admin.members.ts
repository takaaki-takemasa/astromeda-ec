/**
 * メンバー管理 API — patch 0156 (admin multi-user auth)
 *
 * single-password 共有を撤廃し、個別ユーザーで管理画面を利用可能にする。
 * admin_user Metaobject (astromeda_admin_user) にユーザーを保管、
 * Web Crypto PBKDF2 でハッシュ化したパスワードで認証する。
 *
 * GET:
 *   - list: メンバー一覧 (password_hash は返さない)
 *   - bootstrap: 初期セットアップ状態 (admin_user の件数と definition 存在確認)
 * POST:
 *   - setup_definition: astromeda_admin_user Metaobject 定義を作成 (idempotent)
 *   - create: 新規ユーザー作成
 *   - update: displayName / role / active を更新
 *   - reset_password: 別ユーザーのパスワードを再設定 (admin 権限)
 *   - change_password: 自分のパスワードを変更 (現行パスワード確認)
 *   - delete: ユーザー削除 (confirm:true 必須)
 *
 * セキュリティ: RateLimit → CSRF → AdminAuth → RBAC → Zod → AuditLog
 */

import {data, type LoaderFunctionArgs, type ActionFunctionArgs} from 'react-router';
import {z} from 'zod';
import {applyRateLimit, RATE_LIMIT_PRESETS} from '~/lib/rate-limiter';
import {requirePermission, requireRole, isValidRole, type Role} from '~/lib/rbac';
import {auditLog, actorFromSession} from '~/lib/audit-log';
import {AppSession} from '~/lib/session';
import {verifyCsrfForAdmin} from '~/lib/csrf-middleware';
import {
  ADMIN_USER_METAOBJECT_TYPE,
  listAdminUsers,
  findAdminUserByUsername,
  getAdminUserById,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  countAdminUsers,
  toSafeAdminUser,
  isValidUsername,
} from '~/lib/admin-users';
import {hashPassword, verifyPassword, validatePasswordMinimum} from '~/lib/admin-password';

const GidAdminUser = z
  .string()
  .regex(/^gid:\/\/shopify\/Metaobject\/\d+$/, '無効な userId です');

const RoleEnum = z.enum(['owner', 'admin', 'editor', 'viewer']);

const SetupDefinitionSchema = z.object({action: z.literal('setup_definition')}).strict();

const CreateSchema = z
  .object({
    action: z.literal('create'),
    username: z.string().min(3).max(32),
    displayName: z.string().min(1).max(100),
    password: z.string().min(8).max(128),
    role: RoleEnum,
  })
  .strict();

const UpdateSchema = z
  .object({
    action: z.literal('update'),
    id: GidAdminUser,
    displayName: z.string().min(1).max(100).optional(),
    role: RoleEnum.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) => v.displayName !== undefined || v.role !== undefined || v.active !== undefined,
    {message: 'displayName / role / active のいずれかを指定してください'},
  );

const ResetPasswordSchema = z
  .object({
    action: z.literal('reset_password'),
    id: GidAdminUser,
    newPassword: z.string().min(8).max(128),
  })
  .strict();

const ChangePasswordSchema = z
  .object({
    action: z.literal('change_password'),
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

const DeleteSchema = z
  .object({
    action: z.literal('delete'),
    id: GidAdminUser,
    confirm: z.literal(true),
  })
  .strict();

const BodySchema = z.union([
  SetupDefinitionSchema,
  CreateSchema,
  UpdateSchema,
  ResetPasswordSchema,
  ChangePasswordSchema,
  DeleteSchema,
]);

async function getSession(request: Request, context: unknown, contextEnv: Env): Promise<AppSession> {
  const sessionFromContext = (context as {session?: AppSession}).session;
  if (sessionFromContext) return sessionFromContext;
  return AppSession.init(request, [
    String((contextEnv as unknown as {SESSION_SECRET?: string}).SESSION_SECRET || ''),
  ]);
}

async function getAdminClient(contextEnv: Env) {
  const {setAdminEnv, getAdminClient: getClient} = await import(
    '../../agents/core/shopify-admin.js'
  );
  setAdminEnv(contextEnv as unknown as Record<string, string | undefined>);
  return getClient();
}

interface AdminClientQuery {
  getMetaobjectDefinition: (
    type: string,
  ) => Promise<{id: string; fieldDefinitions: Array<{key: string; name: string}>} | null>;
  query: <T>(gql: string, variables?: Record<string, unknown>) => Promise<T>;
}

async function ensureAdminUserDefinition(client: AdminClientQuery): Promise<{created: boolean; id: string}> {
  const existing = await client.getMetaobjectDefinition(ADMIN_USER_METAOBJECT_TYPE);
  if (existing) return {created: false, id: existing.id};

  // セキュリティ: password_hash を保持するので storefront には絶対に露出させない (access.storefront=NONE)
  const gql = `
    mutation adminUserDefCreate($definition: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $definition) {
        metaobjectDefinition { id type }
        userErrors { field message }
      }
    }
  `;
  const res = await client.query<{
    metaobjectDefinitionCreate: {
      metaobjectDefinition: {id: string; type: string} | null;
      userErrors: Array<{field: string[]; message: string}>;
    };
  }>(gql, {
    definition: {
      type: ADMIN_USER_METAOBJECT_TYPE,
      name: '管理画面ユーザー',
      access: {storefront: 'NONE'},
      fieldDefinitions: [
        {key: 'username', name: 'ユーザー名', type: 'single_line_text_field'},
        {key: 'display_name', name: '表示名', type: 'single_line_text_field'},
        {key: 'password_hash', name: 'パスワードハッシュ', type: 'single_line_text_field'},
        {key: 'role', name: '役割', type: 'single_line_text_field'},
        {key: 'active', name: '有効', type: 'boolean'},
        {key: 'last_login_at', name: '最終ログイン', type: 'date_time'},
      ],
    },
  });

  const {metaobjectDefinition, userErrors} = res.metaobjectDefinitionCreate;
  if (userErrors && userErrors.length > 0) {
    throw new Error(`admin_user 定義作成失敗: ${userErrors.map((e) => e.message).join('; ')}`);
  }
  if (!metaobjectDefinition) throw new Error('admin_user 定義: レスポンスが空');
  return {created: true, id: metaobjectDefinition.id};
}

// ── GET: list / bootstrap 状態 ──

export async function loader({request, context}: LoaderFunctionArgs) {
  const limited = applyRateLimit(request, 'api.admin.members', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);

  try {
    const session = await getSession(request, context, contextEnv);
    const role = requireRole(session, 'admin'); // users.view を持つ admin 以上のみ

    const client = await getAdminClient(contextEnv);

    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') || 'list';

    if (mode === 'bootstrap') {
      const definition = await client
        .getMetaobjectDefinition(ADMIN_USER_METAOBJECT_TYPE)
        .catch(() => null);
      const count = definition ? await countAdminUsers(client).catch(() => 0) : 0;
      return data({
        success: true,
        definitionExists: !!definition,
        userCount: count,
        bootstrapMode: count === 0,
      });
    }

    // list
    let users = await listAdminUsers(client).catch(() => []);
    const safe = users.map(toSafeAdminUser);

    auditLog({
      action: 'api_access',
      role,
      ...actorFromSession(session),
      resource: 'api/admin/members [GET list]',
      success: true,
    });

    return data({success: true, users: safe, total: safe.length});
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    auditLog({
      action: 'api_error',
      role: null,
      resource: 'api/admin/members [GET]',
      success: false,
      detail: msg,
    });
    return data({success: false, error: msg}, {status: 500});
  }
}

// ── POST: CRUD ──

export async function action({request, context}: ActionFunctionArgs) {
  const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.members', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  if (request.method !== 'POST') {
    return data({error: 'Method not allowed'}, {status: 405});
  }

  let body: z.infer<typeof BodySchema>;
  try {
    const json = await request.json();
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return data(
        {success: false, error: 'リクエストの形式が不正です', issues: parsed.error.issues},
        {status: 400},
      );
    }
    body = parsed.data;
  } catch {
    return data({success: false, error: 'JSON の解析に失敗しました'}, {status: 400});
  }

  try {
    const session = await getSession(request, context, contextEnv);
    const client = await getAdminClient(contextEnv);
    const actor = actorFromSession(session);

    // setup_definition: users.create 未満でも bootstrap のため owner/admin なら許可
    if (body.action === 'setup_definition') {
      requireRole(session, 'admin');
      const res = await ensureAdminUserDefinition(client as unknown as Parameters<typeof ensureAdminUserDefinition>[0]);
      auditLog({
        action: 'settings_change',
        role: (session.get('role') as Role | undefined) ?? 'owner',
        ...actor,
        resource: `metaobject_definition/${ADMIN_USER_METAOBJECT_TYPE}`,
        detail: res.created ? 'created' : 'already exists',
        success: true,
      });
      return data({success: true, definitionId: res.id, created: res.created});
    }

    if (body.action === 'create') {
      // bootstrap: まだ誰もいないなら admin role 以上なら作成可 (初代は owner にする)
      const existingCount = await countAdminUsers(client).catch(() => 0);
      const isBootstrap = existingCount === 0;
      const role = isBootstrap
        ? requireRole(session, 'admin') // bootstrap: admin 以上ならOK
        : requirePermission(session, 'users.create');

      const pwCheck = validatePasswordMinimum(body.password);
      if (!pwCheck.valid) {
        return data({success: false, error: pwCheck.error}, {status: 400});
      }
      if (!isValidUsername(body.username)) {
        return data({success: false, error: 'ユーザー名は 3-32 文字の英数字+._-@ のみ'}, {status: 400});
      }

      const passwordHash = await hashPassword(body.password);
      const user = await createAdminUser(client, {
        username: body.username,
        displayName: body.displayName,
        passwordHash,
        // bootstrap 時の初代は強制的に owner (管理者不在状態を作らないため)
        role: isBootstrap ? 'owner' : body.role,
        active: true,
      });

      auditLog({
        action: 'user_create',
        role,
        ...actor,
        resource: `admin_user/${user.username}`,
        detail: isBootstrap ? 'bootstrap first user' : `role=${user.role}`,
        success: true,
      });

      return data({success: true, user: toSafeAdminUser(user), bootstrap: isBootstrap});
    }

    if (body.action === 'update') {
      const role = requirePermission(session, 'users.edit');
      const target = await getAdminUserById(client, body.id);
      if (!target) return data({success: false, error: 'ユーザーが見つかりません'}, {status: 404});

      // owner を editor/viewer に降格するのは owner 自身のみ
      if (body.role && target.role === 'owner' && body.role !== 'owner') {
        requireRole(session, 'owner');
      }
      // 自分自身の owner role を手放そうとする場合、owner が他にいるか確認
      if (body.id === session.get('userId') && body.role && body.role !== 'owner' && target.role === 'owner') {
        const users = await listAdminUsers(client);
        const otherOwners = users.filter((u) => u.role === 'owner' && u.id !== body.id && u.active);
        if (otherOwners.length === 0) {
          return data({success: false, error: '他に有効な owner がいないため role を変更できません'}, {status: 400});
        }
      }
      // 自分自身を deactivate しない
      if (body.id === session.get('userId') && body.active === false) {
        return data({success: false, error: '自分自身を無効化することはできません'}, {status: 400});
      }

      const updated = await updateAdminUser(client, body.id, {
        displayName: body.displayName,
        role: body.role,
        active: body.active,
      });

      auditLog({
        action: 'role_change',
        role,
        ...actor,
        resource: `admin_user/${target.username}`,
        detail: `displayName=${body.displayName ?? '-'}, role=${body.role ?? '-'}, active=${body.active ?? '-'}`,
        success: true,
      });

      return data({success: true, user: toSafeAdminUser(updated)});
    }

    if (body.action === 'reset_password') {
      const role = requirePermission(session, 'users.edit');
      const target = await getAdminUserById(client, body.id);
      if (!target) return data({success: false, error: 'ユーザーが見つかりません'}, {status: 404});

      const pwCheck = validatePasswordMinimum(body.newPassword);
      if (!pwCheck.valid) {
        return data({success: false, error: pwCheck.error}, {status: 400});
      }

      const passwordHash = await hashPassword(body.newPassword);
      await updateAdminUser(client, body.id, {passwordHash});

      auditLog({
        action: 'password_change',
        role,
        ...actor,
        resource: `admin_user/${target.username}`,
        detail: 'reset by admin',
        success: true,
      });

      return data({success: true});
    }

    if (body.action === 'change_password') {
      // 全ロール (viewer 含む) が自分のパスワードを変更可能
      requireRole(session, 'viewer');

      const userId = session.get('userId') as string | undefined;
      if (!userId || userId === 'bootstrap') {
        return data(
          {success: false, error: 'bootstrap ユーザーは自分のパスワードを変更できません。まず新規ユーザーを作成してください。'},
          {status: 400},
        );
      }

      const target = await getAdminUserById(client, userId);
      if (!target) return data({success: false, error: 'ユーザーが見つかりません'}, {status: 404});

      const ok = await verifyPassword(body.currentPassword, target.passwordHash);
      if (!ok) {
        auditLog({
          action: 'login_failed',
          role: (session.get('role') as Role | undefined) ?? null,
          ...actor,
          resource: `admin_user/${target.username}`,
          detail: 'change_password: current password mismatch',
          success: false,
        });
        return data({success: false, error: '現在のパスワードが一致しません'}, {status: 401});
      }

      const pwCheck = validatePasswordMinimum(body.newPassword);
      if (!pwCheck.valid) {
        return data({success: false, error: pwCheck.error}, {status: 400});
      }

      const passwordHash = await hashPassword(body.newPassword);
      await updateAdminUser(client, userId, {passwordHash});

      auditLog({
        action: 'password_change',
        role: (session.get('role') as Role | undefined) ?? null,
        ...actor,
        resource: `admin_user/${target.username}`,
        detail: 'self change',
        success: true,
      });

      return data({success: true});
    }

    if (body.action === 'delete') {
      const role = requirePermission(session, 'users.delete');
      const target = await getAdminUserById(client, body.id);
      if (!target) return data({success: false, error: 'ユーザーが見つかりません'}, {status: 404});

      // 自分自身は削除させない
      if (body.id === session.get('userId')) {
        return data({success: false, error: '自分自身を削除することはできません'}, {status: 400});
      }
      // 最後の owner は削除させない
      if (target.role === 'owner') {
        const users = await listAdminUsers(client);
        const activeOwners = users.filter((u) => u.role === 'owner' && u.active);
        if (activeOwners.length <= 1) {
          return data({success: false, error: '最後の owner は削除できません'}, {status: 400});
        }
      }

      await deleteAdminUser(client, body.id);

      auditLog({
        action: 'user_delete',
        role,
        ...actor,
        resource: `admin_user/${target.username}`,
        success: true,
      });

      return data({success: true});
    }

    return data({success: false, error: 'Unknown action'}, {status: 400});
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    auditLog({
      action: 'api_error',
      role: null,
      resource: 'api/admin/members [POST]',
      success: false,
      detail: msg,
    });
    // AppError は専用ステータスを持つ場合あり
    const err = error as {status?: number};
    const status = typeof err.status === 'number' ? err.status : 500;
    return data({success: false, error: msg}, {status});
  }
}

// unused import workaround
void findAdminUserByUsername;
