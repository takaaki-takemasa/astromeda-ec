import type {Route} from './+types/[sitemap-static.xml]';

/**
 * A4: 静的ページSitemap
 * Shopify管理外のカスタムページ（ガイド、ツール系ページ）のsitemap。
 * priorityとchangefreqで検索エンジンにクロール優先度を指示。
 */
export async function loader({request}: Route.LoaderArgs) {
  const baseUrl = new URL(request.url).origin;
  const now = new Date().toISOString().split('T')[0];

  // 静的ページ一覧（priority降順）
  const staticPages: Array<{path: string; priority: string; changefreq: string}> = [
    // トップページ（最高優先度）
    {path: '/', priority: '1.0', changefreq: 'daily'},
    // ガイド系（高優先度 — AI引用の核コンテンツ）
    {path: '/guides', priority: '0.9', changefreq: 'weekly'},
    {path: '/guides/beginners', priority: '0.9', changefreq: 'weekly'},
    {path: '/guides/cospa', priority: '0.9', changefreq: 'weekly'},
    {path: '/guides/streaming', priority: '0.9', changefreq: 'weekly'},
    {path: '/guides/how-to-choose', priority: '0.9', changefreq: 'weekly'},
    {path: '/guides/comparison', priority: '0.9', changefreq: 'weekly'},
    {path: '/guides/benchmark', priority: '0.9', changefreq: 'weekly'},
    {path: '/guides/why-astromeda', priority: '0.9', changefreq: 'weekly'},
    // 用途別LP（8種）
    {path: '/guides/use-case/fps', priority: '0.8', changefreq: 'weekly'},
    {path: '/guides/use-case/streaming', priority: '0.8', changefreq: 'weekly'},
    {path: '/guides/use-case/creative', priority: '0.8', changefreq: 'weekly'},
    {path: '/guides/use-case/vtuber', priority: '0.8', changefreq: 'weekly'},
    {path: '/guides/use-case/mmo', priority: '0.8', changefreq: 'weekly'},
    {path: '/guides/use-case/casual', priority: '0.8', changefreq: 'weekly'},
    {path: '/guides/use-case/study', priority: '0.8', changefreq: 'weekly'},
    {path: '/guides/use-case/work', priority: '0.8', changefreq: 'weekly'},
    // コレクション一覧
    {path: '/collections', priority: '0.8', changefreq: 'daily'},
    // FAQ（SEOコンテンツ）
    {path: '/faq', priority: '0.8', changefreq: 'weekly'},
    // お問い合わせ・サポート系
    {path: '/contact', priority: '0.7', changefreq: 'monthly'},
    {path: '/contact-houjin', priority: '0.7', changefreq: 'monthly'},
    {path: '/warranty', priority: '0.7', changefreq: 'monthly'},
    // ブランド・サービス系
    {path: '/commitment', priority: '0.7', changefreq: 'monthly'},
    {path: '/recycle', priority: '0.6', changefreq: 'monthly'},
    {path: '/yojimaru', priority: '0.7', changefreq: 'monthly'},
    // レビュー（UGCコンテンツ — E-E-A-T強化）
    {path: '/reviews', priority: '0.8', changefreq: 'weekly'},
    // ブログ一覧
    {path: '/blogs', priority: '0.8', changefreq: 'daily'},
    // patch 0025 (P2-I): astromeda_article_content 駆動ブログ一覧
    {path: '/blog', priority: '0.8', changefreq: 'daily'},
    // ギフトカード
    {path: '/gift-cards', priority: '0.6', changefreq: 'monthly'},
    // 法的情報
    {path: '/legal/privacy', priority: '0.5', changefreq: 'monthly'},
    {path: '/legal/tokushoho', priority: '0.5', changefreq: 'monthly'},
    // カート（低優先度 — 検索エンジン向けではない）
    {path: '/cart', priority: '0.3', changefreq: 'always'},
    // AI用ファイル（低優先度）
    {path: '/llms.txt', priority: '0.4', changefreq: 'weekly'},
    {path: '/feed.xml', priority: '0.4', changefreq: 'daily'},
  ];

  const urls = staticPages
    .map(
      (page) => `  <url>
    <loc>${baseUrl}${page.path}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': `max-age=${60 * 60 * 6}`,
      'X-Robots-Tag': 'noindex',
    },
  });
}
