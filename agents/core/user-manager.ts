/**
 * UserManager — マルチユーザー管理（社会的アイデンティティ=自己認識と他者認識）
 *
 * 医学的メタファー: 免疫系のMHC（主要組織適合性複合体）
 * MHCは「自己」と「非自己」を区別する仕組み。
 * UserManagerは「誰がこのシステムにアクセスしてよいか」を管理する。
 *
 * ロール:
 * - owner: 全権限（武正さん）。ユーザー管理・RBAC設定・デプロイ権限
 * - admin: 管理権限。Agent操作・承認・データ閲覧。ユーザー管理は不可
 * - viewer: 閲覧のみ。ダッシュボード表示のみ。操作不可
 *
 * Storage: KV Storage（永続化）。InMemory fallback。
 */

import { getStorage, TABLES } from './storage.js';
import type { IStorageAdapter, StorageRecord } from './storage.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('user-manager');


// ── 型定義 ──

export type UserRole = 'owner' | 'admin' | 'viewer';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;    // SHA-256ハッシュ
  createdAt: number;
  lastLoginAt?: number;
  isActive: boolean;
  createdBy: string;        // 招待元ユーザーID
}

interface StoredUser extends StorageRecord {
  email: string;
  displayName: string;
  role: string;
  passwordHash: string;
  lastLoginAt?: number;
  isActive: boolean;
  createdBy: string;
}

// ── RBAC権限マトリクス ──

export const PERMISSIONS: Record<UserRole, string[]> = {
  owner: [
    'dashboard.view',
    'agents.view', 'agents.control',
    'pipelines.view', 'pipelines.execute',
    'approvals.view', 'approvals.decide',
    'andon.pull', 'andon.clear',
    'quick-actions.execute',
    'revenue.view',
    'system.download', 'system.upload',
    'users.view', 'users.create', 'users.delete', 'users.edit',
    'settings.edit', 'password.change',
  ],
  admin: [
    'dashboard.view',
    'agents.view', 'agents.control',
    'pipelines.view', 'pipelines.execute',
    'approvals.view', 'approvals.decide',
    'andon.pull', 'andon.clear',
    'quick-actions.execute',
    'revenue.view',
    'system.download',
    'password.change',
  ],
  viewer: [
    'dashboard.view',
    'agents.view',
    'pipelines.view',
    'approvals.view',
    'revenue.view',
  ],
};

const USER_TABLE = 'users';

// ── UserManager クラス ──

export class UserManager {
  private storage: IStorageAdapter | null = null;
  private users: Map<string, User> = new Map();

  constructor() {
    try {
      this.storage = getStorage();
    } catch {
      this.storage = null;
    }
  }

  /**
   * 初期化 — 既存Storageからユーザー復元 + オーナーブートストラップ
   */
  async initialize(ownerPassword?: string): Promise<void> {
    // Storageからユーザー復元
    if (this.storage) {
      try {
        const records = await this.storage.query(USER_TABLE, {}) as StoredUser[];
        for (const record of records) {
          this.users.set(record.id, this.fromStorage(record));
        }
      } catch {
        // 初回起動時はテーブルが空
      }
    }

    // オーナーが存在しなければブートストラップ
    const owners = Array.from(this.users.values()).filter(u => u.role === 'owner');
    if (owners.length === 0 && ownerPassword) {
      const hash = await this.hashPassword(ownerPassword);
      const owner: User = {
        id: 'owner-001',
        email: 'owner@astromeda.local',
        displayName: 'オーナー',
        role: 'owner',
        passwordHash: hash,
        createdAt: Date.now(),
        isActive: true,
        createdBy: 'system',
      };
      this.users.set(owner.id, owner);
      await this.persist(owner);
    }
  }

  /**
   * パスワード認証
   */
  async authenticate(email: string, password: string): Promise<User | null> {
    const hash = await this.hashPassword(password);
    const user = Array.from(this.users.values()).find(
      u => u.email === email && u.isActive,
    );

    if (!user) return null;

    // timing-safe比較
    if (!this.timingSafeEqual(user.passwordHash, hash)) {
      return null;
    }

    // ログイン日時更新
    user.lastLoginAt = Date.now();
    await this.persist(user);
    return user;
  }

  /**
   * レガシーパスワード認証（環境変数の単一パスワード）
   * 後方互換性のため。マルチユーザー未設定時に使用。
   */
  async authenticateLegacy(password: string, adminPassword: string): Promise<User | null> {
    const encoder = new TextEncoder();
    const inputBytes = encoder.encode(password);
    const expectedBytes = encoder.encode(adminPassword);
    const maxLen = Math.max(inputBytes.byteLength, expectedBytes.byteLength);
    let diff = inputBytes.byteLength ^ expectedBytes.byteLength;
    for (let i = 0; i < maxLen; i++) {
      diff |= (inputBytes[i] ?? 0) ^ (expectedBytes[i] ?? 0);
    }

    if (diff !== 0) return null;

    // レガシー認証成功 → ownerとして返す
    return {
      id: 'legacy-owner',
      email: 'owner@astromeda.local',
      displayName: 'オーナー（レガシー認証）',
      role: 'owner',
      passwordHash: '',
      createdAt: 0,
      isActive: true,
      createdBy: 'system',
    };
  }

  /**
   * ユーザー作成（ownerのみ）
   */
  async createUser(params: {
    email: string;
    displayName: string;
    role: UserRole;
    password: string;
    createdBy: string;
  }): Promise<User> {
    // 重複チェック
    const exists = Array.from(this.users.values()).find(u => u.email === params.email);
    if (exists) throw new Error(`Email ${params.email} は既に登録されています`);

    const hash = await this.hashPassword(params.password);
    const user: User = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      email: params.email,
      displayName: params.displayName,
      role: params.role,
      passwordHash: hash,
      createdAt: Date.now(),
      isActive: true,
      createdBy: params.createdBy,
    };

    this.users.set(user.id, user);
    await this.persist(user);

    log.info(`[UserManager] Created: ${user.id} (${user.email}, ${user.role})`);
    return user;
  }

  /**
   * パスワード変更
   */
  async changePassword(userId: string, newPassword: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    user.passwordHash = await this.hashPassword(newPassword);
    await this.persist(user);

    log.info(`[UserManager] Password changed: ${userId}`);
    return true;
  }

  /**
   * ユーザー無効化
   */
  async deactivateUser(userId: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    user.isActive = false;
    await this.persist(user);

    log.info(`[UserManager] Deactivated: ${userId}`);
    return true;
  }

  /**
   * ロール変更
   */
  async changeRole(userId: string, newRole: UserRole): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    user.role = newRole;
    await this.persist(user);

    log.info(`[UserManager] Role changed: ${userId} → ${newRole}`);
    return true;
  }

  /**
   * 権限チェック
   */
  hasPermission(user: User, permission: string): boolean {
    const perms = PERMISSIONS[user.role] || [];
    return perms.includes(permission);
  }

  /**
   * ユーザー一覧
   */
  getUsers(): User[] {
    return Array.from(this.users.values())
      .map(u => ({ ...u, passwordHash: '[REDACTED]' })); // パスワードハッシュ除外
  }

  /**
   * ユーザー数
   */
  getUserCount(): number {
    return this.users.size;
  }

  // ── 内部メソッド ──

  private async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + ':astromeda-salt-v1');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  private async persist(user: User): Promise<void> {
    if (!this.storage) return;
    try {
      const record: StoredUser = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        passwordHash: user.passwordHash,
        lastLoginAt: user.lastLoginAt,
        isActive: user.isActive,
        createdBy: user.createdBy,
        createdAt: user.createdAt,
        updatedAt: Date.now(),
      };
      await this.storage.upsert(USER_TABLE, record);
    } catch (err) {
      log.warn('[UserManager] Persist failed:', err instanceof Error ? err.message : err);
    }
  }

  private fromStorage(record: StoredUser): User {
    return {
      id: record.id,
      email: record.email,
      displayName: record.displayName,
      role: record.role as UserRole,
      passwordHash: record.passwordHash,
      createdAt: record.createdAt || Date.now(),
      lastLoginAt: record.lastLoginAt,
      isActive: record.isActive !== false,
      createdBy: record.createdBy || 'system',
    };
  }
}

// ── シングルトン ──

let userManagerInstance: UserManager | null = null;

export function getUserManager(): UserManager {
  if (!userManagerInstance) {
    userManagerInstance = new UserManager();
  }
  return userManagerInstance;
}

export function resetUserManager(): void {
  userManagerInstance = null;
}
