/**
 * API Schemas Tests — 免疫受容体の検証（S-04テスト）
 *
 * 各Zodスキーマが:
 * 1. 正常な入力を受け入れる
 * 2. 不正な入力を拒否する
 * 3. HTMLインジェクションを拒否する
 * 4. 未知フィールドを拒否する（.strict()）
 */
import { describe, it, expect } from 'vitest';
import {
  AndonActionSchema,
  QuickActionSchema,
  SchedulerActionSchema,
  PipelineActionSchema,
  BannerActionSchema,
  CampaignActionSchema,
  ContentActionSchema,
  ApprovalActionSchema,
  AIActionSchema,
  UserActionSchema,
  PasswordChangeSchema,
  PSIActionSchema,
  IndexNowSchema,
  QRCodeQuerySchema,
  PredictiveSearchQuerySchema,
  RecommendationsQuerySchema,
} from '../api-schemas';

describe('API Schemas (S-04 免疫受容体)', () => {

  // ── ANDON ──
  describe('AndonActionSchema', () => {
    it('正常: pull アクション', () => {
      const result = AndonActionSchema.safeParse({ action: 'pull', reason: 'テスト停止' });
      expect(result.success).toBe(true);
    });

    it('正常: clear アクション（reason省略→デフォルト）', () => {
      const result = AndonActionSchema.safeParse({ action: 'clear' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.reason).toBe('CEO操作');
    });

    it('拒否: 不正なaction', () => {
      const result = AndonActionSchema.safeParse({ action: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('拒否: HTMLタグ含むreason', () => {
      const result = AndonActionSchema.safeParse({
        action: 'pull',
        reason: '<script>alert(1)</script>',
      });
      expect(result.success).toBe(false);
    });

    it('拒否: 未知フィールド', () => {
      const result = AndonActionSchema.safeParse({
        action: 'pull',
        malicious: 'data',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── ユーザー管理（discriminatedUnion） ──
  describe('UserActionSchema', () => {
    it('正常: create', () => {
      const result = UserActionSchema.safeParse({
        action: 'create',
        email: 'test@example.com',
        displayName: 'テストユーザー',
        role: 'editor',
        password: 'SecureP@ss123!',
      });
      expect(result.success).toBe(true);
    });

    it('正常: deactivate', () => {
      const result = UserActionSchema.safeParse({
        action: 'deactivate',
        userId: 'user-123',
      });
      expect(result.success).toBe(true);
    });

    it('正常: changeRole', () => {
      const result = UserActionSchema.safeParse({
        action: 'changeRole',
        userId: 'user-123',
        newRole: 'admin',
      });
      expect(result.success).toBe(true);
    });

    it('拒否: create で短いパスワード', () => {
      const result = UserActionSchema.safeParse({
        action: 'create',
        email: 'test@example.com',
        displayName: 'テスト',
        role: 'editor',
        password: 'short',
      });
      expect(result.success).toBe(false);
    });

    it('拒否: 不正なrole', () => {
      const result = UserActionSchema.safeParse({
        action: 'create',
        email: 'test@example.com',
        displayName: 'テスト',
        role: 'superadmin',
        password: 'SecureP@ss123!',
      });
      expect(result.success).toBe(false);
    });

    it('拒否: 不正なメール', () => {
      const result = UserActionSchema.safeParse({
        action: 'create',
        email: 'not-an-email',
        displayName: 'テスト',
        role: 'editor',
        password: 'SecureP@ss123!',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── パスワード変更 ──
  describe('PasswordChangeSchema', () => {
    it('正常: パスワード変更', () => {
      const result = PasswordChangeSchema.safeParse({
        currentPassword: 'OldP@ssw0rd!!',
        newPassword: 'NewSecure#2026',
      });
      expect(result.success).toBe(true);
    });

    it('拒否: 新パスワード12文字未満', () => {
      const result = PasswordChangeSchema.safeParse({
        currentPassword: 'OldP@ssw0rd!!',
        newPassword: 'short',
      });
      expect(result.success).toBe(false);
    });

    it('拒否: 未知フィールド注入', () => {
      const result = PasswordChangeSchema.safeParse({
        currentPassword: 'OldP@ssw0rd!!',
        newPassword: 'NewSecure#2026',
        isAdmin: true, // injection attempt
      });
      expect(result.success).toBe(false);
    });
  });

  // ── 承認管理 ──
  describe('ApprovalActionSchema', () => {
    it('正常: approve', () => {
      const result = ApprovalActionSchema.safeParse({
        requestId: 'req-001',
        decision: 'approve',
        reason: '問題なし',
      });
      expect(result.success).toBe(true);
    });

    it('拒否: decision が approve/reject 以外', () => {
      const result = ApprovalActionSchema.safeParse({
        requestId: 'req-001',
        decision: 'maybe',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── IndexNow ──
  describe('IndexNowSchema', () => {
    it('正常: URL配列', () => {
      const result = IndexNowSchema.safeParse({
        urls: ['https://shop.mining-base.co.jp/collections/gaming-pc'],
      });
      expect(result.success).toBe(true);
    });

    it('拒否: 空配列', () => {
      const result = IndexNowSchema.safeParse({ urls: [] });
      expect(result.success).toBe(false);
    });

    it('拒否: 不正なURL', () => {
      const result = IndexNowSchema.safeParse({ urls: ['not-a-url'] });
      expect(result.success).toBe(false);
    });
  });

  // ── QRコードクエリ ──
  describe('QRCodeQuerySchema', () => {
    it('正常: URL + デフォルトサイズ', () => {
      const result = QRCodeQuerySchema.safeParse({ url: 'https://example.com' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.size).toBe(256);
        expect(result.data.margin).toBe(4);
      }
    });

    it('正常: カスタムサイズ（文字列→数値変換）', () => {
      const result = QRCodeQuerySchema.safeParse({
        url: 'https://example.com',
        size: '512',
        margin: '2',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.size).toBe(512);
        expect(result.data.margin).toBe(2);
      }
    });

    it('拒否: サイズ範囲外', () => {
      const result = QRCodeQuerySchema.safeParse({
        url: 'https://example.com',
        size: '9999',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── 予測検索 ──
  describe('PredictiveSearchQuerySchema', () => {
    it('正常: 検索クエリ', () => {
      const result = PredictiveSearchQuerySchema.safeParse({ q: '呪術廻戦' });
      expect(result.success).toBe(true);
    });

    it('拒否: 空クエリ', () => {
      const result = PredictiveSearchQuerySchema.safeParse({ q: '' });
      expect(result.success).toBe(false);
    });
  });

  // ── レコメンド ──
  describe('RecommendationsQuerySchema', () => {
    it('正常: Shopify GID', () => {
      const result = RecommendationsQuerySchema.safeParse({
        productId: 'gid://shopify/Product/1234567890',
      });
      expect(result.success).toBe(true);
    });

    it('拒否: 不正なGID形式', () => {
      const result = RecommendationsQuerySchema.safeParse({
        productId: 'invalid-id',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── その他のスキーマ（基本バリデーション） ──
  describe('その他のスキーマ', () => {
    it('QuickActionSchema: 正常', () => {
      expect(QuickActionSchema.safeParse({ actionId: 'clear-cache' }).success).toBe(true);
    });

    it('SchedulerActionSchema: 正常', () => {
      expect(SchedulerActionSchema.safeParse({ pipelineId: 'seo-audit' }).success).toBe(true);
    });

    it('PipelineActionSchema: 正常', () => {
      expect(PipelineActionSchema.safeParse({ pipelineId: 'daily-report' }).success).toBe(true);
    });

    it('BannerActionSchema: 正常', () => {
      expect(BannerActionSchema.safeParse({ action: 'regenerate', collectionHandle: 'jujutsukaisen-collaboration' }).success).toBe(true);
    });

    it('CampaignActionSchema: 正常 + デフォルト値', () => {
      const result = CampaignActionSchema.safeParse({ action: 'list' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.count).toBe(10);
    });

    it('ContentActionSchema: 正常', () => {
      expect(ContentActionSchema.safeParse({ action: 'publish', contentId: 'post-001' }).success).toBe(true);
    });

    it('AIActionSchema: 正常', () => {
      expect(AIActionSchema.safeParse({ action: 'analyze', dataType: 'revenue' }).success).toBe(true);
    });

    it('PSIActionSchema: デフォルト値', () => {
      const result = PSIActionSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.strategy).toBe('mobile');
        expect(result.data.urls).toEqual(['https://shop.mining-base.co.jp']);
      }
    });
  });

  // ── 横断テスト: XSS注入パターン ──
  describe('XSS注入パターン横断テスト', () => {
    const xssPayloads = [
      '<script>alert(1)</script>',
      '<img onerror=alert(1) src=x>',
      '<svg onload=alert(1)>',
      '<iframe src="javascript:alert(1)">',
    ];

    const schemasWithStringFields = [
      { name: 'AndonAction', schema: AndonActionSchema, field: 'reason', base: { action: 'pull' as const } },
      { name: 'QuickAction', schema: QuickActionSchema, field: 'actionId', base: {} },
      { name: 'Approval', schema: ApprovalActionSchema, field: 'reason', base: { requestId: 'req-1', decision: 'approve' as const } },
    ];

    for (const { name, schema, field, base } of schemasWithStringFields) {
      for (const payload of xssPayloads) {
        it(`${name}.${field}: XSS "${payload.substring(0, 20)}..." を拒否`, () => {
          const result = schema.safeParse({ ...base, [field]: payload });
          expect(result.success).toBe(false);
        });
      }
    }
  });
});
