/**
 * Admin API — ユーザー管理
 *
 * GET  /api/admin/users          → ユーザー一覧 + 統計
 * POST /api/admin/users          → ユーザー作成/編集/無効化
 *
 * 医学メタファー: MHC免疫レジストリ（自己認識データベース）
 * 免疫系が「自己」として認識する細胞のリストを管理する。
 * 新しい細胞（ユーザー）の登録、役割（ロール）の変更、
 * 異物（不正ユーザー）の無効化を行う。
 *
 * RBAC権限: owner のみ全操作可能。admin は一覧閲覧のみ。
 */

import { data } from 'react-router';
import { UserActionSchema } from '~/lib/api-schemas';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

export async function loader({ request, context }: { request: Request; context: { env: Env } }) {
  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  try {
    // RBAC: users.view permission required
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'users.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/users [GET]', success: true });
    const env = context.env as Env;
    const { getUserManager } = await import('../../agents/core/user-manager.js');
    const mgr = getUserManager();
    await mgr.initialize(env.ADMIN_PASSWORD);

    const users = mgr.getUsers();
    const { PERMISSIONS } = await import('../../agents/core/user-manager.js');

    return data({
      success: true,
      users: users.map(u => ({
        ...u,
        permissions: PERMISSIONS[u.role] || [],
      })),
      roles: [
        { id: 'owner', name: 'オーナー', description: '全権限（ユーザー管理・デプロイ・設定変更）', permissionCount: PERMISSIONS.owner.length },
        { id: 'admin', name: '管理者', description: 'Agent操作・承認・データ閲覧（ユーザー管理不可）', permissionCount: PERMISSIONS.admin.length },
        { id: 'viewer', name: '閲覧者', description: 'ダッシュボード閲覧のみ（操作不可）', permissionCount: PERMISSIONS.viewer.length },
      ],
      totalUsers: users.length,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[users API] Error:', error);
    return data({
      success: false,
      error: 'ユーザー情報の取得に失敗しました',
      users: [],
      roles: [],
      totalUsers: 0,
    });
  }
}

export async function action({ request, context }: { request: Request; context: { env: Env } }) {
  const csrfError = await verifyCsrfForAdmin(request, context.env);
  if (csrfError) return csrfError;

  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  try {
    // Zodスキーマによるリクエストボディ検証（S-04 免疫受容体）
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = UserActionSchema.safeParse(rawBody);
    if (!validation.success) {
      return data({ success: false, error: '入力値が無効です', details: validation.error.errors.map(e => e.message) }, { status: 400 });
    }

    const validBody = validation.data;
    const env = context.env as Env;
    const { getUserManager } = await import('../../agents/core/user-manager.js');
    const mgr = getUserManager();
    await mgr.initialize(env.ADMIN_PASSWORD);

    // RBAC: Check permission based on action
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    let permission: 'users.view' | 'users.create' | 'users.edit' | 'users.delete';
    switch (validBody.action) {
      case 'create':
        permission = 'users.create';
        break;
      case 'changeRole':
      case 'deactivate':
        permission = 'users.edit';
        break;
      default:
        permission = 'users.view';
    }
    const role = requirePermission(session, permission);

    switch (validBody.action) {
      case 'create': {
        auditLog({ action: 'user_create', role, resource: validBody.email, detail: `role=${validBody.role}`, success: true });
        const user = await mgr.createUser({
          email: validBody.email,
          displayName: validBody.displayName,
          role: validBody.role as 'owner' | 'admin' | 'viewer',
          password: validBody.password,
          createdBy: 'owner', // TODO: セッションからユーザーID取得
        });

        return data({ success: true, user: { ...user, passwordHash: '[REDACTED]' } });
      }

      case 'deactivate': {
        const result = await mgr.deactivateUser(validBody.userId);
        auditLog({ action: 'user_delete', role, resource: validBody.userId, success: result });
        return data({ success: result, error: result ? undefined : 'ユーザーが見つかりません' });
      }

      case 'changeRole': {
        const result = await mgr.changeRole(validBody.userId, validBody.newRole as 'owner' | 'admin' | 'viewer');
        auditLog({ action: 'role_change', role, resource: validBody.userId, detail: `newRole=${validBody.newRole}`, success: result });
        return data({ success: result, error: result ? undefined : 'ユーザーが見つかりません' });
      }

      default:
        return data({ success: false, error: '不明なアクション' }, { status: 400 });
    }
  } catch (error) {
    console.error('[users API] Action error:', error);
    return data({ success: false, error: 'ユーザー管理処理中にエラーが発生しました' }, { status: 500 });
  }
}
