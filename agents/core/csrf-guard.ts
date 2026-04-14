/**
 * CSRF Guard — CSRF防御（適応免疫 = T細胞識別）
 *
 * 医学的メタファー: 適応免疫系（Adaptive Immunity）
 * 「前に見たことのある敵」を識別する免疫応答。
 * CSRFトークン＝T細胞のレセプタ（TCR）。
 * リクエストごとに一意のトークンを生成し、一致するリクエストのみ許可する。
 *
 * 用途:
 * 1. ダッシュボードからのPOST/PUT/DELETE: X-CSRF-Token ヘッダで検証
 * 2. フォーム送信: hidden input フィールドで検証
 * 3. トークン有効期限: 1時間（セッション外でのトークン再利用を防止）
 *
 * Oxygen制約: crypto.subtle（Edge/Worker互換）を使用
 */

import { createLogger } from './logger.js';

const log = createLogger('csrf-guard');

const CSRF_TOKEN_VERSION = '1';
const CSRF_TOKEN_SEPARATOR = '.';
const CSRF_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1時間

/**
 * CSRFトークンジェネレータ
 *
 * フォーマット: `version.timestamp.hmac`
 * - version: トークンバージョン（互換性チェック用）
 * - timestamp: トークン生成時刻（UNIXタイム）
 * - hmac: HMAC-SHA256（sessionId + timestamp を secret でハッシュ）
 *
 * HMAC計算:
 * - キー: ADMIN_PASSWORD（環境変数）
 * - メッセージ: `${sessionId}:${timestamp}`
 * - 出力: 16進数エンコード
 */
export async function generateCSRFToken(
  sessionId: string,
  secret: string,
): Promise<string> {
  if (!sessionId || !secret) {
    throw new Error('sessionId and secret must not be empty');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const message = `${sessionId}:${timestamp}`;

  // HMAC-SHA256を計算（crypto.subtle = Edge/Worker互換）
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const hmac = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const token = `${CSRF_TOKEN_VERSION}${CSRF_TOKEN_SEPARATOR}${timestamp}${CSRF_TOKEN_SEPARATOR}${hmac}`;

  log.debug('CSRF token generated', {
    sessionId,
    timestamp,
    hmacLength: hmac.length,
    tokenVersion: CSRF_TOKEN_VERSION,
  });

  return token;
}

/**
 * CSRFトークン検証
 *
 * トークンの署名を検証し、有効期限（1時間）をチェック。
 * タイミング安全比較で HMAC を検証。
 *
 * 戻り値:
 * - true: トークン有効
 * - false: トークン無効、期限切れ、または署名不正
 */
export async function validateCSRFToken(
  token: string | undefined,
  sessionId: string,
  secret: string,
): Promise<boolean> {
  if (!token || !sessionId || !secret) {
    log.warn('CSRF validation failed', {
      reason: 'missing inputs',
      hasToken: !!token,
      hasSessionId: !!sessionId,
      hasSecret: !!secret,
    });
    return false;
  }

  try {
    const parts = token.split(CSRF_TOKEN_SEPARATOR);
    if (parts.length !== 3) {
      log.warn('CSRF validation failed', { reason: 'invalid token format', partsCount: parts.length });
      return false;
    }

    const [version, timestampStr, providedHmac] = parts;

    // バージョンチェック
    if (version !== CSRF_TOKEN_VERSION) {
      log.warn('CSRF validation failed', { reason: 'version mismatch', version, expected: CSRF_TOKEN_VERSION });
      return false;
    }

    const timestamp = parseInt(timestampStr, 10);
    if (Number.isNaN(timestamp)) {
      log.warn('CSRF validation failed', { reason: 'invalid timestamp', timestampStr });
      return false;
    }

    // 有効期限チェック（1時間）
    const now = Math.floor(Date.now() / 1000);
    const ageSeconds = now - timestamp;
    if (ageSeconds > CSRF_TOKEN_EXPIRY_MS / 1000) {
      log.warn('CSRF validation failed', { reason: 'token expired', ageSeconds, maxAge: CSRF_TOKEN_EXPIRY_MS / 1000 });
      return false;
    }

    // HMAC署名を再計算し、提供されたHMACと比較（タイミング安全）
    const message = `${sessionId}:${timestamp}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    const expectedHmac = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // タイミング安全比較
    const providedBytes = encoder.encode(providedHmac);
    const expectedBytes = encoder.encode(expectedHmac);

    if (providedBytes.byteLength !== expectedBytes.byteLength) {
      log.warn('CSRF validation failed', { reason: 'hmac length mismatch' });
      return false;
    }

    let diff = 0;
    for (let i = 0; i < expectedBytes.byteLength; i++) {
      diff |= providedBytes[i]! ^ expectedBytes[i]!;
    }

    if (diff !== 0) {
      log.warn('CSRF validation failed', { reason: 'hmac signature mismatch' });
      return false;
    }

    log.debug('CSRF token validated successfully', { sessionId, ageSeconds });
    return true;
  } catch (error) {
    log.error('CSRF validation error', { error: String(error), token: token?.substring(0, 10) + '...' });
    return false;
  }
}

/**
 * CSRFトークン情報を取得
 * デバッグ・監視用
 */
export function parseCSRFToken(token: string): { version: string; timestamp: number; isExpired: boolean } | null {
  try {
    const parts = token.split(CSRF_TOKEN_SEPARATOR);
    if (parts.length !== 3) return null;

    const [version, timestampStr] = parts;
    const timestamp = parseInt(timestampStr, 10);
    const now = Math.floor(Date.now() / 1000);
    const isExpired = now - timestamp > CSRF_TOKEN_EXPIRY_MS / 1000;

    return { version, timestamp, isExpired };
  } catch {
    return null;
  }
}
