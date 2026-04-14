import type {Route} from './+types/[robots.txt]';

export async function loader({request}: Route.LoaderArgs) {
  const url = new URL(request.url);

  // shopIdは固定値（GraphQLクエリを排除してタイムアウト問題を根本解決）
  const shopId = '74104078628';

  const body = robotsTxtData({url: url.origin, shopId});

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': `max-age=${60 * 60 * 24}`,
    },
  });
}

function robotsTxtData({url, shopId}: {shopId?: string; url?: string}) {
  const sitemapUrl = url ? `${url}/sitemap.xml` : undefined;
  const llmsUrl = url ? `${url}/llms.txt` : undefined;

  // ── Phase 1: 全AIボット許可（GEO対策） ──
  // 各AIサービスのクローラーを明示的にAllow
  const aiCrawlers = [
    // OpenAI / ChatGPT
    'GPTBot',
    'ChatGPT-User',
    // Anthropic / Claude
    'ClaudeBot',
    'Claude-Web',
    // Google AI
    'Google-Extended',
    'GoogleOther',
    'GoogleOther-Image',
    'GoogleOther-Video',
    // Microsoft / Bing / Copilot
    'Bingbot',
    'BingPreview',
    // Perplexity
    'PerplexityBot',
    // Meta AI
    'FacebookBot',
    'Meta-ExternalAgent',
    'Meta-ExternalFetcher',
    // Apple
    'Applebot',
    'Applebot-Extended',
    // Amazon / Alexa
    'Amazonbot',
    // X (Twitter) / Grok
    'Twitterbot',
    // Cohere
    'cohere-ai',
    // AI2 / Semantic Scholar
    'AI2Bot',
    'Ai2Bot-Dolma',
    // Common Crawl (AI学習データソース)
    'CCBot',
    // Brave Search
    'Brave',
    // You.com
    'YouBot',
    // Neeva
    'NeevaBot',
    // Diffbot (AI構造化データ)
    'Diffbot',
    // Bytedance / TikTok
    'Bytespider',
    // Yandex (IndexNow対応)
    'YandexBot',
  ];

  const aiRules = aiCrawlers.map(bot =>
    `User-agent: ${bot}\nAllow: /`
  ).join('\n\n');

  return `
# ═══════════════════════════════════════════════
# ASTROMEDA EC — robots.txt
# AI Generative Engine Optimization (GEO) 対応
# 最終更新: 2026/04/07
# ═══════════════════════════════════════════════

# ── AI Crawlers: 全許可（${aiCrawlers.length}ボット） ──
${aiRules}

# ── 一般クローラー ──
User-agent: *
${generalDisallowRules({sitemapUrl, shopId})}

# Google adsbot ignores robots.txt unless specifically named!
User-agent: adsbot-google
Disallow: /checkouts/
Disallow: /checkout
Disallow: /carts
Disallow: /orders
${shopId ? `Disallow: /${shopId}/checkouts` : ''}
${shopId ? `Disallow: /${shopId}/orders` : ''}
Disallow: /*?*oseid=*
Disallow: /*preview_theme_id*
Disallow: /*preview_script_id*

# ── スパムボット: ブロック ──
User-agent: Nutch
Disallow: /

# ── SEOツール: レート制限 ──
User-agent: AhrefsBot
Crawl-delay: 10
${generalDisallowRules({sitemapUrl, shopId})}

User-agent: AhrefsSiteAudit
Crawl-delay: 10
${generalDisallowRules({sitemapUrl, shopId})}

User-agent: MJ12bot
Crawl-Delay: 10

User-agent: SemrushBot
Crawl-delay: 10

User-agent: Pinterest
Crawl-delay: 1

# ── AI用テキストファイル ──
${llmsUrl ? `# LLMs.txt: ${llmsUrl}` : ''}
`.trim();
}

/**
 * This function generates disallow rules that generally follow what Shopify's
 * Online Store has as defaults for their robots.txt
 */
function generalDisallowRules({
  shopId,
  sitemapUrl,
}: {
  shopId?: string;
  sitemapUrl?: string;
}) {
  return `Disallow: /admin
Disallow: /cart
Disallow: /orders
Disallow: /checkouts/
Disallow: /checkout
${shopId ? `Disallow: /${shopId}/checkouts` : ''}
${shopId ? `Disallow: /${shopId}/orders` : ''}
Disallow: /carts
Disallow: /account
Disallow: /collections/*sort_by*
Disallow: /*/collections/*sort_by*
Disallow: /collections/*+*
Disallow: /collections/*%2B*
Disallow: /collections/*%2b*
Disallow: /*/collections/*+*
Disallow: /*/collections/*%2B*
Disallow: /*/collections/*%2b*
Disallow: */collections/*filter*&*filter*
Disallow: /blogs/*+*
Disallow: /blogs/*%2B*
Disallow: /blogs/*%2b*
Disallow: /*/blogs/*+*
Disallow: /*/blogs/*%2B*
Disallow: /*/blogs/*%2b*
Disallow: /*?*oseid=*
Disallow: /*preview_theme_id*
Disallow: /*preview_script_id*
Disallow: /policies/
Disallow: /*/*?*ls=*&ls=*
Disallow: /*/*?*ls%3D*%3Fls%3D*
Disallow: /*/*?*ls%3d*%3fls%3d*
Disallow: /search
Allow: /search/
Disallow: /search/?*
Disallow: /apple-app-site-association
Disallow: /.well-known/shopify/monorail
${sitemapUrl ? `Sitemap: ${sitemapUrl}` : ''}`;
}

