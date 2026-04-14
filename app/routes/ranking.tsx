import {redirect} from 'react-router';
import type {Route} from './+types/ranking';

/**
 * D-10: 売上ランキング専用ルート
 * /ranking → /collections/all?sort=best にリダイレクト
 *
 * 現行サイトのランキング機能を新サイトで再現。
 * Shopify の BEST_SELLING ソートを活用し、全商品コレクションで
 * 売上順に表示する。専用ルートを設けることで
 * ナビゲーションやSEOで「ランキング」として扱える。
 */
export function loader({request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  // クエリパラメータを維持（ページネーション等）
  const params = new URLSearchParams(url.searchParams);
  params.set('sort', 'best');
  return redirect(`/collections/all?${params.toString()}`, {status: 302});
}
