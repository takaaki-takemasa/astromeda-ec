/**
 * TagDefinitionCard — patch 0142 P0
 *
 * CEO 指摘 (2回目):
 *   「もう一度聞く、タグとはなに」
 *
 * patch 0134-0140 でタグ機能を実装してきたが、「タグとは何か」を 1 行で
 * 定義する UI 要素が無かった (TabHeaderHint の description で間接的に書くのみ)。
 *
 * このプリミティブは「タグ」と「ジャンル (コレクション)」の関係を 1 つの
 * ピクトグラムで示す:
 *
 *   📌 タグ = 商品に貼る目印 (シール)
 *
 *   📦 商品 + 🏷️ タグ  →  📚 ジャンル に自動で振り分け
 *
 * 全タグ操作画面 (AdminBulkTags / 商品編集 / プルダウン管理) の冒頭に置く。
 */

import {Link} from 'react-router';
import {color, font, radius, space} from '~/lib/design-tokens';

export function TagDefinitionCard() {
  return (
    <section
      role="region"
      aria-label="タグの定義"
      style={{
        marginBottom: space[3],
        padding: '12px 16px',
        background: color.bg0,
        border: `1px dashed ${color.cyan}`,
        borderRadius: radius.lg,
        fontFamily: font.family,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      {/* 定義部分 */}
      <div style={{flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8}}>
        <span aria-hidden style={{fontSize: 26}}>📌</span>
        <div>
          <div style={{fontSize: 13, fontWeight: 800, color: color.cyan, lineHeight: 1.2}}>
            タグとは
          </div>
          <div style={{fontSize: 13, fontWeight: 700, color: color.text, lineHeight: 1.3}}>
            ストア表示の司令塔
          </div>
        </div>
      </div>

      {/* 関係図解: 🏷️ → 4 配線先 */}
      <div
        aria-hidden
        style={{
          flex: '1 1 360px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '8px 12px',
          background: color.bg1,
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
          fontSize: 12,
          color: color.text,
          fontWeight: 600,
          flexWrap: 'wrap',
        }}
      >
        <span style={{fontSize: 22}}>🏷️</span>
        <span style={{fontSize: 16, color: color.cyan, fontWeight: 900}}>→</span>
        <span style={{padding: '2px 8px', background: '#a78bfa20', borderRadius: 999, color: '#a78bfa'}}>🎬 IPバナー</span>
        <span style={{padding: '2px 8px', background: '#22d3ee20', borderRadius: 999, color: '#22d3ee'}}>💻 上部タブ</span>
        <span style={{padding: '2px 8px', background: '#34d39920', borderRadius: 999, color: '#34d399'}}>📁 中分類</span>
        <span style={{padding: '2px 8px', background: '#fb923c20', borderRadius: 999, color: '#fb923c'}}>📚 ジャンル</span>
      </div>

      {/* ジャンル管理タブへのリンク */}
      <Link
        to="/admin?tab=collections"
        style={{
          flex: '0 0 auto',
          padding: '6px 12px',
          background: 'transparent',
          border: `1px solid ${color.cyan}`,
          borderRadius: radius.md,
          color: color.cyan,
          fontSize: 12,
          fontWeight: 700,
          textDecoration: 'none',
          fontFamily: font.family,
          whiteSpace: 'nowrap',
        }}
      >
        ジャンル管理 →
      </Link>
    </section>
  );
}

export default TagDefinitionCard;
