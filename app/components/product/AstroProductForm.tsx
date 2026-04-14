import {Link, useNavigate, useFetcher, type FetcherWithComponents} from 'react-router';
import {CartForm} from '@shopify/hydrogen';
import {useAside} from '~/components/Aside';
import {WishlistButton} from '~/components/astro/WishlistButton';
import {BackInStockNotify} from '~/components/astro/BackInStockNotify';
import {ShippingEstimate} from '~/components/astro/ShippingEstimate';
import {CUSTOMIZATION_SKU_MAP} from '~/lib/customization-sku-map';
import {isColorOption, resolveColor} from '~/lib/product-helpers';
import type {MappedProductOptions} from '@shopify/hydrogen';
import type {ProductFragment} from 'storefrontapi.generated';

/**
 * Astromeda Product Form — Variant Selector + Cart Button
 *
 * Displays product options (including color swatches), add-to-cart button,
 * wishlist button, back-in-stock notifications, and shipping estimates.
 */
export function AstroProductForm({
  productOptions,
  selectedVariant,
  productHandle,
  productTitle,
  productTags,
  customizationAttributes,
  customizationSurcharge = 0,
  skuToVariantId = {},
}: {
  productOptions: MappedProductOptions[];
  selectedVariant: ProductFragment['selectedOrFirstAvailableVariant'];
  productHandle: string;
  productTitle: string;
  productTags: string[];
  customizationAttributes?: {key: string; value: string}[];
  customizationSurcharge?: number;
  skuToVariantId?: Record<string, string>;
}) {
  const navigate = useNavigate();
  const {open} = useAside();
  const cartFetcher = useFetcher();

  return (
    <div>
      {productOptions.map((option) => {
        if (option.optionValues.length === 1) return null;

        const isColor = isColorOption(option.name);

        return (
          <div key={option.name} style={{marginBottom: 20}}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: 'rgba(255,255,255,.4)',
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              {option.name}
              {/* 選択中のカラー名を表示 */}
              {isColor && option.optionValues.find(v => v.selected) && (
                <span style={{color: '#00F0FF', marginLeft: 8, fontWeight: 600}}>
                  {option.optionValues.find(v => v.selected)?.name}
                </span>
              )}
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: isColor ? 10 : 8}}>
              {option.optionValues.map((value) => {
                const {
                  name,
                  handle,
                  variantUriQuery,
                  selected,
                  available,
                  exists,
                  isDifferentProduct,
                  swatch,
                } = value;

                const colorVal = isColor ? resolveColor(name, swatch) : swatch?.color || null;
                const showSwatch = !!colorVal;

                const baseStyle: React.CSSProperties = {
                  padding: showSwatch ? '0' : '8px 16px',
                  borderRadius: showSwatch ? '50%' : 10,
                  border: selected
                    ? `2px solid ${isColor ? '#00F0FF' : '#00F0FF'}`
                    : '1px solid rgba(255,255,255,.12)',
                  background: selected && !showSwatch
                    ? 'rgba(0,240,255,.08)'
                    : showSwatch ? 'transparent' : 'rgba(255,255,255,.04)',
                  color: selected ? '#00F0FF' : 'rgba(255,255,255,.7)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: exists ? 'pointer' : 'default',
                  opacity: available ? 1 : 0.3,
                  transition: 'all .2s',
                  width: showSwatch ? 36 : undefined,
                  height: showSwatch ? 36 : undefined,
                  boxShadow: selected && showSwatch
                    ? `0 0 12px rgba(0,240,255,.3)`
                    : selected ? '0 0 12px rgba(0,240,255,.2)' : 'none',
                  position: showSwatch ? 'relative' as const : undefined,
                  display: showSwatch ? 'flex' : undefined,
                  alignItems: showSwatch ? 'center' : undefined,
                  justifyContent: showSwatch ? 'center' : undefined,
                };

                const swatchCircle = showSwatch ? (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: colorVal!,
                      border: name === 'ホワイト' || name === 'White' ? '1px solid rgba(255,255,255,.3)' : 'none',
                    }}
                    title={name}
                  />
                ) : null;

                if (isDifferentProduct) {
                  return (
                    <Link
                      key={option.name + name}
                      prefetch="intent"
                      preventScrollReset
                      replace
                      to={`/products/${handle}?${variantUriQuery}`}
                      style={{...baseStyle, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center'}}
                      title={showSwatch ? name : undefined}
                    >
                      {swatchCircle || name}
                    </Link>
                  );
                }

                return (
                  <button
                    type="button"
                    key={option.name + name}
                    style={baseStyle}
                    disabled={!exists}
                    title={showSwatch ? name : undefined}
                    onClick={() => {
                      if (!selected) {
                        void navigate(`?${variantUriQuery}`, {
                          replace: true,
                          preventScrollReset: true,
                        });
                      }
                    }}
                  >
                    {swatchCircle || name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Add to Cart + Wishlist */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'stretch',
          marginTop: 8,
        }}
      >
        <div style={{flex: 1}}>
          {/* Hydrationエラー#418でReactイベントが動かないため、
              CartForm（native HTML form）+ バニラJSでhidden inputを更新する方式 */}
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
              <>
                <input name="analytics" type="hidden" value="{}" />
                {/* skuToVariantIdマップをdata属性で渡す（バニラJSから参照） */}
                <input
                  type="hidden"
                  id="sku-variant-map"
                  value={JSON.stringify(skuToVariantId)}
                />
                <input
                  type="hidden"
                  id="product-handle"
                  value={productHandle}
                />
                <input
                  type="hidden"
                  id="selected-variant-id"
                  value={selectedVariant?.id || ''}
                />
                <button
                  type="submit"
                  onClick={() => open('cart')}
                  disabled={
                    !selectedVariant ||
                    !selectedVariant.availableForSale ||
                    fetcher.state !== 'idle'
                  }
                  className="cta"
                  data-cart-submit="true"
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '16px',
                    fontSize: 15,
                    fontWeight: 900,
                    textAlign: 'center',
                    opacity:
                      !selectedVariant || !selectedVariant.availableForSale
                        ? 0.4
                        : 1,
                  }}
                >
                  {!selectedVariant || !selectedVariant.availableForSale
                    ? '売り切れ'
                    : fetcher.state !== 'idle'
                      ? '追加中...'
                      : 'カートに追加'}
                </button>
              </>
            )}
          </CartForm>

          {/* CUSTOMIZATION_SKU_MAP データ — entry.client.tsx のインターセプターが参照 */}
          <script
            type="application/json"
            id="customization-sku-map-data"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(CUSTOMIZATION_SKU_MAP),
            }}
          />
        </div>

        {/* Wishlist Button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.06)',
            padding: '12px 16px',
            minWidth: 56,
          }}
        >
          <WishlistButton productHandle={productHandle} size="medium" />
        </div>
      </div>

      {/* Back in Stock / Price Drop Notification — 売り切れ時のみ表示 */}
      {selectedVariant && !selectedVariant.availableForSale && (
        <BackInStockNotify
          productHandle={productHandle}
          variantId={selectedVariant.id}
          productTitle={productTitle}
        />
      )}

      {/* Shipping Estimate — 配送見積もり */}
      <ShippingEstimate
        productTitle={productTitle}
        productTags={productTags}
      />
    </div>
  );
}
