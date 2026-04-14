import React, {useEffect, useState} from 'react';
import {CartForm} from '@shopify/hydrogen';
import {Link, useFetcher, type FetcherWithComponents} from 'react-router';
import {T, al} from '~/lib/astromeda-data';

interface RecommendedProduct {
  id: string;           // variant ID (for cart add)
  productId: string;    // product GID
  handle: string;
  title: string;
  imageUrl: string | null;
  price: {amount: string; currencyCode: string} | null;
  availableForSale: boolean;
}

interface CartUpsellProps {
  cartLines: Array<{merchandise: {product: {id: string}}}> | null;
}

function CartUpsellComponent({cartLines}: CartUpsellProps) {
  const [recommendations, setRecommendations] = useState<RecommendedProduct[]>([]);
  const fetcher = useFetcher();

  // カート内の最初の商品IDをベースにレコメンドを取得
  useEffect(() => {
    if (!cartLines || cartLines.length === 0) {
      setRecommendations([]);
      return;
    }

    const firstProductId = cartLines[0]?.merchandise?.product?.id;
    if (!firstProductId) return;

    // useFetcherでAPIルートを叩く
    fetcher.load(`/api/recommendations?productId=${encodeURIComponent(firstProductId)}`);
  }, [cartLines]);

  // APIレスポンスを処理
  useEffect(() => {
    if (fetcher.data?.products && fetcher.data.products.length > 0) {
      // カート内商品と重複しないようフィルタ
      const cartProductIds = new Set(
        (cartLines || []).map((line) => line.merchandise.product.id),
      );
      const filtered = fetcher.data.products.filter(
        (p: RecommendedProduct) => !cartProductIds.has(p.productId),
      );
      setRecommendations(filtered.slice(0, 4));
    }
  }, [fetcher.data, cartLines]);

  if (recommendations.length === 0 && fetcher.state === 'idle') {
    return null;
  }

  return (
    <div
      style={{
        marginTop: 32,
        paddingTop: 32,
        borderTop: `1px solid ${T.bd}`,
      }}
    >
      <h2
        style={{
          fontSize: 'clamp(16px, 2.5vw, 20px)',
          fontWeight: 900,
          color: T.r,
          marginBottom: 24,
          letterSpacing: 2,
        }}
      >
        こちらもおすすめ
      </h2>

      {fetcher.state === 'loading' ? (
        <div style={{textAlign: 'center', padding: 24, color: T.t3, fontSize: 13}}>
          読み込み中...
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 16,
          }}
        >
          {recommendations.map((product) => (
            <CartUpsellCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

export const CartUpsell = React.memo(CartUpsellComponent);
CartUpsell.displayName = 'CartUpsell';

const CartUpsellCard = React.memo(function CartUpsellCard({product}: {product: RecommendedProduct}) {
  return (
    <div
      style={{
        background: T.bgC,
        borderRadius: 12,
        border: `1px solid ${T.bd}`,
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.background = al(T.r, 0.05);
        el.style.borderColor = al(T.r, 0.15);
        el.style.transform = 'translateY(-4px)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.background = T.bgC;
        el.style.borderColor = T.bd;
        el.style.transform = 'translateY(0)';
      }}
    >
      <Link
        to={`/products/${product.handle}`}
        prefetch="intent"
        style={{textDecoration: 'none', color: 'inherit'}}
      >
        <div
          style={{
            aspectRatio: '1/1',
            background: product.imageUrl
              ? `url(${product.imageUrl}&width=320&height=320&crop=center) center/cover no-repeat`
              : `linear-gradient(135deg, ${al(T.r, 0.15)}, rgba(255,179,0,0.08))`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: T.t3,
          }}
        >
          {!product.imageUrl && product.title}
        </div>
      </Link>

      <div
        style={{
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        }}
      >
        <Link
          to={`/products/${product.handle}`}
          prefetch="intent"
          style={{
            textDecoration: 'none',
            color: 'inherit',
            flex: 1,
            marginBottom: 8,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: al(T.tx, 0.8),
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              margin: 0,
              marginBottom: 4,
            }}
          >
            {product.title}
          </p>
        </Link>

        {product.price && (
          <p
            style={{
              fontSize: 12,
              fontWeight: 900,
              color: T.r,
              margin: '0 0 8px',
            }}
          >
            ¥{parseInt(product.price.amount).toLocaleString('ja-JP')}
          </p>
        )}

        <CartUpsellAddButton
          variantId={product.id}
          available={product.availableForSale}
        />
      </div>
    </div>
  );
});
CartUpsellCard.displayName = 'CartUpsellCard';

const CartUpsellAddButton = React.memo(function CartUpsellAddButton({
  variantId,
  available,
}: {
  variantId: string;
  available: boolean;
}) {
  return (
    <CartForm
      route="/cart"
      inputs={{
        lines: [
          {
            merchandiseId: variantId,
            quantity: 1,
            selectedVariant: {id: variantId},
          },
        ],
      }}
      action={CartForm.ACTIONS.LinesAdd}
    >
      {(fetcher: FetcherWithComponents<unknown>) => (
        <button
          type="submit"
          disabled={!available || fetcher.state !== 'idle'}
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 6,
            border: 'none',
            background: available
              ? al(T.r, 0.2)
              : al(T.tx, 0.05),
            color: available ? T.r : T.t3,
            cursor: available ? 'pointer' : 'default',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (available) {
              (e.currentTarget as HTMLButtonElement).style.background =
                al(T.r, 0.3);
            }
          }}
          onMouseLeave={(e) => {
            if (available) {
              (e.currentTarget as HTMLButtonElement).style.background =
                al(T.r, 0.2);
            }
          }}
        >
          {!available
            ? '売り切れ'
            : fetcher.state !== 'idle'
              ? '追加中...'
              : 'カートに追加'}
        </button>
      )}
    </CartForm>
  );
});
CartUpsellAddButton.displayName = 'CartUpsellAddButton';
