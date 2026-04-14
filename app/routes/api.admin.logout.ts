/**
 * Admin API — ログアウト
 *
 * POST /api/admin/logout
 * セッションCookieを破棄してログインページにリダイレクト。
 *
 * 医学メタファー: 免疫記憶の消去
 * T細胞（セッション）を破棄し、再認証が必要な状態に戻す。
 */

import { redirect } from 'react-router';
import { AppSession } from '~/lib/session';

export async function action({ request, context }: { request: Request; context: { env: Env } }) {
  const env = context.env as Env;

  if (!env.SESSION_SECRET) {
    return redirect('/admin/login');
  }

  const session = await AppSession.init(request, [env.SESSION_SECRET]);

  // セッション破棄（免疫記憶の消去）
  return redirect('/admin/login', {
    headers: {
      'Set-Cookie': await session.destroy(),
    },
  });
}
