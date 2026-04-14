import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/blogs.$blogHandle._index';
import {Image, getPaginationVariables} from '@shopify/hydrogen';
import type {ArticleItemFragment} from 'storefrontapi.generated';
import {PaginatedResourceSection} from '~/components/PaginatedResourceSection';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import {AppError} from '~/lib/app-error';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {BlogNav} from '~/components/astro/BlogNav';
import {STORE_URL, T, PAGE_WIDTH} from '~/lib/astromeda-data';

export const meta: Route.MetaFunction = ({data}) => {
  const blogHandle = data?.blog?.handle ?? '';
  const url = `${STORE_URL}/blogs/${blogHandle}`;
  const title = `ASTROMEDA | ${data?.blog.title ?? ''}`;
  return [
    {title},
    {name: 'description', content: `${data?.blog.title ?? 'ASTROMEDA'}の記事一覧。ゲーミングPCの最新情報をお届けします。`},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:url', content: url},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
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
async function loadCriticalData({context, request, params}: Route.LoaderArgs) {
  const paginationVariables = getPaginationVariables(request, {
    pageBy: 4,
  });

  if (!params.blogHandle) {
    throw AppError.notFound('ブログが見つかりません');
  }

  let blog;
  try {
    const [result] = await Promise.all([
      context.storefront.query(BLOGS_QUERY, {
        variables: {
          blogHandle: params.blogHandle,
          ...paginationVariables,
        },
      }),
    ]);
    blog = result.blog;
  } catch (error) {
    process.env.NODE_ENV === 'development' && console.error('[blogs.$blogHandle] Storefront API error:', error);
    throw AppError.externalApi('ブログデータの取得に失敗しました');
  }

  if (!blog?.articles) {
    throw AppError.notFound('リソースが見つかりません');
  }

  redirectIfHandleIsLocalized(request, {handle: params.blogHandle, data: blog});

  return {blog};
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context}: Route.LoaderArgs) {
  return {};
}

export default function Blog() {
  const {blog} = useLoaderData<typeof loader>();
  const {articles} = blog;

  return (
    <div style={{backgroundColor: T.bg, color: T.tx, minHeight: '100vh'}}>
      {/* Header */}
      <div
        style={{
          borderBottom: `1px solid ${T.bd}`,
          paddingTop: '40px',
          paddingBottom: '40px',
          backgroundColor: `rgba(255, 179, 0, 0.02)`,
        }}
      >
        <div style={PAGE_WIDTH}>
          <h1
            style={{
              fontSize: 'clamp(28px, 4vw, 42px)',
              fontWeight: 700,
              marginBottom: '12px',
              color: T.tx,
            }}
          >
            {blog.title}
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: T.t4,
              margin: 0,
            }}
          >
            {blog.seo?.description || `${blog.title}の最新記事一覧`}
          </p>
        </div>
      </div>

      {/* Articles Grid */}
      <div style={PAGE_WIDTH}>
        <div
          style={{
            paddingTop: '60px',
            paddingBottom: '60px',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '24px',
            }}
          >
            <PaginatedResourceSection<ArticleItemFragment> connection={articles}>
              {({node: article, index}) => (
                <ArticleItem
                  article={article}
                  key={article.id}
                  loading={index < 2 ? 'eager' : 'lazy'}
                />
              )}
            </PaginatedResourceSection>
          </div>
        </div>
      </div>

      {/* Blog Navigation */}
      <BlogNav />
    </div>
  );
}

function ArticleItem({
  article,
  loading,
}: {
  article: ArticleItemFragment;
  loading?: HTMLImageElement['loading'];
}) {
  const publishedAt = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(article.publishedAt ?? ''));

  return (
    <Link
      to={`/blogs/${article.blog.handle}/${article.handle}`}
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
          cursor: 'pointer',
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
        key={article.id}
      >
        {article.image && (
          <div
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
              overflow: 'hidden',
              backgroundColor: T.t1,
            }}
          >
            <Image
              alt={article.image.altText || article.title}
              data={article.image}
              loading={loading}
              sizes="(min-width: 768px) 33vw, 100vw"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </div>
        )}
        <div
          style={{
            padding: '20px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 700,
              marginBottom: '8px',
              color: T.tx,
              lineHeight: 1.4,
            }}
          >
            {article.title}
          </h3>
          <p
            style={{
              fontSize: '13px',
              color: T.t4,
              flex: 1,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            記事を読む
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
          {publishedAt}
        </div>
      </div>
    </Link>
  );
}

// NOTE: https://shopify.dev/docs/api/storefront/latest/objects/blog
const BLOGS_QUERY = `#graphql
  query Blog(
    $language: LanguageCode
    $blogHandle: String!
    $first: Int
    $last: Int
    $startCursor: String
    $endCursor: String
  ) @inContext(language: $language) {
    blog(handle: $blogHandle) {
      title
      handle
      seo {
        title
        description
      }
      articles(
        first: $first,
        last: $last,
        before: $startCursor,
        after: $endCursor
      ) {
        nodes {
          ...ArticleItem
        }
        pageInfo {
          hasPreviousPage
          hasNextPage
          endCursor
          startCursor
        }

      }
    }
  }
  fragment ArticleItem on Article {
    author: authorV2 {
      name
    }
    contentHtml
    handle
    id
    image {
      id
      altText
      url
      width
      height
    }
    publishedAt
    title
    blog {
      handle
    }
  }
` as const;

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
