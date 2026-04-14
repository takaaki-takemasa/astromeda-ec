/**
 * CSRF Middleware — 全Admin APIエンドポイント用
 *
 * IM-03: CSRF SameSite=Strict + トークンローテーション
 *
 * 医学メタファー: 免疫系のMHC（主要組織適合性複合体）
 * 自己細胞（正規リクエスト）と非自己（CSRF攻撃）を識別する。
 * MHCマーカーがないリクエストは拒否される。
 * IM-03強化: トークンは1回使用で失効（使い捨て抗体）。
 * SameSite=Strict でクロスオリジンの全Cookie送信を遮断。
 *
 * 適用方法:
 * ```ts
 * // admin APIルートのaction/loaderの冒頭で呼ぶ
 * export async function action({ request, context }: Route.ActionArgs) {
 *   const csrfError = await verifyCsrfForAdmin(request, context.env);
 *   if (csrfError) return csrfError;
 *   // ... 通常処理
 * }
 * ```
 *
 * 検証方式: Double Submit Cookie + Custom Header
 * - セッションCookieに保存されたCSRFトークン
 * - リクエストヘッダー `X-CSRF-Token` またはボディの `_csrf` フィールドと照合
 * - 検証成功後、トークンをローテーション（再利用防止）
 */

import { AppSession } from '~/lib/session';
import { verifyCsrfToken, generateCsrfToken } from '~/lib/admin-auth';

/**
 * MS-02: CSRF Request拡張インターフェース
 * カスタムプロパティ(__csrfRotatedToken, __csrfSession)の型定義
 */
declare global {
  interface Request {
    __csrfRotatedToken?: string;
    __csrfSession?: AppSession;
  }
}

/**
 * Admin APIのCSRF検証
 *
 * GETリクエストはCSRF検証不要（副作用なし）
 * POST/PUT/PATCH/DELETEはCSRFトークン必須
 *
 * @returns null=検証成功, Response=エラーレスポンス
 */
export async function verifyCsrfForAdmin(
  request: Request,
  env: Env,
): Promise<Response | null> {
  // GET/HEAD/OPTIONSは安全メソッド → CSRF検証不要
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return null;
  }

  // セッションからCSRFトークンを取得
  if (!env.SESSION_SECRET) {
    return Response.json(
      { error: 'CSRF verification unavailable' },
      { status: 500 },
    );
  }

  let session: AppSession;
  try {
    session = await AppSession.init(request, [env.SESSION_SECRET]);
  } catch {
    return Response.json(
      { error: 'Session verification failed' },
      { status: 403 },
    );
  }

  const sessionToken = session.get('csrfToken') as string | undefined;

  // リクエストからCSRFトークンを取得（ヘッダー優先、フォームボディフォールバック）
  let requestToken = request.headers.get('X-CSRF-Token');

  if (!requestToken) {
    // Content-Typeがフォームの場合のみボディからトークンを読む
    const contentType = request.headers.get('Content-Type') || '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      try {
        const cloned = request.clone();
        const formData = await cloned.formData();
        requestToken = formData.get('_csrf') as string | null;
      } catch {
        // フォームパース失敗は無視（ヘッダーで検証）
      }
    } else if (contentType.includes('application/json')) {
      try {
        const cloned = request.clone();
        const json = await cloned.json() as Record<string, unknown>;
        if (typeof json._csrf === 'string') {
          requestToken = json._csrf;
        }
      } catch {
        // JSONパース失敗は無視
      }
    }
  }

  // トークン検証
  if (!verifyCsrfToken(sessionToken, requestToken ?? undefined)) {
    return Response.json(
      {
        type: '/errors/csrf-validation',
        title: 'CSRF Token Invalid',
        status: 403,
        detail: 'CSRFトークンが無効です。ページをリロードしてやり直してください。',
        timestamp: new Date().toISOString(),
      },
      {
        status: 403,
        headers: { 'Content-Type': 'application/problem+json' },
      },
    );
  }

  // IM-03: トークンローテーション（使い捨て抗体パターン）
  // 検証成功後、新しいトークンを発行して旧トークンを無効化。
  // リプレイ攻撃（傍受したトークンの再利用）を防止する。
  try {
    const newToken = generateCsrfToken();
    if (typeof session.set === 'function') {
      session.set('csrfToken', newToken);

      // IM-03: ローテーション後のトークンをレスポンスヘッダーで通知
      // フロントエンドは X-New-CSRF-Token を読んで次回リクエストに使用
      // セッションをcommitしてSet-Cookieを返す必要があるため、
      // ここではヘッダー情報をリクエストに付加して呼び出し元に伝達
      // （呼び出し元がレスポンスに含める責務）
      request.__csrfRotatedToken = newToken;
      request.__csrfSession = session;
    }
  } catch {
    // ローテーション失敗は非致命的（検証自体は成功済み）
    // Phase 2: ローテーション失敗を監査ログに記録
  }

  return null; // 検証成功
}

/**
 * IM-03: CSRF検証後のセッションcommit用ヘルパー
 * verifyCsrfForAdmin成功後にレスポンスヘッダーに追加する。
 *
 * @example
 * ```ts
 * const csrfError = await verifyCsrfForAdmin(request, env);
 * if (csrfError) return csrfError;
 * const response = Response.json({ok: true});
 * return await applyCsrfRotation(request, response);
 * ```
 */
export async function applyCsrfRotation(
  request: Request,
  response: Response,
): Promise<Response> {
  const rotatedToken = request.__csrfRotatedToken;
  const session = request.__csrfSession;

  if (!rotatedToken || !session) return response;

  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-New-CSRF-Token', rotatedToken);

  // セッションCookieをcommit（新トークンを永続化）
  const cookie = await session.commit();
  newHeaders.append('Set-Cookie', cookie);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
