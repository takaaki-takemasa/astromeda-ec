/**
 * Prompt Auto-Optimization Engine — G-041 シナプス可塑性
 *
 * 医学的メタファー: シナプス可塑性（Synaptic Plasticity）
 * プロンプトが使用パターンと性能データに基づいて自動的に進化・強化される。
 * ニューロンの接続が繰り返しの刺激で強化されるように、
 * プロンプトも実行結果に基づいて最適化される。
 *
 * 設計原則:
 * 1. パフォーマンス追跡 — 成功率、レイテンシ、品質スコアを記録
 * 2. 統計的分析 — t検定とEffect sizeで優位性を判定
 * 3. A/Bテスト — 2つのプロンプト変種を統計的に比較
 * 4. 自動改善 — テンプレートベースまたはAI駆動で変種を生成
 * 5. ロールバック対応 — 悪化したら前バージョンに戻す
 */

import { coefficientOfVariation, tTest, cohenD, descriptiveStats } from '../lib/validation/statistical-engine.js';
import { renderTemplate, type TemplateVars } from './prompt-templates.js';
import { getAIBrain } from './ai-brain.js';

// ── 型定義 ──

export interface PromptPerformanceMetrics {
  promptId: string;
  timestamp: number;
  successRate: number; // 0-1
  avgLatencyMs: number;
  qualityScore: number; // 0-1
  tokenUsage: number;
  sampleSize: number;
}

export interface PromptVariant {
  id: string; // promptId_v1, promptId_v2, etc.
  parentPromptId: string;
  content: string;
  strategy: 'conciseness' | 'specificity' | 'chain_of_thought' | 'few_shot' | 'hybrid';
  createdAt: number;
  performance?: PromptPerformanceMetrics;
}

export interface ABTestResult {
  promptIdA: string;
  promptIdB: string;
  winner: string;
  confidence: number; // p-value or confidence level
  effectSize: number; // Cohen's d
  sampleSizeA: number;
  sampleSizeB: number;
  meanA: number;
  meanB: number;
  statistic: 'tTest' | 'ratio';
  timestamp: number;
}

export interface OptimizationRecord {
  promptId: string;
  timestamp: number;
  variantApplied: string;
  oldContent: string;
  newContent: string;
  reason: string;
  performanceDeltaPercent: number;
}

export interface PromptAnalysis {
  promptId: string;
  totalExecutions: number;
  successRate: number;
  avgLatencyMs: number;
  avgQualityScore: number;
  convergence: {
    isConverged: boolean;
    coefficientOfVariation: number; // CV <= 15% is good
  };
  recommendations: string[];
  lastOptimization?: OptimizationRecord;
}

// ── PromptOptimizer クラス ──

export class PromptOptimizer {
  private performanceHistory: Map<string, PromptPerformanceMetrics[]> = new Map();
  private variants: Map<string, PromptVariant[]> = new Map();
  private optimizationHistory: Map<string, OptimizationRecord[]> = new Map();
  private abtestResults: ABTestResult[] = [];

  constructor() {
    // Initialize storage
  }

  /**
   * プロンプト実行結果を記録
   */
  trackPerformance(promptId: string, metrics: Omit<PromptPerformanceMetrics, 'promptId' | 'timestamp'>): void {
    const record: PromptPerformanceMetrics = {
      promptId,
      timestamp: Date.now(),
      ...metrics,
    };

    if (!this.performanceHistory.has(promptId)) {
      this.performanceHistory.set(promptId, []);
    }
    this.performanceHistory.get(promptId)!.push(record);
  }

  /**
   * プロンプトのパフォーマンスを統計的に分析
   */
  analyzePerformance(promptId: string): PromptAnalysis {
    const history = this.performanceHistory.get(promptId) || [];

    if (history.length === 0) {
      return {
        promptId,
        totalExecutions: 0,
        successRate: 0,
        avgLatencyMs: 0,
        avgQualityScore: 0,
        convergence: { isConverged: false, coefficientOfVariation: 0 },
        recommendations: ['データなし'],
        lastOptimization: undefined,
      };
    }

    const successRates = history.map(h => h.successRate);
    const latencies = history.map(h => h.avgLatencyMs);
    const qualityScores = history.map(h => h.qualityScore);

    const successStats = descriptiveStats(successRates);
    const latencyStats = descriptiveStats(latencies);
    const qualityStats = descriptiveStats(qualityScores);

    // 収束性チェック: CV <= 15% で十分に収束していると判断
    const successRateCV = coefficientOfVariation(successRates);
    const isConverged = successRateCV <= 15;

    const recommendations: string[] = [];

    // 成功率が低い → 具体性向上を提案
    if (successStats.mean < 0.7) {
      recommendations.push('成功率が低いため、specificity戦略での改善を検討してください');
    }

    // レイテンシが高い → 簡潔性向上を提案
    if (latencyStats.mean > 2000) {
      recommendations.push('レイテンシが高いため、conciseness戦略での短縮を推奨します');
    }

    // 品質スコアが低い → 思考過程の追加を提案
    if (qualityStats.mean < 0.6) {
      recommendations.push('品質スコアが低いため、chain_of_thought戦略での改善を検討してください');
    }

    // 品質ばらつきが大きい → 少量サンプルでの実装を提案
    if (coefficientOfVariation(qualityScores) > 25) {
      recommendations.push('品質の変動が大きいため、few_shot戦略でサンプルを追加することを推奨します');
    }

    const optHistory = this.optimizationHistory.get(promptId) || [];
    const lastOpt = optHistory.length > 0 ? optHistory[optHistory.length - 1] : undefined;

    return {
      promptId,
      totalExecutions: history.length,
      successRate: successStats.mean,
      avgLatencyMs: latencyStats.mean,
      avgQualityScore: qualityStats.mean,
      convergence: { isConverged, coefficientOfVariation: successRateCV },
      recommendations,
      lastOptimization: lastOpt,
    };
  }

  /**
   * 最適化戦略に基づいてプロンプト変種を生成
   */
  async generateVariant(
    promptId: string,
    parentContent: string,
    strategy: PromptVariant['strategy'],
  ): Promise<PromptVariant> {
    // Use timestamp + random to ensure uniqueness
    const variantId = `${promptId}_${strategy}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    let newContent = parentContent;

    switch (strategy) {
      case 'conciseness': {
        // トークン削減: 冗長な部分を削除
        newContent = this.applyConciseness(parentContent);
        break;
      }

      case 'specificity': {
        // 具体性向上: より詳細な指示を追加
        newContent = this.applySpecificity(parentContent);
        break;
      }

      case 'chain_of_thought': {
        // 思考の鎖: 推論ステップを明示
        newContent = this.applyChainOfThought(parentContent);
        break;
      }

      case 'few_shot': {
        // 少量サンプル学習: 例を追加
        newContent = this.applyFewShot(parentContent);
        break;
      }

      case 'hybrid': {
        // 複合戦略: 複数を組み合わせ
        newContent = await this.applyHybrid(parentContent);
        break;
      }
    }

    const variant: PromptVariant = {
      id: variantId,
      parentPromptId: promptId,
      content: newContent,
      strategy,
      createdAt: Date.now(),
    };

    if (!this.variants.has(promptId)) {
      this.variants.set(promptId, []);
    }
    this.variants.get(promptId)!.push(variant);

    return variant;
  }

  /**
   * 2つのプロンプト変種をA/Bテスト（統計的に比較）
   */
  async runABTest(
    promptIdA: string,
    promptIdB: string,
    sampleSize: number = 50,
  ): Promise<ABTestResult | null> {
    const historyA = this.performanceHistory.get(promptIdA) || [];
    const historyB = this.performanceHistory.get(promptIdB) || [];

    // サンプルサイズが足りない場合はnull
    if (historyA.length < Math.ceil(sampleSize / 2) || historyB.length < Math.ceil(sampleSize / 2)) {
      return null;
    }

    // 最新のsampleSize/2件ずつを取る
    const sampleA = historyA.slice(-Math.ceil(sampleSize / 2)).map(h => h.qualityScore);
    const sampleB = historyB.slice(-Math.ceil(sampleSize / 2)).map(h => h.qualityScore);

    // t検定
    const tResult = tTest(sampleA, sampleB);
    const effectSize = cohenD(sampleA, sampleB);

    // 勝者判定: p < 0.05 で有意差ありと判定
    const isSignificant = tResult.pValue < 0.05;
    const winner = isSignificant
      ? sampleA.reduce((s, v) => s + v, 0) / sampleA.length >
        sampleB.reduce((s, v) => s + v, 0) / sampleB.length
        ? promptIdA
        : promptIdB
      : null; // no significant difference

    const meanA = sampleA.reduce((s, v) => s + v, 0) / sampleA.length;
    const meanB = sampleB.reduce((s, v) => s + v, 0) / sampleB.length;

    const result: ABTestResult = {
      promptIdA,
      promptIdB,
      winner: winner || (meanA > meanB ? promptIdA : promptIdB), // 有意差なければ平均で判定
      confidence: 1 - tResult.pValue,
      effectSize: Math.abs(effectSize),
      sampleSizeA: sampleA.length,
      sampleSizeB: sampleB.length,
      meanA,
      meanB,
      statistic: 'tTest',
      timestamp: Date.now(),
    };

    this.abtestResults.push(result);
    return result;
  }

  /**
   * 勝ったプロンプト変種を本番適用
   */
  applyOptimization(
    promptId: string,
    winnerVariantId: string,
    currentContent: string,
  ): OptimizationRecord | null {
    const variants = this.variants.get(promptId) || [];
    const winner = variants.find(v => v.id === winnerVariantId);

    if (!winner) {
      return null;
    }

    // パフォーマンス計算
    const oldMetrics = this.analyzePerformance(promptId);
    const winnerPerf = winner.performance;

    const performanceDelta = winnerPerf
      ? ((winnerPerf.qualityScore - oldMetrics.avgQualityScore) / Math.max(oldMetrics.avgQualityScore, 0.01)) * 100
      : 0;

    const record: OptimizationRecord = {
      promptId,
      timestamp: Date.now(),
      variantApplied: winnerVariantId,
      oldContent: currentContent,
      newContent: winner.content,
      reason: `A/B test winner (strategy: ${winner.strategy}, delta: ${performanceDelta.toFixed(1)}%)`,
      performanceDeltaPercent: performanceDelta,
    };

    if (!this.optimizationHistory.has(promptId)) {
      this.optimizationHistory.set(promptId, []);
    }
    this.optimizationHistory.get(promptId)!.push(record);

    return record;
  }

  /**
   * 最適化履歴を取得
   */
  getOptimizationHistory(promptId: string): OptimizationRecord[] {
    const history = this.optimizationHistory.get(promptId) || [];
    // Deep copy to ensure immutability
    return history.map(record => ({ ...record }));
  }

  /**
   * 前バージョンにロールバック
   */
  rollback(promptId: string): OptimizationRecord | null {
    const history = this.optimizationHistory.get(promptId) || [];
    if (history.length < 2) {
      return null;
    }

    // 最後から2番目の最適化に戻す
    const previousRecord = history[history.length - 2];

    // ロールバック記録を追加
    const rollbackRecord: OptimizationRecord = {
      promptId,
      timestamp: Date.now(),
      variantApplied: `ROLLBACK_TO_${previousRecord.variantApplied}`,
      oldContent: history[history.length - 1].newContent,
      newContent: previousRecord.newContent,
      reason: 'Manual rollback',
      performanceDeltaPercent: 0,
    };

    history.push(rollbackRecord);
    return rollbackRecord;
  }

  /**
   * 全プロンプトの変種を取得
   */
  getVariants(promptId: string): PromptVariant[] {
    return [...(this.variants.get(promptId) || [])];
  }

  /**
   * A/Bテスト結果履歴
   */
  getABTestResults(promptIdA?: string, promptIdB?: string): ABTestResult[] {
    return this.abtestResults.filter(r => {
      if (promptIdA && r.promptIdA !== promptIdA) return false;
      if (promptIdB && r.promptIdB !== promptIdB) return false;
      return true;
    });
  }

  // ── 内部メソッド ──

  private applyConciseness(content: string): string {
    // 冗長なフレーズを削除
    let optimized = content
      .replace(/以下の通りです。/g, '')
      .replace(/以下の内容です。/g, '')
      .replace(/。。/g, '。')
      .replace(/、、/g, '、');

    // 長い説明を短縮
    optimized = optimized.replace(/あなたは.*?です。/g, 'あなたは助言者です。');

    // 不要な修飾語削除（句読点前後も対応）
    optimized = optimized.replace(/、(非常に|とても|極めて)/g, '、');
    optimized = optimized.replace(/(非常に|とても|極めて)(詳細|長い|可能|です)/g, '$2');

    return optimized.trim();
  }

  private applySpecificity(content: string): string {
    // より詳細な指示を追加
    let enhanced = content;

    // 条件文を明示的に
    if (!enhanced.includes('以下の場合:')) {
      enhanced += '\n\n以下の場合について特に注意してください:\n' +
        '- エラーやエッジケースが発生した場合\n' +
        '- 不確実な判断が必要な場合\n' +
        '- ユーザーのリスクに影響する可能性がある場合';
    }

    // 出力形式をより明確に
    if (!enhanced.includes('JSON形式')) {
      enhanced += '\n\nJSON形式で以下の構造で回答してください:\n' +
        '{\n' +
        '  "result": "実行結果",\n' +
        '  "reasoning": "判断理由",\n' +
        '  "confidence": 0-1の信頼度\n' +
        '}';
    }

    return enhanced.trim();
  }

  private applyChainOfThought(content: string): string {
    // 推論ステップを明示
    let enhanced = content;

    // まだ推論ステップが明示されていなければ追加
    if (!enhanced.includes('推論') && !enhanced.includes('ステップ')) {
      const cot = '\n\n推論プロセスで以下のステップで思考してください:\n' +
        '1. 現在の状況を理解する\n' +
        '2. 利用可能な選択肢を列挙する\n' +
        '3. 各選択肢のメリット・デメリットを検討する\n' +
        '4. リスクを評価する\n' +
        '5. 最適な判断を決定する';

      enhanced += cot;
    }

    return enhanced.trim();
  }

  private applyFewShot(content: string): string {
    // 具体例を追加
    let enhanced = content;

    if (!enhanced.includes('例:') && !enhanced.includes('例1')) {
      enhanced += '\n\n具体例:\n' +
        '- 良い例: 明確な判断理由を含み、信頼度が高い応答\n' +
        '- 悪い例: 曖昧な判断理由で信頼度が低い応答';
    }

    return enhanced.trim();
  }

  private async applyHybrid(content: string): Promise<string> {
    // 複合戦略: 複数の最適化を組み合わせ
    let optimized = this.applyConciseness(content);
    optimized = this.applySpecificity(optimized);
    optimized = this.applyChainOfThought(optimized);
    return optimized.trim();
  }
}

// ── シングルトン ──

let optimizerInstance: PromptOptimizer | null = null;

export function getPromptOptimizer(): PromptOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new PromptOptimizer();
  }
  return optimizerInstance;
}

export function resetPromptOptimizer(): void {
  optimizerInstance = null;
}
