/**
 * RouteErrorBoundary — Astromedaブランド統一エラー画面
 * 各ルートの export function ErrorBoundary で使用
 *
 * 医学メタファー: 免疫系（Immune System）
 * ルート単位でエラーを隔離し、アプリ全体のクラッシュを防止。
 * AppError（RFC 7807）に対応し、エラーカテゴリに応じた
 * 適切なUIフィードバックを提供する。
 *
 * B-019: AppError統合 — エラーの分類・トリアージをUIに反映
 */
import {isRouteErrorResponse, useRouteError, Link} from 'react-router';
import {T, al} from '~/lib/astromeda-data';
import {AppError} from '~/lib/app-error';

/**
 * エラーカテゴリ別の表示情報
 * 予防医学的アプローチ: エラーが再発しないようユーザーに適切な行動を案内
 */
const ERROR_UI_MAP: Record<string, {icon: string; action: string}> = {
  NOT_FOUND: {icon: '🔍', action: '検索またはトップページからお探しのページをお探しください。'},
  AUTHENTICATION: {icon: '🔐', action: 'ログインしてから再度アクセスしてください。'},
  AUTHORIZATION: {icon: '🚫', action: '管理者にアクセス権限を確認してください。'},
  VALIDATION: {icon: '📝', action: '入力内容を確認して再度お試しください。'},
  EXTERNAL_API: {icon: '🔄', action: 'しばらく時間をおいてから再度お試しください。'},
  RATE_LIMIT: {icon: '⏳', action: 'しばらく時間をおいてから再度お試しください。'},
  TIMEOUT: {icon: '⏱️', action: 'しばらく時間をおいてから再度お試しください。'},
  INTERNAL: {icon: '⚠️', action: '問題が続く場合はお問い合わせください。'},
  CONFIGURATION: {icon: '⚙️', action: '管理者にお問い合わせください。'},
  CONFLICT: {icon: '🔀', action: 'ページを更新して再度お試しください。'},
};

/**
 * エラーからUI表示情報を抽出
 * 既存の throw new Response + 新しい AppError の両方をサポート
 */
function extractErrorInfo(error: unknown): {
  status: number;
  title: string;
  message: string;
  category: string;
  icon: string;
  action: string;
} {
  // AppError（RFC 7807対応）
  if (AppError.isAppError(error)) {
    const ui = ERROR_UI_MAP[error.category] ?? ERROR_UI_MAP.INTERNAL;
    return {
      status: error.status,
      title: error.title,
      message: error.detail,
      category: error.category,
      icon: ui.icon,
      action: ui.action,
    };
  }

  // React Router の ErrorResponse（既存パターン互換）
  if (isRouteErrorResponse(error)) {
    const status = error.status;
    if (status === 404) {
      const ui = ERROR_UI_MAP.NOT_FOUND;
      return {
        status: 404,
        title: 'ページが見つかりません',
        message: 'お探しのページは存在しないか、移動した可能性があります。',
        category: 'NOT_FOUND',
        icon: ui.icon,
        action: ui.action,
      };
    }
    if (status === 403) {
      const ui = ERROR_UI_MAP.AUTHORIZATION;
      return {
        status: 403,
        title: 'アクセスが拒否されました',
        message: 'このページへのアクセス権限がありません。',
        category: 'AUTHORIZATION',
        icon: ui.icon,
        action: ui.action,
      };
    }
    if (status === 401) {
      const ui = ERROR_UI_MAP.AUTHENTICATION;
      return {
        status: 401,
        title: '認証が必要です',
        message: 'ログインしてからアクセスしてください。',
        category: 'AUTHENTICATION',
        icon: ui.icon,
        action: ui.action,
      };
    }

    // AppErrorのtoResponse()で生成されたProblemDetails JSONを検出
    let parsedDetail: string | undefined;
    if (typeof error.data === 'string') {
      try {
        const pd = JSON.parse(error.data);
        if (pd.type && pd.detail) {
          const ui = ERROR_UI_MAP[pd.category] ?? ERROR_UI_MAP.INTERNAL;
          return {
            status: pd.status ?? status,
            title: pd.title ?? 'エラーが発生しました',
            message: pd.detail,
            category: pd.category ?? 'INTERNAL',
            icon: ui.icon,
            action: ui.action,
          };
        }
      } catch {
        parsedDetail = error.data;
      }
    }

    const ui = ERROR_UI_MAP.INTERNAL;
    return {
      status,
      title: 'エラーが発生しました',
      message: parsedDetail ?? error.data?.message ?? 'サーバーエラーが発生しました。',
      category: 'INTERNAL',
      icon: ui.icon,
      action: ui.action,
    };
  }

  // 標準 Error
  if (error instanceof Error) {
    const ui = ERROR_UI_MAP.INTERNAL;
    return {
      status: 500,
      title: 'エラーが発生しました',
      message: error.message,
      category: 'INTERNAL',
      icon: ui.icon,
      action: ui.action,
    };
  }

  // 不明なエラー
  const ui = ERROR_UI_MAP.INTERNAL;
  return {
    status: 500,
    title: 'エラーが発生しました',
    message: '予期しないエラーが発生しました。',
    category: 'INTERNAL',
    icon: ui.icon,
    action: ui.action,
  };
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  const {status, title, message, icon, action} = extractErrorInfo(error);

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: T.bg,
        color: T.tx,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: '4rem',
          fontWeight: 900,
          background: `linear-gradient(135deg, ${T.c}, ${T.g})`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '0.5rem',
        }}
      >
        {status}
      </div>
      <h1
        style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          marginBottom: '0.5rem',
          color: T.tx,
        }}
      >
        {icon} {title}
      </h1>
      <p
        style={{
          color: al(T.tx, 0.7),
          maxWidth: '480px',
          lineHeight: 1.6,
          marginBottom: '0.5rem',
        }}
      >
        {message}
      </p>
      <p
        style={{
          color: al(T.tx, 0.5),
          fontSize: '0.875rem',
          maxWidth: '480px',
          lineHeight: 1.6,
          marginBottom: '2rem',
        }}
      >
        {action}
      </p>
      <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center'}}>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            background: `linear-gradient(135deg, ${T.c}, ${T.g})`,
            color: T.bg,
            borderRadius: '8px',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          トップページへ
        </Link>
        <Link
          to="/collections"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            border: `1px solid ${T.bd}`,
            color: T.tx,
            borderRadius: '8px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          コレクション一覧
        </Link>
      </div>
    </div>
  );
}
