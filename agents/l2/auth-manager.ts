/**
 * AuthManager — L2 認証管理エージェント（免疫識別システム）
 *
 * 生体対応: MHC（主要組織適合性複合体）- 自己/非自己認識
 * ユーザー認証、RBAC（5段階ロール）、ユーザーCRUD、監査証跡、セッション管理を実行。
 * EngineeringLeadから指令を受け、システム全体のアクセス制御を担当。
 *
 * 担当タスク: validate_session, check_permission, audit_log, manage_user, role_assignment
 * 所属パイプライン: P09（セキュリティ監査パイプライン）
 */

import type {
  AgentId,
  AgentEvent,
  CascadeCommand,
  IAgentBus,
} from '../core/types';
import {BaseL2Agent} from './base-l2-agent';

/** 5段階ロール定義 */
type UserRole = 'super_admin' | 'admin' | 'editor' | 'viewer' | 'guest';

interface UserRecord {
  userId: string;
  email: string;
  role: UserRole;
  createdAt: number;
  lastLogin: number;
  isActive: boolean;
  permissions: string[];
}

interface SessionInfo {
  sessionId: string;
  userId: string;
  role: UserRole;
  createdAt: number;
  expiresAt: number;
  ipAddress?: string;
  userAgent?: string;
}

interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  resource: string;
  result: 'allowed' | 'denied';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** ロール別権限マトリックス */
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: ['*'], // 全権限
  admin: ['users.read', 'users.write', 'products.read', 'products.write', 'orders.read', 'orders.write', 'settings.read', 'settings.write', 'analytics.read'],
  editor: ['products.read', 'products.write', 'orders.read', 'analytics.read'],
  viewer: ['products.read', 'orders.read', 'analytics.read'],
  guest: ['products.read'],
};

export class AuthManager extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'auth-manager',
    name: 'AuthManager',
    level: 'L2',
    team: 'engineering',
    version: '1.0.0',
  };

  private users: Map<string, UserRecord> = new Map();
  private sessions: Map<string, SessionInfo> = new Map();
  private auditLog: AuditEntry[] = [];
  private readonly MAX_AUDIT_LOG = 10000;
  private readonly SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24h

  constructor(bus: IAgentBus) {
    super(bus);
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('auth.*');
    this.subscribe('security.access.*');
  }

  protected async onShutdown(): Promise<void> {
    this.users.clear();
    this.sessions.clear();
    this.auditLog = [];
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'auth.validate') {
      await this.handleValidateRequest(event);
    } else if (event.type === 'security.access.check') {
      await this.handleAccessCheck(event);
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'validate_session':
        return this.validateSession(command.params?.sessionId as string);
      case 'check_permission':
        return this.checkPermission(
          command.params?.userId as string,
          command.params?.permission as string,
        );
      case 'audit_log':
        return this.getAuditLog(command.params);
      case 'manage_user':
        return this.manageUser(command.params);
      case 'role_assignment':
        return this.assignRole(
          command.params?.userId as string,
          command.params?.role as UserRole,
        );
      case 'get_status':
        return this.getAuthStatus();
      default:
        return {status: 'unknown_action', action: command.action};
    }
  }

  // ── Core Operations ──

  private async handleValidateRequest(event: AgentEvent): Promise<void> {
    const payload = event.payload as {sessionId?: string} | undefined;
    if (!payload?.sessionId) return;
    const result = this.validateSession(payload.sessionId);
    await this.publishEvent('auth.validated', result);
  }

  private async handleAccessCheck(event: AgentEvent): Promise<void> {
    const payload = event.payload as {userId?: string; permission?: string} | undefined;
    if (!payload?.userId || !payload?.permission) return;
    const result = this.checkPermission(payload.userId, payload.permission);
    await this.publishEvent('security.access.result', result);
  }

  validateSession(sessionId: string | undefined): {valid: boolean; session?: SessionInfo; reason?: string} {
    if (!sessionId) return {valid: false, reason: 'セッションIDが未指定'};

    const session = this.sessions.get(sessionId);
    if (!session) return {valid: false, reason: 'セッションが存在しない'};
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return {valid: false, reason: 'セッション期限切れ'};
    }

    return {valid: true, session};
  }

  checkPermission(userId: string | undefined, permission: string | undefined): {
    allowed: boolean;
    userId?: string;
    permission?: string;
    role?: UserRole;
  } {
    if (!userId || !permission) {
      return {allowed: false};
    }

    const user = this.users.get(userId);
    if (!user || !user.isActive) {
      this.addAuditEntry(userId ?? 'unknown', 'check_permission', permission, 'denied');
      return {allowed: false, userId, permission};
    }

    const rolePermissions = ROLE_PERMISSIONS[user.role] ?? [];
    const allowed = rolePermissions.includes('*') || rolePermissions.includes(permission);

    this.addAuditEntry(userId, 'check_permission', permission, allowed ? 'allowed' : 'denied');

    return {allowed, userId, permission, role: user.role};
  }

  private manageUser(params: Record<string, unknown> | undefined): {status: string; user?: UserRecord} {
    if (!params) return {status: 'error', user: undefined};

    const action = params.action as string;
    const userId = params.userId as string;

    switch (action) {
      case 'create': {
        const user: UserRecord = {
          userId,
          email: (params.email as string) ?? '',
          role: (params.role as UserRole) ?? 'viewer',
          createdAt: Date.now(),
          lastLogin: 0,
          isActive: true,
          permissions: ROLE_PERMISSIONS[(params.role as UserRole) ?? 'viewer'] ?? [],
        };
        this.users.set(userId, user);
        this.addAuditEntry('system', 'user.create', userId, 'allowed');
        return {status: 'created', user};
      }
      case 'deactivate': {
        const user = this.users.get(userId);
        if (user) {
          user.isActive = false;
          this.addAuditEntry('system', 'user.deactivate', userId, 'allowed');
          return {status: 'deactivated', user};
        }
        return {status: 'not_found'};
      }
      case 'get': {
        const user = this.users.get(userId);
        return user ? {status: 'found', user} : {status: 'not_found'};
      }
      default:
        return {status: 'unknown_action'};
    }
  }

  private assignRole(userId: string | undefined, role: UserRole | undefined): {status: string; role?: UserRole} {
    if (!userId || !role) return {status: 'error'};
    if (!ROLE_PERMISSIONS[role]) return {status: 'invalid_role'};

    const user = this.users.get(userId);
    if (!user) return {status: 'user_not_found'};

    const oldRole = user.role;
    user.role = role;
    user.permissions = ROLE_PERMISSIONS[role] ?? [];

    this.addAuditEntry('system', 'role.assign', `${userId}: ${oldRole} → ${role}`, 'allowed');
    return {status: 'assigned', role};
  }

  private getAuditLog(params: Record<string, unknown> | undefined): {entries: AuditEntry[]; total: number} {
    const limit = (params?.limit as number) ?? 100;
    const userId = params?.userId as string | undefined;

    let entries = this.auditLog;
    if (userId) {
      entries = entries.filter(e => e.userId === userId);
    }

    return {
      entries: entries.slice(-limit),
      total: entries.length,
    };
  }

  private addAuditEntry(userId: string, action: string, resource: string, result: 'allowed' | 'denied'): void {
    this.auditLog.push({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      action,
      resource,
      result,
      timestamp: Date.now(),
    });

    if (this.auditLog.length > this.MAX_AUDIT_LOG) {
      this.auditLog = this.auditLog.slice(-this.MAX_AUDIT_LOG);
    }
  }

  private getAuthStatus(): Record<string, unknown> {
    return {
      totalUsers: this.users.size,
      activeSessions: this.sessions.size,
      auditEntries: this.auditLog.length,
      roleDistribution: this.getRoleDistribution(),
    };
  }

  private getRoleDistribution(): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const user of this.users.values()) {
      dist[user.role] = (dist[user.role] ?? 0) + 1;
    }
    return dist;
  }
}
