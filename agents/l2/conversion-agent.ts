/**
 * ConversionAgent — L2 コンバージョン最適化エージェント（シナプス接続体）
 *
 * 生体対応: シナプス結合（カートと決済の通路最適化）
 * カート最適化、チェックアウト分析、アップセル最適化、カート放棄分析を実行。
 * SalesLeadから指令を受け、購買フローの効率化と売上最大化を推進。
 *
 * 担当タスク: cart_optimization, checkout_analysis, upsell_optimization, abandonment_analysis
 * 所属パイプライン: P2（売上成長）
 */

import type {
  AgentId,
  AgentEvent,
  CascadeCommand,
  IAgentBus,
} from '../core/types';
import {BaseL2Agent} from './base-l2-agent';
import {getAdminClient} from '../core/shopify-admin';
import {getStorage} from '../core/storage';
import { createLogger } from '../core/logger.js';

const log = createLogger('conversion-agent');


interface ConversionMetric {
  metric: string;
  value: number;
  target: number;
  trend: 'up' | 'down' | 'stable';
}

interface CheckoutStep {
  step: number;
  name: string;
  abandonmentRate: number;     // %
  avgTimeSpent: number;        // seconds
  errorRate: number;           // %
}

export class ConversionAgent extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'conversion-agent',
    name: 'ConversionAgent',
    level: 'L2',
    team: 'sales',
    version: '1.0.0',
  };

  private checkoutSteps: CheckoutStep[] = [];
  private conversionMetrics: Map<string, ConversionMetric> = new Map();

  constructor(bus: IAgentBus) {
    super(bus);
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('conversion.*');
    this.subscribe('sales.conversion.*');
    this.subscribe('cart.abandoned');

    this.seedCheckoutSteps();
  }

  protected async onShutdown(): Promise<void> {
    this.checkoutSteps = [];
    this.conversionMetrics.clear();
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'cart.abandoned') {
      const cartValue = (event.payload as Record<string, unknown>).cartValue;
      await this.publishEvent('conversion.abandonment_detected', {
        cartValue,
        action: 'analyzing_recovery_strategy',
      }, 'high');
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'cart_optimization':
        return this.cartOptimization(command.params);

      case 'checkout_analysis':
        return this.checkoutAnalysis(command.params);

      case 'upsell_optimization':
        return this.upsellOptimization(command.params);

      case 'abandonment_analysis':
        return this.abandonmentAnalysis(command.params);

      default:
        throw new Error(`ConversionAgent: unknown action "${command.action}"`);
    }
  }

  // ── Core Operations ──

  private seedCheckoutSteps(): void {
    this.checkoutSteps = [
      {
        step: 1,
        name: 'Cart Review',
        abandonmentRate: 8,
        avgTimeSpent: 45,
        errorRate: 0,
      },
      {
        step: 2,
        name: 'Shipping',
        abandonmentRate: 15,
        avgTimeSpent: 60,
        errorRate: 2,
      },
      {
        step: 3,
        name: 'Payment',
        abandonmentRate: 25,
        avgTimeSpent: 90,
        errorRate: 5,
      },
      {
        step: 4,
        name: 'Confirmation',
        abandonmentRate: 2,
        avgTimeSpent: 30,
        errorRate: 0,
      },
    ];
  }

  private async cartOptimization(params: Record<string, unknown>): Promise<{
    optimizations: Array<{ issue: string; solution: string; estimatedLift: number }>;
    currentCartValue: number;
    projectedCartValue: number;
  }> {
    const currentCartValue = (params.currentCartValue as number) ?? 0;

    await this.publishEvent('conversion.cart_optimization.started', { currentCartValue });

    // Phase 1.5: ゲーミングPC EC特化のカート最適化提案
    const optimizations: Array<{ issue: string; solution: string; estimatedLift: number }> = [
      {
        issue: 'カート放棄率が高い（支払い段階）',
        solution: '分割払い/後払いオプションを目立つ位置に表示（高額商品のため決済ハードルが高い）',
        estimatedLift: 18,
      },
      {
        issue: 'アクセサリ購入率が低い',
        solution: 'PC本体購入時にマウスパッド・キーボード等のIPコラボアクセサリをセット提案',
        estimatedLift: 12,
      },
      {
        issue: 'カート内での比較検討による離脱',
        solution: 'スペック比較テーブルをカートページに追加し、選択の確信を強化',
        estimatedLift: 8,
      },
    ];

    const totalLift = optimizations.reduce((acc, o) => acc + o.estimatedLift, 0);
    const projectedCartValue = currentCartValue * (1 + totalLift / 100);

    await this.publishEvent('conversion.cart_optimization.completed', { optimizations });
    return { optimizations, currentCartValue, projectedCartValue };
  }

  private async checkoutAnalysis(params: Record<string, unknown>): Promise<{
    steps: CheckoutStep[];
    overallConversionRate: number;
    criticalFrictionPoints: string[];
  }> {
    const analysisType = (params.analysisType as string) ?? 'full';

    await this.publishEvent('conversion.checkout_analysis.started', { analysisType });

    // Phase 2: チェックアウトフロー内のユーザー行動トラッキング・ヒートマップ分析
    // GA4クライアントから実際のファネルデータを取得
    let steps = this.checkoutSteps;
    try {
      // NOTE: GA4統合後、実際のイベントデータを使用
      // 現在はシードデータを使用（event: 'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase'）
      const storage = getStorage();
      const checkoutEvents = await storage.query('SYSTEM_EVENTS', {
        where: { type: 'checkout_funnel_event' },
        limit: 1000,
      });

      if (checkoutEvents.length > 0) {
        // イベントベースのファネル構築
        const stepCounts: Record<string, number> = {
          cart_review: 0,
          shipping: 0,
          payment: 0,
          confirmation: 0,
        };

        for (const event of checkoutEvents) {
          const eventType = (event as Record<string, unknown>).eventType as string;
          if (eventType in stepCounts) {
            stepCounts[eventType]++;
          }
        }

        const baselineCart = stepCounts.cart_review || 100;
        steps = [
          {
            step: 1,
            name: 'Cart Review',
            abandonmentRate: baselineCart > 0 ? Math.round(((baselineCart - (stepCounts.shipping || 0)) / baselineCart) * 100) : 8,
            avgTimeSpent: 45,
            errorRate: 0,
          },
          {
            step: 2,
            name: 'Shipping',
            abandonmentRate: stepCounts.shipping > 0 ? Math.round(((stepCounts.shipping - (stepCounts.payment || 0)) / stepCounts.shipping) * 100) : 15,
            avgTimeSpent: 60,
            errorRate: 2,
          },
          {
            step: 3,
            name: 'Payment',
            abandonmentRate: stepCounts.payment > 0 ? Math.round(((stepCounts.payment - (stepCounts.confirmation || 0)) / stepCounts.payment) * 100) : 25,
            avgTimeSpent: 90,
            errorRate: 5,
          },
          {
            step: 4,
            name: 'Confirmation',
            abandonmentRate: 2,
            avgTimeSpent: 30,
            errorRate: 0,
          },
        ];
      }
    } catch (err) {
      log.warn('[ConversionAgent] checkout funnel event fetch failed:', err instanceof Error ? err.message : err);
    }

    const overallConversionRate = steps.reduce((acc, step) => {
      return acc * (1 - step.abandonmentRate / 100);
    }, 1) * 100;

    const criticalFrictionPoints = steps
      .filter(step => step.abandonmentRate > 15)
      .map(step => step.name);

    await this.publishEvent('conversion.checkout_analysis.completed', {
      conversionRate: overallConversionRate,
      frictionCount: criticalFrictionPoints.length,
    });

    // B-06: Storage.query()結果（steps）を返す。this.checkoutStepsはseedデータなので使わない
    return { steps, overallConversionRate, criticalFrictionPoints };
  }

  private async upsellOptimization(params: Record<string, unknown>): Promise<{
    recommendations: Array<{ product: string; avgIncrease: number; conversionRate: number }>;
    projectedRevenue: number;
    dataSource: string;
  }> {
    const checkoutValue = (params.checkoutValue as number) ?? 150000;

    await this.publishEvent('conversion.upsell_optimization.started', { checkoutValue });

    // Phase 4: Shopify商品データからアップセル候補を生成
    const recommendations: Array<{ product: string; avgIncrease: number; conversionRate: number }> = [];
    let dataSource = 'fallback';

    const admin = getAdminClient();
    if (admin.available) {
      try {
        // ガジェット・アクセサリカテゴリの商品を取得（アップセル候補）
        const gadgets = await admin.getProducts(20, 'product_type:ガジェット OR product_type:アクセサリ');
        dataSource = 'shopify';

        for (const product of gadgets.slice(0, 5)) {
          const price = parseFloat(product.priceRangeV2?.minVariantPrice?.amount || '0');
          if (price > 0 && price < checkoutValue * 0.3) {
            recommendations.push({
              product: product.title,
              avgIncrease: price,
              conversionRate: 15 + Math.round(Math.random() * 10), // Phase 5でA/Bテスト結果に基づく
            });
          }
        }
      } catch (err) {
        log.warn('[ConversionAgent] upsell product fetch failed:', err instanceof Error ? err.message : err);
        dataSource = 'fallback';
      }
    }

    // フォールバック: デフォルト推奨
    if (recommendations.length === 0) {
      recommendations.push(
        { product: '延長保証', avgIncrease: 15000, conversionRate: 18 },
        { product: 'アクセサリバンドル', avgIncrease: 25000, conversionRate: 22 },
      );
    }

    const projectedRevenue = checkoutValue + recommendations.reduce((acc, r) => acc + (r.avgIncrease * r.conversionRate / 100), 0);

    await this.publishEvent('conversion.upsell_optimization.completed', {
      recommendationCount: recommendations.length,
      dataSource,
    });

    return { recommendations, projectedRevenue, dataSource };
  }

  private async abandonmentAnalysis(params: Record<string, unknown>): Promise<{
    totalAbandoned: number;
    recoveryRate: number;
    commonReasons: Array<{ reason: string; frequency: number }>;
    recoveryStrategies: string[];
    completedOrders: number;
    dataSource: string;
  }> {
    const timeWindow = (params.timeWindow as string) ?? '7d';
    const days = timeWindow.endsWith('d') ? parseInt(timeWindow) || 7 : 7;

    await this.publishEvent('conversion.abandonment_analysis.started', { timeWindow, days });

    let completedOrders = 0;
    let dataSource = 'fallback';
    let totalAbandoned = 1250;

    // Phase 4: Shopifyから完了注文数を取得し、放棄率を推定
    const admin = getAdminClient();
    if (admin.available) {
      try {
        const summary = await admin.getOrderSummary(days);
        completedOrders = summary.totalOrders;
        // 業界平均カート放棄率 ~70% から逆算
        totalAbandoned = Math.round(completedOrders * 2.3); // 完了の約2.3倍が放棄
        dataSource = 'shopify';
      } catch (err) {
        log.warn('[ConversionAgent] order summary fetch failed:', err instanceof Error ? err.message : err);
        dataSource = 'fallback';
      }
    }

    const commonReasons: Array<{ reason: string; frequency: number }> = [
      { reason: 'チェックアウト時の予期しないコスト', frequency: 35 },
      { reason: '複雑なチェックアウトフロー', frequency: 28 },
      { reason: '送料が高すぎる', frequency: 22 },
      { reason: '決済エラー', frequency: 15 },
    ];

    const recoveryStrategies = [
      'カート放棄メール（クーポン付き）',
      'SMS リマインダー（割引付き）',
      'カートセーバーオファー（5-10%オフ）',
      'ライブチャット介入',
    ];

    const recoveryRate = completedOrders > 0 && totalAbandoned > 0
      ? +((completedOrders / (completedOrders + totalAbandoned)) * 100).toFixed(1)
      : 18;

    await this.publishEvent('conversion.abandonment_analysis.completed', {
      reasonCount: commonReasons.length,
      dataSource,
    });

    return {
      totalAbandoned,
      recoveryRate,
      commonReasons,
      recoveryStrategies,
      completedOrders,
      dataSource,
    };
  }
}
