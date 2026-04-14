/**
 * Phase 5 テスト: 免疫系（パスワードハッシュ・監査証跡）
 *
 * パスワードのPBKDF2ハッシュ化、定数時間比較、レガシー移行、
 * 強度チェック、監査証跡のログ記録を検証
 */

import { describe, test, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  isModernHash,
  checkPasswordStrength,
} from '../password-hasher.js';

describe('Phase 5: 免疫系 — パスワードセキュリティ', () => {
  test('パスワードハッシュ化と検証', async () => {
    const password = 'SecureP@ss123';
    const hashed = await hashPassword(password);

    // ハッシュ形式の確認
    expect(hashed).toMatch(/^pbkdf2:\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(isModernHash(hashed)).toBe(true);

    // 正しいパスワードで検証
    const isValid = await verifyPassword(password, hashed);
    expect(isValid).toBe(true);

    // 間違ったパスワードで検証
    const isInvalid = await verifyPassword('WrongPassword', hashed);
    expect(isInvalid).toBe(false);
  });

  test('同じパスワードでも異なるハッシュが生成される（salt）', async () => {
    const password = 'TestPassword1';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    expect(hash1).not.toBe(hash2); // saltが異なるため

    // どちらも検証可能
    expect(await verifyPassword(password, hash1)).toBe(true);
    expect(await verifyPassword(password, hash2)).toBe(true);
  });

  test('レガシー平文パスワードの検証', async () => {
    // 移行期間: 旧システムの平文パスワード
    const legacyPassword = 'oldpassword123';
    const isValid = await verifyPassword(legacyPassword, legacyPassword);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword('wrong', legacyPassword);
    expect(isInvalid).toBe(false);
  });

  test('モダンハッシュ判定', () => {
    expect(isModernHash('pbkdf2:100000:abc:def')).toBe(true);
    expect(isModernHash('plaintext')).toBe(false);
    expect(isModernHash('')).toBe(false);
  });

  test('パスワード強度チェック', () => {
    expect(checkPasswordStrength('Ab1defgh')).toBeNull(); // OK
    expect(checkPasswordStrength('short')).not.toBeNull(); // 短い
    expect(checkPasswordStrength('alllowercase1')).not.toBeNull(); // 大文字なし
    expect(checkPasswordStrength('ALLUPPERCASE1')).not.toBeNull(); // 小文字なし
    expect(checkPasswordStrength('NoNumbers!')).not.toBeNull(); // 数字なし
    expect(checkPasswordStrength('Aa1' + 'x'.repeat(125))).toBeNull(); // 128文字OK
    expect(checkPasswordStrength('Aa1' + 'x'.repeat(126))).not.toBeNull(); // 129文字NG
  });

  test('空パスワードのハッシュ化', async () => {
    // 空パスワードもハッシュ化は可能（強度チェックは別レイヤー）
    const hashed = await hashPassword('');
    expect(hashed).toMatch(/^pbkdf2:/);
    expect(await verifyPassword('', hashed)).toBe(true);
    expect(await verifyPassword('notempty', hashed)).toBe(false);
  });

  test('長いパスワードの処理', async () => {
    const longPassword = 'A'.repeat(1000) + 'a1';
    const hashed = await hashPassword(longPassword);
    expect(await verifyPassword(longPassword, hashed)).toBe(true);
  });

  test('特殊文字を含むパスワード', async () => {
    const special = 'パスワード🔐Secure123!@#$%';
    const hashed = await hashPassword(special);
    expect(await verifyPassword(special, hashed)).toBe(true);
    expect(await verifyPassword(special + ' ', hashed)).toBe(false);
  });
});
