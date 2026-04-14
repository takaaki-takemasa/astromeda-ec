/**
 * Slack Approval Bot — Phase 5, G-028
 *
 * Formats approval requests as Slack Block Kit messages
 * Integrates with ApprovalOrchestrator
 *
 * Features:
 *   - Formats approval requests as Block Kit messages
 *   - Buttons: Approve (✅), Reject (❌), Modify (✏️)
 *   - Fallback: console.log if SLACK_BOT_TOKEN missing (stub mode)
 *   - Methods: sendApprovalRequest(), handleInteraction()
 */

import type { ApprovalRequest, ApprovalPolicy } from './approval-orchestrator';
import { createLogger } from '../core/logger.js';

const log = createLogger('slack-approval-bot');


export interface SlackApprovalPayload {
  requestId: string;
  agentId: string;
  category: string;
  title: string;
  description: string;
  preview?: Record<string, unknown>;
  priority: 'critical' | 'high' | 'normal' | 'low';
  confidenceScore: number;
}

export interface SlackInteractionPayload {
  type: string;
  trigger_id: string;
  response_url: string;
  user: {
    id: string;
    username: string;
  };
  actions: Array<{
    type: string;
    action_id: string;
    value: string;
    text?: {
      type: string;
      text: string;
      emoji: boolean;
    };
  }>;
}

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  ts?: string;
}

export interface SlackBlockKitMessage {
  channel?: string;
  blocks: Array<Record<string, unknown>>;
  text?: string;
}

export class SlackApprovalBot {
  private botToken: string | undefined;
  private webhookUrl: string | undefined;
  private enabled: boolean;

  constructor(botToken?: string, webhookUrl?: string) {
    this.botToken = botToken || process.env.SLACK_BOT_TOKEN;
    this.webhookUrl = webhookUrl || process.env.SLACK_WEBHOOK_URL;
    this.enabled = !!this.botToken || !!this.webhookUrl;

    if (!this.enabled) {
      log.info('[SlackApprovalBot] SLACK_BOT_TOKEN/WEBHOOK_URL not configured — running in STUB MODE');
      log.info('[SlackApprovalBot] Approval requests will be logged to console only');
    }
  }

  /**
   * フォーマット: approval request → Slack Block Kit message
   */
  private formatApprovalMessage(payload: SlackApprovalPayload): SlackBlockKitMessage {
    const priorityColor = {
      critical: '#FF0000',
      high: '#FF6600',
      normal: '#0066FF',
      low: '#00AA00',
    };

    const blocks: Array<Record<string, unknown>> = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '承認リクエスト',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*申請Agent*\n${payload.agentId}`,
          },
          {
            type: 'mrkdwn',
            text: `*優先度*\n${payload.priority}`,
          },
          {
            type: 'mrkdwn',
            text: `*カテゴリ*\n${payload.category}`,
          },
          {
            type: 'mrkdwn',
            text: `*信頼度*\n${(payload.confidenceScore * 100).toFixed(0)}%`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${payload.title}*\n${payload.description}`,
        },
      },
    ];

    // Preview データがあれば表示
    if (payload.preview && Object.keys(payload.preview).length > 0) {
      const previewText = JSON.stringify(payload.preview, null, 2)
        .split('\n')
        .slice(0, 10)
        .join('\n');

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\`\`\`${previewText}\`\`\``,
        },
      });
    }

    // Action ボタン
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: 'approval-approve',
          text: {
            type: 'plain_text',
            text: '✅ 承認',
            emoji: true,
          },
          value: payload.requestId,
          style: 'primary',
        },
        {
          type: 'button',
          action_id: 'approval-reject',
          text: {
            type: 'plain_text',
            text: '❌ 却下',
            emoji: true,
          },
          value: payload.requestId,
          style: 'danger',
        },
        {
          type: 'button',
          action_id: 'approval-modify',
          text: {
            type: 'plain_text',
            text: '✏️ 修正',
            emoji: true,
          },
          value: payload.requestId,
        },
      ],
    });

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Request ID: \`${payload.requestId}\``,
        },
      ],
    });

    return {
      blocks,
      text: `${payload.title} — 承認リクエスト`,
    };
  }

  /**
   * Slack にメッセージを送信
   */
  async sendApprovalRequest(
    channel: string,
    payload: SlackApprovalPayload,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.enabled) {
      // STUB MODE: console にログして成功を返す
      log.info('[SlackApprovalBot] STUB: Approval request');
      log.info(`  Channel: ${channel}`);
      log.info(`  Request ID: ${payload.requestId}`);
      log.info(`  Title: ${payload.title}`);
      log.info(`  Priority: ${payload.priority}`);
      return { success: true, messageId: `stub-${payload.requestId}` };
    }

    try {
      const message = this.formatApprovalMessage(payload);
      message.channel = channel;

      // ① Webhook URL で送信（より簡単）
      if (this.webhookUrl) {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });

        if (!response.ok) {
          throw new Error(`Webhook failed: ${response.status}`);
        }

        return { success: true, messageId: 'webhook-sent' };
      }

      // ② Bot token で API 呼び出し（チャネルを指定して送信）
      if (this.botToken) {
        const response = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        });

        const data = (await response.json()) as SlackApiResponse;
        if (!data.ok) {
          throw new Error(`Slack API error: ${data.error}`);
        }

        return { success: true, messageId: data.ts };
      }

      throw new Error('No Slack configuration');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('[SlackApprovalBot] Send failed:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Slack interaction ペイロードを処理
   * (Slack webhook → API handler で呼び出す想定)
   */
  async handleInteraction(
    payload: SlackInteractionPayload,
  ): Promise<{
    success: boolean;
    action: 'approve' | 'reject' | 'modify' | 'unknown';
    requestId?: string;
    approver?: string;
    error?: string;
  }> {
    if (!this.enabled) {
      log.info('[SlackApprovalBot] STUB: Handle interaction');
      log.info(`  User: ${payload.user.username}`);
      log.info(`  Action: ${payload.actions[0]?.action_id}`);
      return {
        success: true,
        action: 'unknown',
        approver: payload.user.username,
      };
    }

    try {
      const action = payload.actions[0];
      if (!action) {
        throw new Error('No actions in payload');
      }

      const requestId = action.value;
      const approver = payload.user.id;
      let resultAction: 'approve' | 'reject' | 'modify' | 'unknown' = 'unknown';

      if (action.action_id === 'approval-approve') {
        resultAction = 'approve';
      } else if (action.action_id === 'approval-reject') {
        resultAction = 'reject';
      } else if (action.action_id === 'approval-modify') {
        resultAction = 'modify';
      }

      // Response URL で即座に確認メッセージを返す
      if (payload.response_url) {
        const ack = {
          text: `✅ ${resultAction === 'approve' ? '承認しました' : resultAction === 'reject' ? '却下しました' : '修正リクエストを送信しました'}`,
          response_type: 'in_channel',
        };

        await fetch(payload.response_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ack),
        });
      }

      return {
        success: true,
        action: resultAction,
        requestId,
        approver,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('[SlackApprovalBot] Interaction failed:', message);
      return {
        success: false,
        action: 'unknown',
        error: message,
      };
    }
  }

  /**
   * Slack 接続テスト
   */
  async testConnection(): Promise<{ connected: boolean; mode: 'bot' | 'webhook' | 'stub' }> {
    if (!this.enabled) {
      return { connected: true, mode: 'stub' };
    }

    if (this.botToken) {
      try {
        const response = await fetch('https://slack.com/api/auth.test', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.botToken}`,
          },
        });
        const data = (await response.json()) as SlackApiResponse;
        return { connected: data.ok, mode: 'bot' };
      } catch {
        return { connected: false, mode: 'bot' };
      }
    }

    if (this.webhookUrl) {
      // Webhook は送信まで試さないとわからない（ダミー送信は避ける）
      return { connected: true, mode: 'webhook' };
    }

    return { connected: false, mode: 'stub' };
  }

  /**
   * Health check
   */
  getHealth(): {
    enabled: boolean;
    mode: 'bot' | 'webhook' | 'stub';
    botToken?: boolean;
    webhookUrl?: boolean;
  } {
    return {
      enabled: this.enabled,
      mode: this.botToken ? 'bot' : this.webhookUrl ? 'webhook' : 'stub',
      botToken: !!this.botToken,
      webhookUrl: !!this.webhookUrl,
    };
  }
}
