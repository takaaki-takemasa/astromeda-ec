/**
 * AI Router — 47エージェントのAI層別ルーティング（大脳の機能分化）
 *
 * 医学的メタファー: 大脳皮質の機能分化（言語野・運動野など）
 * エージェントの重要度に応じてAI（Claude vs Gemini）を振り分ける。
 *
 * ティア構成:
 * - Tier A (8 agents): Claude Sonnet (primary) → Gemini Pro (fallback)
 * - Tier B (14 agents): Claude Haiku (primary) → Gemini Flash (fallback)
 * - Tier C (18 agents): Gemini Flash (primary) → Claude Haiku (fallback)
 * - Tier D (7 agents): Gemini Flash-Lite (primary) → Gemini Flash (fallback)
 */

import { createLogger } from '../core/logger.js';

const log = createLogger('ai-router');

export interface ModelConfig {
  provider: 'claude' | 'gemini';
  model: string;
  tier: 'A' | 'B' | 'C' | 'D';
}

interface RoutingEntry {
  agentId: string;
  primary: ModelConfig;
  fallback: ModelConfig;
}

/**
 * AI Router クラス
 */
export class AIRouter {
  private routingTable = new Map<string, RoutingEntry>();

  constructor() {
    this.initializeDefaultRouting();
  }

  /**
   * デフォルトルーティングテーブルを初期化
   * 47エージェント全体の最適な配置
   */
  private initializeDefaultRouting(): void {
    // ──── Tier A: 最高優先度エージェント (8個) ────
    // Command階層、重要な意思決定、複雑な分析
    const tierA: RoutingEntry[] = [
      // Command & L0
      {
        agentId: 'commander',
        primary: { provider: 'claude', model: 'claude-sonnet-4-20250514', tier: 'A' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-pro', tier: 'A' },
      },
      {
        agentId: 'l0-navigator',
        primary: { provider: 'claude', model: 'claude-sonnet-4-20250514', tier: 'A' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-pro', tier: 'A' },
      },
      // L1 Leads (Acquisition, Conversion, LTV)
      {
        agentId: 'acquisition-lead',
        primary: { provider: 'claude', model: 'claude-sonnet-4-20250514', tier: 'A' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-pro', tier: 'A' },
      },
      {
        agentId: 'conversion-lead',
        primary: { provider: 'claude', model: 'claude-sonnet-4-20250514', tier: 'A' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-pro', tier: 'A' },
      },
      {
        agentId: 'ltv-lead',
        primary: { provider: 'claude', model: 'claude-sonnet-4-20250514', tier: 'A' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-pro', tier: 'A' },
      },
      // Mission-Critical Agents
      {
        agentId: 'quality-auditor',
        primary: { provider: 'claude', model: 'claude-sonnet-4-20250514', tier: 'A' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-pro', tier: 'A' },
      },
      {
        agentId: 'security-guardian',
        primary: { provider: 'claude', model: 'claude-sonnet-4-20250514', tier: 'A' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-pro', tier: 'A' },
      },
      {
        agentId: 'performance-optimizer',
        primary: { provider: 'claude', model: 'claude-sonnet-4-20250514', tier: 'A' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-pro', tier: 'A' },
      },
    ];

    tierA.forEach((entry) => this.routingTable.set(entry.agentId, entry));

    // ──── Tier B: 高優先度エージェント (14個) ────
    // L2 Leads, 重要な分析・最適化タスク
    const tierB: RoutingEntry[] = [
      // L2 Leads (各チーム)
      {
        agentId: 'acquisition-l2',
        primary: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'B' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'B' },
      },
      {
        agentId: 'conversion-l2',
        primary: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'B' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'B' },
      },
      {
        agentId: 'ltv-l2',
        primary: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'B' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'B' },
      },
      {
        agentId: 'intelligence-lead',
        primary: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'B' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'B' },
      },
      {
        agentId: 'product-lead',
        primary: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'B' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'B' },
      },
      {
        agentId: 'marketing-lead',
        primary: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'B' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'B' },
      },
      // Analytics & Optimization
      {
        agentId: 'content-optimizer',
        primary: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'B' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'B' },
      },
      {
        agentId: 'image-generator',
        primary: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'B' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'B' },
      },
      {
        agentId: 'data-analyst',
        primary: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'B' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'B' },
      },
      {
        agentId: 'sentiment-analyzer',
        primary: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'B' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'B' },
      },
      {
        agentId: 'trend-detector',
        primary: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'B' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'B' },
      },
      {
        agentId: 'budget-planner',
        primary: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'B' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'B' },
      },
      {
        agentId: 'forecast-agent',
        primary: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'B' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'B' },
      },
      {
        agentId: 'compliance-checker',
        primary: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'B' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'B' },
      },
    ];

    tierB.forEach((entry) => this.routingTable.set(entry.agentId, entry));

    // ──── Tier C: 中優先度エージェント (18個) ────
    // レジスタンスなし、日常的なタスク、Gemini推奨
    const tierC: RoutingEntry[] = [
      {
        agentId: 'content-moderator',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'email-responder',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'chatbot',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'seo-optimizer',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'translation-agent',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'qa-tester',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'feedback-collector',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'category-classifier',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'recommendation-engine',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'inventory-monitor',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'pricing-optimizer',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'promotional-manager',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'coupon-generator',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'event-scheduler',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'notification-dispatcher',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'report-generator',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'log-analyzer',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
      {
        agentId: 'doc-parser',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'C' },
        fallback: { provider: 'claude', model: 'claude-haiku-4-20250514', tier: 'C' },
      },
    ];

    tierC.forEach((entry) => this.routingTable.set(entry.agentId, entry));

    // ──── Tier D: 軽量エージェント (7個) ────
    // 最軽量のGemini Flash-Lite で十分
    const tierD: RoutingEntry[] = [
      {
        agentId: 'health-monitor',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash-lite', tier: 'D' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'D' },
      },
      {
        agentId: 'heartbeat-agent',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash-lite', tier: 'D' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'D' },
      },
      {
        agentId: 'cache-warmer',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash-lite', tier: 'D' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'D' },
      },
      {
        agentId: 'metric-collector',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash-lite', tier: 'D' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'D' },
      },
      {
        agentId: 'event-router',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash-lite', tier: 'D' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'D' },
      },
      {
        agentId: 'dependency-tracker',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash-lite', tier: 'D' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'D' },
      },
      {
        agentId: 'scheduler-daemon',
        primary: { provider: 'gemini', model: 'gemini-2.0-flash-lite', tier: 'D' },
        fallback: { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'D' },
      },
    ];

    tierD.forEach((entry) => this.routingTable.set(entry.agentId, entry));
  }

  /**
   * エージェントのプライマリモデルを取得
   */
  getModel(agentId: string): ModelConfig | null {
    const entry = this.routingTable.get(agentId);
    return entry?.primary || null;
  }

  /**
   * エージェントのフォールバックモデルを取得
   */
  getFallbackModel(agentId: string): ModelConfig | null {
    const entry = this.routingTable.get(agentId);
    return entry?.fallback || null;
  }

  /**
   * ルーティングテーブル全体を取得
   */
  getRoutingTable(): RoutingEntry[] {
    return Array.from(this.routingTable.values());
  }

  /**
   * ルーティングテーブルのサマリー（ティア別集計）
   */
  getSummary(): Record<string, number> {
    const summary: Record<string, number> = {
      'Tier A': 0,
      'Tier B': 0,
      'Tier C': 0,
      'Tier D': 0,
    };

    for (const entry of this.routingTable.values()) {
      const tier = entry.primary.tier;
      summary[`Tier ${tier}`] += 1;
    }

    return summary;
  }

  /**
   * ルーティングを更新（動的に最適化する場合）
   */
  updateRoute(agentId: string, config: { primary?: ModelConfig; fallback?: ModelConfig }): void {
    const entry = this.routingTable.get(agentId);
    if (!entry) {
      log.warn(`[AIRouter] Agent ${agentId} not found in routing table`);
      return;
    }

    if (config.primary) {
      entry.primary = config.primary;
    }
    if (config.fallback) {
      entry.fallback = config.fallback;
    }

    log.info(`[AIRouter] Updated routing for ${agentId}`);
  }
}

// ── シングルトン ──
let routerInstance: AIRouter | null = null;

/**
 * AIRouter シングルトン取得
 */
export function getAIRouter(): AIRouter {
  if (!routerInstance) {
    routerInstance = new AIRouter();
  }
  return routerInstance;
}
