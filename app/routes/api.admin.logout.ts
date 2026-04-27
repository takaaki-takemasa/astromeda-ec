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
  const env = (context as unknown as {env: Env}).env;

  if (!env?.SESSION_SECRET) {
    return redirect('/admin/login');
  }

  // patch 0175 (P0): セッション統一規約 — server.ts が共有 session を持っている時は
  // それを使い、フィールドを unset で全クリア。これで server.ts wrapper が commit する
  // 際に空セッションが書き戻され、Set-Cookie 二重発行で復元される事故を防ぐ。
  // 旧実装: 新規 AppSession.init して destroy() → 共有 session には影響せず
  // server.ts wrapper が commit で古い isAdmin を Set-Cookie で書き戻していた。
  const sharedSession = (context as unknown as {session?: AppSession}).session;

  if (sharedSession) {
    // 共有 session のフィールドをすべてクリア (auth + RBAC + メタデータ)
    sharedSession.unset('isAdmin');
    sharedSession.unset('userId');
    sharedSession.unset('username');
    sharedSession.unset('role');
    sharedSession.unset('loginAt');
    sharedSession.unset('csrfToken');
    sharedSession.unset('expiresAt');
    sharedSession.unset('rotateAt');
    // server.ts wrapper が response の Set-Cookie に commit() を append する
    return redirect('/admin/login');
  }

  // フォールバック: 共有 session が無い (旧経路) は従来通り destroy
  const session = await AppSession.init(request, [env.SESSION_SECRET]);
  return redirect('/admin/login', {
    headers: {
      'Set-Cookie': await session.destroy(),
    },
  });
}
