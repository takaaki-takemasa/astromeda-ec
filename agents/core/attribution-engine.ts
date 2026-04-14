/**
 * AttributionEngine — 売上帰属エンジン（報酬系）
 *
 * 医学的メタファー: 脳の報酬回路（ドーパミン系）。
 * 「どの行動が成果に繋がったか」を測定し、強化学習の基盤を形成する。
 * 報酬系がないと、どの臓器の働きが生存に貢献しているかわからず、
 * 身体は進化も最適化もできない。
 *
 * マルチタッチ帰属モデル:
 * 1. First Touch — 最初に顧客を獲得したエージェント（UTMソース等）
 * 2. Last Touch — 購入直前のタッチポイント
 * 3. Linear — 全タッチポイントに均等配分
 * 4. Time Decay — 購入に近いほど高い重み
 * 5. Position Based — 最初と最後に40%、中間に20%
 *
 * Agent間接貢献:
 * - SEO改善 → オーガニック流入増 → 売上
 * - 価格最適化 → CVR向上 → 売上
 * - コンテンツ生成 → ページ品質向上 → 滞在時間増 → 売上
 */

import type { StorageRecord, IStorageAdapter } from './storage';
import { getStorage, TABLES } from './storage';
import type { IAgentBus, AgentEvent } from './types';
import { createLogger } from '../core/logger.js';

const log = createLogger('attribution-engine');


// ── 型定義 ──

/** タッチポイント: ユーザーが購入に至るまでの各接触点 */
export interface TouchPoint {
  /** タッチポイントID */
  id: string;
  /** セッションID（ブラウザセッション） */
  sessionId: string;
  /** 顧客ID（匿名可） */
  customerId: string;
  /** チャネル: organic, paid, direct, email, social, referral */
  channel: string;
  /** ソース: google, facebook, email_campaign_001, etc. */
  source: string;
  /** メディア: cpc, organic, email, etc. */
  medium: string;
  /** キャンペーン: utm_campaign の値 */
  campaign: string;
  /** 参照エージェントID（どのAgentが生成/最適化したか） */
  agentId?: string;
  /** アクション種別: page_view, add_to_cart, checkout, purchase */
  action: 'page_view' | 'add_to_cart' | 'begin_checkout' | 'purchase' | 'other';
  /** タイムスタンプ */
  timestamp: number;
  /** 追加メタデータ */
  metadata?: Record<string, unknown>;
}

/** 帰属レコード: 特定の注文に対する帰属結果 */
export interface AttributionRecord extends StorageRecord {
  /** 注文ID */
  orderId: string;
  /** 顧客ID */
  customerId: string;
  /** 注文金額（JPY） */
  orderAmount: number;
  /** タッチポイント一覧 */
  touchPoints: TouchPoint[];
  /** 帰属結果（モデル別） */
  attribution: {
    firstTouch: AttributionResult;
    lastTouch: AttributionResult;
    linear: AttributionResult;
    timeDecay: AttributionResult;
    positionBased: AttributionResult;
  };
  /** Agent間接貢献マップ */
  agentContributions: AgentContribution[];
}

/** 帰属結果: 各チャネル/ソースへの帰属割合 */
export interface AttributionResult {
  /** チャネル別帰属額 */
  byChannel: Record<string, number>;
  /** ソース別帰属額 */
  bySource: Record<string, number>;
  /** Agent別帰属額 */
  byAgent: Record<string, number>;
}

/** Agent間接貢献 */
export interface AgentContribution {
  agentId: string;
  agentName: string;
  contributionType: 'direct' | 'indirect';
  /** 推定貢献額（JPY） */
  attributedRevenue: number;
  /** 貢献率（0-1） */
  contributionWeight: number;
  /** 貢献の説明 */
  description: string;
}

/** 帰属サマリー（ダッシュボード用） */
export interface AttributionSummary {
  /** 分析期間 */
  periodDays: number;
  /** 総売上 */
  totalRevenue: number;
  /** 帰属済み注文数 */
  attributedOrders: number;
  /** チャネル別売上（最終タッチ） */
  revenueByChannel: Record<string, number>;
  /** Agent別貢献額 */
  revenueByAgent: Record<string, number>;
  /** トップ5 チャネル */
  topChannels: Array<{ channel: string; revenue: number; share: number }>;
  /** トップ5 Agent */
  topAgents: Array<{ agentId: string; revenue: number; share: number }>;
  /** データソース */
  dataSource: 'storage' | 'fallback';
}

// ── 帰属計算ロジック ──

/**
 * First Touch 帰属: 最初のタッチポイントに100%配分
 */
function computeFirstTouch(touchPoints: TouchPoint[], orderAmount: number): AttributionResult {
  const result: AttributionResult = { byChannel: {}, bySource: {}, byAgent: {} };
  if (touchPoints.length === 0) return result;

  const first = touchPoints[0];
  result.byChannel[first.channel] = orderAmount;
  result.bySource[first.source || first.channel] = orderAmount;
  if (first.agentId) result.byAgent[first.agentId] = orderAmount;

  return result;
}

/**
 * Last Touch 帰属: 最後のタッチポイントに100%配分
 */
function computeLastTouch(touchPoints: TouchPoint[], orderAmount: number): AttributionResult {
  const result: AttributionResult = { byChannel: {}, bySource: {}, byAgent: {} };
  if (touchPoints.length === 0) return result;

  const last = touchPoints[touchPoints.length - 1];
  result.byChannel[last.channel] = orderAmount;
  result.bySource[last.source || last.channel] = orderAmount;
  if (last.agentId) result.byAgent[last.agentId] = orderAmount;

  return result;
}

/**
 * Linear 帰属: 全タッチポイントに均等配分
 */
function computeLinear(touchPoints: TouchPoint[], orderAmount: number): AttributionResult {
  const result: AttributionResult = { byChannel: {}, bySource: {}, byAgent: {} };
  if (touchPoints.length === 0) return result;

  const share = orderAmount / touchPoints.length;
  for (const tp of touchPoints) {
    result.byChannel[tp.channel] = (result.byChannel[tp.channel] || 0) + share;
    const src = tp.source || tp.channel;
    result.bySource[src] = (result.bySource[src] || 0) + share;
    if (tp.agentId) {
      result.byAgent[tp.agentId] = (result.byAgent[tp.agentId] || 0) + share;
    }
  }

  return result;
}

/**
 * Time Decay 帰属: 購入に近いほど高い重み（半減期7日）
 */
function computeTimeDecay(touchPoints: TouchPoint[], orderAmount: number): AttributionResult {
  const result: AttributionResult = { byChannel: {}, bySource: {}, byAgent: {} };
  if (touchPoints.length === 0) return result;

  const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7日
  const purchaseTime = touchPoints[touchPoints.length - 1].timestamp;

  // 各タッチポイントの重みを計算
  const weights: number[] = touchPoints.map(tp => {
    const timeBefore = purchaseTime - tp.timestamp;
    return Math.pow(0.5, timeBefore / HALF_LIFE_MS);
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return result;

  for (let i = 0; i < touchPoints.length; i++) {
    const tp = touchPoints[i];
    const share = (weights[i] / totalWeight) * orderAmount;

    result.byChannel[tp.channel] = (result.byChannel[tp.channel] || 0) + share;
    const src = tp.source || tp.channel;
    result.bySource[src] = (result.bySource[src] || 0) + share;
    if (tp.agentId) {
      result.byAgent[tp.agentId] = (result.byAgent[tp.agentId] || 0) + share;
    }
  }

  return result;
}

/**
 * Position Based 帰属: 最初40%、最後40%、中間20%均等配分
 */
function computePositionBased(touchPoints: TouchPoint[], orderAmount: number): AttributionResult {
  const result: AttributionResult = { byChannel: {}, bySource: {}, byAgent: {} };
  if (touchPoints.length === 0) return result;

  if (touchPoints.length === 1) {
    return computeFirstTouch(touchPoints, orderAmount);
  }

  const firstShare = orderAmount * 0.4;
  const lastShare = orderAmount * 0.4;
  const middleTotal = orderAmount * 0.2;
  const middleCount = Math.max(1, touchPoints.length - 2);
  const middleShare = middleTotal / middleCount;

  function addShare(tp: TouchPoint, amount: number) {
    result.byChannel[tp.channel] = (result.byChannel[tp.channel] || 0) + amount;
    const src = tp.source || tp.channel;
    result.bySource[src] = (result.bySource[src] || 0) + amount;
    if (tp.agentId) {
      result.byAgent[tp.agentId] = (result.byAgent[tp.agentId] || 0) + amount;
    }
  }

  addShare(touchPoints[0], firstShare);
  addShare(touchPoints[touchPoints.length - 1], lastShare);

  for (let i = 1; i < touchPoints.length - 1; i++) {
    addShare(touchPoints[i], middleShare);
  }

  return result;
}

// ── AttributionEngine クラス ──

/** 間接帰属マッピング定義（動的エージェント対応） */
interface IndirectMapping {
  agentId: string;
  agentName: string;
  matchChannel?: string;
  matchAction?: string;
  requireNoAgent?: boolean;
  weight: number;
  description: string;
}

/** デフォルト間接帰属マッピング（新エージェント追加時はここに追記） */
const DEFAULT_INDIRECT_MAPPINGS: IndirectMapping[] = [
  { agentId: 'seo-director', agentName: 'SEODirector', matchChannel: 'organic', requireNoAgent: true, weight: 0.3, description: 'SEO最適化によるオーガニック流入' },
  { agentId: 'content-writer', agentName: 'ContentWriter', matchChannel: 'email', weight: 0.2, description: 'コンテンツ生成によるメール施策効果' },
  { agentId: 'conversion-agent', agentName: 'ConversionAgent', matchAction: 'purchase', weight: 0.15, description: 'チェックアウトフロー最適化' },
  { agentId: 'promotion-agent', agentName: 'PromotionAgent', matchChannel: 'social', weight: 0.2, description: 'SNSキャンペーンによる流入' },
  { agentId: 'promotion-agent', agentName: 'PromotionAgent', matchChannel: 'paid', weight: 0.25, description: '広告キャンペーンによる流入' },
  { agentId: 'product-catalog', agentName: 'ProductCatalog', matchAction: 'add_to_cart', weight: 0.1, description: '商品カタログ最適化による追加率' },
];

export class AttributionEngine {
  private storage: IStorageAdapter;
  private bus: IAgentBus | null = null;
  /** 間接帰属マッピング（動的に追加・変更可能） */
  private indirectMappings: IndirectMapping[] = [...DEFAULT_INDIRECT_MAPPINGS];

  constructor(storage?: IStorageAdapter) {
    this.storage = storage || getStorage();
  }

  /** 間接帰属マッピングを追加（新エージェント対応） */
  addIndirectMapping(mapping: IndirectMapping): void {
    this.indirectMappings.push(mapping);
  }

  /** 間接帰属マッピングを全取得 */
  getIndirectMappings(): IndirectMapping[] {
    return [...this.indirectMappings];
  }

  /** AgentBusに接続して購入イベントを自動追跡 */
  connectBus(bus: IAgentBus): void {
    this.bus = bus;

    // GA4のpurchaseイベントを購読
    bus.subscribe('analytics.purchase', async (event: AgentEvent) => {
      const payload = event.payload as Record<string, unknown>;
      const orderId = (payload.orderId as string) || `order_${Date.now()}`;
      const orderAmount = (payload.orderAmount as number) || 0;
      const customerId = (payload.customerId as string) || 'anonymous';
      const touchPoints = (payload.touchPoints as TouchPoint[]) || [];

      if (orderAmount > 0) {
        await this.recordAttribution(orderId, customerId, orderAmount, touchPoints);
      }
    });

    // Shopify webhook: orders/create を購読
    bus.subscribe('shopify.order.create', async (event: AgentEvent) => {
      const payload = event.payload as Record<string, unknown>;
      const orderId = (payload.orderId as string) || '';
      const orderAmount = (payload.totalPrice as number) || 0;
      const customerId = (payload.customerId as string) || 'anonymous';

      if (orderAmount > 0) {
        // Webhookにはタッチポイント情報がないため、
        // UTMパラメータから推定する
        const channel = (payload.channel as string) || 'direct';
        const source = (payload.source as string) || 'shopify';
        const touchPoints: TouchPoint[] = [{
          id: `tp_${Date.now()}`,
          sessionId: '',
          customerId,
          channel,
          source,
          medium: (payload.medium as string) || '',
          campaign: (payload.campaign as string) || '',
          action: 'purchase',
          timestamp: Date.now(),
        }];

        await this.recordAttribution(orderId, customerId, orderAmount, touchPoints);
      }
    });
  }

  /**
   * 注文の帰属を記録（5モデルで同時計算）
   */
  async recordAttribution(
    orderId: string,
    customerId: string,
    orderAmount: number,
    touchPoints: TouchPoint[],
  ): Promise<AttributionRecord> {
    // タッチポイントを時系列でソート
    const sorted = [...touchPoints].sort((a, b) => a.timestamp - b.timestamp);

    // 5つのモデルで同時計算
    const attribution = {
      firstTouch: computeFirstTouch(sorted, orderAmount),
      lastTouch: computeLastTouch(sorted, orderAmount),
      linear: computeLinear(sorted, orderAmount),
      timeDecay: computeTimeDecay(sorted, orderAmount),
      positionBased: computePositionBased(sorted, orderAmount),
    };

    // Agent間接貢献を推定
    const agentContributions = this.estimateAgentContributions(sorted, orderAmount);

    const record: AttributionRecord = {
      id: `attr_${orderId}_${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      orderId,
      customerId,
      orderAmount,
      touchPoints: sorted,
      attribution,
      agentContributions,
    };

    await this.storage.put(TABLES.ATTRIBUTION, record);

    // Bus通知: 帰属記録完了
    if (this.bus) {
      this.bus.publish({
        id: `evt_attr_${Date.now()}`,
        type: 'attribution.recorded',
        source: 'attribution-engine',
        payload: {
          orderId,
          orderAmount,
          channelCount: Object.keys(attribution.lastTouch.byChannel).length,
          agentContributionCount: agentContributions.length,
        },
        timestamp: Date.now(),
        priority: 'normal',
      });
    }

    return record;
  }

  /**
   * Agent間接貢献を推定
   *
   * タッチポイントにAgentIDが含まれている場合はdirect、
   * 含まれていない場合はチャネルとアクションから推定する。
   */
  private estimateAgentContributions(
    touchPoints: TouchPoint[],
    orderAmount: number,
  ): AgentContribution[] {
    const contributions: AgentContribution[] = [];
    const agentWeights: Map<string, { weight: number; type: 'direct' | 'indirect'; desc: string; name: string }> = new Map();

    for (const tp of touchPoints) {
      if (tp.agentId) {
        // 直接帰属: タッチポイントに明示的にAgent紐付け
        const existing = agentWeights.get(tp.agentId);
        agentWeights.set(tp.agentId, {
          weight: (existing?.weight || 0) + 1,
          type: 'direct',
          desc: `${tp.action} via ${tp.channel}`,
          name: tp.agentId,
        });
      }

      // 間接帰属: チャネル/アクション→Agentマッピング（動的拡張可能）
      for (const mapping of this.indirectMappings) {
        if (mapping.matchChannel && tp.channel !== mapping.matchChannel) continue;
        if (mapping.matchAction && tp.action !== mapping.matchAction) continue;
        if (mapping.requireNoAgent && tp.agentId) continue;

        const w = agentWeights.get(mapping.agentId);
        agentWeights.set(mapping.agentId, {
          weight: (w?.weight || 0) + mapping.weight,
          type: 'indirect',
          desc: mapping.description,
          name: mapping.agentName,
        });
      }
    }

    // 重みを正規化して帰属額を計算
    const totalWeight = Array.from(agentWeights.values()).reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight === 0) return contributions;

    for (const [agentId, info] of agentWeights.entries()) {
      const share = info.weight / totalWeight;
      contributions.push({
        agentId,
        agentName: info.name,
        contributionType: info.type,
        attributedRevenue: Math.round(orderAmount * share),
        contributionWeight: +share.toFixed(3),
        description: info.desc,
      });
    }

    // 貢献額降順
    contributions.sort((a, b) => b.attributedRevenue - a.attributedRevenue);
    return contributions;
  }

  /**
   * 帰属サマリーを取得（ダッシュボード用）
   */
  async getSummary(periodDays = 30): Promise<AttributionSummary> {
    const since = Date.now() - periodDays * 24 * 60 * 60 * 1000;

    let records: AttributionRecord[];
    try {
      records = await this.storage.query<AttributionRecord>(TABLES.ATTRIBUTION, {
        since,
        orderBy: 'createdAt',
        desc: true,
      });
    } catch (err) {
      log.warn('[AttributionEngine] attribution record query failed:', err instanceof Error ? err.message : err);
      records = [];
    }

    if (records.length === 0) {
      return {
        periodDays,
        totalRevenue: 0,
        attributedOrders: 0,
        revenueByChannel: {},
        revenueByAgent: {},
        topChannels: [],
        topAgents: [],
        dataSource: 'fallback',
      };
    }

    const totalRevenue = records.reduce((sum, r) => sum + r.orderAmount, 0);

    // Last Touch モデルでチャネル別集計
    const revenueByChannel: Record<string, number> = {};
    const revenueByAgent: Record<string, number> = {};

    for (const record of records) {
      const lt = record.attribution.lastTouch;
      for (const [ch, amount] of Object.entries(lt.byChannel)) {
        revenueByChannel[ch] = (revenueByChannel[ch] || 0) + amount;
      }

      for (const contrib of record.agentContributions) {
        revenueByAgent[contrib.agentId] = (revenueByAgent[contrib.agentId] || 0) + contrib.attributedRevenue;
      }
    }

    // トップ5 チャネル
    const topChannels = Object.entries(revenueByChannel)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([channel, revenue]) => ({
        channel,
        revenue,
        share: totalRevenue > 0 ? +(revenue / totalRevenue * 100).toFixed(1) : 0,
      }));

    // トップ5 Agent
    const topAgents = Object.entries(revenueByAgent)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([agentId, revenue]) => ({
        agentId,
        revenue,
        share: totalRevenue > 0 ? +(revenue / totalRevenue * 100).toFixed(1) : 0,
      }));

    return {
      periodDays,
      totalRevenue,
      attributedOrders: records.length,
      revenueByChannel,
      revenueByAgent,
      topChannels,
      topAgents,
      dataSource: 'storage',
    };
  }

  /**
   * 特定注文の帰属詳細を取得
   */
  async getOrderAttribution(orderId: string): Promise<AttributionRecord | null> {
    const records = await this.storage.query<AttributionRecord>(TABLES.ATTRIBUTION, {
      where: { orderId },
      limit: 1,
    });
    return records[0] || null;
  }

  /**
   * Agent別貢献ランキング
   */
  async getAgentRanking(periodDays = 30): Promise<Array<{
    agentId: string;
    totalRevenue: number;
    directRevenue: number;
    indirectRevenue: number;
    orderCount: number;
  }>> {
    const since = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    const records = await this.storage.query<AttributionRecord>(TABLES.ATTRIBUTION, { since });

    const agentMap: Map<string, {
      total: number; direct: number; indirect: number; orders: Set<string>;
    }> = new Map();

    for (const record of records) {
      for (const contrib of record.agentContributions) {
        const existing = agentMap.get(contrib.agentId) || {
          total: 0, direct: 0, indirect: 0, orders: new Set<string>(),
        };
        existing.total += contrib.attributedRevenue;
        if (contrib.contributionType === 'direct') {
          existing.direct += contrib.attributedRevenue;
        } else {
          existing.indirect += contrib.attributedRevenue;
        }
        existing.orders.add(record.orderId);
        agentMap.set(contrib.agentId, existing);
      }
    }

    return Array.from(agentMap.entries())
      .map(([agentId, data]) => ({
        agentId,
        totalRevenue: data.total,
        directRevenue: data.direct,
        indirectRevenue: data.indirect,
        orderCount: data.orders.size,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }
}

// ── シングルトン ──

let engineInstance: AttributionEngine | null = null;

export function getAttributionEngine(): AttributionEngine {
  if (!engineInstance) {
    engineInstance = new AttributionEngine();
  }
  return engineInstance;
}

export function resetAttributionEngine(): void {
  engineInstance = null;
}
