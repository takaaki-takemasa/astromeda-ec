import {useLoaderData, Link} from 'react-router';
import type {Route} from './+types/collections._index';
import {getPaginationVariables, Image} from '@shopify/hydrogen';
import type {CollectionFragment} from 'storefrontapi.generated';
import {PaginatedResourceSection} from '~/components/PaginatedResourceSection';
import {AppError} from '~/lib/app-error';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {STORE_URL} from '~/lib/astromeda-data';

export const meta: Route.MetaFunction = () => {
  const url = `${STORE_URL}/collections`;
  const title = 'ASTROMEDA | アニメ・ゲームIPコラボゲーミングPC';
  return [
    {title},
    {name: 'description', content: '25タイトル以上のアニメ・ゲームIPコラボゲーミングPC。ONE PIECE、NARUTO、呪術廻戦、ストリートファイター6など人気タイトルとのコラボモデルを展開。国内自社工場で受注生産。'},
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
async function loadCriticalData({context, request}: Route.LoaderArgs) {
  const paginationVariables = getPaginationVariables(request, {
    pageBy: 50,
  });

  let collections;
  try {
    const [result] = await Promise.all([
      context.storefront.query(COLLECTIONS_QUERY, {
        variables: paginationVariables,
      }),
    ]);
    collections = result.collections;
  } catch (error) {
    process.env.NODE_ENV === 'development' && console.error('[collections._index] Storefront API error:', error);
    throw AppError.externalApi('コレクション一覧の取得に失敗しました');
  }

  return {collections};
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context}: Route.LoaderArgs) {
  return {};
}

export default function Collections() {
  const {collections} = useLoaderData<typeof loader>();

  return (
    <div style={{minHeight: '100vh', padding: '2rem 1rem'}}>
      <div style={{maxWidth: 1200, margin: '0 auto'}}>
        <h1 style={{
          fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
          fontWeight: 700,
          textAlign: 'center',
          marginBottom: '0.5rem',
          background: 'linear-gradient(135deg, #00f0ff, #a855f7)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          IP COLLABORATION
        </h1>
        <p style={{textAlign: 'center', color: '#888', marginBottom: '2rem', fontSize: '0.9rem'}}>
          25タイトル以上のアニメ・ゲームIPコラボモデル
        </p>
        <PaginatedResourceSection<CollectionFragment>
          connection={collections}
          resourcesClassName="collections-grid"
        >
          {({node: collection, index}) => (
            <CollectionItem
              key={collection.id}
              collection={collection}
              index={index}
            />
          )}
        </PaginatedResourceSection>
      </div>
    </div>
  );
}

function CollectionItem({
  collection,
  index,
}: {
  collection: CollectionFragment;
  index: number;
}) {
  return (
    <Link
      key={collection.id}
      to={`/collections/${collection.handle}`}
      prefetch="intent"
      style={{
        display: 'block',
        position: 'relative',
        borderRadius: 12,
        overflow: 'hidden',
        aspectRatio: '16/9',
        background: collection?.image
          ? undefined
          : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,240,255,0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {collection?.image ? (
        <Image
          alt={collection.image.altText || collection.title}
          data={collection.image}
          loading={index < 6 ? 'eager' : 'lazy'}
          sizes="(min-width: 768px) 33vw, 50vw"
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
      ) : null}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '2rem 1rem 1rem',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
      }}>
        <h3 style={{
          fontSize: 'clamp(0.85rem, 2vw, 1.1rem)',
          fontWeight: 600,
          color: '#fff',
          margin: 0,
        }}>
          {collection.title}
        </h3>
      </div>
    </Link>
  );
}

const COLLECTIONS_QUERY = `#graphql
  fragment Collection on Collection {
    id
    title
    handle
    image {
      id
      url
      altText
      width
      height
    }
  }
  query StoreCollections(
    $country: CountryCode
    $endCursor: String
    $first: Int
    $language: LanguageCode
    $last: Int
    $startCursor: String
  ) @inContext(country: $country, language: $language) {
    collections(
      first: $first,
      last: $last,
      before: $startCursor,
      after: $endCursor
    ) {
      nodes {
        ...Collection
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
` as const;

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
