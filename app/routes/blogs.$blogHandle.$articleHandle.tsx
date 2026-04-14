import {useLoaderData} from 'react-router';
import type {Route} from './+types/blogs.$blogHandle.$articleHandle';
import {Image} from '@shopify/hydrogen';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import {sanitizeHtml} from '~/lib/sanitize-html';
import {AppError} from '~/lib/app-error';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {BlogNav} from '~/components/astro/BlogNav';
import {STORE_URL, T, PAGE_WIDTH} from '~/lib/astromeda-data';

// 9-21: ブログ記事meta完全化 — og:image, twitter:card, Article JSON-LD対応
export const meta: Route.MetaFunction = ({data}) => {
  const article = data?.article;
  const title = `${article?.title ?? 'ブログ'} | ASTROMEDA ゲーミングPC`;
  const description = article?.excerpt
    ? article.excerpt.slice(0, 155)
    : `${article?.title ?? ''}に関する記事 | ASTROMEDA`;
  const image = article?.image?.url;
  const blogHandle = data?.blogHandle ?? 'news';
  const articleHandle = article?.handle ?? '';
  const url = `${STORE_URL}/blogs/${blogHandle}/${articleHandle}`;
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:url', content: url},
    {property: 'og:type', content: 'article'},
    ...(image ? [{property: 'og:image', content: image}] : []),
    {name: 'twitter:card', content: image ? 'summary_large_image' : 'summary'},
    {name: 'twitter:title', content: title},
    ...(article?.publishedAt ? [{property: 'article:published_time', content: article.publishedAt}] : []),
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
  const {blogHandle, articleHandle} = params;

  if (!articleHandle || !blogHandle) {
    throw AppError.notFound('リソースが見つかりません');
  }

  let blog;
  try {
    const [result] = await Promise.all([
      context.storefront.query(ARTICLE_QUERY, {
        variables: {blogHandle, articleHandle},
      }),
    ]);
    blog = result.blog;
  } catch (error) {
    process.env.NODE_ENV === 'development' && console.error('[blogs.$blogHandle.$articleHandle] Storefront API error:', error);
    throw AppError.externalApi('記事データの取得に失敗しました');
  }

  if (!blog?.articleByHandle) {
    throw AppError.notFound('リソースが見つかりません');
  }

  redirectIfHandleIsLocalized(
    request,
    {
      handle: articleHandle,
      data: blog.articleByHandle,
    },
    {
      handle: blogHandle,
      data: blog,
    },
  );

  const article = blog.articleByHandle;

  return {article, blogHandle};
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context}: Route.LoaderArgs) {
  return {};
}

export default function Article() {
  const {article, blogHandle} = useLoaderData<typeof loader>();
  const {title, image, contentHtml, author} = article;

  const publishedDate = article.publishedAt ? new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(article.publishedAt)) : '不明';

  // 9-21: Article JSON-LD — AI引用＋リッチリザルト対応
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': title,
    ...(article.publishedAt ? {'datePublished': article.publishedAt} : {}),
    ...(author?.name ? {'author': {'@type': 'Person', 'name': author.name}} : {}),
    ...(image?.url ? {'image': image.url} : {}),
    'publisher': {
      '@type': 'Organization',
      'name': 'ASTROMEDA',
      'url': STORE_URL,
    },
    'mainEntityOfPage': {
      '@type': 'WebPage',
      '@id': `${STORE_URL}/blogs/${blogHandle}/${article.handle ?? ''}`,
    },
  };

  return (
    <div style={{backgroundColor: T.bg, color: T.tx, minHeight: '100vh'}}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(articleJsonLd)}}
      />

      {/* Article Header */}
      <div
        style={{
          borderBottom: `1px solid ${T.bd}`,
          paddingTop: '40px',
          paddingBottom: '40px',
          backgroundColor: `rgba(0, 240, 255, 0.02)`,
        }}
      >
        <div style={PAGE_WIDTH}>
          <h1
            style={{
              fontSize: 'clamp(28px, 5vw, 48px)',
              fontWeight: 700,
              marginBottom: '16px',
              color: T.tx,
              lineHeight: 1.2,
            }}
          >
            {title}
          </h1>
          <div
            style={{
              display: 'flex',
              gap: '16px',
              flexWrap: 'wrap',
              alignItems: 'center',
              fontSize: '14px',
              color: T.t4,
            }}
          >
            <time dateTime={article.publishedAt}>{publishedDate}</time>
            {author?.name && (
              <>
                <span>•</span>
                <address style={{fontStyle: 'normal'}}>{author.name}</address>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Featured Image */}
      {image && (
        <div
          style={{
            width: '100%',
            maxHeight: '600px',
            overflow: 'hidden',
            backgroundColor: T.t1,
            borderBottom: `1px solid ${T.bd}`,
          }}
        >
          <Image
            data={image}
            alt={image.altText || title}
            sizes="100vw"
            loading="eager"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>
      )}

      {/* Article Content */}
      <article style={PAGE_WIDTH}>
        <div
          style={{
            paddingTop: '60px',
            paddingBottom: '60px',
            maxWidth: '800px',
          }}
        >
          <div
            dangerouslySetInnerHTML={{__html: sanitizeHtml(contentHtml)}}
            style={{
              fontSize: '16px',
              lineHeight: 1.8,
              color: T.t5,
            }}
          />
        </div>
      </article>

      {/* Blog Navigation */}
      <BlogNav />
    </div>
  );
}

// NOTE: https://shopify.dev/docs/api/storefront/latest/objects/blog#field-blog-articlebyhandle
const ARTICLE_QUERY = `#graphql
  query Article(
    $articleHandle: String!
    $blogHandle: String!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(language: $language, country: $country) {
    blog(handle: $blogHandle) {
      handle
      articleByHandle(handle: $articleHandle) {
        handle
        title
        contentHtml
        publishedAt
        author: authorV2 {
          name
        }
        image {
          id
          altText
          url
          width
          height
        }
        seo {
          description
          title
        }
      }
    }
  }
` as const;

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
