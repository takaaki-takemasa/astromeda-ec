/**
 * CSRF Middleware テスト — 免疫系のMHC
 *
 * Admin API CSRF保護の検証:
 * - GET/HEAD/OPTIONS は CSRF チェックをバイパス
 * - POST/PUT/PATCH/DELETE は CSRF トークン必須
 * - X-CSRF-Token ヘッダー優先
 * - フォームボディフォールバック
 * - Double Submit Cookie パターン
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { verifyCsrfForAdmin } from '../csrf-middleware';
import * as adminAuth from '../admin-auth';

// Mock AppSession
vi.mock('~/lib/session', () => {
  return {
    AppSession: {
      init: vi.fn(),
    },
  };
});

// We need to import it after mocking to get the mocked version
import { AppSession } from '~/lib/session';

describe('CSRF Middleware (Gate 2 — MHC 識別)', () => {
  let mockEnv: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      SESSION_SECRET: 'test-secret',
      // ... other env variables
    } as unknown as Env;

    vi.spyOn(adminAuth, 'generateCsrfToken').mockReturnValue('test-token-123');
    vi.spyOn(adminAuth, 'verifyCsrfToken').mockReturnValue(true);
  });

  describe('GET requests', () => {
    it('should bypass CSRF check for GET requests', async () => {
      const request = new Request('http://localhost/api/test', {
        method: 'GET',
      });

      const result = await verifyCsrfForAdmin(request, mockEnv);
      expect(result).toBeNull();
    });

    it('should bypass CSRF check for HEAD requests', async () => {
      const request = new Request('http://localhost/api/test', {
        method: 'HEAD',
      });

      const result = await verifyCsrfForAdmin(request, mockEnv);
      expect(result).toBeNull();
    });

    it('should bypass CSRF check for OPTIONS requests', async () => {
      const request = new Request('http://localhost/api/test', {
        method: 'OPTIONS',
      });

      const result = await verifyCsrfForAdmin(request, mockEnv);
      expect(result).toBeNull();
    });
  });

  describe('POST requests without CSRF', () => {
    it('should return 403 for POST without CSRF token', async () => {
      vi.spyOn(adminAuth, 'verifyCsrfToken').mockReturnValue(false);

      const mockSession = {
        get: vi.fn((key) => {
          if (key === 'csrfToken') return 'session-token';
          return undefined;
        }),
      };
      (AppSession.init as any).mockResolvedValue(mockSession);

      const request = new Request('http://localhost/api/test', {
        method: 'POST',
      });

      const result = await verifyCsrfForAdmin(request, mockEnv);
      expect(result?.status).toBe(403);
      expect(await result?.json()).toEqual(
        expect.objectContaining({
          status: 403,
          title: 'CSRF Token Invalid',
        })
      );
    });

    it('should return 403 with CSRF error response', async () => {
      vi.spyOn(adminAuth, 'verifyCsrfToken').mockReturnValue(false);

      const mockSession = {
        get: vi.fn().mockReturnValue('session-token'),
      };
      (AppSession.init as any).mockResolvedValue(mockSession);

      const request = new Request('http://localhost/api/test', {
        method: 'POST',
      });

      const result = await verifyCsrfForAdmin(request, mockEnv);
      const json = await result?.json();
      expect(json?.type).toBe('/errors/csrf-validation');
      expect(json?.detail).toContain('CSRFトークン');
    });
  });

  describe('POST with valid X-CSRF-Token header', () => {
    it('should pass validation with valid X-CSRF-Token header', async () => {
      vi.spyOn(adminAuth, 'verifyCsrfToken').mockReturnValue(true);

      const mockSession = {
        get: vi.fn((key) => {
          if (key === 'csrfToken') return 'session-token';
          return undefined;
        }),
      };
      (AppSession.init as any).mockResolvedValue(mockSession);

      const request = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': 'request-token',
        },
      });

      const result = await verifyCsrfForAdmin(request, mockEnv);
      expect(result).toBeNull();
    });

    it('should extract X-CSRF-Token and verify', async () => {
      const verifyTokenSpy = vi.spyOn(adminAuth, 'verifyCsrfToken');
      verifyTokenSpy.mockReturnValue(true);

      const mockSession = {
        get: vi.fn((key) => {
          if (key === 'csrfToken') return 'session-token';
          return undefined;
        }),
      };
      (AppSession.init as any).mockResolvedValue(mockSession);

      const request = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': 'request-token',
        },
      });

      await verifyCsrfForAdmin(request, mockEnv);
      expect(verifyTokenSpy).toHaveBeenCalledWith('session-token', 'request-token');
    });
  });

  describe('POST with _csrf form field', () => {
    it('should pass validation with valid _csrf form field', async () => {
      vi.spyOn(adminAuth, 'verifyCsrfToken').mockReturnValue(true);

      const mockSession = {
        get: vi.fn((key) => {
          if (key === 'csrfToken') return 'session-token';
          return undefined;
        }),
      };
      (AppSession.init as any).mockResolvedValue(mockSession);

      const formData = new FormData();
      formData.append('_csrf', 'form-token');
      formData.append('name', 'value');

      const request = new Request('http://localhost/api/test', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const result = await verifyCsrfForAdmin(request, mockEnv);
      expect(result).toBeNull();
    });

    it('should fallback to form body when header missing', async () => {
      vi.spyOn(adminAuth, 'verifyCsrfToken').mockReturnValue(true);

      const mockSession = {
        get: vi.fn((key) => {
          if (key === 'csrfToken') return 'session-token';
          return undefined;
        }),
      };
      (AppSession.init as any).mockResolvedValue(mockSession);

      const formData = new FormData();
      formData.append('_csrf', 'form-token');

      const request = new Request('http://localhost/api/test', {
        method: 'POST',
        body: formData,
      });

      const result = await verifyCsrfForAdmin(request, mockEnv);
      expect(result).toBeNull();
    });
  });

  describe('POST with _csrf JSON field', () => {
    it('should extract _csrf from JSON body', async () => {
      vi.spyOn(adminAuth, 'verifyCsrfToken').mockReturnValue(true);

      const mockSession = {
        get: vi.fn((key) => {
          if (key === 'csrfToken') return 'session-token';
          return undefined;
        }),
      };
      (AppSession.init as any).mockResolvedValue(mockSession);

      const request = new Request('http://localhost/api/test', {
        method: 'POST',
        body: JSON.stringify({ _csrf: 'json-token', data: 'test' }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await verifyCsrfForAdmin(request, mockEnv);
      expect(result).toBeNull();
    });

    it('should handle JSON parse errors gracefully', async () => {
      vi.spyOn(adminAuth, 'verifyCsrfToken').mockReturnValue(false);

      const mockSession = {
        get: vi.fn((key) => {
          if (key === 'csrfToken') return 'session-token';
          return undefined;
        }),
      };
      (AppSession.init as any).mockResolvedValue(mockSession);

      const request = new Request('http://localhost/api/test', {
        method: 'POST',
        body: 'invalid json',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await verifyCsrfForAdmin(request, mockEnv);
      expect(result?.status).toBe(403);
    });
  });

  describe('Missing SESSION_SECRET', () => {
    it('should return 500 when SESSION_SECRET is missing', async () => {
      const envNoSecret = { ...mockEnv, SESSION_SECRET: undefined } as unknown as Env;

      const request = new Request('http://localhost/api/test', {
        method: 'POST',
      });

      const result = await verifyCsrfForAdmin(request, envNoSecret);
      expect(result?.status).toBe(500);
      const json = await result?.json();
      expect(json?.error).toContain('CSRF verification unavailable');
    });
  });

  describe('Session verification failures', () => {
    it('should return 403 when session initialization fails', async () => {
      (AppSession.init as any).mockRejectedValue(new Error('Session error'));

      const request = new Request('http://localhost/api/test', {
        method: 'POST',
      });

      const result = await verifyCsrfForAdmin(request, mockEnv);
      expect(result?.status).toBe(403);
      const json = await result?.json();
      expect(json?.error).toContain('Session verification failed');
    });
  });

  describe('Header priority', () => {
    it('should prioritize X-CSRF-Token header over form field', async () => {
      const verifyTokenSpy = vi.spyOn(adminAuth, 'verifyCsrfToken');
      verifyTokenSpy.mockReturnValue(true);

      const mockSession = {
        get: vi.fn((key) => {
          if (key === 'csrfToken') return 'session-token';
          return undefined;
        }),
      };
      (AppSession.init as any).mockResolvedValue(mockSession);

      const formData = new FormData();
      formData.append('_csrf', 'form-token');

      const request = new Request('http://localhost/api/test', {
        method: 'POST',
        body: formData,
        headers: {
          'X-CSRF-Token': 'header-token',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      await verifyCsrfForAdmin(request, mockEnv);
      // Should use header token, not form token
      expect(verifyTokenSpy).toHaveBeenCalledWith('session-token', 'header-token');
    });
  });

  describe('All mutation methods', () => {
    ['PUT', 'PATCH', 'DELETE'].forEach((method) => {
      it(`should require CSRF token for ${method} requests`, async () => {
        vi.spyOn(adminAuth, 'verifyCsrfToken').mockReturnValue(false);

        const mockSession = {
          get: vi.fn().mockReturnValue('session-token'),
        };
        (AppSession.init as any).mockResolvedValue(mockSession);

        const request = new Request('http://localhost/api/test', {
          method,
        });

        const result = await verifyCsrfForAdmin(request, mockEnv);
        expect(result?.status).toBe(403);
      });
    });
  });

  describe('Token mismatch', () => {
    it('should return 403 when tokens do not match', async () => {
      vi.spyOn(adminAuth, 'verifyCsrfToken').mockReturnValue(false);

      const mockSession = {
        get: vi.fn((key) => {
          if (key === 'csrfToken') return 'session-token-123';
          return undefined;
        }),
      };
      (AppSession.init as any).mockResolvedValue(mockSession);

      const request = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': 'wrong-token-456',
        },
      });

      const result = await verifyCsrfForAdmin(request, mockEnv);
      expect(result?.status).toBe(403);
    });
  });

  describe('Response format', () => {
    it('should return Problem+JSON response on CSRF failure', async () => {
      vi.spyOn(adminAuth, 'verifyCsrfToken').mockReturnValue(false);

      const mockSession = {
        get: vi.fn().mockReturnValue('session-token'),
      };
      (AppSession.init as any).mockResolvedValue(mockSession);

      const request = new Request('http://localhost/api/test', {
        method: 'POST',
      });

      const result = await verifyCsrfForAdmin(request, mockEnv);
      const contentType = result?.headers.get('Content-Type');
      expect(contentType).toBe('application/problem+json');
    });

    it('should include timestamp in error response', async () => {
      vi.spyOn(adminAuth, 'verifyCsrfToken').mockReturnValue(false);

      const mockSession = {
        get: vi.fn().mockReturnValue('session-token'),
      };
      (AppSession.init as any).mockResolvedValue(mockSession);

      const request = new Request('http://localhost/api/test', {
        method: 'POST',
      });

      const result = await verifyCsrfForAdmin(request, mockEnv);
      const json = await result?.json();
      expect(json?.timestamp).toBeDefined();
      expect(new Date(json?.timestamp)).toBeInstanceOf(Date);
    });
  });
});
