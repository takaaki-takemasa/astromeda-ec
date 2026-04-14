/**
 * チェックアウト追跡ユーティリティ
 *
 * 医学メタファー: 分娩モニタリング（CTGモニター）
 * チェックアウトの各段階を追跡し、離脱ポイントを特定する。
 *
 * ファネル: カート → チェックアウト開始 → 配送入力 → 決済入力 → 購入完了
 * 各段階の離脱率を計測し、コンバージョン率改善に活用。
 *
 * sessionStorageを使ってクライアントサイドでステップ追跡。
 * Oxygen/Workersサーバーサイドでは使わない（クライアント専用）。
 */

/** チェックアウトファネルのステップ定義 */
export type CheckoutStep =
  | 'cart_view'         // カート閲覧
  | 'begin_checkout'    // チェックアウト開始（Shopifyへリダイレクト）
  | 'purchase_complete'; // 購入完了（Webhook or 注文確認ページ）

interface CheckoutSession {
  cartId?: string;
  startedAt: number;
  steps: Array<{
    step: CheckoutStep;
    timestamp: number;
  }>;
  totalAmount?: number;
  itemCount?: number;
  currency?: string;
}

const STORAGE_KEY = 'astro_checkout_session';

/** クライアントサイドのみ動作 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

/**
 * チェックアウトセッションの開始/更新
 */
export function startCheckoutSession(data: {
  cartId?: string;
  totalAmount?: number;
  itemCount?: number;
  currency?: string;
}): void {
  if (!isBrowser()) return;
  try {
    const session: CheckoutSession = {
      cartId: data.cartId,
      startedAt: Date.now(),
      steps: [{ step: 'cart_view', timestamp: Date.now() }],
      totalAmount: data.totalAmount,
      itemCount: data.itemCount,
      currency: data.currency,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // sessionStorage quota exceeded or blocked
  }
}

/**
 * チェックアウトステップを記録
 */
export function recordCheckoutStep(step: CheckoutStep): void {
  if (!isBrowser()) return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const session = JSON.parse(raw) as CheckoutSession;
    session.steps.push({ step, timestamp: Date.now() });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

/**
 * チェックアウトセッション取得
 */
export function getCheckoutSession(): CheckoutSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CheckoutSession) : null;
  } catch {
    return null;
  }
}

/**
 * チェックアウトセッション完了（クリーンアップ）
 */
export function completeCheckoutSession(): CheckoutSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as CheckoutSession;
    session.steps.push({ step: 'purchase_complete', timestamp: Date.now() });
    sessionStorage.removeItem(STORAGE_KEY);
    return session;
  } catch {
    return null;
  }
}

/**
 * カート放棄検出用: セッションが存在するが一定時間経過している場合
 */
export function detectCartAbandonment(thresholdMs = 30 * 60 * 1000): CheckoutSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as CheckoutSession;
    const lastStep = session.steps[session.steps.length - 1];
    if (lastStep && Date.now() - lastStep.timestamp > thresholdMs) {
      return session;
    }
    return null;
  } catch {
    return null;
  }
}
