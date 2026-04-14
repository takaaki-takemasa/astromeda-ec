import {useLoaderData} from 'react-router';
import type {Route} from './+types/search';
import {getPaginationVariables, Analytics} from '@shopify/hydrogen';
import {SearchForm} from '~/components/SearchForm';
import {SearchResults} from '~/components/SearchResults';
import {T, al} from '~/lib/astromeda-data';
import {Breadcrumb} from '~/components/astro/Breadcrumb';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {trackSearch} from '~/lib/ga4-ecommerce';
import {useEffect} from 'react';
import {
  type RegularSearchReturn,
  type PredictiveSearchReturn,
  getEmptyPredictiveSearchResult,
} from '~/lib/search';
import type {
  RegularSearchQuery,
  PredictiveSearchQuery,
} from 'storefrontapi.generated';

export const meta: Route.MetaFunction = () => {
  const title = '検索 | ASTROMEDA ゲーミングPC';
  const description = 'ASTROMEDAの商品を検索。ゲーミングPC、IPコラボモデル、ガジェット、グッズを簡単に見つけられます。';
  return [
    {title},
    {name: 'description', content: description},
    {name: 'robots', content: 'noindex'},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
  ];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const isPredictive = url.searchParams.has('predictive');
  const searchPromise: Promise<PredictiveSearchReturn | RegularSearchReturn> =
    isPredictive
      ? predictiveSearch({request, context})
      : regularSearch({request, context});

  const safeSearchPromise = searchPromise.catch((error: Error) => {
    console.error('[search] Error:', error);
    return {type: isPredictive ? 'predictive' as const : 'regular' as const, term: url.searchParams.get('q') ?? '', result: null, error: '検索処理中にエラーが発生しました'};
  });

  return await safeSearchPromise;
}

/**
 * Renders the /search route
 */
export default function SearchPage() {
  const {type, term, result, error} = useLoaderData<typeof loader>();

  // GA4 search イベント（社会ネットワーク層 — 検索行動の記録）
  useEffect(() => {
    if (term) trackSearch(term);
  }, [term]);

  if (type === 'predictive') return null;

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
        color: T.tx,
      }}
    >
      <Breadcrumb items={[{label: 'ホーム', to: '/'}, {label: '検索'}]} />

      <div
        style={{
          maxWidth: 1000,
          margin: '0 auto',
          padding: 'clamp(16px, 3vw, 32px) clamp(16px, 4vw, 48px)',
        }}
      >
        <h1
          className="ph"
          style={{
            fontSize: 'clamp(20px, 3vw, 28px)',
            fontWeight: 900,
            marginBottom: 20,
          }}
        >
          検索
        </h1>

        <SearchForm>
          {({inputRef}) => (
            <div
              style={{
                display: 'flex',
                gap: 10,
                marginBottom: 28,
              }}
            >
              <input
                defaultValue={term}
                name="q"
                placeholder="商品を検索..."
                ref={inputRef}
                type="search"
                maxLength={200}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: `1px solid ${al(T.c, 0.2)}`,
                  background: T.bgC,
                  color: T.tx,
                  fontSize: 'clamp(13px, 1.5vw, 15px)',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '12px 24px',
                  borderRadius: 12,
                  border: 'none',
                  background: `linear-gradient(135deg, ${T.c}, ${T.cD})`,
                  color: T.bg,
                  fontWeight: 700,
                  fontSize: 'clamp(12px, 1.4vw, 14px)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                検索
              </button>
            </div>
          )}
        </SearchForm>

        {error && (
          <p style={{color: T.r, marginBottom: 16}}>{error}</p>
        )}

        {!term || !result?.total ? (
          <div>
            {term ? (
              <SearchResults.Empty />
            ) : (
              <SearchEmptyState />
            )}
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 13,
                color: T.t4,
                marginBottom: 20,
              }}
            >
              「{term}」の検索結果: {result.total}件
            </div>
            <SearchResults result={result} term={term}>
              {({articles, pages, products, term}) => (
                <div>
                  <SearchResults.Products products={products} term={term} />
                  <SearchResults.Pages pages={pages} term={term} />
                  <SearchResults.Articles articles={articles} term={term} />
                </div>
              )}
            </SearchResults>
          </>
        )}
        <Analytics.SearchView data={{searchTerm: term, searchResults: result}} />
      </div>
    </div>
  );
}

/**
 * 検索未入力時のガイド表示（感覚系 — ユーザーへの誘導）
 */
function SearchEmptyState() {
  const categories = [
    {label: 'ゲーミングPC', query: 'ゲーミングPC', icon: '🖥️'},
    {label: 'IPコラボ', query: 'コラボ', icon: '🎮'},
    {label: 'ガジェット', query: 'マウスパッド', icon: '⌨️'},
    {label: 'グッズ', query: 'Tシャツ', icon: '👕'},
  ];

  return (
    <div style={{textAlign: 'center', padding: '40px 0'}}>
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke={al(T.c, 0.3)}
        strokeWidth="1.5"
        style={{marginBottom: 16}}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <p style={{color: al(T.tx, 0.5), fontSize: 14, marginBottom: 24}}>
        キーワードを入力するか、カテゴリから探してみてください
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 10,
          maxWidth: 500,
          margin: '0 auto',
        }}
      >
        {categories.map((cat) => (
          <a
            key={cat.query}
            href={`/search?q=${encodeURIComponent(cat.query)}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '16px 8px',
              borderRadius: 12,
              background: al(T.tx, 0.03),
              border: `1px solid ${al(T.tx, 0.06)}`,
              textDecoration: 'none',
              color: T.tx,
              fontSize: 12,
              fontWeight: 600,
              transition: 'border-color .2s, background .2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = al(T.c, 0.3);
              e.currentTarget.style.background = al(T.c, 0.05);
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = al(T.tx, 0.06);
              e.currentTarget.style.background = al(T.tx, 0.03);
            }}
          >
            <span style={{fontSize: 24}}>{cat.icon}</span>
            {cat.label}
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * Regular search query and fragments
 * (adjust as needed)
 */
const SEARCH_PRODUCT_FRAGMENT = `#graphql
  fragment SearchProduct on Product {
    __typename
    handle
    id
    publishedAt
    title
    trackingParameters
    vendor
    selectedOrFirstAvailableVariant(
      selectedOptions: []
      ignoreUnknownOptions: true
      caseInsensitiveMatch: true
    ) {
      id
      image {
        url
        altText
        width
        height
      }
      price {
        amount
        currencyCode
      }
      compareAtPrice {
        amount
        currencyCode
      }
      selectedOptions {
        name
        value
      }
      product {
        handle
        title
      }
    }
  }
` as const;

const SEARCH_PAGE_FRAGMENT = `#graphql
  fragment SearchPage on Page {
     __typename
     handle
    id
    title
    trackingParameters
  }
` as const;

const SEARCH_ARTICLE_FRAGMENT = `#graphql
  fragment SearchArticle on Article {
    __typename
    handle
    id
    title
    trackingParameters
  }
` as const;

const PAGE_INFO_FRAGMENT = `#graphql
  fragment PageInfoFragment on PageInfo {
    hasNextPage
    hasPreviousPage
    startCursor
    endCursor
  }
` as const;

// NOTE: https://shopify.dev/docs/api/storefront/latest/queries/search
export const SEARCH_QUERY = `#graphql
  query RegularSearch(
    $country: CountryCode
    $endCursor: String
    $first: Int
    $language: LanguageCode
    $last: Int
    $term: String!
    $startCursor: String
  ) @inContext(country: $country, language: $language) {
    articles: search(
      query: $term,
      types: [ARTICLE],
      first: $first,
    ) {
      nodes {
        ...on Article {
          ...SearchArticle
        }
      }
    }
    pages: search(
      query: $term,
      types: [PAGE],
      first: $first,
    ) {
      nodes {
        ...on Page {
          ...SearchPage
        }
      }
    }
    products: search(
      after: $endCursor,
      before: $startCursor,
      first: $first,
      last: $last,
      query: $term,
      sortKey: RELEVANCE,
      types: [PRODUCT],
      unavailableProducts: HIDE,
    ) {
      nodes {
        ...on Product {
          ...SearchProduct
        }
      }
      pageInfo {
        ...PageInfoFragment
      }
    }
  }
  ${SEARCH_PRODUCT_FRAGMENT}
  ${SEARCH_PAGE_FRAGMENT}
  ${SEARCH_ARTICLE_FRAGMENT}
  ${PAGE_INFO_FRAGMENT}
` as const;

/**
 * Regular search fetcher
 */
async function regularSearch({
  request,
  context,
}: Pick<
  Route.LoaderArgs,
  'request' | 'context'
>): Promise<RegularSearchReturn> {
  const {storefront} = context;
  const url = new URL(request.url);
  const variables = getPaginationVariables(request, {pageBy: 8});
  const term = String(url.searchParams.get('q') || '');

  // Search articles, pages, and products for the `q` term
  const {
    errors,
    ...items
  }: {errors?: Array<{message: string}>} & RegularSearchQuery =
    await storefront.query(SEARCH_QUERY, {
      variables: {...variables, term},
    });

  if (!items) {
    throw new Error('No search data returned from Shopify API');
  }

  const total = Object.values(items).reduce(
    (acc: number, {nodes}: {nodes: Array<unknown>}) => acc + nodes.length,
    0,
  );

  const error = errors
    ? errors.map(({message}: {message: string}) => message).join(', ')
    : undefined;

  return {type: 'regular', term, error, result: {total, items}};
}

/**
 * Predictive search query and fragments
 * (adjust as needed)
 */
const PREDICTIVE_SEARCH_ARTICLE_FRAGMENT = `#graphql
  fragment PredictiveArticle on Article {
    __typename
    id
    title
    handle
    blog {
      handle
    }
    image {
      url
      altText
      width
      height
    }
    trackingParameters
  }
` as const;

const PREDICTIVE_SEARCH_COLLECTION_FRAGMENT = `#graphql
  fragment PredictiveCollection on Collection {
    __typename
    id
    title
    handle
    image {
      url
      altText
      width
      height
    }
    trackingParameters
  }
` as const;

const PREDICTIVE_SEARCH_PAGE_FRAGMENT = `#graphql
  fragment PredictivePage on Page {
    __typename
    id
    title
    handle
    trackingParameters
  }
` as const;

const PREDICTIVE_SEARCH_PRODUCT_FRAGMENT = `#graphql
  fragment PredictiveProduct on Product {
    __typename
    id
    title
    handle
    trackingParameters
    selectedOrFirstAvailableVariant(
      selectedOptions: []
      ignoreUnknownOptions: true
      caseInsensitiveMatch: true
    ) {
      id
      image {
        url
        altText
        width
        height
      }
      price {
        amount
        currencyCode
      }
    }
  }
` as const;

const PREDICTIVE_SEARCH_QUERY_FRAGMENT = `#graphql
  fragment PredictiveQuery on SearchQuerySuggestion {
    __typename
    text
    styledText
    trackingParameters
  }
` as const;

// NOTE: https://shopify.dev/docs/api/storefront/latest/queries/predictiveSearch
const PREDICTIVE_SEARCH_QUERY = `#graphql
  query PredictiveSearch(
    $country: CountryCode
    $language: LanguageCode
    $limit: Int!
    $limitScope: PredictiveSearchLimitScope!
    $term: String!
    $types: [PredictiveSearchType!]
  ) @inContext(country: $country, language: $language) {
    predictiveSearch(
      limit: $limit,
      limitScope: $limitScope,
      query: $term,
      types: $types,
    ) {
      articles {
        ...PredictiveArticle
      }
      collections {
        ...PredictiveCollection
      }
      pages {
        ...PredictivePage
      }
      products {
        ...PredictiveProduct
      }
      queries {
        ...PredictiveQuery
      }
    }
  }
  ${PREDICTIVE_SEARCH_ARTICLE_FRAGMENT}
  ${PREDICTIVE_SEARCH_COLLECTION_FRAGMENT}
  ${PREDICTIVE_SEARCH_PAGE_FRAGMENT}
  ${PREDICTIVE_SEARCH_PRODUCT_FRAGMENT}
  ${PREDICTIVE_SEARCH_QUERY_FRAGMENT}
` as const;

/**
 * Predictive search fetcher
 */
async function predictiveSearch({
  request,
  context,
}: Pick<
  Route.ActionArgs,
  'request' | 'context'
>): Promise<PredictiveSearchReturn> {
  const {storefront} = context;
  const url = new URL(request.url);
  const term = String(url.searchParams.get('q') || '').trim();
  const limit = Number(url.searchParams.get('limit') || 10);
  const type = 'predictive';

  if (!term) return {type, term, result: getEmptyPredictiveSearchResult()};

  // Predictively search articles, collections, pages, products, and queries (suggestions)
  const {
    predictiveSearch: items,
    errors,
  }: PredictiveSearchQuery & {errors?: Array<{message: string}>} =
    await storefront.query(PREDICTIVE_SEARCH_QUERY, {
      variables: {
        // customize search options as needed
        limit,
        limitScope: 'EACH',
        term,
      },
    });

  if (errors) {
    throw new Error(
      `Shopify API errors: ${errors.map(({message}: {message: string}) => message).join(', ')}`,
    );
  }

  if (!items) {
    throw new Error('No predictive search data returned from Shopify API');
  }

  const total = Object.values(items).reduce(
    (acc: number, item: Array<unknown>) => acc + item.length,
    0,
  );

  return {type, term, result: {items, total}};
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}