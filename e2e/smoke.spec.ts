import { test, expect } from '@playwright/test';

/**
 * Astromeda EC Smoke Tests — スモークテスト
 *
 * 目的: 各主要ルートが正常に読み込まれ、エラーが出ていないことを確認
 * - ホームページが正常に読み込まれるか
 * - コレクションページが正常に表示されるか
 * - 商品詳細ページが正常に表示されるか
 * - FAQページが表示されるか
 * - robots.txtが取得可能か
 * - ヘルスチェックAPIが正常に動作しているか
 *
 * 実行方法:
 * npm run e2e                 # CI/ヘッドレスモード
 * npm run e2e:headed         # UI表示モード
 * npm run e2e -- --project=mobile  # モバイルのみ
 */

test.describe('Astromeda EC Smoke Tests', () => {
  test('homepage loads successfully', async ({ page }) => {
    // トップページにナビゲート
    await page.goto('/');

    // ページタイトルに「ASTROMEDA」が含まれているか確認
    await expect(page).toHaveTitle(/ASTROMEDA/i);

    // HeroSliderが表示されているか確認
    const heroSection = page.locator('h1').first();
    await expect(heroSection).toBeVisible();

    // コンソールエラーがないか確認
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.waitForLoadState('networkidle');
    expect(consoleErrors).toEqual([]);
  });

  test('collection page loads with products', async ({ page }) => {
    // コレクションページにナビゲート（呪術廻戦コラボ）
    await page.goto('/collections/jujutsukaisen-collaboration');

    // 見出しが表示されているか確認
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();

    // 商品グリッドが表示されているか確認
    const productCard = page.locator('[data-testid="product-card"]').first();
    await expect(productCard).toBeVisible({ timeout: 10000 });

    // ページが正常に読み込まれたか確認
    await expect(page).toHaveURL(/\/collections\//);
  });

  test('product detail page displays correctly', async ({ page }) => {
    // 商品詳細ページにナビゲート
    await page.goto('/products/BLACKBOX-Core-i9-RTX-5090');

    // 商品タイトルが表示されているか確認
    const title = page.locator('h1').first();
    await expect(title).toBeVisible();

    // 価格が表示されているか確認
    const price = page.locator('text=/¥/').first();
    await expect(price).toBeVisible();

    // カートに追加ボタンが表示されているか確認
    const addToCartButton = page.locator('button', { hasText: /カートに追加|Add to Cart/ }).first();
    await expect(addToCartButton).toBeVisible();
  });

  test('FAQ page displays correctly', async ({ page }) => {
    // FAQページにナビゲート
    await page.goto('/faq');

    // FAQページのタイトルが表示されているか確認
    const title = page.locator('h1', { hasText: /よくある質問|FAQ/ });
    await expect(title).toBeVisible();

    // アコーディオンアイテムが表示されているか確認
    const faqItem = page.locator('[role="button"]').first();
    await expect(faqItem).toBeVisible();

    // クリックして回答が表示されるか確認
    await faqItem.click();
    const answer = page.locator('text=/答え|Answer|はい/').first();
    await expect(answer).toBeVisible();
  });

  test('robots.txt is accessible', async ({ page }) => {
    // robots.txtを取得
    const response = await page.goto('/robots.txt');

    // ステータスコード200が返されているか確認
    expect(response?.status()).toBe(200);

    // robots.txtの内容が存在するか確認
    const content = await response?.text();
    expect(content).toBeTruthy();
    expect(content).toContain('User-agent');
  });

  test('health check endpoint returns ok', async ({ page }) => {
    // ヘルスチェックエンドポイントにアクセス
    const response = await page.goto('/api/health');

    // ステータスコード200が返されているか確認
    expect(response?.status()).toBe(200);

    // レスポンスがJSON形式か確認
    expect(response?.headers()['content-type']).toContain('application/json');

    // JSONをパース
    const body = await response?.json();
    expect(body).toBeDefined();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeTruthy();
    expect(body.agents).toBeTruthy();

    // エージェント数が「X/23 ready」形式か確認
    expect(body.agents).toMatch(/^\d+\/\d+\s+ready$/);
  });

  test('sitemap.xml is accessible', async ({ page }) => {
    // sitemap.xmlを取得
    const response = await page.goto('/sitemap.xml');

    // ステータスコード200が返されているか確認
    expect(response?.status()).toBe(200);

    // XMLコンテンツが存在するか確認
    const content = await response?.text();
    expect(content).toBeTruthy();
    expect(content).toContain('<?xml');
    expect(content).toContain('<urlset');
  });

  test('llms.txt is accessible', async ({ page }) => {
    // llms.txtを取得
    const response = await page.goto('/llms.txt');

    // ステータスコード200が返されているか確認
    expect(response?.status()).toBe(200);

    // テキストコンテンツが存在するか確認
    const content = await response?.text();
    expect(content).toBeTruthy();
  });

  test('no console errors on homepage', async ({ page, context }) => {
    const errors: string[] = [];

    // エラーログをキャプチャ
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // ネットワークエラーをキャプチャ
    page.on('response', (response) => {
      if (response.status() >= 400) {
        errors.push(`HTTP ${response.status()}: ${response.url()}`);
      }
    });

    // ホームページにナビゲート
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // エラーがないか確認
    expect(errors).toEqual([]);
  });

  test('navigation links are functional', async ({ page }) => {
    // トップページにナビゲート
    await page.goto('/');

    // コレクションリンクをクリック
    const collectionLink = page.locator('a[href*="/collections/"]').first();
    if (await collectionLink.isVisible()) {
      await collectionLink.click();
      await page.waitForLoadState('networkidle');

      // ナビゲーションが成功したか確認
      expect(page.url()).toContain('/collections/');
    }
  });

  test('responsive design on mobile', async ({ page }) => {
    // モバイルビューポートを設定
    await page.setViewportSize({ width: 375, height: 667 });

    // トップページにナビゲート
    await page.goto('/');

    // ハンバーガーメニューが表示されているか確認
    const mobileMenu = page.locator('button[aria-label*="menu"], button[aria-label*="hamburger"]').first();
    if (await mobileMenu.isVisible()) {
      expect(mobileMenu).toBeVisible();
    }

    // コンテンツが表示されているか確認
    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible();
  });
});
