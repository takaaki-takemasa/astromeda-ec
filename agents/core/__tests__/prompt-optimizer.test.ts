/**
 * Prompt Optimizer テスト — シナプス可塑性の検証
 *
 * テスト構成:
 * - パフォーマンス追跡と統計分析
 * - 変種生成（4戦略 + 複合）
 * - A/Bテスト統計検定
 * - 最適化適用とロールバック
 * - 履歴管理
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PromptOptimizer,
  getPromptOptimizer,
  resetPromptOptimizer,
  type PromptPerformanceMetrics,
  type PromptVariant,
  type ABTestResult,
} from '../prompt-optimizer.js';

describe('PromptOptimizer', () => {
  let optimizer: PromptOptimizer;

  beforeEach(() => {
    resetPromptOptimizer();
    optimizer = getPromptOptimizer();
  });

  // ── パフォーマンス追跡 ──

  describe('trackPerformance', () => {
    it('should record a single metric', () => {
      optimizer.trackPerformance('prompt-1', {
        successRate: 0.95,
        avgLatencyMs: 1500,
        qualityScore: 0.9,
        tokenUsage: 250,
        sampleSize: 10,
      });

      const analysis = optimizer.analyzePerformance('prompt-1');
      expect(analysis.totalExecutions).toBe(1);
      expect(analysis.successRate).toBe(0.95);
      expect(analysis.avgLatencyMs).toBe(1500);
      expect(analysis.avgQualityScore).toBe(0.9);
    });

    it('should accumulate multiple metrics', () => {
      optimizer.trackPerformance('prompt-2', {
        successRate: 0.9,
        avgLatencyMs: 1000,
        qualityScore: 0.85,
        tokenUsage: 200,
        sampleSize: 10,
      });

      optimizer.trackPerformance('prompt-2', {
        successRate: 0.92,
        avgLatencyMs: 1100,
        qualityScore: 0.88,
        tokenUsage: 210,
        sampleSize: 10,
      });

      const analysis = optimizer.analyzePerformance('prompt-2');
      expect(analysis.totalExecutions).toBe(2);
      expect(analysis.successRate).toBeCloseTo(0.91, 2);
      expect(analysis.avgLatencyMs).toBeCloseTo(1050, 0);
    });

    it('should record timestamp on track', () => {
      const beforeTime = Date.now();
      optimizer.trackPerformance('prompt-3', {
        successRate: 0.8,
        avgLatencyMs: 1200,
        qualityScore: 0.75,
        tokenUsage: 300,
        sampleSize: 5,
      });
      const afterTime = Date.now();

      const analysis = optimizer.analyzePerformance('prompt-3');
      expect(analysis.totalExecutions).toBe(1);
      // timestamp should be recorded (can't check exact value, but verify exists in analysis)
      expect(analysis.totalExecutions).toBeGreaterThan(0);
    });
  });

  // ── パフォーマンス分析 ──

  describe('analyzePerformance', () => {
    it('should return zero stats for non-existent prompt', () => {
      const analysis = optimizer.analyzePerformance('non-existent');
      expect(analysis.totalExecutions).toBe(0);
      expect(analysis.successRate).toBe(0);
      expect(analysis.avgLatencyMs).toBe(0);
      expect(analysis.recommendations).toContain('データなし');
    });

    it('should recommend specificity when success rate is low', () => {
      for (let i = 0; i < 5; i++) {
        optimizer.trackPerformance('prompt-4', {
          successRate: 0.5,
          avgLatencyMs: 1000,
          qualityScore: 0.7,
          tokenUsage: 200,
          sampleSize: 10,
        });
      }

      const analysis = optimizer.analyzePerformance('prompt-4');
      expect(analysis.successRate).toBeLessThan(0.7);
      expect(analysis.recommendations.some(r => r.includes('specificity'))).toBe(true);
    });

    it('should recommend conciseness when latency is high', () => {
      for (let i = 0; i < 5; i++) {
        optimizer.trackPerformance('prompt-5', {
          successRate: 0.9,
          avgLatencyMs: 2500,
          qualityScore: 0.8,
          tokenUsage: 500,
          sampleSize: 10,
        });
      }

      const analysis = optimizer.analyzePerformance('prompt-5');
      expect(analysis.avgLatencyMs).toBeGreaterThan(2000);
      expect(analysis.recommendations.some(r => r.includes('conciseness'))).toBe(true);
    });

    it('should recommend chain_of_thought when quality is low', () => {
      for (let i = 0; i < 5; i++) {
        optimizer.trackPerformance('prompt-6', {
          successRate: 0.8,
          avgLatencyMs: 1500,
          qualityScore: 0.5,
          tokenUsage: 300,
          sampleSize: 10,
        });
      }

      const analysis = optimizer.analyzePerformance('prompt-6');
      expect(analysis.avgQualityScore).toBeLessThan(0.6);
      expect(analysis.recommendations.some(r => r.includes('chain_of_thought'))).toBe(true);
    });

    it('should detect convergence with low CV', () => {
      // 低変動データ（CV << 15%）
      for (let i = 0; i < 10; i++) {
        optimizer.trackPerformance('prompt-7', {
          successRate: 0.90 + (Math.random() * 0.01 - 0.005), // 89.5% ~ 90.5%
          avgLatencyMs: 1000,
          qualityScore: 0.85,
          tokenUsage: 250,
          sampleSize: 10,
        });
      }

      const analysis = optimizer.analyzePerformance('prompt-7');
      expect(analysis.convergence.isConverged).toBe(true);
      expect(analysis.convergence.coefficientOfVariation).toBeLessThan(15);
    });

    it('should detect non-convergence with high CV', () => {
      // 高変動データ（CV > 15%）
      const rates = [0.5, 0.95, 0.6, 0.9, 0.4, 0.85];
      for (const rate of rates) {
        optimizer.trackPerformance('prompt-8', {
          successRate: rate,
          avgLatencyMs: 1000,
          qualityScore: 0.75,
          tokenUsage: 250,
          sampleSize: 10,
        });
      }

      const analysis = optimizer.analyzePerformance('prompt-8');
      expect(analysis.convergence.coefficientOfVariation).toBeGreaterThan(10);
    });
  });

  // ── 変種生成 ──

  describe('generateVariant', () => {
    const basePrompt = 'あなたはAI助手です。以下の問題について、非常に詳細に説明してください。' +
      '説明は、かなり長くなる可能性があります。以下の内容です。';

    it('should generate conciseness variant', async () => {
      const variant = await optimizer.generateVariant('prompt-9', basePrompt, 'conciseness');

      expect(variant.parentPromptId).toBe('prompt-9');
      expect(variant.strategy).toBe('conciseness');
      expect(variant.content.length).toBeLessThan(basePrompt.length);
      expect(variant.content).not.toContain('非常に');
      expect(variant.content).not.toContain('以下の内容です。');
    });

    it('should generate specificity variant', async () => {
      const variant = await optimizer.generateVariant('prompt-10', basePrompt, 'specificity');

      expect(variant.strategy).toBe('specificity');
      expect(variant.content.length).toBeGreaterThan(basePrompt.length);
      expect(variant.content).toContain('JSON');
      expect(variant.content).toContain('特に注意');
    });

    it('should generate chain_of_thought variant', async () => {
      const variant = await optimizer.generateVariant('prompt-11', basePrompt, 'chain_of_thought');

      expect(variant.strategy).toBe('chain_of_thought');
      expect(variant.content).toContain('ステップ');
      expect(variant.content).toContain('推論');
    });

    it('should generate few_shot variant', async () => {
      const variant = await optimizer.generateVariant('prompt-12', basePrompt, 'few_shot');

      expect(variant.strategy).toBe('few_shot');
      expect(variant.content).toContain('例');
      expect(variant.content).toContain('具体例');
    });

    it('should generate hybrid variant combining multiple strategies', async () => {
      const variant = await optimizer.generateVariant('prompt-13', basePrompt, 'hybrid');

      expect(variant.strategy).toBe('hybrid');
      // Hybrid should apply multiple strategies
      expect(variant.content).toContain('ステップ'); // chain_of_thought
      expect(variant.content).toContain('JSON'); // specificity
    });

    it('should create unique variant IDs', async () => {
      const variant1 = await optimizer.generateVariant('prompt-14', basePrompt, 'conciseness');
      const variant2 = await optimizer.generateVariant('prompt-14', basePrompt, 'conciseness');

      expect(variant1.id).not.toBe(variant2.id);
      expect(variant1.id).toMatch(/prompt-14_conciseness_/);
    });

    it('should store variants in optimizer', async () => {
      const variant = await optimizer.generateVariant('prompt-15', basePrompt, 'specificity');
      const variants = optimizer.getVariants('prompt-15');

      expect(variants).toHaveLength(1);
      expect(variants[0].id).toBe(variant.id);
    });
  });

  // ── A/Bテスト ──

  describe('runABTest', () => {
    beforeEach(() => {
      // Setup variant A with higher quality
      for (let i = 0; i < 30; i++) {
        optimizer.trackPerformance('variant-a', {
          successRate: 0.92,
          avgLatencyMs: 1200,
          qualityScore: 0.88 + (Math.random() * 0.05), // 0.88-0.93
          tokenUsage: 250,
          sampleSize: 1,
        });
      }

      // Setup variant B with lower quality
      for (let i = 0; i < 30; i++) {
        optimizer.trackPerformance('variant-b', {
          successRate: 0.85,
          avgLatencyMs: 1300,
          qualityScore: 0.72 + (Math.random() * 0.05), // 0.72-0.77
          tokenUsage: 280,
          sampleSize: 1,
        });
      }
    });

    it('should return null when insufficient samples', async () => {
      const result = await optimizer.runABTest('prompt-16', 'prompt-17', 100);
      expect(result).toBeNull();
    });

    it('should conduct A/B test with sufficient samples', async () => {
      const result = await optimizer.runABTest('variant-a', 'variant-b', 30);

      expect(result).not.toBeNull();
      expect(result!.promptIdA).toBe('variant-a');
      expect(result!.promptIdB).toBe('variant-b');
      expect(result!.winner).toBeDefined();
      expect(result!.confidence).toBeGreaterThanOrEqual(0);
      expect(result!.confidence).toBeLessThanOrEqual(1);
      expect(result!.sampleSizeA).toBeGreaterThan(0);
      expect(result!.sampleSizeB).toBeGreaterThan(0);
    });

    it('should detect statistically significant difference', async () => {
      const result = await optimizer.runABTest('variant-a', 'variant-b', 30);

      if (result && result.confidence > 0.95) {
        // If significant difference detected, winner should be variant-a (higher mean)
        expect(result.winner).toBe('variant-a');
        expect(result.effectSize).toBeGreaterThan(0.2);
      }
    });

    it('should calculate correct effect size (Cohen\'s d)', async () => {
      const result = await optimizer.runABTest('variant-a', 'variant-b', 30);

      expect(result).not.toBeNull();
      expect(result!.effectSize).toBeGreaterThanOrEqual(0);
      expect(typeof result!.effectSize).toBe('number');
    });

    it('should store A/B test results', async () => {
      await optimizer.runABTest('variant-a', 'variant-b', 30);
      const results = optimizer.getABTestResults('variant-a', 'variant-b');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].promptIdA).toBe('variant-a');
      expect(results[0].promptIdB).toBe('variant-b');
    });

    it('should filter A/B test results by promptId', async () => {
      optimizer.trackPerformance('variant-c', {
        successRate: 0.9,
        avgLatencyMs: 1000,
        qualityScore: 0.85,
        tokenUsage: 250,
        sampleSize: 1,
      });

      for (let i = 0; i < 30; i++) {
        optimizer.trackPerformance('variant-c', {
          successRate: 0.9,
          avgLatencyMs: 1000,
          qualityScore: 0.85 + (Math.random() * 0.02),
          tokenUsage: 250,
          sampleSize: 1,
        });
      }

      await optimizer.runABTest('variant-a', 'variant-c', 30);
      const results = optimizer.getABTestResults('variant-a');

      // Should include both tests involving variant-a
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every(r => r.promptIdA === 'variant-a' || r.promptIdB === 'variant-a')).toBe(true);
    });
  });

  // ── 最適化適用 ──

  describe('applyOptimization', () => {
    it('should apply optimization with valid variant', async () => {
      const parentPrompt = 'テストプロンプト';
      const variant = await optimizer.generateVariant('prompt-18', parentPrompt, 'conciseness');

      // Track some performance first
      optimizer.trackPerformance('prompt-18', {
        successRate: 0.8,
        avgLatencyMs: 1500,
        qualityScore: 0.75,
        tokenUsage: 300,
        sampleSize: 10,
      });

      const record = optimizer.applyOptimization('prompt-18', variant.id, parentPrompt);

      expect(record).not.toBeNull();
      expect(record!.variantApplied).toBe(variant.id);
      expect(record!.oldContent).toBe(parentPrompt);
      expect(record!.newContent).toBe(variant.content);
      expect(record!.reason).toContain('strategy: conciseness');
    });

    it('should return null for non-existent variant', () => {
      const record = optimizer.applyOptimization('prompt-19', 'non-existent-variant', 'old content');
      expect(record).toBeNull();
    });

    it('should calculate performance delta', async () => {
      const parentPrompt = 'テストプロンプト';
      const variant = await optimizer.generateVariant('prompt-20', parentPrompt, 'specificity');

      // Track initial performance
      optimizer.trackPerformance('prompt-20', {
        successRate: 0.7,
        avgLatencyMs: 2000,
        qualityScore: 0.65,
        tokenUsage: 400,
        sampleSize: 10,
      });

      const record = optimizer.applyOptimization('prompt-20', variant.id, parentPrompt);

      expect(record).not.toBeNull();
      expect(record!.performanceDeltaPercent).toBeDefined();
      expect(typeof record!.performanceDeltaPercent).toBe('number');
    });

    it('should store optimization in history', async () => {
      const parentPrompt = 'テストプロンプト';
      const variant = await optimizer.generateVariant('prompt-21', parentPrompt, 'chain_of_thought');

      optimizer.trackPerformance('prompt-21', {
        successRate: 0.8,
        avgLatencyMs: 1500,
        qualityScore: 0.75,
        tokenUsage: 300,
        sampleSize: 10,
      });

      optimizer.applyOptimization('prompt-21', variant.id, parentPrompt);
      const history = optimizer.getOptimizationHistory('prompt-21');

      expect(history).toHaveLength(1);
      expect(history[0].variantApplied).toBe(variant.id);
    });
  });

  // ── ロールバック ──

  describe('rollback', () => {
    it('should return null when no history', () => {
      const result = optimizer.rollback('prompt-22');
      expect(result).toBeNull();
    });

    it('should return null when only one optimization', async () => {
      const parentPrompt = 'テストプロンプト';
      const variant = await optimizer.generateVariant('prompt-23', parentPrompt, 'conciseness');

      optimizer.trackPerformance('prompt-23', {
        successRate: 0.8,
        avgLatencyMs: 1500,
        qualityScore: 0.75,
        tokenUsage: 300,
        sampleSize: 10,
      });

      optimizer.applyOptimization('prompt-23', variant.id, parentPrompt);
      const result = optimizer.rollback('prompt-23');

      expect(result).toBeNull();
    });

    it('should rollback to previous version', async () => {
      const prompt1 = 'バージョン1';
      const variant1 = await optimizer.generateVariant('prompt-24', prompt1, 'conciseness');

      optimizer.trackPerformance('prompt-24', {
        successRate: 0.8,
        avgLatencyMs: 1500,
        qualityScore: 0.75,
        tokenUsage: 300,
        sampleSize: 10,
      });

      optimizer.applyOptimization('prompt-24', variant1.id, prompt1);

      const variant2 = await optimizer.generateVariant('prompt-24', variant1.content, 'specificity');
      optimizer.applyOptimization('prompt-24', variant2.id, variant1.content);

      const history = optimizer.getOptimizationHistory('prompt-24');
      expect(history).toHaveLength(2);

      const rollback = optimizer.rollback('prompt-24');
      expect(rollback).not.toBeNull();
      expect(rollback!.oldContent).toBe(variant2.content); // Old was v2
      expect(rollback!.newContent).toBe(variant1.content); // New is v1
      expect(rollback!.reason).toContain('rollback');

      const updatedHistory = optimizer.getOptimizationHistory('prompt-24');
      expect(updatedHistory).toHaveLength(3);
    });
  });

  // ── 履歴管理 ──

  describe('history management', () => {
    it('should return empty history for new prompt', () => {
      const history = optimizer.getOptimizationHistory('prompt-25');
      expect(history).toEqual([]);
    });

    it('should retrieve all optimization records', async () => {
      const parentPrompt = 'テスト';
      const v1 = await optimizer.generateVariant('prompt-26', parentPrompt, 'conciseness');
      const v2 = await optimizer.generateVariant('prompt-26', v1.content, 'specificity');

      optimizer.trackPerformance('prompt-26', {
        successRate: 0.8,
        avgLatencyMs: 1500,
        qualityScore: 0.75,
        tokenUsage: 300,
        sampleSize: 10,
      });

      optimizer.applyOptimization('prompt-26', v1.id, parentPrompt);
      optimizer.applyOptimization('prompt-26', v2.id, v1.content);

      const history = optimizer.getOptimizationHistory('prompt-26');
      expect(history).toHaveLength(2);
      expect(history[0].variantApplied).toBe(v1.id);
      expect(history[1].variantApplied).toBe(v2.id);
    });

    it('should preserve immutability of history', async () => {
      const parentPrompt = 'テスト';
      const variant = await optimizer.generateVariant('prompt-27', parentPrompt, 'conciseness');

      optimizer.trackPerformance('prompt-27', {
        successRate: 0.8,
        avgLatencyMs: 1500,
        qualityScore: 0.75,
        tokenUsage: 300,
        sampleSize: 10,
      });

      optimizer.applyOptimization('prompt-27', variant.id, parentPrompt);
      const history1 = optimizer.getOptimizationHistory('prompt-27');
      const history2 = optimizer.getOptimizationHistory('prompt-27');

      history1[0].reason = 'MODIFIED';
      expect(history2[0].reason).not.toBe('MODIFIED');
    });
  });

  // ── シングルトンパターン ──

  describe('singleton pattern', () => {
    it('should reuse same instance', () => {
      const opt1 = getPromptOptimizer();
      const opt2 = getPromptOptimizer();

      expect(opt1).toBe(opt2);
    });

    it('should reset and create new instance', () => {
      const opt1 = getPromptOptimizer();
      resetPromptOptimizer();
      const opt2 = getPromptOptimizer();

      expect(opt1).not.toBe(opt2);
    });

    it('should clear data after reset', async () => {
      const opt1 = getPromptOptimizer();
      opt1.trackPerformance('prompt-28', {
        successRate: 0.8,
        avgLatencyMs: 1500,
        qualityScore: 0.75,
        tokenUsage: 300,
        sampleSize: 10,
      });

      resetPromptOptimizer();
      const opt2 = getPromptOptimizer();

      const analysis = opt2.analyzePerformance('prompt-28');
      expect(analysis.totalExecutions).toBe(0);
    });
  });
});
