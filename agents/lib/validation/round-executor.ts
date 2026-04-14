/**
 * Round Executor — Phase 7, G-036
 *
 * Executes test rounds with convergence checking
 * Round 1: N=10, same conditions, check CV <= 15%
 * Round 2: N=20, vary parameters, sensitivity analysis
 */

import type {
  TestScenario,
  RoundResult,
  GoNoGoReport,
  TestPhase,
  TestContext,
} from './types';
import {
  coefficientOfVariation,
  descriptiveStats,
  tTest,
  cohenD,
} from './statistical-engine';
import { createLogger } from '../../core/logger.js';

const log = createLogger('round-executor');


export interface RoundExecutorConfig {
  scenario: TestScenario;
  phases: TestPhase[];
  onProgress?: (phase: string, progress: number) => void;
}

export class RoundExecutor {
  private config: RoundExecutorConfig;
  private results: RoundResult[] = [];
  private allMetrics: Map<string, number[]> = new Map();

  constructor(config: RoundExecutorConfig) {
    this.config = config;
  }

  /**
   * Execute all rounds
   */
  async executeAllRounds(): Promise<{
    results: RoundResult[];
    report: GoNoGoReport;
  }> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    for (let roundNum = 0; roundNum < this.config.phases.length; roundNum++) {
      const phase = this.config.phases[roundNum];

      const context: TestContext = {
        executionId,
        scenario: this.config.scenario,
        roundNum: roundNum + 1,
        totalRounds: this.config.phases.length,
        collectedMetrics: new Map(),
        startedAt: Date.now(),
      };

      const result = await this.executeRound(context, phase);
      this.results.push(result);

      if (this.config.onProgress) {
        this.config.onProgress(
          `Round ${roundNum + 1}/${this.config.phases.length}`,
          ((roundNum + 1) / this.config.phases.length) * 100,
        );
      }

      // Early exit if convergence not achieved and phase requires it
      if (!result.passed && roundNum === 0) {
        log.warn('[RoundExecutor] Round 1 did not converge — continuing anyway');
      }
    }

    const report = this.generateGoNoGoReport();
    return { results: this.results, report };
  }

  /**
   * Execute a single round
   */
  private async executeRound(context: TestContext, phase: TestPhase): Promise<RoundResult> {
    const metrics = new Map<string, number>();
    const metricSamples: Map<string, number[]> = new Map();

    log.info(
      `[RoundExecutor] Starting Round ${context.roundNum} — ${phase.trials} trials`,
    );

    for (let trial = 0; trial < phase.trials; trial++) {
      // Generate parameters based on variation strategy
      const params = this.varyParameters(
        this.config.scenario.params,
        phase.variationStrategy,
        trial,
        phase.trials,
      );

      // Execute scenario
      const trialMetrics = await this.executeTrial(params, this.config.scenario.timeout);

      // Collect metrics
      for (const [key, value] of Object.entries(trialMetrics)) {
        if (!metricSamples.has(key)) {
          metricSamples.set(key, []);
        }
        metricSamples.get(key)!.push(value as number);
      }
    }

    // Aggregate metrics and calculate convergence
    const convergenceCV = this.checkConvergence(metricSamples, phase.convergenceThreshold);

    for (const [key, samples] of metricSamples) {
      const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
      metrics.set(key, mean);

      // Track all samples for later analysis
      if (!this.allMetrics.has(key)) {
        this.allMetrics.set(key, []);
      }
      this.allMetrics.get(key)!.push(...samples);
    }

    const passed = convergenceCV <= phase.convergenceThreshold;

    return {
      roundNum: context.roundNum,
      trials: phase.trials,
      metrics,
      convergenceCV,
      passed,
      timestamp: Date.now(),
    };
  }

  /**
   * Execute a single trial (scenario invocation)
   */
  private async executeTrial(
    params: Record<string, unknown>,
    timeout: number,
  ): Promise<Record<string, number>> {
    // Simulate scenario execution
    // In real implementation, would call agent/scenario function
    return new Promise((resolve) => {
      const startTime = Date.now();

      // Simulate work
      const duration = Math.random() * 100 + 10; // 10-110ms
      setTimeout(() => {
        const elapsed = Date.now() - startTime;

        // Mock metrics
        const metrics: Record<string, number> = {
          latency: elapsed,
          throughput: 1000 / elapsed,
          errorRate: Math.random() < 0.95 ? 0 : 1, // 95% success rate
          memoryUsage: Math.random() * 50, // 0-50MB
        };

        // Add some noise based on params
        const scale = (params.scale as number) || 1;
        metrics.latency *= scale;

        resolve(metrics);
      }, duration);
    });
  }

  /**
   * Generate parameter variations
   */
  private varyParameters(
    baseParams: Record<string, unknown>,
    strategy: string,
    trialNum: number,
    totalTrials: number,
  ): Record<string, unknown> {
    const params = { ...baseParams };

    if (strategy === 'none') {
      return params;
    }

    const progression = trialNum / totalTrials; // 0 to 1

    if (strategy === 'linear') {
      params.scale = 1 + progression * 0.5; // Scale from 1.0 to 1.5
    } else if (strategy === 'exponential') {
      params.scale = Math.pow(1.5, progression); // 1.0 to 1.5 exponential
    } else if (strategy === 'random') {
      params.scale = 0.8 + Math.random() * 0.4; // Random 0.8-1.2
    }

    return params;
  }

  /**
   * Check convergence across all metrics
   * Returns max CV across all metrics
   */
  private checkConvergence(
    samples: Map<string, number[]>,
    threshold: number,
  ): number {
    let maxCV = 0;

    for (const [key, values] of samples) {
      const cv = coefficientOfVariation(values);
      maxCV = Math.max(maxCV, cv);

      if (values.length > 1) {
        const stats = descriptiveStats(values);
        log.info(
          `[RoundExecutor] Metric "${key}": mean=${stats.mean.toFixed(2)}, CV=${cv.toFixed(1)}%`,
        );
      }
    }

    return maxCV;
  }

  /**
   * Generate Go/No-Go report
   */
  private generateGoNoGoReport(): GoNoGoReport {
    const converged = this.results.every((r) => r.passed);
    const metricsHealthy = this.checkMetricsHealth();
    const noNewVulnerabilities = true; // Placeholder
    const testCoverageAdequate = this.results.length >= 2;

    let decision: 'go' | 'no-go' | 'conditional' = 'no-go';
    let confidence = 0;

    if (converged && metricsHealthy && testCoverageAdequate) {
      decision = 'go';
      confidence = 0.95;
    } else if (
      this.results.length > 0 &&
      this.results[0].passed &&
      metricsHealthy
    ) {
      decision = 'conditional';
      confidence = 0.7;
    } else {
      decision = 'no-go';
      confidence = 0.3;
    }

    const findings: string[] = [];
    const recommendations: string[] = [];

    for (let i = 0; i < this.results.length; i++) {
      const result = this.results[i];
      const status = result.passed ? 'PASSED' : 'FAILED';
      findings.push(
        `Round ${result.roundNum}: ${status} — CV=${result.convergenceCV.toFixed(1)}% (threshold=${this.config.phases[i]?.convergenceThreshold}%)`,
      );

      if (!result.passed) {
        recommendations.push(
          `Round ${result.roundNum}: Increase trial count or reduce parameter variation`,
        );
      }
    }

    // Metric health checks
    if (!metricsHealthy) {
      recommendations.push('Investigate outliers in latency or error rate metrics');
    }

    const risks: Array<{
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
      mitigation: string;
    }> = [];

    if (!converged) {
      risks.push({
        severity: 'high',
        description: 'Metrics did not converge — may indicate instability',
        mitigation: 'Increase trial count per round or stabilize test environment',
      });
    }

    return {
      decision,
      confidence,
      evidence: {
        converged,
        metricsHealthy,
        noNewVulnerabilities,
        testCoverageAdequate,
      },
      risks,
      recommendations,
      findings,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if metrics are within healthy ranges
   */
  private checkMetricsHealth(): boolean {
    const latencies = this.allMetrics.get('latency') || [];
    const errorRates = this.allMetrics.get('errorRate') || [];

    if (latencies.length === 0) {
      return true;
    }

    const stats = descriptiveStats(latencies);

    // Check for outliers (IQR method)
    const iqr = stats.q3 - stats.q1;
    const outliers = latencies.filter(
      (v) => v < stats.q1 - 1.5 * iqr || v > stats.q3 + 1.5 * iqr,
    );

    // Allow up to 10% outliers
    const outlierRate = outliers.length / latencies.length;

    // Check error rate
    const avgErrorRate = errorRates.length > 0
      ? errorRates.reduce((s, v) => s + v, 0) / errorRates.length
      : 0;

    const healthy = outlierRate <= 0.1 && avgErrorRate < 0.05;

    return healthy;
  }

  /**
   * Get all results
   */
  getResults(): RoundResult[] {
    return this.results;
  }

  /**
   * Get detailed metrics summary
   */
  getMetricsSummary(): Record<string, { mean: number; cv: number; min: number; max: number }> {
    const summary: Record<string, any> = {};

    for (const [key, values] of this.allMetrics) {
      const stats = descriptiveStats(values);
      const cv = coefficientOfVariation(values);

      summary[key] = {
        mean: parseFloat(stats.mean.toFixed(2)),
        cv: parseFloat(cv.toFixed(2)),
        min: parseFloat(stats.min.toFixed(2)),
        max: parseFloat(stats.max.toFixed(2)),
        count: values.length,
      };
    }

    return summary;
  }
}
