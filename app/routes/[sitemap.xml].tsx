import type {Route} from './+types/[sitemap.xml]';
import {getSitemapIndex} from '@shopify/hydrogen';

/**
 * A4: Sitemap Index + カスタム静的ページsitemap
 * Shopify生成の商品/コレクションsitemapに加え、
 * 静的ページ（ガイド、llms.txt、フィード等）のsitemap参照を追加
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
    // Shopify API障害時のフォールバック: 最低限のsitemap indexを返す
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

  // カスタム静的ページsitemapの参照を追加
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
