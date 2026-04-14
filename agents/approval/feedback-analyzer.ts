/**
 * Feedback Analyzer — Phase 2-I #I-03
 *
 * 生体対応: 海馬（Hippocampus）
 * 承認結果・KPI変動・ユーザー満足度を学習し、エージェントの振る舞いを最適化。
 * 「経験から学ぶ」能力をシステムに付与する中枢。
 *
 * 機能:
 *   - 承認結果→フィードバック変換
 *   - KPI変動追跡→成功/失敗パターン分析
 *   - Agent別パフォーマンスレポート
 *   - プロンプト最適化提案
 *   - 自動承認率向上のための学習ループ
 */

import type { IAgentBus, AgentEvent } from '../core/types';
import type { FeedbackRecord, FeedbackType, FeedbackSentiment } from '../data-collection/data-models';

// ── 学習レコード ──

export interface LearningRecord {
  /** Agent ID */
  agentId: string;
  /** 学習カテゴリ */
  category: string;
  /** 成功パターン */
  successPatterns: string[];
  /** 失敗パターン */
  failurePatterns: string[];
  /** 推奨改善アクション */
  recommendations: string[];
  /** 学習日時 */
  learnedAt: number;
  /** 適用済みか */
  applied: boolean;
}

// ── Agent Performance Summary ──

export interface AgentPerformanceSummary {
  agentId: string;
  period: string;
  totalFeedbacks: number;
  positiveRate: number; // 0-100
  negativeRate: number;
  avgScore: number; // 0-100
  kpiImpacts: Array<{
    metric: string;
    avgChange: number;
    direction: 'positive' | 'negative' | 'neutral';
  }>;
  topSuccessActions: string[];
  topFailureActions: string[];
  trend: 'improving' | 'stable' | 'declining';
}

// ── Feedback Analyzer ──

export class FeedbackAnalyzer {
  private bus?: IAgentBus;
  private feedbacks: FeedbackRecord[] = [];
  private learningRecords: LearningRecord[] = [];
  private initialized = false;
  private readonly MAX_FEEDBACKS = 10000;
  private readonly MAX_LEARNING = 1000;

  constructor(bus?: IAgentBus) {
    this.bus = bus;
  }

  async initialize(): Promise<void> {
    this.initialized = true;

    if (this.bus) {
      this.bus.subscribe('approval.approved', (event: AgentEvent) => {
        this.recordApprovalFeedback(event, 'positive');
      });
      this.bus.subscribe('approval.rejected', (event: AgentEvent) => {
        this.recordApprovalFeedback(event, 'negative');
      });
      this.bus.subscribe('approval.auto_approved', (event: AgentEvent) => {
        this.recordApprovalFeedback(event, 'positive');
      });
      this.bus.subscribe('kpi.change', (event: AgentEvent) => {
        this.recordKPIFeedback(event);
      });
    }

    this.emitEvent('feedback.analyzer.initialized', {});
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.feedbacks = [];
    this.learningRecords = [];
  }

  getHealth() {
    return {
      initialized: this.initialized,
      feedbackCount: this.feedbacks.length,
      learningCount: this.learningRecords.length,
    };
  }

  // ── フィードバック記録 ──

  recordFeedback(feedback: Omit<FeedbackRecord, 'id' | 'createdAt' | 'updatedAt' | 'appliedToLearning'>): FeedbackRecord {
    const now = Date.now();
    const record: FeedbackRecord = {
      ...feedback,
      id: `fb-${now}-${Math.random().toString(36).slice(2, 8)}`,
      appliedToLearning: false,
      createdAt: now,
      updatedAt: now,
    };

    this.feedbacks.push(record);
    if (this.feedbacks.length > this.MAX_FEEDBACKS) {
      this.feedbacks = this.feedbacks.slice(-this.MAX_FEEDBACKS);
    }

    this.emitEvent('feedback.recorded', {
      agentId: record.agentId,
      type: record.type,
      sentiment: record.sentiment,
      score: record.score,
    });

    return record;
  }

  // ── Agent別パフォーマンス ──

  getAgentPerformance(agentId: string, period?: string): AgentPerformanceSummary {
    const agentFeedbacks = this.feedbacks.filter(f => f.agentId === agentId);
    const total = agentFeedbacks.length;

    if (total === 0) {
      return {
        agentId,
        period: period ?? 'all',
        totalFeedbacks: 0,
        positiveRate: 0,
        negativeRate: 0,
        avgScore: 0,
        kpiImpacts: [],
        topSuccessActions: [],
        topFailureActions: [],
        trend: 'stable',
      };
    }

    const positive = agentFeedbacks.filter(f => f.sentiment === 'positive').length;
    const negative = agentFeedbacks.filter(f => f.sentiment === 'negative').length;
    const avgScore = agentFeedbacks.reduce((sum, f) => sum + f.score, 0) / total;

    // KPIインパクト集約
    const kpiMap = new Map<string, { total: number; count: number }>();
    for (const f of agentFeedbacks) {
      if (f.kpiImpact) {
        const existing = kpiMap.get(f.kpiImpact.metric) ?? { total: 0, count: 0 };
        existing.total += f.kpiImpact.changePercent;
        existing.count++;
        kpiMap.set(f.kpiImpact.metric, existing);
      }
    }

    const kpiImpacts = Array.from(kpiMap.entries()).map(([metric, data]) => {
      const avgChange = data.total / data.count;
      return {
        metric,
        avgChange: Math.round(avgChange * 10) / 10,
        direction: (avgChange > 1 ? 'positive' : avgChange < -1 ? 'negative' : 'neutral') as 'positive' | 'negative' | 'neutral',
      };
    });

    // トレンド判定（直近30件と前30件を比較）
    const trend = this.calculateTrend(agentFeedbacks);

    return {
      agentId,
      period: period ?? 'all',
      totalFeedbacks: total,
      positiveRate: Math.round((positive / total) * 100),
      negativeRate: Math.round((negative / total) * 100),
      avgScore: Math.round(avgScore),
      kpiImpacts,
      topSuccessActions: this.getTopActions(agentFeedbacks, 'positive'),
      topFailureActions: this.getTopActions(agentFeedbacks, 'negative'),
      trend,
    };
  }

  // ── 学習ループ実行 ──

  runLearningCycle(): LearningRecord[] {
    if (!this.initialized) return [];

    // 未学習のフィードバックを抽出
    const unlearned = this.feedbacks.filter(f => !f.appliedToLearning);
    if (unlearned.length === 0) return [];

    // Agent別にグルーピング
    const agentGroups = new Map<string, FeedbackRecord[]>();
    for (const f of unlearned) {
      const group = agentGroups.get(f.agentId) ?? [];
      group.push(f);
      agentGroups.set(f.agentId, group);
    }

    const newLearnings: LearningRecord[] = [];

    for (const [agentId, feedbacks] of agentGroups) {
      // 最低5件のフィードバックで学習
      if (feedbacks.length < 5) continue;

      const positives = feedbacks.filter(f => f.sentiment === 'positive');
      const negatives = feedbacks.filter(f => f.sentiment === 'negative');

      const learning: LearningRecord = {
        agentId,
        category: feedbacks[0].type,
        successPatterns: positives.slice(0, 5).map(f => f.message),
        failurePatterns: negatives.slice(0, 5).map(f => f.message),
        recommendations: this.generateRecommendations(agentId, positives.length, negatives.length),
        learnedAt: Date.now(),
        applied: false,
      };

      newLearnings.push(learning);
      this.addLearningRecord(learning);

      // フィードバックを学習済みにマーク
      for (const f of feedbacks) {
        f.appliedToLearning = true;
        f.appliedAt = Date.now();
        f.updatedAt = Date.now();
      }
    }

    this.emitEvent('feedback.learning_cycle_complete', {
      agentsLearned: newLearnings.length,
      feedbacksProcessed: unlearned.length,
    });

    return newLearnings;
  }

  // ── 全体KPI ──

  getSystemLearningKPIs(): {
    totalFeedbacks: number;
    positiveRate: number;
    avgScore: number;
    learningCycles: number;
    agentsCovered: number;
    improvingAgents: number;
  } {
    const total = this.feedbacks.length;
    const positive = this.feedbacks.filter(f => f.sentiment === 'positive').length;
    const avgScore = total > 0 ? this.feedbacks.reduce((s, f) => s + f.score, 0) / total : 0;
    const agents = new Set(this.feedbacks.map(f => f.agentId));

    let improving = 0;
    for (const agentId of agents) {
      const perf = this.getAgentPerformance(agentId);
      if (perf.trend === 'improving') improving++;
    }

    return {
      totalFeedbacks: total,
      positiveRate: total > 0 ? Math.round((positive / total) * 100) : 0,
      avgScore: Math.round(avgScore),
      learningCycles: this.learningRecords.length,
      agentsCovered: agents.size,
      improvingAgents: improving,
    };
  }

  // ── Private ──

  private recordApprovalFeedback(event: AgentEvent, sentiment: FeedbackSentiment): void {
    const payload = event.payload as Record<string, unknown> | undefined;
    if (!payload?.agentId) return;

    this.recordFeedback({
      agentId: payload.agentId as string,
      type: 'approval_result',
      sourceActionId: payload.requestId as string ?? event.id,
      sentiment,
      score: sentiment === 'positive' ? 80 : 30,
      message: sentiment === 'positive'
        ? `承認: ${payload.title ?? 'N/A'}`
        : `却下: ${payload.title ?? 'N/A'} (理由: ${payload.reason ?? 'N/A'})`,
    });
  }

  private recordKPIFeedback(event: AgentEvent): void {
    const payload = event.payload as Record<string, unknown> | undefined;
    if (!payload?.agentId) return;

    const changePercent = (payload.changePercent as number) ?? 0;
    const sentiment: FeedbackSentiment = changePercent > 0 ? 'positive' : changePercent < 0 ? 'negative' : 'neutral';

    this.recordFeedback({
      agentId: payload.agentId as string,
      type: 'kpi_outcome',
      sourceActionId: event.id,
      sentiment,
      score: Math.min(100, Math.max(0, 50 + changePercent * 5)),
      message: `KPI ${payload.metric}: ${changePercent > 0 ? '+' : ''}${changePercent}%`,
      kpiImpact: {
        metric: (payload.metric as string) ?? '',
        before: (payload.before as number) ?? 0,
        after: (payload.after as number) ?? 0,
        changePercent,
      },
    });
  }

  private calculateTrend(feedbacks: FeedbackRecord[]): 'improving' | 'stable' | 'declining' {
    if (feedbacks.length < 10) return 'stable';

    const half = Math.floor(feedbacks.length / 2);
    const olderHalf = feedbacks.slice(0, half);
    const newerHalf = feedbacks.slice(half);

    const olderAvg = olderHalf.reduce((s, f) => s + f.score, 0) / olderHalf.length;
    const newerAvg = newerHalf.reduce((s, f) => s + f.score, 0) / newerHalf.length;

    const diff = newerAvg - olderAvg;
    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  }

  private getTopActions(feedbacks: FeedbackRecord[], sentiment: FeedbackSentiment): string[] {
    return feedbacks
      .filter(f => f.sentiment === sentiment)
      .slice(0, 3)
      .map(f => f.message);
  }

  private generateRecommendations(agentId: string, positiveCount: number, negativeCount: number): string[] {
    const recommendations: string[] = [];
    const total = positiveCount + negativeCount;

    if (total === 0) return ['データ不足: より多くのアクションを実行してフィードバックを蓄積'];

    const positiveRate = positiveCount / total;

    if (positiveRate < 0.5) {
      recommendations.push('承認率が低い: 提案の品質を改善するか、より保守的な提案を検討');
      recommendations.push('却下パターンを分析し、同様のアクションを避ける');
    } else if (positiveRate > 0.8) {
      recommendations.push('高い承認率: 自動承認閾値の引き下げを検討');
      recommendations.push('より積極的な施策提案を検討可能');
    }

    if (negativeCount > 0) {
      recommendations.push(`${negativeCount}件の否定フィードバックを詳細分析`);
    }

    return recommendations;
  }

  private addLearningRecord(record: LearningRecord): void {
    this.learningRecords.push(record);
    if (this.learningRecords.length > this.MAX_LEARNING) {
      this.learningRecords = this.learningRecords.slice(-this.MAX_LEARNING);
    }
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (!this.bus) return;
    this.bus.publish({
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      source: 'feedback-analyzer',
      priority: 'normal',
      payload,
      timestamp: Date.now(),
    });
  }
}
