/**
 * API Route: /api/recommendations?productId=gid://shopify/Product/xxx
 * Shopify Storefront API の productRecommendations を使用して
 * カート内商品に基づくレコメンドを返す（感覚系 — 購買行動の知覚）
 */
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { RecommendationsQuerySchema } from '~/lib/api-schemas';
import { AppError } from '~/lib/app-error';

interface RecommendedProduct {
  id: string;
  handle: string;
  title: string;
  availableForSale?: boolean;
  featuredImage?: {url?: string} | null;
  priceRange?: {minVariantPrice?: {amount?: string; currencyCode?: string}} | null;
  variants?: {nodes?: Array<{id: string}>} | null;
}
interface StorefrontLike {
  query: <T>(query: string, opts?: {variables?: Record<string, unknown>; cache?: unknown}) => Promise<T>;
  CacheShort: () => unknown;
}
export async function loader({request, context}: {request: Request; context: {storefront: StorefrontLike}}) {
  const limited = applyRateLimit(request, 'api.recommendations', RATE_LIMIT_PRESETS.public);
  if (limited) return limited;

  // 免疫系: リクエスト検証（不正な入力を早期排除）
  if (request.method !== 'GET') {
    return Response.json({error: 'Method Not Allowed'}, {status: 405});
  }

  const url = new URL(request.url);
  const rawProductId = url.searchParams.get('productId');

  // H-008: Zodスキーマによる入力検証（免疫受容体の統一化）
  const parsed = RecommendationsQuerySchema.safeParse({productId: rawProductId ?? ''});
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? '無効なproductIdです';
    return Response.json({error: firstError}, {status: 400});
  }
  const productId = parsed.data.productId;

  try {
    const {productRecommendations} = await context.storefront.query<{productRecommendations: RecommendedProduct[] | null}>(
      RECOMMENDATIONS_QUERY,
      {
        variables: {productId},
        cache: context.storefront.CacheShort(),
      },
    );

    const products = (productRecommendations || []).slice(0, 4).map((p: RecommendedProduct) => ({
      id: p.variants?.nodes?.[0]?.id || p.id,
      productId: p.id,
      handle: p.handle,
      title: p.title,
      imageUrl: p.featuredImage?.url || null,
      price: p.priceRange?.minVariantPrice || null,
      availableForSale: p.availableForSale,
    }));

    return Response.json({products});
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Recommendations API error:', error);
    return Response.json({products: []}, {status: 500});
  }
}

const RECOMMENDATIONS_QUERY = `#graphql
  query ProductRecommendations($productId: ID!) {
    productRecommendations(productId: $productId) {
      id
      handle
      title
      availableForSale
      featuredImage {
        url
        altText
        width
        height
      }
      priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
      }
      variants(first: 1) {
        nodes {
          id
        }
      }
    }
  }
` as const;
