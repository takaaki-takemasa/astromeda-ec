/**
 * A3: RSS/Atom フィード — AIクローラー向けコンテンツ配信
 *
 * 医学メタファー: 栄養補給ルート
 * 血管が全身に栄養を届けるように、RSSフィードは
 * AIクローラーに最新コンテンツを効率的に届ける。
 */
import type {Route} from './+types/[feed.xml]';
import {STORE_URL} from '~/lib/astromeda-data';

export async function loader({context}: Route.LoaderArgs) {
  const {storefront} = context;

  // 最新商品を取得
  const {products} = await storefront.query(PRODUCTS_FEED_QUERY);
  const {collections} = await storefront.query(COLLECTIONS_FEED_QUERY);

  const baseUrl = STORE_URL;
  const now = new Date().toISOString();

  interface FeedProduct {
    title: string;
    handle: string;
    description?: string;
    publishedAt?: string;
    updatedAt?: string;
    featuredImage?: {url?: string} | null;
  }
  interface FeedCollection {
    title: string;
    handle: string;
    description?: string;
    updatedAt?: string;
    image?: {url?: string} | null;
  }
  const productEntries = (products?.nodes || [])
    .slice(0, 50)
    .map(
      (p: FeedProduct) => `
    <item>
      <title><![CDATA[${escapeXml(p.title)}]]></title>
      <link>${baseUrl}/products/${p.handle}</link>
      <description><![CDATA[${escapeXml(p.description?.slice(0, 300) || '')}]]></description>
      <pubDate>${new Date(p.publishedAt || p.updatedAt).toUTCString()}</pubDate>
      <guid isPermaLink="true">${baseUrl}/products/${p.handle}</guid>
      ${p.featuredImage?.url ? `<enclosure url="${p.featuredImage.url}" type="image/jpeg" />` : ''}
      <category>ゲーミングPC</category>
    </item>`,
    )
    .join('\n');

  const collectionEntries = (collections?.nodes || [])
    .filter((c: FeedCollection) => c.handle !== 'all' && c.handle !== 'frontpage')
    .slice(0, 30)
    .map(
      (c: FeedCollection) => `
    <item>
      <title><![CDATA[${escapeXml(c.title)}]]></title>
      <link>${baseUrl}/collections/${c.handle}</link>
      <description><![CDATA[${escapeXml(c.description?.slice(0, 300) || '')}]]></description>
      <pubDate>${new Date(c.updatedAt).toUTCString()}</pubDate>
      <guid isPermaLink="true">${baseUrl}/collections/${c.handle}</guid>
      ${c.image?.url ? `<enclosure url="${c.image.url}" type="image/jpeg" />` : ''}
      <category>IPコラボレーション</category>
    </item>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ASTROMEDA公式オンラインストア</title>
    <link>${baseUrl}</link>
    <description>ASTROMEDA（アストロメダ）— 日本発のアニメ・ゲームIPコラボゲーミングPCブランド。25タイトル以上のIPコラボ、全モデルRTX 5000シリーズ+DDR5搭載。</description>
    <language>ja</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${baseUrl}/astromeda-logo.png</url>
      <title>ASTROMEDA</title>
      <link>${baseUrl}</link>
    </image>
    ${productEntries}
    ${collectionEntries}
  </channel>
</rss>`.trim();

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': `max-age=${60 * 60 * 6}`, // 6時間キャッシュ
    },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const PRODUCTS_FEED_QUERY = `#graphql
  query ProductsFeed($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 50, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        title
        handle
        description
        publishedAt
        updatedAt
        featuredImage {
          url
        }
      }
    }
  }
` as const;

const COLLECTIONS_FEED_QUERY = `#graphql
  query CollectionsFeed($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    collections(first: 30, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        title
        handle
        description
        updatedAt
        image {
          url
        }
      }
    }
  }
` as const;
