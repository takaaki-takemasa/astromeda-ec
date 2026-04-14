/**
 * PromotionAgent — L2 プロモーション戦略エージェント（誘引受容体）
 *
 * 生体対応: 化学走性受容体（ケモタクシスレセプター）
 * キャンペーン企画、セール日程管理、割引コード生成、キャンペーン効果分析を実行。
 * SalesLeadから指令を受け、顧客誘致と売上増加を促進。
 *
 * 担当タスク: create_campaign, schedule_sale, discount_code_generate, campaign_analytics
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
import { createLogger } from '../core/logger.js';

const log = createLogger('promotion-agent');


interface Campaign {
  id: string;
  name: string;
  type: 'seasonal' | 'flash_sale' | 'bundle' | 'loyalty' | 'clearance';
  startDate: number;
  endDate: number;
  discountRate: number;        // % off
  budget: number;              // JPY
  expectedROI: number;         // %
  status: 'planned' | 'active' | 'completed' | 'paused';
}

interface DiscountCode {
  code: string;
  discountRate: number;
  maxUses: number;
  usedCount: number;
  expiresAt: number;
  campaignId: string;
}

export class PromotionAgent extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'promotion-agent',
    name: 'PromotionAgent',
    level: 'L2',
    team: 'sales',
    version: '1.0.0',
  };

  private campaigns: Map<string, Campaign> = new Map();
  private discountCodes: Map<string, DiscountCode> = new Map();

  constructor(bus: IAgentBus) {
    super(bus);
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('promotion.*');
    this.subscribe('sales.promotion.*');
    this.subscribe('calendar.seasonal_event');

    this.seedDefaultCampaigns();
  }

  protected async onShutdown(): Promise<void> {
    this.campaigns.clear();
    this.discountCodes.clear();
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'calendar.seasonal_event') {
      const eventName = (event.payload as Record<string, unknown>).event;
      await this.publishEvent('promotion.seasonal_campaign_suggestion', {
        event: eventName,
        action: 'proposing_campaign',
      }, 'high');
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'create_campaign':
        return this.createCampaign(command.params);

      case 'schedule_sale':
        return this.scheduleSale(command.params);

      case 'discount_code_generate':
        return this.discountCodeGenerate(command.params);

      case 'campaign_analytics':
        return this.campaignAnalytics(command.params);

      default:
        throw new Error(`PromotionAgent: unknown action "${command.action}"`);
    }
  }

  // ── Core Operations ──

  private seedDefaultCampaigns(): void {
    const defaultCampaign: Campaign = {
      id: 'campaign_001',
      name: 'GWセール',
      type: 'seasonal',
      startDate: Date.now(),
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30日後
      discountRate: 15,
      budget: 500000,
      expectedROI: 250,
      status: 'planned',
    };
    this.campaigns.set(defaultCampaign.id, defaultCampaign);
  }

  private async createCampaign(params: Record<string, unknown>): Promise<Campaign> {
    const name = (params.name as string) ?? 'New Campaign';
    const type = (params.type as Campaign['type']) ?? 'seasonal';
    const discountRate = (params.discountRate as number) ?? 10;
    const budget = (params.budget as number) ?? 300000;

    await this.publishEvent('promotion.campaign_creation.started', { name, type });

    const campaign: Campaign = {
      id: `campaign_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      type,
      startDate: Date.now(),
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      discountRate,
      budget,
      expectedROI: discountRate * 15, // 簡易見積
      status: 'planned',
    };

    this.campaigns.set(campaign.id, campaign);

    await this.publishEvent('promotion.campaign_creation.completed', { campaignId: campaign.id });
    return campaign;
  }

  private async scheduleSale(params: Record<string, unknown>): Promise<{
    scheduled: number;
    saleWindows: Array<{ startDate: number; endDate: number; name: string }>;
  }> {
    const saleType = (params.saleType as string) ?? 'flash_sale';
    const frequencyPerMonth = (params.frequencyPerMonth as number) ?? 2;

    await this.publishEvent('promotion.sale_scheduling.started', { saleType, frequencyPerMonth });

    // Phase 1.5: カレンダーベースのセールスケジューリング
    // 日本のEC市場の主要セールイベントカレンダーに基づく
    const saleWindows: Array<{ startDate: number; endDate: number; name: string }> = [];
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    // 年間セールカレンダー（ゲーミングPC市場向け）
    const annualEvents = [
      { month: 1, day: 1, duration: 5, name: '新春初売りセール' },
      { month: 3, day: 15, duration: 10, name: '新生活応援セール' },
      { month: 5, day: 1, duration: 5, name: 'GWゲーミングフェス' },
      { month: 7, day: 1, duration: 14, name: 'サマーセール' },
      { month: 8, day: 10, duration: 7, name: 'お盆ゲーミング祭' },
      { month: 11, day: 22, duration: 10, name: 'ブラックフライデー' },
      { month: 12, day: 1, duration: 25, name: '年末ホリデーセール' },
    ];

    const currentYear = new Date(now).getFullYear();
    for (const event of annualEvents) {
      const start = new Date(currentYear, event.month - 1, event.day).getTime();
      const end = start + event.duration * DAY_MS;
      // 未来のイベントのみ（or 開催中）
      if (end > now) {
        saleWindows.push({ startDate: start, endDate: end, name: event.name });
      }
    }

    // フラッシュセール（月N回、週末に設定）
    if (saleType === 'flash_sale') {
      for (let i = 0; i < frequencyPerMonth; i++) {
        const weeksAhead = (i + 1) * 2; // 2週間おき
        const flashStart = now + weeksAhead * 7 * DAY_MS;
        // 金曜日に調整（0=日,5=金）
        const flashDate = new Date(flashStart);
        const dayOfWeek = flashDate.getDay();
        const daysToFriday = (5 - dayOfWeek + 7) % 7;
        const adjustedStart = flashStart + daysToFriday * DAY_MS;
        saleWindows.push({
          startDate: adjustedStart,
          endDate: adjustedStart + 3 * DAY_MS, // 金〜日の3日間
          name: `フラッシュセール #${i + 1}`,
        });
      }
    }

    // 開始日順にソート
    saleWindows.sort((a, b) => a.startDate - b.startDate);

    await this.publishEvent('promotion.sale_scheduling.completed', {
      scheduleCount: saleWindows.length,
    });

    return { scheduled: saleWindows.length, saleWindows };
  }

  private async discountCodeGenerate(params: Record<string, unknown>): Promise<{
    codes: DiscountCode[];
    campaignId: string;
  }> {
    const campaignId = (params.campaignId as string) ?? 'campaign_001';
    const quantity = (params.quantity as number) ?? 100;
    const discountRate = (params.discountRate as number) ?? 10;

    await this.publishEvent('promotion.discount_code_generation.started', { campaignId, quantity });

    const codes: DiscountCode[] = [];
    for (let i = 0; i < quantity; i++) {
      const code: DiscountCode = {
        code: `ASTRO${Date.now()}_${String(i).padStart(4, '0')}`,
        discountRate,
        maxUses: 10,
        usedCount: 0,
        expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90日
        campaignId,
      };
      codes.push(code);
      this.discountCodes.set(code.code, code);
    }

    await this.publishEvent('promotion.discount_code_generation.completed', {
      codeCount: codes.length,
      campaignId,
    });

    return { codes, campaignId };
  }

  private async campaignAnalytics(params: Record<string, unknown>): Promise<{
    campaignId: string;
    impressions: number;
    clicks: number;
    conversions: number;
    roi: number;
    revenue: number;
    discountCodeUsage: Array<{ code: string; usedCount: number; revenue: number }>;
    dataSource: 'shopify' | 'fallback';
  }> {
    const campaignId = (params.campaignId as string) ?? 'campaign_001';
    const sinceDays = (params.sinceDays as number) ?? 30;

    await this.publishEvent('promotion.campaign_analytics.started', { campaignId });

    const campaign = this.campaigns.get(campaignId);
    let dataSource: 'shopify' | 'fallback' = 'fallback';
    let revenue = 0;
    let conversions = 0;
    const discountCodeUsage: Array<{ code: string; usedCount: number; revenue: number }> = [];

    // Shopify Admin API から注文データを取得し、割引コード使用状況を分析
    try {
      const admin = getAdminClient();
      if (admin.available) {
        const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
        const orders = await admin.getRecentOrders(250, `created_at:>='${since}'`);

        if (orders.length > 0) {
          dataSource = 'shopify';

          // 割引タグ付き注文を集計
          for (const order of orders) {
            const amount = parseFloat(order.totalPriceSet?.shopMoney?.amount || '0');
            // タグにキャンペーンIDが含まれているか、割引コード使用注文を検出
            const hasDiscount = order.tags?.some((t: string) =>
              t.toLowerCase().includes('discount') || t.toLowerCase().includes('campaign')
            );
            if (hasDiscount) {
              conversions++;
              revenue += amount;
            }
          }

          // キャンペーンのディスカウントコード使用状況を追跡
          for (const [code, dc] of this.discountCodes) {
            if (dc.campaignId === campaignId) {
              discountCodeUsage.push({
                code,
                usedCount: dc.usedCount,
                revenue: dc.usedCount * (campaign?.budget ?? 0) / 100,
              });
            }
          }
        }
      }
    } catch (err) {
      // API失敗時はフォールバック
      log.warn('[PromotionAgent] campaign analytics order fetch failed:', err instanceof Error ? err.message : err);
    }

    // ROI計算: (売上 - 予算) / 予算 × 100
    const budget = campaign?.budget ?? 300000;
    const roi = budget > 0 ? Math.round(((revenue - budget) / budget) * 100) : 0;

    // impressions/clicks は外部Analytics API (GA4等) が必要 — 推定値を使用
    const estimatedImpressions = conversions > 0 ? conversions * 85 : 0; // CVR ~1.2%
    const estimatedClicks = conversions > 0 ? conversions * 12 : 0;      // CTR ~8%

    const result = {
      campaignId,
      impressions: estimatedImpressions,
      clicks: estimatedClicks,
      conversions,
      roi,
      revenue: Math.round(revenue),
      discountCodeUsage,
      dataSource,
    };

    await this.publishEvent('promotion.campaign_analytics.completed', { result });
    return result;
  }
}
