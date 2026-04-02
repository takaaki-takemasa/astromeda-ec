import {useLoaderData, Link} from 'react-router';
import type {Route} from './+types/collections._index';
import {getPaginationVariables, Image} from '@shopify/hydrogen';
import type {CollectionFragment} from 'storefrontapi.generated';
import {PaginatedResourceSection} from '~/components/PaginatedResourceSection';
import {T, al, COLLABS} from '~/lib/astromeda-data';

export const meta: Route.MetaFunction = () => {
  const title = 'ASTROMEDA | コレクション一覧';
  const description =
    'ASTROMEDAの全コレクション一覧。ONE PIECE・NARUTO・ヒロアカなど人気IPコラボのゲーミングPC・周辺機器を多数展開。';
  return [
    {title},
    {name: 'description', content: description},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {name: 'twitter:card', content: 'summary'},
  ];
};

export async function loader(args: Route.LoaderArgs) {
  const deferredData = loadDeferredData(args);
  const criticalData = await loadCriticalData(args);
  return {...deferredData, ...criticalData};
}

async function loadCriticalData({context, request}: Route.LoaderArgs) {
  const paginationVariables = getPaginationVariables(request, {pageBy: 12});
  const [{collections}] = await Promise.all([
    context.storefront.query(COLLECTIONS_QUERY, {variables: paginationVariables}),
  ]);
  return {collections};
}

function loadDeferredData({context: _context}: Route.LoaderArgs) {
  return {};
}

export default function Collections() {
  const {collections} = useLoaderData<typeof loader>();

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        color: T.tx,
        fontFamily: "'Outfit', 'Noto Sans JP', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 'clamp(24px, 3vw, 48px) clamp(16px, 4vw, 48px) clamp(16px, 2vw, 24px)',
          borderBottom: `1px solid ${T.t1}`,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: T.t4,
            letterSpacing: 3,
            marginBottom: 8,
          }}
        >
          COLLECTIONS
        </div>
        <h1
          className="ph"
          style={{
            fontSize: 'clamp(20px, 3vw, 32px)',
            fontWeight: 900,
            color: T.tx,
            margin: 0,
          }}
        >
          全コレクション
        </h1>
      </div>

      {/* Grid */}
      <div style={{padding: 'clamp(20px, 3vw, 40px) clamp(16px, 4vw, 48px)'}}>
        <PaginatedResourceSection<CollectionFragment>
          connection={collections}
          resourcesClassName="astro-collections-grid"
        >
          {({node: collection, index}) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              index={index}
            />
          )}
        </PaginatedResourceSection>
      </div>

      <style>{`
        .astro-collections-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: clamp(12px, 2vw, 20px);
        }
        @media (max-width: 480px) {
          .astro-collections-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }
        }
      `}</style>
    </div>
  );
}

function CollectionCard({
  collection,
  index,
}: {
  collection: CollectionFragment;
  index: number;
}) {
  const collabData = COLLABS.find((c) => c.shop === collection.handle);
  const accent = collabData?.accent ?? T.c;

  return (
    <Link
      to={`/collections/${collection.handle}`}
      prefetch="intent"
      className="astro-product-card"
      style={{textDecoration: 'none', display: 'block'}}
    >
      {/* Image */}
      <div
        style={{
          aspectRatio: '4/3',
          overflow: 'hidden',
          background: `linear-gradient(160deg, ${al(accent, 0.15)}, ${T.bg})`,
          position: 'relative',
        }}
      >
        {collection.image ? (
          <Image
            alt={collection.image.altText || collection.title}
            aspectRatio="4/3"
            data={collection.image}
            loading={index < 6 ? 'eager' : 'lazy'}
            sizes="(min-width: 768px) 25vw, 50vw"
            style={{width: '100%', height: '100%', objectFit: 'cover'}}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
            }}
          >
            🖥
          </div>
        )}
        {collabData?.tag && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              fontSize: 8,
              fontWeight: 900,
              padding: '2px 8px',
              borderRadius: 4,
              background: collabData.tag === 'NEW' ? T.r : '#FF9500',
              color: '#fff',
              letterSpacing: 1,
            }}
          >
            {collabData.tag}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{padding: 'clamp(10px, 1.2vw, 14px)'}}>
        <div
          style={{
            fontSize: 'clamp(11px, 1.3vw, 13px)',
            fontWeight: 800,
            color: T.tx,
            lineHeight: 1.3,
            marginBottom: 4,
          }}
        >
          {collection.title}
        </div>
        <div
          style={{
            fontSize: 10,
            color: accent,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          コレクションを見る →
        </div>
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
      id url altText width height
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
    collections(first: $first, last: $last, before: $startCursor, after: $endCursor) {
      nodes { ...Collection }
      pageInfo {
        hasNextPage hasPreviousPage startCursor endCursor
      }
    }
  }
` as const;
