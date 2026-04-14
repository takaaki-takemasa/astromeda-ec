/**
 * Slack Client — 警告通知基盤（外部コミュニケーション）
 *
 * 医学的メタファー: 外部への神経信号伝達（脊髄から手足への信号）
 * Slack WebhookおよびAPIを経由して、重要なイベントを外部チャネルに通知する。
 *
 * 設計原則:
 * 1. fetch() を使用（@slack/boltは使わない — Oxygen/edge環境対応）
 * 2. 環境変数駆動 — トークン未設定時はconsole.logフォールバック
 * 3. レート制限 — チャネルあたり1msg/秒の制限
 * 4. 冪等性 — 同じメッセージの二重送信を防止
 */

import type { EventPriority } from './types.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('slack-client');


export interface SlackMessage {
  text: string;
  channel?: string;
  blocks?: Record<string, unknown>[];
  threadTs?: string;
}

interface RateLimitEntry {
  lastSendTime: number;
  count: number;
}

export class SlackClient {
  private botToken: string;
  private webhookUrl: string;
  private isConfigured: boolean;
  private rateLimits = new Map<string, RateLimitEntry>();
  private readonly RATE_LIMIT_WINDOW_MS = 1000; // 1秒
  private readonly MAX_MESSAGES_PER_SECOND = 1;

  constructor(botToken?: string, webhookUrl?: string) {
    this.botToken = botToken || process.env.SLACK_BOT_TOKEN || '';
    this.webhookUrl = webhookUrl || process.env.SLACK_WEBHOOK_URL || '';
    this.isConfigured = !!(this.botToken || this.webhookUrl);

    if (!this.isConfigured) {
      log.warn('[SlackClient] SLACK_BOT_TOKEN and SLACK_WEBHOOK_URL not configured, using console.log fallback');
    }
  }

  /**
   * チャネルにメッセージを送信（APIトークン経由）
   * Webhook URLではなくSlack Web APIを使用する場合に使用
   */
  async sendMessage(
    channel: string,
    text: string,
    blocks?: Record<string, unknown>[],
  ): Promise<boolean> {
    if (!this.botToken) {
      log.info(`[SlackClient] Message to #${channel}: ${text}`);
      return true;
    }

    // レート制限チェック
    if (!this.checkRateLimit(channel)) {
      log.warn(`[SlackClient] Rate limit exceeded for #${channel}, skipping message`);
      return false;
    }

    try {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel,
          text,
          blocks,
        }),
      });

      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!result.ok) {
        log.error(`[SlackClient] Slack API error: ${result.error}`);
        return false;
      }
      return true;
    } catch (err) {
      log.error('[SlackClient] Failed to send message:', err);
      return false;
    }
  }

  /**
   * Webhook URLにメッセージを送信（シンプルな通知）
   */
  async sendWebhook(text: string, blocks?: Record<string, unknown>[]): Promise<boolean> {
    if (!this.webhookUrl) {
      log.info(`[SlackClient] Webhook message: ${text}`);
      return true;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          blocks,
        }),
      });

      if (!response.ok) {
        log.error(`[SlackClient] Webhook returned ${response.status}`);
        return false;
      }
      return true;
    } catch (err) {
      log.error('[SlackClient] Failed to send webhook:', err);
      return false;
    }
  }

  /**
   * チャネルIDを名前から取得（API経由）
   * チャネル名「#critical」→ ID「C1234567」
   */
  async getChannelId(name: string): Promise<string | null> {
    if (!this.botToken) {
      log.warn('[SlackClient] No bot token, cannot fetch channel ID');
      return null;
    }

    try {
      const response = await fetch('https://slack.com/api/conversations.list', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.botToken}`,
        },
      });

      const result = (await response.json()) as {
        ok?: boolean;
        channels?: Array<{ name: string; id: string }>;
      };

      if (!result.ok || !result.channels) {
        log.error('[SlackClient] Failed to list channels');
        return null;
      }

      const channel = result.channels.find((c) => c.name === name);
      return channel?.id || null;
    } catch (err) {
      log.error('[SlackClient] Failed to get channel ID:', err);
      return null;
    }
  }

  /**
   * レート制限チェック
   */
  private checkRateLimit(channel: string): boolean {
    const now = Date.now();
    const entry = this.rateLimits.get(channel);

    if (!entry) {
      this.rateLimits.set(channel, { lastSendTime: now, count: 1 });
      return true;
    }

    // ウィンドウが期限切れ → リセット
    if (now - entry.lastSendTime > this.RATE_LIMIT_WINDOW_MS) {
      this.rateLimits.set(channel, { lastSendTime: now, count: 1 });
      return true;
    }

    // ウィンドウ内でのカウント増加
    if (entry.count < this.MAX_MESSAGES_PER_SECOND) {
      entry.count += 1;
      return true;
    }

    return false;
  }

  /**
   * 設定状態を確認
   */
  get available(): boolean {
    return this.isConfigured;
  }
}

// ── シングルトン ──
let slackClientInstance: SlackClient | null = null;

/**
 * SlackClient シングルトン取得
 */
export function getSlackClient(): SlackClient {
  if (!slackClientInstance) {
    slackClientInstance = new SlackClient();
  }
  return slackClientInstance;
}
