import type {CartApiQueryFragment} from 'storefrontapi.generated';
import type {CartLayout} from '~/components/CartMain';
import {CartForm, Money, type OptimisticCart} from '@shopify/hydrogen';
import {useEffect, useRef} from 'react';
import {useFetcher} from 'react-router';
import {T, al} from '~/lib/astromeda-data';

type CartSummaryProps = {
  cart: OptimisticCart<CartApiQueryFragment | null>;
  layout: CartLayout;
};

export function CartSummary({cart, layout}: CartSummaryProps) {
  return (
    <div
      style={{
        padding: '16px',
        borderTop: `1px solid ${T.t1}`,
        background: al(T.c, 0.02),
        flexShrink: 0,
      }}
    >
      {/* Subtotal */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          fontSize: 13,
          color: T.t5,
        }}
      >
        <span>小計</span>
        <span style={{fontWeight: 700, color: T.tx}}>
          {cart?.cost?.subtotalAmount?.amount ? (
            <Money data={cart.cost.subtotalAmount} />
          ) : '—'}
        </span>
      </div>

      <div style={{fontSize: 11, color: T.t4, marginBottom: 12}}>
        送料・税は会計時に計算されます
      </div>

      <CartDiscounts discountCodes={cart?.discountCodes} />
      <CartGiftCard giftCardCodes={cart?.appliedGiftCards} />
      <CartCheckoutActions checkoutUrl={cart?.checkoutUrl} />
    </div>
  );
}

function CartCheckoutActions({checkoutUrl}: {checkoutUrl?: string}) {
  if (!checkoutUrl) return null;

  return (
    <a
      href={checkoutUrl}
      target="_self"
      style={{
        display: 'block',
        width: '100%',
        padding: '14px',
        textAlign: 'center' as const,
        background: `linear-gradient(135deg, ${T.c}, #00C4CC)`,
        color: '#000',
        fontWeight: 800,
        fontSize: 14,
        letterSpacing: 1,
        borderRadius: 10,
        textDecoration: 'none',
        fontFamily: "'Orbitron', sans-serif",
      }}
    >
      チェックアウトへ進む →
    </a>
  );
}

function CartDiscounts({
  discountCodes,
}: {
  discountCodes?: CartApiQueryFragment['discountCodes'];
}) {
  const codes: string[] =
    discountCodes?.filter((d) => d.applicable)?.map(({code}) => code) || [];

  return (
    <div style={{marginBottom: 12}}>
      {codes.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
            fontSize: 12,
            color: T.g,
          }}
        >
          <span>割引コード: {codes.join(', ')}</span>
          <UpdateDiscountForm>
            <button
              type="submit"
              style={{
                background: 'none',
                border: 'none',
                color: T.t4,
                cursor: 'pointer',
                fontSize: 11,
                textDecoration: 'underline',
              }}
            >
              削除
            </button>
          </UpdateDiscountForm>
        </div>
      )}
      <UpdateDiscountForm discountCodes={codes}>
        <div style={{display: 'flex', gap: 8, marginBottom: 8}}>
          <input
            id="discount-code-input"
            type="text"
            name="discountCode"
            placeholder="割引コード"
            style={{
              flex: 1,
              padding: '8px 12px',
              background: T.bgC,
              border: `1px solid ${al(T.t3, 0.3)}`,
              borderRadius: 8,
              color: T.tx,
              fontSize: 12,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '8px 14px',
              background: al(T.c, 0.12),
              border: `1px solid ${al(T.c, 0.3)}`,
              borderRadius: 8,
              color: T.c,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap' as const,
            }}
          >
            適用
          </button>
        </div>
      </UpdateDiscountForm>
    </div>
  );
}

function UpdateDiscountForm({
  discountCodes,
  children,
}: {
  discountCodes?: string[];
  children: React.ReactNode;
}) {
  return (
    <CartForm
      route="/cart"
      action={CartForm.ACTIONS.DiscountCodesUpdate}
      inputs={{discountCodes: discountCodes || []}}
    >
      {children}
    </CartForm>
  );
}

function CartGiftCard({
  giftCardCodes,
}: {
  giftCardCodes: CartApiQueryFragment['appliedGiftCards'] | undefined;
}) {
  const giftCardCodeInput = useRef<HTMLInputElement>(null);
  const giftCardAddFetcher = useFetcher({key: 'gift-card-add'});

  useEffect(() => {
    if (giftCardAddFetcher.data) {
      if (giftCardCodeInput.current) giftCardCodeInput.current.value = '';
    }
  }, [giftCardAddFetcher.data]);

  if (!giftCardCodes || giftCardCodes.length === 0) return null;

  return (
    <div style={{marginBottom: 8}}>
      {giftCardCodes.map((giftCard) => (
        <RemoveGiftCardForm key={giftCard.id} giftCardId={giftCard.id}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              color: T.g,
              marginBottom: 4,
            }}
          >
            <span>ギフトカード: ***{giftCard.lastCharacters}</span>
            <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
              <Money data={giftCard.amountUsed} />
              <button
                type="submit"
                style={{background: 'none', border: 'none', color: T.t4, cursor: 'pointer', fontSize: 11}}
              >
                削除
              </button>
            </div>
          </div>
        </RemoveGiftCardForm>
      ))}
    </div>
  );
}

function AddGiftCardForm({fetcherKey, children}: {fetcherKey?: string; children: React.ReactNode}) {
  return (
    <CartForm fetcherKey={fetcherKey} route="/cart" action={CartForm.ACTIONS.GiftCardCodesAdd}>
      {children}
    </CartForm>
  );
}

function RemoveGiftCardForm({giftCardId, children}: {giftCardId: string; children: React.ReactNode}) {
  return (
    <CartForm
      route="/cart"
      action={CartForm.ACTIONS.GiftCardCodesRemove}
      inputs={{giftCardCodes: [giftCardId]}}
    >
      {children}
    </CartForm>
  );
}
