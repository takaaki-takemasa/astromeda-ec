/**
 * IndexNow API — Bing/Yandex即時インデックス通知
 *
 * Phase 1-4: コンテンツ更新時にBing・Yandexへ即時通知
 * POST /api/indexnow { urls: string[] }
 *
 * 医学メタファー: サイトカインシグナル
 * コンテンツ更新 = 細胞の変化 → IndexNow = サイトカイン放出
 * → 検索エンジン（免疫系）が即座に変化を認識・対応
 */

import type {ActionFunctionArgs} from 'react-router';
import {AppSession} from '~/lib/session';
import {IndexNowSchema} from '~/lib/api-schemas';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';

// IndexNow APIキー（公開しても安全なサイト認証用トークン）
const INDEXNOW_KEY = 'astromeda-indexnow-2026';

/**
 * GET /api/indexnow — IndexNowキー検証エンドポイント
 * Bing/Yandexがキーファイルを検証する際に使用
 */
export async function loader({ request }: {request: Request}) {
  const limited = applyRateLimit(request, 'api.indexnow', RATE_LIMIT_PRESETS.internal);
  if (limited) return limited;
  return new Response(INDEXNOW_KEY, {
    status: 200,
    headers: {'Content-Type': 'text/plain'},
  });
}

/**
 * POST /api/indexnow — URL送信エンドポイント
 * 管理者認証必須。更新されたURLをBing/Yandexに通知。
 */
export async function action({request, context}: ActionFunctionArgs) {
  const limited = applyRateLimit(request, 'api.indexnow', RATE_LIMIT_PRESETS.internal);
  if (limited) return limited;
  const env = context.env as Env;

  // 管理者認証チェック
  const session = await AppSession.init(request, [env.SESSION_SECRET]);
  if (session.get('isAdmin') !== true) {
    return new Response(JSON.stringify({error: '認証が必要です'}), {
      status: 401,
      headers: {'Content-Type': 'application/json'},
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return new Response(JSON.stringify({error: '無効なリクエスト'}), {
      status: 400,
      headers: {'Content-Type': 'application/json'},
    });
  }

  const validation = IndexNowSchema.safeParse(rawBody);
  if (!validation.success) {
    return new Response(JSON.stringify({
      error: '入力値が無効です',
      details: validation.error.errors.map(e => e.message),
    }), {
      status: 400,
      headers: {'Content-Type': 'application/json'},
    });
  }

  const { urls: validUrls } = validation.data;

  const host = new URL(validUrls[0]).host;

  // IndexNow API送信（Bing + Yandex 並列）
  const indexNowPayload = {
    host,
    key: INDEXNOW_KEY,
    keyLocation: `https://${host}/api/indexnow`,
    urlList: validUrls,
  };

  const endpoints = [
    'https://api.indexnow.org/indexnow',
    'https://www.bing.com/indexnow',
    'https://yandex.com/indexnow',
  ];

  const results = await Promise.allSettled(
    endpoints.map(async (endpoint) => {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {'Content-Type': 'application/json; charset=utf-8'},
          body: JSON.stringify(indexNowPayload),
        });
        return {
          endpoint,
          status: res.status,
          ok: res.ok,
        };
      } catch (err) {
        return {
          endpoint,
          status: 0,
          ok: false,
          error: String(err),
        };
      }
    })
  );

  const summary = results.map((r) => {
    if (r.status === 'fulfilled') return r.value;
    return {endpoint: 'unknown', status: 0, ok: false, error: r.reason};
  });

  return new Response(JSON.stringify({
    success: true,
    urlCount: validUrls.length,
    results: summary,
  }), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
  });
}
