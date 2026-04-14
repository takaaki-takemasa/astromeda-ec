import {useLoaderData} from 'react-router';
import type {Route} from './+types/wishlist';
import {Image, Money} from '@shopify/hydrogen';
import {useWishlist} from '~/components/astro/WishlistProvider';
import {Link} from 'react-router';
import type {ProductFragment} from 'storefrontapi.generated';
import {T} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'ASTROMEDA | お気に入り'},
    {name: 'description', content: 'ASTROMEDAのお気に入り商品リスト。気になるゲーミングPCやガジェットを保存できます。'},
    {name: 'robots', content: 'noindex'},
  ];
};

export async function loader({context}: Route.LoaderArgs) {
  return {};
}

export default function Wishlist() {
  const {getWishlistItems, removeFromWishlist} = useWishlist();
  const wishlistHandles = getWishlistItems();

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
        color: T.tx,
        padding: 'clamp(16px, 4vw, 48px)',
        maxWidth: 1200,
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <div style={{marginBottom: 48}}>
        <h1
          className="ph"
          style={{
            fontSize: 'clamp(20px, 4vw, 32px)',
            fontWeight: 900,
            color: T.c,
            letterSpacing: 3,
            marginBottom: 8,
          }}
        >
          ウィッシュリスト
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          {wishlistHandles.length} 件の商品
        </p>
      </div>

      {/* Empty State */}
      {wishlistHandles.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: 'rgba(0,240,255,0.02)',
            borderRadius: 16,
            border: '1px solid rgba(0,240,255,0.1)',
          }}
        >
          <div
            style={{
              fontSize: 48,
              marginBottom: 16,
              opacity: 0.3,
            }}
          >
            💭
          </div>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 12,
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            ウィッシュリストが空です
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.5)',
              marginBottom: 24,
            }}
          >
            好きな商品をウィッシュリストに追加して、後で参照できます。
          </p>
          <Link
            to="/collections"
            style={{
              display: 'inline-block',
              padding: '12px 32px',
              background: T.c,
              color: T.bg,
              borderRadius: 8,
              fontWeight: 700,
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            お買い物を続ける →
          </Link>
        </div>
      ) : (
        <WishlistGrid handles={wishlistHandles} />
      )}
    </div>
  );
}

function WishlistGrid({handles}: {handles: string[]}) {
  const {removeFromWishlist} = useWishlist();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 16,
      }}
    >
      {handles.map((handle) => (
        <WishlistCard
          key={handle}
          handle={handle}
          onRemove={() => removeFromWishlist(handle)}
        />
      ))}
    </div>
  );
}

function WishlistCard({
  handle,
  onRemove,
}: {
  handle: string;
  onRemove: () => void;
}) {
  return (
    <Link
      to={`/products/${handle}`}
      style={{
        textDecoration: 'none',
        color: 'inherit',
      }}
      prefetch="intent"
    >
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.06)',
          overflow: 'hidden',
          transition: 'all 0.3s ease',
          cursor: 'pointer',
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background =
            'rgba(0,240,255,0.05)';
          (e.currentTarget as HTMLDivElement).style.borderColor =
            'rgba(0,240,255,0.2)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.background =
            'rgba(255,255,255,0.03)';
          (e.currentTarget as HTMLDivElement).style.borderColor =
            'rgba(255,255,255,0.06)';
        }}
      >
        {/* Remove button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 10,
            background: 'rgba(255,45,85,0.2)',
            border: 'none',
            borderRadius: '50%',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: T.r,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              'rgba(255,45,85,0.3)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              'rgba(255,45,85,0.2)';
          }}
        >
          ✕
        </button>

        {/* Image placeholder */}
        <div
          style={{
            aspectRatio: '1/1',
            background: 'linear-gradient(135deg, rgba(0,240,255,0.1), rgba(255,179,0,0.05))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          {handle}
        </div>

        {/* Title */}
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.8)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {handle}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
