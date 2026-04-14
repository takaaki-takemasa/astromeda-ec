/**
 * ============================================================
 * テストセットアップ — 検査室の準備
 *
 * 全テスト実行前に環境を整える。
 * 医学メタファー: 手術室の滅菌処理
 * ============================================================
 */

// テスト用環境変数のデフォルト設定
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.PUBLIC_STOREFRONT_API_TOKEN = process.env.PUBLIC_STOREFRONT_API_TOKEN || 'test-storefront-token';
process.env.PRIVATE_STOREFRONT_API_TOKEN = process.env.PRIVATE_STOREFRONT_API_TOKEN || 'test-private-token';
process.env.PUBLIC_STORE_DOMAIN = process.env.PUBLIC_STORE_DOMAIN || 'test-store.myshopify.com';
process.env.PUBLIC_STOREFRONT_ID = process.env.PUBLIC_STOREFRONT_ID || '1000000000';
process.env.SHOP_ID = process.env.SHOP_ID || '12345678';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password';
process.env.PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID = process.env.PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID || 'test-client-id';

// Console warn/error をキャプチャ（テスト後に検証可能）
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  // テスト中の不要な警告を抑制（必要に応じて）
  console.warn = (...args: unknown[]) => {
    // React Router の警告など、テストに関係ない警告を除外
    const msg = String(args[0]);
    if (msg.includes('React Router') || msg.includes('Deprecation')) return;
    originalWarn(...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});
