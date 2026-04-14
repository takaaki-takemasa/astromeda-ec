/**
 * A/B Test Infrastructure — 軽量A/Bテスティングフレームワーク
 *
 * 用途: CRO（Conversion Rate Optimization）のためのA/Bテスト
 * - クッキーベースの永続的なバリアント割り当て
 * - 決定論的ハッシング（Math.random()なし — SSR-safe）
 * - GA4カスタムイベント送信
 *
 * 医学メタファー: 遺伝子型と表現型
 * テスト割り当て = 遺伝子型。一度決定されたら不変。
 * バリアント表示 = 表現型。環境（ユーザー環境）に応じた表現。
 *
 * SSR対応: 全関数は typeof window === 'undefined' をチェック。
 */

import { trackCustomEvent } from './ga4-events';

/** A/Bテスト定義 */
export interface ABTest {
  id: string; // e.g., 'hero-cta-color'
  variants: string[]; // e.g., ['control', 'variant-a', 'variant-b']
  weights?: number[]; // e.g., [50, 25, 25] — percentage weights
}

/** A/Bテスト結果 */
export interface ABTestResult {
  testId: string;
  variant: string;
  timestamp: number;
}

/** Cookie キー接頭辞 */
const COOKIE_PREFIX = 'ab_';

/**
 * 決定論的ハッシュ関数（ユーザーID + テストID から バリアント決定）
 * SSR-safeで、同じ入力に対して必ず同じ出力を返す
 *
 * @param input 入力文字列（e.g., userId + testId）
 * @param max 最大値（バリアント数）
 * @returns 0～max-1の整数
 */
function deterministicHash(input: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % max;
}

/**
 * ユーザーを特定（またはセッションIDを生成）
 * SSR-safe: サーバーサイドでは null を返す
 */
function getUserId(): string | null {
  if (typeof window === 'undefined') return null;

  const key = '__astromeda_user_id';
  let userId = localStorage.getItem(key);

  if (!userId) {
    // セッション内で一意のユーザーID生成
    userId = 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    localStorage.setItem(key, userId);
  }

  return userId;
}

/**
 * クッキーからバリアント割り当てを取得
 */
function getVariantFromCookie(testId: string): string | null {
  if (typeof window === 'undefined') return null;

  const cookies = document.cookie.split(';');
  const cookieName = COOKIE_PREFIX + testId;

  for (const cookie of cookies) {
    const [name, value] = cookie.split('=').map((c) => c.trim());
    if (name === cookieName) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

/**
 * バリアント割り当てをクッキーに保存
 */
function setVariantCookie(testId: string, variant: string): void {
  if (typeof window === 'undefined') return;

  const expires = new Date();
  expires.setDate(expires.getDate() + 90); // 90日間有効

  const cookieName = COOKIE_PREFIX + testId;
  document.cookie = `${cookieName}=${encodeURIComponent(variant)}; expires=${expires.toUTCString()}; path=/`;
}

/**
 * ユーザーをバリアント割り当て（重みを考慮）
 * 既存割り当てがあればそれを返す（永続性）
 */
export function getVariant(test: ABTest): string {
  // SSRではコントロール返す（バリアント割り当て不可）
  if (typeof window === 'undefined') {
    return test.variants[0];
  }

  // クッキーから既存割り当てを確認
  const existing = getVariantFromCookie(test.id);
  if (existing && test.variants.includes(existing)) {
    return existing;
  }

  // ユーザーIDを取得
  const userId = getUserId();
  if (!userId) {
    return test.variants[0];
  }

  // 決定論的ハッシュでバリアント決定
  const hash = deterministicHash(userId + test.id, 100);
  const weights = test.weights || test.variants.map(() => 100 / test.variants.length);

  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (hash < cumulative) {
      const variant = test.variants[i];
      setVariantCookie(test.id, variant);
      return variant;
    }
  }

  // フォールバック
  const variant = test.variants[0];
  setVariantCookie(test.id, variant);
  return variant;
}

/**
 * コンバージョンを追跡（GA4カスタムイベント送信）
 */
export function trackConversion(testId: string, value?: number): void {
  if (typeof window === 'undefined') return;

  const variant = getVariantFromCookie(testId);
  if (!variant) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[AB Test] No variant found for test: ${testId}`);
    }
    return;
  }

  trackCustomEvent('ab_test_conversion', {
    test_id: testId,
    variant: variant,
    value: value ?? undefined,
  });

  if (process.env.NODE_ENV === 'development') {
    console.debug(`[AB Test] Conversion tracked: ${testId} -> ${variant}`, { value });
  }
}

/**
 * 全アクティブなA/Bテスト割り当てを取得
 */
export function getAllAssignments(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  const assignments: Record<string, string> = {};
  const cookies = document.cookie.split(';');

  for (const cookie of cookies) {
    const [name, value] = cookie.split('=').map((c) => c.trim());
    if (name.startsWith(COOKIE_PREFIX)) {
      const testId = name.substring(COOKIE_PREFIX.length);
      assignments[testId] = decodeURIComponent(value);
    }
  }

  return assignments;
}

/**
 * ユーザーが特定のバリアントに属しているか確認
 */
export function isInVariant(testId: string, variant: string): boolean {
  const assigned = getVariantFromCookie(testId);
  return assigned === variant;
}

/**
 * A/Bテスト割り当てをリセット（テスト用）
 */
export function resetABTest(testId: string): void {
  if (typeof window === 'undefined') return;

  document.cookie = `${COOKIE_PREFIX}${testId}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
}

/**
 * 全A/Bテスト割り当てをリセット（テスト用）
 */
export function resetAllABTests(): void {
  if (typeof window === 'undefined') return;

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const cookieName = cookie.split('=')[0].trim();
    if (cookieName.startsWith(COOKIE_PREFIX)) {
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
    }
  }
}
