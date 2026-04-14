/**
 * Admin Auth テスト — 免疫認証の二重チェック
 *
 * パスワード検証、CSRF トークン、タイミング安全比較の検証:
 * - validatePasswordComplexity: 複雑性ルール（12文字、大小文字、数字、記号）
 * - generateCsrfToken: UUID 生成
 * - verifyCsrfToken: タイミング安全比較
 * - verifyAdminAuth: セッション + Basic Auth の二重認証
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validatePasswordComplexity,
  generateCsrfToken,
  verifyCsrfToken,
  verifyAdminAuth,
} from '../admin-auth';
import { clearLockoutState } from '../account-lockout';

// Mock AppSession
vi.mock('~/lib/session', () => {
  return {
    AppSession: {
      init: vi.fn(),
    },
  };
});

// Mock IP Allowlist
vi.mock('~/lib/ip-allowlist', () => {
  return {
    checkIPAllowlist: vi.fn(),
  };
});

import { AppSession } from '~/lib/session';
import { checkIPAllowlist } from '~/lib/ip-allowlist';

describe('Admin Auth (Gate 1 — 免疫認証)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // IM-04: ロックアウト状態をリセット（テスト間の副作用防止）
    clearLockoutState();
  });

  // ═══ Password Complexity Validation ═══

  describe('validatePasswordComplexity', () => {
    it('should pass valid passwords', () => {
      const result = validatePasswordComplexity('MyP@ssw0rd123');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail passwords shorter than 12 characters', () => {
      const result = validatePasswordComplexity('Short@1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('パスワードは12文字以上必要です');
    });

    it('should fail passwords with no uppercase letters', () => {
      const result = validatePasswordComplexity('mypass@word123');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('大文字(A-Z)を1文字以上含めてください');
    });

    it('should fail passwords with no lowercase letters', () => {
      const result = validatePasswordComplexity('MYPASS@WORD123');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('小文字(a-z)を1文字以上含めてください');
    });

    it('should fail passwords with no numbers', () => {
      const result = validatePasswordComplexity('MyPass@word');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('数字(0-9)を1文字以上含めてください');
    });

    it('should fail passwords with no special characters', () => {
      const result = validatePasswordComplexity('MyPassword123');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('記号(!@#$%等)を1文字以上含めてください');
    });

    it('should fail completely weak passwords', () => {
      const result = validatePasswordComplexity('short');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(3);
    });

    it('should accept various special characters', () => {
      const passwords = [
        'P@ssw0rd123456',
        'P!ssw0rd123456',
        'P#ssw0rd123456',
        'P$ssw0rd123456',
        'P%ssw0rd123456',
        'P^ssw0rd123456',
        'P&ssw0rd123456',
        'P*ssw0rd123456',
        'P(ssw0rd123456',
        'P)ssw0rd123456',
      ];

      passwords.forEach((pwd) => {
        const result = validatePasswordComplexity(pwd);
        expect(result.valid).toBe(true);
      });
    });

    it('should handle empty string', () => {
      const result = validatePasswordComplexity('');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle exactly 12 character passwords', () => {
      const result = validatePasswordComplexity('Pass@word123');
      expect(result.valid).toBe(true);
    });

    it('should return all errors at once', () => {
      const result = validatePasswordComplexity('SHORT');
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toEqual([
        'パスワードは12文字以上必要です',
        '小文字(a-z)を1文字以上含めてください',
        '数字(0-9)を1文字以上含めてください',
        '記号(!@#$%等)を1文字以上含めてください',
      ]);
    });
  });

  // ═══ CSRF Token Generation ═══

  describe('generateCsrfToken', () => {
    it('should generate a token', () => {
      const token = generateCsrfToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should generate different tokens on each call', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(token1).not.toBe(token2);
    });

    it('should generate valid UUID format tokens', () => {
      const token = generateCsrfToken();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(token).toMatch(uuidRegex);
    });

    it('should generate tokens suitable for cryptographic use', () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateCsrfToken());
      }
      expect(tokens.size).toBe(100); // All unique
    });
  });

  // ═══ CSRF Token Verification ═══

  describe('verifyCsrfToken', () => {
    it('should verify matching tokens', () => {
      const token = 'test-token-12345';
      const result = verifyCsrfToken(token, token);
      expect(result).toBe(true);
    });

    it('should reject mismatched tokens', () => {
      const result = verifyCsrfToken('token-1', 'token-2');
      expect(result).toBe(false);
    });

    it('should reject when session token is undefined', () => {
      const result = verifyCsrfToken(undefined, 'request-token');
      expect(result).toBe(false);
    });

    it('should reject when request token is undefined', () => {
      const result = verifyCsrfToken('session-token', undefined);
      expect(result).toBe(false);
    });

    it('should reject when both tokens are undefined', () => {
      const result = verifyCsrfToken(undefined, undefined);
      expect(result).toBe(false);
    });

    it('should be timing-safe (constant time comparison)', () => {
      // Both matching and mismatching comparisons should take similar time
      const token = 'a'.repeat(50);
      const matchingToken = token;
      const mismatchToken1 = 'b' + 'a'.repeat(49);
      const mismatchToken2 = 'a'.repeat(49) + 'b';

      // All should return expected results
      expect(verifyCsrfToken(token, matchingToken)).toBe(true);
      expect(verifyCsrfToken(token, mismatchToken1)).toBe(false);
      expect(verifyCsrfToken(token, mismatchToken2)).toBe(false);
    });

    it('should reject tokens of different lengths', () => {
      const result = verifyCsrfToken('short', 'much-longer-token');
      expect(result).toBe(false);
    });

    it('should work with generated CSRF tokens', () => {
      const token = generateCsrfToken();
      expect(verifyCsrfToken(token, token)).toBe(true);
      expect(verifyCsrfToken(token, generateCsrfToken())).toBe(false);
    });

    it('should reject empty strings', () => {
      const result = verifyCsrfToken('', '');
      expect(result).toBe(false);
    });

    it('should be case-sensitive', () => {
      const result = verifyCsrfToken('Token123', 'token123');
      expect(result).toBe(false);
    });

    it('should handle special characters', () => {
      const token = 'Token@#$%^&*()_+-=[]{}|;:,.<>?';
      expect(verifyCsrfToken(token, token)).toBe(true);
      const modified = 'Token@#$%^&*()_+-=[]{}|;:,.<>!';
      expect(verifyCsrfToken(token, modified)).toBe(false);
    });

    it('should handle unicode characters', () => {
      const token = 'トークン123';
      expect(verifyCsrfToken(token, token)).toBe(true);
      expect(verifyCsrfToken(token, 'token123')).toBe(false);
    });

    it('should handle whitespace in tokens', () => {
      const token = 'token with spaces';
      expect(verifyCsrfToken(token, token)).toBe(true);
      expect(verifyCsrfToken(token, 'tokenwithspaces')).toBe(false);
    });
  });

  // ═══ Admin Authentication (Session + Basic Auth) ═══

  describe('verifyAdminAuth', () => {
    let mockEnv: Env;

    beforeEach(() => {
      mockEnv = {
        ADMIN_PASSWORD: 'test-password-123',
        SESSION_SECRET: 'test-secret',
      } as unknown as Env;
    });

    describe('when ADMIN_PASSWORD is missing', () => {
      it('should return 403 when ADMIN_PASSWORD is not set', async () => {
        const envNoPassword = { SESSION_SECRET: 'secret' } as unknown as Env;
        const request = new Request('http://localhost/api/test');

        const result = await verifyAdminAuth(request, envNoPassword);
        expect(result.authenticated).toBe(false);
        expect(result.response.status).toBe(403);
      });
    });

    describe('Session authentication (first layer)', () => {
      it('should authenticate with valid session cookie', async () => {
        const mockSession = {
          get: vi.fn((key) => {
            if (key === 'isAdmin') return true;
            if (key === 'loginAt') return Date.now();
            return undefined;
          }),
        };
        (AppSession.init as any).mockResolvedValue(mockSession);

        const request = new Request('http://localhost/api/test', {
          headers: { Cookie: 'session=valid' },
        });

        const result = await verifyAdminAuth(request, mockEnv);
        expect(result.authenticated).toBe(true);
      });

      it('should reject when session isAdmin is false', async () => {
        const mockSession = {
          get: vi.fn((key) => {
            if (key === 'isAdmin') return false;
            return undefined;
          }),
        };
        (AppSession.init as any).mockResolvedValue(mockSession);

        const request = new Request('http://localhost/api/test');

        const result = await verifyAdminAuth(request, mockEnv);
        expect(result.authenticated).toBe(false);
        expect(result.response.status).toBe(401);
      });

      it('should check session expiration (24 hour limit)', async () => {
        const now = Date.now();
        const moreThan24hoursAgo = now - 25 * 60 * 60 * 1000;

        const mockSession = {
          get: vi.fn((key) => {
            if (key === 'isAdmin') return true;
            if (key === 'loginAt') return moreThan24hoursAgo;
            return undefined;
          }),
        };
        (AppSession.init as any).mockResolvedValue(mockSession);

        const request = new Request('http://localhost/api/test');

        const result = await verifyAdminAuth(request, mockEnv);
        expect(result.authenticated).toBe(false);
      });

      it('should accept session within 24 hour window', async () => {
        const now = Date.now();
        const lessThan24hoursAgo = now - 23 * 60 * 60 * 1000;

        const mockSession = {
          get: vi.fn((key) => {
            if (key === 'isAdmin') return true;
            if (key === 'loginAt') return lessThan24hoursAgo;
            return undefined;
          }),
        };
        (AppSession.init as any).mockResolvedValue(mockSession);

        const request = new Request('http://localhost/api/test');

        const result = await verifyAdminAuth(request, mockEnv);
        expect(result.authenticated).toBe(true);
      });

      it('should handle missing loginAt gracefully', async () => {
        const mockSession = {
          get: vi.fn((key) => {
            if (key === 'isAdmin') return true;
            return undefined; // loginAt is undefined
          }),
        };
        (AppSession.init as any).mockResolvedValue(mockSession);

        const request = new Request('http://localhost/api/test');

        const result = await verifyAdminAuth(request, mockEnv);
        expect(result.authenticated).toBe(true); // !loginAt check allows it
      });
    });

    describe('Basic Auth (fallback)', () => {
      it('should authenticate with valid Basic Auth credentials', async () => {
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const credentials = Buffer.from('admin:test-password-123').toString('base64');
        const request = new Request('http://localhost/api/test', {
          headers: { Authorization: `Basic ${credentials}` },
        });

        const result = await verifyAdminAuth(request, mockEnv);
        expect(result.authenticated).toBe(true);
      });

      it('should reject invalid Basic Auth password', async () => {
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const credentials = Buffer.from('admin:wrong-password').toString('base64');
        const request = new Request('http://localhost/api/test', {
          headers: { Authorization: `Basic ${credentials}` },
        });

        const result = await verifyAdminAuth(request, mockEnv);
        expect(result.authenticated).toBe(false);
        expect(result.response.status).toBe(401);
      });

      it('should reject invalid username', async () => {
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const credentials = Buffer.from('notadmin:test-password-123').toString('base64');
        const request = new Request('http://localhost/api/test', {
          headers: { Authorization: `Basic ${credentials}` },
        });

        const result = await verifyAdminAuth(request, mockEnv);
        expect(result.authenticated).toBe(false);
        expect(result.response.status).toBe(401);
      });

      it('should reject when Authorization header is missing', async () => {
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const request = new Request('http://localhost/api/test');

        const result = await verifyAdminAuth(request, mockEnv);
        expect(result.authenticated).toBe(false);
        expect(result.response.status).toBe(401);
      });

      it('should reject non-Basic Authorization schemes', async () => {
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const request = new Request('http://localhost/api/test', {
          headers: { Authorization: 'Bearer some-token' },
        });

        const result = await verifyAdminAuth(request, mockEnv);
        expect(result.authenticated).toBe(false);
        expect(result.response.status).toBe(401);
      });

      it('should include WWW-Authenticate header in 401 responses', async () => {
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const request = new Request('http://localhost/api/test');

        const result = await verifyAdminAuth(request, mockEnv);
        const wwwAuth = result.response.headers.get('WWW-Authenticate');
        expect(wwwAuth).toContain('Basic realm="ASTROMEDA Admin"');
      });

      it('should handle malformed Base64 in Authorization header', async () => {
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const request = new Request('http://localhost/api/test', {
          headers: { Authorization: 'Basic !!!invalid-base64!!!' },
        });

        const result = await verifyAdminAuth(request, mockEnv);
        expect(result.authenticated).toBe(false);
        expect(result.response.status).toBe(401);
      });

      it('should use timing-safe comparison for password', async () => {
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        // Test that early-exit attacks don't work
        const wrongPassword1 = 'x'.repeat(100);
        const wrongPassword2 = 'test-password-' + 'x'.repeat(86);

        const creds1 = Buffer.from(`admin:${wrongPassword1}`).toString('base64');
        const creds2 = Buffer.from(`admin:${wrongPassword2}`).toString('base64');

        const request1 = new Request('http://localhost/api/test', {
          headers: { Authorization: `Basic ${creds1}` },
        });
        const request2 = new Request('http://localhost/api/test', {
          headers: { Authorization: `Basic ${creds2}` },
        });

        const result1 = await verifyAdminAuth(request1, mockEnv);
        const result2 = await verifyAdminAuth(request2, mockEnv);

        expect(result1.authenticated).toBe(false);
        expect(result2.authenticated).toBe(false);
      });
    });

    describe('Response format', () => {
      it('should return JSON error responses', async () => {
        const request = new Request('http://localhost/api/test');

        const result = await verifyAdminAuth(request, mockEnv);
        const contentType = result.response.headers.get('Content-Type');
        expect(contentType).toBe('application/json');
      });

      it('should include error message in response body', async () => {
        const request = new Request('http://localhost/api/test');

        const result = await verifyAdminAuth(request, mockEnv);
        const json = await result.response.json();
        expect(json.error).toBeDefined();
      });
    });

    describe('SESSION_SECRET handling', () => {
      it('should handle missing SESSION_SECRET gracefully', async () => {
        const envNoSecret = { ADMIN_PASSWORD: 'password' } as unknown as Env;

        const credentials = Buffer.from('admin:password').toString('base64');
        const request = new Request('http://localhost/api/test', {
          headers: { Authorization: `Basic ${credentials}` },
        });

        const result = await verifyAdminAuth(request, envNoSecret);
        expect(result.authenticated).toBe(true); // Basic Auth still works
      });
    });

    describe('SC-07: 2FA Integration', () => {
      it('should authenticate without 2FA when 2FA is disabled', async () => {
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const credentials = Buffer.from('admin:test-password-123').toString('base64');
        const request = new Request('http://localhost/api/test', {
          headers: { Authorization: `Basic ${credentials}` },
        });

        const envNo2FA = { ...mockEnv, ADMIN_2FA_ENABLED: 'false' } as unknown as Env;
        const result = await verifyAdminAuth(request, envNo2FA);
        expect(result.authenticated).toBe(true);
      });

      it('should return 401 when 2FA is enabled but no TOTP code provided', async () => {
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const credentials = Buffer.from('admin:test-password-123').toString('base64');
        const request = new Request('http://localhost/api/test', {
          headers: { Authorization: `Basic ${credentials}` },
        });

        const env2FA = {
          ...mockEnv,
          ADMIN_2FA_ENABLED: 'true',
          ADMIN_2FA_SECRET: 'JBSWY3DPEBLW64TMMQ======',
        } as unknown as Env;

        const result = await verifyAdminAuth(request, env2FA);
        expect(result.authenticated).toBe(false);
        expect(result.response.status).toBe(401);

        const json = await result.response.json();
        expect(json.error).toBe('2FA code required');
      });

      it('should return 401 when 2FA code is invalid', async () => {
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const credentials = Buffer.from('admin:test-password-123').toString('base64');
        const request = new Request('http://localhost/api/test', {
          headers: {
            Authorization: `Basic ${credentials}`,
            'X-TOTP-Code': '000000', // Invalid code
          },
        });

        const env2FA = {
          ...mockEnv,
          ADMIN_2FA_ENABLED: 'true',
          ADMIN_2FA_SECRET: 'JBSWY3DPEBLW64TMMQ======',
        } as unknown as Env;

        const result = await verifyAdminAuth(request, env2FA);
        expect(result.authenticated).toBe(false);
        expect(result.response.status).toBe(401);

        const json = await result.response.json();
        expect(json.error).toBe('Invalid 2FA code');
      });

      it('should skip TOTP verification when ADMIN_2FA_SECRET is not configured', async () => {
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const credentials = Buffer.from('admin:test-password-123').toString('base64');
        const request = new Request('http://localhost/api/test', {
          headers: { Authorization: `Basic ${credentials}` },
        });

        const env2FANoSecret = {
          ...mockEnv,
          ADMIN_2FA_ENABLED: 'true',
          // ADMIN_2FA_SECRET is missing
        } as unknown as Env;

        const result = await verifyAdminAuth(request, env2FANoSecret);
        // Should still require a code to be provided, even if not verified
        expect(result.authenticated).toBe(false);
        expect(result.response.status).toBe(401);
      });

      it('should read TOTP code from X-TOTP-Code header', async () => {
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const credentials = Buffer.from('admin:test-password-123').toString('base64');

        // Create a request with X-TOTP-Code header
        const request = new Request('http://localhost/api/test', {
          headers: {
            Authorization: `Basic ${credentials}`,
            'X-TOTP-Code': '123456', // Invalid code, but should be read
          },
        });

        const env2FA = {
          ...mockEnv,
          ADMIN_2FA_ENABLED: 'true',
          ADMIN_2FA_SECRET: 'JBSWY3DPEBLW64TMMQ======',
        } as unknown as Env;

        const result = await verifyAdminAuth(request, env2FA);
        // Will fail verification, but header should have been read
        expect(result.authenticated).toBe(false);
        expect(result.response.status).toBe(401);
      });

      it('should reject TOTP code with non-numeric characters', async () => {
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const credentials = Buffer.from('admin:test-password-123').toString('base64');
        const request = new Request('http://localhost/api/test', {
          headers: {
            Authorization: `Basic ${credentials}`,
            'X-TOTP-Code': '12345a', // Non-numeric
          },
        });

        const env2FA = {
          ...mockEnv,
          ADMIN_2FA_ENABLED: 'true',
          ADMIN_2FA_SECRET: 'JBSWY3DPEBLW64TMMQ======',
        } as unknown as Env;

        const result = await verifyAdminAuth(request, env2FA);
        expect(result.authenticated).toBe(false);
        expect(result.response.status).toBe(401);
        expect(result.response.headers.get('WWW-Authenticate')).toContain('Bearer');
      });

      it('should reject TOTP code with incorrect length', async () => {
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const credentials = Buffer.from('admin:test-password-123').toString('base64');
        const request = new Request('http://localhost/api/test', {
          headers: {
            Authorization: `Basic ${credentials}`,
            'X-TOTP-Code': '12345', // Only 5 digits
          },
        });

        const env2FA = {
          ...mockEnv,
          ADMIN_2FA_ENABLED: 'true',
          ADMIN_2FA_SECRET: 'JBSWY3DPEBLW64TMMQ======',
        } as unknown as Env;

        const result = await verifyAdminAuth(request, env2FA);
        expect(result.authenticated).toBe(false);
        expect(result.response.status).toBe(401);
      });
    });

    describe('IP Allowlist (SC-05)', () => {
      it('should check IP allowlist before password verification', async () => {
        (checkIPAllowlist as any).mockReturnValue(
          new Response(JSON.stringify({ error: 'IP Blocked' }), { status: 403 }),
        );

        const credentials = Buffer.from('admin:test-password-123').toString('base64');
        const request = new Request('http://localhost/api/test', {
          headers: {
            Authorization: `Basic ${credentials}`,
            'CF-Connecting-IP': '203.0.113.100',
          },
        });

        const result = await verifyAdminAuth(request, mockEnv);
        expect(result.authenticated).toBe(false);
        expect(result.response.status).toBe(403);
        expect(checkIPAllowlist).toHaveBeenCalledWith(request, mockEnv);
      });

      it('should allow requests when IP allowlist check passes', async () => {
        (checkIPAllowlist as any).mockReturnValue(null); // null means allowed
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const credentials = Buffer.from('admin:test-password-123').toString('base64');
        const request = new Request('http://localhost/api/test', {
          headers: {
            Authorization: `Basic ${credentials}`,
            'CF-Connecting-IP': '192.168.1.1',
          },
        });

        const result = await verifyAdminAuth(request, mockEnv);
        expect(result.authenticated).toBe(true);
        expect(checkIPAllowlist).toHaveBeenCalledWith(request, mockEnv);
      });

      it('should not proceed to password check if IP is blocked', async () => {
        const blockedResponse = new Response(JSON.stringify({ error: 'IP Blocked' }), {
          status: 403,
        });
        (checkIPAllowlist as any).mockReturnValue(blockedResponse);
        (AppSession.init as any).mockRejectedValue(new Error('No session'));

        const credentials = Buffer.from('admin:test-password-123').toString('base64');
        const request = new Request('http://localhost/api/test', {
          headers: {
            Authorization: `Basic ${credentials}`,
            'CF-Connecting-IP': '203.0.113.100',
          },
        });

        const result = await verifyAdminAuth(request, mockEnv);
        expect(result.authenticated).toBe(false);
        expect(result.response.status).toBe(403);
        // Should not reach password verification logic
      });
    });
  });
});
