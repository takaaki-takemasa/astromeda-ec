/**
 * ============================================================
 * Mock Shopify Context — 脳幹テストヘルパー (0A.03)
 *
 * 全route/loader/actionテストの共通fixture。
 * Shopify Hydrogen の AppLoadContext を模倣し、
 * Storefront API・Session・Cart・Env を提供する。
 *
 * 医学メタファー: 人工培養液
 * 全ての細胞テストを同一条件の培地で行うことで
 * 再現性を担保する。
 * ============================================================
 */

import {vi} from 'vitest';

/** Storefront API mock */
export function createMockStorefrontClient() {
  return {
    query: vi.fn().mockResolvedValue({data: {}, errors: undefined}),
    mutate: vi.fn().mockResolvedValue({data: {}, errors: undefined}),
    i18n: {language: 'JA', country: 'JP'},
    getPublicTokenHeaders: vi.fn().mockReturnValue({
      'X-Shopify-Storefront-Access-Token': 'test-token',
    }),
    getPrivateTokenHeaders: vi.fn().mockReturnValue({
      'Shopify-Storefront-Private-Token': 'test-private-token',
    }),
  };
}

/** Session mock */
export function createMockSession() {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => store.get(key)),
    set: vi.fn((key: string, value: string) => store.set(key, value)),
    unset: vi.fn((key: string) => store.delete(key)),
    has: vi.fn((key: string) => store.has(key)),
    commit: vi.fn().mockResolvedValue('mock-cookie-header'),
    destroy: vi.fn().mockResolvedValue(''),
    flash: vi.fn(),
    _store: store,
  };
}

/** Cart mock */
export function createMockCart() {
  return {
    get: vi.fn().mockResolvedValue(null),
    getCartId: vi.fn().mockReturnValue(undefined),
    setCartId: vi.fn(),
    addLines: vi.fn().mockResolvedValue({cart: {id: 'gid://shopify/Cart/1'}}),
    updateLines: vi.fn().mockResolvedValue({cart: {id: 'gid://shopify/Cart/1'}}),
    removeLines: vi.fn().mockResolvedValue({cart: {id: 'gid://shopify/Cart/1'}}),
    updateDiscountCodes: vi.fn().mockResolvedValue({cart: {id: 'gid://shopify/Cart/1'}}),
    updateBuyerIdentity: vi.fn().mockResolvedValue({cart: {id: 'gid://shopify/Cart/1'}}),
    updateNote: vi.fn().mockResolvedValue({cart: {id: 'gid://shopify/Cart/1'}}),
    updateSelectedDeliveryOption: vi.fn().mockResolvedValue({cart: {id: 'gid://shopify/Cart/1'}}),
    updateAttributes: vi.fn().mockResolvedValue({cart: {id: 'gid://shopify/Cart/1'}}),
  };
}

/** Env mock — 最小限の環境変数 */
export function createMockEnv(): Record<string, string> {
  return {
    SESSION_SECRET: 'test-session-secret',
    PUBLIC_STOREFRONT_API_TOKEN: 'test-storefront-token',
    PRIVATE_STOREFRONT_API_TOKEN: 'test-private-token',
    PUBLIC_STORE_DOMAIN: 'test-store.myshopify.com',
    PUBLIC_STOREFRONT_ID: '1000000000',
    SHOP_ID: '12345678',
    ADMIN_PASSWORD: 'test-admin-password-secure123',
    PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: 'test-client-id',
    PUBLIC_CUSTOMER_ACCOUNT_API_URL: 'https://shopify.com/test',
  };
}

/** Request factory */
export function createMockRequest(
  url = 'https://shop.mining-base.co.jp/',
  options: RequestInit = {},
): Request {
  return new Request(url, {
    method: 'GET',
    headers: new Headers({
      'Content-Type': 'application/json',
      Cookie: 'session=mock-session',
      ...Object.fromEntries(
        Object.entries(options.headers || {}).map(([k, v]) => [k, String(v)]),
      ),
    }),
    ...options,
  });
}

/** Full AppLoadContext mock */
export function createMockContext(overrides: Record<string, unknown> = {}) {
  const env = createMockEnv();
  const session = createMockSession();
  const storefront = createMockStorefrontClient();
  const cart = createMockCart();

  return {
    env,
    session,
    storefront,
    cart,
    waitUntil: vi.fn(),
    customerAccount: {
      login: vi.fn(),
      logout: vi.fn(),
      isLoggedIn: vi.fn().mockResolvedValue(false),
      handleAuthStatus: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue('test-access-token'),
      getIdToken: vi.fn().mockResolvedValue('test-id-token'),
      mutate: vi.fn(),
      query: vi.fn(),
      UNSTABLE_setBuyer: vi.fn(),
    },
    ...overrides,
  };
}

/**
 * Admin認証済みコンテキスト
 * verifyAdminAuth()が成功するセッション状態を作る
 */
export function createMockAdminContext(overrides: Record<string, unknown> = {}) {
  const ctx = createMockContext(overrides);
  ctx.session.get.mockImplementation((key: string) => {
    if (key === 'admin_authenticated') return 'true';
    if (key === 'admin_user_id') return 'admin-001';
    if (key === 'admin_session_created') return String(Date.now());
    return undefined;
  });
  return ctx;
}
