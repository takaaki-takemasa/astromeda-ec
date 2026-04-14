import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/blogs._index';
import {getPaginationVariables} from '@shopify/hydrogen';
import {PaginatedResourceSection} from '~/components/PaginatedResourceSection';
import type {BlogsQuery} from 'storefrontapi.generated';
import {AppError} from '~/lib/app-error';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {STORE_URL, T, PAGE_WIDTH} from '~/lib/astromeda-data';

type BlogNode = BlogsQuery['blogs']['nodes'][0];

export const meta: Route.MetaFunction = () => {
  const url = `${STORE_URL}/blogs`;
  const title = 'ASTROMEDA ブログ — ゲーミングPC最新情報';
  const description = 'ASTROMEDAの最新情報、IPコラボレーション、ゲーミングPC関連のブログ記事一覧。新製品情報からテクノロジーガイドまで。';
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:url', content: url},
    {property: 'og:type', content: 'website'},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
    {name: 'twitter:description', content: description},
  ];
};

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  return {...deferredData, ...criticalData};
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({context, request}: Route.LoaderArgs) {
  const paginationVariables = getPaginationVariables(request, {
    pageBy: 10,
  });

  let blogs;
  try {
    const [result] = await Promise.all([
      context.storefront.query(BLOGS_QUERY, {
        variables: {
          ...paginationVariables,
        },
      }),
    ]);
    blogs = result.blogs;
  } catch (error) {
    process.env.NODE_ENV === 'development' && console.error('[blogs._index] Storefront API error:', error);
    throw AppError.externalApi('ブログ一覧の取得に失敗しました');
  }

  return {blogs};
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context}: Route.LoaderArgs) {
  return {};
}

// Category cards for blog navigation
const BLOG_CATEGORIES = [
  {
    id: 'news',
    title: '新製品情報',
    description: 'ASTROMEDAの最新ゲーミングPC、IPコラボモデルの情報',
    icon: '🆕',
    href: '/blogs/news',
  },
  {
    id: 'guides',
    title: 'ゲーミングガイド',
    description: 'ゲーミングPC選び方、スペック比較、セットアップガイド',
    icon: '📖',
    href: '/guides',
  },
  {
    id: 'collab',
    title: 'IPコラボレーション',
    description: '限定IPコラボモデル、キャラクター×ゲーミングPC',
    icon: '⭐',
    href: '/blogs/news',
  },
  {
    id: 'tech',
    title: 'テクノロジー',
    description: 'GPU、CPU、冷却技術などの最新トレンド解説',
    icon: '⚙️',
    href: '/blogs/news',
  },
];

export default function Blogs() {
  const {blogs} = useLoaderData<typeof loader>();

  // JSON-LD: Blog CollectionPage schema
  const collectionPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': 'ASTROMEDA ブログ',
    'description': 'ASTROMEDAの最新情報、IPコラボレーション、ゲーミングPC関連のブログ記事',
    'url': `${STORE_URL}/blogs`,
    'mainEntity': {
      '@type': 'Blog',
      'name': 'ASTROMEDA ブログ',
      'description': 'ゲーミングPC最新情報、IPコラボレーション、テクノロジーガイド',
      'url': `${STORE_URL}/blogs`,
      'publisher': {
        '@type': 'Organization',
        'name': 'ASTROMEDA',
        'url': STORE_URL,
      },
    },
  };

  return (
    <div style={{backgroundColor: T.bg, color: T.tx, minHeight: '100vh'}}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(collectionPageJsonLd)}}
      />
      {/* Hero Section */}
      <div
        style={{
          backgroundImage: `linear-gradient(135deg, rgba(0, 240, 255, 0.1) 0%, rgba(255, 179, 0, 0.05) 100%)`,
          borderBottom: `1px solid ${T.bd}`,
          paddingTop: '60px',
          paddingBottom: '60px',
        }}
      >
        <div style={PAGE_WIDTH}>
          <h1
            style={{
              fontSize: 'clamp(32px, 5vw, 48px)',
              fontWeight: 700,
              marginBottom: '16px',
              background: `linear-gradient(90deg, ${T.c}, ${T.g})`,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-1px',
            }}
          >
            ASTROMEDA ブログ
          </h1>
          <p
            style={{
              fontSize: 'clamp(14px, 2vw, 18px)',
              color: T.t4,
              marginBottom: 0,
              lineHeight: 1.6,
            }}
          >
            ゲーミングPC最新情報、IPコラボレーション、テクノロジーガイド
          </p>
        </div>
      </div>

      {/* Category Cards */}
      <div style={{...PAGE_WIDTH, paddingTop: '60px', paddingBottom: '60px'}}>
        <h2
          style={{
            fontSize: 'clamp(24px, 3vw, 32px)',
            fontWeight: 700,
            marginBottom: '40px',
            color: T.tx,
          }}
        >
          コンテンツから探す
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '20px',
            marginBottom: '60px',
          }}
        >
          {BLOG_CATEGORIES.map((category) => (
            <Link
              key={category.id}
              to={category.href}
              style={{
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  border: `1px solid ${T.bd}`,
                  borderRadius: '8px',
                  padding: '24px',
                  backgroundColor: T.bgC,
                  backdropFilter: T.bl,
                  transition: 'all 0.3s ease',
                  cursor: 'pointer',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
                onMouseEnter={(e) => {
                  const elem = e.currentTarget as HTMLElement;
                  elem.style.borderColor = T.c;
                  elem.style.backgroundColor = `rgba(0, 240, 255, 0.05)`;
                  elem.style.transform = 'translateY(-4px)';
                }}
                onMouseLeave={(e) => {
                  const elem = e.currentTarget as HTMLElement;
                  elem.style.borderColor = T.bd;
                  elem.style.backgroundColor = T.bgC;
                  elem.style.transform = 'translateY(0)';
                }}
              >
                <div style={{fontSize: '32px', marginBottom: '12px'}}>{category.icon}</div>
                <h3 style={{fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: T.tx}}>
                  {category.title}
                </h3>
                <p style={{fontSize: '14px', color: T.t4, margin: 0, flex: 1}}>
                  {category.description}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Latest Articles */}
        <h2
          style={{
            fontSize: 'clamp(24px, 3vw, 32px)',
            fontWeight: 700,
            marginBottom: '40px',
            color: T.tx,
          }}
        >
          最新記事
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '24px',
          }}
        >
          <PaginatedResourceSection<BlogNode> connection={blogs}>
            {({node: blog}) => (
              <Link
                className="blog"
                key={blog.handle}
                prefetch="intent"
                to={`/blogs/${blog.handle}`}
                style={{textDecoration: 'none', color: 'inherit'}}
              >
                <div
                  style={{
                    border: `1px solid ${T.bd}`,
                    borderRadius: '8px',
                    overflow: 'hidden',
                    backgroundColor: T.bgC,
                    backdropFilter: T.bl,
                    transition: 'all 0.3s ease',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                  onMouseEnter={(e) => {
                    const elem = e.currentTarget as HTMLElement;
                    elem.style.borderColor = T.g;
                    elem.style.backgroundColor = `rgba(255, 179, 0, 0.03)`;
                    elem.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    const elem = e.currentTarget as HTMLElement;
                    elem.style.borderColor = T.bd;
                    elem.style.backgroundColor = T.bgC;
                    elem.style.transform = 'translateY(0)';
                  }}
                >
                  <div
                    style={{
                      padding: '20px',
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <h3 style={{fontSize: '16px', fontWeight: 700, marginBottom: '8px', lineHeight: 1.4}}>
                      {blog.title}
                    </h3>
                    <p style={{fontSize: '13px', color: T.t4, flex: 1, margin: 0}}>
                      {blog.seo?.description || '記事一覧を表示'}
                    </p>
                  </div>
                  <div
                    style={{
                      padding: '12px 20px',
                      borderTop: `1px solid ${T.bd}`,
                      fontSize: '12px',
                      color: T.t5,
                    }}
                  >
                    記事を見る →
                  </div>
                </div>
              </Link>
            )}
          </PaginatedResourceSection>
        </div>
      </div>

      {/* Related Guides Section */}
      <div
        style={{
          backgroundColor: `rgba(0, 240, 255, 0.02)`,
          borderTop: `1px solid ${T.bd}`,
          borderBottom: `1px solid ${T.bd}`,
          paddingTop: '60px',
          paddingBottom: '60px',
          marginTop: '60px',
        }}
      >
        <div style={PAGE_WIDTH}>
          <h2
            style={{
              fontSize: 'clamp(24px, 3vw, 32px)',
              fontWeight: 700,
              marginBottom: '40px',
              color: T.tx,
            }}
          >
            関連ガイド
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            {[
              {label: 'ゲーミングPC選び方', href: '/guides'},
              {label: 'GPUスペック比較', href: '/guides'},
              {label: 'PC構成ガイド', href: '/guides'},
              {label: 'ゲーミング環境セットアップ', href: '/guides'},
              {label: 'IPコラボモデル一覧', href: '/reviews'},
              {label: 'よくある質問', href: '/faq'},
            ].map((guide, idx) => (
              <Link
                key={idx}
                to={guide.href}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div
                  style={{
                    padding: '16px',
                    border: `1px solid ${T.bd}`,
                    borderRadius: '6px',
                    backgroundColor: T.bgE,
                    backdropFilter: T.bl,
                    transition: 'all 0.2s ease',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    const elem = e.currentTarget as HTMLElement;
                    elem.style.borderColor = T.c;
                    elem.style.backgroundColor = `rgba(0, 240, 255, 0.08)`;
                  }}
                  onMouseLeave={(e) => {
                    const elem = e.currentTarget as HTMLElement;
                    elem.style.borderColor = T.bd;
                    elem.style.backgroundColor = T.bgE;
                  }}
                >
                  <p style={{fontSize: '14px', fontWeight: 600, margin: 0, color: T.tx}}>
                    {guide.label}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}

// NOTE: https://shopify.dev/docs/api/storefront/latest/objects/blog
const BLOGS_QUERY = `#graphql
  query Blogs(
    $country: CountryCode
    $endCursor: String
    $first: Int
    $language: LanguageCode
    $last: Int
    $startCursor: String
  ) @inContext(country: $country, language: $language) {
    blogs(
      first: $first,
      last: $last,
      before: $startCursor,
      after: $endCursor
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      nodes {
        title
        handle
        seo {
          title
          description
        }
      }
    }
  }
` as const;
