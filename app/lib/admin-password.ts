/**
 * Admin Password Hashing — PBKDF2 (Web Crypto API)
 *
 * patch 0156: single-password 共有の根本解消。
 * 個別ユーザーのパスワードをハッシュ化して admin_user Metaobject に保管する。
 *
 * フォーマット: `pbkdf2$<iterations>$<salt_hex>$<hash_hex>`
 *   - iterations: 反復回数 (既定 100,000)
 *   - salt_hex: 16 bytes を hex エンコード
 *   - hash_hex: 32 bytes PBKDF2-SHA256 を hex エンコード
 *
 * workerd (Cloudflare Workers / Oxygen) で動く crypto.subtle のみ使用。
 * bcrypt 等の Node/WASM 依存は排除。
 */
export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const len = Math.floor(hex.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number, byteLength: number): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    {name: 'PBKDF2'},
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256'},
    baseKey,
    byteLength * 8,
  );
  return new Uint8Array(bits);
}

/**
 * 平文パスワードを PBKDF2 でハッシュ化
 * 戻り値は Metaobject.password_hash にそのまま保存可能な文字列
 */
export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  if (!password) throw new Error('password is empty');
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, iterations, HASH_BYTES);
  return `pbkdf2$${iterations}$${bytesToHex(salt)}$${bytesToHex(hash)}`;
}

/**
 * ハッシュ文字列と平文パスワードを比較 (タイミング安全)
 * 無効フォーマットは false を返す (例外を投げない)
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!password || !stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;

  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 10_000 || iterations > 10_000_000) return false;

  const salt = hexToBytes(parts[2]);
  const expected = hexToBytes(parts[3]);
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = await pbkdf2(password, salt, iterations, expected.length);
  if (actual.length !== expected.length) return false;

  // タイミング安全比較
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected[i] ^ actual[i];
  }
  return diff === 0;
}

/**
 * パスワード強度の最低要件 (8 文字以上・英数字混在を推奨するが強制はしない)
 * validatePasswordComplexity (admin-auth.ts) は 12 文字+記号強制で厳しすぎるため、
 * 招待フローでは緩い版を使用する。
 */
export function validatePasswordMinimum(password: string): {valid: boolean; error?: string} {
  if (!password || password.length < 8) {
    return {valid: false, error: 'パスワードは 8 文字以上にしてください'};
  }
  if (password.length > 128) {
    return {valid: false, error: 'パスワードは 128 文字以下にしてください'};
  }
  return {valid: true};
}
