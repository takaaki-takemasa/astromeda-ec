/**
 * IP Allowlist Integration Tests — SC-05 検証
 *
 * checkIPAllowlist が verifyAdminAuth と連携して機能することを検証
 * - ADMIN_ALLOWED_IPS未設定時: 全IP許可
 * - IP がアローリストに含まない場合: 403拒否
 * - IP がアローリストに含む場合: null返却（許可）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { checkIPAllowlist, resetIPAllowlistCache, isIPAllowed, isIPAllowlistConfigured } from '../ip-allowlist';

describe('IP Allowlist Integration (SC-05)', () => {
  beforeEach(() => {
    resetIPAllowlistCache();
  });

  describe('checkIPAllowlist', () => {
    it('should return null when ADMIN_ALLOWED_IPS is not set (allow all)', () => {
      const request = new Request('http://localhost/api/admin', {
        headers: { 'CF-Connecting-IP': '192.168.1.100' },
      });
      const env = {}; // ADMIN_ALLOWED_IPS not set

      const result = checkIPAllowlist(request, env);
      expect(result).toBeNull();
    });

    it('should return null when ADMIN_ALLOWED_IPS is empty string (allow all)', () => {
      const request = new Request('http://localhost/api/admin', {
        headers: { 'CF-Connecting-IP': '10.0.0.1' },
      });
      const env = { ADMIN_ALLOWED_IPS: '' };

      const result = checkIPAllowlist(request, env);
      expect(result).toBeNull();
    });

    it('should return 403 Response when IP is not in allowlist', () => {
      const request = new Request('http://localhost/api/admin', {
        headers: { 'CF-Connecting-IP': '203.0.113.50' },
      });
      const env = { ADMIN_ALLOWED_IPS: '192.168.1.1,10.0.0.1' };

      const result = checkIPAllowlist(request, env);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    it('should return 403 with proper JSON structure when IP blocked', async () => {
      const request = new Request('http://localhost/api/admin', {
        headers: { 'CF-Connecting-IP': '203.0.113.50' },
      });
      const env = { ADMIN_ALLOWED_IPS: '192.168.1.1' };

      const result = checkIPAllowlist(request, env);
      expect(result?.status).toBe(403);
      expect(result?.headers.get('Content-Type')).toBe('application/problem+json');

      const body = await result?.json();
      expect(body.type).toBe('/errors/ip-restricted');
      expect(body.title).toBe('IP Not Allowed');
      expect(body.status).toBe(403);
      expect(body.detail).toContain('IPアドレスからのアクセスは許可されていません');
    });

    it('should return null when IP IS in allowlist', () => {
      const request = new Request('http://localhost/api/admin', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' },
      });
      const env = { ADMIN_ALLOWED_IPS: '192.168.1.1,10.0.0.1' };

      const result = checkIPAllowlist(request, env);
      expect(result).toBeNull();
    });

    it('should handle IP from X-Forwarded-For header', () => {
      const request = new Request('http://localhost/api/admin', {
        headers: { 'X-Forwarded-For': '192.168.1.1, 10.0.0.2' },
      });
      const env = { ADMIN_ALLOWED_IPS: '192.168.1.1' };

      const result = checkIPAllowlist(request, env);
      expect(result).toBeNull(); // First IP (192.168.1.1) is in allowlist
    });

    it('should handle case-insensitive IP matching', () => {
      const request = new Request('http://localhost/api/admin', {
        headers: { 'CF-Connecting-IP': '2001:DB8::1' },
      });
      const env = { ADMIN_ALLOWED_IPS: '2001:db8::1' }; // lowercase in config

      const result = checkIPAllowlist(request, env);
      expect(result).toBeNull(); // Should match despite case difference
    });

    it('should trim whitespace from IP list', () => {
      const request = new Request('http://localhost/api/admin', {
        headers: { 'CF-Connecting-IP': '10.0.0.1' },
      });
      const env = { ADMIN_ALLOWED_IPS: '192.168.1.1 , 10.0.0.1 , 172.16.0.1' };

      const result = checkIPAllowlist(request, env);
      expect(result).toBeNull(); // 10.0.0.1 should match after trimming
    });

    it('should return unknown IP when no IP headers present', () => {
      const request = new Request('http://localhost/api/admin'); // No IP headers
      const env = { ADMIN_ALLOWED_IPS: '192.168.1.1' };

      const result = checkIPAllowlist(request, env);
      expect(result?.status).toBe(403); // unknown IP not in allowlist
    });

    it('should cache allowlist and invalidate on env change', () => {
      const request = new Request('http://localhost/api/admin', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' },
      });

      // First call with allowlist A
      let env = { ADMIN_ALLOWED_IPS: '192.168.1.1' };
      let result = checkIPAllowlist(request, env);
      expect(result).toBeNull(); // Allowed

      resetIPAllowlistCache();

      // Second call with allowlist B
      env = { ADMIN_ALLOWED_IPS: '10.0.0.1' };
      result = checkIPAllowlist(request, env);
      expect(result?.status).toBe(403); // Blocked (cache was invalidated)
    });
  });

  describe('isIPAllowed', () => {
    it('should return true when ADMIN_ALLOWED_IPS is not set', () => {
      const env = {};
      const result = isIPAllowed('192.168.1.1', env);
      expect(result).toBe(true);
    });

    it('should return false when IP not in allowlist', () => {
      const env = { ADMIN_ALLOWED_IPS: '10.0.0.1' };
      const result = isIPAllowed('192.168.1.1', env);
      expect(result).toBe(false);
    });

    it('should return true when IP in allowlist', () => {
      const env = { ADMIN_ALLOWED_IPS: '192.168.1.1,10.0.0.1' };
      const result = isIPAllowed('192.168.1.1', env);
      expect(result).toBe(true);
    });

    it('should handle case-insensitive matching', () => {
      const env = { ADMIN_ALLOWED_IPS: '2001:db8::1' };
      const result = isIPAllowed('2001:DB8::1', env);
      expect(result).toBe(true);
    });
  });

  describe('isIPAllowlistConfigured', () => {
    it('should return false when ADMIN_ALLOWED_IPS is not set', () => {
      const env = {};
      const result = isIPAllowlistConfigured(env);
      expect(result).toBe(false);
    });

    it('should return false when ADMIN_ALLOWED_IPS is empty string', () => {
      const env = { ADMIN_ALLOWED_IPS: '' };
      const result = isIPAllowlistConfigured(env);
      expect(result).toBe(false);
    });

    it('should return false when ADMIN_ALLOWED_IPS is only whitespace', () => {
      const env = { ADMIN_ALLOWED_IPS: '   ' };
      const result = isIPAllowlistConfigured(env);
      expect(result).toBe(false);
    });

    it('should return true when ADMIN_ALLOWED_IPS is set with at least one IP', () => {
      const env = { ADMIN_ALLOWED_IPS: '192.168.1.1' };
      const result = isIPAllowlistConfigured(env);
      expect(result).toBe(true);
    });

    it('should return true when ADMIN_ALLOWED_IPS has multiple IPs', () => {
      const env = { ADMIN_ALLOWED_IPS: '192.168.1.1,10.0.0.1,172.16.0.1' };
      const result = isIPAllowlistConfigured(env);
      expect(result).toBe(true);
    });

    it('should return true even with whitespace around IPs', () => {
      const env = { ADMIN_ALLOWED_IPS: '  192.168.1.1 , 10.0.0.1  ' };
      const result = isIPAllowlistConfigured(env);
      expect(result).toBe(true);
    });
  });
});
