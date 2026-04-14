import type {Route} from './+types/api.predictive-search';
import type {PredictiveSearchQuery} from 'storefrontapi.generated';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { PredictiveSearchQuerySchema } from '~/lib/api-schemas';
import { AppError } from '~/lib/app-error';

/**
 * ============================================================
 * API Resource Route: /api.predictive-search
 * Shopify Storefront API の predictiveSearch クエリを実行
 * GET リクエスト -> JSON レスポンス
 * ============================================================
 */

export async function loader({request, context}: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.predictive-search', RATE_LIMIT_PRESETS.public);
  if (limited) return limited;
  const {storefront} = context;
  const url = new URL(request.url);

  // H-008: Zodスキーマによる入力検証（免疫受容体の統一化）
  const parsed = PredictiveSearchQuerySchema.safeParse({
    q: url.searchParams.get('q') || '',
    limit: url.searchParams.get('limit') || undefined,
  });
  const term = parsed.success ? parsed.data.q.trim() : String(url.searchParams.get('q') || '').trim().slice(0, 100);
  const limit = parsed.success ? parsed.data.limit : Math.max(1, Math.min(Number(url.searchParams.get('limit') || 10) || 10, 20));

  // Empty query response
  if (!term) {
    return Response.json({
      type: 'predictive',
      term: '',
      result: {
        total: 0,
        items: {
          products: [],
          collections: [],
          articles: [],
          pages: [],
          queries: [],
        },
      },
    });
  }

  try {
    // Predictive search query
    const {
      predictiveSearch: items,
      errors,
    }: PredictiveSearchQuery & {errors?: Array<{message: string}>} =
      await storefront.query(PREDICTIVE_SEARCH_QUERY, {
        variables: {
          limit,
          limitScope: 'EACH',
          term,
        },
      });

    if (errors) {
      throw new Error(
        `Shopify API errors: ${errors.map(({message}: {message: string}) => message).join(', ')}`
      );
    }

    if (!items) {
      throw new Error('No predictive search data returned from Shopify API');
    }

    const total = Object.values(items).reduce(
      (acc: number, item: Array<unknown>) => acc + item.length,
      0
    );

    return Response.json({
      type: 'predictive',
      term,
      result: {items, total},
    });
  } catch (error) {
    console.error('[predictive-search] Error:', error);

    return Response.json(
      {
        type: 'predictive',
        term,
        error: '検索処理中にエラーが発生しました',
        result: {
          total: 0,
          items: {
            products: [],
            collections: [],
            articles: [],
            pages: [],
            queries: [],
          },
        },
      },
      {status: 200}
    );
  }
}

/**
 * GraphQL Query Fragments for Predictive Search
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

/**
 * Predictive Search Query
 * https://shopify.dev/docs/api/storefront/latest/queries/predictiveSearch
 */
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
