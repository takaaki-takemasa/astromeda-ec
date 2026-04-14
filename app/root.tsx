import React, {type ReactNode} from 'react';
import {Analytics, getShopAnalytics, useNonce} from '@shopify/hydrogen';
import {
  Outlet,
  useRouteError,
  isRouteErrorResponse,
  type ShouldRevalidateFunction,
  Links,
  Meta,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
  useLocation,
} from 'react-router';
import type {Route} from './+types/root';
import {STORE_URL, STORE_NAME, COMPANY_NAME} from '~/lib/astromeda-data';

declare global {
  interface Window {
    __adminPw?: string;
  }
}
import {FOOTER_QUERY, HEADER_QUERY} from '~/lib/fragments';
import resetStyles from '~/styles/reset.css?url';
import appStyles from '~/styles/app.css?url';
import tailwindCss from './styles/tailwind.css?url';
import {PageLayout} from './components/PageLayout';
import {AstroFooter} from '~/components/astro/AstroFooter';
import {WishlistProvider} from '~/components/astro/WishlistProvider';
import {RecentlyViewedProvider} from '~/components/astro/RecentlyViewedProvider';
import {ToastProvider} from '~/components/astro/ToastProvider';

export type RootLoader = typeof loader;

/**
 * This is important to avoid re-fetching root queries on sub-navigations
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({
  formMethod,
  currentUrl,
  nextUrl,
}) => {
  // revalidate when a mutation is performed e.g add to cart, login...
  if (formMethod && formMethod !== 'GET') return true;

  // revalidate when manually revalidating via useRevalidator
  if (currentUrl.toString() === nextUrl.toString()) return true;

  // Defaulting to no revalidation for root loader data to improve performance.
  // When using this feature, you risk your UI getting out of sync with your server.
  // Use with caution. If you are uncomfortable with this optimization, update the
  // line below to `return defaultShouldRevalidate` instead.
  // For more details see: https://remix.run/docs/en/main/route/should-revalidate
  return false;
};

/**
 * The main and reset stylesheets are added in the Layout component
 * to prevent a bug in development HMR updates.
 *
 * This avoids the "failed to execute 'insertBefore' on 'Node'" error
 * that occurs after editing and navigating to another page.
 *
 * It's a temporary fix until the issue is resolved.
 * https://github.com/remix-run/remix/issues/9242
 */
export function links() {
  return [
    {rel: 'preconnect', href: 'https://cdn.shopify.com'},
    {rel: 'preconnect', href: 'https://shop.app'},
    {rel: 'preconnect', href: 'https://fonts.googleapis.com'},
    {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous'},
    {rel: 'dns-prefetch', href: 'https://cdn.shopify.com'},
    {rel: 'manifest', href: '/manifest.json'},
    {
      // F6: フォントCSS preload → レンダリングブロック低減（LCP改善）
      rel: 'preload',
      as: 'style',
      href: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Outfit:wght@400;500;700;800;900&family=Noto+Sans+JP:wght@400;700;900&display=swap',
    },
    {
      // フォントウェイト最適化: 実使用ウェイトのみ読み込み（Lighthouse最適化）
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Outfit:wght@400;500;700;800;900&family=Noto+Sans+JP:wght@400;700;900&display=swap',
    },
  ];
}

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  const {storefront, env} = args.context;

  return {
    ...deferredData,
    ...criticalData,
    publicStoreDomain: env.PUBLIC_STORE_DOMAIN,
    shop: getShopAnalytics({
      storefront,
      publicStorefrontId: env.PUBLIC_STOREFRONT_ID,
    }),
    consent: {
      checkoutDomain: env.PUBLIC_CHECKOUT_DOMAIN || env.PUBLIC_STORE_DOMAIN,
      storefrontAccessToken: env.PUBLIC_STOREFRONT_API_TOKEN,
      withPrivacyBanner: false,
      // localize the privacy banner
      country: args.context.storefront.i18n.country,
      language: args.context.storefront.i18n.language,
    },
    gaMeasurementId: env.PUBLIC_GA_MEASUREMENT_ID || '',
    clarityProjectId: env.PUBLIC_CLARITY_PROJECT_ID || '',
    gtmContainerId: env.PUBLIC_GTM_CONTAINER_ID || '',
    metaPixelId: env.PUBLIC_META_PIXEL_ID || '',
  };
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({context}: Route.LoaderArgs) {
  const {storefront} = context;

  const [header] = await Promise.all([
    storefront.query(HEADER_QUERY, {
      cache: storefront.CacheLong(),
      variables: {
        headerMenuHandle: 'main-menu', // Adjust to your header menu handle
      },
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);

  return {header};
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context}: Route.LoaderArgs) {
  const {storefront, customerAccount, cart} = context;

  // defer the footer query (below the fold)
  const footer = storefront
    .query(FOOTER_QUERY, {
      cache: storefront.CacheLong(),
      variables: {
        footerMenuHandle: 'footer', // Adjust to your footer menu handle
      },
    })
    .catch((error: Error) => {
      // Log query errors, but don't throw them so the page can still render
      if (process.env.NODE_ENV === 'development') console.error(error);
      return null;
    });
  return {
    cart: cart.get(),
    isLoggedIn: customerAccount.isLoggedIn(),
    footer,
  };
}

export function Layout({children}: {children?: React.ReactNode}) {
  const nonce = useNonce();
  const rootData = useRouteLoaderData<RootLoader>('root');
  const gaMeasurementId = rootData?.gaMeasurementId || '';
  const clarityProjectId = rootData?.clarityProjectId || '';
  const gtmContainerId = rootData?.gtmContainerId || '';
  const metaPixelId = rootData?.metaPixelId || '';

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <meta name="theme-color" content="#06060C" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="stylesheet" href={tailwindCss}></link>
        <link rel="stylesheet" href={resetStyles}></link>
        <link rel="stylesheet" href={appStyles}></link>
        <Meta />
        <Links />

        {/* Google Tag Manager — Oxygen環境変数 PUBLIC_GTM_CONTAINER_ID で設定 */}
        {gtmContainerId && (
          <script
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmContainerId}');`,
            }}
          />
        )}

        {/* Google Analytics 4 — Oxygen環境変数 PUBLIC_GA_MEASUREMENT_ID で設定 */}
        {gaMeasurementId && (
          <script
            async
            nonce={nonce}
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
          />
        )}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              ${gaMeasurementId ? `gtag('config', '${gaMeasurementId}', {send_page_view: true});` : ''}
            `,
          }}
        />

        {/* UTMパラメータキャプチャ — 流入元をsessionStorageに保存し、GA4イベントに付与 */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try {
                  var p = new URLSearchParams(location.search);
                  var keys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
                  var has = false;
                  keys.forEach(function(k){ if(p.get(k)){ has = true; } });
                  if(has){
                    var d = {};
                    keys.forEach(function(k){ var v = p.get(k); if(v) d[k] = v; });
                    d.landing_page = location.pathname;
                    d.referrer = document.referrer || '';
                    d.timestamp = new Date().toISOString();
                    sessionStorage.setItem('astro_utm', JSON.stringify(d));
                  }
                } catch(e){ if(typeof console!=='undefined') console.debug('[UTM capture]', e); }
              })();
            `,
          }}
        />

        {/* Microsoft Clarity — Oxygen環境変数 PUBLIC_CLARITY_PROJECT_ID で設定 */}
        {clarityProjectId && (
          <script
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: `
                (function(c,l,a,r,i,t,y){
                  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
                })(window,document,"clarity","script","${clarityProjectId}");
              `,
            }}
          />
        )}

        {/* Meta Pixel (Facebook) — Oxygen環境変数 PUBLIC_META_PIXEL_ID で設定 */}
        {metaPixelId && (
          <script
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${metaPixelId}');
fbq('track','PageView');`,
            }}
          />
        )}
        {metaPixelId && (
          <noscript>
            <img
              height="1"
              width="1"
              style={{display: 'none'}}
              src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        )}

        {/* Organization + LocalBusiness JSON-LD (D4: 構造化データ完全版) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': ['Organization', 'Brand'],
              'name': 'ASTROMEDA',
              'alternateName': 'アストロメダ',
              'url': STORE_URL,
              'logo': {
                '@type': 'ImageObject',
                'url': `${STORE_URL}/astromeda-logo.png`,
                'width': 512,
                'height': 512,
              },
              'image': `${STORE_URL}/astromeda-logo.png`,
              'description': 'ASTROMEDAは日本発のゲーミングPCブランド。国内自社工場で全台組立、25タイトル以上のアニメ・ゲームIPコラボPC、8色カラーバリエーション。全モデルRTX 5000シリーズ+DDR5搭載。',
              'slogan': '好きなIPと、最高のスペックを。',
              'foundingDate': '2019',
              'knowsAbout': ['ゲーミングPC', 'カスタムPC', 'アニメコラボPC', 'ゲーミングガジェット'],
              'brand': {
                '@type': 'Brand',
                'name': 'ASTROMEDA',
                'logo': `${STORE_URL}/astromeda-logo.png`,
              },
              'parentOrganization': {
                '@type': 'Organization',
                'name': '株式会社マイニングベース',
                'alternateName': 'Mining Base Co., Ltd.',
                'url': 'https://mining-base.co.jp',
              },
              'contactPoint': {
                '@type': 'ContactPoint',
                'contactType': 'customer service',
                'availableLanguage': 'Japanese',
                'url': `${STORE_URL}/pages/contact`,
              },
              'sameAs': [],
              'potentialAction': {
                '@type': 'SearchAction',
                'target': {
                  '@type': 'EntryPoint',
                  'urlTemplate': `${STORE_URL}/search?q={search_term_string}`,
                },
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />
        {/* WebSite JSON-LD (F8: サイト内検索スキーマ) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              'name': 'ASTROMEDA公式オンラインストア',
              'alternateName': 'アストロメダ公式ショップ',
              'url': STORE_URL,
              'potentialAction': {
                '@type': 'SearchAction',
                'target': {
                  '@type': 'EntryPoint',
                  'urlTemplate': `${STORE_URL}/search?q={search_term_string}`,
                },
                'query-input': 'required name=search_term_string',
              },
              'inLanguage': 'ja',
            }),
          }}
        />
      </head>
      <body style={{backgroundColor: '#06060C', color: '#fff', fontFamily: "'Outfit', 'Noto Sans JP', system-ui, sans-serif", margin: 0}}>
        {/* Critical inline styles — CSS files return 503 from Shopify CDN due to PC(2) path glob issue */}
        <style dangerouslySetInnerHTML={{__html: `
          .skip-to-main{position:absolute;top:-100%;left:16px;z-index:10000;padding:12px 24px;background:#00F0FF;color:#000;font-weight:700;font-size:14px;border-radius:0 0 8px 8px;text-decoration:none;transition:top .2s ease}.skip-to-main:focus{top:0}
          .overlay{position:fixed;top:0;left:0;right:0;bottom:0;opacity:0;pointer-events:none;visibility:hidden;z-index:10;background:rgba(0,0,0,.2);transition:opacity .4s}.overlay.expanded{opacity:1;pointer-events:auto;visibility:visible}
          .overlay aside{background:#fff;box-shadow:0 0 50px rgba(0,0,0,.3);height:100vh;width:min(400px,100vw);position:fixed;right:-400px;top:0;transition:transform .2s ease-in-out}.overlay.expanded aside{transform:translateX(-400px)}
          *{box-sizing:border-box;scrollbar-width:none}*::-webkit-scrollbar{display:none}
          img,svg,video{display:block;max-width:100%;height:auto}
          a{color:inherit;text-decoration:inherit}
          .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border-width:0}
        `}} />
        {/* GTM noscript fallback */}
        {gtmContainerId && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmContainerId}`}
              height="0"
              width="0"
              style={{display: 'none', visibility: 'hidden'}}
            />
          </noscript>
        )}
        {/* スキップナビゲーション: キーボードユーザーの第一接触点 */}
        <a href="#main-content" className="skip-to-main">
          メインコンテンツへスキップ
        </a>
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
        {/* Service Worker Registration */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function() { /* SW registration optional */ });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}

// Wrap Analytics.Provider so it never crashes the page
// ErrorBoundaryのみでガード — useState/useEffectによるHydration不整合を排除
type AnalyticsProviderProps = React.ComponentProps<typeof Analytics.Provider>;
function SafeAnalytics({cart, shop, consent, children}: {
  cart: AnalyticsProviderProps['cart'];
  shop: AnalyticsProviderProps['shop'];
  consent: AnalyticsProviderProps['consent'];
  children: ReactNode;
}) {
  return (
    <AnalyticsErrorBoundary fallback={children}>
      <Analytics.Provider cart={cart} shop={shop} consent={consent}>
        {children}
      </Analytics.Provider>
    </AnalyticsErrorBoundary>
  );
}

interface AnalyticsErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  label?: string;
}
class AnalyticsErrorBoundary extends React.Component<
  AnalyticsErrorBoundaryProps,
  {hasError: boolean}
> {
  constructor(props: AnalyticsErrorBoundaryProps) {
    super(props);
    this.state = {hasError: false};
  }
  static getDerivedStateFromError() {
    return {hasError: true};
  }
  componentDidCatch(error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
      const label = this.props.label ?? 'Analytics';
      console.warn(`[Astromeda] ${label} error caught, page continues:`, msg);
    }
  }
  render() {
    if (this.state.hasError) return <>{this.props.fallback}</>;
    return this.props.children;
  }
}

// M2 audit 2026-04-09: Provider用汎用 ErrorBoundary エイリアス。
// localStorage 書込失敗や SSR/CSR 差異でクライアント側 Provider が死んでも
// PageLayout 全体が白画面にならないよう、各 Provider を個別に隔離する。
const ProviderErrorBoundary = AnalyticsErrorBoundary;

export default function App() {
  const data = useRouteLoaderData<RootLoader>('root');
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  if (!data) {
    return <Outlet />;
  }

  // Admin pages get their own layout (no store header/footer)
  if (isAdmin) {
    return (
      <SafeAnalytics cart={data.cart} shop={data.shop} consent={data.consent}>
        <Outlet />
      </SafeAnalytics>
    );
  }

  // K-Med-04: Provider階層は中枢→末梢の順序で配置する
  // ToastProvider(痛覚受容=中枢通知)を最外層に置き、WishlistProvider/
  // RecentlyViewedProvider(末梢の消費行動記録)の初期化エラーや
  // localStorage書込失敗を中枢が感知できるようにする。
  // SafeAnalyticsは独立した免疫ブランチ(AnalyticsErrorBoundaryで局所化)。
  // M2 audit 2026-04-09: WishlistProvider / RecentlyViewedProvider は
  // localStorage 依存のため、SSR/CSR 差異や privacy mode で throw する可能性がある。
  // それぞれ個別の ErrorBoundary で隔離し、死んでも PageLayout は生き残るようにする。
  const pageContent = (
    <SafeAnalytics cart={data.cart} shop={data.shop} consent={data.consent}>
      <PageLayout {...data}>
        <Outlet />
      </PageLayout>
    </SafeAnalytics>
  );

  return (
    <ToastProvider>
      <ProviderErrorBoundary label="Wishlist" fallback={pageContent}>
        <WishlistProvider>
          <ProviderErrorBoundary label="RecentlyViewed" fallback={pageContent}>
            <RecentlyViewedProvider>{pageContent}</RecentlyViewedProvider>
          </ProviderErrorBoundary>
        </WishlistProvider>
      </ProviderErrorBoundary>
    </ToastProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = 'Unknown error';
  let errorStatus = 500;
  let isNotFound = false;

  if (isRouteErrorResponse(error)) {
    errorMessage = error?.data?.message ?? error.data;
    errorStatus = error.status;
    isNotFound = error.status === 404;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  // K-Med-04: エラー画面からの退院ルート(Recovery CTA)を必ず提供する。
  // 救命救急室で蘇生した患者が帰宅できるように、ホームリンク・
  // リロード・サポート問い合わせを常に表示する。
  const title = isNotFound
    ? 'ページが見つかりません'
    : 'エラーが発生しました';
  const subtitle = isNotFound
    ? 'お探しのページは削除されたか、URLが変更された可能性があります。'
    : '一時的な問題が発生しました。時間をおいて再度お試しください。';

  return (
    <div
      className="route-error"
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: '#06060C',
        color: '#E6E8F2',
        fontFamily: '"Noto Sans JP", sans-serif',
      }}
    >
      <div style={{maxWidth: 560, width: '100%', textAlign: 'center'}}>
        <div
          style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: '4rem',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #7B5CFF, #00E5FF)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            lineHeight: 1,
            marginBottom: '0.5rem',
          }}
        >
          {errorStatus}
        </div>
        <h1 style={{fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem'}}>
          {title}
        </h1>
        <p style={{color: '#A0A6B8', fontSize: '0.95rem', marginBottom: '2rem'}}>
          {subtitle}
        </p>

        {/* 退院ルート: ホーム/リロード/サポート */}
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginBottom: '1.5rem',
          }}
        >
          <a
            href="/"
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '9999px',
              background: 'linear-gradient(135deg, #7B5CFF, #00E5FF)',
              color: '#06060C',
              fontWeight: 700,
              textDecoration: 'none',
              fontSize: '0.9rem',
            }}
          >
            トップへ戻る
          </a>
          <a
            href="/collections/all"
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '9999px',
              background: 'transparent',
              color: '#E6E8F2',
              border: '1px solid #2a2d42',
              fontWeight: 700,
              textDecoration: 'none',
              fontSize: '0.9rem',
            }}
          >
            商品を探す
          </a>
          <a
            href="/pages/inquiry"
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '9999px',
              background: 'transparent',
              color: '#E6E8F2',
              border: '1px solid #2a2d42',
              fontWeight: 700,
              textDecoration: 'none',
              fontSize: '0.9rem',
            }}
          >
            お問い合わせ
          </a>
        </div>

        {/* 開発モードでのみエラー詳細表示(本番ではノイズになるため隠す) */}
        {process.env.NODE_ENV === 'development' && errorMessage && (
          <details
            style={{
              marginTop: '1.5rem',
              textAlign: 'left',
              padding: '1rem',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '0.5rem',
              border: '1px solid #2a2d42',
            }}
          >
            <summary style={{cursor: 'pointer', color: '#A0A6B8'}}>
              エラー詳細 (開発モード)
            </summary>
            <pre
              style={{
                marginTop: '0.75rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '0.8rem',
                color: '#FF6B9D',
              }}
            >
              {errorMessage}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}