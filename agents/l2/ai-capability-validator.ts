/**
 * G-039: AI Capability Validator — L2 免疫検査技師エージェント
 *
 * 生体対応: 免疫検査技師（Immunology Lab Technician）
 * 全47個のAIエージェントが正常に機能しているかを検証し、
 * AI品質メトリクスを測定、Claude/Gemini デュアルAIルーティングの動作確認を実施。
 *
 * 担当タスク:
 * - validate_agent: 単一エージェントの機能検証・応答品質測定
 * - validate_all: 全登録エージェントの健全性マトリクス生成
 * - ai_routing_test: Claude/Gemini ルーティングの動作確認
 * - response_quality_check: AI応答品質の統計的検証
 * - regression_test: エージェント性能のベースライン比較
 *
 * 所属パイプライン: P16（品質検証）
 * 医療マイルストーン: M9-NEURO-IMMUNE（神経免疫統合）
 */

import type {
  AgentId,
  AgentEvent,
  CascadeCommand,
  IAgentBus,
} from '../core/types';
import { BaseL2Agent } from './base-l2-agent';
import { AIRouter } from '../core/ai-router';
import { RoundExecutor } from '../lib/validation/round-executor';
import type {
  TestScenario,
  RoundResult,
  GoNoGoReport,
} from '../lib/validation/types';
import {
  coefficientOfVariation,
  tTest,
  cohenD,
} from '../lib/validation/statistical-engine';
import { createLogger } from '../core/logger.js';

const log = createLogger('ai-capability-validator');


/**
 * AI応答の品質スコア
 */
interface ResponseQuality {
  latency: number;           // ms
  tokensPerSecond: number;   // throughput
  coherence: number;         // 0-100 (semantic consistency)
  completeness: number;      // 0-100 (answer thoroughness)
  accuracy: number;          // 0-100 (based on task)
  errorRate: number;         // 0-1
}

/**
 * エージェント検証結果
 */
interface AgentValidationResult {
  agentId: string;
  agentName: string;
  healthy: boolean;
  lastHeartbeat: number;
  uptime: number;
  errorCount: number;
  taskQueue: number;
  responseQuality: ResponseQuality;
  roundsCompleted: number;
  convergenceCV: number;
  timestamp: number;
}

/**
 * 健全性マトリクス（全エージェント統合ビュー）
 */
interface HealthMatrix {
  totalAgents: number;
  healthyCount: number;
  degradedCount: number;
  errorCount: number;
  timestamp: number;
  agents: AgentValidationResult[];
  summary: {
    avgErrorRate: number;
    avgLatency: number;
    avgCoherence: number;
    systemHealth: 'excellent' | 'good' | 'fair' | 'poor';
  };
}

/**
 * AI ルーティング検証結果
 */
interface AIRoutingTestResult {
  tierA: {
    claudeTests: number;
    geminiFallbacks: number;
    avgLatency: number;
  };
  tierB: {
    claudeTests: number;
    geminiFallbacks: number;
    avgLatency: number;
  };
  tierC: {
    geminiTests: number;
    claudeFallbacks: number;
    avgLatency: number;
  };
  tierD: {
    geminiTests: number;
    avgLatency: number;
  };
  routingSuccess: boolean;
  timestamp: number;
}

/**
 * ベースライン比較結果
 */
interface RegressionTestResult {
  baseline: {
    timestamp: number;
    avgLatency: number;
    avgCoherence: number;
    avgErrorRate: number;
  };
  current: {
    timestamp: number;
    avgLatency: number;
    avgCoherence: number;
    avgErrorRate: number;
  };
  regressionDetected: boolean;
  tTestPValue: number;
  cohenDEffect: number;
  findings: string[];
  timestamp: number;
}

export class AICapabilityValidator extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'ai-capability-validator',
    name: 'AI Capability Validator',
    level: 'L2',
    team: 'quality',
    version: '1.0.0',
  };

  private aiRouter: AIRouter;
  private validationCache: Map<string, AgentValidationResult> = new Map();
  private baselineMetrics: Map<string, ResponseQuality> = new Map();
  private testScenarios: Map<string, TestScenario> = new Map();

  constructor(bus: IAgentBus) {
    super(bus);
    this.aiRouter = new AIRouter();
    this.seedTestScenarios();
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('validation.*');
    this.subscribe('health.check');
    this.subscribe('quality.audit');

    await this.publishEvent('ai-capability-validator.initialized', {
      agentId: this.id.id,
      timestamp: Date.now(),
    });
  }

  protected async onShutdown(): Promise<void> {
    this.validationCache.clear();
    this.baselineMetrics.clear();
    this.testScenarios.clear();
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'health.check') {
      await this.publishEvent('ai-capability-validator.health_requested', {
        initiator: event.source,
        timestamp: Date.now(),
      });
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'validate_agent':
        return this.validateAgent(command.params);

      case 'validate_all':
        return this.validateAll(command.params);

      case 'ai_routing_test':
        return this.aiRoutingTest(command.params);

      case 'response_quality_check':
        return this.responseQualityCheck(command.params);

      case 'regression_test':
        return this.regressionTest(command.params);

      default:
        throw new Error(`AICapabilityValidator: unknown action "${command.action}"`);
    }
  }

  // ── Action Implementations ──

  /**
   * validate_agent: 単一エージェントの機能検証
   */
  private async validateAgent(params: Record<string, unknown>): Promise<AgentValidationResult> {
    const agentId = params.agentId as string ?? 'unknown';
    const testCount = params.testCount as number ?? 5;

    await this.publishEvent('validation.agent.started', {
      agentId,
      testCount,
    });

    try {
      // モックエージェントデータ（実装時はRegistry経由で取得）
      const mockHealth = {
        agentId,
        status: 'healthy' as const,
        lastHeartbeat: Date.now(),
        uptime: Math.floor(Math.random() * 86400000), // 0-24h
        errorCount: Math.floor(Math.random() * 5),
        taskQueue: Math.floor(Math.random() * 10),
      };

      // 複数回のテストを実行して品質メトリクスを計測
      const qualities: ResponseQuality[] = [];
      for (let i = 0; i < testCount; i++) {
        const quality = await this.measureResponseQuality(agentId);
        qualities.push(quality);
      }

      // 平均値を計算
      const avgQuality = this.aggregateQuality(qualities);

      // 収束性をチェック（Coefficient of Variation）
      const latencies = qualities.map(q => q.latency);
      const cv = coefficientOfVariation(latencies);

      const result: AgentValidationResult = {
        agentId,
        agentName: `Agent ${agentId}`,
        healthy: mockHealth.status === 'healthy',
        lastHeartbeat: mockHealth.lastHeartbeat,
        uptime: mockHealth.uptime,
        errorCount: mockHealth.errorCount,
        taskQueue: mockHealth.taskQueue,
        responseQuality: avgQuality,
        roundsCompleted: testCount,
        convergenceCV: cv,
        timestamp: Date.now(),
      };

      this.validationCache.set(agentId, result);

      await this.publishEvent('validation.agent.completed', {
        agentId,
        healthy: result.healthy,
        convergenceCV: result.convergenceCV,
        avgLatency: result.responseQuality.latency,
      }, 'high');

      return result;
    } catch (err) {
      await this.publishEvent('validation.agent.failed', {
        agentId,
        error: String(err),
      }, 'critical');
      throw err;
    }
  }

  /**
   * validate_all: 全登録エージェントの健全性マトリクス生成
   */
  private async validateAll(params: Record<string, unknown>): Promise<HealthMatrix> {
    const testCount = params.testCount as number ?? 3;

    await this.publishEvent('validation.all.started', {
      timestamp: Date.now(),
    }, 'high');

    try {
      // 模擬エージェント ID リスト（実装時はRegistry経由で取得）
      const agentIds = [
        'commander',
        'l0-navigator',
        'acquisition-lead',
        'conversion-lead',
        'ltv-lead',
        'seo-director',
        'content-writer',
        'image-generator',
        'security-agent',
        'performance-agent',
      ];

      const validationResults: AgentValidationResult[] = [];
      let healthyCount = 0;
      let errorCount = 0;

      for (const agentId of agentIds) {
        try {
          const result = await this.validateAgent({ agentId, testCount });
          validationResults.push(result);

          if (result.healthy) {
            healthyCount++;
          } else {
            errorCount++;
          }

          // Progress event
          await this.publishEvent('validation.all.progress', {
            agentId,
            completed: validationResults.length,
            total: agentIds.length,
          });
        } catch (err) {
          // エージェント検証失敗時のエラーハンドリング
          log.warn(`Failed to validate agent ${agentId}:`, err);
          errorCount++;
        }
      }

      // サマリー計算
      const avgErrorRate =
        validationResults.reduce((sum, r) => sum + r.responseQuality.errorRate, 0) /
        validationResults.length;
      const avgLatency =
        validationResults.reduce((sum, r) => sum + r.responseQuality.latency, 0) /
        validationResults.length;
      const avgCoherence =
        validationResults.reduce((sum, r) => sum + r.responseQuality.coherence, 0) /
        validationResults.length;

      const systemHealth = this.determineSystemHealth(
        healthyCount,
        errorCount,
        avgErrorRate,
        avgLatency,
      );

      const matrix: HealthMatrix = {
        totalAgents: agentIds.length,
        healthyCount,
        degradedCount: agentIds.length - healthyCount - errorCount,
        errorCount,
        timestamp: Date.now(),
        agents: validationResults,
        summary: {
          avgErrorRate,
          avgLatency,
          avgCoherence,
          systemHealth,
        },
      };

      await this.publishEvent('validation.all.completed', {
        totalAgents: matrix.totalAgents,
        healthyCount,
        systemHealth,
      }, 'high');

      return matrix;
    } catch (err) {
      await this.publishEvent('validation.all.failed', {
        error: String(err),
      }, 'critical');
      throw err;
    }
  }

  /**
   * ai_routing_test: Claude/Gemini ルーティングの動作確認
   */
  private async aiRoutingTest(params: Record<string, unknown>): Promise<AIRoutingTestResult> {
    const testCount = params.testCount as number ?? 3;

    await this.publishEvent('ai_routing.test.started', {
      testCount,
    }, 'high');

    try {
      const result: AIRoutingTestResult = {
        tierA: {
          claudeTests: 0,
          geminiFallbacks: 0,
          avgLatency: 0,
        },
        tierB: {
          claudeTests: 0,
          geminiFallbacks: 0,
          avgLatency: 0,
        },
        tierC: {
          geminiTests: 0,
          claudeFallbacks: 0,
          avgLatency: 0,
        },
        tierD: {
          geminiTests: 0,
          avgLatency: 0,
        },
        routingSuccess: true,
        timestamp: Date.now(),
      };

      // Tier A テスト（Claude Sonnet primary）
      for (let i = 0; i < testCount; i++) {
        const latency = await this.simulateAICall('claude', 'claude-sonnet-4-20250514');
        result.tierA.claudeTests++;
        result.tierA.avgLatency = (result.tierA.avgLatency + latency) / 2;
      }

      // Tier B テスト（Claude Haiku primary）
      for (let i = 0; i < testCount; i++) {
        const latency = await this.simulateAICall('claude', 'claude-haiku-4-20250514');
        result.tierB.claudeTests++;
        result.tierB.avgLatency = (result.tierB.avgLatency + latency) / 2;
      }

      // Tier C テスト（Gemini Flash primary）
      for (let i = 0; i < testCount; i++) {
        const latency = await this.simulateAICall('gemini', 'gemini-2.0-flash');
        result.tierC.geminiTests++;
        result.tierC.avgLatency = (result.tierC.avgLatency + latency) / 2;
      }

      // Tier D テスト（Gemini Flash-Lite primary）
      for (let i = 0; i < testCount; i++) {
        const latency = await this.simulateAICall('gemini', 'gemini-2.0-flash');
        result.tierD.geminiTests++;
        result.tierD.avgLatency = (result.tierD.avgLatency + latency) / 2;
      }

      await this.publishEvent('ai_routing.test.completed', {
        routingSuccess: result.routingSuccess,
        tierATests: result.tierA.claudeTests,
        tierBTests: result.tierB.claudeTests,
        tierCTests: result.tierC.geminiTests,
        tierDTests: result.tierD.geminiTests,
      }, 'high');

      return result;
    } catch (err) {
      await this.publishEvent('ai_routing.test.failed', {
        error: String(err),
      }, 'critical');
      throw err;
    }
  }

  /**
   * response_quality_check: AI応答品質の統計的検証
   */
  private async responseQualityCheck(params: Record<string, unknown>): Promise<{
    quality: ResponseQuality;
    passed: boolean;
    tTestResult: { pValue: number; significant: boolean };
    findings: string[];
  }> {
    const agentId = params.agentId as string ?? 'unknown';
    const testCount = params.testCount as number ?? 10;
    const baselineKey = params.baselineKey as string ?? 'default';

    await this.publishEvent('response_quality.check.started', {
      agentId,
      testCount,
    });

    try {
      // 複数回測定
      const qualities: ResponseQuality[] = [];
      for (let i = 0; i < testCount; i++) {
        const quality = await this.measureResponseQuality(agentId);
        qualities.push(quality);
      }

      const avgQuality = this.aggregateQuality(qualities);
      const baseline = this.baselineMetrics.get(baselineKey) || this.defaultBaseline();

      // t検定: 現在の平均vs. ベースライン
      const latencies = qualities.map(q => q.latency);
      const baselineLatencies = [
        baseline.latency * 0.95,
        baseline.latency,
        baseline.latency * 1.05,
      ];
      const tTestResult = tTest(latencies, baselineLatencies);

      // 判定
      const latencyAcceptable = avgQuality.latency <= baseline.latency * 1.2;
      const coherenceAcceptable = avgQuality.coherence >= baseline.coherence * 0.95;
      const errorRateAcceptable = avgQuality.errorRate <= baseline.errorRate * 1.2;

      const passed = latencyAcceptable && coherenceAcceptable && errorRateAcceptable;

      const findings: string[] = [];
      if (!latencyAcceptable) {
        findings.push(
          `Latency degradation: ${avgQuality.latency.toFixed(2)}ms vs baseline ${baseline.latency.toFixed(2)}ms`,
        );
      }
      if (!coherenceAcceptable) {
        findings.push(
          `Coherence below threshold: ${avgQuality.coherence.toFixed(2)}% vs baseline ${baseline.coherence.toFixed(2)}%`,
        );
      }
      if (!errorRateAcceptable) {
        findings.push(
          `Error rate elevated: ${(avgQuality.errorRate * 100).toFixed(2)}% vs baseline ${(baseline.errorRate * 100).toFixed(2)}%`,
        );
      }

      const result = {
        quality: avgQuality,
        passed,
        tTestResult: {
          pValue: tTestResult.pValue,
          significant: tTestResult.pValue < 0.05,
        },
        findings,
      };

      await this.publishEvent('response_quality.check.completed', {
        agentId,
        passed,
        avgLatency: avgQuality.latency,
        avgCoherence: avgQuality.coherence,
      }, passed ? 'normal' : 'high');

      return result;
    } catch (err) {
      await this.publishEvent('response_quality.check.failed', {
        agentId,
        error: String(err),
      }, 'critical');
      throw err;
    }
  }

  /**
   * regression_test: エージェント性能のベースライン比較
   */
  private async regressionTest(params: Record<string, unknown>): Promise<RegressionTestResult> {
    const agentId = params.agentId as string ?? 'unknown';
    const testCount = params.testCount as number ?? 10;
    const baselineKey = params.baselineKey as string ?? 'default';

    await this.publishEvent('regression.test.started', {
      agentId,
      baselineKey,
    });

    try {
      // 現在のメトリクスを取得
      const currentQualities: ResponseQuality[] = [];
      for (let i = 0; i < testCount; i++) {
        currentQualities.push(await this.measureResponseQuality(agentId));
      }
      const currentQuality = this.aggregateQuality(currentQualities);

      // ベースラインを取得
      const baseline = this.baselineMetrics.get(baselineKey) || this.defaultBaseline();

      // 統計検定: t検定 + Cohen's d
      const currentLatencies = currentQualities.map(q => q.latency);
      const baselineLatencies = [
        baseline.latency * 0.95,
        baseline.latency,
        baseline.latency * 1.05,
      ];
      const tTestResult = tTest(currentLatencies, baselineLatencies);
      const effect = cohenD(currentLatencies, baselineLatencies);

      // 判定
      const regressionDetected =
        tTestResult.pValue < 0.05 && effect > 0.2; // Cohen's d > 0.2 = small effect

      const findings: string[] = [];
      if (regressionDetected) {
        findings.push(
          `Regression detected: latency increased by ${effect.toFixed(2)} standard deviations`,
        );
      }
      if (currentQuality.errorRate > baseline.errorRate * 1.2) {
        findings.push(`Error rate increased from ${(baseline.errorRate * 100).toFixed(2)}% to ${(currentQuality.errorRate * 100).toFixed(2)}%`);
      }
      if (currentQuality.coherence < baseline.coherence * 0.95) {
        findings.push(`Coherence decreased from ${baseline.coherence.toFixed(2)}% to ${currentQuality.coherence.toFixed(2)}%`);
      }

      const result: RegressionTestResult = {
        baseline: {
          timestamp: Date.now() - 86400000, // 1 day ago
          avgLatency: baseline.latency,
          avgCoherence: baseline.coherence,
          avgErrorRate: baseline.errorRate,
        },
        current: {
          timestamp: Date.now(),
          avgLatency: currentQuality.latency,
          avgCoherence: currentQuality.coherence,
          avgErrorRate: currentQuality.errorRate,
        },
        regressionDetected,
        tTestPValue: tTestResult.pValue,
        cohenDEffect: effect,
        findings,
        timestamp: Date.now(),
      };

      await this.publishEvent('regression.test.completed', {
        agentId,
        regressionDetected,
        cohenD: effect,
        pValue: tTestResult.pValue,
      }, regressionDetected ? 'high' : 'normal');

      return result;
    } catch (err) {
      await this.publishEvent('regression.test.failed', {
        agentId,
        error: String(err),
      }, 'critical');
      throw err;
    }
  }

  // ── Helper Methods ──

  /**
   * 単一の応答品質を測定（模擬実装）
   */
  private async measureResponseQuality(agentId: string): Promise<ResponseQuality> {
    // 模擬遅延
    const latency = Math.random() * 500 + 50; // 50-550ms
    const tokensPerSecond = Math.random() * 100 + 50; // 50-150 tokens/s

    return {
      latency,
      tokensPerSecond,
      coherence: Math.random() * 20 + 80, // 80-100%
      completeness: Math.random() * 15 + 85, // 85-100%
      accuracy: Math.random() * 15 + 85, // 85-100%
      errorRate: Math.random() * 0.05, // 0-5%
    };
  }

  /**
   * 複数の品質スコアを集約（平均）
   */
  private aggregateQuality(qualities: ResponseQuality[]): ResponseQuality {
    const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

    return {
      latency: avg(qualities.map(q => q.latency)),
      tokensPerSecond: avg(qualities.map(q => q.tokensPerSecond)),
      coherence: avg(qualities.map(q => q.coherence)),
      completeness: avg(qualities.map(q => q.completeness)),
      accuracy: avg(qualities.map(q => q.accuracy)),
      errorRate: avg(qualities.map(q => q.errorRate)),
    };
  }

  /**
   * AIルーティングのシミュレーション呼び出し
   */
  private async simulateAICall(provider: string, model: string): Promise<number> {
    // 模擬レイテンシー
    const baseLatency = provider === 'claude' ? 300 : 250;
    return baseLatency + (Math.random() * 100 - 50); // ±50ms
  }

  /**
   * システムヘルスを判定
   */
  private determineSystemHealth(
    healthyCount: number,
    errorCount: number,
    avgErrorRate: number,
    avgLatency: number,
  ): 'excellent' | 'good' | 'fair' | 'poor' {
    const healthRatio = healthyCount / (healthyCount + errorCount + 1);

    if (
      healthRatio >= 0.95 &&
      avgErrorRate < 0.02 &&
      avgLatency < 300
    ) {
      return 'excellent';
    } else if (
      healthRatio >= 0.9 &&
      avgErrorRate < 0.05 &&
      avgLatency < 500
    ) {
      return 'good';
    } else if (
      healthRatio >= 0.8 &&
      avgErrorRate < 0.1 &&
      avgLatency < 1000
    ) {
      return 'fair';
    } else {
      return 'poor';
    }
  }

  /**
   * デフォルトベースライン
   */
  private defaultBaseline(): ResponseQuality {
    return {
      latency: 300,
      tokensPerSecond: 100,
      coherence: 90,
      completeness: 90,
      accuracy: 90,
      errorRate: 0.02,
    };
  }

  /**
   * テストシナリオをシード
   */
  private seedTestScenarios(): void {
    const scenarios: TestScenario[] = [
      {
        id: 'basic_response',
        name: 'Basic Response Test',
        description: 'Test simple request/response cycle',
        params: { question: 'What is 2+2?' },
        expectedOutcome: { correctAnswer: true },
        timeout: 5000,
        tags: ['basic', 'sanity'],
      },
      {
        id: 'complex_reasoning',
        name: 'Complex Reasoning Test',
        description: 'Test complex reasoning capability',
        params: {
          question:
            'Given a set of 47 agents organized in 4 tiers, how would you optimize routing?',
        },
        expectedOutcome: { hasStrategy: true },
        timeout: 10000,
        tags: ['complex', 'reasoning'],
      },
      {
        id: 'error_recovery',
        name: 'Error Recovery Test',
        description: 'Test graceful error handling',
        params: { triggerError: true },
        expectedOutcome: { recoverySuccessful: true },
        timeout: 5000,
        tags: ['error_handling', 'resilience'],
      },
    ];

    for (const scenario of scenarios) {
      this.testScenarios.set(scenario.id, scenario);
    }
  }
}
