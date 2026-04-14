/**
 * セキュリティヘッダー検証テスト — H-014〜017
 *
 * 医学メタファー: 免疫力検査
 * セキュリティヘッダーが正しく設定されているか、
 * 予防医学的に定期検診を実施する。
 *
 * 注意: これは静的ガードテスト。
 * applySecurityHeaders関数のロジックを直接テストするのではなく、
 * セキュリティ設定の「仕様」をテストとして文書化する。
 */
import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SERVER_TS = fs.readFileSync(
  path.resolve(__dirname, '../../../server.ts'),
  'utf-8',
);

const ENTRY_SERVER = fs.readFileSync(
  path.resolve(__dirname, '../../entry.server.tsx'),
  'utf-8',
);

describe('セキュリティヘッダー静的ガード (H-014〜017)', () => {
  describe('server.ts — applySecurityHeaders', () => {
    it('X-Content-Type-Options: nosniff が設定されている', () => {
      expect(SERVER_TS).toContain('X-Content-Type-Options');
      expect(SERVER_TS).toContain('nosniff');
    });

    it('Strict-Transport-Security (HSTS) が設定されている', () => {
      expect(SERVER_TS).toContain('Strict-Transport-Security');
      expect(SERVER_TS).toContain('max-age=31536000');
    });

    it('Referrer-Policy が strict-origin-when-cross-origin', () => {
      expect(SERVER_TS).toContain('Referrer-Policy');
      expect(SERVER_TS).toContain('strict-origin-when-cross-origin');
    });

    it('Permissions-Policy でカメラ・マイク・位置情報を制限', () => {
      expect(SERVER_TS).toContain('Permissions-Policy');
      expect(SERVER_TS).toContain('camera=()');
      expect(SERVER_TS).toContain('microphone=()');
      expect(SERVER_TS).toContain('geolocation=()');
    });

    it('X-XSS-Protection は設定しない（CSPで代替）', () => {
      // X-XSS-Protection は廃止されたヘッダー。誤って追加されていないか確認
      expect(SERVER_TS).not.toMatch(/h\.set\(['"]X-XSS-Protection['"]/);
    });

    it('エラーレスポンスにもセキュリティヘッダーが適用される', () => {
      // catch ブロック内で applySecurityHeaders が呼ばれている
      const catchBlock = SERVER_TS.indexOf('} catch (error)');
      const afterCatch = SERVER_TS.substring(catchBlock);
      expect(afterCatch).toContain('applySecurityHeaders');
    });

    it('ヘルスチェックにもセキュリティヘッダーが適用される', () => {
      // handleHealthCheck の応答にセキュリティヘッダーが適用されている
      const healthSection = SERVER_TS.indexOf('handleHealthCheck');
      const afterHealth = SERVER_TS.substring(healthSection, healthSection + 2000);
      expect(afterHealth).toContain('applySecurityHeaders');
    });
  });

  describe('entry.server.tsx — CSPヘッダー', () => {
    it('Content-Security-Policy が設定されている', () => {
      expect(ENTRY_SERVER).toContain('Content-Security-Policy');
    });

    it('nonce-based CSP を使用している', () => {
      expect(ENTRY_SERVER).toMatch(/nonce/);
    });

    it('Strict-Transport-Security が設定されている', () => {
      expect(ENTRY_SERVER).toContain('Strict-Transport-Security');
    });
  });

  describe('セキュリティアンチパターンの不在', () => {
    it('server.ts に eval() が使用されていない', () => {
      // eval は XSS の温床
      expect(SERVER_TS).not.toMatch(/\beval\s*\(/);
    });

    it('server.ts に innerHTML が使用されていない', () => {
      expect(SERVER_TS).not.toContain('innerHTML');
    });

    it('server.ts に document.write が使用されていない', () => {
      expect(SERVER_TS).not.toContain('document.write');
    });
  });
});

describe('APIトークン漏洩スキャン (H-018)', () => {
  const SRC_DIR = path.resolve(__dirname, '../../');

  /** 再帰的にファイルを列挙 */
  function walkSync(dir: string, exts: string[]): string[] {
    const files: string[] = [];
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        files.push(...walkSync(full, exts));
      } else if (exts.some((e) => entry.name.endsWith(e))) {
        files.push(full);
      }
    }
    return files;
  }

  const sourceFiles = walkSync(SRC_DIR, ['.ts', '.tsx']);

  it('ハードコードされたAPIキーパターンが存在しない', () => {
    const apiKeyPatterns = [
      /['"]shpat_[a-zA-Z0-9]{32,}['"]/,      // Shopify Admin API token
      /['"]shpca_[a-zA-Z0-9]{32,}['"]/,       // Shopify Custom App token
      /['"]sk_live_[a-zA-Z0-9]{20,}['"]/,     // Stripe secret key
      /['"]sk_test_[a-zA-Z0-9]{20,}['"]/,     // Stripe test key
      /['"]AKIA[A-Z0-9]{16}['"]/,             // AWS access key
    ];

    const violations: string[] = [];
    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of apiKeyPatterns) {
        if (pattern.test(content)) {
          violations.push(`${path.relative(SRC_DIR, file)}: ${pattern.source}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('環境変数が直接ハードコードされていない（SESSION_SECRET等）', () => {
    const dangerousPatterns = [
      /SESSION_SECRET\s*=\s*['"][^'"]{8,}['"]/,
      /ADMIN_PASSWORD\s*=\s*['"][^'"]{4,}['"]/,
    ];

    const violations: string[] = [];
    for (const file of sourceFiles) {
      // テストファイルとドキュメントは除外
      if (file.includes('__tests__') || file.includes('.test.')) continue;
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of dangerousPatterns) {
        if (pattern.test(content)) {
          violations.push(`${path.relative(SRC_DIR, file)}: ${pattern.source}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
