/**
 * ErrorMonitor — L2 エラー監視エージェント（痛覚受容器）
 *
 * 生体対応: 侵害受容器（Nociceptor）- 組織損傷の検出
 * エラー率監視、500エラー検出、自動復旧、99.9%稼働率維持を実行。
 * EngineeringLeadから指令を受け、異常の早期検出と自動対処を実施。
 *
 * 担当タスク: monitor_errors, error_report, auto_recovery, uptime_check, alert_config
 * 所属パイプライン: P10（インフラ保守パイプライン）
 */

import type {
  AgentId,
  AgentEvent,
  CascadeCommand,
  IAgentBus,
} from '../core/types';
import {BaseL2Agent} from './base-l2-agent';

type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

interface ErrorRecord {
  id: string;
  message: string;
  stack?: string;
  source: string;
  severity: ErrorSeverity;
  statusCode?: number;
  url?: string;
  timestamp: number;
  resolved: boolean;
  autoRecovered: boolean;
}

interface ErrorRateWindow {
  windowStart: number;
  windowEnd: number;
  totalRequests: number;
  errorCount: number;
  errorRate: number; // percentage
  statusCodes: Record<number, number>;
}

interface UptimeRecord {
  date: string; // YYYY-MM-DD
  uptimePercent: number;
  totalMinutes: number;
  downMinutes: number;
  incidents: number;
}

export class ErrorMonitor extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'error-monitor',
    name: 'ErrorMonitor',
    level: 'L2',
    team: 'engineering',
    version: '1.0.0',
  };

  private errors: ErrorRecord[] = [];
  private rateWindows: ErrorRateWindow[] = [];
  private uptimeRecords: Map<string, UptimeRecord> = new Map();
  private autoRecoveryAttempts = 0;
  private requestCount = 0; // BUG#3修正: 実際のリクエスト数を追跡
  private readonly MAX_ERRORS = 2000; // BUG#4修正: メモリスパイク防止（5000→2000）
  private readonly MAX_RATE_WINDOWS = 1440; // 24h at 1-min intervals
  private readonly ERROR_RATE_THRESHOLD = 1; // 1%以上で警告
  private readonly CRITICAL_ERROR_RATE = 5; // 5%以上でCRITICAL

  constructor(bus: IAgentBus) {
    super(bus);
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('error.*');
    this.subscribe('http.response.error');
    this.subscribe('http.response.success'); // BUG#3修正: 正常リクエストもカウント
    this.subscribe('schedule.error_check');
    this.subscribe('system.error');
  }

  protected async onShutdown(): Promise<void> {
    this.errors = [];
    this.rateWindows = [];
    this.uptimeRecords.clear();
    this.requestCount = 0;
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'http.response.success') {
      this.requestCount++; // BUG#3修正: 正常リクエストもカウント
      this.updateUptimeRecord(false);
      return;
    }
    if (event.type.startsWith('error.') || event.type === 'system.error') {
      this.requestCount++;
      this.updateUptimeRecord(true);
      await this.recordError(event);
    } else if (event.type === 'http.response.error') {
      this.requestCount++;
      this.updateUptimeRecord(true);
      await this.recordHTTPError(event);
    } else if (event.type === 'schedule.error_check') {
      await this.runErrorAnalysis();
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'monitor_errors':
        return this.getRecentErrors(command.params);
      case 'error_report':
        return this.generateErrorReport();
      case 'auto_recovery':
        return this.attemptAutoRecovery(command.params);
      case 'uptime_check':
        return this.getUptimeReport();
      case 'alert_config':
        return this.getAlertConfiguration();
      case 'get_status':
        return this.getMonitorStatus();
      default:
        return {status: 'unknown_action', action: command.action};
    }
  }

  // ── Core Operations ──

  private async recordError(event: AgentEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown> | undefined;
    const error: ErrorRecord = {
      id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      message: (payload?.message as string) ?? event.type,
      stack: payload?.stack as string | undefined,
      source: event.source,
      severity: this.classifySeverity(payload),
      statusCode: payload?.statusCode as number | undefined,
      url: payload?.url as string | undefined,
      timestamp: Date.now(),
      resolved: false,
      autoRecovered: false,
    };

    this.addError(error);

    // CRITICAL エラーは即座通知
    if (error.severity === 'critical') {
      await this.publishEvent('error.critical.detected', {
        errorId: error.id,
        message: error.message,
        source: error.source,
      }, 'critical');
    }
  }

  private async recordHTTPError(event: AgentEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown> | undefined;
    const statusCode = (payload?.statusCode as number) ?? 500;

    const error: ErrorRecord = {
      id: `http_err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      message: `HTTP ${statusCode} Error`,
      source: event.source,
      severity: statusCode >= 500 ? 'error' : 'warning',
      statusCode,
      url: payload?.url as string | undefined,
      timestamp: Date.now(),
      resolved: false,
      autoRecovered: false,
    };

    this.addError(error);
  }

  private classifySeverity(payload: Record<string, unknown> | undefined): ErrorSeverity {
    if (!payload) return 'error';
    const statusCode = payload.statusCode as number | undefined;
    const severity = payload.severity as string | undefined;

    if (severity === 'critical' || statusCode === 503) return 'critical';
    if (statusCode && statusCode >= 500) return 'error';
    if (statusCode && statusCode >= 400) return 'warning';
    if (severity) return severity as ErrorSeverity;
    return 'error';
  }

  private addError(error: ErrorRecord): void {
    this.errors.push(error);
    if (this.errors.length > this.MAX_ERRORS) {
      this.errors = this.errors.slice(-this.MAX_ERRORS);
    }
  }

  private async runErrorAnalysis(): Promise<ErrorRateWindow> {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1分間ウィンドウ
    const windowStart = now - windowMs;

    const recentErrors = this.errors.filter(e => e.timestamp >= windowStart);
    const statusCodes: Record<number, number> = {};
    for (const e of recentErrors) {
      if (e.statusCode) {
        statusCodes[e.statusCode] = (statusCodes[e.statusCode] ?? 0) + 1;
      }
    }

    // BUG#3修正: 推定ではなく実際のリクエスト数で算出
    const totalReqs = Math.max(this.requestCount, 1);
    const window: ErrorRateWindow = {
      windowStart,
      windowEnd: now,
      totalRequests: totalReqs,
      errorCount: recentErrors.length,
      errorRate: recentErrors.length > 0 ? (recentErrors.length / totalReqs) * 100 : 0,
      statusCodes,
    };

    this.rateWindows.push(window);
    if (this.rateWindows.length > this.MAX_RATE_WINDOWS) {
      this.rateWindows = this.rateWindows.slice(-this.MAX_RATE_WINDOWS);
    }

    // エラー率閾値チェック
    if (window.errorRate >= this.CRITICAL_ERROR_RATE) {
      await this.publishEvent('error.rate.critical', {
        errorRate: window.errorRate,
        errorCount: window.errorCount,
        threshold: this.CRITICAL_ERROR_RATE,
      }, 'critical');
    } else if (window.errorRate >= this.ERROR_RATE_THRESHOLD) {
      await this.publishEvent('error.rate.warning', {
        errorRate: window.errorRate,
        errorCount: window.errorCount,
        threshold: this.ERROR_RATE_THRESHOLD,
      }, 'high');
    }

    return window;
  }

  private getRecentErrors(params: Record<string, unknown> | undefined): {errors: ErrorRecord[]; total: number} {
    const limit = (params?.limit as number) ?? 50;
    const severity = params?.severity as ErrorSeverity | undefined;
    const unresolvedOnly = params?.unresolvedOnly as boolean ?? false;

    let filtered = this.errors;
    if (severity) filtered = filtered.filter(e => e.severity === severity);
    if (unresolvedOnly) filtered = filtered.filter(e => !e.resolved);

    return {
      errors: filtered.slice(-limit),
      total: filtered.length,
    };
  }

  private async generateErrorReport(): Promise<Record<string, unknown>> {
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    const recentErrors = this.errors.filter(e => e.timestamp >= last24h);

    const bySeverity: Record<string, number> = {};
    for (const e of recentErrors) {
      bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
    }

    const bySource: Record<string, number> = {};
    for (const e of recentErrors) {
      bySource[e.source] = (bySource[e.source] ?? 0) + 1;
    }

    return {
      period: '24h',
      totalErrors: recentErrors.length,
      bySeverity,
      bySource,
      unresolvedCount: recentErrors.filter(e => !e.resolved).length,
      autoRecoveries: this.autoRecoveryAttempts,
      latestErrorRate: this.rateWindows[this.rateWindows.length - 1]?.errorRate ?? 0,
      generatedAt: now,
    };
  }

  private async attemptAutoRecovery(
    params: Record<string, unknown> | undefined,
  ): Promise<{attempted: boolean; action: string}> {
    const errorId = params?.errorId as string | undefined;
    this.autoRecoveryAttempts++;

    if (errorId) {
      const error = this.errors.find(e => e.id === errorId);
      if (error) {
        error.resolved = true;
        error.autoRecovered = true;
      }
    }

    // 自動復旧アクション通知
    await this.publishEvent('error.recovery.attempted', {
      errorId,
      attemptNumber: this.autoRecoveryAttempts,
    });

    return {attempted: true, action: 'service_restart_notification'};
  }

  private getUptimeReport(): Record<string, unknown> {
    const records = Array.from(this.uptimeRecords.values());
    const avgUptime = records.length > 0
      ? records.reduce((sum, r) => sum + r.uptimePercent, 0) / records.length
      : 100;

    return {
      averageUptime: avgUptime,
      target: 99.9,
      meetsTarget: avgUptime >= 99.9,
      daysTracked: records.length,
      records: records.slice(-30), // 直近30日
    };
  }

  private getAlertConfiguration(): Record<string, unknown> {
    return {
      errorRateWarning: this.ERROR_RATE_THRESHOLD,
      errorRateCritical: this.CRITICAL_ERROR_RATE,
      maxErrorHistory: this.MAX_ERRORS,
      rateWindowInterval: '1 minute',
      uptimeTarget: 99.9,
    };
  }

  // BUG#5修正: 稼働率を実際に記録する（以前はuptimeRecordsが空のまま放置）
  private updateUptimeRecord(isError: boolean): void {
    const today = new Date().toISOString().slice(0, 10);
    let record = this.uptimeRecords.get(today);
    if (!record) {
      record = {date: today, uptimePercent: 100, totalMinutes: 1440, downMinutes: 0, incidents: 0};
      this.uptimeRecords.set(today, record);
    }
    if (isError) {
      record.incidents++;
      // 1エラー = 約0.1分のダウンタイム推定
      record.downMinutes = Math.min(record.downMinutes + 0.1, record.totalMinutes);
      record.uptimePercent = ((record.totalMinutes - record.downMinutes) / record.totalMinutes) * 100;
    }
  }

  private getMonitorStatus(): Record<string, unknown> {
    return {
      totalErrors: this.errors.length,
      unresolvedErrors: this.errors.filter(e => !e.resolved).length,
      rateWindows: this.rateWindows.length,
      autoRecoveries: this.autoRecoveryAttempts,
      latestErrorRate: this.rateWindows[this.rateWindows.length - 1]?.errorRate ?? 0,
    };
  }
}
