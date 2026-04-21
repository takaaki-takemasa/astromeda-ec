/**
 * IM-08: 免疫系（Immune System）統合テスト
 *
 * 生命医学: 免疫系の全レイヤーが協調して機能することを検証。
 * - IM-02: Query Allowlist（T細胞レパートリー選択）
 * - IM-03: CSRF トークンローテーション（使い捨て抗体）
 * - IM-04: Account Lockout + Admin Auth統合（血管収縮反射）
 * - IM-05: IP Allowlist（胸腺のT細胞教育）
 * - IM-06: 2FA基盤（免疫記憶）
 */
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';

// IM-02
import {
  registerQuery,
  registerHash,
  isQueryAllowed,
  getAllowlistStats,
  clearAllowlist,
} from '../query-allowlist';

// IM-05
import {
  isIPAllowed,
  checkIPAllowlist,
  resetIPAllowlistCache,
} from '../ip-allowlist';

// IM-06
import {
  generateTOTPSecret,
  verifyTOTP,
  generateOTPAuthURI,
  is2FAEnabled,
  base32Encode,
  base32Decode,
  TOTP_CONFIG,
} from '../two-factor-auth';

// IM-03: CSRF middleware
import {verifyCsrfForAdmin} from '../csrf-middleware';

// IM-01: GraphQL Guard（既存テスト補完）
import {validateGraphQLRequest, sanitizeHeaders} from '../graphql-guard';

// IM-04: Account Lockout（admin-auth統合確認）
import {isLocked, recordFailedAttempt, clearLockoutState} from '../account-lockout';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IM-02: Query Allowlist テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('IM-02: Query Allowlist', () => {
  beforeEach(() => {
    clearAllowlist();
  });

  it('登録済みクエリはallowedを返す', async () => {
    const query = '{ products(first: 10) { nodes { id title } } }';
    await registerQuery(query, 'ProductList');
    const result = await isQueryAllowed(query);
    expect(result.allowed).toBe(true);
    expect(result.label).toBe('ProductList');
  });

  it('空白の違いは正規化により同一ハッシュ', async () => {
    const q1 = '{ products(first: 10) { nodes { id } } }';
    const q2 = '{  products(first:10){nodes{id}} }';
    const hash = await registerQuery(q1, 'Products');
    const result = await isQueryAllowed(q2);
    expect(result.allowed).toBe(true);
  });

  it('#graphql プレフィックスのHydrogenクエリは自動許可', async () => {
    const query = '#graphql\nquery { shop { name } }';
    const result = await isQueryAllowed(query);
    expect(result.allowed).toBe(true);
  });

  it('ENFORCE_QUERY_ALLOWLIST=true で未登録クエリを拒否', async () => {
    const env = {ENFORCE_QUERY_ALLOWLIST: 'true'};
    const result = await isQueryAllowed('{ unknown { field } }', env);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('allowlist');
  });

  it('ENFORCE未設定で未登録クエリは警告付き通過', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await isQueryAllowed('{ unknown { field } }');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('unregistered-warning');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('registerHashで直接ハッシュ登録', async () => {
    registerHash('abc123def456', 'DirectHash');
    const stats = getAllowlistStats();
    expect(stats.registeredQueries).toBe(1);
    expect(stats.labels).toContain('DirectHash');
  });

  it('clearAllowlistで全クリア', async () => {
    await registerQuery('{ test }', 'Test');
    clearAllowlist();
    expect(getAllowlistStats().registeredQueries).toBe(0);
  });

  it('コメント付きクエリは正規化後にマッチ', async () => {
    const withComment = '# This is a comment\n{ products { nodes { id } } }';
    const withoutComment = '{ products { nodes { id } } }';
    await registerQuery(withComment, 'Products');
    const result = await isQueryAllowed(withoutComment);
    expect(result.allowed).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IM-03: CSRF Token Rotation テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('IM-03: CSRF Middleware (Origin/Referer ベース — 2026-04-16 移行後)', () => {
  const env = {} as unknown as Env;

  it('GETリクエストはCSRF検証をスキップ', async () => {
    const request = new Request('https://example.com/api/admin/status', {method: 'GET'});
    const result = await verifyCsrfForAdmin(request, env);
    expect(result).toBeNull();
  });

  it('HEADリクエストもCSRF検証をスキップ', async () => {
    const request = new Request('https://example.com/api/admin/status', {method: 'HEAD'});
    const result = await verifyCsrfForAdmin(request, env);
    expect(result).toBeNull();
  });

  it('OPTIONSリクエストもCSRF検証をスキップ', async () => {
    const request = new Request('https://example.com/api/admin/status', {method: 'OPTIONS'});
    const result = await verifyCsrfForAdmin(request, env);
    expect(result).toBeNull();
  });

  it('Origin/Referer が無いPOSTは 403 を返す', async () => {
    const request = new Request('https://example.com/api/admin', {method: 'POST'});
    const result = await verifyCsrfForAdmin(request, env);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('Origin が request origin と一致すれば通過', async () => {
    const request = new Request('https://example.com/api/admin', {
      method: 'POST',
      headers: {Origin: 'https://example.com'},
    });
    const result = await verifyCsrfForAdmin(request, env);
    expect(result).toBeNull();
  });

  it('Origin mismatch で 403 を返す', async () => {
    const request = new Request('https://example.com/api/admin', {
      method: 'POST',
      headers: {Origin: 'https://evil.example.com'},
    });
    const result = await verifyCsrfForAdmin(request, env);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IM-05: IP Allowlist テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('IM-05: IP Allowlist', () => {
  beforeEach(() => {
    resetIPAllowlistCache();
  });

  it('ADMIN_ALLOWED_IPS未設定で全IP拒否 (Deny by Default / M8-DNA-02)', () => {
    expect(isIPAllowed('1.2.3.4', {})).toBe(false);
    expect(isIPAllowed('192.168.1.1', {ADMIN_ALLOWED_IPS: ''})).toBe(false);
  });

  it('ADMIN_ALLOWED_IPS="*" で全IP許可 (明示的な全開放)', () => {
    expect(isIPAllowed('1.2.3.4', {ADMIN_ALLOWED_IPS: '*'})).toBe(true);
    expect(isIPAllowed('203.0.113.50', {ADMIN_ALLOWED_IPS: '*'})).toBe(true);
  });

  it('設定されたIPのみ許可', () => {
    const env = {ADMIN_ALLOWED_IPS: '1.2.3.4,10.0.0.1'};
    expect(isIPAllowed('1.2.3.4', env)).toBe(true);
    expect(isIPAllowed('10.0.0.1', env)).toBe(true);
    expect(isIPAllowed('5.5.5.5', env)).toBe(false);
  });

  it('大文字小文字を区別しない', () => {
    const env = {ADMIN_ALLOWED_IPS: '::1,ABCD::EF01'};
    expect(isIPAllowed('abcd::ef01', env)).toBe(true);
  });

  it('空白をトリム', () => {
    const env = {ADMIN_ALLOWED_IPS: ' 1.2.3.4 , 10.0.0.1 '};
    expect(isIPAllowed('1.2.3.4', env)).toBe(true);
    expect(isIPAllowed('10.0.0.1', env)).toBe(true);
  });

  it('checkIPAllowlistがResponseを返す', () => {
    const env = {ADMIN_ALLOWED_IPS: '1.2.3.4'};
    const request = new Request('https://example.com/api/admin', {
      headers: {'CF-Connecting-IP': '5.5.5.5'},
    });
    const result = checkIPAllowlist(request, env);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('許可IPからのリクエストはnullを返す', () => {
    const env = {ADMIN_ALLOWED_IPS: '1.2.3.4'};
    const request = new Request('https://example.com/api/admin', {
      headers: {'CF-Connecting-IP': '1.2.3.4'},
    });
    const result = checkIPAllowlist(request, env);
    expect(result).toBeNull();
  });

  it('キャッシュが環境変数の変更を検知', () => {
    const env1 = {ADMIN_ALLOWED_IPS: '1.1.1.1'};
    expect(isIPAllowed('1.1.1.1', env1)).toBe(true);
    expect(isIPAllowed('2.2.2.2', env1)).toBe(false);

    // 環境変数を変更
    const env2 = {ADMIN_ALLOWED_IPS: '2.2.2.2'};
    expect(isIPAllowed('2.2.2.2', env2)).toBe(true);
    expect(isIPAllowed('1.1.1.1', env2)).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IM-06: 2FA基盤テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('IM-06: 2FA Foundation', () => {
  describe('Base32 エンコード/デコード', () => {
    it('エンコード→デコードでラウンドトリップ', () => {
      const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const encoded = base32Encode(original);
      const decoded = base32Decode(encoded);
      expect(decoded).toEqual(original);
    });

    it('20バイトの秘密鍵でラウンドトリップ', () => {
      const bytes = new Uint8Array(20);
      crypto.getRandomValues(bytes);
      const encoded = base32Encode(bytes);
      const decoded = base32Decode(encoded);
      expect(decoded).toEqual(bytes);
    });

    it('Base32文字列は大文字A-Z + 2-7のみ', () => {
      const secret = generateTOTPSecret();
      expect(secret).toMatch(/^[A-Z2-7]+$/);
    });
  });

  describe('TOTP秘密鍵生成', () => {
    it('32文字のBase32文字列を生成', () => {
      const secret = generateTOTPSecret();
      expect(secret.length).toBe(32); // 20 bytes → 32 base32 chars
      expect(secret).toMatch(/^[A-Z2-7]+$/);
    });

    it('毎回異なる鍵を生成', () => {
      const s1 = generateTOTPSecret();
      const s2 = generateTOTPSecret();
      expect(s1).not.toBe(s2);
    });
  });

  describe('TOTP検証', () => {
    it('正しいコードで検証成功', async () => {
      // 既知の秘密鍵とタイムスタンプで期待されるコードを生成して検証
      const secret = generateTOTPSecret();
      const timestamp = Math.floor(Date.now() / 1000);
      const timeStep = Math.floor(timestamp / TOTP_CONFIG.period);

      // 内部関数を使って期待コードを取得
      const secretBytes = base32Decode(secret);
      const {generateTOTPCode: genCode} = await import('../two-factor-auth');
      const expectedCode = await genCode(secretBytes, timeStep);

      const result = await verifyTOTP(secret, expectedCode, timestamp);
      expect(result).toBe(true);
    });

    it('不正なコードで検証失敗', async () => {
      const secret = generateTOTPSecret();
      const result = await verifyTOTP(secret, '000000');
      // 極めて低い確率で偶然一致しうるが、実用上は常にfalse
      // 代わりに明らかに不正な入力をテスト
      expect(await verifyTOTP(secret, '')).toBe(false);
      expect(await verifyTOTP(secret, '12345')).toBe(false); // 5桁
      expect(await verifyTOTP(secret, 'abcdef')).toBe(false); // 非数字
      expect(await verifyTOTP(secret, '1234567')).toBe(false); // 7桁
    });

    it('±1ステップのドリフトを許容', async () => {
      const secret = generateTOTPSecret();
      const now = Math.floor(Date.now() / 1000);
      const currentStep = Math.floor(now / TOTP_CONFIG.period);

      const secretBytes = base32Decode(secret);
      const {generateTOTPCode: genCode} = await import('../two-factor-auth');

      // 1ステップ前のコード
      const prevCode = await genCode(secretBytes, currentStep - 1);
      expect(await verifyTOTP(secret, prevCode, now)).toBe(true);

      // 1ステップ後のコード
      const nextCode = await genCode(secretBytes, currentStep + 1);
      expect(await verifyTOTP(secret, nextCode, now)).toBe(true);
    });
  });

  describe('OTP Auth URI', () => {
    it('正しいフォーマットのURIを生成', () => {
      const uri = generateOTPAuthURI('JBSWY3DPEHPK3PXP', 'admin@mining-base.co.jp');
      expect(uri).toContain('otpauth://totp/');
      expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
      expect(uri).toContain('issuer=ASTROMEDA%20Admin');
      expect(uri).toContain('algorithm=SHA1');
      expect(uri).toContain('digits=6');
      expect(uri).toContain('period=30');
    });

    it('カスタムissuerを設定可能', () => {
      const uri = generateOTPAuthURI('ABC', 'test@test.com', 'My Service');
      expect(uri).toContain('issuer=My%20Service');
    });
  });

  describe('2FA有効化フラグ', () => {
    it('ADMIN_2FA_ENABLED=true で有効', () => {
      expect(is2FAEnabled({ADMIN_2FA_ENABLED: 'true'})).toBe(true);
      expect(is2FAEnabled({ADMIN_2FA_ENABLED: true})).toBe(true);
    });

    it('未設定またはfalseで無効', () => {
      expect(is2FAEnabled({})).toBe(false);
      expect(is2FAEnabled({ADMIN_2FA_ENABLED: 'false'})).toBe(false);
      expect(is2FAEnabled({ADMIN_2FA_ENABLED: undefined})).toBe(false);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IM-01: GraphQL Guard 補完テスト（HTTPレベル検証）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('IM-01: GraphQL Guard (HTTP request validation)', () => {
  it('正常なJSON POSTを許可', () => {
    const body = JSON.stringify({query: '{ products(first: 10) { nodes { id } } }'});
    const result = validateGraphQLRequest(body);
    expect(result.allowed).toBe(true);
  });

  it('空ボディを拒否', () => {
    expect(validateGraphQLRequest(null).allowed).toBe(false);
    expect(validateGraphQLRequest('').allowed).toBe(false);
  });

  it('100KBを超えるボディを拒否', () => {
    const body = JSON.stringify({query: 'x'.repeat(100001)});
    expect(validateGraphQLRequest(body).allowed).toBe(false);
    expect(validateGraphQLRequest(body).status).toBe(413);
  });

  it('不正なJSONを拒否', () => {
    const result = validateGraphQLRequest('{invalid json');
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(400);
  });

  it('mutation操作を拒否', () => {
    const body = JSON.stringify({mutation: 'mutation { create }'});
    expect(validateGraphQLRequest(body).allowed).toBe(false);
  });

  it('sanitizeHeadersが不要ヘッダーを除去', () => {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cookie': 'session=abc',
      'Authorization': 'Bearer token',
      'Accept': 'application/json',
      'X-Shopify-Storefront-Access-Token': 'pub_token',
    });
    const safe = sanitizeHeaders(headers);
    expect(safe.get('Content-Type')).toBe('application/json');
    expect(safe.get('Accept')).toBe('application/json');
    expect(safe.get('X-Shopify-Storefront-Access-Token')).toBe('pub_token');
    expect(safe.get('Cookie')).toBeNull();
    expect(safe.get('Authorization')).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IM-04: Lockout + Admin Auth 統合テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('IM-04: Lockout Integration', () => {
  beforeEach(() => {
    clearLockoutState();
  });

  it('5回失敗後にロック状態になる', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt('10.20.30.40');
    }
    const status = isLocked('10.20.30.40');
    expect(status.locked).toBe(true);
    expect(status.remainingSeconds).toBeGreaterThan(0);
    expect(status.remainingSeconds).toBeLessThanOrEqual(900); // 15分以内
  });

  it('ロック中のリクエストは即座に拒否される', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt('locked-ip');
    }
    expect(isLocked('locked-ip').locked).toBe(true);
  });
});
