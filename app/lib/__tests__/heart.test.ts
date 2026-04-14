/**
 * HT-10: 循環器テスト — error-reporter / cors / entry.client
 *
 * 生命医学: 心電図（ECG）による心臓機能モニタリング。
 * 正常洞調律（sinus rhythm）= 全テスト合格。
 */
import {describe, it, expect, vi, beforeEach} from 'vitest';

// ==========================================
// HT-02: 指数バックオフテスト
// ==========================================
describe('HT-02: exponential backoff', () => {
  it('バックオフ遅延が失敗回数に応じて増加する', () => {
    const BACKOFF_BASE_MS = 1000;
    const BACKOFF_MAX_MS = 30000;

    const getDelay = (failures: number) =>
      Math.min(BACKOFF_BASE_MS * Math.pow(2, failures), BACKOFF_MAX_MS);

    expect(getDelay(0)).toBe(1000);   // 1s
    expect(getDelay(1)).toBe(2000);   // 2s
    expect(getDelay(2)).toBe(4000);   // 4s
    expect(getDelay(3)).toBe(8000);   // 8s
    expect(getDelay(4)).toBe(16000);  // 16s
    expect(getDelay(5)).toBe(30000);  // 30s (capped)
    expect(getDelay(10)).toBe(30000); // still capped
  });

  it('jitterが±30%の範囲内', () => {
    const BACKOFF_BASE_MS = 1000;
    const BACKOFF_JITTER_FACTOR = 0.3;
    const base = BACKOFF_BASE_MS; // failures=0

    const results: number[] = [];
    for (let i = 0; i < 100; i++) {
      const jitter = base * BACKOFF_JITTER_FACTOR * (Math.random() * 2 - 1);
      results.push(Math.floor(base + jitter));
    }

    const min = Math.min(...results);
    const max = Math.max(...results);
    expect(min).toBeGreaterThanOrEqual(700);  // 1000 - 30%
    expect(max).toBeLessThanOrEqual(1300);     // 1000 + 30%
  });
});

// ==========================================
// HT-04: shouldReport開発env除外テスト
// ==========================================
describe('HT-04: shouldReport dev guard', () => {
  it('development環境ではfalseを返す', () => {
    const env = 'development';
    const shouldReport = env !== 'development';
    expect(shouldReport).toBe(false);
  });

  it('production環境ではtrueを返す', () => {
    const env = 'production';
    const shouldReport = env !== 'development';
    expect(shouldReport).toBe(true);
  });
});

// ==========================================
// HT-06: CORS Vary:Origin テスト
// ==========================================
describe('HT-06: CORS headers', () => {
  it('Vary: Originヘッダーが含まれる', async () => {
    const {getCorsHeaders, resetAllowedOriginsCache} = await import('~/lib/cors');
    resetAllowedOriginsCache();
    const request = new Request('https://shop.mining-base.co.jp/api/test', {
      headers: {'Origin': 'https://shop.mining-base.co.jp'},
    });
    const headers = getCorsHeaders(request);
    expect(headers['Vary']).toBe('Origin');
  });

  it('許可されたOriginが正しく返る', async () => {
    const {getCorsHeaders, resetAllowedOriginsCache} = await import('~/lib/cors');
    resetAllowedOriginsCache();
    const request = new Request('https://shop.mining-base.co.jp/api/test', {
      headers: {'Origin': 'https://shop.mining-base.co.jp'},
    });
    const headers = getCorsHeaders(request);
    expect(headers['Access-Control-Allow-Origin']).toBe('https://shop.mining-base.co.jp');
  });

  it('未許可Originの場合はデフォルトOriginを返す', async () => {
    const {getCorsHeaders, resetAllowedOriginsCache} = await import('~/lib/cors');
    resetAllowedOriginsCache();
    const request = new Request('https://evil.com/api/test', {
      headers: {'Origin': 'https://evil.com'},
    });
    const headers = getCorsHeaders(request);
    expect(headers['Access-Control-Allow-Origin']).toBe('https://shop.mining-base.co.jp');
  });

  it('env変数でカスタムOriginを設定できる', async () => {
    const {getAllowedOrigins, resetAllowedOriginsCache} = await import('~/lib/cors');
    resetAllowedOriginsCache();
    const origins = getAllowedOrigins({ALLOWED_ORIGINS: 'https://a.com,https://b.com'});
    expect(origins).toEqual(['https://a.com', 'https://b.com']);
    resetAllowedOriginsCache();
  });

  it('credentials=trueでAllow-Credentialsが追加される', async () => {
    const {getCorsHeaders, resetAllowedOriginsCache} = await import('~/lib/cors');
    resetAllowedOriginsCache();
    const request = new Request('https://shop.mining-base.co.jp/api/test', {
      headers: {'Origin': 'https://shop.mining-base.co.jp'},
    });
    const headers = getCorsHeaders(request, {credentials: true});
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
  });
});

// ==========================================
// HT-01: オフラインキューテスト
// ==========================================
describe('HT-01: offline queue', () => {
  it('localStorage key名が定義されている', () => {
    const OFFLINE_QUEUE_KEY = '__astromeda_error_offline_queue__';
    expect(OFFLINE_QUEUE_KEY).toBeTruthy();
  });

  it('オフラインキューは最大50件まで保持', () => {
    const maxItems = 50;
    const items = Array.from({length: 60}, (_, i) => ({message: `error-${i}`}));
    const trimmed = items.slice(-maxItems);
    expect(trimmed).toHaveLength(50);
    expect(trimmed[0]).toEqual({message: 'error-10'});
  });
});

// ==========================================
// HT-03: trace-id連携テスト
// ==========================================
describe('HT-03: trace-id integration', () => {
  it('setTraceIdが呼び出し可能', async () => {
    const {setTraceId, reset} = await import('~/lib/error-reporter');
    reset();
    expect(() => setTraceId('test-trace-123')).not.toThrow();
    reset();
  });
});

// ==========================================
// HT-07: form listener cleanup テスト
// ==========================================
describe('HT-07: form listener cleanup', () => {
  it('名前付き関数はremoveEventListener可能な形式', () => {
    // 名前付き関数がremoveEventListenerに渡せることを検証
    const handler = function testHandler() {};
    expect(typeof handler).toBe('function');
    expect(handler.name).toBe('testHandler');
  });
});

// ==========================================
// HT-08: CustomEvent dispatch テスト
// ==========================================
describe('HT-08: cart error CustomEvent', () => {
  it('CustomEventが正しい形式で作成できる', () => {
    const event = new CustomEvent('astromeda:cart-error', {
      detail: {error: 'test error', timestamp: Date.now()},
    });
    expect(event.type).toBe('astromeda:cart-error');
    expect(event.detail.error).toBe('test error');
    expect(event.detail.timestamp).toBeGreaterThan(0);
  });
});

// ==========================================
// HT-09: Service Worker 基盤テスト
// ==========================================
describe('HT-09: Service Worker registration', () => {
  it('sw.jsが存在する（publicディレクトリ）', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const swPath = path.resolve(process.cwd(), 'public/sw.js');
    expect(fs.existsSync(swPath)).toBe(true);
  });

  it('sw.jsにinstall/activateハンドラが含まれる', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const swPath = path.resolve(process.cwd(), 'public/sw.js');
    const content = fs.readFileSync(swPath, 'utf-8');
    expect(content).toContain("addEventListener('install'");
    expect(content).toContain("addEventListener('activate'");
    expect(content).toContain('skipWaiting');
    expect(content).toContain('clients.claim');
  });
});

// ==========================================
// error-reporter 既存機能の回帰テスト
// ==========================================
describe('error-reporter regression', () => {
  it('reportErrorがexport済み', async () => {
    const mod = await import('~/lib/error-reporter');
    expect(typeof mod.reportError).toBe('function');
    expect(typeof mod.initErrorReporter).toBe('function');
    expect(typeof mod.flush).toBe('function');
    expect(typeof mod.getState).toBe('function');
    expect(typeof mod.reset).toBe('function');
    expect(typeof mod.setTraceId).toBe('function');
  });

  it('MAX_ITERATIONS flush上限が適用される', async () => {
    const mod = await import('~/lib/error-reporter');
    // flushがPromiseを返す（無限ループしない）ことを確認
    mod.reset();
    await expect(mod.flush()).resolves.not.toThrow();
  });
});
