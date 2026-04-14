import {useLoaderData, redirect} from 'react-router';
import type {Route} from './+types/pages.$handle';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import {sanitizeHtml} from '~/lib/sanitize-html';
import {AppError} from '~/lib/app-error';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {STORE_URL, T} from '~/lib/astromeda-data';

/** 独自ルートが存在するページ → /pages/xxx を /xxx へリダイレクト */
const CUSTOM_ROUTE_HANDLES: Record<string, string> = {
  faq: '/faq',
  'gaming-pc': '/collections/gaming-pc',
  gadget: '/collections/gadgets',
  goods: '/collections/goods',
  warranty: '/warranty',
  inquiry: '/contact',
  contact: '/contact',
  'contact-houjin': '/contact-houjin',
  commitment: '/commitment',
  recycle: '/recycle',
  yojimaru: '/yojimaru',
};

export const meta: Route.MetaFunction = ({data}) => {
  const handle = data?.page?.handle ?? '';
  const url = `${STORE_URL}/pages/${handle}`;
  const title = `ASTROMEDA | ${data?.page?.title ?? ''}`;
  const body = data?.page?.body ?? '';
  const desc = body.replace(/<[^>]*>/g, '').slice(0, 155).trim() || `ASTROMEDA — ${data?.page?.title ?? ''}`;
  return [
    {title},
    {name: 'description', content: desc},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:url', content: url},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
  ];
};

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  return {...deferredData, ...criticalData};
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({context, request, params}: Route.LoaderArgs) {
  if (!params.handle) {
    throw new Error('Missing page handle');
  }

  // 独自ルートが存在するハンドルは301リダイレクト
  const customRoute = CUSTOM_ROUTE_HANDLES[params.handle];
  if (customRoute) {
    throw redirect(customRoute, 301);
  }

  let page;
  try {
    const [result] = await Promise.all([
      context.storefront.query(PAGE_QUERY, {
        variables: {
          handle: params.handle,
        },
      }),
    ]);
    page = result.page;
  } catch (error) {
    process.env.NODE_ENV === 'development' && console.error('[pages.$handle] Storefront API error:', error);
    throw AppError.externalApi('ページデータの取得に失敗しました');
  }

  if (!page) {
    throw AppError.notFound('ページが見つかりません');
  }

  redirectIfHandleIsLocalized(request, {handle: params.handle, data: page});

  return {
    page,
  };
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context}: Route.LoaderArgs) {
  return {};
}

export default function Page() {
  const {page} = useLoaderData<typeof loader>();

  return (
    <div
      className="astro-shopify-page"
      style={{
        minHeight: '60vh',
        padding: 'clamp(28px, 5vw, 64px) clamp(16px, 4vw, 48px)',
      }}
    >
      <div
        style={{
          maxWidth: 880,
          margin: '0 auto',
        }}
      >
        <header
          style={{
            marginBottom: 'clamp(20px, 3vw, 32px)',
            paddingBottom: 'clamp(16px, 2vw, 24px)',
            borderBottom: `1px solid ${T.t1}`,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(22px, 3.4vw, 34px)',
              fontWeight: 900,
              color: T.tx,
              letterSpacing: 1.5,
              lineHeight: 1.3,
            }}
          >
            {page.title}
          </h1>
        </header>
        <main
          className="astro-page-body"
          style={{
            color: T.tx,
            lineHeight: 1.9,
            fontSize: 'clamp(13px, 1.5vw, 15px)',
          }}
          dangerouslySetInnerHTML={{__html: sanitizeHtml(page.body)}}
        />
      </div>
      {/* Shopify製HTMLのデフォルト要素にAstromedaテーマを適用 */}
      <style dangerouslySetInnerHTML={{__html: `
        .astro-page-body h1,
        .astro-page-body h2,
        .astro-page-body h3,
        .astro-page-body h4 {
          color: ${T.tx};
          font-weight: 800;
          letter-spacing: 0.5px;
          margin-top: 2em;
          margin-bottom: 0.6em;
        }
        .astro-page-body h2 {
          font-size: clamp(18px, 2.4vw, 24px);
          border-left: 4px solid ${T.c};
          padding-left: 12px;
        }
        .astro-page-body h3 { font-size: clamp(15px, 2vw, 19px); }
        .astro-page-body p { margin: 0.9em 0; color: ${T.t4}; }
        .astro-page-body a { color: ${T.c}; text-decoration: underline; }
        .astro-page-body a:hover { opacity: 0.8; }
        .astro-page-body ul, .astro-page-body ol { padding-left: 1.4em; margin: 0.9em 0; color: ${T.t4}; }
        .astro-page-body li { margin: 0.3em 0; }
        .astro-page-body img { max-width: 100%; height: auto; border-radius: 12px; margin: 1em 0; }
        .astro-page-body table {
          width: 100%;
          border-collapse: collapse;
          margin: 1em 0;
          font-size: 0.95em;
        }
        .astro-page-body th, .astro-page-body td {
          border: 1px solid ${T.t1};
          padding: 10px 14px;
          text-align: left;
          color: ${T.t4};
        }
        .astro-page-body th {
          background: rgba(255,255,255,0.04);
          color: ${T.tx};
          font-weight: 700;
        }
        .astro-page-body blockquote {
          border-left: 3px solid ${T.c};
          margin: 1em 0;
          padding: 0.6em 1em;
          background: rgba(255,255,255,0.03);
          color: ${T.t4};
        }
        .astro-page-body hr {
          border: none;
          border-top: 1px solid ${T.t1};
          margin: 2em 0;
        }
      `}} />
    </div>
  );
}

const PAGE_QUERY = `#graphql
  query Page(
    $language: LanguageCode,
    $country: CountryCode,
    $handle: String!
  )
  @inContext(language: $language, country: $country) {
    page(handle: $handle) {
      handle
      id
      title
      body
      seo {
        description
        title
      }
    }
  }
` as const;

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
