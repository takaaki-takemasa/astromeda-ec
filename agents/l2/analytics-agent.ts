/**
 * AnalyticsAgent — L2 アナリティクスエージェント（視覚野）
 *
 * 生体対応: 視覚野（Visual Cortex）- 外部環境の知覚・解釈
 * GA4/GTM/Clarity統合、イベント設計、ヒートマップ追跡、
 * セッションレコーディング分析、CX定量化を実行。
 * DataLeadから指令を受け、ユーザー行動データの収集・分析を担当。
 *
 * 担当タスク: event_tracking, heatmap_analysis, session_analysis, cx_score, funnel_report
 * 所属パイプライン: P03（データ駆動意思決定パイプライン）
 */

import type {
  AgentId,
  AgentEvent,
  CascadeCommand,
  IAgentBus,
} from '../core/types';
import {BaseL2Agent} from './base-l2-agent';
import { GA4Client } from '../data-collection/ga4-client';
import { getStorage } from '../core/storage.js';

interface TrackingEvent {
  eventName: string;
  category: string;
  source: 'ga4' | 'meta_pixel' | 'clarity' | 'custom';
  parameters: Record<string, unknown>;
  timestamp: number;
  sessionId?: string;
  userId?: string;
}

interface HeatmapData {
  pageUrl: string;
  clickCount: number;
  scrollDepthAvg: number; // percentage
  attentionZones: Array<{x: number; y: number; intensity: number}>;
  sampleSize: number;
  period: string;
  generatedAt: number;
}

interface SessionAnalysis {
  sessionId: string;
  duration: number; // ms
  pageViews: number;
  events: number;
  bounced: boolean;
  converted: boolean;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  entryPage: string;
  exitPage: string;
}

interface CXScore {
  overall: number; // 0-100
  components: {
    easeOfUse: number;
    visualAppeal: number;
    performance: number;
    trustAndSecurity: number;
    contentRelevance: number;
  };
  sampleSize: number;
  period: string;
  generatedAt: number;
}

export class AnalyticsAgent extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'analytics-agent',
    name: 'AnalyticsAgent',
    level: 'L2',
    team: 'data',
    version: '1.0.0',
  };

  private events: TrackingEvent[] = [];
  private heatmaps: Map<string, HeatmapData> = new Map();
  private sessions: Map<string, SessionAnalysis> = new Map();
  private cxScoreHistory: CXScore[] = [];
  private readonly MAX_EVENTS = 5000; // BUG#4修正: メモリスパイク防止（10000→5000）
  private readonly MAX_SESSIONS = 2000; // BUG#4修正: 5000→2000
  private ga4Client: GA4Client;
  private cachedCWV: { lcp: number; fid: number; cls: number; inp: number; performanceScore: number } | null = null;
  private cwvCacheExpiry = 0;

  constructor(bus: IAgentBus) {
    super(bus);
    this.ga4Client = new GA4Client({
      propertyId: process.env.GA4_PROPERTY_ID || '',
      serviceAccountKey: process.env.GA4_SERVICE_ACCOUNT_KEY,
    }, bus);
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('analytics.*');
    this.subscribe('tracking.*');
    this.subscribe('schedule.analytics_report');
  }

  protected async onShutdown(): Promise<void> {
    this.events = [];
    this.heatmaps.clear();
    this.sessions.clear();
    this.cxScoreHistory = [];
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type.startsWith('tracking.')) {
      await this.handleTrackingEvent(event);
    } else if (event.type === 'analytics.session.end') {
      await this.handleSessionEnd(event);
    } else if (event.type === 'schedule.analytics_report') {
      await this.generateAnalyticsReport();
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'event_tracking':
        return this.getEventSummary(command.params);
      case 'heatmap_analysis':
        return this.getHeatmapAnalysis(command.params);
      case 'session_analysis':
        return this.getSessionAnalysis(command.params);
      case 'cx_score':
        return this.calculateCXScore();
      case 'funnel_report':
        return this.generateFunnelReport();
      case 'get_status':
        return this.getAnalyticsStatus();
      default:
        return {status: 'unknown_action', action: command.action};
    }
  }

  // ── Core Operations ──

  private async handleTrackingEvent(event: AgentEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown> | undefined;
    if (!payload) return;

    // BUG#1修正: ソース型を明示的に検証（不正値はcustomにフォールバック）
    const validSources: TrackingEvent['source'][] = ['ga4', 'meta_pixel', 'clarity', 'custom'];
    const rawSource = payload.source as string | undefined;
    const source: TrackingEvent['source'] = rawSource && validSources.includes(rawSource as TrackingEvent['source'])
      ? (rawSource as TrackingEvent['source'])
      : 'custom';

    const trackingEvent: TrackingEvent = {
      eventName: (payload.eventName as string) ?? event.type.replace('tracking.', ''),
      category: (payload.category as string) ?? 'general',
      source,
      parameters: payload.parameters as Record<string, unknown> ?? {},
      timestamp: Date.now(),
      sessionId: payload.sessionId as string | undefined,
      userId: payload.userId as string | undefined,
    };

    this.events.push(trackingEvent);
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS);
    }

    // B-02: イベント永続化（プロセス再起動時のデータ消失防止）
    try {
      const storage = getStorage();
      const now = Date.now();
      await storage.put('tracking_events', {
        id: `te_${now}_${Math.random().toString(36).slice(2, 8)}`,
        eventName: trackingEvent.eventName,
        category: trackingEvent.category,
        source: trackingEvent.source,
        parameters: trackingEvent.parameters,
        sessionId: trackingEvent.sessionId ?? '',
        userId: trackingEvent.userId ?? '',
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      // Storage未初期化時（起動直後）はメモリのみ保持 — サイレント
    }
  }

  private async handleSessionEnd(event: AgentEvent): Promise<void> {
    const payload = event.payload as Partial<SessionAnalysis> | undefined;
    if (!payload?.sessionId) return;

    const session: SessionAnalysis = {
      sessionId: payload.sessionId,
      duration: payload.duration ?? 0,
      pageViews: payload.pageViews ?? 0,
      events: payload.events ?? 0,
      bounced: payload.bounced ?? (payload.pageViews ?? 0) <= 1,
      converted: payload.converted ?? false,
      deviceType: payload.deviceType ?? 'desktop',
      entryPage: payload.entryPage ?? '/',
      exitPage: payload.exitPage ?? '/',
    };

    this.sessions.set(session.sessionId, session);
    if (this.sessions.size > this.MAX_SESSIONS) {
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey) this.sessions.delete(oldestKey);
    }
  }

  private getEventSummary(params: Record<string, unknown> | undefined): Record<string, unknown> {
    const category = params?.category as string | undefined;
    const source = params?.source as string | undefined;
    const limit = (params?.limit as number) ?? 100;

    let filtered = this.events;
    if (category) filtered = filtered.filter(e => e.category === category);
    if (source) filtered = filtered.filter(e => e.source === source);

    // イベント別集計
    const byEvent: Record<string, number> = {};
    for (const e of filtered) {
      byEvent[e.eventName] = (byEvent[e.eventName] ?? 0) + 1;
    }

    // ソース別集計
    const bySource: Record<string, number> = {};
    for (const e of filtered) {
      bySource[e.source] = (bySource[e.source] ?? 0) + 1;
    }

    return {
      totalEvents: filtered.length,
      byEvent,
      bySource,
      recentEvents: filtered.slice(-limit),
    };
  }

  private getHeatmapAnalysis(params: Record<string, unknown> | undefined): Record<string, unknown> {
    const pageUrl = params?.pageUrl as string | undefined;

    if (pageUrl) {
      const heatmap = this.heatmaps.get(pageUrl);
      return heatmap ? {found: true, heatmap} : {found: false, pageUrl};
    }

    return {
      pages: Array.from(this.heatmaps.keys()),
      totalPages: this.heatmaps.size,
    };
  }

  private getSessionAnalysis(params: Record<string, unknown> | undefined): Record<string, unknown> {
    const allSessions = Array.from(this.sessions.values());
    const limit = (params?.limit as number) ?? 50;

    const totalSessions = allSessions.length;
    const bouncedSessions = allSessions.filter(s => s.bounced).length;
    const convertedSessions = allSessions.filter(s => s.converted).length;
    const avgDuration = totalSessions > 0
      ? allSessions.reduce((sum, s) => sum + s.duration, 0) / totalSessions
      : 0;
    const avgPageViews = totalSessions > 0
      ? allSessions.reduce((sum, s) => sum + s.pageViews, 0) / totalSessions
      : 0;

    // デバイス別
    const byDevice: Record<string, number> = {};
    for (const s of allSessions) {
      byDevice[s.deviceType] = (byDevice[s.deviceType] ?? 0) + 1;
    }

    return {
      totalSessions,
      bounceRate: totalSessions > 0 ? (bouncedSessions / totalSessions) * 100 : 0,
      conversionRate: totalSessions > 0 ? (convertedSessions / totalSessions) * 100 : 0,
      avgDuration,
      avgPageViews,
      byDevice,
      recentSessions: allSessions.slice(-limit),
    };
  }

  private async calculateCXScore(): Promise<CXScore> {
    const allSessions = Array.from(this.sessions.values());
    const totalSessions = allSessions.length;

    // セッションデータからCXスコアを算出（ルールベース）
    const bounceRate = totalSessions > 0
      ? allSessions.filter(s => s.bounced).length / totalSessions
      : 0.5;
    const conversionRate = totalSessions > 0
      ? allSessions.filter(s => s.converted).length / totalSessions
      : 0;
    const avgPageViews = totalSessions > 0
      ? allSessions.reduce((sum, s) => sum + s.pageViews, 0) / totalSessions
      : 1;

    // B-01: CWVをGA4Client経由で取得（キャッシュ: 1時間）
    const now = Date.now();
    if (!this.cachedCWV || now > this.cwvCacheExpiry) {
      try {
        const cwvResult = await this.ga4Client.getCoreWebVitals(28);
        if (cwvResult.success && cwvResult.data) {
          this.cachedCWV = cwvResult.data;
          this.cwvCacheExpiry = now + 3600_000; // 1時間キャッシュ
        }
      } catch {
        // CWV取得失敗時はキャッシュ or フォールバック
      }
    }
    const performanceScore = this.cachedCWV?.performanceScore ?? 80;

    const score: CXScore = {
      overall: Math.round(
        (1 - bounceRate) * 25 +
        conversionRate * 30 +
        Math.min(avgPageViews / 5, 1) * 20 +
        25 // ベースライン
      ),
      components: {
        easeOfUse: Math.round((1 - bounceRate) * 100),
        visualAppeal: 70, // Phase 2: ヒートマップデータが充実したら動的計算
        performance: performanceScore, // B-01: GA4 CWVスコア連動
        trustAndSecurity: 85, // SSL + CSP + Security Headers設定済み（v128で全ヘッダー検証合格）
        contentRelevance: Math.round(Math.min(avgPageViews / 3, 1) * 100),
      },
      sampleSize: totalSessions,
      period: 'all_time',
      generatedAt: Date.now(),
    };

    this.cxScoreHistory.push(score);
    if (this.cxScoreHistory.length > 365) {
      this.cxScoreHistory = this.cxScoreHistory.slice(-365);
    }

    return score;
  }

  private async generateFunnelReport(): Promise<Record<string, unknown>> {
    // Eコマースファネル: 閲覧→カート→チェックアウト→購入
    const viewItemEvents = this.events.filter(e => e.eventName === 'view_item').length;
    const addToCartEvents = this.events.filter(e => e.eventName === 'add_to_cart').length;
    const beginCheckoutEvents = this.events.filter(e => e.eventName === 'begin_checkout').length;
    const purchaseEvents = this.events.filter(e => e.eventName === 'purchase').length;

    const funnel = [
      {step: 1, name: '商品閲覧', count: viewItemEvents, rate: 100},
      {
        step: 2, name: 'カート追加', count: addToCartEvents,
        rate: viewItemEvents > 0 ? (addToCartEvents / viewItemEvents) * 100 : 0,
      },
      {
        step: 3, name: 'チェックアウト開始', count: beginCheckoutEvents,
        rate: addToCartEvents > 0 ? (beginCheckoutEvents / addToCartEvents) * 100 : 0,
      },
      {
        step: 4, name: '購入完了', count: purchaseEvents,
        rate: beginCheckoutEvents > 0 ? (purchaseEvents / beginCheckoutEvents) * 100 : 0,
      },
    ];

    const report = {
      funnel,
      overallConversion: viewItemEvents > 0 ? (purchaseEvents / viewItemEvents) * 100 : 0,
      generatedAt: Date.now(),
    };

    await this.publishEvent('analytics.funnel.report', report);
    return report;
  }

  private async generateAnalyticsReport(): Promise<Record<string, unknown>> {
    const eventSummary = this.getEventSummary({});
    const sessionSummary = this.getSessionAnalysis({});
    const cxScore = this.calculateCXScore();
    const funnelReport = await this.generateFunnelReport();

    return {
      events: eventSummary,
      sessions: sessionSummary,
      cxScore,
      funnel: funnelReport,
      generatedAt: Date.now(),
    };
  }

  private getAnalyticsStatus(): Record<string, unknown> {
    return {
      totalEvents: this.events.length,
      totalSessions: this.sessions.size,
      heatmapPages: this.heatmaps.size,
      cxScoreHistory: this.cxScoreHistory.length,
      latestCXScore: this.cxScoreHistory[this.cxScoreHistory.length - 1]?.overall ?? null,
    };
  }
}
