/**
 * 404 Not Found — ブランド化エラーページ
 *
 * 免疫系: 存在しないURLへのアクセスに対する適切な応答
 * - ブランド体験を維持しつつ、ユーザーを正しいページへ誘導
 * - SEO: 明確な404ステータスで検索エンジンにも正しく伝達
 * - 将来の拡張: 類似URL提案、検索ボックス埋め込みなど
 */

import type {Route} from './+types/$';
import {Link} from 'react-router';
import {T} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const meta: Route.MetaFunction = () => [
  {title: 'ASTROMEDA | ページが見つかりません'},
  {name: 'robots', content: 'noindex'},
];

export async function loader({request}: Route.LoaderArgs) {
  throw new Response(`${new URL(request.url).pathname} not found`, {
    status: 404,
  });
}

export default function CatchAllPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: T.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
        color: T.tx,
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <div style={{maxWidth: 540}}>
        {/* 404グリッチ表現 */}
        <div
          style={{
            fontSize: 'clamp(5rem, 15vw, 10rem)',
            fontWeight: 900,
            lineHeight: 1,
            background: 'linear-gradient(135deg, #00F0FF 0%, #FF2D55 50%, #FFB300 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '1rem',
            letterSpacing: '-0.05em',
          }}
        >
          404
        </div>

        <h1
          style={{
            fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
            fontWeight: 700,
            margin: '0 0 1rem 0',
            color: '#fff',
          }}
        >
          ページが見つかりません
        </h1>

        <p
          style={{
            fontSize: '1rem',
            color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.7,
            margin: '0 0 2.5rem 0',
          }}
        >
          お探しのページは移動・削除されたか、
          <br />
          URLが間違っている可能性があります。
        </p>

        {/* ナビゲーションボタン */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.85rem 2rem',
              background: 'linear-gradient(135deg, #00F0FF, #00C4CC)',
              color: T.bg,
              textDecoration: 'none',
              borderRadius: '0.5rem',
              fontWeight: 700,
              fontSize: '0.95rem',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
          >
            トップページへ戻る
          </Link>

          <Link
            to="/collections"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.85rem 2rem',
              background: 'transparent',
              color: '#00F0FF',
              textDecoration: 'none',
              borderRadius: '0.5rem',
              fontWeight: 700,
              fontSize: '0.95rem',
              border: '1px solid rgba(0,240,255,0.3)',
              transition: 'border-color 0.2s',
            }}
          >
            コレクション一覧
          </Link>
        </div>

        {/* ブランドロゴ */}
        <div
          style={{
            marginTop: '4rem',
            opacity: 0.3,
            fontSize: '0.85rem',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
          }}
        >
          ASTROMEDA
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
