/**
 * CanaryManager — カナリアデプロイ + A/B テスト（段階的治療導入）
 *
 * 生体対応: 臨床試験（Clinical Trial）
 * 新しい治療法を全患者に投与する前に、
 * 小規模グループ（カナリア）でテストして安全性を確認。
 *
 * 機能:
 * - Canary 定義（デプロイ%指定）
 * - トラフィックルーティング（variant A or B）
 * - パフォーマンスメトリクス記録
 * - Canary evaluation（variant 比較）
 * - Promote / Rollback
 *
 * T073-T074 実装
 */

import { createLogger } from './logger.js';
import { getStorage } from './storage.js';
import { z } from 'zod';
import type { IStorageAdapter, StorageRecord } from './storage.js';

const log = createLogger('canary-manager');

// ── Zodスキーマ ──

/** Canary 設定のスキーマ */
export const CanaryConfigSchema = z.object({
  name: z.string().min(1),
  variant_a: z.string().min(1),
  variant_b: z.string().min(1),
  trafficPercent: z.number().min(0).max(100),
  duration: z.number().positive(), // ms
  status: z.enum(['pending', 'running', 'promoted', 'rolled_back']),
  createdAt: z.number().positive(),
  updatedAt: z.number().positive(),
  startTime: z.number().positive().optional(),
  endTime: z.number().positive().optional(),
});
export type CanaryConfig = z.infer<typeof CanaryConfigSchema>;

/** Canary レコード（Storage用） */
export interface CanaryRecord extends StorageRecord {
  name: string;
  variant_a: string;
  variant_b: string;
  trafficPercent: number;
  duration: number;
  status: 'pending' | 'running' | 'promoted' | 'rolled_back';
  startTime?: number;
  endTime?: number;
}

/** メトリクスレコード（Storage用） */
export interface MetricRecord extends StorageRecord {
  canaryId: string;
  variant: 'a' | 'b';
  metricName: string;
  value: number;
  timestamp: number;
}

interface CanaryMetrics {
  variant_a: Record<string, number[]>;
  variant_b: Record<string, number[]>;
}

/**
 * CanaryManager — カナリアデプロイ & A/B テスト
 *
 * 医学メタファー: 臨床試験と治療導入
 * - Phase 1: 小グループ（trafficPercent%）でテスト
 * - Evaluate: 効果と副作用を比較
 * - Promote: 全員に導入、または Rollback
 */
export class CanaryManager {
  private canaries = new Map<string, {config: CanaryConfig; metrics: CanaryMetrics}>();
  private storage: IStorageAdapter;

  constructor(storage?: IStorageAdapter) {
    this.storage = storage ?? getStorage();
  }

  /**
   * Canary デプロイを作成
   *
   * @param name Canary 名
   * @param config 設定（variant_a, variant_b, trafficPercent, duration）
   */
  async createCanary(
    name: string,
    config: {
      variant_a: string;
      variant_b: string;
      trafficPercent: number;
      duration: number;
    },
  ): Promise<void> {
    const now = Date.now();

    const canaryConfig: CanaryConfig = {
      name,
      ...config,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    // Zodで型検証
    const validation = CanaryConfigSchema.safeParse(canaryConfig);
    if (!validation.success) {
      log.error('[CanaryManager] createCanary validation failed:', validation.error.message);
      throw new TypeError(`[CanaryManager] createCanary validation failed — ${validation.error.message}`);
    }

    this.canaries.set(name, {
      config: validation.data,
      metrics: {
        variant_a: {},
        variant_b: {},
      },
    });

    // Storage に保存
    await this.storage.put<CanaryRecord>('canaries', {
      id: name,
      ...validation.data,
    });

    log.info(`[CanaryManager] Created canary: ${name}`, {
      name,
      variant_a: config.variant_a,
      variant_b: config.variant_b,
      trafficPercent: config.trafficPercent,
    });
  }

  /**
   * トラフィックをルーティング（variant A or B）
   *
   * @param requestId リクエスト ID
   * @returns 'a' or 'b'
   */
  routeTraffic(canaryId: string, requestId: string): 'a' | 'b' {
    const canary = this.canaries.get(canaryId);
    if (!canary) {
      log.warn(`[CanaryManager] Canary not found: ${canaryId}`);
      return 'a'; // Default to variant A
    }

    // Deterministic hash: canaryId + requestId で確定的にハッシュ
    const hash = this.hashForRouting(canaryId, requestId);
    const variant = (hash % 100) < canary.config.trafficPercent ? 'b' : 'a';

    log.debug(`[CanaryManager] Routed request to variant ${variant}`, {
      canaryId,
      requestId,
      trafficPercent: canary.config.trafficPercent,
    });

    return variant;
  }

  /**
   * メトリクスを記録
   *
   * @param canaryId Canary ID
   * @param variant 'a' or 'b'
   * @param metricName メトリクス名（e.g., 'latency', 'errorCount'）
   * @param value メトリクス値
   */
  async recordMetric(canaryId: string, variant: 'a' | 'b', metricName: string, value: number): Promise<void> {
    const canary = this.canaries.get(canaryId);
    if (!canary) {
      log.warn(`[CanaryManager] Canary not found: ${canaryId}`);
      return;
    }

    // メモリに記録
    if (!canary.metrics[`variant_${variant}`][metricName]) {
      canary.metrics[`variant_${variant}`][metricName] = [];
    }
    canary.metrics[`variant_${variant}`][metricName].push(value);

    // Storage に保存
    await this.storage.put<MetricRecord>('canary_metrics', {
      id: `${canaryId}_${variant}_${metricName}_${Date.now()}`,
      canaryId,
      variant,
      metricName,
      value,
      timestamp: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  /**
   * Canary を評価（variant 比較）
   *
   * @returns 評価結果（promote/rollback 推奨）
   */
  evaluateCanary(canaryId: string): {
    recommendation: 'promote' | 'rollback' | 'continue';
    summary: {
      variant_a: {avgLatency: number; errorRate: number};
      variant_b: {avgLatency: number; errorRate: number};
    };
    confidence: number; // 0-1
  } {
    const canary = this.canaries.get(canaryId);
    if (!canary) {
      log.warn(`[CanaryManager] Canary not found: ${canaryId}`);
      return {
        recommendation: 'continue',
        summary: {
          variant_a: {avgLatency: 0, errorRate: 0},
          variant_b: {avgLatency: 0, errorRate: 0},
        },
        confidence: 0,
      };
    }

    const metricsa = canary.metrics.variant_a;
    const metricsb = canary.metrics.variant_b;

    // 簡単な統計: 平均レイテンシとエラー率
    const avgLatencyA = this.computeAverage(metricsa.latency ?? []);
    const avgLatencyB = this.computeAverage(metricsb.latency ?? []);
    const errorRateA = this.computeErrorRate(metricsa.errorCount ?? []);
    const errorRateB = this.computeErrorRate(metricsb.errorCount ?? []);

    // 推奨判断（簡略版）
    let recommendation: 'promote' | 'rollback' | 'continue' = 'continue';
    let confidence = 0;

    if (avgLatencyA > 0 && avgLatencyB > 0) {
      const latencyDiff = (avgLatencyB - avgLatencyA) / avgLatencyA;

      // variant B が 20% 以上遅い → rollback
      if (latencyDiff > 0.2) {
        recommendation = 'rollback';
        confidence = Math.min(1, Math.abs(latencyDiff) * 0.5);
      }
      // variant B が 10% 以上高速 → promote
      else if (latencyDiff < -0.1) {
        recommendation = 'promote';
        confidence = Math.min(1, Math.abs(latencyDiff) * 0.5);
      }
    }

    log.info(`[CanaryManager] Evaluated canary: ${canaryId}`, {
      canaryId,
      recommendation,
      avgLatencyA,
      avgLatencyB,
      errorRateA,
      errorRateB,
      confidence,
    });

    return {
      recommendation,
      summary: {
        variant_a: {avgLatency: avgLatencyA, errorRate: errorRateA},
        variant_b: {avgLatency: avgLatencyB, errorRate: errorRateB},
      },
      confidence,
    };
  }

  /**
   * Canary を Promote（variant B を新デフォルトに）
   */
  async promote(canaryId: string): Promise<void> {
    const canary = this.canaries.get(canaryId);
    if (!canary) {
      log.warn(`[CanaryManager] Canary not found: ${canaryId}`);
      return;
    }

    canary.config.status = 'promoted';
    canary.config.endTime = Date.now();
    canary.config.updatedAt = Date.now();

    await this.storage.put<CanaryRecord>('canaries', {
      id: canaryId,
      ...canary.config,
    });

    log.info(`[CanaryManager] Promoted canary: ${canaryId}`, {
      canaryId,
      newVariant: canary.config.variant_b,
    });
  }

  /**
   * Canary をロールバック（variant A に戻す）
   */
  async rollback(canaryId: string): Promise<void> {
    const canary = this.canaries.get(canaryId);
    if (!canary) {
      log.warn(`[CanaryManager] Canary not found: ${canaryId}`);
      return;
    }

    canary.config.status = 'rolled_back';
    canary.config.endTime = Date.now();
    canary.config.updatedAt = Date.now();

    await this.storage.put<CanaryRecord>('canaries', {
      id: canaryId,
      ...canary.config,
    });

    log.warn(`[CanaryManager] Rolled back canary: ${canaryId}`, {
      canaryId,
      revertedVariant: canary.config.variant_a,
    });
  }

  /**
   * Canary を開始（status = running）
   */
  async startCanary(canaryId: string): Promise<void> {
    const canary = this.canaries.get(canaryId);
    if (!canary) {
      log.warn(`[CanaryManager] Canary not found: ${canaryId}`);
      return;
    }

    canary.config.status = 'running';
    canary.config.startTime = Date.now();
    canary.config.updatedAt = Date.now();

    await this.storage.put<CanaryRecord>('canaries', {
      id: canaryId,
      ...canary.config,
    });

    log.info(`[CanaryManager] Started canary: ${canaryId}`, {
      canaryId,
      duration: canary.config.duration,
    });
  }

  /**
   * Canary を取得
   */
  getCanary(canaryId: string): CanaryConfig | undefined {
    return this.canaries.get(canaryId)?.config;
  }

  /**
   * 全 Canary を取得
   */
  getAllCanaries(): CanaryConfig[] {
    return Array.from(this.canaries.values()).map(c => c.config);
  }

  /**
   * Canary のメトリクスを取得
   */
  getMetrics(canaryId: string): CanaryMetrics | undefined {
    return this.canaries.get(canaryId)?.metrics;
  }

  // ── 内部ヘルパー ──

  private hashForRouting(canaryId: string, requestId: string): number {
    const str = `${canaryId}:${requestId}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private computeAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private computeErrorRate(errorCounts: number[]): number {
    if (errorCounts.length === 0) return 0;
    const totalErrors = errorCounts.reduce((a, b) => a + b, 0);
    return totalErrors / errorCounts.length;
  }
}

// ── シングルトン ──

let canaryManagerInstance: CanaryManager | null = null;

/**
 * CanaryManager インスタンスを取得
 */
export function getCanaryManager(): CanaryManager {
  if (!canaryManagerInstance) {
    canaryManagerInstance = new CanaryManager();
  }
  return canaryManagerInstance;
}

/**
 * インスタンスを差し替え（テスト用）
 */
export function setCanaryManager(manager: CanaryManager): void {
  canaryManagerInstance = manager;
}
