/**
 * Admin認証ユーティリティ — セッション + Basic Auth 共通ロジック
 *
 * Phase 10: セッションCookie認証を優先。Basic Auth はフォールバック。
 * ダッシュボードからのfetch()はセッションCookieで認証。
 * 外部ツール（curl等）からはBasic Authで認証。
 *
 * 医学メタファー: 免疫認証の二重チェック
 * 1. セッションCookie = T細胞による自己認識（高速・既知の自己）
 * 2. Basic Auth = 抗体による抗原認証（低速・初回応答）
 */

import { AppSession } from '~/lib/session';
import { isLocked, recordFailedAttempt, recordSuccessfulLogin } from '~/lib/account-lockout';
import { getClientIP } from '~/lib/rate-limiter';
import { checkIPAllowlist } from '~/lib/ip-allowlist';
import { is2FAEnabled, verifyTOTP } from '~/lib/two-factor-auth';

interface AdminAuthResult {
  authenticated: true;
}

interface AdminAuthError {
  authenticated: false;
  response: Response;
}

type AuthResult = AdminAuthResult | AdminAuthError;

/**
 * Admin API向け認証検証
 * 1. セッションCookieを先にチェック（ダッシュボードからのfetch用）
 * 2. フォールバックでBasic Authをチェック（外部ツール用）
 *
 * 成功時: { authenticated: true }
 * 失敗時: { authenticated: false, response: Response }
 */
export async function verifyAdminAuth(
  request: Request,
  env: Env,
): Promise<AuthResult> {
  // SC-05: IP Allowlist check at START of function
  const ipBlocked = checkIPAllowlist(request, env as unknown as Record<string, unknown>);
  if (ipBlocked) {
    return { authenticated: false, response: ipBlocked };
  }

  const adminPassword = env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return {
      authenticated: false,
      response: new Response(JSON.stringify({error: 'Admin API disabled'}), {
        status: 403,
        headers: {'Content-Type': 'application/json'},
      }),
    };
  }

  // 第1層: セッションCookie認証（T細胞 — 高速応答）
  try {
    if (env.SESSION_SECRET) {
      const session = await AppSession.init(request, [env.SESSION_SECRET]);
      const isAdmin = session.get('isAdmin');
      if (isAdmin === true) {
        // セッション有効期限チェック（24時間）
        const loginAt = session.get('loginAt') as number | undefined;
        if (!loginAt || Date.now() - loginAt <= 24 * 60 * 60 * 1000) {
          return {authenticated: true};
        }
      }
    }
  } catch {
    // セッション解析失敗 → Basic Authにフォールバック
  }

  // IM-04: ロックアウトチェック（ブルートフォース防御）
  const clientIP = getClientIP(request);
  const lockStatus = isLocked(clientIP);
  if (lockStatus.locked) {
    return {
      authenticated: false,
      response: new Response(JSON.stringify({
        error: 'Account locked',
        message: `認証試行回数超過。${lockStatus.remainingSeconds}秒後に再試行してください。`,
        retryAfter: lockStatus.remainingSeconds,
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(lockStatus.remainingSeconds ?? 900),
        },
      }),
    };
  }

  // 第2層: Basic Auth認証（抗体 — フォールバック）
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return {
      authenticated: false,
      response: new Response(JSON.stringify({error: 'Authentication required'}), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Basic realm="ASTROMEDA Admin", charset="UTF-8"',
        },
      }),
    };
  }

  try {
    const credentials = atob(authHeader.substring(6));
    const [username, password] = credentials.split(':');

    // タイミング安全比較（Oxygen/Workers環境対応）
    const encoder = new TextEncoder();
    const inputBytes = encoder.encode(username + ':' + password);
    const expectedBytes = encoder.encode('admin:' + adminPassword);
    const maxLen = Math.max(inputBytes.byteLength, expectedBytes.byteLength);
    let diff = inputBytes.byteLength ^ expectedBytes.byteLength;
    for (let i = 0; i < maxLen; i++) {
      diff |= (inputBytes[i] ?? 0) ^ (expectedBytes[i] ?? 0);
    }

    if (diff !== 0) {
      // IM-04: 失敗を記録（ロックアウトカウンタ加算）
      recordFailedAttempt(clientIP);
      return {
        authenticated: false,
        response: new Response(JSON.stringify({error: 'Invalid credentials'}), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Basic realm="ASTROMEDA Admin", charset="UTF-8"',
          },
        }),
      };
    }
  } catch {
    recordFailedAttempt(clientIP);
    return {
      authenticated: false,
      response: new Response(JSON.stringify({error: 'Invalid authorization'}), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Basic realm="ASTROMEDA Admin", charset="UTF-8"',
        },
      }),
    };
  }

  // SC-07: 2FA統合 — パスワード検証成功後のTOTP検証
  // 2FAが有効な場合、TOTP検証を追加で実行
  if (is2FAEnabled(env)) {
    const totpCode = getTOTPCode(request);
    if (!totpCode) {
      // 2FAコードが提供されていない
      return {
        authenticated: false,
        response: new Response(JSON.stringify({
          error: '2FA code required',
          message: 'このエンドポイントは2要素認証が必須です。X-TOTP-Codeヘッダまたはtotp_codeフィールドを提供してください。',
        }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer realm="ASTROMEDA Admin 2FA", charset="UTF-8"',
          },
        }),
      };
    }

    const secret = env.ADMIN_2FA_SECRET;
    if (!secret) {
      // M8-DNA-01: 2FAが有効なのにシークレット未設定は致命的構成ミス
      // 医学メタファー: DNA複製時にテロメアが欠損 — 細胞分裂を停止させる
      // 開発環境でも本番でも、2FA有効時にシークレットなしでのログインは許可しない
      if (process.env.NODE_ENV === 'development') {
        console.error('[SC-07] CRITICAL: 2FA enabled but ADMIN_2FA_SECRET not configured. Set ADMIN_2FA_SECRET or disable 2FA.');
      }
      return {
        authenticated: false,
        response: new Response(JSON.stringify({
          error: '2FA configuration error',
          message: '2要素認証の設定が不完全です。管理者にADMIN_2FA_SECRETの設定を依頼してください。',
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      };
    } else {
      const isValidTOTP = await verifyTOTP(secret, totpCode);
      if (!isValidTOTP) {
        // IM-04: 失敗を記録（ロックアウトカウンタ加算）
        recordFailedAttempt(clientIP);
        return {
          authenticated: false,
          response: new Response(JSON.stringify({
            error: 'Invalid 2FA code',
            message: '2要素認証コードが無効です。正しいコードを入力してください。',
          }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
            },
          }),
        };
      }
    }
  }

  // IM-04: 成功時にロックアウト記録をリセット
  recordSuccessfulLogin(clientIP);
  return {authenticated: true};
}

/**
 * SC-07: リクエストからTOTPコードを抽出
 * 優先順位:
 * 1. X-TOTP-Code ヘッダ
 * 2. totp_code フォームフィールド（POSTのみ）
 */
function getTOTPCode(request: Request): string | null {
  // ヘッダから取得
  const headerCode = request.headers.get('X-TOTP-Code');
  if (headerCode && headerCode.trim().length === 6 && /^\d+$/.test(headerCode)) {
    return headerCode;
  }

  // POSTの場合、フォームフィールドから取得
  if (request.method !== 'POST') {
    return null;
  }

  // FormDataは非同期のため、実装上の制限: ここではヘッダのみをサポート
  // 必要に応じて呼び出し側で FormData 処理をして X-TOTP-Code ヘッダで送信
  return null;
}

// ═══ パスワード複雑性検証（S-03 免疫系の成熟度チェック） ═══

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * パスワード複雑性を検証
 * 最低要件: 12文字以上、大文字・小文字・数字・記号を各1つ以上
 */
export function validatePasswordComplexity(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || password.length < 12) {
    errors.push('パスワードは12文字以上必要です');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('大文字(A-Z)を1文字以上含めてください');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('小文字(a-z)を1文字以上含めてください');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('数字(0-9)を1文字以上含めてください');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('記号(!@#$%等)を1文字以上含めてください');
  }

  return { valid: errors.length === 0, errors };
}

// ═══ CSRF防御（免疫不全の修復） ═══

/**
 * CSRFトークンを生成（セッションに保存用）
 * crypto.randomUUID()はCloudflare Workers/Oxygen対応
 */
export function generateCsrfToken(): string {
  return crypto.randomUUID();
}

/**
 * CSRFトークンを検証
 * フォームのhidden inputまたはheaderから取得したトークンとセッション保存値を比較
 */
export function verifyCsrfToken(sessionToken: string | undefined, requestToken: string | undefined): boolean {
  if (!sessionToken || !requestToken) return false;
  // タイミング安全比較
  const encoder = new TextEncoder();
  const a = encoder.encode(sessionToken);
  const b = encoder.encode(requestToken);
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
