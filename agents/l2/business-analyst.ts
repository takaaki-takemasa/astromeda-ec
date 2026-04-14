/**
 * BusinessAnalyst — L2 事業分析エージェント（前頭葉：戦略的思考）
 *
 * 生体対応: 前頭葉（意思決定・長期計画立案）
 * エグゼクティブKPI分析、100億円シミュレーション、チャネルROI、週次PDFレポートを提供。
 * DataLeadから指令を受け、経営層向けインサイトを生成。
 *
 * 担当タスク: executive_kpi, revenue_simulation, channel_roi, weekly_report, dashboard_data
 * 所属パイプライン: P03（データ駆動意思決定パイプライン）
 */

import type {
  AgentId,
  AgentEvent,
  CascadeCommand,
  IAgentBus,
} from '../core/types';
import {BaseL2Agent} from './base-l2-agent';

interface KPISnapshot {
  period: string;
  revenue: number;
  orders: number;
  aov: number; // Average Order Value
  conversionRate: number;
  customerAcquisitionCost: number;
  lifetimeValue: number;
  returnRate: number;
  generatedAt: number;
}

interface ChannelROI {
  channel: string;
  spend: number;
  revenue: number;
  roi: number; // percentage
  roas: number; // Return on Ad Spend
  conversions: number;
  cpa: number; // Cost per Acquisition
}

interface RevenueSimulation {
  targetRevenue: number; // 目標売上（例: 10,000,000,000 = 100億円）
  currentMonthlyRevenue: number;
  requiredGrowthRate: number; // 必要月次成長率%
  projectedMonths: number; // 達成予測月数
  scenarios: {
    name: string;
    monthlyGrowth: number;
    monthsToTarget: number;
    confidence: number;
  }[];
  generatedAt: number;
}

export class BusinessAnalyst extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'business-analyst',
    name: 'BusinessAnalyst',
    level: 'L2',
    team: 'data',
    version: '1.0.0',
  };

  private kpiHistory: KPISnapshot[] = [];
  private channelData: Map<string, ChannelROI> = new Map();
  private simulations: RevenueSimulation[] = [];
  private readonly MAX_KPI_HISTORY = 365; // 1年分

  constructor(bus: IAgentBus) {
    super(bus);
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('analytics.kpi.*');
    this.subscribe('schedule.weekly_report');
    this.subscribe('schedule.monthly_report');
  }

  protected async onShutdown(): Promise<void> {
    this.kpiHistory = [];
    this.channelData.clear();
    this.simulations = [];
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'analytics.kpi.update') {
      await this.handleKPIUpdate(event);
    } else if (event.type === 'schedule.weekly_report') {
      await this.generateWeeklyReport();
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'executive_kpi':
        return this.getExecutiveKPI();
      case 'revenue_simulation':
        return this.runRevenueSimulation(command.params);
      case 'channel_roi':
        return this.analyzeChannelROI();
      case 'weekly_report':
        return this.generateWeeklyReport();
      case 'dashboard_data':
        return this.getDashboardData();
      case 'get_status':
        return this.getAnalystStatus();
      default:
        return {status: 'unknown_action', action: command.action};
    }
  }

  // ── Core Operations ──

  private async handleKPIUpdate(event: AgentEvent): Promise<void> {
    const payload = event.payload as Partial<KPISnapshot> | undefined;
    if (!payload) return;

    const snapshot: KPISnapshot = {
      period: payload.period ?? new Date().toISOString().slice(0, 10),
      revenue: payload.revenue ?? 0,
      orders: payload.orders ?? 0,
      aov: payload.orders && payload.orders > 0 ? (payload.revenue ?? 0) / payload.orders : 0,
      conversionRate: payload.conversionRate ?? 0,
      customerAcquisitionCost: payload.customerAcquisitionCost ?? 0,
      lifetimeValue: payload.lifetimeValue ?? 0,
      returnRate: payload.returnRate ?? 0,
      generatedAt: Date.now(),
    };

    this.kpiHistory.push(snapshot);
    if (this.kpiHistory.length > this.MAX_KPI_HISTORY) {
      this.kpiHistory = this.kpiHistory.slice(-this.MAX_KPI_HISTORY);
    }
  }

  private getExecutiveKPI(): Record<string, unknown> {
    const latest = this.kpiHistory[this.kpiHistory.length - 1];
    const prev = this.kpiHistory.length >= 2 ? this.kpiHistory[this.kpiHistory.length - 2] : null;

    if (!latest) {
      return {status: 'no_data', message: 'KPIデータがまだありません'};
    }

    return {
      current: latest,
      trends: prev ? {
        revenueChange: latest.revenue - prev.revenue,
        revenueChangePercent: prev.revenue > 0 ? ((latest.revenue - prev.revenue) / prev.revenue) * 100 : 0,
        orderChange: latest.orders - prev.orders,
        aovChange: latest.aov - prev.aov,
        conversionChange: latest.conversionRate - prev.conversionRate,
      } : null,
      historyLength: this.kpiHistory.length,
    };
  }

  private runRevenueSimulation(
    params: Record<string, unknown> | undefined,
  ): RevenueSimulation {
    const target = (params?.targetRevenue as number) ?? 10_000_000_000; // デフォルト100億円
    const currentMonthly = (params?.currentMonthlyRevenue as number) ??
      this.estimateCurrentMonthlyRevenue();

    const requiredGrowth = currentMonthly > 0
      ? this.calculateRequiredGrowth(currentMonthly, target)
      : 100;

    // BUG#4修正: 全シナリオで月次ターゲット（年間÷12）を一貫して使用
    const monthlyTarget = target / 12;
    const simulation: RevenueSimulation = {
      targetRevenue: target,
      currentMonthlyRevenue: currentMonthly,
      requiredGrowthRate: requiredGrowth,
      projectedMonths: this.calculateMonthsToTarget(currentMonthly, monthlyTarget, requiredGrowth),
      scenarios: [
        {
          name: '保守的シナリオ（月次5%成長）',
          monthlyGrowth: 5,
          monthsToTarget: this.calculateMonthsToTarget(currentMonthly, monthlyTarget, 5),
          confidence: 0.7,
        },
        {
          name: '基本シナリオ（月次10%成長）',
          monthlyGrowth: 10,
          monthsToTarget: this.calculateMonthsToTarget(currentMonthly, monthlyTarget, 10),
          confidence: 0.5,
        },
        {
          name: '積極シナリオ（月次20%成長）',
          monthlyGrowth: 20,
          monthsToTarget: this.calculateMonthsToTarget(currentMonthly, monthlyTarget, 20),
          confidence: 0.3,
        },
      ],
      generatedAt: Date.now(),
    };

    this.simulations.push(simulation);
    if (this.simulations.length > 100) {
      this.simulations = this.simulations.slice(-100);
    }

    return simulation;
  }

  private estimateCurrentMonthlyRevenue(): number {
    // 直近30日のKPIから月次売上を推定
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentKPIs = this.kpiHistory.filter(k => k.generatedAt >= thirtyDaysAgo);
    if (recentKPIs.length === 0) return 0;
    return recentKPIs.reduce((sum, k) => sum + k.revenue, 0);
  }

  private calculateRequiredGrowth(currentMonthly: number, annualTarget: number): number {
    if (currentMonthly <= 0) return 100;
    const monthlyTarget = annualTarget / 12;
    if (currentMonthly >= monthlyTarget) return 0;
    // 複利成長率の逆算: monthlyTarget = currentMonthly * (1 + r)^12
    const ratio = monthlyTarget / currentMonthly;
    return (Math.pow(ratio, 1 / 12) - 1) * 100;
  }

  private calculateMonthsToTarget(current: number, monthlyTarget: number, growthPercent: number): number {
    if (current <= 0 || growthPercent <= 0) return Infinity;
    if (current >= monthlyTarget) return 0;
    // months = log(target/current) / log(1 + growth)
    return Math.ceil(Math.log(monthlyTarget / current) / Math.log(1 + growthPercent / 100));
  }

  private analyzeChannelROI(): ChannelROI[] {
    return Array.from(this.channelData.values());
  }

  private async generateWeeklyReport(): Promise<Record<string, unknown>> {
    const kpi = this.getExecutiveKPI();
    const channels = this.analyzeChannelROI();
    const latestSim = this.simulations[this.simulations.length - 1] ?? null;

    const report = {
      type: 'weekly',
      generatedAt: Date.now(),
      kpiSummary: kpi,
      channelPerformance: channels,
      revenueProgress: latestSim ? {
        target: latestSim.targetRevenue,
        current: latestSim.currentMonthlyRevenue * 12,
        progressPercent: latestSim.targetRevenue > 0
          ? ((latestSim.currentMonthlyRevenue * 12) / latestSim.targetRevenue) * 100
          : 0,
      } : null,
    };

    await this.publishEvent('analytics.report.weekly', report);
    return report;
  }

  private getDashboardData(): Record<string, unknown> {
    return {
      kpi: this.getExecutiveKPI(),
      channels: this.analyzeChannelROI(),
      simulationCount: this.simulations.length,
      kpiHistoryLength: this.kpiHistory.length,
    };
  }

  private getAnalystStatus(): Record<string, unknown> {
    return {
      kpiSnapshots: this.kpiHistory.length,
      channels: this.channelData.size,
      simulations: this.simulations.length,
      lastKPI: this.kpiHistory[this.kpiHistory.length - 1]?.generatedAt ?? null,
    };
  }
}
