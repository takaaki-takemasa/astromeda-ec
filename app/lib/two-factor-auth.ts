/**
 * 二要素認証（2FA）基盤 — 免疫記憶（Memory T Cell）
 *
 * IM-06: 2FA準備 / TOTP基盤
 *
 * 医学メタファー: 免疫記憶
 * 初回感染でT細胞が抗原を記憶し、再感染時に即座に応答する。
 * 2FAは「パスワード（先天免疫）+ ワンタイムコード（獲得免疫）」の二重防御。
 * 記憶T細胞 = 共有秘密鍵（サーバーとAuthenticatorアプリ間）
 *
 * Phase 1: TOTP基盤のみ構築（検証ロジック + セッション統合）
 * Phase 2: 管理画面にQRコード表示 + 実際のTOTP登録フロー
 *
 * 設計:
 * - RFC 6238 (TOTP) 準拠
 * - HMAC-SHA1（Google Authenticator互換）
 * - 30秒ウィンドウ、6桁コード
 * - ±1ステップの時間ドリフト許容
 */

/** TOTP設定 */
const TOTP_CONFIG = {
  /** タイムステップ（秒） */
  period: 30,
  /** コードの桁数 */
  digits: 6,
  /** 許容する前後ステップ数 */
  window: 1,
  /** アルゴリズム */
  algorithm: 'SHA-1' as const,
} as const;

/**
 * TOTP秘密鍵を生成（Base32エンコード済み）
 * Google Authenticator / Authy 等で読み取り可能な形式
 */
export function generateTOTPSecret(): string {
  const bytes = new Uint8Array(20); // 160bit
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

/**
 * TOTPコードを検証
 *
 * @param secret - Base32エンコード済み秘密鍵
 * @param code - ユーザーが入力した6桁コード
 * @param timestamp - 検証時刻（テスト用にオーバーライド可能）
 * @returns true=検証成功
 */
export async function verifyTOTP(
  secret: string,
  code: string,
  timestamp?: number,
): Promise<boolean> {
  if (!code || code.length !== TOTP_CONFIG.digits) return false;
  if (!/^\d+$/.test(code)) return false;

  const now = timestamp ?? Math.floor(Date.now() / 1000);
  const secretBytes = base32Decode(secret);

  // ±window ステップ分を検証（時間ドリフト対応）
  for (let i = -TOTP_CONFIG.window; i <= TOTP_CONFIG.window; i++) {
    const timeStep = Math.floor(now / TOTP_CONFIG.period) + i;
    const expected = await generateTOTPCode(secretBytes, timeStep);
    if (timingSafeEqual(code, expected)) {
      return true;
    }
  }

  return false;
}

/**
 * otpauth:// URI を生成（QRコード用）
 *
 * @param secret - Base32秘密鍵
 * @param accountName - ユーザー表示名（メールアドレス等）
 * @param issuer - サービス名（'ASTROMEDA Admin'）
 */
export function generateOTPAuthURI(
  secret: string,
  accountName: string,
  issuer: string = 'ASTROMEDA Admin',
): string {
  const encoded = encodeURIComponent(accountName);
  const issuerEncoded = encodeURIComponent(issuer);
  return `otpauth://totp/${issuerEncoded}:${encoded}?secret=${secret}&issuer=${issuerEncoded}&algorithm=SHA1&digits=${TOTP_CONFIG.digits}&period=${TOTP_CONFIG.period}`;
}

/**
 * 2FAが有効かどうかチェック（セッション/env参照）
 * Phase 1: 常にfalse（基盤のみ）
 * Phase 2: env.ADMIN_2FA_ENABLED === 'true' で有効化
 */
export function is2FAEnabled(env: Record<string, unknown>): boolean {
  return env.ADMIN_2FA_ENABLED === 'true' || env.ADMIN_2FA_ENABLED === true;
}

// ━━━ 内部ヘルパー ━━━

/**
 * HMAC-SHA1でTOTPコードを生成
 */
async function generateTOTPCode(secretBytes: Uint8Array, timeStep: number): Promise<string> {
  // タイムステップを8バイトBigEndianに変換
  const timeBuffer = new ArrayBuffer(8);
  const view = new DataView(timeBuffer);
  // JavaScript number は 53bit整数まで安全
  view.setUint32(0, Math.floor(timeStep / 0x100000000), false);
  view.setUint32(4, timeStep & 0xFFFFFFFF, false);

  // HMAC-SHA1
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    {name: 'HMAC', hash: {name: TOTP_CONFIG.algorithm}},
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, timeBuffer);
  const hmac = new Uint8Array(signature);

  // Dynamic Truncation (RFC 4226 Section 5.4)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, TOTP_CONFIG.digits);
  return otp.toString().padStart(TOTP_CONFIG.digits, '0');
}

/**
 * タイミング安全文字列比較
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ━━━ Base32 エンコード/デコード ━━━

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes: Uint8Array): string {
  let bits = '';
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0');
  }
  // 5bit ずつに分割
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    result += BASE32_CHARS[parseInt(chunk, 2)];
  }
  return result;
}

function base32Decode(encoded: string): Uint8Array {
  let bits = '';
  for (const char of encoded.toUpperCase()) {
    const index = BASE32_CHARS.indexOf(char);
    if (index === -1) continue; // パディング文字 '=' やノイズは無視
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

// テスト用エクスポート
export { base32Encode, base32Decode, generateTOTPCode, TOTP_CONFIG };
