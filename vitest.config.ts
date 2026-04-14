/**
 * ============================================================
 * Vitest Configuration — 神経系の電気信号測定器
 *
 * 医学メタファー: 心電図モニター
 * 全ての臓器（モジュール）が正常に機能しているかを
 * 非侵襲的にモニタリングする。異常があれば即座に検知。
 * ============================================================
 */
import {defineConfig} from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'app'),
    },
  },
  test: {
    // テスト環境: Node.js（Oxygen Workers互換）
    environment: 'node',

    // テストファイルのグロブパターン
    include: [
      'app/**/*.test.{ts,tsx}',
      'agents/**/__tests__/**/*.test.ts',
      'tests/**/*.test.ts',
    ],

    // 除外パターン
    exclude: [
      'node_modules',
      'dist',
      '.react-router',
      'build',
      '**/archive/**', // レガシーテスト（archive/legacy-tests/に移動済み）
      'archive/**',
      'agents/integration/**', // 統合テスト（完全インフラ必要）
    ],

    // グローバルAPI（describe, it, expect を import不要に）
    globals: true,

    // カバレッジ設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['app/lib/**/*.ts', 'agents/**/*.ts'],
      exclude: [
        'node_modules',
        '**/*.test.ts',
        '**/__tests__/**',
        'app/lib/astromeda-data.ts', // 静的データ
      ],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },

    // タイムアウト: 10秒（API呼び出し含むテスト用）
    testTimeout: 10_000,

    // セットアップファイル
    setupFiles: ['./tests/setup.ts'],
  },
});
