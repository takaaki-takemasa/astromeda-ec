import {ServerRouter} from 'react-router';
import {isbot} from 'isbot';
import {renderToReadableStream} from 'react-dom/server';
import {
  createContentSecurityPolicy,
  type HydrogenRouterContextProvider,
} from '@shopify/hydrogen';
import type {EntryContext} from 'react-router';
import {STORE_URL} from '~/lib/astromeda-data';

/**
 * BR-12: renderToReadableStream全体をtry/catchで保護。
 * SSR自体が失敗した場合、最低限のHTMLを返してユーザーに白画面を見せない。
 * 生命医学: 意識不明でも心肺は動く（最低限の生命維持HTML）。
 *
 * BR-13: onError本番でもreportError送信（dev限定解除）。
 * 本番環境のSSRエラーを黙殺すると、がん細胞が無症状で増殖するのと同じ。
 *
 * BR-14: Permissions-PolicyにApple Pay追加。
 * Shopify Payments + Apple Payの決済フローが正常に動くよう明示的に許可。
 */
export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  context: HydrogenRouterContextProvider,
) {
  const {nonce, header, NonceProvider} = createContentSecurityPolicy({
    shop: {
      checkoutDomain: context.env.PUBLIC_CHECKOUT_DOMAIN || context.env.PUBLIC_STORE_DOMAIN,
      storeDomain: context.env.PUBLIC_STORE_DOMAIN,
    },
    imgSrc: [
      "'self'",
      'data:',
      'https://cdn.shopify.com',
      STORE_URL,
    ],
    // patch 0028: 管理画面 (/admin) の「ビジュアル編集」タブが iframe で
    // 同じ Origin の storefront を embed できるよう、Hydrogen 既定の
    // `frame-ancestors 'none'` を `'self'` に緩める。外部 Origin からの
    // clickjacking は引き続きブロックされる。
    frameAncestors: ["'self'"],
  });

  try {
    const body = await renderToReadableStream(
      <NonceProvider>
        <ServerRouter
          context={reactRouterContext}
          url={request.url}
          nonce={nonce}
        />
      </NonceProvider>,
      {
        nonce,
        signal: request.signal,
        // BR-13: 本番でもエラーを構造化ログに記録（dev限定解除）
        onError(error) {
          // M8-ORGAN-01: 本番ではスタックトレースを省略（message + URLのみ記録）
          console.error('[entry.server] SSR render error:', {
            message: error instanceof Error ? error.message : String(error),
            ...(process.env.NODE_ENV === 'development' ? { stack: error instanceof Error ? error.stack : undefined } : {}),
            url: request.url,
            timestamp: new Date().toISOString(),
          });
          responseStatusCode = 500;
        },
      },
    );

    if (isbot(request.headers.get('user-agent'))) {
      await body.allReady;
    }

    responseHeaders.set('Content-Type', 'text/html');
    responseHeaders.set('Content-Security-Policy', header);

    // セキュリティヘッダー（H-02, H-03, H-04, H-05 相当）
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set(
      'Referrer-Policy',
      'strict-origin-when-cross-origin',
    );
    // BR-14: Permissions-PolicyにApple Pay追加
    // payment=(self ...)でShopify Payments + Apple Payの決済フローを許可
    responseHeaders.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(self "https://shop.app" "https://pay.shopify.com" "https://apple.com")',
    );
    if (!responseHeaders.has('Strict-Transport-Security')) {
      responseHeaders.set(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload',
      );
    }

    return new Response(body, {
      headers: responseHeaders,
      status: responseStatusCode,
    });
  } catch (error) {
    // BR-12: SSR完全失敗時のフォールバックHTML
    // renderToReadableStream自体がthrowした場合（メモリ不足、構文エラー等）
    // M8-ORGAN-01: CRITICALエラーは本番でもスタック記録（完全障害の診断に必須）
    console.error('[entry.server] CRITICAL: SSR stream creation failed:', {
      message: error instanceof Error ? error.message : String(error),
      ...(process.env.NODE_ENV === 'development' ? { stack: error instanceof Error ? error.stack : undefined } : {}),
      url: request.url,
      timestamp: new Date().toISOString(),
    });

    const fallbackHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Astromeda - 一時的なエラー</title>
  <style>
    body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fff}
    .container{text-align:center;padding:2rem}
    h1{font-size:1.5rem;margin-bottom:1rem}
    p{color:#888;margin-bottom:1.5rem}
    a{color:#6366f1;text-decoration:none}
    a:hover{text-decoration:underline}
  </style>
</head>
<body>
  <div class="container">
    <h1>一時的にページを表示できません</h1>
    <p>しばらく待ってからもう一度お試しください。</p>
    <a href="/">トップページに戻る</a>
  </div>
</body>
</html>`;

    return new Response(fallbackHtml, {
      status: 500,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
}
