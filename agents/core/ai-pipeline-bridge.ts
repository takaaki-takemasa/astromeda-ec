/**
 * AI-Pipeline Bridge — AIBrainとPipelineEngineの連携（前頭前皮質→血管系の統合）
 *
 * 医学的メタファー: 前頭前皮質（Prefrontal Cortex）→ 自律神経系の統合
 * 脳（AIBrain）が血管系（PipelineEngine）の流量を制御する。
 * 高次認知が「このパイプラインを実行すべきか」「次のステップに進むべきか」を判断し、
 * 高リスクな操作は承認キュー（前頭前皮質の「待って」信号）へ送る。
 *
 * 設計原則:
 * 1. パイプラインステップにAI判断ポイントを挿入
 * 2. 高リスク操作は自動的に承認キューへ
 * 3. AI未接続時はルールベースフォールバック
 * 4. 全判断をFeedbackCollectorに記録
 *
 * 成熟依存: L14(AIBrain) → L12(ApprovalQueue) → L5(Pipeline) → L3(AgentBus)
 */

import { getAIBrain } from './ai-brain.js';
import { getApprovalQueue } from './approval-queue.js';
import type { AIDecision, AIAnalysis } from './ai-brain.js';
import type { ApprovalRequest } from './approval-queue.js';
import type { PipelineDefinition, PipelineStep, AgentEvent, IAgentBus } from './types.js';

// ── 型定義 ──

export interface AIPipelineDecision {
  pipelineId: string;
  stepId?: string;
  decision: AIDecision;
  action: 'execute' | 'skip' | 'pause' | 'abort' | 'modify';
  modifiedParams?: Record<string, unknown>;
  timestamp: number;
}

export interface PipelineRiskAssessment {
  pipelineId: string;
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  stepRisks: Array<{
    stepId: string;
    agentId: string;
    action: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    reason: string;
  }>;
  recommendation: string;
  requiresApproval: boolean;
}

// ── リスク分類マップ（アクション→リスクレベル） ──

const ACTION_RISK_MAP: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  // Critical: 取り消し不可能な操作
  'deploy': 'critical',
  'delete': 'critical',
  'price.update.bulk': 'critical',
  'inventory.write.bulk': 'critical',
  'order.cancel.bulk': 'critical',

  // High: 顧客/売上に影響
  'price.update': 'high',
  'product.publish': 'high',
  'product.unpublish': 'high',
  'discount.create': 'high',
  'email.send.bulk': 'high',
  'inventory.adjust': 'high',

  // Medium: モニタリング系
  'content.generate': 'medium',
  'image.generate': 'medium',
  'seo.update': 'medium',
  'ab.test.start': 'medium',
  'report.generate': 'medium',

  // Low: 読み取り/分析系
  'analyze': 'low',
  'monitor': 'low',
  'fetch': 'low',
  'report.read': 'low',
  'health.check': 'low',
};

/**
 * AI-Pipeline Bridge クラス
 *
 * パイプライン実行前にAIBrainで判断し、
 * 高リスク操作は承認キューへ送り、
 * 全判断を記録する。
 */
export class AIPipelineBridge {
  private decisionHistory: AIPipelineDecision[] = [];
  private maxHistorySize = 500;

  /**
   * パイプライン実行前のリスク評価
   * 脳が「この血流を許可するか」を判断する
   */
  assessPipelineRisk(definition: PipelineDefinition): PipelineRiskAssessment {
    const stepRisks = definition.steps.map(step => {
      const riskLevel = ACTION_RISK_MAP[step.action] || 'medium';
      const reason = this.getRiskReason(step, riskLevel);
      return {
        stepId: step.id,
        agentId: step.agentId,
        action: step.action,
        riskLevel,
        reason,
      };
    });

    // 全体リスク = 最も高いステップリスクに合わせる
    const riskOrder: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];
    const overallRisk = stepRisks.reduce(
      (max, step) => riskOrder.indexOf(step.riskLevel) > riskOrder.indexOf(max) ? step.riskLevel : max,
      'low' as 'low' | 'medium' | 'high' | 'critical',
    );

    const criticalSteps = stepRisks.filter(s => s.riskLevel === 'critical');
    const highSteps = stepRisks.filter(s => s.riskLevel === 'high');

    let recommendation: string;
    if (criticalSteps.length > 0) {
      recommendation = `危険度「致命的」のステップ（${criticalSteps.map(s => s.stepId).join(', ')}）が含まれています。オーナー承認が必須です。`;
    } else if (highSteps.length > 0) {
      recommendation = `高リスクステップ（${highSteps.map(s => s.stepId).join(', ')}）があります。承認を推奨します。`;
    } else {
      recommendation = '全ステップが低～中リスクです。自動実行可能です。';
    }

    return {
      pipelineId: definition.id,
      overallRisk,
      stepRisks,
      recommendation,
      requiresApproval: overallRisk === 'critical' || overallRisk === 'high',
    };
  }

  /**
   * AIによるパイプライン実行判断
   * 脳が「このパイプラインを今実行すべきか」をAIに問う
   */
  async decideExecution(
    definition: PipelineDefinition,
    context: Record<string, unknown> = {},
  ): Promise<AIPipelineDecision> {
    const brain = getAIBrain();
    const riskAssessment = this.assessPipelineRisk(definition);

    // AI未設定時はルールベース判断
    if (!brain.available) {
      return this.ruleBasedExecution(definition, riskAssessment);
    }

    const decision = await brain.decide({
      agentId: 'pipeline-engine',
      agentName: 'パイプラインエンジン',
      context: `パイプライン「${definition.name}」(ID: ${definition.id})の実行判断。
リスク評価: ${riskAssessment.overallRisk}
ステップ数: ${definition.steps.length}
トリガー: ${definition.trigger.type}
失敗時モード: ${definition.onFailure}
${riskAssessment.recommendation}`,
      options: [
        '実行する（全ステップを通常実行）',
        'スキップ（今は実行しない）',
        '一時停止して承認を求める',
        '中止（リスクが高すぎる）',
        'パラメータを修正して実行',
      ],
      currentData: {
        pipelineId: definition.id,
        stepCount: definition.steps.length,
        riskAssessment,
        ...context,
      },
      category: this.getCategoryFromPipeline(definition),
    });

    const actionMap: Record<string, AIPipelineDecision['action']> = {
      '1': 'execute',
      '2': 'skip',
      '3': 'pause',
      '4': 'abort',
      '5': 'modify',
    };

    const pipelineDecision: AIPipelineDecision = {
      pipelineId: definition.id,
      decision,
      action: actionMap[decision.action] || 'pause',
      timestamp: Date.now(),
    };

    this.recordDecision(pipelineDecision);
    return pipelineDecision;
  }

  /**
   * AIによるステップ実行前判断
   * 脳が「このステップに進むべきか」を判断する（ゲーティング機構）
   */
  async decideStep(
    definition: PipelineDefinition,
    step: PipelineStep,
    previousResults: Map<string, unknown>,
  ): Promise<AIPipelineDecision> {
    const brain = getAIBrain();
    const stepRisk = ACTION_RISK_MAP[step.action] || 'medium';

    // 低リスクステップはAI判断をスキップ（コスト削減）
    if (stepRisk === 'low' && brain.available) {
      const autoDecision: AIPipelineDecision = {
        pipelineId: definition.id,
        stepId: step.id,
        decision: {
          action: 'execute',
          reasoning: '低リスクステップのため自動承認',
          confidence: 0.95,
          riskLevel: 'low',
          requiresApproval: false,
        },
        action: 'execute',
        timestamp: Date.now(),
      };
      this.recordDecision(autoDecision);
      return autoDecision;
    }

    // AI未設定 or 中リスク以上はルールベース
    if (!brain.available) {
      return this.ruleBasedStep(definition, step, stepRisk);
    }

    const prevResultSummary = Object.fromEntries(
      Array.from(previousResults.entries()).map(([k, v]) => [
        k,
        typeof v === 'object' ? '[object]' : String(v).slice(0, 100),
      ]),
    );

    const decision = await brain.decide({
      agentId: step.agentId,
      agentName: `Pipeline ${definition.name} → Step ${step.id}`,
      context: `パイプライン「${definition.name}」のステップ「${step.id}」の実行判断。
アクション: ${step.action}
対象Agent: ${step.agentId}
リスクレベル: ${stepRisk}
前ステップ結果: ${JSON.stringify(prevResultSummary).slice(0, 500)}`,
      options: [
        'このステップを実行する',
        'このステップをスキップする',
        'パイプラインを一時停止して承認を求める',
        'パイプラインを中止する',
      ],
      currentData: {
        stepId: step.id,
        action: step.action,
        riskLevel: stepRisk,
      },
      category: this.getCategoryFromPipeline(definition),
    });

    const stepActionMap: Record<string, AIPipelineDecision['action']> = {
      '1': 'execute',
      '2': 'skip',
      '3': 'pause',
      '4': 'abort',
    };

    const pipelineDecision: AIPipelineDecision = {
      pipelineId: definition.id,
      stepId: step.id,
      decision,
      action: stepActionMap[decision.action] || 'pause',
      timestamp: Date.now(),
    };

    this.recordDecision(pipelineDecision);
    return pipelineDecision;
  }

  /**
   * パイプライン結果のAI分析
   */
  async analyzeResults(
    definition: PipelineDefinition,
    results: Map<string, unknown>,
    executionTimeMs: number,
  ): Promise<AIAnalysis> {
    const brain = getAIBrain();

    if (!brain.available) {
      return {
        summary: 'AI API未接続のため分析をスキップ',
        insights: [],
        recommendations: [],
        confidence: 0,
        dataPoints: results.size,
        tokensUsed: 0,
      };
    }

    return brain.analyze({
      agentId: 'pipeline-engine',
      data: {
        pipelineId: definition.id,
        pipelineName: definition.name,
        stepCount: definition.steps.length,
        executionTimeMs,
        results: Object.fromEntries(
          Array.from(results.entries()).map(([k, v]) => [
            k,
            typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v).slice(0, 200),
          ]),
        ),
      },
      question: `パイプライン「${definition.name}」の実行結果を分析し、改善提案をしてください。`,
    });
  }

  /**
   * 判断履歴を取得
   */
  getDecisionHistory(pipelineId?: string, limit = 50): AIPipelineDecision[] {
    let history = this.decisionHistory;
    if (pipelineId) {
      history = history.filter(d => d.pipelineId === pipelineId);
    }
    return history.slice(-limit);
  }

  /**
   * 統計
   */
  getStats(): {
    totalDecisions: number;
    executeCount: number;
    skipCount: number;
    pauseCount: number;
    abortCount: number;
    avgConfidence: number;
    approvalRequired: number;
  } {
    const total = this.decisionHistory.length;
    if (total === 0) {
      return {
        totalDecisions: 0,
        executeCount: 0,
        skipCount: 0,
        pauseCount: 0,
        abortCount: 0,
        avgConfidence: 0,
        approvalRequired: 0,
      };
    }

    const counts = { execute: 0, skip: 0, pause: 0, abort: 0, modify: 0 };
    let totalConfidence = 0;
    let approvalCount = 0;

    for (const d of this.decisionHistory) {
      counts[d.action] = (counts[d.action] || 0) + 1;
      totalConfidence += d.decision.confidence;
      if (d.decision.requiresApproval) approvalCount++;
    }

    return {
      totalDecisions: total,
      executeCount: counts.execute,
      skipCount: counts.skip,
      pauseCount: counts.pause,
      abortCount: counts.abort,
      avgConfidence: totalConfidence / total,
      approvalRequired: approvalCount,
    };
  }

  // ── Private Methods ──

  private ruleBasedExecution(
    definition: PipelineDefinition,
    riskAssessment: PipelineRiskAssessment,
  ): AIPipelineDecision {
    // ルールベース: critical/high → pause (承認待ち), medium/low → execute
    const action: AIPipelineDecision['action'] =
      riskAssessment.overallRisk === 'critical' || riskAssessment.overallRisk === 'high'
        ? 'pause'
        : 'execute';

    const decision: AIPipelineDecision = {
      pipelineId: definition.id,
      decision: {
        action,
        reasoning: action === 'pause'
          ? `高リスクパイプライン（${riskAssessment.overallRisk}）のため承認が必要です。${riskAssessment.recommendation}`
          : `低～中リスクパイプラインのため自動実行します。${riskAssessment.recommendation}`,
        confidence: action === 'pause' ? 0.4 : 0.7,
        riskLevel: riskAssessment.overallRisk,
        requiresApproval: action === 'pause',
      },
      action,
      timestamp: Date.now(),
    };

    this.recordDecision(decision);
    return decision;
  }

  private ruleBasedStep(
    definition: PipelineDefinition,
    step: PipelineStep,
    stepRisk: string,
  ): AIPipelineDecision {
    const needsApproval = stepRisk === 'critical' || stepRisk === 'high';
    const action: AIPipelineDecision['action'] = needsApproval ? 'pause' : 'execute';

    const decision: AIPipelineDecision = {
      pipelineId: definition.id,
      stepId: step.id,
      decision: {
        action,
        reasoning: needsApproval
          ? `ステップ「${step.id}」(${step.action})は${stepRisk}リスクのため承認が必要です。`
          : `ステップ「${step.id}」(${step.action})は自動実行可能です。`,
        confidence: needsApproval ? 0.3 : 0.7,
        riskLevel: stepRisk as 'low' | 'medium' | 'high' | 'critical',
        requiresApproval: needsApproval,
      },
      action,
      timestamp: Date.now(),
    };

    this.recordDecision(decision);
    return decision;
  }

  private getCategoryFromPipeline(definition: PipelineDefinition): ApprovalRequest['category'] {
    const id = definition.id.toLowerCase();
    if (id.includes('price') || id.includes('discount') || id.includes('revenue')) return 'pricing';
    if (id.includes('content') || id.includes('seo') || id.includes('image')) return 'content';
    if (id.includes('inventory') || id.includes('product') || id.includes('stock')) return 'operations';
    if (id.includes('deploy') || id.includes('config') || id.includes('setting')) return 'deployment';
    return 'operations';
  }

  private getRiskReason(step: PipelineStep, riskLevel: string): string {
    switch (riskLevel) {
      case 'critical': return `アクション「${step.action}」は取り消し不可能な操作です。`;
      case 'high': return `アクション「${step.action}」は顧客・売上に直接影響します。`;
      case 'medium': return `アクション「${step.action}」はコンテンツ・設定に影響します。`;
      default: return `アクション「${step.action}」は読み取り専用です。`;
    }
  }

  private recordDecision(decision: AIPipelineDecision): void {
    this.decisionHistory.push(decision);
    if (this.decisionHistory.length > this.maxHistorySize) {
      this.decisionHistory = this.decisionHistory.slice(-this.maxHistorySize);
    }
  }
}

// ── シングルトン ──

let bridgeInstance: AIPipelineBridge | null = null;

export function getAIPipelineBridge(): AIPipelineBridge {
  if (!bridgeInstance) {
    bridgeInstance = new AIPipelineBridge();
  }
  return bridgeInstance;
}

export function resetAIPipelineBridge(): void {
  bridgeInstance = null;
}
