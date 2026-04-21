/**
 * CSRF Middleware テスト — Origin/Referer ベース (2026-04-16 移行後)
 *
 * Session ベース CSRF は Oxygen Set-Cookie 制約で動作しなかったため、
 * Origin/Referer header 検証方式に全面置換された。
 *
 * - GET/HEAD/OPTIONS は CSRF チェックをバイパス
 * - POST/PUT/PATCH/DELETE は Origin または Referer が request origin と一致必須
 * - どちらも無いまたは不一致なら 403 Problem+JSON
 */

import { describe, it, expect } from 'vitest';
import { verifyCsrfForAdmin } from '../csrf-middleware';

describe('CSRF Middleware (Origin/Referer ベース)', () => {
  const env = {} as unknown as Env;
  const requestOrigin = 'http://localhost';

  describe('Safe methods bypass', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])(
      'should bypass CSRF check for %s requests',
      async (method) => {
        const request = new Request(`${requestOrigin}/api/test`, { method });
        const result = await verifyCsrfForAdmin(request, env);
        expect(result).toBeNull();
      },
    );
  });

  describe('POST requests without Origin/Referer', () => {
    it('should return 403 for POST without Origin/Referer headers', async () => {
      const request = new Request(`${requestOrigin}/api/test`, { method: 'POST' });
      const result = await verifyCsrfForAdmin(request, env);
      expect(result?.status).toBe(403);
    });

    it('should return Problem+JSON on CSRF failure', async () => {
      const request = new Request(`${requestOrigin}/api/test`, { method: 'POST' });
      const result = await verifyCsrfForAdmin(request, env);
      expect(result?.headers.get('Content-Type')).toBe('application/problem+json');
      const body = await result?.json();
      expect(body.type).toBe('/errors/csrf-validation');
      expect(body.status).toBe(403);
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('POST with matching Origin', () => {
    it('should pass when Origin matches request origin', async () => {
      const request = new Request(`${requestOrigin}/api/test`, {
        method: 'POST',
        headers: { Origin: requestOrigin },
      });
      const result = await verifyCsrfForAdmin(request, env);
      expect(result).toBeNull();
    });

    it('should return 403 when Origin mismatches', async () => {
      const request = new Request(`${requestOrigin}/api/test`, {
        method: 'POST',
        headers: { Origin: 'http://evil.example.com' },
      });
      const result = await verifyCsrfForAdmin(request, env);
      expect(result?.status).toBe(403);
    });
  });

  describe('POST with Referer fallback', () => {
    it('should pass when Origin missing but Referer origin matches', async () => {
      const request = new Request(`${requestOrigin}/api/test`, {
        method: 'POST',
        headers: { Referer: `${requestOrigin}/admin/content` },
      });
      const result = await verifyCsrfForAdmin(request, env);
      expect(result).toBeNull();
    });

    it('should return 403 when Referer origin mismatches', async () => {
      const request = new Request(`${requestOrigin}/api/test`, {
        method: 'POST',
        headers: { Referer: 'http://evil.example.com/page' },
      });
      const result = await verifyCsrfForAdmin(request, env);
      expect(result?.status).toBe(403);
    });

    it('should return 403 when Referer is malformed URL', async () => {
      const request = new Request(`${requestOrigin}/api/test`, {
        method: 'POST',
        headers: { Referer: 'not-a-url' },
      });
      const result = await verifyCsrfForAdmin(request, env);
      expect(result?.status).toBe(403);
    });
  });

  describe('Origin takes precedence over Referer', () => {
    it('should use Origin when both are present', async () => {
      // Origin matches → should pass even if Referer is malicious
      const request = new Request(`${requestOrigin}/api/test`, {
        method: 'POST',
        headers: {
          Origin: requestOrigin,
          Referer: 'http://evil.example.com/page',
        },
      });
      const result = await verifyCsrfForAdmin(request, env);
      expect(result).toBeNull();
    });

    it('should reject when Origin mismatches regardless of Referer', async () => {
      // Origin mismatches → must reject (Referer should not rescue it)
      const request = new Request(`${requestOrigin}/api/test`, {
        method: 'POST',
        headers: {
          Origin: 'http://evil.example.com',
          Referer: `${requestOrigin}/admin/content`,
        },
      });
      const result = await verifyCsrfForAdmin(request, env);
      expect(result?.status).toBe(403);
    });
  });

  describe('All mutation methods', () => {
    it.each(['PUT', 'PATCH', 'DELETE'])(
      'should require Origin/Referer for %s requests',
      async (method) => {
        const request = new Request(`${requestOrigin}/api/test`, { method });
        const result = await verifyCsrfForAdmin(request, env);
        expect(result?.status).toBe(403);
      },
    );

    it.each(['PUT', 'PATCH', 'DELETE'])(
      'should pass %s with matching Origin',
      async (method) => {
        const request = new Request(`${requestOrigin}/api/test`, {
          method,
          headers: { Origin: requestOrigin },
        });
        const result = await verifyCsrfForAdmin(request, env);
        expect(result).toBeNull();
      },
    );
  });
});
