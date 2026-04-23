/**
 * TagWorkflowGuide — patch 0136 P0 (rev 2)
 *
 * CEO 指摘:
 *   「説明ではなく、明確にUI上で何が違い、どうすればよいのかを視覚的に区分けして
 *    わかるようにしてください。テキストの説明を長くするのは絶対にやめてください」
 *
 * テキストを排除してピクトグラムだけで「1 商品 vs 複数商品」を伝える。
 * 中央の矢印で「今どっちにいるか」だけを示す。
 *
 * Visual:
 *   ┌──────────┐                 ┌────────────────┐
 *   │  🎯      │                 │  🚀            │
 *   │  📦      │  ← 一括編集      │  📦📦📦         │
 *   │  └ 🏷    │   へ            │   └ 🏷  一斉   │
 *   │          │                 │                │
 *   │ 個別     │ 〔いまここ〕     │ 一括           │
 *   └──────────┘                 └────────────────┘
 *
 * テキストは「個別」「一括」のラベル + 「いまここ」マーカー + クリック CTA だけ。
 */

import {Link} from 'react-router';
import {color, font, radius, space} from '~/lib/design-tokens';

interface TagWorkflowGuideProps {
  highlight: 'individual' | 'bulk';
}

export function TagWorkflowGuide({highlight}: TagWorkflowGuideProps) {
  const isIndividual = highlight === 'individual';

  /** カード共通スタイル */
  const cardBase: React.CSSProperties = {
    flex: 1,
    minWidth: 180,
    padding: '14px 16px',
    borderRadius: radius.lg,
    background: color.bg1,
    border: `2px solid ${color.border}`,
    fontFamily: font.family,
    textAlign: 'center',
    position: 'relative',
    transition: 'all .15s',
  };

  /** ハイライト = 現在地 */
  const cardHere: React.CSSProperties = {
    ...cardBase,
    border: `2px solid ${color.cyan}`,
    background: `${color.cyan}10`,
    boxShadow: `0 0 0 4px ${color.cyan}1f`,
  };

  /** 反対側カード = ホバーで反応 */
  const cardClickable: React.CSSProperties = {
    ...cardBase,
    cursor: 'pointer',
    textDecoration: 'none',
    color: 'inherit',
  };

  const labelText: React.CSSProperties = {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: color.text,
    letterSpacing: 1,
  };

  const hereBadge: React.CSSProperties = {
    position: 'absolute',
    top: -10,
    left: '50%',
    transform: 'translateX(-50%)',
    background: color.cyan,
    color: color.bg0,
    padding: '2px 12px',
    fontSize: 11,
    fontWeight: 800,
    borderRadius: 999,
    whiteSpace: 'nowrap',
  };

  /** 商品ピクトグラム共通 */
  const pictWrap: React.CSSProperties = {
    fontSize: 32,
    lineHeight: 1,
    marginBottom: 6,
    display: 'flex',
    justifyContent: 'center',
    gap: 4,
    minHeight: 48,
    alignItems: 'center',
  };

  /** 個別カード = 商品 1 つ + タグ 1 つ */
  const individualPict = (
    <div style={pictWrap}>
      <span aria-hidden>📦</span>
      <span aria-hidden style={{fontSize: 16, marginLeft: -4, marginTop: 16}}>🏷️</span>
    </div>
  );

  /** 一括カード = 商品 3 つ + タグが上から降ってくる */
  const bulkPict = (
    <div style={pictWrap}>
      <span aria-hidden style={{fontSize: 22}}>🏷️</span>
      <span aria-hidden style={{fontSize: 14, color: color.cyan, fontWeight: 900}}>↓</span>
      <span aria-hidden style={{fontSize: 22}}>📦📦📦</span>
    </div>
  );

  return (
    <section
      role="region"
      aria-label="タグ編集の使い分け"
      style={{
        marginBottom: space[3],
        padding: space[2],
        background: color.bg0,
        border: `1px dashed ${color.border}`,
        borderRadius: radius.lg,
        fontFamily: font.family,
      }}
    >
      <div style={{display: 'flex', gap: 10, alignItems: 'stretch'}}>
        {/* 個別カード */}
        {isIndividual ? (
          <div style={cardHere} aria-current="page">
            <span style={hereBadge}>いまここ</span>
            {individualPict}
            <p style={labelText}>個別</p>
            <p style={{margin: '2px 0 0', fontSize: 11, color: color.textMuted}}>1商品ずつ</p>
          </div>
        ) : (
          <Link to="/admin?tab=products" style={cardClickable} aria-label="個別 (1商品ずつ) 編集に行く">
            {individualPict}
            <p style={labelText}>個別</p>
            <p style={{margin: '2px 0 0', fontSize: 11, color: color.cyan, fontWeight: 700}}>＋ ここに行く</p>
          </Link>
        )}

        {/* 中央の判断矢印 */}
        <div
          aria-hidden
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            color: color.textMuted,
            fontSize: 18,
            minWidth: 32,
          }}
        >
          <span>vs</span>
        </div>

        {/* 一括カード */}
        {!isIndividual ? (
          <div style={cardHere} aria-current="page">
            <span style={hereBadge}>いまここ</span>
            {bulkPict}
            <p style={labelText}>一括</p>
            <p style={{margin: '2px 0 0', fontSize: 11, color: color.textMuted}}>複数商品まとめて</p>
          </div>
        ) : (
          <Link to="/admin?tab=bulkTags" style={cardClickable} aria-label="一括 (複数商品まとめて) 編集に行く">
            {bulkPict}
            <p style={labelText}>一括</p>
            <p style={{margin: '2px 0 0', fontSize: 11, color: color.cyan, fontWeight: 700}}>＋ ここに行く</p>
          </Link>
        )}
      </div>
    </section>
  );
}

export default TagWorkflowGuide;
