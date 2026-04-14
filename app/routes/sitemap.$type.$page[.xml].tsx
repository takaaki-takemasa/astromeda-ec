import type {Route} from './+types/sitemap.$type.$page[.xml]';
import {getSitemap} from '@shopify/hydrogen';

export async function loader({
  request,
  params,
  context: {storefront},
}: Route.LoaderArgs) {
  const response = await getSitemap({
    storefront,
    request,
    params,
    // 日本市場単一ロケール（将来の多言語化時にlocale配列を拡張可能）
    locales: ['JA-JP'],
    getLink: ({type, baseUrl, handle, locale}) => {
      // JA-JP単一ロケールのため、ロケールプレフィックスなしのURLを生成
      // 将来EN-USなど追加時は locale prefix を付与する分岐を追加
      return `${baseUrl}/${type}/${handle}`;
    },
  });

  response.headers.set('Cache-Control', `max-age=${60 * 60 * 24}`);

  return response;
}
