/**
 * SK-03: API共有型定義 — 骨格系の関節構造
 *
 * APIレイヤー全体で共有される型をここに集約。
 * 個別モジュールから型だけインポートしたい場合に
 * 実装コードをバンドルに含めずに済む。
 */

// ━━━ API Envelope (AP-05) ━━━

export interface ApiEnvelope<T = unknown> {
  data: T | null;
  meta: {
    timestamp: string;
    traceId?: string;
    page?: number;
    pageSize?: number;
    total?: number;
  };
  errors: ApiError[];
}

export interface ApiError {
  code: string;
  message: string;
  field?: string;
}

// ━━━ GraphQL Guard ━━━

export interface GraphQLGuardResult {
  allowed: boolean;
  error?: string;
  status?: number;
}

export interface GraphQLQueryResult {
  valid: boolean;
  error?: string;
  sanitizedVariables?: Record<string, unknown>;
}

// ━━━ Rate Limiting ━━━

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// ━━━ Auth ━━━

export interface AdminAuthResult {
  authenticated: true;
}

export interface AdminAuthError {
  authenticated: false;
  response: Response;
}

export type AuthResult = AdminAuthResult | AdminAuthError;

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

// ━━━ Circuit Breaker ━━━

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number | null;
  lastSuccess: number | null;
}

// ━━━ Session Audit ━━━

export interface SessionAuditEntry {
  action: 'SET' | 'DESTROY' | 'REGENERATE' | 'IDLE_EXPIRE' | 'RECOVER';
  timestamp: string;
  ip: string;
  sessionId?: string;
}

// ━━━ RBAC ━━━

export type Role = 'owner' | 'admin' | 'editor' | 'viewer';

export type Permission =
  | 'agents:read' | 'agents:write' | 'agents:control'
  | 'pipelines:read' | 'pipelines:write' | 'pipelines:execute'
  | 'content:read' | 'content:write' | 'content:publish'
  | 'settings:read' | 'settings:write'
  | 'users:read' | 'users:write'
  | 'analytics:read'
  | 'andon:pull' | 'andon:clear'
  | 'audit:read'
  | 'system:upload' | 'system:download';

// ━━━ Error ━━━

export type ErrorCategory =
  | 'NETWORK'
  | 'STOREFRONT'
  | 'VALIDATION'
  | 'AUTH'
  | 'NOT_FOUND'
  | 'RATE_LIMIT'
  | 'CONFIGURATION'
  | 'INTERNAL';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

// ━━━ Audit Log ━━━

export type AuditAction =
  | 'login' | 'logout' | 'login_failed' | 'access_denied'
  | 'role_change' | 'user_create' | 'user_delete'
  | 'settings_change' | 'agent_control' | 'pipeline_execute'
  | 'system_upload' | 'system_download' | 'content_edit'
  | 'product_edit' | 'approval_decide'
  | 'andon_pull' | 'andon_clear'
  | 'password_change' | 'api_access';

export interface AuditEntry {
  timestamp: string;
  action: AuditAction;
  role: Role | null;
  resource: string;
  detail?: string;
  ip?: string;
  success: boolean;
}
