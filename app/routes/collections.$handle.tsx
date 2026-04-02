import {redirect, useLoaderData} from 'react-router';
import type {Route} from './+types/collections.$handle';
import {getPaginationVariables, Analytics, Image} from '@shopify/hydrogen';
import {PaginatedResourceSection} from '~/components/PaginatedResourceSection';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import {Link} from 'react-router';
import type {ProductItemFragment} from 'storefrontapi.generated';
import {T, al, COLLABS} from '~/lib/astromeda-data';

export const meta: Route.MetaFunction = ({data}) => {
  const collection = data?.collection;
  const title = `${collection?.title ?? ''} | ASTROMEDA`;
  const description =
    collection?.description ||
    `${collection?.title ?? ''} - ASTROMEDAのゲーミングPCコラボレーションコレクション`;
  const url = `https://shop.mining-base.co.jp/collections/${collection?.handle ?? ''}`;

  return [
    {title},
    {name: 'description', content: description},
    {property: 'og:type', content: 'website'},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:url', content: url},
    {name: 'twitter:card', content: 'summary_large_image'},
    {rel: 'canonical', href: url},
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
async function loadCriticalData({context, params, request}: Route.LoaderArgs) {
  const {handle} = params;
  const {storefront} = context;
  const paginationVariables = getPaginationVariables(request, {
    pageBy: 8,
  });

  if (!handle) {
    throw redirect('/collections');
  }

  const [{collection}] = await Promise.all([
    storefront.query(COLLECTION_QUERY, {
      variables: {handle, ...paginationVariables},
      // Add other queries here, so that they are loaded in parallel
    }),
  ]);

  if (!collection) {
    throw new Response(`Collection ${handle} not found`, {
      status: 404,
    });
  }

  // The API handle might be localized, so redirect to the localized handle
  redirectIfHandleIsLocalized(request, {handle, data: collection});

  return {
    collection,
  };
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context}: Route.LoaderArgs) {
  return {};
}

export default function Collection() {
  const {collection} = useLoaderData<typeof loader>();

  // Find matching collab data for accent color
  const collabData = COLLABS.find((c) => c.shop === collection.handle);
  const accent = collabData?.accent ?? T.c;

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        color: T.tx,
        fontFamily: "'Outfit', 'Noto Sans JP', system-ui, sans-serif",
      }}
    >
      {/* Collection header */}
      <div
        style={{
          padding: 'clamp(24px, 3vw, 48px) clamp(16px, 4vw, 48px)',
          background: `linear-gradient(160deg, ${al(accent, 0.08)}, transparent 60%)`,
          borderBottom: `1px solid ${al(accent, 0.12)}`,
        }}
      >
        <Link
          to="/"
          style={{
            fontSize: 11,
            color: T.t4,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 16,
          }}
        >
          ← ホームに戻る
        </Link>
        {collabData?.tag && (
          <div
            style={{
              display: 'inline-block',
              fontSize: 9,
              fontWeight: 900,
              padding: '3px 10px',
              borderRadius: 6,
              background: collabData.tag === 'NEW' ? T.r : '#FF9500',
              color: T.tx,
              letterSpacing: 2,
              marginBottom: 12,
            }}
          >
            {collabData.tag}
          </div>
        )}
        <h1
          className="ph"
          style={{
            fontSize: 'clamp(18px, 3vw, 32px)',
            fontWeight: 900,
            color: T.tx,
            marginBottom: 8,
          }}
        >
          {collection.title}
        </h1>
        {collection.description && (
          <p
            style={{
              fontSize: 'clamp(11px, 1.3vw, 14px)',
              color: T.t5,
              lineHeight: 1.7,
              maxWidth: 600,
            }}
          >
            {collection.description}
          </p>
        )}
      </div>

      {/* Products grid */}
      <div style={{padding: 'clamp(20px, 3vw, 40px) clamp(16px, 4vw, 48px)'}}>
        <PaginatedResourceSection<ProductItemFragment>
          connection={collection.products}
          resourcesClassName="astro-products-grid"
        >
          {({node: product, index}) => (
            <AstroProductItem
              key={product.id}
              product={product}
              accent={accent}
              loading={index < 8 ? 'eager' : undefined}
            />
          )}
        </PaginatedResourceSection>
      </div>

      <Analytics.CollectionView
        data={{
          collection: {
            id: collection.id,
            handle: collection.handle,
          },
        }}
      />

      <style>{`
        .astro-products-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: clamp(10px, 1.5vw, 16px);
        }
        .astro-product-card {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .astro-product-card:hover {
          transform: scale(1.03);
          box-shadow: 0 16px 48px rgba(0,240,255,.1);
        }
      `}</style>
    </div>
  );
}

function AstroProductItem({
  product,
  accent,
  loading,
}: {
  product: ProductItemFragment;
  accent: string;
  loading?: 'eager' | 'lazy';
}) {
  return (
    <Link
      to={`/products/${product.handle}`}
      className="astro-product-card"
      style={{textDecoration: 'none'}}
    >
      {product.featuredImage ? (
        <div style={{aspectRatio: '4/3', overflow: 'hidden', background: al(accent, 0.05)}}>
          <Image
            data={product.featuredImage}
            loading={loading}
            sizes="(min-width: 768px) 25vw, 50vw"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: 0,
            }}
          />
        </div>
      ) : (
        <div
          style={{
            aspectRatio: '4/3',
            background: `linear-gradient(160deg, ${al(accent, 0.15)}, ${T.bg})`,
          }}
        />
      )}
      <div style={{padding: 'clamp(10px, 1.2vw, 14px)'}}>
        <div
          style={{
            fontSize: 'clamp(10px, 1.2vw, 12px)',
            fontWeight: 800,
            color: T.tx,
            lineHeight: 1.3,
            marginBottom: 4,
          }}
        >
          {product.title}
        </div>
        {product.priceRange?.minVariantPrice && (
          <div
            className="ph"
            style={{
              fontSize: 'clamp(13px, 1.6vw, 16px)',
              color: accent,
              fontWeight: 900,
            }}
          >
            ¥{Number(product.priceRange.minVariantPrice.amount).toLocaleString('ja-JP')}
            <span style={{fontSize: 10, color: T.t4, fontWeight: 500}}>〜</span>
          </div>
        )}
      </div>
    </Link>
  );
}

const PRODUCT_ITEM_FRAGMENT = `#graphql
  fragment MoneyProductItem on MoneyV2 {
    amount
    currencyCode
  }
  fragment ProductItem on Product {
    id
    handle
    title
    featuredImage {
      id
      altText
      url
      width
      height
    }
    priceRange {
      minVariantPrice {
        ...MoneyProductItem
      }
      maxVariantPrice {
        ...MoneyProductItem
      }
    }
  }
` as const;

// NOTE: https://shopify.dev/docs/api/storefront/2022-04/objects/collection
const COLLECTION_QUERY = `#graphql
  ${PRODUCT_ITEM_FRAGMENT}
  query Collection(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
    $first: Int
    $last: Int
    $startCursor: String
    $endCursor: String
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      products(
        first: $first,
        last: $last,
        before: $startCursor,
        after: $endCursor
      ) {
        nodes {
          ...ProductItem
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
` as const;
