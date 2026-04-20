/**
 * 監査ログ（Audit Log）— 心臓の拍動記録
 *
 * H-004: 管理操作の監査証跡
 *
 * 医学メタファー: 心電図（ECG）
 * 心臓の全拍動を記録するように、管理者の全操作を記録する。
 * 異常なパターン（不正アクセス試行、権限昇格など）を検出可能にする。
 *
 * 現段階: インメモリ + コンソールログ（Phase 2 で永続化予定）
 * Phase 2: Shopify メタオブジェクト or 外部ログサービスに永続化
 */

import type {Role} from '~/lib/rbac';

// ━━━ 監査イベント型 ━━━

export type AuditAction =
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'access_denied'
  | 'role_change'
  | 'user_create'
  | 'user_delete'
  | 'settings_change'
  | 'agent_control'
  | 'pipeline_execute'
  | 'system_upload'
  | 'system_download'
  | 'content_edit'
  | 'product_edit'
  | 'collection_create'
  | 'collection_update'
  | 'collection_delete'
  | 'product_bulk_tag'
  | 'url_redirect_create'
  | 'url_redirect_update'
  | 'url_redirect_delete'
  | 'file_delete'
  | 'metaobject_definition_create'
  | 'metaobject_definition_update'
  | 'metaobject_definition_delete'
  | 'approval_decide'
  | 'andon_pull'
  | 'andon_clear'
  | 'password_change'
  | 'api_access'
  | 'api_error';

export interface AuditEntry {
  /** ISO 8601 タイムスタンプ */
  timestamp: string;
  /** 操作種別 */
  action: AuditAction;
  /** 操作者のロール（未認証の場合 null） */
  role: Role | null;
  /** 操作対象のリソース */
  resource: string;
  /** 操作の詳細（任意） */
  detail?: string;
  /** リクエスト元IP（プライバシー考慮で末尾マスク） */
  ip?: string;
  /** 成功/失敗 */
  success: boolean;
}

// ━━━ インメモリバッファ（Phase 1） ━━━

/** 最大保持件数（メモリ保護） */
const MAX_ENTRIES = 1000;

const buffer: AuditEntry[] = [];

// ━━━ ログ記録関数 ━━━

/**
 * 監査ログを記録
 *
 * @example
 * auditLog({
 *   action: 'agent_control',
 *   role: 'admin',
 *   resource: 'agents/seo-optimizer',
 *   detail: 'エージェント再起動',
 *   success: true,
 * });
 */
export function auditLog(entry: Omit<AuditEntry, 'timestamp'>): void {
  const fullEntry: AuditEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  // インメモリバッファに追加（FIFO）
  buffer.push(fullEntry);
  if (buffer.length > MAX_ENTRIES) {
    buffer.shift();
  }

  // コンソール出力（構造化ログ）
  const level = entry.success ? 'info' : 'warn';
  const prefix = entry.success ? '✓' : '✗';
  console[level](
    `[AUDIT] ${prefix} ${entry.action} | role=${entry.role ?? 'anonymous'} | resource=${entry.resource}${entry.detail ? ` | ${entry.detail}` : ''}`,
  );
}

/**
 * セキュリティイベント専用ログ（アクセス拒否・ログイン失敗等）
 * 通常の監査ログより目立つ出力
 */
export function securityLog(
  action: 'login_failed' | 'access_denied',
  detail: string,
  ip?: string,
): void {
  auditLog({
    action,
    role: null,
    resource: 'security',
    detail,
    ip: ip ? maskIp(ip) : undefined,
    success: false,
  });
}

// ━━━ ログ取得 ━━━

/**
 * 監査ログバッファを取得（管理画面表示用）
 * @param limit 取得件数（デフォルト100）
 */
export function getAuditLog(limit = 100): readonly AuditEntry[] {
  return buffer.slice(-limit);
}

/**
 * 特定アクションのログをフィルタ取得
 */
export function getAuditLogByAction(action: AuditAction, limit = 50): readonly AuditEntry[] {
  return buffer.filter((e) => e.action === action).slice(-limit);
}

/**
 * バッファをクリア（テスト用）
 */
export function clearAuditLog(): void {
  buffer.length = 0;
}

// ━━━ ヘルパー ━━━

/**
 * IPアドレスの末尾をマスク（プライバシー保護）
 * 192.168.1.100 → 192.168.1.***
 */
function maskIp(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
  }
  // IPv6 or 不明 → 先頭のみ表示
  return ip.substring(0, Math.min(ip.length, 12)) + '***';
}
