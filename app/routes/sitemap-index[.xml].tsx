import type {Route} from './+types/sitemap-index[.xml]';
import {getSitemapIndex} from '@shopify/hydrogen';

/**
 * patch 0062 (2026-04-20): /sitemap-index.xml canonical sitemap index
 *
 * ## なぜ /sitemap.xml ではなく /sitemap-index.xml なのか
 *
 * Shopify Oxygen の CDN エッジレイヤには、リテラル path `/sitemap.xml`
 * (case-sensitive、query string は無視) を Hydrogen worker より前に
 * フックして、連携している Shopify Online Store (myshopify.com) の
 * レガシー sitemap へプロキシする固定 interceptor がある。
 *
 * 当ストアは production-mining-base だが Online Store 側の sitemap は
 * 有効でないため、プロキシ先が 404 を返し、Shopify ブランドの 404 HTML
 * (class="b-shopify", `oxygen-static-page: 404` header) が露出する。
 *
 * 動的検証 (2026-04-20 本番):
 * - `/sitemap.xml`            → 404 Shopify edge-404 (worker 未到達)
 * - `/Sitemap.xml`            → 200 application/xml (worker が処理)
 * - `/sitemap.xml/` (trail)   → 200 application/xml (worker が処理)
 * - `/sitemap-static.xml`     → 200 application/xml (worker が処理)
 * - `/sitemap_products_1.xml` → 404 Astromeda 404 (worker 到達)
 *
 * = 厳密な `/sitemap.xml` (path-only) のみ interceptor 対象。worker 側の
 *   ルーティングとサイトマップ生成ロジックは正常に機能している。
 *
 * ## 対策: 代替 canonical URL
 *
 * robots.txt で `/sitemap-index.xml` をサイトマップ位置として宣言し、
 * Search Console / 各AIクローラーにも同URLを提出する。
 * このファイルは旧 `[sitemap.xml].tsx` と同一の getSitemapIndex 出力を
 * 提供するが、path が interceptor にマッチしないため worker で処理される。
 *
 * `[sitemap.xml].tsx` は削除せず、Oxygen が将来 interceptor を撤廃した
 * 際に自動復活する「休眠ルート」として残置する。
 */
export async function loader({
  request,
  context: {storefront},
}: Route.LoaderArgs) {
  const baseUrl = new URL(request.url).origin;

  let originalXml: string;
  try {
    const response = await Promise.race([
      getSitemapIndex({storefront, request}),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000),
      ),
    ]);
    originalXml = await response.text();
  } catch {
    // Shopify API 障害時のフォールバック
    originalXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>${baseUrl}/sitemap-static.xml</loc></sitemap>
</sitemapindex>`;
    return new Response(originalXml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'max-age=300',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  // カスタム静的ページ sitemap 参照を追加
  const customSitemapRef = `<sitemap><loc>${baseUrl}/sitemap-static.xml</loc></sitemap>`;
  const enhancedXml = originalXml.replace(
    '</sitemapindex>',
    `${customSitemapRef}\n</sitemapindex>`,
  );

  return new Response(enhancedXml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `max-age=${60 * 60 * 24}`,
      'X-Robots-Tag': 'noindex',
    },
  });
}
