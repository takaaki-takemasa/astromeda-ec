/**
 * Admin Login — ログインフォーム（アイデンティティ形成）
 *
 * Phase 10: Basic Auth（ブラウザポップアップ）を廃止。
 * スタイル付きログインフォーム＋セッションCookieによる認証へ移行。
 *
 * 医学メタファー: 自己認識（Self-Recognition）
 * 免疫系のMHC分子が「自己」を認識するように、
 * ユーザーがパスワードを入力して「管理者である自分」を証明する。
 * 認証成功 → セッションCookie（免疫記憶のT細胞）が発行され、
 * 以降のアクセスでは再認証不要（免疫記憶による迅速応答）。
 */

import { useState } from 'react';
import { redirect, data, Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { AppSession } from '~/lib/session';
import { AppError } from '~/lib/app-error';
import { generateCsrfToken, verifyCsrfToken } from '~/lib/admin-auth';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';

// ── テーマ定数（admin._index.tsxと統一） ──
const D = {
  bg: '#06060C',
  bgCard: '#0D0D18',
  border: 'rgba(255,255,255,.06)',
  cyan: '#00F0FF',
  green: '#00E676',
  red: '#FF2D55',
  text: '#fff',
  textMuted: 'rgba(255,255,255,.55)',
  textDim: 'rgba(255,255,255,.3)',
};

/**
 * Loader: 既にログイン済みなら /admin にリダイレクト
 */
export async function loader({ request, context }: { request: Request; context: { env: Env } }) {
  const env = context.env;
  if (!env.SESSION_SECRET) {
    throw AppError.configuration('SESSION_SECRET が設定されていません');
  }

  // セッション統一規約: server.ts が createHydrogenRouterContext で生成した
  // セッションを優先利用し、二重 commit を回避（過去の Set-Cookie 上書きバグ対策）
  const sharedSession = (context as unknown as {session?: AppSession}).session;
  const session = sharedSession ?? await AppSession.init(request, [env.SESSION_SECRET]);

  if (session.get('isAdmin') === true) {
    throw redirect('/admin');
  }

  // CSRF トークン生成（免疫系: 抗原マーカーの発行）
  const csrfToken = generateCsrfToken();
  session.set('csrfToken', csrfToken);

  // sharedSession を使った場合は server.ts の wrapper が自動 commit する
  if (sharedSession) {
    return data({csrfToken});
  }
  return data(
    { csrfToken },
    { headers: { 'Set-Cookie': await session.commit() } },
  );
}

/**
 * Action: パスワード検証 → セッションCookie発行
 * Phase 21: レート制限追加（自然免疫バリア）
 *
 * セッション統一規約: server.ts が生成した共有セッションを優先利用し、
 * 二重 Set-Cookie の last-wins 上書きを回避する。
 */
export async function action({ request, context }: { request: Request; context: { env: Env } }) {
  const limited = applyRateLimit(request, 'admin.login', RATE_LIMIT_PRESETS.auth);
  if (limited) return limited;

  const env = context.env;
  const adminPassword = env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return data({ error: '管理画面が無効です（ADMIN_PASSWORD未設定）' }, { status: 403 });
  }

  const formData = await request.formData();
  const password = String(formData.get('password') || '');

  // CSRF検証（免疫系: 抗原マーカーの照合）
  // 共有セッション優先: hydrogenContext.session を再利用、無ければフォールバック
  const sharedSession = (context as unknown as {session?: AppSession}).session;
  const session = sharedSession ?? await AppSession.init(request, [env.SESSION_SECRET]);

  // ADMIN_CSRF_BYPASS=true の場合、CSRF検証をスキップ（Oxygen deploy 直後のセッション不整合回避）
  const csrfBypass = String((env as Record<string, string | undefined>).ADMIN_CSRF_BYPASS || '') === 'true';
  if (!csrfBypass) {
    const sessionCsrf = session.get('csrfToken') as string | undefined;
    const formCsrf = String(formData.get('_csrf') || '');
    if (!verifyCsrfToken(sessionCsrf, formCsrf)) {
      return data({ error: 'セキュリティトークンが無効です。ページを再読み込みしてください。' }, { status: 403 });
    }
  }

  // タイミング安全比較（Oxygen/Workers環境対応）
  const encoder = new TextEncoder();
  const inputBytes = encoder.encode(password);
  const expectedBytes = encoder.encode(adminPassword);
  const maxLen = Math.max(inputBytes.byteLength, expectedBytes.byteLength);
  let diff = inputBytes.byteLength ^ expectedBytes.byteLength;
  for (let i = 0; i < maxLen; i++) {
    diff |= (inputBytes[i] ?? 0) ^ (expectedBytes[i] ?? 0);
  }

  if (diff !== 0) {
    return data({ error: 'パスワードが正しくありません' }, { status: 401 });
  }

  // セッション発行（免疫記憶T細胞の生成）
  // session は CSRF検証で既にinitされているので再利用
  session.set('isAdmin', true);
  session.set('loginAt', Date.now());

  // sharedSession を使った場合は server.ts の wrapper が自動 commit する
  if (sharedSession) {
    return redirect('/admin');
  }
  return redirect('/admin', {
    headers: {
      'Set-Cookie': await session.commit(),
    },
  });
}

export const meta = () => [
  { title: 'ASTROMEDA | ログイン' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export default function AdminLogin() {
  const loaderData = useLoaderData<{ csrfToken: string }>();
  const actionData = useActionData<{ error?: string }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div style={{
      background: D.bg,
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
      padding: 20,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        textAlign: 'center',
      }}>
        {/* ロゴ/ブランド */}
        <div style={{
          fontSize: 'clamp(18px, 4vw, 28px)',
          fontWeight: 900,
          color: D.cyan,
          letterSpacing: 6,
          marginBottom: 8,
        }}>
          ASTROMEDA
        </div>
        <div style={{
          fontSize: 11,
          color: D.textDim,
          letterSpacing: 3,
          marginBottom: 40,
        }}>
          CONTROL CENTER
        </div>

        {/* ログインカード */}
        <div style={{
          background: D.bgCard,
          borderRadius: 20,
          border: `1px solid ${D.border}`,
          padding: 'clamp(24px, 5vw, 40px)',
          textAlign: 'left',
        }}>
          <div style={{
            fontSize: 16,
            fontWeight: 800,
            color: D.text,
            marginBottom: 6,
          }}>
            管理画面ログイン
          </div>
          <div style={{
            fontSize: 11,
            color: D.textMuted,
            marginBottom: 28,
            lineHeight: 1.5,
          }}>
            パスワードを入力してください
          </div>

          <Form method="post">
            {/* CSRF トークン（免疫系: 抗原マーカー） */}
            <input type="hidden" name="_csrf" value={loaderData?.csrfToken || ''} />
            {/* パスワード入力 */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 700,
                color: D.textDim,
                letterSpacing: 2,
                marginBottom: 8,
              }}>
                PASSWORD
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  required
                  autoFocus
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '14px 50px 14px 16px',
                    fontSize: 15,
                    fontWeight: 600,
                    color: D.text,
                    background: D.bg,
                    border: `1px solid ${actionData?.error ? D.red : D.border}`,
                    borderRadius: 12,
                    outline: 'none',
                    transition: 'border-color .2s',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 16,
                    opacity: 0.5,
                    padding: 4,
                  }}
                  tabIndex={-1}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* エラーメッセージ */}
            {actionData?.error && (
              <div style={{
                fontSize: 12,
                color: D.red,
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 8,
                background: `${D.red}10`,
                border: `1px solid ${D.red}30`,
              }}>
                {actionData.error}
              </div>
            )}

            {/* ログインボタン */}
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '14px 0',
                fontSize: 14,
                fontWeight: 800,
                color: '#000',
                background: isSubmitting ? D.textDim : D.cyan,
                border: 'none',
                borderRadius: 12,
                cursor: isSubmitting ? 'wait' : 'pointer',
                transition: 'all .2s',
                letterSpacing: 1,
                fontFamily: 'inherit',
              }}
            >
              {isSubmitting ? 'ログイン中...' : 'ログイン'}
            </button>
          </Form>
        </div>

        {/* フッター */}
        <div style={{
          marginTop: 32,
          fontSize: 9,
          color: D.textDim,
        }}>
          ASTROMEDA AI Agent System v1.0
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        input:focus {
          border-color: ${D.cyan} !important;
          box-shadow: 0 0 0 2px ${D.cyan}20;
        }
        input::placeholder {
          color: ${D.textDim};
        }
      `}} />
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '~/components/astro/RouteErrorBoundary';
