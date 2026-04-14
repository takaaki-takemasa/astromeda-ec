import type {CartLineUpdateInput} from '@shopify/hydrogen/storefront-api-types';
import type {CartLayout, LineItemChildrenMap} from '~/components/CartMain';
import {CartForm, Image, type OptimisticCartLine} from '@shopify/hydrogen';
import {useVariantUrl} from '~/lib/variants';
import {Link} from 'react-router';
import {ProductPrice} from './ProductPrice';
import {useAside} from './Aside';
import {trackRemoveFromCart} from '~/lib/ga4-ecommerce';
import type {
  CartApiQueryFragment,
  CartLineFragment,
} from 'storefrontapi.generated';

export type CartLine = OptimisticCartLine<CartApiQueryFragment>;

/**
 * A single line item in the cart. It displays the product image, title, price.
 * It also provides controls to update the quantity or remove the line item.
 * If the line is a parent line that has child components (like warranties or gift wrapping), they are
 * rendered nested below the parent line.
 */
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
  const childrenLabelId = `cart-line-children-${id}`;

  // カスタマイズ費用ラインかどうか判定（_parent_product属性がある）
  const attrs = (line as unknown as {attributes?: {key: string; value: string}[]}).attributes;
  const isCustomizationLine = attrs?.some(a => a.key === '_parent_product');
  const customizationFor = attrs?.find(a => a.key === '_customization_for')?.value;
  // ユーザーに見せる属性（_始まりの内部属性を除外）
  const visibleAttrs = attrs?.filter(a => !a.key.startsWith('_')) || [];

  // カスタマイズ費用ラインはコンパクト表示
  if (isCustomizationLine) {
    return (
      <li key={id} className="cart-line" style={{opacity: 0.85, paddingLeft: 16, borderLeft: '2px solid rgba(0,240,255,0.15)'}}>
        <div className="cart-line-inner" style={{gap: 8}}>
          <div style={{width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,240,255,0.06)', borderRadius: 6, fontSize: 16, flexShrink: 0}}>
            ⚙
          </div>
          <div style={{flex: 1, minWidth: 0}}>
            <p style={{margin: 0, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.8)'}}>
              {customizationFor || title}
            </p>
            <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 2}}>
              <ProductPrice price={line?.cost?.totalAmount} />
              <CartLineRemoveButton
                lineIds={[id]}
                disabled={!!line.isOptimistic}
                productId={product.id}
                productTitle={product.title}
                price={line.cost?.totalAmount?.amount}
                quantity={line.quantity}
              />
            </div>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li key={id} className="cart-line">
      <div className="cart-line-inner">
        {image && (
          <Image
            alt={title}
            aspectRatio="1/1"
            data={image}
            height={100}
            loading="lazy"
            width={100}
          />
        )}

        <div>
          <Link
            prefetch="intent"
            to={lineItemUrl}
            onClick={() => {
              if (layout === 'aside') {
                close();
              }
            }}
          >
            <p>
              <strong>{product.title}</strong>
            </p>
          </Link>
          <ProductPrice price={line?.cost?.totalAmount} />
          <ul>
            {selectedOptions.map((option) => (
              <li key={option.name}>
                <small>
                  {option.name}: {option.value}
                </small>
              </li>
            ))}
          </ul>
          {/* カスタマイズオプション表示（内部属性は除外） */}
          {visibleAttrs.length > 0 && (
            <details style={{marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,.5)'}}>
              <summary style={{cursor: 'pointer', color: '#00F0FF', fontSize: 10, fontWeight: 700}}>
                カスタマイズ内容
              </summary>
              <ul style={{margin: '4px 0 0', paddingLeft: 12, listStyle: 'none'}}>
                {visibleAttrs.map((attr) => (
                  <li key={attr.key} style={{padding: '1px 0'}}>
                    <small>{attr.key}: {attr.value}</small>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <CartLineQuantity line={line} />
        </div>
      </div>

      {lineItemChildren ? (
        <div>
          <p id={childrenLabelId} className="sr-only">
            {product.title} に含まれる商品
          </p>
          <ul aria-labelledby={childrenLabelId} className="cart-line-children">
            {lineItemChildren.map((childLine) => (
              <CartLineItem
                childrenMap={childrenMap}
                key={childLine.id}
                line={childLine}
                layout={layout}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Provides the controls to update the quantity of a line item in the cart.
 * These controls are disabled when the line item is new, and the server
 * hasn't yet responded that it was successfully added to the cart.
 */
function CartLineQuantity({line}: {line: CartLine}) {
  if (!line || typeof line?.quantity === 'undefined') return null;
  const {id: lineId, quantity, isOptimistic} = line;
  const prevQuantity = Number(Math.max(0, quantity - 1).toFixed(0));
  const nextQuantity = Number((quantity + 1).toFixed(0));

  return (
    <div className="cart-line-quantity">
      <small>数量: {quantity} &nbsp;&nbsp;</small>
      <CartLineUpdateButton lines={[{id: lineId, quantity: prevQuantity}]}>
        <button
          aria-label="数量を減らす"
          disabled={quantity <= 1 || !!isOptimistic}
          name="decrease-quantity"
          value={prevQuantity}
        >
          <span>&#8722; </span>
        </button>
      </CartLineUpdateButton>
      &nbsp;
      <CartLineUpdateButton lines={[{id: lineId, quantity: nextQuantity}]}>
        <button
          aria-label="数量を増やす"
          name="increase-quantity"
          value={nextQuantity}
          disabled={!!isOptimistic}
        >
          <span>&#43;</span>
        </button>
      </CartLineUpdateButton>
      &nbsp;
      <CartLineRemoveButton
            lineIds={[lineId]}
            disabled={!!isOptimistic}
            productId={line.merchandise?.product?.id}
            productTitle={line.merchandise?.product?.title}
            price={line.cost?.totalAmount?.amount}
            quantity={quantity}
          />
    </div>
  );
}

/**
 * A button that removes a line item from the cart. It is disabled
 * when the line item is new, and the server hasn't yet responded
 * that it was successfully added to the cart.
 */
function CartLineRemoveButton({
  lineIds,
  disabled,
  productId,
  productTitle,
  price,
  quantity,
}: {
  lineIds: string[];
  disabled: boolean;
  productId?: string;
  productTitle?: string;
  price?: string;
  quantity?: number;
}) {
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
        onClick={() => {
          try {
            if (productId && productTitle) {
              trackRemoveFromCart({
                id: productId,
                title: productTitle,
                price,
                quantity,
              });
            }
          } catch {
            // GA4 failure must never block cart operations
          }
        }}
      >
        削除
      </button>
    </CartForm>
  );
}

function CartLineUpdateButton({
  children,
  lines,
}: {
  children: React.ReactNode;
  lines: CartLineUpdateInput[];
}) {
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

/**
 * Returns a unique key for the update action. This is used to make sure actions modifying the same line
 * items are not run concurrently, but cancel each other. For example, if the user clicks "Increase quantity"
 * and "Decrease quantity" in rapid succession, the actions will cancel each other and only the last one will run.
 * @param lineIds - line ids affected by the update
 * @returns
 */
function getUpdateKey(lineIds: string[]) {
  return [CartForm.ACTIONS.LinesUpdate, ...lineIds].join('-');
}
