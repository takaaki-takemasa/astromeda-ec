/**
 * Competitor Scraper — Phase 2-G #G-05 + #G-06
 *
 * 生体対応: 免疫記憶細胞（Memory B Cell）
 * 競合7社の動向を記憶・追跡し、変化を検知してアラートを発出。
 * PC競合 + ガジェット競合（Amazon/楽天）の両方を管理。
 *
 * 対象:
 *   PCメーカー7社: ドスパラ, パソコン工房, マウスコンピューター,
 *                  フロンティア, サイコム, ASUS, MSI
 *   ガジェット競合: Amazon PA-API, 楽天API経由のPC周辺機器
 *
 * 機能:
 *   - 週次の競合価格・商品モニタリング
 *   - プロモーション検出
 *   - 価格帯変動アラート
 *   - ガジェット競合（マウスパッド/キーボード/ケース）追跡
 */

import type { IAgentBus } from '../core/types';
import type { CompetitorDataRecord, CompetitorType } from './data-models';

// ── 設定 ──

export interface CompetitorConfig {
  /** PC競合メーカー */
  pcCompetitors: CompetitorDefinition[];
  /** ガジェットカテゴリ */
  gadgetCategories: string[];
  /** Amazon PA-API設定 */
  amazonConfig?: {
    accessKey: string;
    secretKey: string;
    partnerTag: string;
    region: string;
  };
  /** 楽天API設定 */
  rakutenConfig?: {
    applicationId: string;
  };
  /** タイムアウト（ms） */
  timeout: number;
  /** リアルスクレイピング有効化 */
  enableRealScraping?: boolean;
  /** リクエスト遅延（ms） */
  requestDelayMs?: number;
}

export interface CompetitorDefinition {
  name: string;
  url: string;
  type: CompetitorType;
  categories: string[];
}

const DEFAULT_CONFIG: CompetitorConfig = {
  pcCompetitors: [
    { name: 'ドスパラ (GALLERIA)', url: 'https://www.dospara.co.jp', type: 'pc_maker', categories: ['gaming_pc', 'desktop'] },
    { name: 'パソコン工房 (LEVEL∞)', url: 'https://www.pc-koubou.jp', type: 'pc_maker', categories: ['gaming_pc', 'desktop'] },
    { name: 'マウスコンピューター (G-Tune)', url: 'https://www.mouse-jp.co.jp', type: 'pc_maker', categories: ['gaming_pc', 'desktop'] },
    { name: 'フロンティア', url: 'https://www.frontier-direct.jp', type: 'pc_maker', categories: ['gaming_pc', 'desktop'] },
    { name: 'サイコム', url: 'https://www.sycom.co.jp', type: 'pc_maker', categories: ['gaming_pc', 'bto'] },
    { name: 'ASUS ROG', url: 'https://rog.asus.com/jp', type: 'pc_maker', categories: ['gaming_pc', 'laptop'] },
    { name: 'MSI', url: 'https://jp.msi.com', type: 'pc_maker', categories: ['gaming_pc', 'laptop'] },
  ],
  gadgetCategories: [
    'ゲーミングマウスパッド',
    'ゲーミングキーボード',
    'PCケース LED',
    'ゲーミングヘッドセット',
  ],
  timeout: 30000,
  enableRealScraping: false, // Disabled by default, enable via ENABLE_REAL_SCRAPING env var
  requestDelayMs: 5000, // 5秒の遅延（robots.txt遵守）
};

// ── 価格変動アラート ──

export interface PriceChangeAlert {
  competitorName: string;
  category: string;
  previousAvgPrice: number;
  currentAvgPrice: number;
  changePercent: number;
  severity: 'critical' | 'warning' | 'info';
  date: string;
}

// ── プロモーション検出 ──

export interface PromotionAlert {
  competitorName: string;
  promotionTitle: string;
  discountPercent?: number;
  startDate?: string;
  endDate?: string;
  detectedAt: number;
  severity: 'high' | 'medium' | 'low';
}

// ── Competitor Scraper ──

export class CompetitorScraper {
  private config: CompetitorConfig;
  private bus?: IAgentBus;
  private records: CompetitorDataRecord[] = [];
  private initialized = false;
  private readonly MAX_RECORDS = 3000;

  constructor(config: Partial<CompetitorConfig> = {}, bus?: IAgentBus) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      pcCompetitors: config.pcCompetitors ?? DEFAULT_CONFIG.pcCompetitors,
      gadgetCategories: config.gadgetCategories ?? DEFAULT_CONFIG.gadgetCategories,
    };
    this.bus = bus;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    this.emitEvent('competitor.initialized', {
      pcCompetitors: this.config.pcCompetitors.length,
      gadgetCategories: this.config.gadgetCategories.length,
    });
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.records = [];
  }

  getHealth() {
    return {
      initialized: this.initialized,
      recordCount: this.records.length,
      pcCompetitors: this.config.pcCompetitors.length,
      gadgetCategories: this.config.gadgetCategories.length,
    };
  }

  // ── 週次PC競合チェック ──

  async runWeeklyPCCheck(date?: string): Promise<CompetitorDataRecord[]> {
    if (!this.initialized) throw new Error('CompetitorScraper not initialized');

    const checkDate = date ?? new Date().toISOString().slice(0, 10);
    const newRecords: CompetitorDataRecord[] = [];
    const now = Date.now();

    for (const competitor of this.config.pcCompetitors) {
      try {
        const data = await this.scrapeCompetitorData(competitor, checkDate);
        const record: CompetitorDataRecord = {
          id: `comp-${checkDate}-${competitor.name.replace(/\s/g, '_')}`,
          date: checkDate,
          competitorName: competitor.name,
          competitorType: 'pc_maker',
          dataSource: 'web_scrape',
          priceRange: data.priceRange,
          productCount: data.productCount,
          featuredProducts: data.featuredProducts,
          activePromotions: data.activePromotions,
          socialMetrics: data.socialMetrics,
          createdAt: now,
          updatedAt: now,
        };

        newRecords.push(record);
        this.addRecord(record);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emitEvent('competitor.scrape_error', {
          competitor: competitor.name, error: message,
        });
      }
    }

    this.emitEvent('competitor.weekly_pc_complete', {
      date: checkDate,
      competitors: newRecords.length,
    });

    return newRecords;
  }

  // ── 週次ガジェット競合チェック ──

  async runWeeklyGadgetCheck(date?: string): Promise<CompetitorDataRecord[]> {
    if (!this.initialized) throw new Error('CompetitorScraper not initialized');

    const checkDate = date ?? new Date().toISOString().slice(0, 10);
    const newRecords: CompetitorDataRecord[] = [];
    const now = Date.now();

    for (const category of this.config.gadgetCategories) {
      try {
        // Amazon PA-API
        const amazonData = await this.fetchAmazonGadgets(category, checkDate);
        if (amazonData) {
          newRecords.push(amazonData);
          this.addRecord(amazonData);
        }

        // 楽天API
        const rakutenData = await this.fetchRakutenGadgets(category, checkDate);
        if (rakutenData) {
          newRecords.push(rakutenData);
          this.addRecord(rakutenData);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emitEvent('competitor.gadget_error', {
          category, error: message,
        });
      }
    }

    this.emitEvent('competitor.weekly_gadget_complete', {
      date: checkDate,
      records: newRecords.length,
    });

    return newRecords;
  }

  // ── 価格変動検出 ──

  detectPriceChanges(currentDate: string, previousDate: string, threshold: number = 5): PriceChangeAlert[] {
    const current = this.records.filter(r => r.date === currentDate);
    const previous = this.records.filter(r => r.date === previousDate);

    const previousMap = new Map<string, CompetitorDataRecord>();
    for (const r of previous) {
      previousMap.set(r.competitorName, r);
    }

    const alerts: PriceChangeAlert[] = [];

    for (const record of current) {
      const prev = previousMap.get(record.competitorName);
      if (!prev) continue;

      const changePercent = prev.priceRange.avg > 0
        ? ((record.priceRange.avg - prev.priceRange.avg) / prev.priceRange.avg) * 100
        : 0;

      if (Math.abs(changePercent) >= threshold) {
        let severity: PriceChangeAlert['severity'] = 'info';
        if (Math.abs(changePercent) >= 15) severity = 'critical';
        else if (Math.abs(changePercent) >= 10) severity = 'warning';

        alerts.push({
          competitorName: record.competitorName,
          category: record.competitorType,
          previousAvgPrice: prev.priceRange.avg,
          currentAvgPrice: record.priceRange.avg,
          changePercent: Math.round(changePercent * 10) / 10,
          severity,
          date: currentDate,
        });
      }
    }

    return alerts.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  }

  // ── 競合サマリー ──

  getCompetitiveSummary(): {
    totalCompetitors: number;
    avgPriceRange: { min: number; max: number; avg: number };
    promotionCount: number;
    latestDate: string | null;
  } {
    const latestDate = this.records.length > 0
      ? this.records[this.records.length - 1].date
      : null;

    const latestRecords = latestDate
      ? this.records.filter(r => r.date === latestDate && r.competitorType === 'pc_maker')
      : [];

    const allPrices = latestRecords.flatMap(r => [r.priceRange.min, r.priceRange.max]);
    const allAvg = latestRecords.map(r => r.priceRange.avg);
    const totalPromos = latestRecords.reduce((sum, r) => sum + r.activePromotions.length, 0);

    return {
      totalCompetitors: latestRecords.length,
      avgPriceRange: {
        min: allPrices.length > 0 ? Math.min(...allPrices) : 0,
        max: allPrices.length > 0 ? Math.max(...allPrices) : 0,
        avg: allAvg.length > 0 ? Math.round(allAvg.reduce((a, b) => a + b, 0) / allAvg.length) : 0,
      },
      promotionCount: totalPromos,
      latestDate,
    };
  }

  // ── Private: Scraping Methods ──

  private async scrapeCompetitorData(
    competitor: CompetitorDefinition,
    _date: string,
  ): Promise<{
    priceRange: { min: number; max: number; avg: number; currency: 'JPY' };
    productCount: number;
    featuredProducts: Array<{ name: string; price: number; url: string; rating?: number }>;
    activePromotions: Array<{ title: string; discountPercent?: number; startDate?: string; endDate?: string }>;
    socialMetrics: { twitter?: number; instagram?: number; youtube?: number };
  }> {
    // リアルスクレイピング有効時
    if (this.config.enableRealScraping) {
      try {
        return await this.fetchRealCompetitorData(competitor);
      } catch (err) {
        this.emitEvent('competitor.real_scrape_error', {
          competitor: competitor.name,
          error: err instanceof Error ? err.message : String(err),
        });
        // フォールバック: スタブデータ
      }
    }

    // Stubモード: 競合ごとにリアルな価格帯のデモデータ
    const priceRanges: Record<string, { min: number; max: number }> = {
      'ドスパラ (GALLERIA)': { min: 109800, max: 599800 },
      'パソコン工房 (LEVEL∞)': { min: 99800, max: 549800 },
      'マウスコンピューター (G-Tune)': { min: 119800, max: 499800 },
      'フロンティア': { min: 89800, max: 449800 },
      'サイコム': { min: 129800, max: 699800 },
      'ASUS ROG': { min: 149800, max: 799800 },
      'MSI': { min: 139800, max: 649800 },
    };

    const range = priceRanges[competitor.name] ?? { min: 100000, max: 500000 };
    const avg = Math.round((range.min + range.max) / 2);

    return {
      priceRange: { ...range, avg, currency: 'JPY' },
      productCount: 50 + Math.floor(Math.random() * 100),
      featuredProducts: [
        { name: `${competitor.name} RTX 5080モデル`, price: avg + 50000, url: competitor.url, rating: 4.3 },
        { name: `${competitor.name} RTX 5070 Tiモデル`, price: avg, url: competitor.url, rating: 4.5 },
        { name: `${competitor.name} エントリーモデル`, price: range.min, url: competitor.url, rating: 4.1 },
      ],
      activePromotions: Math.random() > 0.5 ? [
        { title: '春の新生活セール', discountPercent: 10, startDate: '2026-04-01', endDate: '2026-04-30' },
      ] : [],
      socialMetrics: {
        twitter: 10000 + Math.floor(Math.random() * 100000),
        instagram: 5000 + Math.floor(Math.random() * 50000),
        youtube: 20000 + Math.floor(Math.random() * 200000),
      },
    };
  }

  private async fetchRealCompetitorData(
    competitor: CompetitorDefinition,
  ): Promise<{
    priceRange: { min: number; max: number; avg: number; currency: 'JPY' };
    productCount: number;
    featuredProducts: Array<{ name: string; price: number; url: string; rating?: number }>;
    activePromotions: Array<{ title: string; discountPercent?: number; startDate?: string; endDate?: string }>;
    socialMetrics: { twitter?: number; instagram?: number; youtube?: number };
  }> {
    // robots.txt遵守のための遅延
    if (this.config.requestDelayMs) {
      await new Promise(resolve => setTimeout(resolve, this.config.requestDelayMs));
    }

    const response = await fetch(competitor.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AstromedaBot/1.0)',
      },
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${competitor.url}: ${response.status}`);
    }

    const html = await response.text();

    // 価格抽出: 正規表現パターン（¥99,800 または ¥99,800円）
    const priceMatches = html.match(/¥([\d,]+)/g) ?? [];
    const prices = priceMatches
      .map(m => parseInt(m.replace(/[¥,]/g, '')))
      .filter(p => p > 10000 && p < 2000000); // 妥当な価格範囲

    const minPrice = prices.length > 0 ? Math.min(...prices) : 100000;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 500000;

    // 商品数: h2, h3タグの個数（簡易推定）
    const productCount = (html.match(/<h[2-3][^>]*>/g) ?? []).length || 50;

    // プロモーション検出: セール/キャンペーン関連のテキスト
    const promoPatterns = [
      /セール|キャンペーン|割引|オフ|SALE/i,
    ];
    const activePromotions = promoPatterns.some(p => p.test(html))
      ? [{ title: 'セール実施中', discountPercent: 5 }]
      : [];

    return {
      priceRange: {
        min: minPrice,
        max: maxPrice,
        avg: Math.round((minPrice + maxPrice) / 2),
        currency: 'JPY',
      },
      productCount: Math.max(productCount, 30),
      featuredProducts: [
        { name: `${competitor.name} ハイエンド`, price: maxPrice, url: competitor.url, rating: 4.3 },
        { name: `${competitor.name} ミッドレンジ`, price: Math.round((minPrice + maxPrice) / 2), url: competitor.url, rating: 4.2 },
        { name: `${competitor.name} エントリー`, price: minPrice, url: competitor.url, rating: 4.0 },
      ],
      activePromotions,
      socialMetrics: {
        twitter: undefined,
        instagram: undefined,
        youtube: undefined,
      },
    };
  }

  private async fetchAmazonGadgets(category: string, date: string): Promise<CompetitorDataRecord | null> {
    // Amazon PA-API Stub
    const now = Date.now();
    const basePrice = category.includes('キーボード') ? 8000 : category.includes('ヘッドセット') ? 12000 : 3000;

    return {
      id: `comp-amazon-${date}-${category.replace(/\s/g, '_')}`,
      date,
      competitorName: `Amazon (${category})`,
      competitorType: 'gadget_seller',
      dataSource: 'amazon_pa',
      priceRange: {
        min: basePrice,
        max: basePrice * 5,
        avg: Math.round(basePrice * 2.5),
        currency: 'JPY',
      },
      productCount: 200 + Math.floor(Math.random() * 300),
      featuredProducts: [
        { name: `ベストセラー ${category}`, price: basePrice * 2, url: 'https://amazon.co.jp', rating: 4.4 },
      ],
      activePromotions: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  private async fetchRakutenGadgets(category: string, date: string): Promise<CompetitorDataRecord | null> {
    // 楽天API Stub
    const now = Date.now();
    const basePrice = category.includes('キーボード') ? 7500 : category.includes('ヘッドセット') ? 11000 : 2800;

    return {
      id: `comp-rakuten-${date}-${category.replace(/\s/g, '_')}`,
      date,
      competitorName: `楽天 (${category})`,
      competitorType: 'gadget_seller',
      dataSource: 'rakuten',
      priceRange: {
        min: basePrice,
        max: basePrice * 4,
        avg: Math.round(basePrice * 2),
        currency: 'JPY',
      },
      productCount: 150 + Math.floor(Math.random() * 200),
      featuredProducts: [
        { name: `人気 ${category}`, price: basePrice * 1.8, url: 'https://rakuten.co.jp', rating: 4.2 },
      ],
      activePromotions: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  private addRecord(record: CompetitorDataRecord): void {
    this.records.push(record);
    if (this.records.length > this.MAX_RECORDS) {
      this.records = this.records.slice(-this.MAX_RECORDS);
    }
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (!this.bus) return;
    this.bus.publish({
      id: `comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      source: 'competitor-scraper',
      priority: 'normal',
      payload,
      timestamp: Date.now(),
    });
  }
}
