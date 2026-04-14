/**
 * GSC (Google Search Console) API Client — Phase 2-G #G-03
 *
 * 生体対応: 聴覚系（Auditory System）
 * 検索エンジンからの「声」を聞き取り、キーワード・順位・CTRを記録。
 * SEO DirectorとContent Writerが活用するデータソース。
 *
 * 機能:
 *   - 検索パフォーマンスデータ日次取得
 *   - クエリ×ページ別ブレイクダウン
 *   - デバイス別・国別分析
 *   - 順位変動アラート
 *   - バッチ収集 → gsc_daily保存
 */

import type { IAgentBus } from '../core/types';
import type { GSCDailyRecord } from './data-models';

// ── GSC設定 ──

export interface GSCConfig {
  /** サイトURL (e.g., "https://shop.mining-base.co.jp") */
  siteUrl: string;
  /** Google Cloud Service Account Key */
  serviceAccountKey?: string;
  /** API endpoint override */
  apiEndpoint?: string;
  /** バッチサイズ */
  batchDays: number;
  /** 取得行数上限 */
  rowLimit: number;
  /** タイムアウト（ms） */
  timeout: number;
  /** リトライ回数 */
  maxRetries: number;
}

const DEFAULT_GSC_CONFIG: GSCConfig = {
  siteUrl: 'https://shop.mining-base.co.jp',
  batchDays: 7,
  rowLimit: 5000,
  timeout: 30000,
  maxRetries: 3,
};

// ── GSC API Response 型 ──

interface GSCSearchAnalyticsResponse {
  rows?: Array<{
    keys?: string[];
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  }>;
  responseAggregationType?: string;
}

// ── 順位変動アラート ──

export interface RankingChangeAlert {
  query: string;
  page: string;
  previousPosition: number;
  currentPosition: number;
  change: number; // positive = improved, negative = dropped
  severity: 'critical' | 'warning' | 'info';
  date: string;
}

// ── GSC Client ──

export class GSCClient {
  private config: GSCConfig;
  private bus?: IAgentBus;
  private initialized = false;
  private requestCount = 0;
  private errorCount = 0;
  private lastSuccessAt?: number;

  constructor(config: Partial<GSCConfig> = {}, bus?: IAgentBus) {
    this.config = { ...DEFAULT_GSC_CONFIG, ...config };
    this.bus = bus;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    this.lastSuccessAt = Date.now();
    this.emitEvent('gsc.initialized', {
      mode: this.config.serviceAccountKey ? 'live' : 'stub',
      siteUrl: this.config.siteUrl,
    });
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  getHealth() {
    return {
      initialized: this.initialized,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      lastSuccessAt: this.lastSuccessAt,
    };
  }

  // ── 日次データ取得 ──

  async getDailyData(date: string, device?: 'DESKTOP' | 'MOBILE' | 'TABLET'): Promise<GSCDailyRecord[]> {
    this.requestCount++;

    if (!this.initialized) {
      throw new Error('GSCClient not initialized');
    }

    if (!this.config.serviceAccountKey) {
      return this.generateStubData(date, device);
    }

    // 実API呼び出し
    const body: Record<string, unknown> = {
      startDate: date,
      endDate: date,
      dimensions: ['query', 'page', 'device', 'country'],
      rowLimit: this.config.rowLimit,
      dataState: 'final',
    };

    if (device) {
      body.dimensionFilterGroups = [{
        filters: [{ dimension: 'device', expression: device }],
      }];
    }

    const response = await this.callGSCAPI(body);
    return this.parseSearchAnalyticsResponse(response, date);
  }

  // ── バッチ収集 ──

  async batchCollect(startDate: string, endDate: string): Promise<GSCDailyRecord[]> {
    const dates = this.getDateRange(startDate, endDate);
    const allRecords: GSCDailyRecord[] = [];

    for (const date of dates) {
      try {
        const records = await this.getDailyData(date);
        allRecords.push(...records);
        this.emitEvent('gsc.daily_collected', { date, records: records.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emitEvent('gsc.collection_error', { date, error: message });
        this.errorCount++;
      }
    }

    this.emitEvent('gsc.batch_complete', {
      startDate,
      endDate,
      totalRecords: allRecords.length,
      totalClicks: allRecords.reduce((sum, r) => sum + r.clicks, 0),
    });

    return allRecords;
  }

  // ── 順位変動検出 ──

  async detectRankingChanges(
    currentDate: string,
    previousDate: string,
    threshold: number = 3,
  ): Promise<RankingChangeAlert[]> {
    // A-04: try/catch保護 — API障害時でも空配列を返す（免疫応答の堅牢化）
    let current: GSCDailyRecord[];
    let previous: GSCDailyRecord[];
    try {
      current = await this.getDailyData(currentDate);
      previous = await this.getDailyData(previousDate);
    } catch (err) {
      this.errorCount++;
      this.emitEvent('gsc.ranking_check_error', {
        currentDate, previousDate,
        error: err instanceof Error ? err.message : String(err),
      });
      return []; // API障害時は空配列（安全なデフォルト）
    }

    const previousMap = new Map<string, GSCDailyRecord>();
    for (const record of previous) {
      previousMap.set(`${record.query}|${record.page}`, record);
    }

    const alerts: RankingChangeAlert[] = [];

    for (const record of current) {
      const key = `${record.query}|${record.page}`;
      const prev = previousMap.get(key);

      if (!prev) continue;

      const change = prev.position - record.position; // positive = improved
      if (Math.abs(change) >= threshold) {
        let severity: RankingChangeAlert['severity'] = 'info';
        if (Math.abs(change) >= 10) severity = 'critical';
        else if (Math.abs(change) >= 5) severity = 'warning';

        alerts.push({
          query: record.query,
          page: record.page,
          previousPosition: prev.position,
          currentPosition: record.position,
          change,
          severity,
          date: currentDate,
        });
      }
    }

    // 重要度順にソート
    alerts.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    if (alerts.length > 0) {
      this.emitEvent('gsc.ranking_changes_detected', {
        date: currentDate,
        alertCount: alerts.length,
        criticalCount: alerts.filter(a => a.severity === 'critical').length,
      });
    }

    return alerts;
  }

  // ── トップクエリ取得 ──

  async getTopQueries(date: string, limit: number = 20): Promise<Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>> {
    const data = await this.getDailyData(date);

    // クエリごとに集約
    const queryMap = new Map<string, { clicks: number; impressions: number; positions: number[] }>();

    for (const record of data) {
      const existing = queryMap.get(record.query);
      if (existing) {
        existing.clicks += record.clicks;
        existing.impressions += record.impressions;
        existing.positions.push(record.position);
      } else {
        queryMap.set(record.query, {
          clicks: record.clicks,
          impressions: record.impressions,
          positions: [record.position],
        });
      }
    }

    return Array.from(queryMap.entries())
      .map(([query, data]) => ({
        query,
        clicks: data.clicks,
        impressions: data.impressions,
        ctr: data.impressions > 0 ? data.clicks / data.impressions : 0,
        position: data.positions.reduce((a, b) => a + b, 0) / data.positions.length,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, limit);
  }

  // ── Private Helpers ──

  private async callGSCAPI(body: Record<string, unknown>): Promise<GSCSearchAnalyticsResponse> {
    const endpoint = this.config.apiEndpoint
      ?? `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.config.siteUrl)}/searchAnalytics/query`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.getAccessToken()}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`GSC API error: ${response.status} ${response.statusText}`);
    }

    this.lastSuccessAt = Date.now();
    return response.json() as Promise<GSCSearchAnalyticsResponse>;
  }

  private _cachedToken: string | null = null;
  private _tokenExpiresAt: number | null = null;

  private async getAccessToken(): Promise<string> {
    if (!this.config.serviceAccountKey) return '';

    // キャッシュチェック（55分有効）
    if (this._cachedToken && this._tokenExpiresAt && Date.now() < this._tokenExpiresAt) {
      return this._cachedToken;
    }

    // Service Account JSON解析
    let serviceAccount: { private_key: string; client_email: string };
    try {
      serviceAccount = JSON.parse(this.config.serviceAccountKey);
    } catch {
      throw new Error('Invalid GSC_SERVICE_ACCOUNT_KEY: must be valid JSON');
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
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to exchange JWT for access token: ${tokenResponse.status}`);
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string; expires_in: number };
    this._cachedToken = tokenData.access_token;
    this._tokenExpiresAt = Date.now() + (tokenData.expires_in * 1000) - 60000;

    return this._cachedToken;
  }

  private async generateServiceAccountJWT(privateKey: string, clientEmail: string): Promise<string> {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
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
    const keyData = this.parsePEM(privateKeyPem);
    const key = await crypto.subtle.importKey(
      'pkcs8',
      keyData,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const messageEncoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      messageEncoder.encode(message)
    );

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

  private parseSearchAnalyticsResponse(response: GSCSearchAnalyticsResponse, date: string): GSCDailyRecord[] {
    if (!response.rows) return [];
    const now = Date.now();

    return response.rows.map((row, index) => ({
      id: `gsc-${date}-${index}`,
      date,
      query: row.keys?.[0] ?? '',
      page: row.keys?.[1] ?? '',
      device: (row.keys?.[2] ?? 'DESKTOP') as GSCDailyRecord['device'],
      country: row.keys?.[3] ?? 'jpn',
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
      createdAt: now,
      updatedAt: now,
    }));
  }

  private generateStubData(date: string, device?: string): GSCDailyRecord[] {
    const now = Date.now();
    const stubQueries = [
      { query: 'ゲーミングPC', impressions: 5200, clicks: 180, position: 8.3 },
      { query: 'Astromeda', impressions: 3100, clicks: 850, position: 1.2 },
      { query: 'コラボPC', impressions: 2400, clicks: 95, position: 5.7 },
      { query: 'ワンピース PC', impressions: 1800, clicks: 120, position: 3.1 },
      { query: 'ゲーミングPC おすすめ', impressions: 8500, clicks: 210, position: 12.4 },
      { query: 'ナルト PC', impressions: 1200, clicks: 78, position: 4.2 },
      { query: '呪術廻戦 ゲーミングPC', impressions: 950, clicks: 65, position: 2.8 },
      { query: 'mining base', impressions: 2800, clicks: 720, position: 1.1 },
      { query: 'サンリオ PC', impressions: 1100, clicks: 55, position: 6.3 },
      { query: 'ゲーミングPC 安い', impressions: 12000, clicks: 150, position: 18.5 },
      { query: 'ストリートファイター PC', impressions: 800, clicks: 42, position: 3.5 },
      { query: 'hololive PC', impressions: 650, clicks: 38, position: 4.8 },
    ];

    const devices: GSCDailyRecord['device'][] = device
      ? [device as GSCDailyRecord['device']]
      : ['DESKTOP', 'MOBILE'];

    const records: GSCDailyRecord[] = [];
    let idx = 0;

    for (const q of stubQueries) {
      for (const d of devices) {
        const factor = d === 'MOBILE' ? 0.65 : d === 'TABLET' ? 0.15 : 1.0;
        records.push({
          id: `gsc-${date}-${idx++}`,
          date,
          query: q.query,
          page: `https://shop.mining-base.co.jp/collections/${q.query.replace(/\s/g, '-')}`,
          device: d,
          country: 'jpn',
          impressions: Math.round(q.impressions * factor),
          clicks: Math.round(q.clicks * factor),
          ctr: q.clicks / q.impressions,
          position: q.position + (Math.random() * 2 - 1),
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return records;
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

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (!this.bus) return;
    this.bus.publish({
      id: `gsc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      source: 'gsc-client',
      priority: 'normal',
      payload,
      timestamp: Date.now(),
    });
  }
}
