/**
 * RBAC（Role-Based Access Control）— 心臓弁膜の権限制御
 *
 * H-001: ロール定義・権限マトリクス
 * H-002: requireRole() ミドルウェア
 *
 * 医学メタファー: 心臓弁膜（Cardiac Valve）
 * 心臓弁膜が血流の方向を制御するように、
 * RBACはユーザーのアクセスを適切な範囲に制限する。
 * 弁の逆流（権限昇格）を防止し、各ロールに必要最小限の権限のみ付与。
 *
 * 設計方針:
 * - 最小権限の原則（Principle of Least Privilege）
 * - 既存の isAdmin セッションとの後方互換性
 * - セッションに role フィールドを追加（未設定時は isAdmin=true → owner）
 */

import {AppError} from '~/lib/app-error';
import type {AppSession} from '~/lib/session';

// ━━━ ロール定義 ━━━

/** システムロール（階層順: owner > admin > editor > vendor > viewer）
 * patch 0165: vendor 追加 — 他社（デザイン会社等）向けの限定ロール
 *   - ゲーミングPCタブ (gaming_*) のデザイン編集
 *   - コラボ以外の商品/コレクションの CRUD
 *   - IPコラボ系・トップページ系・メンバー管理・課金系には触れない
 */
export type Role = 'owner' | 'admin' | 'editor' | 'vendor' | 'viewer';

/** 権限名（ドメイン.アクション 形式） */
export type Permission =
  // ダッシュボード
  | 'dashboard.view'
  // エージェント管理
  | 'agents.view'
  | 'agents.control'
  | 'agents.configure'
  // パイプライン
  | 'pipelines.view'
  | 'pipelines.execute'
  // 商品管理
  | 'products.view'
  | 'products.edit'
  // コレクション管理
  | 'collections.view'
  | 'collections.edit'
  // 注文管理
  | 'orders.view'
  | 'orders.edit'
  // ユーザー管理
  | 'users.view'
  | 'users.create'
  | 'users.edit'
  | 'users.delete'
  // 設定
  | 'settings.view'
  | 'settings.edit'
  // システム
  | 'system.upload'
  | 'system.download'
  | 'system.logs'
  // GEO・SEO
  | 'geo.view'
  | 'geo.edit'
  // 承認
  | 'approvals.view'
  | 'approvals.decide'
  // 売上・アナリティクス
  | 'revenue.view'
  | 'analytics.view'
  // 安灯（Andon）
  | 'andon.view'
  | 'andon.clear';

// ━━━ 権限マトリクス ━━━

/**
 * 各ロールの権限セット
 * 階層構造: viewer ⊂ editor ⊂ admin ⊂ owner
 */
const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  viewer: new Set<Permission>([
    'dashboard.view',
    'agents.view',
    'pipelines.view',
    'products.view',
    'collections.view',
    'orders.view',
    'revenue.view',
    'analytics.view',
    'approvals.view',
    'andon.view',
    'geo.view',
  ]),

  /**
   * patch 0165: vendor — 他社（デザイン会社等）向け限定ロール
   * 権限: 商品編集 / コレクション編集 / ダッシュ閲覧 のみ。
   * 観察: viewer の閲覧 + 商品/コレクションの編集だけ追加。
   * orders / settings / users / system は一切触れない。
   * gaming_* Metaobject 編集は collections.edit + products.edit で判定。
   * ※ collab タグの商品/コレクションは API 層で別途 scope filter する (patch 0168)。
   */
  vendor: new Set<Permission>([
    'dashboard.view',
    'products.view',
    'collections.view',
    'products.edit',
    'collections.edit',
    'system.download', // 編集に必要 (画像 DL 等)
  ]),

  editor: new Set<Permission>([
    // viewer権限を継承
    'dashboard.view',
    'agents.view',
    'pipelines.view',
    'products.view',
    'collections.view',
    'orders.view',
    'revenue.view',
    'analytics.view',
    'approvals.view',
    'andon.view',
    'geo.view',
    // editor固有
    'products.edit',
    'collections.edit',
    'orders.edit',
    'agents.control',
    'pipelines.execute',
    'system.download',
    'system.logs',
  ]),

  admin: new Set<Permission>([
    // editor権限を継承
    'dashboard.view',
    'agents.view',
    'pipelines.view',
    'products.view',
    'collections.view',
    'orders.view',
    'revenue.view',
    'analytics.view',
    'approvals.view',
    'andon.view',
    'geo.view',
    'products.edit',
    'collections.edit',
    'orders.edit',
    'agents.control',
    'pipelines.execute',
    'system.download',
    'system.logs',
    // admin固有
    'agents.configure',
    'settings.view',
    'geo.edit',
    'approvals.decide',
    'andon.clear',
    'system.upload',
    'users.view',
  ]),

  owner: new Set<Permission>([
    // admin権限を継承 + 全権限
    'dashboard.view',
    'agents.view',
    'pipelines.view',
    'products.view',
    'collections.view',
    'orders.view',
    'revenue.view',
    'analytics.view',
    'approvals.view',
    'andon.view',
    'geo.view',
    'products.edit',
    'collections.edit',
    'orders.edit',
    'agents.control',
    'pipelines.execute',
    'system.download',
    'system.logs',
    'agents.configure',
    'settings.view',
    'geo.edit',
    'approvals.decide',
    'andon.clear',
    'system.upload',
    'users.view',
    // owner固有
    'users.create',
    'users.edit',
    'users.delete',
    'settings.edit',
  ]),
} as const;

/** ロール階層レベル（数値が大きいほど権限が高い）
 * patch 0165: vendor を viewer (0) と editor (1) の間に配置 (0.5)。
 * 商品/コレクション編集はできるが、orders/users/settings は触れない。
 * isRoleAtLeast('editor') の判定で vendor は不合格になる (1 > 0.5)。
 */
const ROLE_HIERARCHY: Readonly<Record<Role, number>> = {
  viewer: 0,
  vendor: 0.5,
  editor: 1,
  admin: 2,
  owner: 3,
} as const;

/** 全ロール一覧 */
export const ALL_ROLES: readonly Role[] = ['owner', 'admin', 'editor', 'vendor', 'viewer'] as const;

// ━━━ 権限チェック関数 ━━━

/**
 * 指定ロールが特定の権限を持つか判定
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms ? perms.has(permission) : false;
}

/**
 * 指定ロールが全ての権限を持つか判定
 */
export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

/**
 * 指定ロールがいずれかの権限を持つか判定
 */
export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * ロール階層で上位かどうか判定（同等以上ならtrue）
 */
export function isRoleAtLeast(role: Role, minimumRole: Role): boolean {
  return (ROLE_HIERARCHY[role] ?? -1) >= (ROLE_HIERARCHY[minimumRole] ?? Infinity);
}

/**
 * ロールの全権限一覧を取得
 */
export function getPermissions(role: Role): ReadonlySet<Permission> {
  return ROLE_PERMISSIONS[role] ?? new Set();
}

/**
 * 文字列がvalidなRoleかどうか判定
 */
export function isValidRole(value: unknown): value is Role {
  return typeof value === 'string' && value in ROLE_HIERARCHY;
}

// ━━━ セッションからロール取得 ━━━

/**
 * セッションからロールを安全に取得
 * 後方互換性: role未設定 + isAdmin=true → 'owner'
 */
export function getSessionRole(session: AppSession): Role | null {
  const isAdmin = session.get('isAdmin');
  if (!isAdmin) return null;

  // 新形式: role フィールドがある場合
  const role = session.get('role') as string | undefined;
  if (role && isValidRole(role)) return role;

  // 後方互換: isAdmin=true かつ role未設定 → owner（CEO用デフォルト）
  return 'owner';
}

// ━━━ ミドルウェア（H-002） ━━━

/**
 * 管理者ロール要求ミドルウェア
 *
 * loaderやaction内で使用:
 * ```ts
 * const role = requireRole(session, 'admin');
 * // or with specific permission:
 * requirePermission(session, 'agents.configure');
 * ```
 *
 * @throws AppError 認証失敗時は401、権限不足は403
 */
export function requireRole(session: AppSession, minimumRole: Role): Role {
  const role = getSessionRole(session);

  if (!role) {
    throw AppError.unauthorized('管理者ログインが必要です');
  }

  if (!isRoleAtLeast(role, minimumRole)) {
    // M8-IMMUNE-01: エラーメッセージからロール名を除去（情報漏洩防止）
    // 医学メタファー: 免疫細胞の表面抗原を外部に露出しない
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[RBAC] 権限不足: role=${role}, required=${minimumRole}`);
    }
    throw AppError.forbidden('この操作を実行する権限がありません');
  }

  return role;
}

/**
 * 特定権限要求ミドルウェア
 *
 * @throws AppError 認証失敗時は401、権限不足は403
 */
export function requirePermission(session: AppSession, permission: Permission): Role {
  const role = getSessionRole(session);

  if (!role) {
    throw AppError.unauthorized('管理者ログインが必要です');
  }

  if (!hasPermission(role, permission)) {
    // M8-IMMUNE-01: 権限名・ロール名を外部に露出しない
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[RBAC] 権限不足: role=${role}, required permission=${permission}`);
    }
    throw AppError.forbidden('この操作を実行する権限がありません');
  }

  return role;
}

/**
 * 複数権限のいずれかを要求
 */
export function requireAnyPermission(session: AppSession, permissions: Permission[]): Role {
  const role = getSessionRole(session);

  if (!role) {
    throw AppError.unauthorized('管理者ログインが必要です');
  }

  if (!hasAnyPermission(role, permissions)) {
    // M8-IMMUNE-01: 権限名リストを外部に露出しない
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[RBAC] 権限不足: role=${role}, required any of=${permissions.join(', ')}`);
    }
    throw AppError.forbidden('この操作を実行する権限がありません');
  }

  return role;
}
