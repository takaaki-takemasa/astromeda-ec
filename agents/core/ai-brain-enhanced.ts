/**
 * AI Brain Enhanced — 既存 AIBrain を AIRouter 統合でラップ
 *
 * 医学的メタファー: 大脳皮質の機能拡張（既存の新皮質に補助野を追加）
 * 既存の AIBrain の decide/analyze メソッドを保持しながら、
 * AIRouter + FallbackManager を通じた多元的な AI アクセスを提供。
 *
 * 設計原則:
 * - 既存コードに破壊的変更なし（既に aiairのexportや呼び出し元がある）
 * - 新メソッド追加: decideWithRouter, analyzeWithRouter
 * - Router が設定できない場合のフォールバック: 元の decide/analyze に委譲
 */

import { AIBrain } from './ai-brain.js';
import { getAIRouter } from './ai-router.js';
import { getFallbackManager } from './fallback-manager.js';
import type { AIDecision, AIAnalysis } from './ai-brain.js';
import type { AIRouter } from './ai-router.js';
import type { FallbackManager } from './fallback-manager.js';
import { createLogger } from './logger.js';

const log = createLogger('ai-brain-enhanced');

/**
 * AIBrainEnhanced — AIRouter統合版
 */
export class AIBrainEnhanced {
  private baseBrain: AIBrain;
  private router: AIRouter;
  private fallbackManager: FallbackManager;

  constructor(apiKey?: string) {
    this.baseBrain = new AIBrain(apiKey);
    this.router = getAIRouter();
    this.fallbackManager = getFallbackManager();
  }

  /**
   * Router を通じた AI 決定（複数 AI 対応）
   * Claude/Gemini のティア別ルーティングで実行
   */
  async decideWithRouter(
    agentId: string,
    params: {
      context: string;
      options: string[];
      currentData?: Record<string, unknown>;
    },
  ): Promise<AIDecision> {
    // ルーティング情報を取得
    const primaryModel = this.router.getModel(agentId);

    if (!primaryModel) {
      // Router に登録されていない → 元の decide() に委譲
      return this.baseBrain.decide({
        agentId,
        agentName: agentId,
        context: params.context,
        options: params.options,
        currentData: params.currentData,
      });
    }

    // Router で指定されたモデルで実行
    log.info(`[AIBrainEnhanced] Agent ${agentId} using ${primaryModel.provider}/${primaryModel.model}`);

    try {
      // Claude の場合は AIBrain.decide()
      if (primaryModel.provider === 'claude') {
        return await this.fallbackManager.execute(async (ctx) => {
          return this.baseBrain.decide({
            agentId,
            agentName: agentId,
            context: params.context,
            options: params.options,
            currentData: params.currentData,
          });
        }, agentId);
      }

      // Gemini の場合は GeminiProvider で実行
      // NOTE: 本来なら GeminiProvider.generate() を呼び出すが、
      // ここでは AIDecision 形式に変換
      const geminiResponse = await this.callGeminiForDecision(
        primaryModel.model,
        params,
      );

      return geminiResponse;
    } catch (err) {
      log.error(`[AIBrainEnhanced] Decision failed for ${agentId}:`, err);

      // フォールバック: 元の decide() に委譲
      return this.baseBrain.decide({
        agentId,
        agentName: agentId,
        context: params.context,
        options: params.options,
        currentData: params.currentData,
      });
    }
  }

  /**
   * Router を通じた AI 分析（複数 AI 対応）
   */
  async analyzeWithRouter(
    agentId: string,
    params: {
      data: Record<string, unknown>;
      question: string;
    },
  ): Promise<AIAnalysis> {
    // ルーティング情報を取得
    const primaryModel = this.router.getModel(agentId);

    if (!primaryModel) {
      // Router に登録されていない → 元の analyze() に委譲
      return this.baseBrain.analyze({
        agentId,
        data: params.data,
        question: params.question,
      });
    }

    log.info(`[AIBrainEnhanced] Agent ${agentId} analyzing with ${primaryModel.provider}/${primaryModel.model}`);

    try {
      // Claude の場合は AIBrain.analyze()
      if (primaryModel.provider === 'claude') {
        return await this.fallbackManager.execute(async (ctx) => {
          return this.baseBrain.analyze({
            agentId,
            data: params.data,
            question: params.question,
          });
        }, agentId);
      }

      // Gemini の場合は GeminiProvider で実行
      const geminiResponse = await this.callGeminiForAnalysis(
        primaryModel.model,
        params,
      );

      return geminiResponse;
    } catch (err) {
      log.error(`[AIBrainEnhanced] Analysis failed for ${agentId}:`, err);

      // フォールバック: 元の analyze() に委譲
      return this.baseBrain.analyze({
        agentId,
        data: params.data,
        question: params.question,
      });
    }
  }

  /**
   * Gemini で Decision を実行（AIDecision 形式で返す）
   */
  private async callGeminiForDecision(
    model: string,
    params: {
      context: string;
      options: string[];
      currentData?: Record<string, unknown>;
    },
  ): Promise<AIDecision> {
    // NOTE: 実装時は GeminiProvider を import して呼び出す
    // ここでは プレースホルダー
    const prompt = `
Context: ${params.context}
Options: ${params.options.join(', ')}
Current Data: ${JSON.stringify(params.currentData || {})}

Please analyze the situation and recommend an action from the provided options.
Return your decision as JSON with fields: action, reasoning, confidence (0-1), riskLevel (low|medium|high|critical), requiresApproval (boolean).
`;

    // 簡略版: 最初の選択肢を返す
    return {
      action: params.options[0] || 'skip',
      reasoning: `[Gemini ${model}] Analysis not fully implemented. Selecting first option.`,
      confidence: 0.5,
      riskLevel: 'medium',
      requiresApproval: false,
    };
  }

  /**
   * Gemini で Analysis を実行（AIAnalysis 形式で返す）
   */
  private async callGeminiForAnalysis(
    model: string,
    params: {
      data: Record<string, unknown>;
      question: string;
    },
  ): Promise<AIAnalysis> {
    // NOTE: 実装時は GeminiProvider を import して呼び出す
    const prompt = `
Question: ${params.question}
Data: ${JSON.stringify(params.data)}

Please analyze the data and answer the question. Provide insights and recommendations.
`;

    // 簡略版: 空の分析を返す
    return {
      summary: `[Gemini ${model}] Analysis not fully implemented.`,
      insights: [],
      recommendations: [],
      confidence: 0,
      dataPoints: Object.keys(params.data).length,
      tokensUsed: 0,
    };
  }

  /**
   * 元の AIBrain インスタンスをアクセス
   * 既存の caller 互換性のために必要
   */
  getBaseBrain(): AIBrain {
    return this.baseBrain;
  }

  /**
   * Router を取得
   */
  getRouter(): AIRouter {
    return this.router;
  }

  /**
   * FallbackManager を取得
   */
  getFallbackManager(): FallbackManager {
    return this.fallbackManager;
  }

  /**
   * 利用可能かチェック（元の decide/analyze は可能か）
   */
  get available(): boolean {
    return this.baseBrain.available;
  }
}

// ── エクスポート互換性: シングルトン ──
let enhancedBrainInstance: AIBrainEnhanced | null = null;

/**
 * AIBrainEnhanced シングルトン取得
 * （既存の getAIBrain() と同じシグネチャ）
 */
export function getAIBrainEnhanced(): AIBrainEnhanced {
  if (!enhancedBrainInstance) {
    enhancedBrainInstance = new AIBrainEnhanced();
  }
  return enhancedBrainInstance;
}

/**
 * 既存の AIBrain export との互換性
 * （既存のコードで ai-brain.ts をimportしている場合のため）
 */
export function resetAIBrainEnhanced(): void {
  enhancedBrainInstance = null;
}
