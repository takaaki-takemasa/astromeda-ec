/**
 * Shopify Webhook HMAC-SHA256 検証ユーティリティ
 *
 * 医学メタファー: 免疫系の抗原認識
 * Webhookリクエストが本物のShopifyからのものかを検証する。
 * HMAC-SHA256署名がShopify APIシークレットで生成されたものと一致するか確認。
 *
 * Cloudflare Workers/Oxygen対応:
 * - Web Crypto API (crypto.subtle) を使用
 * - Node.js crypto モジュールは不要
 */

/**
 * Shopify Webhook のHMAC-SHA256署名を検証
 *
 * @param rawBody - リクエストボディ（生のテキスト）
 * @param hmacHeader - X-Shopify-Hmac-Sha256 ヘッダー値
 * @param secret - Shopify API シークレット
 * @returns 検証結果（true = 正規のShopifyリクエスト）
 */
export async function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!hmacHeader || !secret || !rawBody) return false;

  try {
    // Web Crypto APIでHMAC-SHA256を計算（Oxygen/Workers対応）
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));

    // Base64エンコード
    const computed = btoa(String.fromCharCode(...new Uint8Array(signature)));

    // タイミング安全比較
    return timingSafeEqual(computed, hmacHeader);
  } catch {
    return false;
  }
}

/**
 * タイミング安全文字列比較（タイミング攻撃対策）
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  let diff = 0;
  for (let i = 0; i < aBytes.byteLength; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

/**
 * Webhookリクエストから共通メタデータを抽出
 */
export function extractWebhookMeta(request: Request): {
  topic: string | null;
  shopDomain: string | null;
  webhookId: string | null;
  apiVersion: string | null;
} {
  return {
    topic: request.headers.get('X-Shopify-Topic'),
    shopDomain: request.headers.get('X-Shopify-Shop-Domain'),
    webhookId: request.headers.get('X-Shopify-Webhook-Id'),
    apiVersion: request.headers.get('X-Shopify-API-Version'),
  };
}
