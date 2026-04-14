import {useLoaderData, useFetchers, data, type HeadersFunction, Link} from 'react-router';
import {useEffect, useRef} from 'react';
import type {Route} from './+types/cart';
import type {CartQueryDataReturn} from '@shopify/hydrogen';
import {CartForm} from '@shopify/hydrogen';
import {CartMain} from '~/components/CartMain';
import {T, al} from '~/lib/astromeda-data';
import {CartUpsell} from '~/components/astro/CartUpsell';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {useToast} from '~/components/astro/ToastProvider';
import {startCheckoutSession} from '~/lib/checkout-tracker';
import {trackViewCart} from '~/lib/ga4-ecommerce';
import {CUSTOMER_DETAILS_QUERY} from '~/graphql/customer-account/CustomerDetailsQuery';
import {isCustomerProfileComplete} from '~/routes/account.profile';

const MAX_REPORTED_ERRORS = 50;

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'ASTROMEDA | カート'},
    {name: 'robots', content: 'noindex'},
  ];
};

export const headers: HeadersFunction = ({actionHeaders}) => actionHeaders;

export async function action({request, context}: Route.ActionArgs) {
  const {cart} = context;

  const formData = await request.formData();

  const {action, inputs} = CartForm.getFormInput(formData);

  if (!action) {
    throw new Error('No action provided');
  }

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
      const discountCodes = (
        formDiscountCode ? [formDiscountCode] : []
      ) as string[];
      discountCodes.push(...inputs.discountCodes);
      result = await cart.updateDiscountCodes(discountCodes);
      break;
    }
    case CartForm.ACTIONS.GiftCardCodesAdd: {
      const formGiftCardCode = inputs.giftCardCode;
      const giftCardCodes = (
        formGiftCardCode ? [formGiftCardCode] : []
      ) as string[];
      result = await cart.addGiftCardCodes(giftCardCodes);
      break;
    }
    case CartForm.ACTIONS.GiftCardCodesRemove: {
      const appliedGiftCardIds = inputs.giftCardCodes as string[];
      result = await cart.removeGiftCardCodes(appliedGiftCardIds);
      break;
    }
    case CartForm.ACTIONS.BuyerIdentityUpdate: {
      result = await cart.updateBuyerIdentity({
        ...inputs.buyerIdentity,
      });
      break;
    }
    default:
      throw new Error(`${action} cart action is not defined`);
  }

  const cartId = result?.cart?.id;
  const headers = cartId ? cart.setCartId(result.cart.id) : new Headers();
  const {cart: cartResult, errors, warnings} = result;

  // G-12: Open Redirect完全防御
  // 相対パスのみ許可し、以下の攻撃ベクタを全てブロック:
  //  - 絶対URL ("https://evil.com")
  //  - プロトコル相対 ("//evil.com")
  //  - バックスラッシュ経由 ("/\evil.com" → 一部ブラウザで "//evil.com" 扱い)
  //  - 制御文字埋込 ("/\x00evil" 等のCRLFインジェクション)
  //  - URLエンコード済みプロトコル ("%2F%2Fevil.com")
  const redirectTo = formData.get('redirectTo') ?? null;
  if (typeof redirectTo === 'string') {
    const decoded = (() => {
      try {
        return decodeURIComponent(redirectTo);
      } catch {
        return redirectTo;
      }
    })();
    const isSafeRelative =
      decoded.startsWith('/') &&
      !decoded.startsWith('//') &&
      !decoded.startsWith('/\\') &&
      // 制御文字(\x00-\x1F, \x7F)およびCR/LF/タブ混入を拒否
      // eslint-disable-next-line no-control-regex
      !/[\x00-\x1F\x7F]/.test(decoded) &&
      // バックスラッシュ混入を全面拒否(URLセパレータ偽装防止)
      !decoded.includes('\\');
    if (isSafeRelative) {
      status = 303;
      headers.set('Location', decoded);
    }
  }

  return data(
    {
      cart: cartResult,
      errors,
      warnings,
      analytics: {
        cartId,
      },
    },
    {status, headers},
  );
}

export async function loader({context}: Route.LoaderArgs) {
  const {cart} = context;
  const cartData = await cart.get();

  // プロフィール完了チェック（ログイン済みの場合のみ）
  let profileComplete = true;
  let isLoggedIn = false;
  try {
    isLoggedIn = await context.customerAccount.isLoggedIn();
    if (isLoggedIn) {
      const {data: customerData} = await context.customerAccount.query(
        CUSTOMER_DETAILS_QUERY,
        {variables: {language: context.customerAccount.i18n.language}},
      );
      if (customerData?.customer) {
        profileComplete = isCustomerProfileComplete(customerData.customer);
      }
    }
  } catch {
    // ログインチェック失敗時はスキップ（ゲストユーザー等）
  }

  return {
    ...cartData,
    profileComplete,
    isLoggedIn,
  };
}

/**
 * カートエラー監視（免疫系 — 異常検知・通知）
 * CartForm fetcher のエラーレスポンスを検知し、Toast通知で表示
 */
function CartErrorWatcher() {
  const fetchers = useFetchers();
  const {addToast} = useToast();
  const reportedErrors = useRef(new Set<string>());
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Cleanup timers and sets on unmount
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
      reportedErrors.current.clear();
    };
  }, []);

  useEffect(() => {
    for (const fetcher of fetchers) {
      if (fetcher.state === 'idle' && fetcher.data) {
        const d = fetcher.data as {errors?: Array<{message?: string}>; warnings?: Array<{message?: string}>};
        if (d.errors && d.errors.length > 0) {
          const key = d.errors.map((e) => e?.message || '').join('|');
          if (!reportedErrors.current.has(key)) {
            // Cap size to prevent unbounded growth
            if (reportedErrors.current.size >= MAX_REPORTED_ERRORS) {
              reportedErrors.current.clear();
            }
            reportedErrors.current.add(key);
            addToast(
              d.errors[0]?.message || 'カートの更新中にエラーが発生しました',
              'error',
            );
            // 5秒後にキーを解放（同一エラーの再通知を許可）
            const timer = setTimeout(() => {
              reportedErrors.current.delete(key);
              timersRef.current.delete(timer);
            }, 5000);
            timersRef.current.add(timer);
          }
        }
        if (d.warnings && d.warnings.length > 0) {
          const key = `w:${d.warnings.map((w) => w?.message || '').join('|')}`;
          if (!reportedErrors.current.has(key)) {
            // Cap size to prevent unbounded growth
            if (reportedErrors.current.size >= MAX_REPORTED_ERRORS) {
              reportedErrors.current.clear();
            }
            reportedErrors.current.add(key);
            addToast(d.warnings[0]?.message || '', 'info');
            const timer = setTimeout(() => {
              reportedErrors.current.delete(key);
              timersRef.current.delete(timer);
            }, 5000);
            timersRef.current.add(timer);
          }
        }
      }
    }
  }, [fetchers, addToast]);

  return null;
}

export default function Cart() {
  const loaderData = useLoaderData<typeof loader>();
  const {profileComplete, isLoggedIn, ...cart} = loaderData as unknown as {
    profileComplete: boolean;
    isLoggedIn: boolean;
    id?: string;
    lines?: {nodes: Array<{
      id: string;
      quantity: number;
      merchandise?: {product?: {id?: string; title?: string}};
      cost?: {totalAmount?: {amount?: string}};
    }>};
    cost?: {totalAmount?: {amount?: string; currencyCode?: string}};
  };

  // チェックアウトセッション開始（カート閲覧 = ファネル入口）
  useEffect(() => {
    try {
      if (cart && cart.lines?.nodes?.length) {
        startCheckoutSession({
          cartId: cart.id,
          totalAmount: parseFloat(cart.cost?.totalAmount?.amount ?? '0'),
          itemCount: cart.lines.nodes.length,
          currency: cart.cost?.totalAmount?.currencyCode ?? 'JPY',
        });
        trackViewCart({
          totalAmount: cart.cost?.totalAmount?.amount,
          currency: cart.cost?.totalAmount?.currencyCode ?? 'JPY',
          items: cart.lines.nodes.map((line) => ({
            id: line.merchandise?.product?.id ?? line.id,
            title: line.merchandise?.product?.title ?? '',
            price: line.cost?.totalAmount?.amount,
            quantity: line.quantity,
          })),
        });
      }
    } catch {
      // tracking failure must never break cart
    }
  }, [cart?.id]);

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
        color: T.tx,
        padding: 'clamp(16px, 4vw, 48px)',
        maxWidth: 900,
        margin: '0 auto',
      }}
    >
      <CartErrorWatcher />

      {/* プロフィール未完了の警告バナー */}
      {isLoggedIn && !profileComplete && (
        <div
          style={{
            padding: '16px 20px',
            borderRadius: 12,
            border: `1px solid ${al(T.g, 0.3)}`,
            background: al(T.g, 0.06),
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{fontSize: 22}}>⚠</span>
          <div style={{flex: 1, minWidth: 200}}>
            <div
              style={{fontWeight: 700, fontSize: 14, color: T.g, marginBottom: 4}}
            >
              チェックアウトにはプロフィールの完了が必要です
            </div>
            <div style={{fontSize: 12, color: T.t4}}>
              生年月日・性別・流入経路を入力してください。
            </div>
          </div>
          <Link
            to="/account/profile"
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              background: T.g,
              color: '#000',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            プロフィールを完了する
          </Link>
        </div>
      )}

      <h1
        className="ph"
        style={{
          fontSize: 'clamp(18px, 3vw, 24px)',
          fontWeight: 900,
          color: T.c,
          letterSpacing: 3,
          marginBottom: 24,
        }}
      >
        CART
      </h1>
      <CartMain layout="page" cart={cart ?? null} profileComplete={profileComplete} />

      {/* Cart Upsell */}
      {cart && cart.lines && cart.lines.nodes && cart.lines.nodes.length > 0 && (
        <CartUpsell cartLines={cart.lines.nodes} />
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
