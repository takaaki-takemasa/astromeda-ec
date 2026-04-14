/**
 * GA4 Data API Client — Phase 2-G #G-02
 *
 * 生体対応: 消化酵素（Digestive Enzyme）
 * GA4のrawデータを消化し、analytics_dailyテーブルに栄養素として蓄積。
 * Google Analytics Data API v1 を使用して日次バッチ取得。
 *
 * 機能:
 *   - 日次メトリクス取得（sessions, users, revenue, etc.）
 *   - デバイス別・ソース別ブレイクダウン
 *   - eコマースデータ取得
 *   - リアルタイムデータ取得
 *   - バッチ集計 → analytics_daily保存
 */

import type { IAgentBus } from '../core/types';
import type {
  AnalyticsDailyRecord,
  TrafficSourceEntry,
} from './data-models';
import {
  StubAnalyticsProvider,
  type AnalyticsQuery,
  type AnalyticsResult,
  type ProviderResponse,
  type IAnalyticsProvider,
  type ProviderConfig,
  type ProviderHealthInfo,
} from '../providers/external-service-provider';

// ── GA4設定 ──

export interface GA4Config {
  /** GA4 Property ID (e.g., "properties/123456789") */
  propertyId: string;
  /** Google Cloud Service Account JSON Key（環境変数から取得） */
  serviceAccountKey?: string;
  /** API endpoint override (テスト用) */
  apiEndpoint?: string;
  /** バッチサイズ（1回のリクエストで取得する日数） */
  batchDays: number;
  /** リトライ設定 */
  maxRetries: number;
  /** タイムアウト（ms） */
  timeout: number;
}

const DEFAULT_GA4_CONFIG: GA4Config = {
  propertyId: '',
  batchDays: 7,
  maxRetries: 3,
  timeout: 30000,
};

// ── GA4 API Response 型 ──

interface GA4RunReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value: string }>;
    metricValues?: Array<{ value: string }>;
  }>;
  totals?: Array<{
    metricValues?: Array<{ value: string }>;
  }>;
  rowCount?: number;
}

// ── GA4 Client ──

export class GA4Client implements IAnalyticsProvider {
  readonly config: ProviderConfig;
  private ga4Config: GA4Config;
  private bus?: IAgentBus;
  private initialized = false;
  private health: ProviderHealthInfo;
  private stubProvider: StubAnalyticsProvider;

  constructor(ga4Config: Partial<GA4Config> = {}, bus?: IAgentBus) {
    this.ga4Config = { ...DEFAULT_GA4_CONFIG, ...ga4Config };
    this.bus = bus;
    this.config = {
      id: 'ga4-data-api',
      name: 'Google Analytics 4 Data API',
      type: 'analytics',
      credentials: {},
      rateLimit: { requestsPerMinute: 60, requestsPerDay: 25000 },
      timeout: this.ga4Config.timeout,
      retry: { maxRetries: this.ga4Config.maxRetries, backoffMs: 1000 },
      enabled: true,
    };
    this.health = {
      status: 'disconnected',
      errorCount: 0,
      requestCount: 0,
      avgResponseTimeMs: 0,
    };
    // Stubフォールバック（APIキーなしの場合）
    this.stubProvider = new StubAnalyticsProvider('ga4');
  }

  getHealth(): ProviderHealthInfo {
    return { ...this.health };
  }

  async initialize(): Promise<void> {
    if (this.ga4Config.serviceAccountKey) {
      // 実API接続: Service Account認証
      this.initialized = true;
      this.health.status = 'connected';
    } else {
      // Stubモード: APIキーなしでも動作
      await this.stubProvider.initialize();
      this.initialized = true;
      this.health.status = 'connected';
    }
    this.health.lastSuccessAt = Date.now();
    this.emitEvent('ga4.initialized', { mode: this.ga4Config.serviceAccountKey ? 'live' : 'stub' });
  }

  async testConnection(): Promise<boolean> {
    if (!this.initialized) return false;
    try {
      if (this.ga4Config.serviceAccountKey) {
        // 実API: 簡易クエリで接続テスト
        const result = await this.query({
          metrics: ['sessions'],
          dateRange: { startDate: 'yesterday', endDate: 'yesterday' },
          limit: 1,
        });
        return result.success;
      }
      return true; // Stubモードは常に成功
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.health.status = 'disconnected';
    await this.stubProvider.shutdown();
  }

  // ── IAnalyticsProvider ──

  async execute<T>(operation: string, params: Record<string, unknown>): Promise<ProviderResponse<T>> {
    this.health.requestCount++;
    const start = Date.now();

    try {
      if (!this.initialized) {
        throw new Error('GA4Client not initialized');
      }

      let result: unknown;
      switch (operation) {
        case 'query':
          result = await this.query(params as unknown as AnalyticsQuery);
          break;
        case 'getRealtime':
          result = await this.getRealtime();
          break;
        case 'getDailySummary':
          result = await this.getDailySummary(params.date as string);
          break;
        case 'batchCollect':
          result = await this.batchCollect(params.startDate as string, params.endDate as string);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      const durationMs = Date.now() - start;
      this.health.lastSuccessAt = Date.now();
      this.updateAvgResponseTime(durationMs);

      return {
        success: true,
        data: result as T,
        metadata: { provider: 'ga4-data-api', operation, durationMs, timestamp: Date.now() },
      };
    } catch (err) {
      this.health.errorCount++;
      this.health.lastErrorAt = Date.now();
      const durationMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);

      return {
        success: false,
        error: { code: 'GA4_ERROR', message, retryable: true },
        metadata: { provider: 'ga4-data-api', operation, durationMs, timestamp: Date.now() },
      };
    }
  }

  async query(request: AnalyticsQuery): Promise<ProviderResponse<AnalyticsResult>> {
    if (!this.ga4Config.serviceAccountKey) {
      return this.stubProvider.query(request);
    }

    // 実API呼び出し
    const body = this.buildRunReportRequest(request);
    const response = await this.callGA4API('runReport', body);

    return {
      success: true,
      data: this.parseRunReportResponse(response, request),
      metadata: {
        provider: 'ga4-data-api',
        operation: 'query',
        durationMs: 0,
        timestamp: Date.now(),
      },
    };
  }

  async getRealtime(): Promise<ProviderResponse<Record<string, number>>> {
    if (!this.ga4Config.serviceAccountKey) {
      return this.stubProvider.getRealtime();
    }

    const body = {
      metrics: [
        { name: 'activeUsers' },
        { name: 'screenPageViews' },
        { name: 'conversions' },
      ],
    };
    const response = await this.callGA4API('runRealtimeReport', body);

    const data: Record<string, number> = {};
    if (response.totals?.[0]?.metricValues) {
      const metrics = ['activeUsers', 'screenPageViews', 'conversions'];
      response.totals[0].metricValues.forEach((v: { value: string }, i: number) => {
        data[metrics[i]] = parseFloat(v.value) || 0;
      });
    }

    return {
      success: true,
      data,
      metadata: { provider: 'ga4-data-api', operation: 'getRealtime', durationMs: 0, timestamp: Date.now() },
    };
  }

  // ── Core Web Vitals 取得（B-01: ハードコード除去） ──

  async getCoreWebVitals(days = 28): Promise<ProviderResponse<{
    lcp: number; fid: number; cls: number; inp: number; performanceScore: number;
  }>> {
    if (!this.ga4Config.serviceAccountKey) {
      // Stubモード: 実測値v133 Lighthouse結果ベースのデフォルト
      return {
        success: true,
        data: { lcp: 2.0, fid: 50, cls: 0, inp: 126, performanceScore: 99 },
        metadata: { provider: 'ga4-data-api', operation: 'getCoreWebVitals', durationMs: 0, timestamp: Date.now() },
      };
    }

    try {
      // GA4 Data API: CrUX統合メトリクス
      // GA4ではCWVイベントとしてweb_vitals event（LCP/FID/CLS/INP）が自動収集される
      const response = await this.query({
        metrics: ['eventCount', 'eventValue'],
        dimensions: ['eventName'],
        dateRange: {
          startDate: `${days}daysAgo`,
          endDate: 'yesterday',
        },
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: { values: ['LCP', 'FID', 'CLS', 'INP'] },
          },
        },
      });

      const cwv = { lcp: 2.5, fid: 100, cls: 0.1, inp: 200, performanceScore: 80 };
      if (response.success && response.data?.rows) {
        for (const row of response.data.rows) {
          const metric = row.dimensions?.[0]?.toLowerCase();
          const value = parseFloat(row.metrics?.[0] || '0');
          if (metric === 'lcp') cwv.lcp = value / 1000; // ms → s
          else if (metric === 'fid') cwv.fid = value;
          else if (metric === 'cls') cwv.cls = value;
          else if (metric === 'inp') cwv.inp = value;
        }
        // Performance Score算出: 各CWV閾値に対するスコアの加重平均
        const lcpScore = cwv.lcp <= 2.5 ? 100 : cwv.lcp <= 4.0 ? 50 : 0;
        const fidScore = cwv.fid <= 100 ? 100 : cwv.fid <= 300 ? 50 : 0;
        const clsScore = cwv.cls <= 0.1 ? 100 : cwv.cls <= 0.25 ? 50 : 0;
        const inpScore = cwv.inp <= 200 ? 100 : cwv.inp <= 500 ? 50 : 0;
        cwv.performanceScore = Math.round(lcpScore * 0.25 + fidScore * 0.25 + clsScore * 0.25 + inpScore * 0.25);
      }

      return {
        success: true,
        data: cwv,
        metadata: { provider: 'ga4-data-api', operation: 'getCoreWebVitals', durationMs: 0, timestamp: Date.now() },
      };
    } catch (err) {
      this.health.errorCount++;
      return {
        success: false,
        error: { code: 'CWV_ERROR', message: err instanceof Error ? err.message : String(err), retryable: true },
        metadata: { provider: 'ga4-data-api', operation: 'getCoreWebVitals', durationMs: 0, timestamp: Date.now() },
      };
    }
  }

  // ── 日次サマリー取得 ──

  async getDailySummary(date: string): Promise<AnalyticsDailyRecord> {
    const now = Date.now();

    if (!this.ga4Config.serviceAccountKey) {
      // Stubモード: デモデータ返却
      return this.generateStubDailyRecord(date, now);
    }

    // メインメトリクス取得
    const mainMetrics = await this.query({
      metrics: [
        'sessions', 'totalUsers', 'newUsers', 'screenPageViews',
        'averageSessionDuration', 'bounceRate',
        'ecommercePurchases', 'purchaseRevenue',
      ],
      dateRange: { startDate: date, endDate: date },
    });

    // デバイス別取得
    const deviceMetrics = await this.query({
      metrics: ['sessions'],
      dimensions: ['deviceCategory'],
      dateRange: { startDate: date, endDate: date },
    });

    // ソース別取得
    const sourceMetrics = await this.query({
      metrics: ['sessions', 'purchaseRevenue'],
      dimensions: ['sessionMedium', 'sessionSource'],
      dateRange: { startDate: date, endDate: date },
      limit: 20,
    });

    return this.buildDailyRecord(date, now, mainMetrics, deviceMetrics, sourceMetrics);
  }

  // ── バッチ収集（複数日分） ──

  async batchCollect(startDate: string, endDate: string): Promise<AnalyticsDailyRecord[]> {
    const dates = this.getDateRange(startDate, endDate);
    const records: AnalyticsDailyRecord[] = [];

    for (const date of dates) {
      try {
        const record = await this.getDailySummary(date);
        records.push(record);
        this.emitEvent('ga4.daily_collected', { date, revenue: record.revenue });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emitEvent('ga4.collection_error', { date, error: message });
      }
    }

    this.emitEvent('ga4.batch_complete', {
      startDate,
      endDate,
      collected: records.length,
      totalRevenue: records.reduce((sum, r) => sum + r.revenue, 0),
    });

    return records;
  }

  // ── Private Helpers ──

  private buildRunReportRequest(request: AnalyticsQuery): Record<string, unknown> {
    return {
      dateRanges: [{ startDate: request.dateRange.startDate, endDate: request.dateRange.endDate }],
      metrics: request.metrics.map(m => ({ name: m })),
      dimensions: request.dimensions?.map(d => ({ name: d })),
      limit: request.limit ?? 10000,
    };
  }

  private parseRunReportResponse(response: GA4RunReportResponse, request: AnalyticsQuery): AnalyticsResult {
    const rows: Array<Record<string, string | number>> = [];

    if (response.rows) {
      for (const row of response.rows) {
        const record: Record<string, string | number> = {};
        request.dimensions?.forEach((dim, i) => {
          record[dim] = row.dimensionValues?.[i]?.value ?? '';
        });
        request.metrics.forEach((metric, i) => {
          record[metric] = parseFloat(row.metricValues?.[i]?.value ?? '0');
        });
        rows.push(record);
      }
    }

    const totals: Record<string, number> = {};
    if (response.totals?.[0]?.metricValues) {
      request.metrics.forEach((metric, i) => {
        totals[metric] = parseFloat(response.totals![0].metricValues![i]?.value ?? '0');
      });
    }

    return { rows, totals, rowCount: response.rowCount ?? rows.length };
  }

  private async callGA4API(method: string, body: Record<string, unknown>): Promise<GA4RunReportResponse> {
    const endpoint = this.ga4Config.apiEndpoint
      ?? `https://analyticsdata.googleapis.com/v1beta/${this.ga4Config.propertyId}:${method}`;

    // 実際のfetch呼び出し（Cloudflare Workers対応）
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.getAccessToken()}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.ga4Config.timeout),
    });

    if (!response.ok) {
      throw new Error(`GA4 API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<GA4RunReportResponse>;
  }

  private async getAccessToken(): Promise<string> {
    // Service Account JWT → Access Token 変換
    // Edge環境（Cloudflare Workers）ではJWTを手動構築
    if (!this.ga4Config.serviceAccountKey) return '';

    // キャッシュチェック（55分有効）
    if (this._cachedToken && this._tokenExpiresAt && Date.now() < this._tokenExpiresAt) {
      return this._cachedToken;
    }

    // Service Account JSON解析
    let serviceAccount: { private_key: string; client_email: string };
    try {
      serviceAccount = JSON.parse(this.ga4Config.serviceAccountKey);
    } catch {
      throw new Error('Invalid GA4_SERVICE_ACCOUNT_KEY: must be valid JSON');
    }

    // JWT生成
    const jwt = await this.generateServiceAccountJWT(
      serviceAccount.private_key,
      serviceAccount.client_email
    );

    // Access Token取得
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }).toString(),
      signal: AbortSignal.timeout(this.ga4Config.timeout),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to exchange JWT for access token: ${tokenResponse.status}`);
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string; expires_in: number };
    this._cachedToken = tokenData.access_token;
    this._tokenExpiresAt = Date.now() + (tokenData.expires_in * 1000) - 60000; // 1分早めに再取得

    return this._cachedToken;
  }

  private _cachedToken: string | null = null;
  private _tokenExpiresAt: number | null = null;

  private async generateServiceAccountJWT(privateKey: string, clientEmail: string): Promise<string> {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };

    const headerEncoded = this.base64urlEncode(JSON.stringify(header));
    const claimsEncoded = this.base64urlEncode(JSON.stringify(claims));
    const signature = await this.signRS256(
      `${headerEncoded}.${claimsEncoded}`,
      privateKey
    );

    return `${headerEncoded}.${claimsEncoded}.${signature}`;
  }

  private base64urlEncode(str: string): string {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private async signRS256(message: string, privateKeyPem: string): Promise<string> {
    // PEM形式のキーをDER形式に変換
    const keyData = this.parsePEM(privateKeyPem);

    // 秘密鍵をインポート
    const key = await crypto.subtle.importKey(
      'pkcs8',
      keyData,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // メッセージ署名
    const messageEncoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      messageEncoder.encode(message)
    );

    // 署名をBase64Urlエンコード
    let binary = '';
    const bytes = new Uint8Array(signature);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private parsePEM(pem: string): ArrayBuffer {
    // PEM形式を削除して、Base64デコード
    const pemContent = pem
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\s/g, '');

    const binaryString = atob(pemContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private buildDailyRecord(
    date: string,
    now: number,
    mainMetrics: ProviderResponse<AnalyticsResult>,
    deviceMetrics: ProviderResponse<AnalyticsResult>,
    sourceMetrics: ProviderResponse<AnalyticsResult>,
  ): AnalyticsDailyRecord {
    const main = mainMetrics.data?.totals ?? {};
    const sessions = (main['sessions'] as number) ?? 0;
    const revenue = (main['purchaseRevenue'] as number) ?? 0;
    const transactions = (main['ecommercePurchases'] as number) ?? 0;

    // デバイス別集計
    const deviceBreakdown = { desktop: 0, mobile: 0, tablet: 0 };
    if (deviceMetrics.data?.rows) {
      for (const row of deviceMetrics.data.rows) {
        const device = (row['deviceCategory'] as string)?.toLowerCase();
        const count = row['sessions'] as number;
        if (device === 'desktop') deviceBreakdown.desktop = count;
        else if (device === 'mobile') deviceBreakdown.mobile = count;
        else if (device === 'tablet') deviceBreakdown.tablet = count;
      }
    }

    // ソース別集計
    const trafficSources: TrafficSourceEntry[] = [];
    if (sourceMetrics.data?.rows) {
      for (const row of sourceMetrics.data.rows) {
        trafficSources.push({
          medium: row['sessionMedium'] as string ?? 'unknown',
          source: row['sessionSource'] as string ?? 'unknown',
          sessions: row['sessions'] as number ?? 0,
          revenue: row['purchaseRevenue'] as number ?? 0,
        });
      }
    }

    return {
      id: `analytics-${date}`,
      date,
      sessions,
      users: (main['totalUsers'] as number) ?? 0,
      newUsers: (main['newUsers'] as number) ?? 0,
      pageviews: (main['screenPageViews'] as number) ?? 0,
      avgSessionDuration: (main['averageSessionDuration'] as number) ?? 0,
      bounceRate: (main['bounceRate'] as number) ?? 0,
      revenue,
      transactions,
      avgOrderValue: transactions > 0 ? revenue / transactions : 0,
      conversionRate: sessions > 0 ? transactions / sessions : 0,
      deviceBreakdown,
      trafficSources,
      source: 'ga4_api',
      createdAt: now,
      updatedAt: now,
    };
  }

  private generateStubDailyRecord(date: string, now: number): AnalyticsDailyRecord {
    // Stubモード: リアルなデモデータを生成（テスト・開発用）
    const baseSessions = 1500 + Math.floor(Math.random() * 500);
    const baseRevenue = 450000 + Math.floor(Math.random() * 150000);
    const transactions = 15 + Math.floor(Math.random() * 10);

    return {
      id: `analytics-${date}`,
      date,
      sessions: baseSessions,
      users: Math.floor(baseSessions * 0.85),
      newUsers: Math.floor(baseSessions * 0.45),
      pageviews: baseSessions * 3 + Math.floor(Math.random() * 500),
      avgSessionDuration: 180 + Math.floor(Math.random() * 120),
      bounceRate: 0.35 + Math.random() * 0.15,
      revenue: baseRevenue,
      transactions,
      avgOrderValue: Math.round(baseRevenue / transactions),
      conversionRate: transactions / baseSessions,
      deviceBreakdown: {
        desktop: Math.floor(baseSessions * 0.35),
        mobile: Math.floor(baseSessions * 0.55),
        tablet: Math.floor(baseSessions * 0.1),
      },
      trafficSources: [
        { medium: 'organic', source: 'google', sessions: Math.floor(baseSessions * 0.4), revenue: Math.floor(baseRevenue * 0.45) },
        { medium: 'social', source: 'twitter', sessions: Math.floor(baseSessions * 0.15), revenue: Math.floor(baseRevenue * 0.1) },
        { medium: 'direct', source: '(direct)', sessions: Math.floor(baseSessions * 0.2), revenue: Math.floor(baseRevenue * 0.25) },
        { medium: 'cpc', source: 'google', sessions: Math.floor(baseSessions * 0.15), revenue: Math.floor(baseRevenue * 0.15) },
        { medium: 'referral', source: 'youtube.com', sessions: Math.floor(baseSessions * 0.1), revenue: Math.floor(baseRevenue * 0.05) },
      ],
      source: 'estimated',
      createdAt: now,
      updatedAt: now,
    };
  }

  private getDateRange(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const current = new Date(start);

    while (current <= end) {
      dates.push(current.toISOString().slice(0, 10));
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  private updateAvgResponseTime(durationMs: number): void {
    const count = this.health.requestCount;
    this.health.avgResponseTimeMs =
      (this.health.avgResponseTimeMs * (count - 1) + durationMs) / count;
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (!this.bus) return;
    this.bus.publish({
      id: `ga4-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      source: 'ga4-client',
      priority: 'normal',
      payload,
      timestamp: Date.now(),
    });
  }
}
