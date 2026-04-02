import type {CartLineUpdateInput} from '@shopify/hydrogen/storefront-api-types';
import type {CartLayout, LineItemChildrenMap} from '~/components/CartMain';
import {CartForm, Image, type OptimisticCartLine} from '@shopify/hydrogen';
import {useVariantUrl} from '~/lib/variants';
import {Link} from 'react-router';
import {useAside} from './Aside';
import type {CartApiQueryFragment} from 'storefrontapi.generated';
import {T, al} from '~/lib/astromeda-data';
import {Money} from '@shopify/hydrogen';

export type CartLine = OptimisticCartLine<CartApiQueryFragment>;

export function CartLineItem({
  layout,
  line,
  childrenMap,
}: {
  layout: CartLayout;
  line: CartLine;
  childrenMap: LineItemChildrenMap;
}) {
  const {id, merchandise} = line;
  const {product, title, image, selectedOptions} = merchandise;
  const lineItemUrl = useVariantUrl(product.handle, selectedOptions);
  const {close} = useAside();
  const lineItemChildren = childrenMap[id];

  return (
    <li
      style={{
        display: 'flex',
        gap: 12,
        padding: 12,
        background: al(T.c, 0.02),
        borderRadius: 12,
        border: `1px solid ${T.t1}`,
      }}
    >
      {/* Image */}
      <div
        style={{
          width: 72,
          height: 72,
          flexShrink: 0,
          borderRadius: 8,
          overflow: 'hidden',
          background: '#0D0D18',
        }}
      >
        {image ? (
          <Image
            alt={title}
            aspectRatio="1/1"
            data={image}
            height={72}
            width={72}
            loading="lazy"
            style={{width: '100%', height: '100%', objectFit: 'cover'}}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: al(T.c, 0.08),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: T.t3,
              fontSize: 20,
            }}
          >
            🖥
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{flex: 1, minWidth: 0}}>
        <Link
          prefetch="intent"
          to={lineItemUrl}
          onClick={() => layout === 'aside' && close()}
          style={{textDecoration: 'none'}}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: T.tx,
              lineHeight: 1.4,
              marginBottom: 4,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {product.title}
          </div>
        </Link>

        {/* Options */}
        {selectedOptions
          .filter((o) => o.value !== 'Default Title')
          .map((option) => (
            <div key={option.name} style={{fontSize: 10, color: T.t4, marginBottom: 2}}>
              {option.name}: {option.value}
            </div>
          ))}

        {/* Price + Quantity row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <div className="ph" style={{fontSize: 13, fontWeight: 900, color: T.c}}>
            <Money data={line.cost.totalAmount} />
          </div>
          <CartLineQuantity line={line} />
        </div>
      </div>
    </li>
  );
}

function CartLineQuantity({line}: {line: CartLine}) {
  if (!line || typeof line?.quantity === 'undefined') return null;
  const {id: lineId, quantity, isOptimistic} = line;
  const prevQuantity = Math.max(0, quantity - 1);
  const nextQuantity = quantity + 1;

  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 4}}>
      <CartLineUpdateButton lines={[{id: lineId, quantity: prevQuantity}]}>
        <button
          aria-label="数量を減らす"
          disabled={quantity <= 1 || !!isOptimistic}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: `1px solid ${al(T.t3, 0.3)}`,
            background: T.bgC,
            color: T.t5,
            cursor: quantity <= 1 ? 'not-allowed' : 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: quantity <= 1 ? 0.4 : 1,
            padding: 0,
          }}
        >
          −
        </button>
      </CartLineUpdateButton>

      <span style={{fontSize: 12, fontWeight: 700, color: T.tx, minWidth: 20, textAlign: 'center' as const}}>
        {quantity}
      </span>

      <CartLineUpdateButton lines={[{id: lineId, quantity: nextQuantity}]}>
        <button
          aria-label="数量を増やす"
          disabled={!!isOptimistic}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: `1px solid ${al(T.c, 0.4)}`,
            background: al(T.c, 0.08),
            color: T.c,
            cursor: 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          ＋
        </button>
      </CartLineUpdateButton>

      <CartLineRemoveButton lineIds={[lineId]} disabled={!!isOptimistic} />
    </div>
  );
}

function CartLineRemoveButton({lineIds, disabled}: {lineIds: string[]; disabled: boolean}) {
  return (
    <CartForm
      fetcherKey={getUpdateKey(lineIds)}
      route="/cart"
      action={CartForm.ACTIONS.LinesRemove}
      inputs={{lineIds}}
    >
      <button
        disabled={disabled}
        type="submit"
        aria-label="削除"
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          border: `1px solid ${al('#FF2D55', 0.3)}`,
          background: al('#FF2D55', 0.06),
          color: '#FF2D55',
          cursor: 'pointer',
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 4,
          padding: 0,
        }}
      >
        ×
      </button>
    </CartForm>
  );
}

function CartLineUpdateButton({children, lines}: {children: React.ReactNode; lines: CartLineUpdateInput[]}) {
  const lineIds = lines.map((line) => line.id);
  return (
    <CartForm
      fetcherKey={getUpdateKey(lineIds)}
      route="/cart"
      action={CartForm.ACTIONS.LinesUpdate}
      inputs={{lines}}
    >
      {children}
    </CartForm>
  );
}

function getUpdateKey(lineIds: string[]) {
  return [CartForm.ACTIONS.LinesUpdate, ...lineIds].join('-');
}
