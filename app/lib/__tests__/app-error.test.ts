/**
 * AppError 単体テスト — 延髄の神経伝達テスト
 *
 * 全ファクトリーメソッド・変換メソッド・型ガードを検証
 */
import {describe, it, expect} from 'vitest';
import {AppError} from '../app-error';
import type {ErrorCategory, ErrorSeverity, ProblemDetails} from '../app-error';

describe('AppError', () => {
  // ========== ファクトリーメソッド ==========

  describe('ファクトリーメソッド', () => {
    it('notFound: 404 + NOT_FOUND', () => {
      const err = AppError.notFound('商品が見つかりません', {productId: 'abc'});
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
      expect(err.status).toBe(404);
      expect(err.category).toBe('NOT_FOUND');
      expect(err.detail).toBe('商品が見つかりません');
      expect(err.context).toEqual({productId: 'abc'});
      expect(err.name).toBe('AppError');
    });

    it('validation: 400 + VALIDATION', () => {
      const err = AppError.validation('名前は必須です');
      expect(err.status).toBe(400);
      expect(err.category).toBe('VALIDATION');
      expect(err.severity).toBe('warning');
    });

    it('unauthorized: 401 + AUTHENTICATION', () => {
      const err = AppError.unauthorized();
      expect(err.status).toBe(401);
      expect(err.category).toBe('AUTHENTICATION');
      expect(err.detail).toBe('認証が必要です');
    });

    it('forbidden: 403 + AUTHORIZATION', () => {
      const err = AppError.forbidden();
      expect(err.status).toBe(403);
      expect(err.category).toBe('AUTHORIZATION');
    });

    it('conflict: 409 + CONFLICT', () => {
      const err = AppError.conflict('データが競合しています', {orderId: '123'});
      expect(err.status).toBe(409);
      expect(err.category).toBe('CONFLICT');
    });

    it('rateLimit: 429 + RATE_LIMIT', () => {
      const err = AppError.rateLimit();
      expect(err.status).toBe(429);
      expect(err.category).toBe('RATE_LIMIT');
      expect(err.severity).toBe('warning');
    });

    it('externalApi: 502 + EXTERNAL_API', () => {
      const err = AppError.externalApi('Shopify APIエラー', {endpoint: '/products'});
      expect(err.status).toBe(502);
      expect(err.category).toBe('EXTERNAL_API');
      expect(err.severity).toBe('error');
    });

    it('internal: 500 + INTERNAL + cause chain', () => {
      const cause = new TypeError('null is not an object');
      const err = AppError.internal('予期しないエラー', cause);
      expect(err.status).toBe(500);
      expect(err.category).toBe('INTERNAL');
      expect(err.cause).toBe(cause);
    });

    it('timeout: 504 + TIMEOUT', () => {
      const err = AppError.timeout();
      expect(err.status).toBe(504);
      expect(err.category).toBe('TIMEOUT');
    });

    it('configuration: 500 + CONFIGURATION + critical severity', () => {
      const err = AppError.configuration('SESSION_SECRET未設定');
      expect(err.status).toBe(500);
      expect(err.category).toBe('CONFIGURATION');
      expect(err.severity).toBe('critical');
    });
  });

  // ========== 変換メソッド ==========

  describe('toResponse()', () => {
    it('RFC 7807 Content-Type ヘッダー付きResponseを生成', () => {
      const err = AppError.notFound('商品なし');
      const res = err.toResponse();

      expect(res).toBeInstanceOf(Response);
      expect(res.status).toBe(404);
      expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    });

    it('Response bodyにProblemDetails JSONが含まれる', async () => {
      const err = AppError.validation('メールが不正');
      const res = err.toResponse();
      const body = await res.json() as ProblemDetails;

      expect(body.type).toBe('/errors/validation');
      expect(body.title).toBe('バリデーションエラー');
      expect(body.status).toBe(400);
      expect(body.detail).toBe('メールが不正');
      expect(body.category).toBe('VALIDATION');
      expect(body.timestamp).toBeTruthy();
    });
  });

  describe('toProblemDetails()', () => {
    it('全フィールドがProblemDetails型に準拠', () => {
      const err = new AppError({
        title: 'テスト',
        status: 418,
        detail: 'I am a teapot',
        category: 'INTERNAL',
        instance: '/api/test',
        context: {key: 'val'},
        traceId: 'trace-123',
      });

      const pd = err.toProblemDetails();
      expect(pd.type).toBe('/errors/internal');
      expect(pd.title).toBe('テスト');
      expect(pd.status).toBe(418);
      expect(pd.detail).toBe('I am a teapot');
      expect(pd.instance).toBe('/api/test');
      expect(pd.category).toBe('INTERNAL');
      expect(pd.context).toEqual({key: 'val'});
      expect(pd.traceId).toBe('trace-123');
      expect(pd.timestamp).toBeTruthy();
    });
  });

  describe('toReportContext()', () => {
    it('error-reporter互換のコンテキストを生成', () => {
      const err = AppError.notFound('not found');
      const ctx = err.toReportContext();

      expect(ctx.errorType).toBe('/errors/not_found');
      expect(ctx.errorCategory).toBe('NOT_FOUND');
      expect(ctx.errorSeverity).toBe('warning');
      expect(ctx.errorStatus).toBe('404');
    });
  });

  describe('toLogEntry()', () => {
    it('構造化ログエントリを生成', () => {
      const cause = new Error('root cause');
      const err = AppError.internal('何かが壊れた', cause);
      const entry = err.toLogEntry();

      expect(entry.level).toBe('error');
      expect(entry.msg).toBe('何かが壊れた');
      expect(entry.status).toBe(500);
      expect(entry.cause).toBe('root cause');
      expect(entry.stack).toBeTruthy();
    });
  });

  // ========== 静的ヘルパー ==========

  describe('from() — トリアージ', () => {
    it('AppErrorはそのまま返す', () => {
      const original = AppError.notFound('test');
      const result = AppError.from(original);
      expect(result).toBe(original);
    });

    it('Responseオブジェクトから変換', () => {
      const res = new Response('Not Found', {status: 404});
      const err = AppError.from(res);
      expect(err.status).toBe(404);
      expect(err.category).toBe('NOT_FOUND');
    });

    it('標準Errorから変換', () => {
      const original = new TypeError('null pointer');
      const err = AppError.from(original);
      expect(err.status).toBe(500);
      expect(err.category).toBe('INTERNAL');
      expect(err.detail).toBe('null pointer');
      expect(err.cause).toBe(original);
    });

    it('文字列から変換', () => {
      const err = AppError.from('something broke');
      expect(err.status).toBe(500);
      expect(err.detail).toBe('something broke');
    });

    it('nullからフォールバック付きで変換', () => {
      const err = AppError.from(null, 'デフォルトメッセージ');
      expect(err.detail).toBe('デフォルトメッセージ');
    });
  });

  describe('fromResponse() — 既存パターン互換', () => {
    it('各ステータスコードで正しいカテゴリを返す', () => {
      const cases: [number, ErrorCategory][] = [
        [400, 'VALIDATION'],
        [401, 'AUTHENTICATION'],
        [403, 'AUTHORIZATION'],
        [404, 'NOT_FOUND'],
        [409, 'CONFLICT'],
        [429, 'RATE_LIMIT'],
        [500, 'INTERNAL'],
        [502, 'EXTERNAL_API'],
        [504, 'TIMEOUT'],
      ];

      for (const [status, expectedCategory] of cases) {
        const err = AppError.fromResponse(status);
        expect(err.category).toBe(expectedCategory);
        expect(err.status).toBe(status);
      }
    });

    it('カスタムbodyを保持する', () => {
      const err = AppError.fromResponse(404, 'コレクションが見つかりません');
      expect(err.detail).toBe('コレクションが見つかりません');
    });
  });

  describe('fromZodError()', () => {
    it('Zodエラーから変換', () => {
      const zodError = {
        issues: [
          {path: ['email'], message: '有効なメールアドレスを入力してください'},
          {path: ['name'], message: '名前は必須です'},
        ],
      };

      const err = AppError.fromZodError(zodError);
      expect(err.status).toBe(400);
      expect(err.category).toBe('VALIDATION');
      expect(err.detail).toContain('email');
      expect(err.detail).toContain('name');
    });
  });

  describe('isAppError() — 型ガード', () => {
    it('AppErrorに対してtrue', () => {
      expect(AppError.isAppError(AppError.notFound('x'))).toBe(true);
    });

    it('通常のErrorに対してfalse', () => {
      expect(AppError.isAppError(new Error('x'))).toBe(false);
    });

    it('nullに対してfalse', () => {
      expect(AppError.isAppError(null)).toBe(false);
    });

    it('文字列に対してfalse', () => {
      expect(AppError.isAppError('error string')).toBe(false);
    });
  });

  // ========== 継承チェック ==========

  describe('Error継承', () => {
    it('Errorのインスタンスである', () => {
      const err = AppError.internal('test');
      expect(err instanceof Error).toBe(true);
    });

    it('messageプロパティがdetailと一致する', () => {
      const err = AppError.notFound('メッセージ');
      expect(err.message).toBe('メッセージ');
    });

    it('stackトレースが存在する', () => {
      const err = AppError.internal('test');
      expect(err.stack).toBeTruthy();
      expect(err.stack).toContain('AppError');
    });

    it('try/catchでキャッチ可能', () => {
      expect(() => {
        throw AppError.notFound('test');
      }).toThrow(AppError);
    });
  });

  // ========== タイムスタンプ ==========

  describe('タイムスタンプ', () => {
    it('ISO 8601形式のタイムスタンプを持つ', () => {
      const err = AppError.internal('test');
      expect(err.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
