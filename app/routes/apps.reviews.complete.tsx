/**
 * /apps/reviews/complete - レビュー投稿完了画面
 *
 * 投稿成功後の Thank you ページ。
 * Phase 3 / 2026-05-14
 */

export default function ReviewComplete() {
  return (
    <div style={{ maxWidth: 560, margin: '60px auto', padding: '60px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 60 }}>🎉</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '14px 0' }}>投稿ありがとうございました！</h1>
      <p style={{ fontSize: 14, color: '#6b7280', maxWidth: 480, margin: '0 auto', lineHeight: 1.7 }}>
        ご投稿いただいたレビューは ASTROMEDA 運営の承認を経て、
        <br />
        通常 1〜2 営業日以内に公開されます。
        <br />
        <br />
        ご協力ありがとうございました。
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
        <a
          href="/"
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            background: '#06060C',
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          ホームに戻る
        </a>
        <a
          href="/collections/collab-pc"
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            background: '#fff',
            color: '#06060C',
            border: '1px solid #06060C',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          他の商品を見る
        </a>
      </div>
    </div>
  );
}

export function meta() {
  return [{ title: 'レビュー投稿完了 | ASTROMEDA' }];
}
