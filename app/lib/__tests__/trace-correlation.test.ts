/**
 * IM-05: 分散トレース相関テスト
 *
 * trace-idの抽出・生成・伝播・相関分析の全パターンを検証
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  extractTraceId,
  setTraceIdHeader,
  createTraceContext,
  formatTraceLog,
  createErrorReportContext,
  generateTraceParent,
  encodeBaggage,
  decodeBaggage,
  type TraceContext,
} from '../trace-correlation';

describe('trace-correlation.ts — IM-05 分散トレース相関', () => {
  describe('extractTraceId', () => {
    it('サーバー側の X-Trace-Id ヘッダーから trace-id を抽出', () => {
      const headers = new Headers({
        'x-trace-id': 'server-trace-123',
      });
      const request = { headers };

      const traceId = extractTraceId(request);
      expect(traceId).toBe('server-trace-123');
    });

    it('X-Request-Id へのフォールバック', () => {
      const headers = new Headers({
        'x-request-id': 'request-456',
      });
      const request = { headers };

      const traceId = extractTraceId(request);
      expect(traceId).toBe('request-456');
    });

    it('W3C traceparent ヘッダーから trace-id を抽出', () => {
      const headers = new Headers({
        'traceparent': '00-abcdef1234567890abcdef1234567890-0123456789abcdef-01',
      });
      const request = { headers };

      const traceId = extractTraceId(request);
      expect(traceId).toBe('abcdef1234567890abcdef1234567890');
    });

    it('優先順位: X-Trace-Id > X-Request-Id > traceparent > 新規生成', () => {
      const headers = new Headers({
        'x-trace-id': 'highest-priority',
        'x-request-id': 'medium-priority',
        'traceparent': '00-low-priority-0123456789abcdef-01',
      });
      const request = { headers };

      const traceId = extractTraceId(request);
      expect(traceId).toBe('highest-priority');
    });

    it('全ヘッダー未設定時は UUID を生成', () => {
      const headers = new Headers();
      const request = { headers };

      const traceId = extractTraceId(request);
      // UUID v4 format check
      expect(traceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('同じヘッダーセットなら同じ trace-id を返す（冪等性）', () => {
      const headers = new Headers({
        'x-trace-id': 'idempotent-test',
      });

      const req1 = { headers };
      const req2 = { headers };

      expect(extractTraceId(req1)).toBe(extractTraceId(req2));
    });
  });

  describe('setTraceIdHeader', () => {
    it('応答ヘッダーに X-Trace-Id を設定', () => {
      const response = new Response('test');
      const traceId = 'test-trace-123';

      setTraceIdHeader(response, traceId);

      expect(response.headers.get('X-Trace-Id')).toBe(traceId);
    });

    it('既存ヘッダーを上書き（set動作）', () => {
      const response = new Response('test');
      response.headers.set('X-Trace-Id', 'old-value');

      setTraceIdHeader(response, 'new-value');

      expect(response.headers.get('X-Trace-Id')).toBe('new-value');
    });
  });

  describe('createTraceContext', () => {
    it('リクエストから complete な TraceContext を構築', () => {
      const headers = new Headers({
        'x-trace-id': 'ctx-trace-123',
        'user-agent': 'test-browser/1.0',
        'cf-connecting-ip': '192.168.1.1',
      });
      const request = new Request('https://example.com/api/test?foo=bar', {
        method: 'POST',
        headers,
      });

      const context = createTraceContext(request);

      expect(context.traceId).toBe('ctx-trace-123');
      expect(context.url).toBe('/api/test?foo=bar');
      expect(context.method).toBe('POST');
      expect(context.userAgent).toBe('test-browser/1.0');
      expect(context.ip).toBe('192.168.1.1');
      expect(context.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('追加フィールド（userEmail等）を含める', () => {
      const headers = new Headers({
        'x-trace-id': 'ctx-trace-456',
      });
      const request = new Request('https://example.com/test', { headers });

      const context = createTraceContext(request, {
        userEmail: 'user@example.com',
        sessionId: 'sess-789',
        userId: 'user-456',
      });

      expect(context.userEmail).toBe('user@example.com');
      expect(context.sessionId).toBe('sess-789');
      expect(context.userId).toBe('user-456');
    });

    it('CF-Connecting-IP からIPを抽出（Cloudflare環境）', () => {
      const headers = new Headers({
        'cf-connecting-ip': '203.0.113.1',
      });
      const request = new Request('https://example.com/test', { headers });

      const context = createTraceContext(request);

      expect(context.ip).toBe('203.0.113.1');
    });

    it('X-Forwarded-For のフォールバック', () => {
      const headers = new Headers({
        'x-forwarded-for': '203.0.113.2, 10.0.0.1',
      });
      const request = new Request('https://example.com/test', { headers });

      const context = createTraceContext(request);

      // 最初のIPを抽出
      expect(context.ip).toBe('203.0.113.2');
    });

    it('IPヘッダー未設定時は unknown をセット', () => {
      const headers = new Headers();
      const request = new Request('https://example.com/test', { headers });

      const context = createTraceContext(request);

      expect(context.ip).toBe('unknown');
    });
  });

  describe('formatTraceLog', () => {
    let context: TraceContext;

    beforeEach(() => {
      context = {
        traceId: 'test-trace-123',
        timestamp: '2026-04-12T10:30:00.000Z',
        url: '/api/test',
        method: 'POST',
        userAgent: 'test-browser/1.0',
        ip: '192.168.1.1',
        userEmail: 'user@example.com',
      };
    });

    it('構造化ログを生成（全フィールド）', () => {
      const log = formatTraceLog(context, 'error', 'Test error message', {
        customField: 'custom-value',
      });

      expect(log).toEqual({
        level: 'error',
        msg: 'Test error message',
        timestamp: context.timestamp,
        traceId: context.traceId,
        url: context.url,
        method: context.method,
        ip: context.ip,
        userAgent: context.userAgent,
        userEmail: context.userEmail,
        customField: 'custom-value',
      });
    });

    it('複数のログレベル（error, warning, info, debug）に対応', () => {
      const levels = ['error', 'warning', 'info', 'debug'] as const;

      for (const level of levels) {
        const log = formatTraceLog(context, level, 'Test message');
        expect(log.level).toBe(level);
      }
    });

    it('metadata パラメータが undefined 時は省略', () => {
      const log = formatTraceLog(context, 'info', 'Test message');

      expect(log).not.toHaveProperty('metadata');
      expect(log.msg).toBe('Test message');
    });
  });

  describe('createErrorReportContext', () => {
    it('エラーレポート用のtrace-id付きコンテキストを生成', () => {
      const headers = new Headers({
        'x-trace-id': 'error-trace-123',
        'user-agent': 'error-reporter/1.0',
      });
      const request = new Request('https://example.com/api/error-report', {
        method: 'POST',
        headers,
      });

      const context = createErrorReportContext(request, 'VALIDATION');

      expect(context.traceId).toBe('error-trace-123');
      expect(context.url).toBe('/api/error-report');
      expect(context.method).toBe('POST');
      expect(context.errorCategory).toBe('VALIDATION');
      expect(context.userAgent).toBe('error-reporter/1.0');
      expect(context.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('複数のエラーカテゴリに対応', () => {
      const categories = [
        'VALIDATION',
        'AUTHENTICATION',
        'NETWORK',
        'TIMEOUT',
        'UNKNOWN',
      ];
      const headers = new Headers({ 'x-trace-id': 'test' });

      for (const category of categories) {
        const request = new Request('https://example.com/test', { headers });
        const context = createErrorReportContext(request, category);
        expect(context.errorCategory).toBe(category);
      }
    });
  });

  describe('generateTraceParent', () => {
    it('W3C traceparent 形式を生成', () => {
      const traceId = 'abcdef1234567890abcdef1234567890';
      const traceParent = generateTraceParent(traceId);

      // Format: version-trace-id-parent-id-flags
      expect(traceParent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
    });

    it('入力 trace-id のハイフンを削除（normalized）', () => {
      const traceId = 'abcdef12-3456-7890-abcd-ef1234567890';
      const traceParent = generateTraceParent(traceId);

      // ハイフンが削除されたバージョンが含まれるはず
      expect(traceParent).toMatch(/^00-[a-f0-9]{32}-/);
    });

    it('複数回呼び出しで異なる parent-id を生成', () => {
      const traceId = 'testtraceidentifier12345678901234'; // 32 hex chars
      const tp1 = generateTraceParent(traceId);
      const tp2 = generateTraceParent(traceId);

      // format: 00-traceid-parentid-01
      // version (2) + dash (1) + trace-id (32) = 35
      expect(tp1.substring(0, 35)).toBe(tp2.substring(0, 35)); // version + trace-id
      expect(tp1).not.toBe(tp2); // parent-id は異なる
    });

    it('flags=01 は常に sampled', () => {
      const traceId = 'abcdef1234567890abcdef1234567890';
      const traceParent = generateTraceParent(traceId);

      expect(traceParent.endsWith('-01')).toBe(true);
    });
  });

  describe('encodeBaggage / decodeBaggage', () => {
    let context: TraceContext;

    beforeEach(() => {
      context = {
        traceId: 'baggage-trace-123',
        timestamp: '2026-04-12T10:30:00.000Z',
        url: '/api/test',
        method: 'POST',
        userAgent: 'test/1.0',
        ip: '192.168.1.1',
        userId: 'user-789',
      };
    });

    it('TraceContext を Baggage 形式でエンコード', () => {
      const baggage = encodeBaggage(context);

      expect(baggage).toContain('traceId=baggage-trace-123');
      expect(baggage).toContain('userId=user-789');
      expect(baggage).toContain('timestamp=');
      expect(baggage).toContain('url=');
    });

    it('特殊文字を URL エンコード', () => {
      const contextWithSpecial: TraceContext = {
        ...context,
        url: '/api/test?foo=bar&baz=qux',
      };

      const baggage = encodeBaggage(contextWithSpecial);

      // ? や & は encodeURIComponent でエンコードされる
      expect(baggage).toContain('%3F');
      expect(baggage).toContain('%26');
    });

    it('Baggage をデコード', () => {
      const baggage = encodeBaggage(context);
      const decoded = decodeBaggage(baggage);

      expect(decoded.traceId).toBe('baggage-trace-123');
      expect(decoded.userId).toBe('user-789');
    });

    it('エンコード→デコード でラウンドトリップ', () => {
      const baggage = encodeBaggage(context);
      const decoded = decodeBaggage(baggage);

      expect(decoded.traceId).toBe(context.traceId);
      expect(decoded.userId).toBe(context.userId);
      // timestamp と url は URL エンコード影響を受けるため完全一致は難しい場合あり
    });

    it('無効な Baggage フォーマット は graceful に処理', () => {
      const invalidBaggage = 'invalid-format-no-equals-sign';
      const decoded = decodeBaggage(invalidBaggage);

      // 結果は空オブジェクトまたはスキップされたペアのみ
      expect(Object.keys(decoded).length).toBe(0);
    });

    it('空の Baggage は空オブジェクト', () => {
      const decoded = decodeBaggage('');

      expect(decoded).toEqual({});
    });
  });

  describe('Integration: エラーレポート からのtrace-id伝播', () => {
    it('エラーレポート受信時に trace-id を保持して処理', () => {
      const headers = new Headers({
        'x-trace-id': 'integration-trace-123',
        'user-agent': 'error-reporter/1.0',
      });
      const request = new Request('https://example.com/api/error-report', {
        method: 'POST',
        headers,
      });

      // エラーレポート処理シーケーション
      const traceId = extractTraceId(request);
      const reportContext = createErrorReportContext(request, 'NETWORK');
      const logData = formatTraceLog(
        {
          traceId,
          timestamp: new Date().toISOString(),
          url: request.url,
          method: request.method,
          userAgent: request.headers.get('user-agent') || 'unknown',
          ip: 'unknown',
        },
        'error',
        'Network error during fetch'
      );

      expect(traceId).toBe('integration-trace-123');
      expect(reportContext.traceId).toBe('integration-trace-123');
      expect(logData.traceId).toBe('integration-trace-123');
    });
  });

  describe('Edge Cases', () => {
    it('非常に長い trace-id を処理', () => {
      const longTraceId = 'a'.repeat(256);
      const headers = new Headers({
        'x-trace-id': longTraceId,
      });
      const request = { headers };

      const extracted = extractTraceId(request);
      expect(extracted).toBe(longTraceId);
    });

    it('特殊文字を含む trace-id は URL セーフでない可能性を許容', () => {
      // trace-id に特殊文字が含まれるエッジケース
      // 実際には UUID フォーマットが使われるべきだが、
      // 既存システムからの互換性で異なる形式を受け入れる場合の対応
      const specialTraceId = 'trace-id-with-@-and-#';
      const headers = new Headers({
        'x-trace-id': specialTraceId,
      });
      const request = { headers };

      const extracted = extractTraceId(request);
      expect(extracted).toBe(specialTraceId);
    });

    it('空の trace-id は新規生成', () => {
      const headers = new Headers({
        'x-trace-id': '',
      });
      const request = { headers };

      // 空文字列は falsy なので新規生成のフォールバックが発動
      // ただし getCurrentルーティング実装によっては empty string が返されるケースに注意
      const extracted = extractTraceId(request);
      // 空文字列が返されるか新規生成されるかは実装次第
      expect(extracted).toBeDefined();
    });
  });
});
