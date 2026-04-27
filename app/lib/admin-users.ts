/**
 * admin_user Metaobject CRUD ラッパー
 *
 * patch 0156: single-password 共有の構造的解消。
 * 個別ユーザーを Shopify Metaobject (astromeda_admin_user) に保管。
 *
 * セキュリティ:
 *   - password_hash は pbkdf2 ハッシュ文字列 (admin-password.ts) のみ保存
 *   - 平文パスワードは絶対に保存しない (呼び出し側で hashPassword() 必須)
 *   - active=false のユーザーはログイン不可
 *
 * Bootstrap モード:
 *   - admin_user が 0 件の時は ADMIN_PASSWORD 環境変数で起動可能 (後方互換)
 *   - 1 件でも作成された後は bootstrap モードは自動で無効化される
 */
import type {Role} from '~/lib/rbac';
import {isValidRole} from '~/lib/rbac';

export const ADMIN_USER_METAOBJECT_TYPE = 'astromeda_admin_user';

export interface AdminUser {
  /** Metaobject GID (gid://shopify/Metaobject/xxx) */
  id: string;
  /** Metaobject handle (ユーザー名を handle にする・URL safe 化) */
  handle: string;
  /** ログイン ID */
  username: string;
  /** 表示名 (姓+名 から自動生成 or 手動入力 — 後方互換: 既存ユーザーはこのフィールドだけ持つ) */
  displayName: string;
  /** patch 0169: 姓 (例: 武正) — リカバリー連絡時の本人特定 */
  firstName?: string;
  /** patch 0169: 名 (例: 貴昭) */
  lastName?: string;
  /** patch 0169: メールアドレス — ログインできなくなった時の本人確認・パスワードリセット連絡先 */
  email?: string;
  /** pbkdf2 ハッシュ文字列 */
  passwordHash: string;
  /** 役割 (owner/admin/editor/vendor/viewer) */
  role: Role;
  /** 有効フラグ (false のユーザーはログイン不可) */
  active: boolean;
  /** 最終ログイン時刻 (ISO 8601, 未ログインは null) */
  lastLoginAt: string | null;
  /** Metaobject updatedAt (CAS 用) */
  updatedAt: string;
}

export interface CreateAdminUserInput {
  username: string;
  displayName: string;
  /** patch 0169: 姓 (任意・省略時は displayName のみ) */
  firstName?: string;
  /** patch 0169: 名 (任意) */
  lastName?: string;
  /** patch 0169: メールアドレス (オーナー/管理者は必須・編集者以下は任意) */
  email?: string;
  passwordHash: string;
  role: Role;
  active?: boolean;
}

export interface UpdateAdminUserInput {
  displayName?: string;
  /** patch 0169: 姓・名・メールも更新可能 */
  firstName?: string;
  lastName?: string;
  email?: string;
  passwordHash?: string;
  role?: Role;
  active?: boolean;
  lastLoginAt?: string;
}

/** patch 0169: 姓+名 から表示名を構築 (空なら fallback) */
export function buildDisplayName(firstName?: string, lastName?: string, fallback = ''): string {
  const f = (firstName || '').trim();
  const l = (lastName || '').trim();
  // 日本語慣習: 姓 (firstName) → 名 (lastName) を半角スペースで結合
  if (f && l) return `${f} ${l}`;
  if (f) return f;
  if (l) return l;
  return fallback;
}

/** patch 0169: メールアドレスのバリデーション (RFC 5321 簡易版) */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false;
  // 基本パターン: ローカル@ドメイン.tld
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** handle にする前の username をサニタイズ (lowercase + allowed chars only) */
export function usernameToHandle(username: string): string {
  return username
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 64);
}

/** username として許可される形式か (英数字+記号少々) */
export function isValidUsername(username: string): boolean {
  if (!username || typeof username !== 'string') return false;
  if (username.length < 3 || username.length > 32) return false;
  return /^[a-zA-Z0-9._\-@]+$/.test(username);
}

interface ShopifyAdminMinimal {
  createMetaobject(
    type: string,
    handle: string,
    fields: Array<{key: string; value: string}>,
  ): Promise<{id: string; handle: string}>;
  updateMetaobject(id: string, fields: Array<{key: string; value: string}>): Promise<{id: string}>;
  deleteMetaobject(id: string): Promise<boolean>;
  getMetaobjects(
    type: string,
    first?: number,
  ): Promise<Array<{id: string; handle: string; updatedAt: string; fields: Array<{key: string; value: string}>}>>;
  getMetaobjectById(
    id: string,
  ): Promise<{id: string; handle: string; updatedAt: string; fields: Array<{key: string; value: string}>} | null>;
}

function fieldMap(fields: Array<{key: string; value: string}>): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of fields) m.set(f.key, f.value);
  return m;
}

function recordToUser(rec: {
  id: string;
  handle: string;
  updatedAt: string;
  fields: Array<{key: string; value: string}>;
}): AdminUser {
  const m = fieldMap(rec.fields);
  const role = m.get('role') ?? 'viewer';
  // patch 0169: 姓+名+メール (任意・既存ユーザーは未設定なので空文字 → undefined)
  const firstName = (m.get('first_name') || '').trim() || undefined;
  const lastName = (m.get('last_name') || '').trim() || undefined;
  const email = (m.get('email') || '').trim() || undefined;
  // 表示名: 姓+名 が両方あればそれを優先、無ければ display_name → username → handle
  const explicitDisplay = m.get('display_name') || '';
  const displayName = buildDisplayName(firstName, lastName, explicitDisplay) || m.get('username') || rec.handle;
  return {
    id: rec.id,
    handle: rec.handle,
    username: m.get('username') ?? rec.handle,
    displayName,
    firstName,
    lastName,
    email,
    passwordHash: m.get('password_hash') ?? '',
    role: isValidRole(role) ? role : 'viewer',
    active: m.get('active') === 'true',
    lastLoginAt: m.get('last_login_at') || null,
    updatedAt: rec.updatedAt,
  };
}

/** admin_user の全件取得 */
export async function listAdminUsers(admin: ShopifyAdminMinimal): Promise<AdminUser[]> {
  const records = await admin.getMetaobjects(ADMIN_USER_METAOBJECT_TYPE, 250);
  return records.map(recordToUser);
}

/** admin_user 件数を取得 (bootstrap 判定用) */
export async function countAdminUsers(admin: ShopifyAdminMinimal): Promise<number> {
  const users = await listAdminUsers(admin);
  return users.length;
}

/** username でユーザーを検索 */
export async function findAdminUserByUsername(
  admin: ShopifyAdminMinimal,
  username: string,
): Promise<AdminUser | null> {
  const users = await listAdminUsers(admin);
  const needle = username.toLowerCase();
  return users.find((u) => u.username.toLowerCase() === needle) ?? null;
}

/** Metaobject ID でユーザーを取得 */
export async function getAdminUserById(
  admin: ShopifyAdminMinimal,
  id: string,
): Promise<AdminUser | null> {
  const rec = await admin.getMetaobjectById(id);
  if (!rec) return null;
  return recordToUser(rec);
}

export async function createAdminUser(
  admin: ShopifyAdminMinimal,
  input: CreateAdminUserInput,
): Promise<AdminUser> {
  if (!isValidUsername(input.username)) {
    throw new Error('ユーザー名は 3-32 文字の英数字・._-@ のみ使用できます');
  }
  if (!input.passwordHash || !input.passwordHash.startsWith('pbkdf2$')) {
    throw new Error('passwordHash は hashPassword() で生成してください');
  }
  if (!isValidRole(input.role)) {
    throw new Error('role が不正です (owner/admin/editor/viewer のいずれか)');
  }

  // 重複チェック
  const existing = await findAdminUserByUsername(admin, input.username);
  if (existing) {
    throw new Error(`ユーザー「${input.username}」はすでに登録されています`);
  }

  // patch 0169: メールフォーマット検証 (指定された場合のみ)
  if (input.email && !isValidEmail(input.email)) {
    throw new Error('メールアドレスの形式が不正です');
  }

  const handle = usernameToHandle(input.username);
  const fields: Array<{key: string; value: string}> = [
    {key: 'username', value: input.username},
    {key: 'display_name', value: input.displayName || input.username},
    {key: 'password_hash', value: input.passwordHash},
    {key: 'role', value: input.role},
    {key: 'active', value: String(input.active !== false)},
  ];
  // patch 0169: 姓+名+メール (任意フィールドなので、空でなければ送る)
  if (input.firstName) fields.push({key: 'first_name', value: input.firstName.trim()});
  if (input.lastName) fields.push({key: 'last_name', value: input.lastName.trim()});
  if (input.email) fields.push({key: 'email', value: input.email.trim()});

  const rec = await admin.createMetaobject(ADMIN_USER_METAOBJECT_TYPE, handle, fields);
  const full = await getAdminUserById(admin, rec.id);
  if (!full) throw new Error('作成後のユーザー取得に失敗');
  return full;
}

export async function updateAdminUser(
  admin: ShopifyAdminMinimal,
  id: string,
  input: UpdateAdminUserInput,
): Promise<AdminUser> {
  const fields: Array<{key: string; value: string}> = [];
  if (input.displayName !== undefined) fields.push({key: 'display_name', value: input.displayName});
  if (input.passwordHash !== undefined) {
    if (!input.passwordHash.startsWith('pbkdf2$')) {
      throw new Error('passwordHash は hashPassword() で生成してください');
    }
    fields.push({key: 'password_hash', value: input.passwordHash});
  }
  if (input.role !== undefined) {
    if (!isValidRole(input.role)) throw new Error('role が不正です');
    fields.push({key: 'role', value: input.role});
  }
  if (input.active !== undefined) fields.push({key: 'active', value: String(input.active)});
  if (input.lastLoginAt !== undefined) fields.push({key: 'last_login_at', value: input.lastLoginAt});
  // patch 0169: 姓+名+メール (空文字は明示的クリア意図として渡す = '' を送る)
  if (input.firstName !== undefined) fields.push({key: 'first_name', value: input.firstName.trim()});
  if (input.lastName !== undefined) fields.push({key: 'last_name', value: input.lastName.trim()});
  if (input.email !== undefined) {
    const trimmed = input.email.trim();
    if (trimmed && !isValidEmail(trimmed)) {
      throw new Error('メールアドレスの形式が不正です');
    }
    fields.push({key: 'email', value: trimmed});
  }

  if (fields.length === 0) {
    const existing = await getAdminUserById(admin, id);
    if (!existing) throw new Error('ユーザーが見つかりません');
    return existing;
  }

  await admin.updateMetaobject(id, fields);
  const full = await getAdminUserById(admin, id);
  if (!full) throw new Error('更新後のユーザー取得に失敗');
  return full;
}

export async function deleteAdminUser(admin: ShopifyAdminMinimal, id: string): Promise<boolean> {
  return admin.deleteMetaobject(id);
}

/** ログイン成功時に last_login_at を更新 (best-effort) */
export async function recordAdminUserLogin(
  admin: ShopifyAdminMinimal,
  id: string,
): Promise<void> {
  try {
    await admin.updateMetaobject(id, [
      {key: 'last_login_at', value: new Date().toISOString()},
    ]);
  } catch {
    // last_login_at の更新失敗はログインを妨げない
  }
}

/** passwordHash 以外のフィールドを返す (API レスポンス用・ハッシュは絶対に返さない) */
export function toSafeAdminUser(u: AdminUser): Omit<AdminUser, 'passwordHash'> {
  const {passwordHash: _passwordHash, ...rest} = u;
  void _passwordHash;
  return rest;
}
