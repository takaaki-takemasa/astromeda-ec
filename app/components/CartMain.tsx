import {useOptimisticCart, type OptimisticCartLine} from '@shopify/hydrogen';
import {Link} from 'react-router';
import type {CartApiQueryFragment} from 'storefrontapi.generated';
import {useAside} from '~/components/Aside';
import {CartLineItem, type CartLine} from '~/components/CartLineItem';
import {CartSummary} from './CartSummary';
import {T, al} from '~/lib/astromeda-data';

export type CartLayout = 'page' | 'aside';

export type CartMainProps = {
  cart: CartApiQueryFragment | null;
  layout: CartLayout;
};

export type LineItemChildrenMap = {[parentId: string]: CartLine[]};

function getLineItemChildrenMap(lines: CartLine[]): LineItemChildrenMap {
  const children: LineItemChildrenMap = {};
  for (const line of lines) {
    if ('parentRelationship' in line && line.parentRelationship?.parent) {
      const parentId = line.parentRelationship.parent.id;
      if (!children[parentId]) children[parentId] = [];
      children[parentId].push(line);
    }
    if ('lineComponents' in line) {
      const sub = getLineItemChildrenMap(line.lineComponents);
      for (const [parentId, childIds] of Object.entries(sub)) {
        if (!children[parentId]) children[parentId] = [];
        children[parentId].push(...childIds);
      }
    }
  }
  return children;
}

export function CartMain({layout, cart: originalCart}: CartMainProps) {
  const cart = useOptimisticCart(originalCart);
  const linesCount = Boolean(cart?.lines?.nodes?.length || 0);
  const withDiscount = cart && Boolean(cart?.discountCodes?.filter((code) => code.applicable)?.length);
  const cartHasItems = cart?.totalQuantity ? cart.totalQuantity > 0 : false;
  const childrenMap = getLineItemChildrenMap(cart?.lines?.nodes ?? []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: T.bg,
        color: T.tx,
      }}
    >
      <CartEmpty hidden={linesCount} layout={layout} />
      <div style={{flex: 1, overflowY: 'auto'}}>
        <ul
          style={{
            listStyle: 'none',
            padding: '8px 16px',
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
          aria-label="カートの商品"
        >
          {(cart?.lines?.nodes ?? []).map((line) => {
            if ('parentRelationship' in line && line.parentRelationship?.parent) return null;
            return (
              <CartLineItem
                key={line.id}
                line={line}
                layout={layout}
                childrenMap={childrenMap}
              />
            );
          })}
        </ul>
      </div>
      {cartHasItems && <CartSummary cart={cart} layout={layout} />}
    </div>
  );
}

function CartEmpty({
  hidden = false,
  layout,
}: {
  hidden: boolean;
  layout?: CartMainProps['layout'];
}) {
  const {close} = useAside();
  return (
    <div
      hidden={hidden}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        padding: 40,
        textAlign: 'center' as const,
      }}
    >
      <div style={{fontSize: 48, marginBottom: 16}}>🛒</div>
      <div style={{fontSize: 14, fontWeight: 700, color: T.tx, marginBottom: 8}}>
        カートは空です
      </div>
      <div style={{fontSize: 12, color: T.t4, marginBottom: 24, lineHeight: 1.6}}>
        商品をカートに追加してください
      </div>
      <Link
        to="/collections/astromeda"
        onClick={close}
        prefetch="viewport"
        style={{
          display: 'inline-block',
          padding: '10px 24px',
          background: al(T.c, 0.12),
          border: `1px solid ${al(T.c, 0.3)}`,
          borderRadius: 8,
          color: T.c,
          textDecoration: 'none',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        商品を探す →
      </Link>
    </div>
  );
}
