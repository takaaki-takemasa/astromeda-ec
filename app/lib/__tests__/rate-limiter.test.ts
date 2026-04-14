/**
 * Rate Limiter Tests — Immune 2A
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  applyRateLimit,
  getClientIP,
  RATE_LIMIT_PRESETS,
  _resetAllStores,
} from '../rate-limiter';

describe('rate-limiter', () => {
  beforeEach(() => {
    _resetAllStores();
  });

  describe('getClientIP', () => {
    it('should extract cf-connecting-ip', () => {
      const req = new Request('http://localhost/', {
        headers: { 'cf-connecting-ip': '1.2.3.4' },
      });
      expect(getClientIP(req)).toBe('1.2.3.4');
    });

    it('should extract x-forwarded-for (first IP)', () => {
      const req = new Request('http://localhost/', {
        headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
      });
      expect(getClientIP(req)).toBe('10.0.0.1');
    });

    it('should extract x-real-ip', () => {
      const req = new Request('http://localhost/', {
        headers: { 'x-real-ip': '192.168.1.1' },
      });
      expect(getClientIP(req)).toBe('192.168.1.1');
    });

    it('should return unknown when no IP headers', () => {
      const req = new Request('http://localhost/');
      expect(getClientIP(req)).toBe('unknown');
    });

    it('should prefer cf-connecting-ip over x-forwarded-for', () => {
      const req = new Request('http://localhost/', {
        headers: {
          'cf-connecting-ip': '1.1.1.1',
          'x-forwarded-for': '2.2.2.2',
        },
      });
      expect(getClientIP(req)).toBe('1.1.1.1');
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', () => {
      const config = { maxRequests: 5, windowMs: 60000 };
      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit('test-route', '127.0.0.1', config);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }
    });

    it('should reject requests exceeding limit', () => {
      const config = { maxRequests: 3, windowMs: 60000 };
      for (let i = 0; i < 3; i++) {
        checkRateLimit('test-route', '127.0.0.1', config);
      }
      const result = checkRateLimit('test-route', '127.0.0.1', config);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should track different IPs independently', () => {
      const config = { maxRequests: 2, windowMs: 60000 };
      checkRateLimit('route-a', '1.1.1.1', config);
      checkRateLimit('route-a', '1.1.1.1', config);
      const blocked = checkRateLimit('route-a', '1.1.1.1', config);
      expect(blocked.allowed).toBe(false);

      const other = checkRateLimit('route-a', '2.2.2.2', config);
      expect(other.allowed).toBe(true);
    });

    it('should track different routes independently', () => {
      const config = { maxRequests: 1, windowMs: 60000 };
      checkRateLimit('route-a', '1.1.1.1', config);
      const blockedA = checkRateLimit('route-a', '1.1.1.1', config);
      expect(blockedA.allowed).toBe(false);

      const allowedB = checkRateLimit('route-b', '1.1.1.1', config);
      expect(allowedB.allowed).toBe(true);
    });

    it('should provide resetAt timestamp', () => {
      const config = { maxRequests: 5, windowMs: 60000 };
      const before = Date.now();
      const result = checkRateLimit('reset-test', '127.0.0.1', config);
      expect(result.resetAt).toBeGreaterThanOrEqual(before + 60000);
    });
  });

  describe('applyRateLimit', () => {
    it('should return null when allowed', () => {
      const req = new Request('http://localhost/', {
        headers: { 'cf-connecting-ip': '10.0.0.1' },
      });
      const result = applyRateLimit(req, 'test', RATE_LIMIT_PRESETS.public);
      expect(result).toBeNull();
    });

    it('should return 429 response when rate limited', () => {
      const config = { maxRequests: 1, windowMs: 60000 };
      const req = new Request('http://localhost/', {
        headers: { 'cf-connecting-ip': '10.0.0.1' },
      });
      applyRateLimit(req, 'limited', config);
      const result = applyRateLimit(req, 'limited', config);
      expect(result).not.toBeNull();
    });

    it('should use public preset by default', () => {
      const req = new Request('http://localhost/', {
        headers: { 'cf-connecting-ip': '10.0.0.1' },
      });
      // Should allow up to 60 requests
      for (let i = 0; i < 60; i++) {
        const result = applyRateLimit(req, 'default-test');
        expect(result).toBeNull();
      }
      const blocked = applyRateLimit(req, 'default-test');
      expect(blocked).not.toBeNull();
    });
  });

  describe('RATE_LIMIT_PRESETS', () => {
    it('should have all required presets', () => {
      expect(RATE_LIMIT_PRESETS.public).toBeDefined();
      expect(RATE_LIMIT_PRESETS.admin).toBeDefined();
      expect(RATE_LIMIT_PRESETS.submit).toBeDefined();
      expect(RATE_LIMIT_PRESETS.internal).toBeDefined();
      expect(RATE_LIMIT_PRESETS.auth).toBeDefined();
    });

    it('should have reasonable limits', () => {
      expect(RATE_LIMIT_PRESETS.public.maxRequests).toBe(60);
      expect(RATE_LIMIT_PRESETS.admin.maxRequests).toBe(120);
      expect(RATE_LIMIT_PRESETS.submit.maxRequests).toBe(5);
      expect(RATE_LIMIT_PRESETS.auth.maxRequests).toBe(10);
    });
  });

  describe('_resetAllStores', () => {
    it('should clear all rate limit state', () => {
      const config = { maxRequests: 1, windowMs: 60000 };
      checkRateLimit('reset-route', '1.1.1.1', config);
      const blocked = checkRateLimit('reset-route', '1.1.1.1', config);
      expect(blocked.allowed).toBe(false);

      _resetAllStores();

      const allowed = checkRateLimit('reset-route', '1.1.1.1', config);
      expect(allowed.allowed).toBe(true);
    });
  });
});
