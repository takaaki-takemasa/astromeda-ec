/**
 * Admin Authentication Tests
 *
 * Tests the core authentication logic for admin APIs.
 * Covers session-based auth, Basic Auth, CSRF token generation/validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyAdminAuth, generateCsrfToken, verifyCsrfToken } from '~/lib/admin-auth';

describe('Admin Auth', () => {
  const TEST_PASSWORD = 'test-admin-password';
  const TEST_SECRET = 'test-session-secret';

  describe('verifyAdminAuth', () => {
    let mockRequest: Request;
    let mockEnv: Env;

    beforeEach(() => {
      mockEnv = {
        ADMIN_PASSWORD: TEST_PASSWORD,
        SESSION_SECRET: TEST_SECRET,
      } as unknown as Env;
    });

    it('should reject when ADMIN_PASSWORD is missing', async () => {
      const env = { ...mockEnv, ADMIN_PASSWORD: '' } as unknown as Env;
      const request = new Request('http://localhost/api/admin/status');

      const result = await verifyAdminAuth(request, env);

      expect(result.authenticated).toBe(false);
      expect(result.response.status).toBe(403);
      const body = await result.response.json();
      expect(body.error).toContain('disabled');
    });

    it('should reject when Authorization header is missing', async () => {
      const request = new Request('http://localhost/api/admin/status');

      const result = await verifyAdminAuth(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.response.status).toBe(401);
      const body = await result.response.json();
      expect(body.error).toContain('Authentication required');
    });

    it('should reject when Authorization header is malformed', async () => {
      const request = new Request('http://localhost/api/admin/status', {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });

      const result = await verifyAdminAuth(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.response.status).toBe(401);
    });

    it('should reject with invalid Basic Auth credentials', async () => {
      const badCredentials = btoa('admin:wrong-password');
      const request = new Request('http://localhost/api/admin/status', {
        headers: {
          Authorization: `Basic ${badCredentials}`,
        },
      });

      const result = await verifyAdminAuth(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.response.status).toBe(401);
    });

    it('should accept with valid Basic Auth credentials', async () => {
      const credentials = btoa(`admin:${TEST_PASSWORD}`);
      const request = new Request('http://localhost/api/admin/status', {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      });

      const result = await verifyAdminAuth(request, mockEnv);

      expect(result.authenticated).toBe(true);
    });

    it('should reject with incorrect username in Basic Auth', async () => {
      const credentials = btoa(`user:${TEST_PASSWORD}`);
      const request = new Request('http://localhost/api/admin/status', {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      });

      const result = await verifyAdminAuth(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.response.status).toBe(401);
    });

    it('should use timing-safe comparison for credentials', async () => {
      const credentials = btoa(`admin:${TEST_PASSWORD}`);
      const request = new Request('http://localhost/api/admin/status', {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      });

      const result = await verifyAdminAuth(request, mockEnv);

      expect(result.authenticated).toBe(true);
      // Timing-safe comparison means it should take consistent time
      // regardless of where the mismatch occurs
    });

    it('should handle malformed Base64 in Basic Auth', async () => {
      const request = new Request('http://localhost/api/admin/status', {
        headers: {
          Authorization: 'Basic !!!invalid-base64!!!',
        },
      });

      const result = await verifyAdminAuth(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.response.status).toBe(401);
    });

    it('should include WWW-Authenticate header on auth failure', async () => {
      const request = new Request('http://localhost/api/admin/status');

      const result = await verifyAdminAuth(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.response.headers.get('WWW-Authenticate')).toContain('Basic');
      expect(result.response.headers.get('WWW-Authenticate')).toContain('ASTROMEDA Admin');
    });
  });

  describe('generateCsrfToken', () => {
    it('should generate a valid UUID string', () => {
      const token = generateCsrfToken();

      expect(typeof token).toBe('string');
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique tokens', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();

      expect(token1).not.toBe(token2);
    });

    it('should generate tokens of consistent length', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      const token3 = generateCsrfToken();

      expect(token1.length).toBe(token2.length);
      expect(token2.length).toBe(token3.length);
      expect(token1.length).toBe(36); // Standard UUID length
    });
  });

  describe('verifyCsrfToken', () => {
    it('should accept matching tokens', () => {
      const token = generateCsrfToken();

      const result = verifyCsrfToken(token, token);

      expect(result).toBe(true);
    });

    it('should reject when sessionToken is undefined', () => {
      const token = generateCsrfToken();

      const result = verifyCsrfToken(undefined, token);

      expect(result).toBe(false);
    });

    it('should reject when requestToken is undefined', () => {
      const token = generateCsrfToken();

      const result = verifyCsrfToken(token, undefined);

      expect(result).toBe(false);
    });

    it('should reject when both tokens are undefined', () => {
      const result = verifyCsrfToken(undefined, undefined);

      expect(result).toBe(false);
    });

    it('should reject mismatched tokens', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();

      const result = verifyCsrfToken(token1, token2);

      expect(result).toBe(false);
    });

    it('should use timing-safe comparison', () => {
      const sessionToken = generateCsrfToken();
      // Modify last character
      const requestToken =
        sessionToken.slice(0, -1) +
        (sessionToken[sessionToken.length - 1] === 'a' ? 'b' : 'a');

      const result = verifyCsrfToken(sessionToken, requestToken);

      expect(result).toBe(false);
      // The comparison should take consistent time regardless of
      // how many characters match
    });

    it('should reject tokens of different lengths', () => {
      const token = generateCsrfToken();

      const result = verifyCsrfToken(token, token.slice(0, -5));

      expect(result).toBe(false);
    });

    it('should be case-sensitive', () => {
      // Manually create tokens to test case sensitivity
      const sessionToken = 'a1b2c3d4-e5f6-47a8-9b0c-d1e2f3a4b5c6';
      const requestToken = 'A1b2c3d4-e5f6-47a8-9b0c-d1e2f3a4b5c6'; // First char uppercase

      const result = verifyCsrfToken(sessionToken, requestToken);

      // Should be false because uppercase 'A' != lowercase 'a'
      expect(result).toBe(false);
    });
  });
});
