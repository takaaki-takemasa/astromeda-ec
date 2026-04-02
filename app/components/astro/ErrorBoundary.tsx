import {Link} from 'react-router';

interface AstroErrorBoundaryProps {
  statusCode?: number;
  message?: string;
}

export function AstroErrorBoundary({
  statusCode = 500,
  message,
}: AstroErrorBoundaryProps) {
  const is404 = statusCode === 404;

  return (
    <div
      style={{
        background: '#06060C',
        minHeight: '100vh',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', 'Noto Sans JP', system-ui, sans-serif",
        padding: '48px 24px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 'clamp(80px, 20vw, 160px)',
          fontWeight: 700,
          background: is404
            ? 'linear-gradient(135deg, #00F0FF, #00C4CC)'
            : 'linear-gradient(135deg, #FF2D55, #FF8C00)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          lineHeight: 1,
          marginBottom: 24,
          fontFamily: "'Orbitron', sans-serif",
        }}
      >
        {statusCode}
      </div>
      <h1
        style={{
          fontSize: 'clamp(20px, 4vw, 32px)',
          fontWeight: 700,
          color: '#fff',
          marginBottom: 12,
        }}
      >
        {is404 ? 'ページが見つかりません' : 'エラーが発生しました'}
      </h1>
      <p
        style={{
          fontSize: 16,
          color: 'rgba(255,255,255,.5)',
          marginBottom: 32,
          maxWidth: 480,
          lineHeight: 1.7,
        }}
      >
        {is404
          ? 'お探しのページは存在しないか、移動した可能性があります。'
          : message || 'サーバーでエラーが発生しました。しばらく経ってからお試しください。'}
      </p>
      <Link
        to="/"
        style={{
          display: 'inline-block',
          padding: '14px 40px',
          background: 'linear-gradient(135deg, #00F0FF, #00C4CC)',
          color: '#000',
          borderRadius: 14,
          textDecoration: 'none',
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: 0.5,
        }}
      >
        トップへ戻る
      </Link>
    </div>
  );
}
