/**
 * PasswordHasher — パスワードハッシュ化（免疫系の抗体生成）
 *
 * 医学メタファー: 免疫系が抗原（パスワード）を認識するために抗体（ハッシュ）を生成する。
 * 平文パスワードを安全にハッシュ化し、検証する。
 *
 * Edge互換: Web Crypto API のみ使用（bcryptはEdge非対応）
 * アルゴリズム: PBKDF2 (SHA-256, 100000 iterations)
 *
 * なぜPBKDF2か:
 * - Web Crypto APIでネイティブ対応（Cloudflare Workers, Deno, Node.js）
 * - bcryptはnative addon要求でEdge環境非対応
 * - 100K iterationsで十分な計算コスト
 */

import { createLogger } from '../core/logger.js';

const log = createLogger('password-hasher');

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16; // 128-bit salt
const KEY_LENGTH = 32;  // 256-bit key
const HASH_ALGORITHM = 'SHA-256';

/**
 * パスワードをハッシュ化
 * @returns base64エンコードされた "salt:hash" 形式の文字列
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGORITHM,
    },
    keyMaterial,
    KEY_LENGTH * 8, // bits
  );

  const hash = new Uint8Array(derivedBits);
  const saltBase64 = btoa(String.fromCharCode(...salt));
  const hashBase64 = btoa(String.fromCharCode(...hash));

  return `pbkdf2:${PBKDF2_ITERATIONS}:${saltBase64}:${hashBase64}`;
}

/**
 * パスワードを検証
 * @param password 検証するパスワード（平文）
 * @param stored 保存されたハッシュ文字列（"pbkdf2:iterations:salt:hash"形式）
 * @returns true=一致、false=不一致
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');

  // レガシー平文比較のサポート（移行期間）
  if (parts.length < 4 || parts[0] !== 'pbkdf2') {
    // レガシーフォーマット: 平文比較（移行後は削除すること）
    log.warn('[PasswordHasher] Legacy plaintext password detected. Please re-hash.');
    return password === stored;
  }

  const iterations = parseInt(parts[1], 10);
  const saltBase64 = parts[2];
  const hashBase64 = parts[3];

  const encoder = new TextEncoder();
  const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
  const expectedHash = Uint8Array.from(atob(hashBase64), c => c.charCodeAt(0));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: HASH_ALGORITHM,
    },
    keyMaterial,
    expectedHash.length * 8,
  );

  const actualHash = new Uint8Array(derivedBits);

  // 定数時間比較（タイミング攻撃防止）
  return timingSafeEqual(actualHash, expectedHash);
}

/**
 * 定数時間比較（タイミング攻撃防止）
 * 医学メタファー: 抗体の形状照合を一定時間で行う（反応速度から推測されない）
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * ハッシュ形式がモダン（PBKDF2）か判定
 * レガシー平文パスワードの移行に使用
 */
export function isModernHash(stored: string): boolean {
  return stored.startsWith('pbkdf2:');
}

/**
 * パスワード強度チェック
 * @returns null=OK, string=エラーメッセージ
 */
export function checkPasswordStrength(password: string): string | null {
  if (password.length < 8) return 'パスワードは8文字以上必要です';
  if (password.length > 128) return 'パスワードは128文字以下にしてください';
  if (!/[A-Z]/.test(password)) return '大文字を1文字以上含めてください';
  if (!/[a-z]/.test(password)) return '小文字を1文字以上含めてください';
  if (!/[0-9]/.test(password)) return '数字を1文字以上含めてください';
  return null;
}
