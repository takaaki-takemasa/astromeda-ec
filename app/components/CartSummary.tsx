import type {CartApiQueryFragment} from 'storefrontapi.generated';
import type {CartLayout} from '~/components/CartMain';
import {CartForm, Money, type OptimisticCart} from '@shopify/hydrogen';
import {useEffect, useRef, useCallback} from 'react';
import {useFetcher, Link} from 'react-router';
import {trackBeginCheckout} from '~/lib/ga4-ecommerce';
import {recordCheckoutStep} from '~/lib/checkout-tracker';
import {T, al} from '~/lib/astromeda-data';

type CartSummaryProps = {
  cart: OptimisticCart<CartApiQueryFragment | null>;
  layout: CartLayout;
  profileComplete?: boolean;
};

export function CartSummary({cart, layout, profileComplete = true}: CartSummaryProps) {
  const className =
    layout === 'page' ? 'cart-summary-page' : 'cart-summary-aside';

  return (
    <div
      aria-labelledby="cart-summary"
      className={className}
      style={{
        background: 'rgba(255,255,255,.03)',
        border: '1px solid rgba(255,255,255,.06)',
        borderRadius: 16,
        padding: 'clamp(20px, 3vw, 28px)',
        marginTop: 24,
      }}
    >
      <h4
        id="cart-summary"
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: T.c,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          margin: '0 0 16px',
        }}
      >
        ご注文内容
      </h4>
      <dl
        className="cart-subtotal"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          margin: '0 0 16px',
          paddingBottom: 16,
          borderBottom: '1px solid rgba(255,255,255,.08)',
        }}
      >
        <dt style={{fontSize: 14, color: T.t4, margin: 0}}>小計</dt>
        <dd
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: T.tx,
            margin: 0,
          }}
        >
          {cart?.cost?.subtotalAmount?.amount ? (
            <Money data={cart?.cost?.subtotalAmount} />
          ) : (
            '-'
          )}
        </dd>
      </dl>
      <CartDiscounts discountCodes={cart?.discountCodes} />
      <CartGiftCard giftCardCodes={cart?.appliedGiftCards} />
      <CartCheckoutActions checkoutUrl={cart?.checkoutUrl} cart={cart} profileComplete={profileComplete} />
      <p
        style={{
          fontSize: 11,
          color: T.t4,
          textAlign: 'center',
          margin: '12px 0 0',
          lineHeight: 1.5,
        }}
      >
        送料・消費税は次の画面で計算されます
      </p>
    </div>
  );
}

function CartCheckoutActions({
  checkoutUrl,
  cart,
  profileComplete = true,
}: {
  checkoutUrl?: string;
  cart?: OptimisticCart<CartApiQueryFragment | null>;
  profileComplete?: boolean;
}) {
  if (!checkoutUrl) return null;

  const handleCheckoutClick = useCallback(() => {
    try {
      const lines = cart?.lines?.nodes;
      trackBeginCheckout({
        totalAmount: cart?.cost?.totalAmount?.amount,
        currency: cart?.cost?.totalAmount?.currencyCode || 'JPY',
        lines: lines?.map((line) => ({
          id: line.merchandise?.product?.id || line.id,
          title: line.merchandise?.product?.title || '',
          price: line.cost?.totalAmount?.amount,
          quantity: line.quantity,
        })),
      });
      recordCheckoutStep('begin_checkout');
    } catch {
      // GA4/tracking failure must never block checkout
    }
  }, [cart]);

  // プロフィール未完了の場合はチェックアウトをブロック
  if (!profileComplete) {
    return (
      <div style={{marginTop: 16}}>
        <Link
          to="/account/profile"
          style={{
            display: 'block',
            textAlign: 'center',
            padding: '16px 24px',
            borderRadius: 12,
            background: T.g,
            color: '#000',
            fontSize: 15,
            fontWeight: 800,
            textDecoration: 'none',
            transition: 'all .2s',
            letterSpacing: '0.05em',
          }}
        >
          プロフィールを完了してチェックアウト →
        </Link>
        <p
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: T.t4,
            marginTop: 8,
          }}
        >
          チェックアウトにはプロフィールの完了が必要です
        </p>
      </div>
    );
  }

  return (
    <div style={{marginTop: 16}}>
      <a
        href={checkoutUrl}
        target="_self"
        onClick={handleCheckoutClick}
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '18px 24px',
          borderRadius: 12,
          background: `linear-gradient(135deg, ${T.c} 0%, ${al(T.c, 0.85)} 100%)`,
          color: '#000',
          fontSize: 15,
          fontWeight: 900,
          textDecoration: 'none',
          letterSpacing: '0.08em',
          boxShadow: `0 8px 24px ${al(T.c, 0.25)}`,
          transition: 'transform .15s, box-shadow .15s',
        }}
      >
        チェックアウトへ進む →
      </a>
    </div>
  );
}

function CartDiscounts({
  discountCodes,
}: {
  discountCodes?: CartApiQueryFragment['discountCodes'];
}) {
  const codes: string[] =
    discountCodes
      ?.filter((discount) => discount.applicable)
      ?.map(({code}) => code) || [];

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,.12)',
    background: 'rgba(0,0,0,.3)',
    color: T.tx,
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
  };
  const btnStyle: React.CSSProperties = {
    padding: '10px 18px',
    borderRadius: 10,
    border: `1px solid ${al(T.c, 0.3)}`,
    background: al(T.c, 0.1),
    color: T.c,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{marginBottom: 12}}>
      {codes.length > 0 && (
        <div style={{marginBottom: 8}}>
          <UpdateDiscountForm>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 10,
                background: al(T.c, 0.08),
                border: `1px solid ${al(T.c, 0.25)}`,
                fontSize: 13,
              }}
            >
              <div>
                <span style={{color: T.t4, marginRight: 8}}>割引コード</span>
                <code style={{color: T.c, fontWeight: 700}}>
                  {codes?.join(', ')}
                </code>
              </div>
              <button
                type="submit"
                aria-label="割引コードを削除"
                style={{
                  background: 'none',
                  border: 'none',
                  color: T.t4,
                  fontSize: 12,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                削除
              </button>
            </div>
          </UpdateDiscountForm>
        </div>
      )}
      <UpdateDiscountForm discountCodes={codes}>
        <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
          <label htmlFor="discount-code-input" className="sr-only">
            割引コード
          </label>
          <input
            id="discount-code-input"
            type="text"
            name="discountCode"
            placeholder="割引コードを入力"
            style={inputStyle}
          />
          <button type="submit" aria-label="割引コードを適用" style={btnStyle}>
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
      inputs={{
        discountCodes: discountCodes || [],
      }}
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
      giftCardCodeInput.current!.value = '';
    }
  }, [giftCardAddFetcher.data]);

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,.12)',
    background: 'rgba(0,0,0,.3)',
    color: T.tx,
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
  };
  const btnStyle: React.CSSProperties = {
    padding: '10px 18px',
    borderRadius: 10,
    border: `1px solid ${al(T.c, 0.3)}`,
    background: al(T.c, 0.1),
    color: T.c,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{marginBottom: 16}}>
      {giftCardCodes && giftCardCodes.length > 0 && (
        <div style={{marginBottom: 8}}>
          {giftCardCodes.map((giftCard) => (
            <RemoveGiftCardForm key={giftCard.id} giftCardId={giftCard.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: al(T.c, 0.08),
                  border: `1px solid ${al(T.c, 0.25)}`,
                  fontSize: 13,
                  marginBottom: 6,
                }}
              >
                <div>
                  <span style={{color: T.t4, marginRight: 8}}>ギフトカード</span>
                  <code style={{color: T.c}}>***{giftCard.lastCharacters}</code>
                  <span style={{marginLeft: 12, color: T.tx, fontWeight: 700}}>
                    <Money data={giftCard.amountUsed} />
                  </span>
                </div>
                <button
                  type="submit"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: T.t4,
                    fontSize: 12,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  削除
                </button>
              </div>
            </RemoveGiftCardForm>
          ))}
        </div>
      )}

      <AddGiftCardForm fetcherKey="gift-card-add">
        <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
          <input
            type="text"
            name="giftCardCode"
            placeholder="ギフトカードコード"
            ref={giftCardCodeInput}
            style={inputStyle}
          />
          <button
            type="submit"
            disabled={giftCardAddFetcher.state !== 'idle'}
            style={{
              ...btnStyle,
              opacity: giftCardAddFetcher.state !== 'idle' ? 0.5 : 1,
            }}
          >
            適用
          </button>
        </div>
      </AddGiftCardForm>
    </div>
  );
}

function AddGiftCardForm({
  fetcherKey,
  children,
}: {
  fetcherKey?: string;
  children: React.ReactNode;
}) {
  return (
    <CartForm
      fetcherKey={fetcherKey}
      route="/cart"
      action={CartForm.ACTIONS.GiftCardCodesAdd}
    >
      {children}
    </CartForm>
  );
}

function RemoveGiftCardForm({
  giftCardId,
  children,
}: {
  giftCardId: string;
  children: React.ReactNode;
}) {
  return (
    <CartForm
      route="/cart"
      action={CartForm.ACTIONS.GiftCardCodesRemove}
      inputs={{
        giftCardCodes: [giftCardId],
      }}
    >
      {children}
    </CartForm>
  );
}
