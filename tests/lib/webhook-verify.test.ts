/**
 * Webhook HMAC-SHA256 検証テスト — 免疫系の抗体検証
 */
import {describe, it, expect} from 'vitest';
import {verifyShopifyWebhook, extractWebhookMeta} from '~/lib/webhook-verify';

describe('verifyShopifyWebhook', () => {
  const secret = 'test-webhook-secret-2026';

  it('should reject empty hmac header', async () => {
    const result = await verifyShopifyWebhook('body', null, secret);
    expect(result).toBe(false);
  });

  it('should reject empty secret', async () => {
    const result = await verifyShopifyWebhook('body', 'hash', '');
    expect(result).toBe(false);
  });

  it('should reject empty body', async () => {
    const result = await verifyShopifyWebhook('', 'hash', secret);
    expect(result).toBe(false);
  });

  it('should reject invalid HMAC signature', async () => {
    const result = await verifyShopifyWebhook('{"test":true}', 'invalid-hmac', secret);
    expect(result).toBe(false);
  });

  it('should verify correct HMAC signature', async () => {
    const body = '{"order_id":12345}';
    // Generate correct HMAC
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const hmac = btoa(String.fromCharCode(...new Uint8Array(sig)));

    const result = await verifyShopifyWebhook(body, hmac, secret);
    expect(result).toBe(true);
  });

  it('should reject HMAC with wrong secret', async () => {
    const body = '{"order_id":12345}';
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode('wrong-secret'),
      {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const hmac = btoa(String.fromCharCode(...new Uint8Array(sig)));

    const result = await verifyShopifyWebhook(body, hmac, secret);
    expect(result).toBe(false);
  });
});

describe('extractWebhookMeta', () => {
  it('should extract all Shopify webhook headers', () => {
    const headers = new Headers({
      'X-Shopify-Topic': 'orders/create',
      'X-Shopify-Shop-Domain': 'test-store.myshopify.com',
      'X-Shopify-Webhook-Id': 'webhook-123',
      'X-Shopify-API-Version': '2026-01',
    });
    const request = new Request('https://example.com/api/webhook', {headers});

    const meta = extractWebhookMeta(request);
    expect(meta.topic).toBe('orders/create');
    expect(meta.shopDomain).toBe('test-store.myshopify.com');
    expect(meta.webhookId).toBe('webhook-123');
    expect(meta.apiVersion).toBe('2026-01');
  });

  it('should return null for missing headers', () => {
    const request = new Request('https://example.com/api/webhook');
    const meta = extractWebhookMeta(request);
    expect(meta.topic).toBeNull();
    expect(meta.shopDomain).toBeNull();
  });
});
