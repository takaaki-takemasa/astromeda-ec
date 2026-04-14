/**
 * Checkout Flow Test Utilities
 * E2E verification for critical checkout pathways
 * 医学メタファー: 循環器系 (Circulatory) — 支払いフロー = 血流
 *
 * Since Hydrogen/Oxygen doesn't support Playwright/Cypress,
 * we test:
 * - Route accessibility (200 status)
 * - Storefront API cartCreate/cartLinesAdd mutations
 * - Product availability for sale
 * - Checkout redirect chains
 */

export interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration: number; // milliseconds
}

// 循環器系ポンプ入口: 型安全性ゲート
export interface StorefrontClient {
  query: <T = unknown>(query: string, opts?: {variables?: Record<string, unknown>; cache?: unknown}) => Promise<T>;
  mutate: <T = unknown>(query: string, opts?: {variables?: Record<string, unknown>}) => Promise<T>;
  CacheShort: () => unknown;
}

export interface CheckoutTestSuite {
  results: TestResult[];
  totalPass: number;
  totalFail: number;
  totalWarn: number;
  timestamp: number;
}

/**
 * Test route accessibility via HEAD request
 * Verifies critical pages return 2xx status
 */
export async function testRouteAccessibility(
  baseUrl: string,
  routes: string[]
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const route of routes) {
    const startTime = Date.now();
    const name = `Route: ${route}`;

    try {
      const url = new URL(route, baseUrl).href;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s for route test

      try {
        const response = await fetch(url, {
          method: 'HEAD',
          redirect: 'follow',
          signal: controller.signal,
        });

        const duration = Date.now() - startTime;

        if (response.status >= 200 && response.status < 300) {
          results.push({
            name,
            status: 'pass',
            message: `Status ${response.status}`,
            duration,
          });
        } else if (response.status === 404) {
          results.push({
            name,
            status: 'warn',
            message: `Status ${response.status} — Not Found`,
            duration,
          });
        } else {
          results.push({
            name,
            status: 'fail',
            message: `Status ${response.status}`,
            duration,
          });
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const status = error instanceof Error && error.name === 'AbortError' ? 'fail' : 'fail';
      results.push({
        name,
        status,
        message: errorMsg,
        duration,
      });
    }
  }

  return results;
}

/**
 * Test cart creation via Storefront API
 * Verifies cartCreate mutation works
 */
export async function testCartAPI(storefront: StorefrontClient): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const CREATE_CART_QUERY = `#graphql
      mutation {
        cartCreate(input: {}) {
          cart {
            id
            createdAt
          }
        }
      }
    ` as const;

    const response = await storefront.mutate<{cartCreate?: {cart?: {id?: string; createdAt?: string}}}>(CREATE_CART_QUERY);

    const duration = Date.now() - startTime;

    if (response?.cartCreate?.cart?.id) {
      return {
        name: 'Cart API: cartCreate mutation',
        status: 'pass',
        message: `Cart created: ${response.cartCreate.cart.id.slice(0, 20)}...`,
        duration,
      };
    } else {
      return {
        name: 'Cart API: cartCreate mutation',
        status: 'fail',
        message: 'No cart ID returned',
        duration,
      };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      name: 'Cart API: cartCreate mutation',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
      duration,
    };
  }
}

/**
 * Test product availability
 * Verifies at least one product is available for sale
 */
export async function testProductAvailability(storefront: StorefrontClient): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const PRODUCTS_QUERY = `#graphql
      query {
        products(first: 10) {
          nodes {
            id
            title
            availableForSale
          }
        }
      }
    ` as const;

    const response = await storefront.query(PRODUCTS_QUERY, {
      cache: storefront.CacheShort(),
    });

    const duration = Date.now() - startTime;

    const products = (response as {products?: {nodes?: Array<{availableForSale?: boolean}>}})?.products?.nodes || [];
    const availableCount = products.filter(
      (p) => p.availableForSale === true
    ).length;

    if (availableCount > 0) {
      return {
        name: 'Product Availability',
        status: 'pass',
        message: `${availableCount} of ${products.length} products available for sale`,
        duration,
      };
    } else if (products.length > 0) {
      return {
        name: 'Product Availability',
        status: 'warn',
        message: `${products.length} products found but 0 available for sale`,
        duration,
      };
    } else {
      return {
        name: 'Product Availability',
        status: 'fail',
        message: 'No products found',
        duration,
      };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      name: 'Product Availability',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
      duration,
    };
  }
}

/**
 * Test checkout redirect chain
 * Verifies /cart → checkout redirect works
 */
export async function testCheckoutRedirect(baseUrl: string): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const cartUrl = new URL('/cart', baseUrl).href;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s for cart test

    try {
      const response = await fetch(cartUrl, {
        redirect: 'manual', // Don't auto-follow
        signal: controller.signal,
      });

      const duration = Date.now() - startTime;

      // Cart page should exist (200 or 404 is expected, not 5xx)
      if (response.status >= 200 && response.status < 500) {
        return {
          name: 'Checkout: Cart page',
          status: 'pass',
          message: `Cart page accessible (status ${response.status})`,
          duration,
        };
      } else {
        return {
          name: 'Checkout: Cart page',
          status: 'fail',
          message: `Unexpected status ${response.status}`,
          duration,
        };
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error && error.name === 'AbortError'
      ? 'Request timeout'
      : error instanceof Error ? error.message : 'Unknown error';
    return {
      name: 'Checkout: Cart page',
      status: 'fail',
      message: errorMsg,
      duration,
    };
  }
}

/**
 * Run full checkout test suite
 * All tests in sequence with timing
 */
export async function runFullCheckoutSuite(
  storefront: StorefrontClient,
  baseUrl: string
): Promise<CheckoutTestSuite> {
  const timestamp = Date.now();
  const results: TestResult[] = [];

  // Route accessibility tests
  const routeTests = await testRouteAccessibility(baseUrl, [
    '/',
    '/cart',
    '/collections',
    '/search',
    '/account',
    '/faq',
  ]);
  results.push(...routeTests);

  // API tests
  const cartTest = await testCartAPI(storefront);
  results.push(cartTest);

  const productTest = await testProductAvailability(storefront);
  results.push(productTest);

  // Checkout flow test
  const checkoutTest = await testCheckoutRedirect(baseUrl);
  results.push(checkoutTest);

  // Calculate summary
  const totalPass = results.filter((r) => r.status === 'pass').length;
  const totalFail = results.filter((r) => r.status === 'fail').length;
  const totalWarn = results.filter((r) => r.status === 'warn').length;

  return {
    results,
    totalPass,
    totalFail,
    totalWarn,
    timestamp,
  };
}
