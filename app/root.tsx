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
// Sprint 2 Part 3-5: Footer Metaobject 型
export interface MetaFooterConfig {
  id: string;
  handle: string;
  sectionTitle: string;
  links: Array<{label: string; url: string}>;
  sortOrder: number;
  isActive: boolean;
}

// patch 0018: astromeda_legal_info Metaobject の分解型。
// `company_json` / `tokusho_json` / `warranty_json` はそれぞれ JSON blob。
// キー欠落時は astromeda-data.ts の LEGAL 定数から補完する（AstroFooter 側でマージ）。
export interface LegalCompany {
  name: string;
  en: string;
  ceo: string;
  est: string;
  addr: string;
  biz: string;
  partners: string;
}
export interface LegalTokusho {
  seller: string;
  resp: string;
  addr: string;
  tel: string;
  email: string;
  pay: string;
  ship: string;
  shipTime: string;
  cancel: string;
  returnP: string;
  price: string;
}
export interface LegalWarranty {
  base: string;
  ext: string;
  extPrice2: string;
  extPrice3: string;
  scope: string;
  exclude: string;
  repair: string;
  repairCost: string;
  support: string;
  device?: string;
}
export interface MetaLegalInfo {
  company: Partial<LegalCompany>;
  tokusho: Partial<LegalTokusho>;
  warranty: Partial<LegalWarranty>;
  privacy: string;
}

// patch 0024: astromeda_site_config Metaobject 型（root.tsx メタタグ/JSON-LD 用）
export interface MetaSiteConfig {
  brandName: string;
  companyName: string;
  storeUrl: string;
  contactPhone: string;
  contactEmail: string;
}

async function loadCriticalData({context}: Route.LoaderArgs) {
  const {storefront, env} = context;

  // Admin client 初期化（失敗時は null フォールバック）
  let adminClient: Awaited<ReturnType<typeof import('../agents/core/shopify-admin.js').getAdminClient>> | null = null;
  try {
    const {setAdminEnv, getAdminClient} = await import('../agents/core/shopify-admin.js');
    setAdminEnv(env as unknown as Record<string, string | undefined>);
    adminClient = getAdminClient();
  } catch {
    adminClient = null;
  }

  const emptyFooterMo = (): Promise<Array<{id: string; handle: string; fields: Array<{key: string; value: string}>}>> =>
    Promise.resolve([]);

  const [headerResult, footerConfigResult, legalInfoResult, siteConfigResult] = await Promise.allSettled([
    storefront.query(HEADER_QUERY, {
      cache: storefront.CacheLong(),
      variables: {
        headerMenuHandle: 'main-menu', // Adjust to your header menu handle
      },
    }),
    adminClient ? adminClient.getMetaobjects('astromeda_footer_config', 50) : emptyFooterMo(),
    // patch 0018: astromeda_legal_info も root.tsx loader で取得して AstroFooter に渡す
    adminClient ? adminClient.getMetaobjects('astromeda_legal_info', 5) : emptyFooterMo(),
    // patch 0024: astromeda_site_config → ブランド名/会社名/連絡先を JSON-LD に反映
    adminClient ? adminClient.getMetaobjects('astromeda_site_config', 5) : emptyFooterMo(),
  ]);

  // ヘッダーが失敗したら従来通り throw（全ページが 500 する挙動は既存仕様のまま）
  if (headerResult.status === 'rejected') {
    throw headerResult.reason;
  }
  const header = headerResult.value;

  // Footer config 失敗時は空配列（破壊的変更ゼロ保証）
  const footerConfigRaw = footerConfigResult.status === 'fulfilled' ? footerConfigResult.value : [];

  const metaFooterConfigs: MetaFooterConfig[] = footerConfigRaw.map((mo) => {
    const f: Record<string, string> = {};
    for (const kv of mo.fields) f[kv.key] = kv.value;
    let links: Array<{label: string; url: string}> = [];
    try {
      const parsed = JSON.parse(f['links_json'] || '[]');
      if (Array.isArray(parsed)) {
        links = parsed
          .filter((x): x is {label: string; url: string} =>
            x != null &&
            typeof x === 'object' &&
            typeof (x as {label?: unknown}).label === 'string' &&
            typeof (x as {url?: unknown}).url === 'string'
          );
      }
    } catch {
      links = [];
    }
    return {
      id: mo.id,
      handle: mo.handle,
      sectionTitle: f['section_title'] || '',
      links,
      sortOrder: parseInt(f['display_order'] || '0', 10),
      isActive: f['is_active'] === 'true',
    };
  });

  // patch 0018: astromeda_legal_info を company_json / tokusho_json / warranty_json / privacy_text
  // から組み立てる。この Metaobject 定義には is_active / display_order が無いため、
  // 先頭 1 件を採用し、AstroFooter 側で空値フィールドはハードコード LEGAL にフォールバック。
  const legalInfoRaw = legalInfoResult.status === 'fulfilled' ? legalInfoResult.value : [];
  let metaLegalInfo: MetaLegalInfo | null = null;
  if (legalInfoRaw[0]) {
    const f: Record<string, string> = {};
    for (const kv of legalInfoRaw[0].fields) f[kv.key] = kv.value;
    const tryParse = <T,>(raw: string | undefined, fallback: T): T => {
      if (!raw) return fallback;
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? (parsed as T) : fallback;
      } catch {
        return fallback;
      }
    };
    metaLegalInfo = {
      company: tryParse<Partial<LegalCompany>>(f['company_json'], {}),
      tokusho: tryParse<Partial<LegalTokusho>>(f['tokusho_json'], {}),
      warranty: tryParse<Partial<LegalWarranty>>(f['warranty_json'], {}),
      privacy: typeof f['privacy_text'] === 'string' ? f['privacy_text'] : '',
    };
  }

  // patch 0024: astromeda_site_config → MetaSiteConfig（先頭1件採用）
  const siteConfigRaw = siteConfigResult.status === 'fulfilled' ? siteConfigResult.value : [];
  let metaSiteConfig: MetaSiteConfig | null = null;
  if (siteConfigRaw[0]) {
    const f: Record<string, string> = {};
    for (const kv of siteConfigRaw[0].fields) f[kv.key] = kv.value;
    metaSiteConfig = {
      brandName: f['brand_name'] || '',
      companyName: f['company_name'] || '',
      storeUrl: f['store_url'] || '',
      contactPhone: f['contact_phone'] || '',
      contactEmail: f['contact_email'] || '',
    };
  }

  return {header, metaFooterConfigs, metaLegalInfo, metaSiteConfig};
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

  // patch 0024: astromeda_site_config Metaobject があればハードコード定数を上書き、
  // 無ければ astromeda-data.ts の STORE_NAME / COMPANY_NAME / STORE_URL にフォールバック
  const siteCfg = rootData?.metaSiteConfig;
  const cfgBrandName = siteCfg?.brandName || STORE_NAME;
  const cfgCompanyName = siteCfg?.companyName || COMPANY_NAME;
  const cfgStoreUrl = siteCfg?.storeUrl || STORE_URL;
  const cfgContactPhone = siteCfg?.contactPhone || '';
  const cfgContactEmail = siteCfg?.contactEmail || '';

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
        {/* patch 0063: Oxygen edge の /robots.txt interceptor で Sitemap 宣言が届かない対策。
            HTML <head> から canonical sitemap を直接 discovery させる。 */}
        <link rel="sitemap" type="application/xml" href="/sitemap-index.xml" />
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

        {/* Organization + LocalBusiness JSON-LD (D4: 構造化データ完全版)
            patch 0024: astromeda_site_config があれば brand_name / company_name / store_url /
            contact_phone / contact_email を優先採用 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': ['Organization', 'Brand'],
              'name': cfgBrandName,
              'alternateName': 'アストロメダ',
              'url': cfgStoreUrl,
              'logo': {
                '@type': 'ImageObject',
                'url': `${cfgStoreUrl}/astromeda-logo.png`,
                'width': 512,
                'height': 512,
              },
              'image': `${cfgStoreUrl}/astromeda-logo.png`,
              'description': 'ASTROMEDAは日本発のゲーミングPCブランド。国内自社工場で全台組立、25タイトル以上のアニメ・ゲームIPコラボPC、8色カラーバリエーション。全モデルRTX 5000シリーズ+DDR5搭載。',
              'slogan': '好きなIPと、最高のスペックを。',
              'foundingDate': '2019',
              'knowsAbout': ['ゲーミングPC', 'カスタムPC', 'アニメコラボPC', 'ゲーミングガジェット'],
              'brand': {
                '@type': 'Brand',
                'name': cfgBrandName,
                'logo': `${cfgStoreUrl}/astromeda-logo.png`,
              },
              'parentOrganization': {
                '@type': 'Organization',
                'name': cfgCompanyName,
                'alternateName': 'Mining Base Co., Ltd.',
                'url': 'https://mining-base.co.jp',
              },
              'contactPoint': {
                '@type': 'ContactPoint',
                'contactType': 'customer service',
                'availableLanguage': 'Japanese',
                'url': `${cfgStoreUrl}/contact`,
                ...(cfgContactPhone ? {telephone: cfgContactPhone} : {}),
                ...(cfgContactEmail ? {email: cfgContactEmail} : {}),
              },
              'sameAs': [],
              'potentialAction': {
                '@type': 'SearchAction',
                'target': {
                  '@type': 'EntryPoint',
                  'urlTemplate': `${cfgStoreUrl}/search?q={search_term_string}`,
                },
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />
        {/* WebSite JSON-LD (F8: サイト内検索スキーマ)
            patch 0024: brand_name / store_url を site_config から上書き */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              'name': `${cfgBrandName}公式オンラインストア`,
              'alternateName': 'アストロメダ公式ショップ',
              'url': cfgStoreUrl,
              'potentialAction': {
                '@type': 'SearchAction',
                'target': {
                  '@type': 'EntryPoint',
                  'urlTemplate': `${cfgStoreUrl}/search?q={search_term_string}`,
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
        {/*
          patch 0123 Phase A: お客様の動きトラッカー（クリックヒートマップ MVP）
          - storefront 専用（/admin, /api, /cdn は client 側で skip）
          - sendBeacon で軽量送信、5秒ごと flush + beforeunload で flush
          - DNT 尊重、x/y は viewport 比 0-1 で送る
        */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try{
                  if(typeof window==='undefined')return;
                  var p=location.pathname||'/';
                  // admin / api / cdn は計測しない（管理画面と内部経路）
                  if(p.indexOf('/admin')===0||p.indexOf('/api/')===0||p.indexOf('/cdn/')===0)return;
                  // DNT を尊重
                  if(navigator.doNotTrack==='1'||window.doNotTrack==='1')return;
                  var SID_KEY='_uxr_sid';
                  var sid=null;
                  try{sid=sessionStorage.getItem(SID_KEY);}catch(e){}
                  if(!sid){
                    sid=Math.random().toString(36).slice(2,10)+Date.now().toString(36);
                    try{sessionStorage.setItem(SID_KEY,sid);}catch(e){}
                  }
                  var queue=[];
                  var maxScroll=0;
                  var clickStamps=[]; // for rage detection
                  var endpoint='/api/uxr';
                  var flushing=false;

                  function vw(){return window.innerWidth||document.documentElement.clientWidth||0;}
                  function vh(){return window.innerHeight||document.documentElement.clientHeight||0;}

                  function selOf(t){
                    if(!t||t.nodeType!==1)return '';
                    try{
                      var s=t.tagName?t.tagName.toLowerCase():'';
                      if(t.id)s+='#'+String(t.id).slice(0,30);
                      else if(t.className&&typeof t.className==='string'){
                        var cls=t.className.trim().split(/\\s+/).slice(0,2).join('.');
                        if(cls)s+='.'+cls;
                      }
                      // role / data-action があれば加味
                      var r=t.getAttribute&&t.getAttribute('role');
                      if(r)s+='[role='+r+']';
                      return s.slice(0,80);
                    }catch(e){return '';}
                  }
                  function txtOf(t){
                    try{
                      var s=(t.innerText||t.textContent||'').trim();
                      return s.slice(0,40);
                    }catch(e){return '';}
                  }

                  function pushEvent(ev){
                    queue.push(ev);
                    if(queue.length>=80) flush();
                  }

                  function buildBatch(){
                    return JSON.stringify({
                      sid: sid,
                      path: p,
                      ua: (navigator.userAgent||'').slice(0,80),
                      events: queue.splice(0,queue.length)
                    });
                  }

                  function flush(){
                    if(flushing||queue.length===0)return;
                    flushing=true;
                    try{
                      var body=buildBatch();
                      // 50KB 上限を意識
                      if(body.length>49000){
                        // overflow分は破棄（次サイクルへ持ち越さない）
                      }
                      var sent=false;
                      if(navigator.sendBeacon){
                        try{
                          var blob=new Blob([body],{type:'text/plain;charset=utf-8'});
                          sent=navigator.sendBeacon(endpoint,blob);
                        }catch(e){sent=false;}
                      }
                      if(!sent){
                        try{
                          fetch(endpoint,{method:'POST',body:body,keepalive:true,headers:{'Content-Type':'text/plain'}}).catch(function(){});
                        }catch(e){}
                      }
                    }catch(e){}
                    flushing=false;
                  }

                  // pageview
                  pushEvent({
                    t:'pv',
                    ts:Date.now(),
                    vw:vw(),
                    vh:vh(),
                    r:(document.referrer||'').replace(/^https?:\\/\\//,'').slice(0,80),
                    u:(new URLSearchParams(location.search).get('utm_source')||'').slice(0,40)
                  });

                  // click
                  document.addEventListener('click',function(ev){
                    try{
                      var w=vw(),h=vh();
                      if(w<1||h<1)return;
                      var x=Math.max(0,Math.min(1,(ev.clientX||0)/w));
                      var y=Math.max(0,Math.min(1,(ev.clientY||0)/h));
                      var t=ev.target;
                      pushEvent({t:'click',ts:Date.now(),x:x,y:y,vw:w,vh:h,sel:selOf(t),txt:txtOf(t)});
                      // rage 判定: 1.2秒以内に同領域 (50px) で 3 回以上
                      var now=Date.now();
                      var px=ev.clientX||0,py=ev.clientY||0;
                      clickStamps=clickStamps.filter(function(c){return now-c.ts<1200;});
                      clickStamps.push({ts:now,px:px,py:py});
                      var near=clickStamps.filter(function(c){
                        return Math.abs(c.px-px)<50&&Math.abs(c.py-py)<50;
                      });
                      if(near.length>=3){
                        pushEvent({t:'rage',ts:now,x:x,y:y,c:near.length});
                        clickStamps=[]; // reset
                      }
                    }catch(e){}
                  },{capture:true,passive:true});

                  // scroll depth (max %)
                  function onScroll(){
                    try{
                      var doc=document.documentElement;
                      var scrollTop=window.pageYOffset||doc.scrollTop||0;
                      var docH=Math.max(doc.scrollHeight,doc.offsetHeight,document.body.scrollHeight,document.body.offsetHeight)||1;
                      var winH=vh();
                      var depth=Math.min(100,Math.round(((scrollTop+winH)/docH)*100));
                      if(depth>maxScroll)maxScroll=depth;
                    }catch(e){}
                  }
                  window.addEventListener('scroll',onScroll,{passive:true});

                  // 5秒ごとに flush + scroll depth を埋める
                  setInterval(function(){
                    if(maxScroll>0){
                      pushEvent({t:'scroll',ts:Date.now(),d:maxScroll});
                    }
                    flush();
                  },5000);

                  // 退出時の最後 flush
                  window.addEventListener('beforeunload',function(){
                    if(maxScroll>0)pushEvent({t:'scroll',ts:Date.now(),d:maxScroll});
                    flush();
                  });
                  window.addEventListener('pagehide',function(){
                    if(maxScroll>0)pushEvent({t:'scroll',ts:Date.now(),d:maxScroll});
                    flush();
                  });
                }catch(e){/* tracker は決して画面を壊さない */}
              })();
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