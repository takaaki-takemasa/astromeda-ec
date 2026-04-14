/**
 * Admin Layout — 管理画面レイアウト（セッション認証）
 * /admin/* 配下の全ルートに適用
 *
 * Phase 10: Basic Auth（ブラウザポップアップ）→ セッションCookie認証に移行
 * 未ログイン → /admin/login にリダイレクト
 *
 * 医学メタファー: 自己・非自己認識（MHC分子）
 * セッションCookie = 免疫記憶T細胞。一度認証されれば再認証不要。
 * セッション失効 = T細胞の寿命。定期的に再認証が必要。
 */

import {Outlet, data, redirect} from 'react-router';
import type {Route} from './+types/admin';
import {AppSession} from '~/lib/session';

/**
 * Admin認証 loader
 * セッションCookieを検証し、未認証の場合は /admin/login へリダイレクト
 * 環境変数 ADMIN_PASSWORD が未設定の場合は管理画面を無効化（安全側に倒す）
 */
export async function loader({request, context}: Route.LoaderArgs) {
  const env = context.env as Env;
  const adminPassword = env.ADMIN_PASSWORD;

  // パスワード未設定 → 管理画面自体を無効化（安全側に倒す）
  if (!adminPassword) {
    throw data('Admin access is disabled. Set ADMIN_PASSWORD environment variable.', {
      status: 403,
    });
  }

  // ログインページ自体はセッションチェックをスキップ（無限リダイレクト防止）
  const url = new URL(request.url);
  if (url.pathname === '/admin/login') {
    return null;
  }

  // セッションからログイン状態を確認（免疫記憶の参照）
  const session = await AppSession.init(request, [env.SESSION_SECRET]);
  const isAdmin = session.get('isAdmin');

  if (!isAdmin) {
    // 未認証 → ログインページにリダイレクト
    throw redirect('/admin/login');
  }

  // セッション有効期限チェック（24時間）
  const loginAt = session.get('loginAt') as number | undefined;
  if (loginAt && Date.now() - loginAt > 24 * 60 * 60 * 1000) {
    // セッション期限切れ → 再ログイン
    session.unset('isAdmin');
    session.unset('loginAt');
    throw redirect('/admin/login', {
      headers: {
        'Set-Cookie': await session.commit(),
      },
    });
  }

  return null;
}

export const meta: Route.MetaFunction = () => [
  {title: 'ASTROMEDA | 管理画面'},
  {name: 'robots', content: 'noindex, nofollow'},
];

export default function AdminLayout() {
  return <Outlet />;
}

export {RouteErrorBoundary as ErrorBoundary} from '~/components/astro/RouteErrorBoundary';
