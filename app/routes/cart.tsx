import {useLoaderData, data, type HeadersFunction} from 'react-router';
import type {Route} from './+types/cart';
import type {CartQueryDataReturn} from '@shopify/hydrogen';
import {CartForm} from '@shopify/hydrogen';
import {CartMain} from '~/components/CartMain';
import {T, al} from '~/lib/astromeda-data';
import {Link} from 'react-router';

export const meta: Route.MetaFunction = () => {
  return [{title: 'ASTROMEDA | カート'}];
};

export const headers: HeadersFunction = ({actionHeaders}) => actionHeaders;

export async function action({request, context}: Route.ActionArgs) {
  const {cart} = context;
  const formData = await request.formData();
  const {action, inputs} = CartForm.getFormInput(formData);

  if (!action) throw new Error('No action provided');

  let status = 200;
  let result: CartQueryDataReturn;

  switch (action) {
    case CartForm.ACTIONS.LinesAdd:
      result = await cart.addLines(inputs.lines);
      break;
    case CartForm.ACTIONS.LinesUpdate:
      result = await cart.updateLines(inputs.lines);
      break;
    case CartForm.ACTIONS.LinesRemove:
      result = await cart.removeLines(inputs.lineIds);
      break;
    case CartForm.ACTIONS.DiscountCodesUpdate: {
      const formDiscountCode = inputs.discountCode;
      const discountCodes = (formDiscountCode ? [formDiscountCode] : []) as string[];
      discountCodes.push(...inputs.discountCodes);
      result = await cart.updateDiscountCodes(discountCodes);
      break;
    }
    case CartForm.ACTIONS.GiftCardCodesAdd: {
      const formGiftCardCode = inputs.giftCardCode;
      const giftCardCodes = (formGiftCardCode ? [formGiftCardCode] : []) as string[];
      result = await cart.addGiftCardCodes(giftCardCodes);
      break;
    }
    case CartForm.ACTIONS.GiftCardCodesRemove: {
      result = await cart.removeGiftCardCodes(inputs.giftCardCodes as string[]);
      break;
    }
    case CartForm.ACTIONS.BuyerIdentityUpdate: {
      result = await cart.updateBuyerIdentity({...inputs.buyerIdentity});
      break;
    }
    default:
      throw new Error(`${action} cart action is not defined`);
  }

  const cartId = result?.cart?.id;
  const headers = cartId ? cart.setCartId(result.cart.id) : new Headers();
  const {cart: cartResult, errors, warnings} = result;

  const redirectTo = formData.get('redirectTo') ?? null;
  if (typeof redirectTo === 'string') {
    status = 303;
    headers.set('Location', redirectTo);
  }

  return data({cart: cartResult, errors, warnings, analytics: {cartId}}, {status, headers});
}

export async function loader({context}: Route.LoaderArgs) {
  const {cart} = context;
  return await cart.get();
}

export default function Cart() {
  const cart = useLoaderData<typeof loader>();
  const hasItems = (cart?.totalQuantity ?? 0) > 0;

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        color: T.tx,
        fontFamily: "'Outfit', 'Noto Sans JP', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 'clamp(24px, 3vw, 40px) clamp(16px, 4vw, 48px) clamp(16px, 2vw, 24px)',
          borderBottom: `1px solid ${T.t1}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{fontSize: 10, fontWeight: 700, color: T.t4, letterSpacing: 3, marginBottom: 6}}>
            SHOPPING CART
          </div>
          <h1 className="ph" style={{fontSize: 'clamp(18px, 2.5vw, 28px)', fontWeight: 900, color: T.tx, margin: 0}}>
            カート
          </h1>
        </div>
        {hasItems && (
          <span style={{fontSize: 12, color: T.t4}}>
            {cart?.totalQuantity}点
          </span>
        )}
      </div>

      {/* Cart content */}
      {hasItems ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 360px',
            gap: 'clamp(16px, 3vw, 40px)',
            padding: 'clamp(20px, 3vw, 40px) clamp(16px, 4vw, 48px)',
            maxWidth: 1100,
            margin: '0 auto',
            alignItems: 'start',
          }}
          className="cart-page-grid"
        >
          {/* Line items */}
          <div>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {(cart?.lines?.nodes ?? []).map((line) => {
                // Import CartLineItem here inline for page layout
                const {merchandise} = line;
                const {product, image, selectedOptions, title} = merchandise;
                const price = line.cost?.totalAmount;

                return (
                  <li
                    key={line.id}
                    style={{
                      display: 'flex',
                      gap: 16,
                      padding: 16,
                      background: al(T.c, 0.02),
                      borderRadius: 16,
                      border: `1px solid ${T.t1}`,
                    }}
                  >
                    <div
                      style={{
                        width: 100,
                        height: 100,
                        flexShrink: 0,
                        borderRadius: 10,
                        overflow: 'hidden',
                        background: '#0D0D18',
                      }}
                    >
                      {image ? (
                        <img
                          src={image.url}
                          alt={title}
                          style={{width: '100%', height: '100%', objectFit: 'cover'}}
                        />
                      ) : (
                        <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32}}>🖥</div>
                      )}
                    </div>
                    <div style={{flex: 1}}>
                      <div style={{fontSize: 14, fontWeight: 700, color: T.tx, marginBottom: 6, lineHeight: 1.4}}>
                        {product.title}
                      </div>
                      {selectedOptions.filter(o => o.value !== 'Default Title').map(o => (
                        <div key={o.name} style={{fontSize: 11, color: T.t4, marginBottom: 2}}>
                          {o.name}: {o.value}
                        </div>
                      ))}
                      <div style={{marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8}}>
                        {price && (
                          <span className="ph" style={{fontSize: 16, fontWeight: 900, color: T.c}}>
                            ¥{Number(price.amount).toLocaleString('ja-JP')}
                          </span>
                        )}
                        <span style={{fontSize: 12, color: T.t4}}>
                          数量: {line.quantity}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Continue shopping */}
            <Link
              to="/collections/astromeda"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 20,
                fontSize: 12,
                color: T.t4,
                textDecoration: 'none',
              }}
            >
              ← 買い物を続ける
            </Link>
          </div>

          {/* Summary sidebar */}
          <div
            style={{
              background: al(T.c, 0.02),
              border: `1px solid ${T.t1}`,
              borderRadius: 16,
              padding: 24,
              position: 'sticky' as const,
              top: 80,
            }}
          >
            <div className="ph" style={{fontSize: 12, fontWeight: 900, color: T.tx, marginBottom: 20, letterSpacing: 2}}>
              注文内容
            </div>

            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: T.t5}}>
              <span>小計</span>
              <span style={{color: T.tx, fontWeight: 700}}>
                {cart?.cost?.subtotalAmount
                  ? `¥${Number(cart.cost.subtotalAmount.amount).toLocaleString('ja-JP')}`
                  : '—'}
              </span>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 11, color: T.t4}}>
              <span>送料</span>
              <span>会計時に計算</span>
            </div>

            <div style={{borderTop: `1px solid ${T.t1}`, paddingTop: 16, marginBottom: 20}}>
              <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: T.tx}}>
                <span>合計</span>
                <span className="ph" style={{color: T.c}}>
                  {cart?.cost?.totalAmount
                    ? `¥${Number(cart.cost.totalAmount.amount).toLocaleString('ja-JP')}`
                    : '—'}
                </span>
              </div>
            </div>

            {cart?.checkoutUrl && (
              <a
                href={cart.checkoutUrl}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '16px',
                  textAlign: 'center' as const,
                  background: 'linear-gradient(135deg, #00F0FF, #00C4CC)',
                  color: '#000',
                  fontWeight: 800,
                  fontSize: 15,
                  letterSpacing: 1,
                  borderRadius: 12,
                  textDecoration: 'none',
                  fontFamily: "'Orbitron', sans-serif",
                  boxSizing: 'border-box' as const,
                }}
              >
                チェックアウトへ進む →
              </a>
            )}

            {/* Trust badges */}
            <div style={{marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6}}>
              {[
                {i: '🔒', l: '安全なSSL決済'},
                {i: '🚚', l: 'PC送料一律¥3,300'},
                {i: '↩', l: '返品・交換対応'},
              ].map(b => (
                <div key={b.l} style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.t4}}>
                  <span>{b.i}</span>{b.l}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Empty cart */
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: 40,
            textAlign: 'center' as const,
          }}
        >
          <div style={{fontSize: 64, marginBottom: 20}}>🛒</div>
          <h2 style={{fontSize: 20, fontWeight: 700, color: T.tx, marginBottom: 8}}>
            カートは空です
          </h2>
          <p style={{fontSize: 14, color: T.t4, marginBottom: 28, lineHeight: 1.7}}>
            ゲーミングPCやコラボグッズをカートに追加しましょう
          </p>
          <Link
            to="/collections/astromeda"
            style={{
              padding: '14px 32px',
              background: 'linear-gradient(135deg, #00F0FF, #00C4CC)',
              color: '#000',
              borderRadius: 12,
              textDecoration: 'none',
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: 1,
              fontFamily: "'Orbitron', sans-serif",
            }}
          >
            商品を見る →
          </Link>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .cart-page-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
