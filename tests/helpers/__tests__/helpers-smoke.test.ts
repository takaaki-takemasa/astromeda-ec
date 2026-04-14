/**
 * テストヘルパー自体のスモークテスト — 培養液が汚染されていないか確認
 */
import {describe, it, expect} from 'vitest';
import {
  createMockContext,
  createMockAdminContext,
  createMockRequest,
  createMockStorefrontClient,
  createMockSession,
  createMockCart,
  createMockEnv,
} from '../mock-shopify-context';
import {
  createMockAgentBus,
  createMockAgentRegistry,
  createMockStorage,
  createMockHealthMonitor,
  createMockCascadeEngine,
  createMockSecurityContext,
  createMockAgentTestContext,
} from '../mock-agent-context';

describe('Shopify Context Helpers（培養液検証）', () => {
  it('createMockContext: 全フィールドが存在する', () => {
    const ctx = createMockContext();
    expect(ctx.env).toBeDefined();
    expect(ctx.session).toBeDefined();
    expect(ctx.storefront).toBeDefined();
    expect(ctx.cart).toBeDefined();
    expect(ctx.customerAccount).toBeDefined();
    expect(ctx.waitUntil).toBeDefined();
    expect(typeof ctx.storefront.query).toBe('function');
    expect(typeof ctx.cart.addLines).toBe('function');
  });

  it('createMockAdminContext: admin認証済みセッション', () => {
    const ctx = createMockAdminContext();
    expect(ctx.session.get('admin_authenticated')).toBe('true');
    expect(ctx.session.get('admin_user_id')).toBe('admin-001');
    expect(ctx.session.get('admin_session_created')).toBeDefined();
  });

  it('createMockRequest: URLとヘッダーが正しい', () => {
    const req = createMockRequest('https://test.com/api/health', {method: 'POST'});
    expect(req.url).toBe('https://test.com/api/health');
    expect(req.method).toBe('POST');
    expect(req.headers.get('Content-Type')).toBe('application/json');
  });

  it('createMockSession: set/getが連動する', () => {
    const session = createMockSession();
    session.set('key1', 'value1');
    expect(session._store.get('key1')).toBe('value1');
  });

  it('createMockStorefrontClient: query/mutateが呼べる', async () => {
    const client = createMockStorefrontClient();
    const result = await client.query('query {}');
    expect(result).toEqual({data: {}, errors: undefined});
  });

  it('createMockCart: addLinesがcart idを返す', async () => {
    const cart = createMockCart();
    const result = await cart.addLines([]);
    expect(result.cart.id).toBe('gid://shopify/Cart/1');
  });

  it('createMockEnv: 必須キーが全て存在', () => {
    const env = createMockEnv();
    expect(env.SESSION_SECRET).toBeDefined();
    expect(env.PUBLIC_STOREFRONT_API_TOKEN).toBeDefined();
    expect(env.ADMIN_PASSWORD).toBeDefined();
    expect(env.SHOP_ID).toBeDefined();
  });

  it('createMockContext: overridesでカスタマイズ可能', () => {
    const ctx = createMockContext({customField: 'test'});
    expect((ctx as any).customField).toBe('test');
  });
});

describe('Agent Context Helpers（臓器テストベンチ検証）', () => {
  it('createMockAgentBus: publish/subscribeが連動する', () => {
    const bus = createMockAgentBus();
    let received: unknown = null;
    bus.subscribe('test.event', (e: unknown) => {
      received = e;
    });
    bus.publish({type: 'test.event', payload: {msg: 'hello'}});
    expect(received).toEqual({type: 'test.event', payload: {msg: 'hello'}});
  });

  it('createMockAgentRegistry: register/getが連動する', () => {
    const registry = createMockAgentRegistry();
    const mockAgent = {name: 'test-agent'};
    registry.register('agent-001', mockAgent);
    expect(registry.get('agent-001')).toEqual({
      id: 'agent-001',
      status: 'healthy',
      instance: mockAgent,
    });
  });

  it('createMockStorage: set/getが連動する', async () => {
    const storage = createMockStorage();
    await storage.set('agents', 'key1', {name: 'value1'});
    const result = await storage.get('agents', 'key1');
    expect(result).toEqual({name: 'value1'});
  });

  it('createMockStorage: list/clearが動作する', async () => {
    const storage = createMockStorage();
    await storage.set('table1', 'a', 1);
    await storage.set('table1', 'b', 2);
    const items = await storage.list('table1');
    expect(items).toHaveLength(2);
    await storage.clear('table1');
    const after = await storage.list('table1');
    expect(after).toHaveLength(0);
  });

  it('createMockHealthMonitor: reportHealth/getAgentHealthが呼べる', () => {
    const hm = createMockHealthMonitor();
    hm.reportHealth({agentId: 'a', status: 'healthy'});
    expect(hm.reportHealth).toHaveBeenCalledOnce();
    expect(hm.getAgentHealth()).toBe('healthy');
  });

  it('createMockCascadeEngine: executeが結果を返す', async () => {
    const cascade = createMockCascadeEngine();
    const result = await cascade.execute({});
    expect(result.status).toBe('completed');
  });

  it('createMockSecurityContext: admin権限が設定済み', () => {
    const sec = createMockSecurityContext();
    expect(sec.role).toBe('admin');
    expect(sec.permissions).toContain('admin');
    expect(sec.rateLimit.remaining).toBe(60);
  });

  it('createMockAgentTestContext: 全臓器が統合されている', () => {
    const ctx = createMockAgentTestContext();
    expect(ctx.bus).toBeDefined();
    expect(ctx.registry).toBeDefined();
    expect(ctx.storage).toBeDefined();
    expect(ctx.healthMonitor).toBeDefined();
    expect(ctx.cascade).toBeDefined();
    expect(ctx.security).toBeDefined();
  });
});
