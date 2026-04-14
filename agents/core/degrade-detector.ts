/**
 * DegradeDetector — テスト結果からの劣化検知（腫瘍マーカー検査）
 *
 * 生体対応: 腫瘍マーカー（AFP, PSA等）
 * 正常値からのデルタを監視し、劣化トレンドを早期検知する。
 *
 * 機能:
 * - テスト結果を時系列で記録
 * - 過去平均と現在値を比較
 * - 5%以上の低下を検知したら Issue report を生成
 * - 構造化ログで全メトリクス記録
 *
 * T070 実装
 */

import { createLogger } from './logger.js';
import { z } from 'zod';

const log = createLogger('degrade-detector');

// ── Zodスキーマ ──

/** テスト結果のスキーマ */
export const TestResultSchema = z.object({
  suite: z.string().min(1),
  passed: z.number().nonnegative(),
  failed: z.number().nonnegative(),
  duration: z.number().positive(),
  timestamp: z.number().positive(),
});
export type TestResult = z.infer<typeof TestResultSchema>;

/** Issue Report スキーマ */
export const IssueReportSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  affectedModules: z.array(z.string()),
  metrics: z.object({
    baselinePassRate: z.number(),
    currentPassRate: z.number(),
    degradationPercent: z.number(),
  }),
  timestamp: z.number().positive(),
});
export type IssueReport = z.infer<typeof IssueReportSchema>;

interface SuiteMetrics {
  results: TestResult[];
  baselinePassRate: number;
  currentPassRate: number;
  totalTests: number;
  failureCount: number;
}

/**
 * DegradeDetector — テスト結果監視システム
 *
 * 医学メタファー: 腫瘍マーカーの定期測定
 * - 正常値範囲を baseline として記録
 * - 毎回の測定で baseline との乖離を判定
 * - 異常値が複数回続いたら医師に報告
 */
export class DegradeDetector {
  private metrics = new Map<string, SuiteMetrics>();
  private readonly historyLimit: number;
  private readonly degradationThreshold: number; // %

  /**
   * @param historyLimit 保持する履歴件数（デフォルト: 100）
   * @param degradationThreshold 劣化と判定する閾値%（デフォルト: 5）
   */
  constructor(historyLimit = 100, degradationThreshold = 5) {
    this.historyLimit = historyLimit;
    this.degradationThreshold = degradationThreshold;
  }

  /**
   * テスト結果を記録（毎回のテスト実行後に呼び出す）
   *
   * @param suite テストスイート名（e.g., 'agent-bus', 'health-monitor'）
   * @param passed 成功件数
   * @param failed 失敗件数
   * @param duration 実行時間ms
   */
  recordTestResult(suite: string, passed: number, failed: number, duration: number): void {
    // Zodで型検証
    const validation = TestResultSchema.safeParse({
      suite,
      passed,
      failed,
      duration,
      timestamp: Date.now(),
    });
    if (!validation.success) {
      log.error('[DegradeDetector] recordTestResult validation failed:', validation.error.message);
      throw new TypeError(`[DegradeDetector] recordTestResult validation failed — ${validation.error.message}`);
    }

    const result = validation.data;
    let metrics = this.metrics.get(suite);

    if (!metrics) {
      metrics = {
        results: [],
        baselinePassRate: 100,
        currentPassRate: 100,
        totalTests: passed + failed,
        failureCount: 0,
      };
      this.metrics.set(suite, metrics);
    }

    // 新しい結果を追加
    metrics.results.push(result);

    // 履歴上限を超えたら古い結果を削除
    if (metrics.results.length > this.historyLimit) {
      metrics.results = metrics.results.slice(-this.historyLimit);
    }

    // メトリクスを更新
    const total = passed + failed;
    metrics.totalTests = total;
    metrics.failureCount = failed;
    metrics.currentPassRate = total > 0 ? (passed / total) * 100 : 100;

    // Baseline を計算（最初の10件、またはそれ以下）
    if (metrics.results.length <= 10) {
      const sumPassRate = metrics.results.reduce((acc, r) => {
        const t = r.passed + r.failed;
        return acc + (t > 0 ? (r.passed / t) * 100 : 100);
      }, 0);
      metrics.baselinePassRate = metrics.results.length > 0 ? sumPassRate / metrics.results.length : 100;
    } else {
      // 最新10件の平均を baseline とする（rolling baseline）
      const recent10 = metrics.results.slice(-10);
      const sumPassRate = recent10.reduce((acc, r) => {
        const t = r.passed + r.failed;
        return acc + (t > 0 ? (r.passed / t) * 100 : 100);
      }, 0);
      metrics.baselinePassRate = sumPassRate / 10;
    }

    log.debug(`[DegradeDetector] Recorded test result: ${suite} pass=${passed} fail=${failed} duration=${duration}ms`, {
      suite,
      passed,
      failed,
      duration,
      currentPassRate: metrics.currentPassRate,
      baselinePassRate: metrics.baselinePassRate,
    });
  }

  /**
   * 劣化の有無をチェック
   *
   * @returns true 劣化が検知されたら true
   */
  checkForDegradation(): boolean {
    let foundDegradation = false;

    for (const [suite, metrics] of this.metrics) {
      if (metrics.results.length === 0) continue;

      const degradation = metrics.baselinePassRate - metrics.currentPassRate;
      const degradationPercent = (degradation / metrics.baselinePassRate) * 100;

      if (degradationPercent > this.degradationThreshold) {
        log.warn(`[DegradeDetector] Degradation detected: ${suite}`, {
          suite,
          baselinePassRate: metrics.baselinePassRate,
          currentPassRate: metrics.currentPassRate,
          degradationPercent,
          threshold: this.degradationThreshold,
        });
        foundDegradation = true;
      }
    }

    return foundDegradation;
  }

  /**
   * 劣化が検知されたスイートについて Issue report を生成
   *
   * @returns Issue report の配列（劣化なしの場合は空配列）
   */
  generateIssueReports(): IssueReport[] {
    const reports: IssueReport[] = [];

    for (const [suite, metrics] of this.metrics) {
      if (metrics.results.length === 0) continue;

      const degradation = metrics.baselinePassRate - metrics.currentPassRate;
      const degradationPercent = (degradation / metrics.baselinePassRate) * 100;

      if (degradationPercent > this.degradationThreshold) {
        // Severity を決定（5% = medium, 10% = high, 20% = critical）
        let severity: 'critical' | 'high' | 'medium' | 'low' = 'low';
        if (degradationPercent >= 20) severity = 'critical';
        else if (degradationPercent >= 10) severity = 'high';
        else if (degradationPercent >= 5) severity = 'medium';

        const report: IssueReport = {
          title: `Test Degradation Detected: ${suite}`,
          body: `Test suite "${suite}" shows degradation of ${degradationPercent.toFixed(2)}%.\n\n` +
                `- Baseline pass rate: ${metrics.baselinePassRate.toFixed(2)}%\n` +
                `- Current pass rate: ${metrics.currentPassRate.toFixed(2)}%\n` +
                `- Failed tests: ${metrics.failureCount}\n` +
                `- Total tests: ${metrics.totalTests}\n\n` +
                `Threshold: ${this.degradationThreshold}%\n` +
                `Time: ${new Date().toISOString()}`,
          severity,
          affectedModules: [suite],
          metrics: {
            baselinePassRate: metrics.baselinePassRate,
            currentPassRate: metrics.currentPassRate,
            degradationPercent,
          },
          timestamp: Date.now(),
        };

        // Zodで型検証
        const validation = IssueReportSchema.safeParse(report);
        if (validation.success) {
          reports.push(validation.data);
          log.info(`[DegradeDetector] Generated issue report: ${suite} (severity: ${severity})`);
        } else {
          log.error('[DegradeDetector] Issue report validation failed:', validation.error.message);
        }
      }
    }

    return reports;
  }

  /**
   * 特定のスイートの統計情報を取得（診断用）
   */
  getMetrics(suite: string): SuiteMetrics | undefined {
    return this.metrics.get(suite);
  }

  /**
   * 全スイートの統計情報を取得（診断用）
   */
  getAllMetrics(): Record<string, SuiteMetrics> {
    const result: Record<string, SuiteMetrics> = {};
    for (const [suite, metrics] of this.metrics) {
      result[suite] = metrics;
    }
    return result;
  }

  /**
   * 特定のスイートの結果履歴を取得
   */
  getHistory(suite: string): TestResult[] {
    return this.metrics.get(suite)?.results ?? [];
  }

  /**
   * すべての記録をリセット（テスト用）
   */
  reset(): void {
    this.metrics.clear();
    log.debug('[DegradeDetector] All metrics reset');
  }
}

// ── シングルトン ──

let detectorInstance: DegradeDetector | null = null;

/**
 * DegradeDetector インスタンスを取得
 */
export function getDegradeDetector(): DegradeDetector {
  if (!detectorInstance) {
    detectorInstance = new DegradeDetector(100, 5);
  }
  return detectorInstance;
}

/**
 * インスタンスを差し替え（テスト用）
 */
export function setDegradeDetector(detector: DegradeDetector): void {
  detectorInstance = detector;
}
