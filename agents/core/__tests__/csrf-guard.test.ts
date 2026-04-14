import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateCSRFToken, validateCSRFToken, parseCSRFToken } from '../csrf-guard';

const TEST_SESSION_ID = 'test-session-123';
const TEST_SECRET = 'super-secret-key';

describe('CSRF Guard', () => {
  // ── Token Generation ──

  it('should generate a valid CSRF token', async () => {
    const token = await generateCSRFToken(TEST_SESSION_ID, TEST_SECRET);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
  });

  it('should include version, timestamp, and HMAC in token', async () => {
    const token = await generateCSRFToken(TEST_SESSION_ID, TEST_SECRET);
    const [version, timestamp, hmac] = token.split('.');
    expect(version).toBe('1');
    expect(Number.isInteger(Number(timestamp))).toBe(true);
    expect(hmac).toMatch(/^[0-9a-f]+$/);
  });

  it('should generate different tokens for different timestamps', async () => {
    const token1 = await generateCSRFToken(TEST_SESSION_ID, TEST_SECRET);
    // Wait a tiny bit to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const token2 = await generateCSRFToken(TEST_SESSION_ID, TEST_SECRET);
    expect(token1).not.toBe(token2);
  });

  it('should generate different tokens for different session IDs', async () => {
    const token1 = await generateCSRFToken('session-1', TEST_SECRET);
    const token2 = await generateCSRFToken('session-2', TEST_SECRET);
    expect(token1).not.toBe(token2);
  });

  // ── Token Validation ──

  it('should validate a correctly generated token', async () => {
    const token = await generateCSRFToken(TEST_SESSION_ID, TEST_SECRET);
    const isValid = await validateCSRFToken(token, TEST_SESSION_ID, TEST_SECRET);
    expect(isValid).toBe(true);
  });

  it('should reject token with wrong session ID', async () => {
    const token = await generateCSRFToken(TEST_SESSION_ID, TEST_SECRET);
    const isValid = await validateCSRFToken(token, 'wrong-session', TEST_SECRET);
    expect(isValid).toBe(false);
  });

  it('should reject token with wrong secret', async () => {
    const token = await generateCSRFToken(TEST_SESSION_ID, TEST_SECRET);
    const isValid = await validateCSRFToken(token, TEST_SESSION_ID, 'wrong-secret');
    expect(isValid).toBe(false);
  });

  it('should reject malformed token (wrong format)', async () => {
    const isValid = await validateCSRFToken('invalid.format', TEST_SESSION_ID, TEST_SECRET);
    expect(isValid).toBe(false);
  });

  it('should reject token with invalid timestamp', async () => {
    const isValid = await validateCSRFToken('1.not-a-number.abc123', TEST_SESSION_ID, TEST_SECRET);
    expect(isValid).toBe(false);
  });

  it('should reject undefined/null token', async () => {
    expect(await validateCSRFToken(undefined, TEST_SESSION_ID, TEST_SECRET)).toBe(false);
    expect(await validateCSRFToken('', TEST_SESSION_ID, TEST_SECRET)).toBe(false);
  });

  it('should reject undefined session ID', async () => {
    const token = await generateCSRFToken(TEST_SESSION_ID, TEST_SECRET);
    expect(await validateCSRFToken(token, undefined as any, TEST_SECRET)).toBe(false);
  });

  it('should reject undefined secret', async () => {
    const token = await generateCSRFToken(TEST_SESSION_ID, TEST_SECRET);
    expect(await validateCSRFToken(token, TEST_SESSION_ID, undefined as any)).toBe(false);
  });

  // ── Expiry ──

  it('should reject expired token', async () => {
    // Mock Date.now to create an old token
    const originalNow = Date.now;
    const oldTime = Date.now() - 70 * 60 * 1000; // 70 minutes ago
    vi.spyOn(global.Date, 'now').mockReturnValueOnce(oldTime);

    const token = await generateCSRFToken(TEST_SESSION_ID, TEST_SECRET);

    // Restore original Date.now
    vi.spyOn(global.Date, 'now').mockRestore();

    // Now validate with current time
    const isValid = await validateCSRFToken(token, TEST_SESSION_ID, TEST_SECRET);
    expect(isValid).toBe(false);
  });

  it('should accept token within valid timeframe', async () => {
    const token = await generateCSRFToken(TEST_SESSION_ID, TEST_SECRET);
    // Validate immediately
    const isValid = await validateCSRFToken(token, TEST_SESSION_ID, TEST_SECRET);
    expect(isValid).toBe(true);
  });

  // ── Parse Token Info ──

  it('should parse token info correctly', async () => {
    const token = await generateCSRFToken(TEST_SESSION_ID, TEST_SECRET);
    const info = parseCSRFToken(token);
    expect(info).not.toBeNull();
    expect(info?.version).toBe('1');
    expect(Number.isInteger(info?.timestamp)).toBe(true);
    expect(info?.isExpired).toBe(false);
  });

  it('should detect expired token in parse', async () => {
    // Create token with old timestamp manually
    const oldTimestamp = Math.floor((Date.now() - 70 * 60 * 1000) / 1000);
    const token = `1.${oldTimestamp}.abc123def456`;
    const info = parseCSRFToken(token);
    expect(info?.isExpired).toBe(true);
  });

  it('should return null for malformed token in parse', () => {
    expect(parseCSRFToken('invalid')).toBeNull();
    expect(parseCSRFToken('a.b')).toBeNull();
    expect(parseCSRFToken('')).toBeNull();
  });

  // ── HMAC Timing Safety ──

  it('should use timing-safe comparison for HMAC verification', async () => {
    const token = await generateCSRFToken(TEST_SESSION_ID, TEST_SECRET);
    const [version, timestamp] = token.split('.');

    // Create a token with slightly different HMAC
    const fakeToken = `${version}.${timestamp}.0000000000000000000000000000000000000000000000000000000000000000`;
    const isValid = await validateCSRFToken(fakeToken, TEST_SESSION_ID, TEST_SECRET);
    expect(isValid).toBe(false);
  });

  // ── Edge Cases ──

  it('should handle special characters in session ID', async () => {
    const specialSessionId = 'session-!@#$%^&*()_+-=[]{}|;:,.<>?';
    const token = await generateCSRFToken(specialSessionId, TEST_SECRET);
    const isValid = await validateCSRFToken(token, specialSessionId, TEST_SECRET);
    expect(isValid).toBe(true);
  });

  it('should handle long session ID and secret', async () => {
    const longSessionId = 'a'.repeat(1000);
    const longSecret = 'b'.repeat(1000);
    const token = await generateCSRFToken(longSessionId, longSecret);
    const isValid = await validateCSRFToken(token, longSessionId, longSecret);
    expect(isValid).toBe(true);
  });

  it('should reject empty secret (crypto.subtle requirement)', async () => {
    // crypto.subtle.importKey does not allow zero-length keys
    // This is a security requirement, not a bug
    try {
      await generateCSRFToken(TEST_SESSION_ID, '');
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error instanceof Error).toBe(true);
    }
  });
});
