/**
 * GraphQL Guard テスト — 心臓弁膜の動作検証
 *
 * H-007: イントロスペクション/ミューテーション/深度制限/変数サニタイズ
 */
import {describe, it, expect} from 'vitest';
import {validateGraphQLQuery, assertValidGraphQL} from '../graphql-guard';
import {AppError} from '../app-error';

describe('GraphQL Guard (H-007)', () => {
  // ━━━ 正常クエリ ━━━
  describe('正常なクエリを許可', () => {
    it('Shopify Storefront API の典型的な商品クエリ', () => {
      const query = `#graphql
        query ProductQuery($handle: String!) {
          product(handle: $handle) {
            id
            title
            description
            variants(first: 10) {
              nodes {
                id
                sku
                price { amount currencyCode }
              }
            }
          }
        }`;
      const result = validateGraphQLQuery(query, {handle: 'test-product'});
      expect(result.valid).toBe(true);
    });

    it('コレクションクエリ', () => {
      const query = `#graphql
        query CollectionQuery($handle: String!, $first: Int) {
          collection(handle: $handle) {
            id
            title
            products(first: $first) {
              nodes { id title }
            }
          }
        }`;
      const result = validateGraphQLQuery(query, {handle: 'gaming-pc', first: 48});
      expect(result.valid).toBe(true);
    });

    it('fragment付きクエリ', () => {
      const query = `#graphql
        fragment ProductFields on Product {
          id title handle
        }
        query { products(first: 10) { nodes { ...ProductFields } } }`;
      const result = validateGraphQLQuery(query);
      expect(result.valid).toBe(true);
    });
  });

  // ━━━ イントロスペクション攻撃の防止 ━━━
  describe('イントロスペクション攻撃を遮断', () => {
    it('__schema クエリを拒否', () => {
      const query = '{ __schema { types { name } } }';
      const result = validateGraphQLQuery(query);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('禁止されたクエリパターン');
    });

    it('__type クエリを拒否', () => {
      const query = '{ __type(name: "Product") { name fields { name } } }';
      const result = validateGraphQLQuery(query);
      expect(result.valid).toBe(false);
    });

    it('introspectionを含むクエリを拒否', () => {
      const query = 'query IntrospectionQuery { __schema { queryType { name } } }';
      const result = validateGraphQLQuery(query);
      expect(result.valid).toBe(false);
    });
  });

  // ━━━ ミューテーション防止 ━━━
  describe('ミューテーションを遮断', () => {
    it('mutation オペレーションを拒否', () => {
      const query = 'mutation { customerCreate(input: {}) { customer { id } } }';
      const result = validateGraphQLQuery(query);
      expect(result.valid).toBe(false);
    });

    it('mutation キーワードを含む文字列を拒否', () => {
      const query = `mutation {
        productUpdate(input: { id: "gid://shopify/Product/1" }) {
          product { id }
        }
      }`;
      const result = validateGraphQLQuery(query);
      expect(result.valid).toBe(false);
    });
  });

  // ━━━ DoS防止 ━━━
  describe('DoS攻撃を防止', () => {
    it('空のクエリを拒否', () => {
      const result = validateGraphQLQuery('');
      expect(result.valid).toBe(false);
    });

    it('長すぎるクエリを拒否', () => {
      const query = 'query { ' + 'a '.repeat(10001) + '}';
      const result = validateGraphQLQuery(query);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('長すぎます');
    });

    it('深すぎるネストを拒否 (depth > 10)', () => {
      // 11段のネスト
      let query = '{ a';
      for (let i = 0; i < 11; i++) query += ' { b';
      for (let i = 0; i < 11; i++) query += ' }';
      query += ' }';

      const result = validateGraphQLQuery(query);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('深度が制限を超えています');
    });

    it('深度10以内のネストは許可', () => {
      let query = '{ a';
      for (let i = 0; i < 8; i++) query += ' { b';
      for (let i = 0; i < 8; i++) query += ' }';
      query += ' }';

      const result = validateGraphQLQuery(query);
      expect(result.valid).toBe(true);
    });

    it('長すぎる変数を拒否', () => {
      const variables = {data: 'x'.repeat(6000)};
      const result = validateGraphQLQuery('{ products(first: 1) { nodes { id } } }', variables);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('変数が長すぎます');
    });
  });

  // ━━━ 変数サニタイズ ━━━
  describe('変数のサニタイズ', () => {
    it('__で始まるキーを除去', () => {
      const variables = {handle: 'test', __proto__: 'attack', __schema: true};
      const result = validateGraphQLQuery('{ product(handle: $handle) { id } }', variables);
      expect(result.valid).toBe(true);
      expect(result.sanitizedVariables).not.toHaveProperty('__proto__');
      expect(result.sanitizedVariables).not.toHaveProperty('__schema');
      expect(result.sanitizedVariables).toHaveProperty('handle', 'test');
    });

    it('ネストされた変数もサニタイズ', () => {
      const variables = {
        input: {
          name: 'test',
          __hidden: 'attack',
        },
      };
      const result = validateGraphQLQuery('{ test }', variables);
      expect(result.valid).toBe(true);
      const input = result.sanitizedVariables?.input as Record<string, unknown>;
      expect(input).not.toHaveProperty('__hidden');
      expect(input).toHaveProperty('name', 'test');
    });

    it('配列内のオブジェクトもサニタイズ', () => {
      const variables = {
        items: [{id: '1', __exploit: true}, {id: '2'}],
      };
      const result = validateGraphQLQuery('{ test }', variables);
      expect(result.valid).toBe(true);
      const items = result.sanitizedVariables?.items as Array<Record<string, unknown>>;
      expect(items[0]).not.toHaveProperty('__exploit');
      expect(items[0]).toHaveProperty('id', '1');
    });
  });

  // ━━━ assertValidGraphQL ━━━
  describe('assertValidGraphQL', () => {
    it('正常クエリではthrowしない', () => {
      expect(() => {
        assertValidGraphQL('{ products(first: 1) { nodes { id } } }');
      }).not.toThrow();
    });

    it('不正クエリでAppErrorをthrow', () => {
      expect(() => {
        assertValidGraphQL('{ __schema { types { name } } }');
      }).toThrow(AppError);
    });

    it('throwされたAppErrorは400 + VALIDATION', () => {
      try {
        assertValidGraphQL('{ __schema { types { name } } }');
      } catch (err) {
        expect(AppError.isAppError(err)).toBe(true);
        if (AppError.isAppError(err)) {
          expect(err.status).toBe(400);
          expect(err.category).toBe('VALIDATION');
        }
      }
    });
  });

  // ━━━ subscription防止 ━━━
  describe('subscriptionを遮断', () => {
    it('subscription オペレーションを拒否', () => {
      const query = 'subscription { productUpdated { id title } }';
      const result = validateGraphQLQuery(query);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('許可されていないオペレーション');
    });
  });
});
