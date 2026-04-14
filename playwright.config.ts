import { defineConfig, devices } from '@playwright/test';

/**
 * Astromeda EC E2E Test Configuration
 *
 * テスト対象:
 * - ブラウザ: Chromium (デスクトップ) + モバイル
 * - ベースURL: http://localhost:3000 (ローカル) or $BASE_URL環境変数
 * - タイムアウト: 30秒
 * - ロケール: 日本語 (ja-JP)
 *
 * CI環境:
 * - リトライ: 2回
 * - ワーカー: 1個 (CI環境では直列実行)
 * - HeadlessMode: true
 *
 * ローカル開発:
 * - リトライ: 0回
 * - ワーカー: 並列実行
 * - オプション: --headed で UI表示可能
 */

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30 * 1000,

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: process.env.CI ? '' : 'npm run preview',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
