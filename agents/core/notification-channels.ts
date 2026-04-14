/**
 * NotificationChannels — 多チャネル通知配信（感覚神経系の全身分布）
 *
 * 医学メタファー: 感覚神経は体表・内臓・筋肉に分布し、
 * あらゆる場所からの刺激を中枢に伝える。
 * NotificationChannelsは Slack/Email/Webhook/Dashboard/SMS の
 * 5チャネルで管理者に通知を配信する。
 *
 * 設計:
 * - NotificationBus（既存）→ このモジュールを経由して配信
 * - フォールバック: Slack失敗→Email→Webhook→Dashboard（内部キュー）
 * - 全配信を notification_log テーブルに記録
 */

import type { EventPriority } from './types.js';

// ─── チャネルインターフェース ───

export type NotificationChannel = 'slack' | 'email' | 'webhook' | 'dashboard' | 'sms';

export interface ChannelConfig {
  enabled: boolean;
  priority: EventPriority[];  // このチャネルが受け取る重要度
  endpoint?: string;           // URL or address
  apiKey?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationPayload {
  id: string;
  severity: EventPriority;
  source: string;
  title: string;
  message: string;
  timestamp: number;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface DeliveryResult {
  channel: NotificationChannel;
  success: boolean;
  sentAt?: number;
  error?: string;
  retryable?: boolean;
}

// ─── チャネル送信者インターフェース ───

export interface IChannelSender {
  readonly channel: NotificationChannel;
  send(payload: NotificationPayload): Promise<DeliveryResult>;
  isAvailable(): boolean;
}

// ─── Slack チャネル ───

export class SlackChannelSender implements IChannelSender {
  readonly channel: NotificationChannel = 'slack';
  private webhookUrl: string | null;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl || null;
  }

  isAvailable(): boolean {
    return this.webhookUrl !== null;
  }

  async send(payload: NotificationPayload): Promise<DeliveryResult> {
    if (!this.webhookUrl) {
      return { channel: 'slack', success: false, error: 'Webhook URL not configured', retryable: false };
    }

    try {
      const channelMap: Record<EventPriority, string> = {
        critical: '#astromeda-critical',
        high: '#astromeda-alerts',
        normal: '#astromeda-daily',
        low: '#astromeda-weekly',
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: channelMap[payload.severity] || '#astromeda-daily',
          text: `[${payload.severity.toUpperCase()}] ${payload.title}`,
          blocks: [
            { type: 'header', text: { type: 'plain_text', text: payload.title } },
            { type: 'section', text: { type: 'mrkdwn', text: payload.message } },
            {
              type: 'context',
              elements: [{
                type: 'mrkdwn',
                text: `*Source:* ${payload.source} | *Time:* ${new Date(payload.timestamp).toISOString()}`,
              }],
            },
            ...(payload.actionUrl ? [{
              type: 'actions',
              elements: [{
                type: 'button',
                text: { type: 'plain_text', text: 'View Details' },
                url: payload.actionUrl,
              }],
            }] : []),
          ],
        }),
      });

      if (response.ok) {
        return { channel: 'slack', success: true, sentAt: Date.now() };
      }
      return { channel: 'slack', success: false, error: `HTTP ${response.status}`, retryable: response.status >= 500 };
    } catch (err) {
      return { channel: 'slack', success: false, error: err instanceof Error ? err.message : String(err), retryable: true };
    }
  }
}

// ─── Email チャネル ───

export class EmailChannelSender implements IChannelSender {
  readonly channel: NotificationChannel = 'email';
  private apiKey: string | null;
  private fromAddress: string;
  private toAddresses: string[];

  constructor(config?: { apiKey?: string; from?: string; to?: string[] }) {
    this.apiKey = config?.apiKey || null;
    this.fromAddress = config?.from || 'astromeda-system@mining-base.co.jp';
    this.toAddresses = config?.to || [];
  }

  isAvailable(): boolean {
    return this.apiKey !== null && this.toAddresses.length > 0;
  }

  async send(payload: NotificationPayload): Promise<DeliveryResult> {
    if (!this.isAvailable()) {
      return { channel: 'email', success: false, error: 'Email not configured', retryable: false };
    }

    try {
      // Resend API 互換（将来的にSendGridやSESに差し替え可能）
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: this.toAddresses,
          subject: `[Astromeda ${payload.severity.toUpperCase()}] ${payload.title}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px;">
              <h2 style="color: ${payload.severity === 'critical' ? '#FF0000' : '#333'}">${payload.title}</h2>
              <p>${payload.message}</p>
              <hr>
              <small>Source: ${payload.source} | Time: ${new Date(payload.timestamp).toLocaleString('ja-JP')}</small>
              ${payload.actionUrl ? `<br><a href="${payload.actionUrl}">View Details</a>` : ''}
            </div>
          `,
        }),
      });

      if (response.ok) {
        return { channel: 'email', success: true, sentAt: Date.now() };
      }
      return { channel: 'email', success: false, error: `HTTP ${response.status}`, retryable: response.status >= 500 };
    } catch (err) {
      return { channel: 'email', success: false, error: err instanceof Error ? err.message : String(err), retryable: true };
    }
  }
}

// ─── Webhook チャネル ───

export class WebhookChannelSender implements IChannelSender {
  readonly channel: NotificationChannel = 'webhook';
  private url: string | null;
  private secret: string | null;

  constructor(config?: { url?: string; secret?: string }) {
    this.url = config?.url || null;
    this.secret = config?.secret || null;
  }

  isAvailable(): boolean {
    return this.url !== null;
  }

  async send(payload: NotificationPayload): Promise<DeliveryResult> {
    if (!this.url) {
      return { channel: 'webhook', success: false, error: 'Webhook URL not configured', retryable: false };
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.secret) {
        // HMAC-SHA256 署名（Web Crypto API — Edge互換）
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw', encoder.encode(this.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
        );
        const bodyStr = JSON.stringify(payload);
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(bodyStr));
        const hexSig = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
        headers['X-Signature-256'] = `sha256=${hexSig}`;
      }

      const response = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          event: 'notification',
          severity: payload.severity,
          data: payload,
        }),
      });

      if (response.ok) {
        return { channel: 'webhook', success: true, sentAt: Date.now() };
      }
      return { channel: 'webhook', success: false, error: `HTTP ${response.status}`, retryable: response.status >= 500 };
    } catch (err) {
      return { channel: 'webhook', success: false, error: err instanceof Error ? err.message : String(err), retryable: true };
    }
  }
}

// ─── Dashboard チャネル（内部キュー — SSE経由で配信） ───

export class DashboardChannelSender implements IChannelSender {
  readonly channel: NotificationChannel = 'dashboard';
  private queue: NotificationPayload[] = [];
  private readonly maxQueueSize = 500;

  isAvailable(): boolean {
    return true; // Dashboardは常に利用可能（内部キュー）
  }

  async send(payload: NotificationPayload): Promise<DeliveryResult> {
    this.queue.push(payload);
    if (this.queue.length > this.maxQueueSize) {
      this.queue = this.queue.slice(-this.maxQueueSize);
    }
    return { channel: 'dashboard', success: true, sentAt: Date.now() };
  }

  /** SSEストリームが取得するキュー */
  drain(limit = 50): NotificationPayload[] {
    return this.queue.splice(0, limit);
  }

  /** キューサイズ */
  getQueueSize(): number {
    return this.queue.length;
  }
}

// ─── チャネルオーケストレータ ───

export interface ChannelOrchestratorConfig {
  fallbackOrder: NotificationChannel[];  // フォールバック順
  channels: Partial<Record<NotificationChannel, ChannelConfig>>;
}

const DEFAULT_ORCHESTRATOR_CONFIG: ChannelOrchestratorConfig = {
  fallbackOrder: ['slack', 'email', 'webhook', 'dashboard'],
  channels: {
    slack: { enabled: true, priority: ['critical', 'high', 'normal', 'low'] },
    email: { enabled: false, priority: ['critical', 'high'] },
    webhook: { enabled: false, priority: ['critical'] },
    dashboard: { enabled: true, priority: ['critical', 'high', 'normal', 'low'] },
  },
};

/**
 * ChannelOrchestrator — 多チャネル配信制御（前頭前皮質の判断機能）
 *
 * フォールバック戦略: Slack失敗→Email→Webhook→Dashboard
 * Dashboard は最後の砦（内部キューなので必ず成功する）
 */
export class ChannelOrchestrator {
  private senders = new Map<NotificationChannel, IChannelSender>();
  private config: ChannelOrchestratorConfig;

  constructor(config?: Partial<ChannelOrchestratorConfig>) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
  }

  /** チャネル送信者を登録 */
  registerSender(sender: IChannelSender): void {
    this.senders.set(sender.channel, sender);
  }

  /** チャネル設定を更新 */
  updateChannelConfig(channel: NotificationChannel, config: Partial<ChannelConfig>): void {
    const existing = this.config.channels[channel] || { enabled: false, priority: [] };
    this.config.channels[channel] = { ...existing, ...config };
  }

  /**
   * 通知を配信（フォールバック付き）
   * @returns 成功したチャネルの配信結果リスト
   */
  async deliver(payload: NotificationPayload): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];
    let delivered = false;

    for (const channel of this.config.fallbackOrder) {
      const channelConfig = this.config.channels[channel];
      if (!channelConfig?.enabled) continue;
      if (!channelConfig.priority.includes(payload.severity)) continue;

      const sender = this.senders.get(channel);
      if (!sender || !sender.isAvailable()) continue;

      const result = await sender.send(payload);
      results.push(result);

      if (result.success) {
        delivered = true;
        // Dashboard は常に送信する（他チャネル成功に関係なく）
        if (channel !== 'dashboard') {
          // 主チャネルが成功した場合、Dashboardにも送信して終了
          const dashboardSender = this.senders.get('dashboard');
          if (dashboardSender && this.config.channels.dashboard?.enabled) {
            const dashResult = await dashboardSender.send(payload);
            results.push(dashResult);
          }
          break;
        }
      }
      // 失敗→フォールバックで次のチャネルへ
    }

    // 全チャネル失敗 → Dashboardに最低限記録
    if (!delivered) {
      const dashboardSender = this.senders.get('dashboard');
      if (dashboardSender) {
        const dashResult = await dashboardSender.send(payload);
        results.push(dashResult);
      }
    }

    return results;
  }

  /** 登録済みチャネルの状態一覧 */
  getChannelStatus(): Record<NotificationChannel, { enabled: boolean; available: boolean }> {
    const status = {} as Record<NotificationChannel, { enabled: boolean; available: boolean }>;
    for (const [channel, config] of Object.entries(this.config.channels)) {
      const sender = this.senders.get(channel as NotificationChannel);
      status[channel as NotificationChannel] = {
        enabled: config?.enabled ?? false,
        available: sender?.isAvailable() ?? false,
      };
    }
    return status;
  }

  /** Dashboardキューを取得（SSEストリームで使用） */
  drainDashboardQueue(limit = 50): NotificationPayload[] {
    const sender = this.senders.get('dashboard');
    if (sender instanceof DashboardChannelSender) {
      return sender.drain(limit);
    }
    return [];
  }
}

// ─── シングルトン ───

let orchestratorInstance: ChannelOrchestrator | null = null;

export function getChannelOrchestrator(): ChannelOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new ChannelOrchestrator();
    // デフォルトチャネル登録
    orchestratorInstance.registerSender(new SlackChannelSender(process.env.SLACK_WEBHOOK_URL));
    orchestratorInstance.registerSender(new EmailChannelSender({
      apiKey: process.env.RESEND_API_KEY,
      to: process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : [],
    }));
    orchestratorInstance.registerSender(new WebhookChannelSender({
      url: process.env.NOTIFICATION_WEBHOOK_URL,
      secret: process.env.WEBHOOK_SECRET,
    }));
    orchestratorInstance.registerSender(new DashboardChannelSender());
  }
  return orchestratorInstance;
}

export function resetChannelOrchestrator(): void {
  orchestratorInstance = null;
}
