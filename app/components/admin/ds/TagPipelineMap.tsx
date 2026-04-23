/**
 * TagPipelineMap — patch 0143 P0
 *
 * CEO 指令:
 *   「タグマネジメントで様々な管理が明確にできるようになる」
 *
 * 1 タグまたは複数タグを受け取って「ストアの どこ ↔ どこ ↔ どこ に出るか」を
 * パイプライン図で視覚化する。タグを「ただのフラグ」ではなく
 * 「ストアフロント表示の司令塔」として可視化する核プリミティブ。
 *
 * ## 表示構成
 *   左: 🏷️ タグチップ (実際のタグ名)
 *   →
 *   右: storefront 配線先カード (複数枚・各 storefront URL リンク)
 *
 * 各カードは [icon] [label] [→ 開く] の構造で、クリックすると新タブで
 * 該当 storefront ページを開く。
 */

import {color, font, radius, space} from '~/lib/design-tokens';
import {getTagStorefrontPipeline, aggregateStorefrontTargets, type StorefrontTarget} from '~/lib/tag-storefront-map';

interface TagPipelineMapProps {
  /** 1 タグ専用モード (詳細展開) or 複数タグ集約モード */
  tag?: string;
  tags?: string[];
  /** コンパクト表示 (chip 並び) or 詳細表示 (各 target カード) */
  compact?: boolean;
}

const KIND_COLOR: Record<StorefrontTarget['kind'], string> = {
  'home-banner': '#a78bfa', // 紫 = トップページ
  'top-tab': '#22d3ee', // シアン = 上部タブ
  'sub-category': '#34d399', // 緑 = 中分類
  'collection-page': '#fb923c', // オレンジ = コレクションページ
  campaign: '#f87171', // 赤 = キャンペーン
  menu: '#fbbf24', // 黄 = メニュー
  hidden: '#9ca3af', // グレー = 隠し
  system: '#6b7280', // 暗グレー = システム
};

export function TagPipelineMap({tag, tags, compact = false}: TagPipelineMapProps) {
  const targets: StorefrontTarget[] = tag
    ? getTagStorefrontPipeline(tag)
    : tags
      ? aggregateStorefrontTargets(tags)
      : [];

  if (targets.length === 0) return null;

  // compact mode: 1 行 chip 並び
  if (compact) {
    return (
      <div
        role="region"
        aria-label="ストアフロント配線先"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          fontFamily: font.family,
          marginTop: 6,
        }}
      >
        <span style={{fontSize: 11, color: color.textMuted, alignSelf: 'center'}}>
          🌐 反映先 ({targets.length}):
        </span>
        {targets.map((t, i) => {
          const accent = KIND_COLOR[t.kind];
          return (
            <a
              key={i}
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '3px 10px',
                background: `${accent}15`,
                border: `1px solid ${accent}55`,
                borderRadius: 999,
                color: color.text,
                fontSize: 11,
                fontWeight: 600,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {t.icon} {t.label}
            </a>
          );
        })}
      </div>
    );
  }

  // 詳細モード: パイプライン図
  return (
    <section
      role="region"
      aria-label={tag ? `${tag} のストアフロント配線図` : 'タグ集約配線図'}
      style={{
        marginTop: space[2],
        padding: space[3],
        background: color.bg0,
        border: `1px solid ${color.border}`,
        borderLeft: `3px solid ${color.cyan}`,
        borderRadius: radius.md,
        fontFamily: font.family,
      }}
    >
      <header style={{marginBottom: 10}}>
        <h4 style={{margin: 0, fontSize: 13, fontWeight: 700, color: color.cyan}}>
          🌐 ストアフロント配線 — このタグが反映される {targets.length} 箇所
        </h4>
        <p style={{margin: '2px 0 0', fontSize: 11, color: color.textMuted}}>
          各カードをクリックすると、お客様が見る画面が新しいタブで開きます。
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 8,
        }}
      >
        {targets.map((t, i) => {
          const accent = KIND_COLOR[t.kind];
          return (
            <a
              key={i}
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                background: color.bg1,
                border: `1px solid ${accent}55`,
                borderLeft: `3px solid ${accent}`,
                borderRadius: radius.sm,
                color: color.text,
                fontSize: 12,
                textDecoration: 'none',
                fontFamily: font.family,
              }}
            >
              <span aria-hidden style={{fontSize: 18}}>{t.icon}</span>
              <span style={{flex: 1, fontWeight: 600, lineHeight: 1.3}}>{t.label}</span>
              <span aria-hidden style={{color: accent, fontSize: 14, fontWeight: 700}}>↗</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

export default TagPipelineMap;
