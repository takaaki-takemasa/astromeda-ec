/**
 * CORS Utility Tests — Gate 7 (内分泌)
 *
 * オリジン検証・プリフライトレスポンスのテスト:
 * - 許可オリジンの正しいマッチング
 * - 不正オリジンのフォールバック
 * - CORSヘッダーのフィールド完全性
 * - OPTIONSプリフライト応答
 */

import { describe, it, expect } from 'vitest';
import { getCorsHeaders, handlePreflight } from '../cors';

function makeRequest(origin?: string): Request {
  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  return new Request('http://localhost/api/test', { headers });
}

describe('CORS Utility (Gate 7 — 内分泌)', () => {
  describe('getCorsHeaders', () => {
    it('should allow production origin', () => {
      const headers = getCorsHeaders(makeRequest('https://shop.mining-base.co.jp'));
      expect(headers['Access-Control-Allow-Origin']).toBe('https://shop.mining-base.co.jp');
    });

    it('should allow staging origin', () => {
      const headers = getCorsHeaders(makeRequest('https://staging-mining-base.myshopify.com'));
      expect(headers['Access-Control-Allow-Origin']).toBe('https://staging-mining-base.myshopify.com');
    });

    it('should fall back to production origin for unknown origins', () => {
      const headers = getCorsHeaders(makeRequest('https://evil.com'));
      expect(headers['Access-Control-Allow-Origin']).toBe('https://shop.mining-base.co.jp');
    });

    it('should fall back to production origin when Origin header is missing', () => {
      const headers = getCorsHeaders(makeRequest());
      expect(headers['Access-Control-Allow-Origin']).toBe('https://shop.mining-base.co.jp');
    });

    it('should include default methods', () => {
      const headers = getCorsHeaders(makeRequest());
      expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
    });

    it('should allow custom methods', () => {
      const headers = getCorsHeaders(makeRequest(), { methods: 'GET, PUT, DELETE' });
      expect(headers['Access-Control-Allow-Methods']).toBe('GET, PUT, DELETE');
    });

    it('should include Max-Age header', () => {
      const headers = getCorsHeaders(makeRequest());
      expect(headers['Access-Control-Max-Age']).toBe('86400');
    });

    it('should allow custom Max-Age', () => {
      const headers = getCorsHeaders(makeRequest(), { maxAge: 3600 });
      expect(headers['Access-Control-Max-Age']).toBe('3600');
    });

    it('should not include credentials by default', () => {
      const headers = getCorsHeaders(makeRequest());
      expect(headers['Access-Control-Allow-Credentials']).toBeUndefined();
    });

    it('should include credentials when requested', () => {
      const headers = getCorsHeaders(makeRequest(), { credentials: true });
      expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    });
  });

  describe('handlePreflight', () => {
    it('should return 204 status', () => {
      const response = handlePreflight(makeRequest('https://shop.mining-base.co.jp'));
      expect(response.status).toBe(204);
    });

    it('should include CORS headers in preflight response', () => {
      const response = handlePreflight(makeRequest('https://shop.mining-base.co.jp'));
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://shop.mining-base.co.jp');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
    });

    it('should have null body', () => {
      const response = handlePreflight(makeRequest());
      expect(response.body).toBeNull();
    });
  });
});
