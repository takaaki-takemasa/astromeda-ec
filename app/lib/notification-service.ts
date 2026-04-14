/**
 * 通知サービス — 感覚系（Sensory System）
 *
 * NT-01~06: ADMIN_EMAIL通知、エスカレーション、CEOダッシュボード通知
 *
 * 医学メタファー: 感覚神経
 * 痛覚（エラー）・温覚（警告）・触覚（情報）を中枢（CEO）に伝達する。
 * エスカレーション = 痛みの閾値を超えたら自動的に上位神経へ伝達。
 *
 * Phase 1: インメモリ通知バッファ + コンソールログ
 * Phase 2: メール送信（Resend/SendGrid等の外部サービス連携）
 */

// ━━━ NT-01: 通知型定義 ━━━

export type NotificationLevel = 'info' | 'warning' | 'error' | 'critical';

export type NotificationChannel = 'console' | 'email' | 'dashboard' | 'webhook';

export interface Notification {
  id: string;
  level: NotificationLevel;
  title: string;
  message: string;
  source: string;
  channels: NotificationChannel[];
  timestamp: string;
  delivered: boolean;
  metadata?: Record<string, unknown>;
}

// ━━━ NT-02: 通知ルール ━━━

export interface NotificationRule {
  id: string;
  level: NotificationLevel;
  channels: NotificationChannel[];
  /** 同一ソースからの通知を抑制する間隔（ミリ秒） */
  cooldownMs: number;
  /** エスカレーション閾値（この回数超過で上位レベルに昇格） */
  escalateAfter?: number;
}

const DEFAULT_RULES: NotificationRule[] = [
  {id: 'info', level: 'info', channels: ['console', 'dashboard'], cooldownMs: 60_000},
  {id: 'warning', level: 'warning', channels: ['console', 'dashboard'], cooldownMs: 30_000},
  {id: 'error', level: 'error', channels: ['console', 'dashboard', 'email'], cooldownMs: 10_000, escalateAfter: 3},
  {id: 'critical', level: 'critical', channels: ['console', 'dashboard', 'email', 'webhook'], cooldownMs: 0},
];

// ━━━ 内部状態 ━━━

const notificationBuffer: Notification[] = [];
const MAX_BUFFER_SIZE = 500;

/** ソース別の最終通知時刻（クールダウン用） */
const lastNotified = new Map<string, number>();

/** ソース別のエラーカウント（エスカレーション用） */
const errorCounts = new Map<string, number>();

// ━━━ NT-01: ADMIN_EMAIL ━━━

let adminEmail: string | null = null;

/**
 * ADMIN_EMAIL を設定（起動時にenvから読み取る）
 */
export function setAdminEmail(email: string | undefined): void {
  adminEmail = email && email.includes('@') ? email : null;
}

/**
 * 現在のADMIN_EMAILを取得
 */
export function getAdminEmail(): string | null {
  return adminEmail;
}

// ━━━ NT-02: 通知送信 ━━━

/**
 * 通知を送信
 *
 * @param level - 重要度
 * @param title - タイトル
 * @param message - 詳細メッセージ
 * @param source - 発生源（エージェント名、ルート名等）
 * @param metadata - 追加データ（任意）
 */
export function notify(
  level: NotificationLevel,
  title: string,
  message: string,
  source: string,
  metadata?: Record<string, unknown>,
): Notification | null {
  // クールダウンチェック
  const rule = DEFAULT_RULES.find((r) => r.level === level) ?? DEFAULT_RULES[0];
  const cooldownKey = `${source}:${level}`;
  const now = Date.now();
  const lastTime = lastNotified.get(cooldownKey);

  if (lastTime && now - lastTime < rule.cooldownMs) {
    return null; // クールダウン中 — 抑制
  }

  lastNotified.set(cooldownKey, now);

  // NT-03: エスカレーション
  let effectiveLevel = level;
  if (level === 'error' && rule.escalateAfter) {
    const count = (errorCounts.get(source) ?? 0) + 1;
    errorCounts.set(source, count);
    if (count >= rule.escalateAfter) {
      effectiveLevel = 'critical';
      errorCounts.delete(source); // カウンタリセット
    }
  }

  const effectiveRule = DEFAULT_RULES.find((r) => r.level === effectiveLevel) ?? rule;

  const notification: Notification = {
    id: crypto.randomUUID(),
    level: effectiveLevel,
    title,
    message,
    source,
    channels: effectiveRule.channels,
    timestamp: new Date().toISOString(),
    delivered: false,
    metadata,
  };

  // チャネル別配信
  for (const channel of effectiveRule.channels) {
    deliverToChannel(channel, notification);
  }

  notification.delivered = true;

  // バッファに保存
  notificationBuffer.push(notification);
  if (notificationBuffer.length > MAX_BUFFER_SIZE) {
    notificationBuffer.shift();
  }

  return notification;
}

/**
 * チャネル別の配信ロジック
 */
function deliverToChannel(channel: NotificationChannel, notification: Notification): void {
  switch (channel) {
    case 'console': {
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
        const prefix = notification.level === 'critical' ? '🚨' :
          notification.level === 'error' ? '❌' :
          notification.level === 'warning' ? '⚠️' : 'ℹ️';
        console.log(
          `[NOTIFY] ${prefix} [${notification.level.toUpperCase()}] ${notification.title}: ${notification.message} (source: ${notification.source})`,
        );
      }
      break;
    }
    case 'dashboard':
      // Phase 1: バッファに保存するだけ（ダッシュボードがポーリングで取得）
      break;
    case 'email':
      // Phase 2: 実際のメール送信を実装
      if (adminEmail && typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.log(`[NOTIFY-EMAIL] To: ${adminEmail} | ${notification.title}: ${notification.message}`);
      }
      break;
    case 'webhook':
      // Phase 2: Webhook送信を実装
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.log(`[NOTIFY-WEBHOOK] ${notification.title}: ${notification.message}`);
      }
      break;
  }
}

// ━━━ NT-04: ダッシュボード通知取得 ━━━

/**
 * 未読通知を取得（ダッシュボード用）
 */
export function getNotifications(limit = 50): readonly Notification[] {
  return notificationBuffer.slice(-limit);
}

/**
 * レベル別通知取得
 */
export function getNotificationsByLevel(level: NotificationLevel, limit = 50): readonly Notification[] {
  return notificationBuffer.filter((n) => n.level === level).slice(-limit);
}

/**
 * 通知統計
 */
export function getNotificationStats(): {
  total: number;
  byLevel: Record<NotificationLevel, number>;
} {
  const stats = {
    total: notificationBuffer.length,
    byLevel: {info: 0, warning: 0, error: 0, critical: 0},
  };
  for (const n of notificationBuffer) {
    stats.byLevel[n.level]++;
  }
  return stats;
}

// ━━━ NT-05: テスト送信ボタン用 ━━━

/**
 * テスト通知を送信（管理画面の「テスト送信」ボタン用）
 */
export function sendTestNotification(): Notification | null {
  return notify(
    'info',
    'テスト通知',
    'これはテスト通知です。通知システムは正常に動作しています。',
    'notification-service/test',
  );
}

// ━━━ テスト用 ━━━

export function clearNotifications(): void {
  notificationBuffer.length = 0;
  lastNotified.clear();
  errorCounts.clear();
  adminEmail = null;
}
