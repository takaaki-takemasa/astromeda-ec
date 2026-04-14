/**
 * lib/ バレルエクスポート — 中枢神経の集約点
 *
 * B-020: lib/ディレクトリのバレルファイル
 * 使用頻度の高いモジュールをまとめて re-export
 * 使用例: import { AppError, T, al, COLLABS } from '~/lib';
 *
 * 注意: 全ファイルをバレルにすると tree-shaking に影響するため、
 * 高頻度モジュールのみをエクスポートする（選択的バレル方式）
 */

// ━━━ エラーハンドリング（延髄） ━━━
export { AppError } from './app-error';
export type { ErrorCategory, ErrorSeverity, ProblemDetails } from './app-error';
export { withRetry, safeStorefrontQuery, safeJsonParse, safeLoader } from './error-recovery';

// ━━━ コアデータ ━━━
export { T, al, COLLABS, STORE_URL, BENCHMARKS } from './astromeda-data';

// ━━━ デザインシステム ━━━
export { color, font, radius, transition, zIndex } from './design-tokens';

// ━━━ API / バリデーション ━━━
export { corsHeaders } from './cors';
export { cacheHeaders } from './cache-headers';
export { rateLimiter } from './rate-limiter';

// ━━━ セッション / 認証 ━━━
export { AppSession } from './session';

// ━━━ セキュリティ（免疫系 + 心臓弁膜） ━━━
export { validateGraphQLQuery, assertValidGraphQL } from './graphql-guard';
export type { GraphQLValidationResult } from './graphql-guard';
export {
  hasPermission, requireRole, requirePermission, requireAnyPermission,
  getSessionRole, isRoleAtLeast, isValidRole, getPermissions, ALL_ROLES,
} from './rbac';
export type { Role, Permission } from './rbac';
export { auditLog, securityLog, getAuditLog, getAuditLogByAction } from './audit-log';
export type { AuditEntry, AuditAction } from './audit-log';
export { isLocked, recordFailedAttempt, recordSuccessfulLogin, getLockoutStats } from './account-lockout';
export { CircuitBreaker, storefrontCircuit, externalCircuit } from './circuit-breaker';
export type { CircuitState, CircuitBreakerStats } from './circuit-breaker';

// ━━━ 免疫系 IM-02~06（免疫記憶・胸腺教育） ━━━
export { verifyCsrfForAdmin, applyCsrfRotation } from './csrf-middleware';
export { isIPAllowed, checkIPAllowlist } from './ip-allowlist';
export { registerQuery, isQueryAllowed, getAllowlistStats } from './query-allowlist';
export { is2FAEnabled, generateTOTPSecret, generateOTPAuthURI } from './two-factor-auth';

// ━━━ データパイプライン（消化器系） ━━━
export { safeQuery, safeQueryAll } from './storefront-client';
export type { StorefrontClient, SafeQueryOptions } from './storefront-client';

// ━━━ ヘルパー関数 ━━━
export { sanitizeHtml } from './sanitize-html';
export { getQrCodeSvg } from './qr-code';
