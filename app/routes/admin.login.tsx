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
// patch 0156: multi-user 認証の追加
// patch 0170: メールアドレスをユーザー ID として優先
import {
  findAdminUserByUsername,
  findAdminUserByEmail,
  countAdminUsers,
  recordAdminUserLogin,
  ADMIN_USER_METAOBJECT_TYPE,
} from '~/lib/admin-users';
import { verifyPassword } from '~/lib/admin-password';
import { auditLog } from '~/lib/audit-log';

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
 * patch 0156: bootstrap モード判定を追加 (admin_user 0 件 = username 欄を隠す)
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

  // patch 0156: bootstrap モード判定 (admin_user が 0 件なら username 欄不要)
  // Shopify Admin API 呼び出しが失敗しても login は可能にする (bootstrap フォールバック)
  let bootstrapMode = true;
  try {
    const {setAdminEnv, getAdminClient} = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(env as unknown as Record<string, string | undefined>);
    const client = getAdminClient();
    // 定義自体が無い場合は 0 件扱い
    const definition = await client.getMetaobjectDefinition(ADMIN_USER_METAOBJECT_TYPE).catch(() => null);
    if (definition) {
      const count = await countAdminUsers(client);
      bootstrapMode = count === 0;
    }
  } catch {
    // Shopify API 呼び出し失敗時は bootstrap モード (既存 ADMIN_PASSWORD ログイン可能)
    bootstrapMode = true;
  }

  // sharedSession を使った場合は server.ts の wrapper が自動 commit する
  if (sharedSession) {
    return data({csrfToken, bootstrapMode});
  }
  return data(
    { csrfToken, bootstrapMode },
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
  // patch 0170: メールアドレスを最優先 ID として受付。username も後方互換で受け付ける
  const emailInput = String(formData.get('email') || '').trim();
  const usernameInput = String(formData.get('username') || '').trim();
  // どちらかに値があれば identifier として使う (メール優先)
  const identifierInput = emailInput || usernameInput;

  // CSRF検証（免疫系: 抗原マーカーの照合）
  // 共有セッション優先: hydrogenContext.session を再利用、無ければフォールバック
  const sharedSession = (context as unknown as {session?: AppSession}).session;
  const session = sharedSession ?? await AppSession.init(request, [env.SESSION_SECRET]);

  // ADMIN_CSRF_BYPASS=true の場合、CSRF検証をスキップ（Oxygen deploy 直後のセッション不整合回避）
  const csrfBypass = String((env as unknown as Record<string, string | undefined>).ADMIN_CSRF_BYPASS || '') === 'true';
  if (!csrfBypass) {
    const sessionCsrf = session.get('csrfToken') as string | undefined;
    const formCsrf = String(formData.get('_csrf') || '');
    if (!verifyCsrfToken(sessionCsrf, formCsrf)) {
      return data({ error: 'セキュリティトークンが無効です。ページを再読み込みしてください。' }, { status: 403 });
    }
  }

  // patch 0156: admin_user があるかを確認して multi-user モードと bootstrap モードを分岐
  let bootstrapMode = true;
  let adminClient: Awaited<ReturnType<typeof import('../../agents/core/shopify-admin.js').getAdminClient>> | null = null;
  try {
    const {setAdminEnv, getAdminClient} = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(env as unknown as Record<string, string | undefined>);
    adminClient = getAdminClient();
    const definition = await adminClient.getMetaobjectDefinition(ADMIN_USER_METAOBJECT_TYPE).catch(() => null);
    if (definition) {
      const count = await countAdminUsers(adminClient);
      bootstrapMode = count === 0;
    }
  } catch {
    bootstrapMode = true;
  }

  if (!bootstrapMode && adminClient) {
    // ── Multi-user モード: admin_user に対して認証 ──
    if (!identifierInput) {
      return data({ error: 'メールアドレスを入力してください' }, { status: 400 });
    }
    // patch 0170: メールアドレスを優先 ID として照合。@ 含むなら email、含まないなら username (後方互換)
    const looksLikeEmail = identifierInput.includes('@');
    let user = looksLikeEmail
      ? await findAdminUserByEmail(adminClient, identifierInput)
      : await findAdminUserByUsername(adminClient, identifierInput);
    // フォールバック: email で見つからなければ username 検索 (パッチ移行期の救済)
    if (!user && looksLikeEmail) {
      user = await findAdminUserByUsername(adminClient, identifierInput);
    }
    if (!user) {
      // ユーザー不在 — 存在しないことを悟られないように同じメッセージ
      auditLog({
        action: 'login_failed',
        role: null,
        resource: 'admin.login',
        detail: `unknown identifier: ${identifierInput}`,
        success: false,
      });
      return data({ error: 'メールアドレスまたはパスワードが正しくありません' }, { status: 401 });
    }
    if (!user.active) {
      auditLog({
        action: 'login_failed',
        role: null,
        actorId: user.id,
        actorUsername: user.username,
        resource: 'admin.login',
        detail: 'user is deactivated',
        success: false,
      });
      return data({ error: 'このユーザーは無効化されています。管理者に問い合わせてください。' }, { status: 401 });
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      auditLog({
        action: 'login_failed',
        role: null,
        actorId: user.id,
        actorUsername: user.username,
        resource: 'admin.login',
        detail: 'password mismatch',
        success: false,
      });
      return data({ error: 'メールアドレスまたはパスワードが正しくありません' }, { status: 401 });
    }

    // 認証成功
    session.set('isAdmin', true);
    session.set('loginAt', Date.now());
    session.set('userId', user.id);
    session.set('username', user.username);
    session.set('role', user.role);

    // 最終ログイン時刻更新 (best-effort)
    void recordAdminUserLogin(adminClient, user.id);

    auditLog({
      action: 'login',
      role: user.role,
      actorId: user.id,
      actorUsername: user.username,
      resource: 'admin.login',
      success: true,
    });

    if (sharedSession) return redirect('/admin');
    return redirect('/admin', {headers: {'Set-Cookie': await session.commit()}});
  }

  // ── Bootstrap モード: ADMIN_PASSWORD 環境変数で owner ログイン ──
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
    auditLog({
      action: 'login_failed',
      role: null,
      resource: 'admin.login',
      detail: 'bootstrap password mismatch',
      success: false,
    });
    return data({ error: 'パスワードが正しくありません' }, { status: 401 });
  }

  // セッション発行 (bootstrap: owner 扱い)
  session.set('isAdmin', true);
  session.set('loginAt', Date.now());
  session.set('userId', 'bootstrap');
  session.set('username', 'bootstrap-owner');
  session.set('role', 'owner');

  auditLog({
    action: 'login',
    role: 'owner',
    actorId: 'bootstrap',
    actorUsername: 'bootstrap-owner',
    resource: 'admin.login',
    detail: 'bootstrap mode (ADMIN_PASSWORD)',
    success: true,
  });

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
  const loaderData = useLoaderData<{ csrfToken: string; bootstrapMode?: boolean }>();
  const actionData = useActionData<{ error?: string }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const [showPassword, setShowPassword] = useState(false);
  const isBootstrap = loaderData?.bootstrapMode !== false; // 既定は bootstrap (安全側)

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
            {isBootstrap ? 'パスワードを入力してください' : 'メールアドレスとパスワードを入力してください'}
          </div>

          <Form method="post">
            {/* CSRF トークン（免疫系: 抗原マーカー） */}
            <input type="hidden" name="_csrf" value={loaderData?.csrfToken || ''} />

            {/* patch 0156: bootstrap モードでない時のみユーザー識別欄を表示 */}
            {/* patch 0170: メールアドレスを ID として優先 (input type=email) */}
            {!isBootstrap && (
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 700,
                  color: D.textDim,
                  letterSpacing: 2,
                  marginBottom: 8,
                }}>
                  EMAIL
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  autoFocus
                  autoComplete="username email"
                  placeholder="example@mining-base.co.jp"
                  inputMode="email"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
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
              </div>
            )}

            {/* 初期セットアップ表示 */}
            {isBootstrap && (
              <div style={{
                fontSize: 11,
                color: D.cyan,
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 8,
                background: `${D.cyan}10`,
                border: `1px solid ${D.cyan}30`,
                lineHeight: 1.5,
              }}>
                🔧 初期セットアップモード<br />
                <span style={{color: D.textMuted, fontSize: 10}}>
                  初回ログイン後、メンバー管理タブで個別ユーザーを作成してください
                </span>
              </div>
            )}

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
                  autoFocus={isBootstrap}
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
