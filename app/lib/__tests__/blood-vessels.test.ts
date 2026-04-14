/**
 * AP-07: 血管テスト — API基盤強化
 */
import {describe, it, expect} from 'vitest';

describe('AP-02: admin rate limit utility', () => {
  it('apiSuccess envelope形式が正しい', async () => {
    const {apiSuccess} = await import('~/lib/api-utils');
    const result = apiSuccess({id: 1, name: 'test'});
    expect(result.data).toEqual({id: 1, name: 'test'});
    expect(result.errors).toEqual([]);
    expect(result.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('apiError がResponseを返す', async () => {
    const {apiError} = await import('~/lib/api-utils');
    const response = apiError('NOT_FOUND', 'リソースが見つかりません', 404);
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.errors[0].code).toBe('NOT_FOUND');
  });

  it('checkAdminRateLimit が正常時nullを返す', async () => {
    const {checkAdminRateLimit} = await import('~/lib/api-utils');
    const request = new Request('https://example.com/api/admin/status', {
      headers: {'CF-Connecting-IP': '1.2.3.4'},
    });
    const result = checkAdminRateLimit(request, 'test-admin-route');
    expect(result).toBeNull();
  });
});

describe('AP-05: response envelope consistency', () => {
  it('成功・エラー両方にtimestampがある', async () => {
    const {apiSuccess, apiError} = await import('~/lib/api-utils');
    const success = apiSuccess({ok: true});
    expect(success.meta.timestamp).toBeTruthy();

    const error = apiError('ERR', 'test', 500);
    const body = await error.json();
    expect(body.meta.timestamp).toBeTruthy();
  });
});
