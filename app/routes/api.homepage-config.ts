/**
 * ホームページ設定公開API — CMS Phase D
 *
 * GET: メタオブジェクトからCOLLABS/バナー設定を取得
 * 認証不要（公開読み取り専用）。キャッシュ付き。
 *
 * フォールバック: メタオブジェクトが空の場合はastromeda-data.tsのCOLLABS返却
 */

import { data } from 'react-router';
import type { Route } from './+types/api.homepage-config';
import { COLLABS } from '~/lib/astromeda-data';

const COLLABS_TYPE = 'astromeda_homepage_collabs';

export async function loader({ context }: Route.LoaderArgs) {
  try {
    const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);
    const adminToken = (contextEnv as unknown as { PRIVATE_STOREFRONT_API_TOKEN?: string }).PRIVATE_STOREFRONT_API_TOKEN;
    const storeDomain = contextEnv.PUBLIC_STORE_DOMAIN || 'staging-mining-base.myshopify.com';

    if (!adminToken) {
      // Admin API トークンなし → フォールバック
      return data({
        source: 'fallback',
        collabs: COLLABS,
      }, {
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    // メタオブジェクトから取得を試行
    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    const metaobjects = await client.getMetaobjects(COLLABS_TYPE, 100);

    if (!metaobjects || metaobjects.length === 0) {
      // メタオブジェクト未登録 → フォールバック
      return data({
        source: 'fallback',
        collabs: COLLABS,
      }, {
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    // メタオブジェクトからCollabItem[]形式に変換
    const dynamicCollabs = metaobjects.map((mo) => {
      const f: Record<string, string> = {};
      for (const field of mo.fields) f[field.key] = field.value;

      return {
        n: f['name'] || '',
        shop: f['shop_handle'] || '',
        t: f['theme'] || 'default',
        f: f['featured'] === 'true',
      };
    });

    return data({
      source: 'metaobject',
      collabs: dynamicCollabs,
    }, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  } catch {
    // エラー時もフォールバック
    return data({
      source: 'fallback',
      collabs: COLLABS,
    }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }
}
