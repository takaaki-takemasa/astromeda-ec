import {Link, useNavigate} from 'react-router';
import {type MappedProductOptions} from '@shopify/hydrogen';
import type {
  Maybe,
  ProductOptionValueSwatch,
} from '@shopify/hydrogen/storefront-api-types';
import {AddToCartButton} from './AddToCartButton';
import {useAside} from './Aside';
import type {ProductFragment} from 'storefrontapi.generated';
import {T, al} from '~/lib/astromeda-data';

export function ProductForm({
  productOptions,
  selectedVariant,
}: {
  productOptions: MappedProductOptions[];
  selectedVariant: ProductFragment['selectedOrFirstAvailableVariant'];
}) {
  const navigate = useNavigate();
  const {open} = useAside();

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
      {productOptions.map((option) => {
        if (option.optionValues.length === 1) return null;

        return (
          <div key={option.name}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: T.t4,
                letterSpacing: 2,
                marginBottom: 10,
                textTransform: 'uppercase' as const,
              }}
            >
              {option.name}
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap' as const, gap: 8}}>
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

                const btnStyle = {
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: `1.5px solid ${selected ? T.c : al(T.t3, 0.3)}`,
                  background: selected ? al(T.c, 0.12) : T.bgC,
                  color: selected ? T.c : T.t5,
                  fontSize: 12,
                  fontWeight: selected ? 700 : 500,
                  cursor: available ? 'pointer' : 'not-allowed',
                  opacity: available ? 1 : 0.35,
                  transition: 'all 0.15s',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                };

                if (isDifferentProduct) {
                  return (
                    <Link
                      key={option.name + name}
                      prefetch="intent"
                      preventScrollReset
                      replace
                      to={`/products/${handle}?${variantUriQuery}`}
                      style={btnStyle}
                    >
                      <ProductOptionSwatch swatch={swatch} name={name} />
                    </Link>
                  );
                }

                return (
                  <button
                    type="button"
                    key={option.name + name}
                    style={btnStyle}
                    disabled={!exists}
                    onClick={() => {
                      if (!selected) {
                        void navigate(`?${variantUriQuery}`, {
                          replace: true,
                          preventScrollReset: true,
                        });
                      }
                    }}
                  >
                    <ProductOptionSwatch swatch={swatch} name={name} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Add to Cart button */}
      <AddToCartButton
        disabled={!selectedVariant || !selectedVariant.availableForSale}
        onClick={() => open('cart')}
        lines={
          selectedVariant
            ? [{merchandiseId: selectedVariant.id, quantity: 1, selectedVariant}]
            : []
        }
      >
        {selectedVariant?.availableForSale ? (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 1,
            }}
          >
            <span>🛒</span> カートに追加
          </span>
        ) : (
          <span style={{fontSize: 14, fontWeight: 700, color: T.t4}}>
            売り切れ
          </span>
        )}
      </AddToCartButton>

      {selectedVariant?.availableForSale && (
        <div
          style={{
            textAlign: 'center' as const,
            fontSize: 11,
            color: T.t4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <span style={{color: '#4CAF50', fontWeight: 700}}>●</span>
          在庫あり・即日受付
        </div>
      )}
    </div>
  );
}

function ProductOptionSwatch({
  swatch,
  name,
}: {
  swatch?: Maybe<ProductOptionValueSwatch> | undefined;
  name: string;
}) {
  const image = swatch?.image?.previewImage?.url;
  const color = swatch?.color;

  if (!image && !color) return <>{name}</>;

  return (
    <div
      aria-label={name}
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        backgroundColor: color || 'transparent',
        border: '1px solid rgba(255,255,255,0.2)',
        display: 'inline-block',
      }}
    >
      {!!image && (
        <img src={image} alt={name} style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} />
      )}
    </div>
  );
}
