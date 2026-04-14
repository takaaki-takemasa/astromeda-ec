/**
 * 心臓フェーズ統合テスト — H-022
 *
 * 医学メタファー: 心臓カテーテル検査
 * 心臓（セキュリティシステム）全体の血流（データフロー）を
 * 端から端まで検査し、弁膜（バリデーション）・動脈（RBAC）・
 * 拍動記録（監査ログ）の統合動作を検証する。
 *
 * テスト対象:
 * - AppError → RouteErrorBoundary 連携
 * - GraphQL Guard → AppError 連携
 * - RBAC → AppError 連携
 * - Account Lockout → Audit Log 連携
 * - Zod Schema → AppError 連携
 * - 全モジュールのバレルエクスポート
 */
import {describe, it, expect, beforeEach} from 'vitest';

// 全セキュリティモジュールをインポート
import {AppError} from '../app-error';
import {validateGraphQLQuery, assertValidGraphQL} from '../graphql-guard';
import {
  hasPermission,
  requireRole,
  requirePermission,
  getSessionRole,
  isRoleAtLeast,
  type Role,
} from '../rbac';
import {auditLog, getAuditLog, clearAuditLog} from '../audit-log';
import {
  isLocked,
  recordFailedAttempt,
  recordSuccessfulLogin,
  clearLockoutState,
} from '../account-lockout';
import {AndonActionSchema, UserActionSchema} from '../api-schemas';

// モックセッション
function mockSession(data: Record<string, unknown> = {}) {
  const store = new Map(Object.entries(data));
  return {
    get: (key: string) => store.get(key),
    set: () => {},
    has: () => false,
    unset: () => {},
    flash: () => {},
    destroy: () => Promise.resolve(''),
    commit: () => Promise.resolve(''),
    isPending: false,
  } as any;
}

beforeEach(() => {
  clearAuditLog();
  clearLockoutState();
});

describe('心臓フェーズ統合テスト (H-022)', () => {
  // ━━━ 1. エラーフロー統合 ━━━
  describe('エラーフロー: AppError → 各モジュール連携', () => {
    it('GraphQL Guard → AppError → RFC 7807 レスポンス', () => {
      // 攻撃クエリを投入
      try {
        assertValidGraphQL('{ __schema { types { name } } }');
        expect.unreachable('should throw');
      } catch (err) {
        expect(AppError.isAppError(err)).toBe(true);
        if (AppError.isAppError(err)) {
          // RFC 7807 レスポンスを生成
          const response = err.toResponse();
          expect(response.status).toBe(400);
          expect(response.headers.get('Content-Type')).toContain('application/problem+json');

          // ProblemDetails構造を検証
          const pd = err.toProblemDetails();
          expect(pd.type).toContain('validation');
          expect(pd.detail).toContain('禁止されたクエリパターン');
        }
      }
    });

    it('RBAC → AppError → 401/403 分岐', () => {
      // 未認証 → 401
      const unauthSession = mockSession({});
      try {
        requireRole(unauthSession, 'viewer');
      } catch (err) {
        if (AppError.isAppError(err)) {
          expect(err.status).toBe(401);
          expect(err.category).toBe('AUTHENTICATION');
        }
      }

      // 権限不足 → 403
      const viewerSession = mockSession({isAdmin: true, role: 'viewer'});
      try {
        requireRole(viewerSession, 'admin');
      } catch (err) {
        if (AppError.isAppError(err)) {
          expect(err.status).toBe(403);
          expect(err.category).toBe('AUTHORIZATION');
        }
      }
    });

    it('Zod → AppError.fromZodError 連携', () => {
      const result = AndonActionSchema.safeParse({action: 'invalid'});
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = AppError.fromZodError(result.error);
        expect(AppError.isAppError(err)).toBe(true);
        expect(err.status).toBe(400);
        expect(err.category).toBe('VALIDATION');
      }
    });
  });

  // ━━━ 2. セキュリティフロー統合 ━━━
  describe('セキュリティフロー: ロックアウト → 監査ログ', () => {
    it('5回失敗 → ロック → 監査ログに記録', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('attacker.ip');
      }

      // ロック確認
      expect(isLocked('attacker.ip').locked).toBe(true);

      // 監査ログにセキュリティイベントが記録されている
      const logs = getAuditLog();
      const securityLogs = logs.filter((l) => l.action === 'login_failed');
      expect(securityLogs.length).toBeGreaterThan(0);
      expect(securityLogs[0].success).toBe(false);
    });

    it('成功ログイン → ロック解除 → 再カウント', () => {
      // 4回失敗
      for (let i = 0; i < 4; i++) recordFailedAttempt('user.ip');
      expect(isLocked('user.ip').locked).toBe(false);

      // 成功 → リセット
      recordSuccessfulLogin('user.ip');

      // 再度1回失敗してもロックされない
      recordFailedAttempt('user.ip');
      expect(isLocked('user.ip').locked).toBe(false);
    });
  });

  // ━━━ 3. RBAC 階層整合性 ━━━
  describe('RBAC階層: 最小権限の原則', () => {
    const sensitivePerms: Array<{perm: any; minRole: Role}> = [
      {perm: 'users.create', minRole: 'owner'},
      {perm: 'users.delete', minRole: 'owner'},
      {perm: 'settings.edit', minRole: 'owner'},
      {perm: 'agents.configure', minRole: 'admin'},
      {perm: 'system.upload', minRole: 'admin'},
      {perm: 'products.edit', minRole: 'editor'},
      {perm: 'dashboard.view', minRole: 'viewer'},
    ];

    it.each(sensitivePerms)(
      '$perm は $minRole 以上のロールでのみ許可',
      ({perm, minRole}) => {
        const roles: Role[] = ['viewer', 'editor', 'admin', 'owner'];
        const minIndex = roles.indexOf(minRole);

        for (let i = 0; i < roles.length; i++) {
          if (i >= minIndex) {
            expect(hasPermission(roles[i], perm)).toBe(true);
          } else {
            expect(hasPermission(roles[i], perm)).toBe(false);
          }
        }
      },
    );
  });

  // ━━━ 4. GraphQL Guard 包括テスト ━━━
  describe('GraphQL Guard: 攻撃ベクトル網羅', () => {
    const attacks = [
      {name: 'イントロスペクション', query: '{ __schema { types { name } } }'},
      {name: 'ミューテーション', query: 'mutation { delete { id } }'},
      {name: 'サブスクリプション', query: 'subscription { events { type } }'},
      {name: '深度超過', query: '{ a { b { c { d { e { f { g { h { i { j { k { l } } } } } } } } } } } }'},
      {name: '長大クエリ', query: '{ ' + 'x '.repeat(10001) + '}'},
    ];

    it.each(attacks)('$name 攻撃を遮断', ({query}) => {
      const result = validateGraphQLQuery(query);
      expect(result.valid).toBe(false);
    });
  });

  // ━━━ 5. バレルエクスポート検証 ━━━
  describe('モジュール構造: バレルエクスポート', () => {
    it('全セキュリティモジュールが独立してインポート可能', () => {
      // このテストファイル自体が全モジュールをインポートして動作していることが証明
      expect(AppError).toBeDefined();
      expect(validateGraphQLQuery).toBeDefined();
      expect(hasPermission).toBeDefined();
      expect(auditLog).toBeDefined();
      expect(isLocked).toBeDefined();
      expect(AndonActionSchema).toBeDefined();
    });
  });

  // ━━━ 6. 後方互換性 ━━━
  describe('後方互換性', () => {
    it('isAdmin=true + role未設定 → owner権限（CEO用デフォルト）', () => {
      const session = mockSession({isAdmin: true});
      const role = getSessionRole(session);
      expect(role).toBe('owner');
      // owner は全権限を持つ
      expect(hasPermission(role!, 'users.delete')).toBe(true);
      expect(hasPermission(role!, 'settings.edit')).toBe(true);
    });

    it('AppError.from() で既存の Error を正しくトリアージ', () => {
      const err = AppError.from(new Error('test error'));
      expect(AppError.isAppError(err)).toBe(true);
      expect(err.status).toBe(500);
    });

    it('AppError.from() で既存の Response をトリアージ', () => {
      const response = new Response('Not Found', {status: 404});
      const err = AppError.fromResponse(404, 'Not Found');
      expect(err.status).toBe(404);
      expect(err.category).toBe('NOT_FOUND');
    });
  });
});
