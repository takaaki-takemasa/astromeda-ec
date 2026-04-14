/**
 * Storefront Client テスト — D-001
 */
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {safeQuery, safeQueryAll} from '../storefront-client';
import {storefrontCircuit} from '../circuit-breaker';
import {AppError} from '../app-error';

// モック Storefront
function mockStorefront(behavior: 'success' | 'fail' | 'intermittent' = 'success') {
  let callCount = 0;
  return {
    query: vi.fn(async () => {
      callCount++;
      if (behavior === 'fail') throw new Error('API Error');
      if (behavior === 'intermittent' && callCount % 2 === 1) throw new Error('Intermittent');
      return {products: {nodes: [{id: '1', title: 'Test'}]}};
    }),
    CacheShort: () => ({mode: 'short'}),
    CacheLong: () => ({mode: 'long'}),
    CacheNone: () => ({mode: 'none'}),
  };
}

beforeEach(() => {
  storefrontCircuit.reset();
});

describe('safeQuery (D-001)', () => {
  it('正常クエリが成功する', async () => {
    const storefront = mockStorefront('success');
    const result = await safeQuery(storefront, '{ products(first: 1) { nodes { id } } }', {
      label: 'test',
    });
    expect(result).toEqual({products: {nodes: [{id: '1', title: 'Test'}]}});
    expect(storefront.query).toHaveBeenCalledOnce();
  });

  it('変数を渡せる', async () => {
    const storefront = mockStorefront('success');
    await safeQuery(storefront, '{ product(handle: $handle) { id } }', {
      variables: {handle: 'test-product'},
      label: 'product',
    });
    expect(storefront.query).toHaveBeenCalledWith(
      '{ product(handle: $handle) { id } }',
      expect.objectContaining({variables: {handle: 'test-product'}}),
    );
  });

  it('GraphQL Guardが不正クエリを拒否', async () => {
    const storefront = mockStorefront('success');
    await expect(
      safeQuery(storefront, '{ __schema { types { name } } }'),
    ).rejects.toThrow(AppError);
    // Storefront APIは呼ばれない
    expect(storefront.query).not.toHaveBeenCalled();
  });

  it('validate=falseでGuardをスキップ', async () => {
    const storefront = mockStorefront('success');
    // 通常はGuardで弾かれるが、validate=falseでスキップ
    await safeQuery(storefront, '{ __schema { types { name } } }', {
      validate: false,
    });
    expect(storefront.query).toHaveBeenCalled();
  });

  it('フォールバック値が使われる', async () => {
    const storefront = mockStorefront('fail');
    const result = await safeQuery(storefront, '{ test }', {
      fallback: {empty: true},
      validate: false,
      retries: 0,
    });
    expect(result).toEqual({empty: true});
  });

  it('フォールバックなし + 失敗 → AppErrorをthrow', async () => {
    const storefront = mockStorefront('fail');
    await expect(
      safeQuery(storefront, '{ test }', {validate: false, retries: 0}),
    ).rejects.toThrow();
  });

  it('リトライが機能する（intermittent）', async () => {
    const storefront = mockStorefront('intermittent');
    const result = await safeQuery(storefront, '{ test }', {
      validate: false,
      retries: 1,
      label: 'intermittent-test',
    });
    // 1回目失敗 → 2回目成功
    expect(result).toBeDefined();
    expect(storefront.query).toHaveBeenCalledTimes(2);
  });
});

describe('safeQueryAll (D-001)', () => {
  it('複数クエリを並列実行', async () => {
    const storefront = mockStorefront('success');
    const [r1, r2] = await safeQueryAll(storefront, [
      {query: '{ products(first: 1) { nodes { id } } }', options: {validate: false}},
      {query: '{ collections(first: 1) { nodes { id } } }', options: {validate: false}},
    ]);
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(storefront.query).toHaveBeenCalledTimes(2);
  });

  it('1つが失敗しても他の結果は取得可能', async () => {
    let callIdx = 0;
    const storefront = {
      query: vi.fn(async () => {
        callIdx++;
        if (callIdx === 1) throw new Error('first failed');
        return {data: 'ok'};
      }),
      CacheShort: () => ({}),
      CacheLong: () => ({}),
      CacheNone: () => ({}),
    };

    const [r1, r2] = await safeQueryAll(storefront, [
      {query: '{ first }', options: {validate: false, retries: 0}},
      {query: '{ second }', options: {validate: false}},
    ]);

    expect(r1).toBeNull(); // 失敗 → null
    expect(r2).toEqual({data: 'ok'}); // 成功
  });
});
