import {CartForm, type FetcherWithComponents} from '@shopify/hydrogen';
import {useAside} from '~/components/Aside';
import type {ProductFragment} from 'storefrontapi.generated';
import type {MoneyV2} from '@shopify/hydrogen/storefront-api-types';

/**
 * Mobile Sticky Cart Bar — モバイル用固定カートバー
 *
 * Displays product price and cart button in a fixed bar at the bottom
 * of the mobile viewport. Hidden on desktop (768px+).
 */
export function MobileStickyCartBar({
  selectedVariant,
  price,
  title,
}: {
  selectedVariant: ProductFragment['selectedOrFirstAvailableVariant'];
  price: MoneyV2 | undefined | null;
  title: string;
}) {
  const {open} = useAside();

  const available = selectedVariant?.availableForSale ?? false;

  return (
    <div
      className="astro-mobile-cart-bar"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'rgba(6,6,12,0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '10px 16px',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Price */}
      <div style={{flex: 1, minWidth: 0}}>
        <p
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.5)',
            margin: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </p>
        {price && (
          <p
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: '#00F0FF',
              margin: '2px 0 0',
            }}
          >
            ¥{Number(price.amount).toLocaleString()}
          </p>
        )}
      </div>

      {/* Cart Button */}
      <CartForm
        route="/cart"
        inputs={{
          lines: selectedVariant
            ? [
                {
                  merchandiseId: selectedVariant.id,
                  quantity: 1,
                  selectedVariant,
                },
              ]
            : [],
        }}
        action={CartForm.ACTIONS.LinesAdd}
      >
        {(fetcher: FetcherWithComponents<unknown>) => (
          <button
            type="submit"
            onClick={() => open('cart')}
            disabled={!available || fetcher.state !== 'idle'}
            className="cta"
            style={{
              padding: '12px 24px',
              fontSize: 14,
              fontWeight: 900,
              whiteSpace: 'nowrap',
              opacity: !available ? 0.4 : 1,
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
    </div>
  );
}
