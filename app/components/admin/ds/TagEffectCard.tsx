/**
 * TagEffectCard — patch 0134 P0
 *
 * CEO 指摘:「タグをつけることでどのように変更できるのかをリアルタイムビューで
 * 表現できていない、何をすればよいのかわからない」を受けた効果説明カード。
 *
 * 1 タグを受け取って:
 *   - 「これは何のタグか」(カテゴリ絵文字 + ラベル)
 *   - 「付けると何が起きるか」(高校生向け 1-2 行)
 *   - 「どこに反映されるか」(storefront URL リンク)
 *   - 「触っても安全か」(警告文・該当時のみ)
 *
 * AdminBulkTags / AdminCustomization / AdminProducts (TagPicker) の周辺で
 * タグを選択した瞬間にこのカードを表示し、リアルタイム影響プレビューを実現する。
 */

import {color, font, radius, space} from '~/lib/design-tokens';
import {classifyTag, TAG_CATEGORY_META, type TagCategory} from '~/lib/tag-classifier';

interface TagEffectCardProps {
  /** 解析対象のタグ名 */
  tag: string;
  /** このタグが付いている商品数 (livecount表示用・任意) */
  productCount?: number;
  /** カードサイズ (compact: 1 行サマリ・default: フル説明) */
  size?: 'compact' | 'default';
  /** クリック時のコールバック (タグ削除 UI 等で使う) */
  onRemove?: (tag: string) => void;
}

/** カテゴリ別アクセントカラー (UI 識別用) */
const CATEGORY_COLOR: Record<TagCategory, string> = {
  ip: '#a78bfa', // 紫 (Anime/IP)
  spec: '#22d3ee', // シアン (PC スペック)
  color: '#fb923c', // オレンジ (カラー)
  productType: '#34d399', // 緑 (商品ジャンル)
  pulldown: '#fbbf24', // 黄 (プルダウン部品 = 注意)
  campaign: '#f87171', // 赤 (キャンペーン = 注目)
  system: '#9ca3af', // グレー (システム = 触らない)
  other: '#94a3b8', // スレート (その他)
};

export function TagEffectCard({tag, productCount, size = 'default', onRemove}: TagEffectCardProps) {
  const info = classifyTag(tag);
  const accent = CATEGORY_COLOR[info.category];
  const meta = TAG_CATEGORY_META[info.category];

  if (size === 'compact') {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          background: color.bg1,
          border: `1px solid ${accent}55`,
          borderLeft: `3px solid ${accent}`,
          borderRadius: radius.md,
          fontSize: font.xs,
          color: color.text,
          fontFamily: font.family,
        }}
        title={info.effect}
      >
        <span aria-hidden style={{fontSize: 14}}>{info.icon}</span>
        <code style={{fontFamily: 'monospace', color: accent, fontWeight: 600}}>{tag}</code>
        <span style={{color: color.textMuted}}>{meta.label}</span>
        {typeof productCount === 'number' && (
          <span style={{color: color.textMuted}}>· {productCount}件</span>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(tag)}
            aria-label={`${tag} を外す`}
            style={{
              marginLeft: 4,
              padding: '0 4px',
              background: 'transparent',
              border: 'none',
              color: color.textMuted,
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>
    );
  }

  // default size: フル説明カード
  return (
    <article
      role="region"
      aria-label={`${tag} タグの説明`}
      style={{
        background: color.bg1,
        border: `1px solid ${color.border}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: radius.md,
        padding: space[3],
        fontFamily: font.family,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}
      >
        <span aria-hidden style={{fontSize: 18}}>{info.icon}</span>
        <code
          style={{
            fontFamily: 'monospace',
            fontSize: 14,
            color: accent,
            fontWeight: 700,
            background: `${accent}15`,
            padding: '2px 8px',
            borderRadius: radius.sm,
          }}
        >
          {tag}
        </code>
        <span
          style={{
            fontSize: 11,
            color: accent,
            background: `${accent}15`,
            padding: '2px 8px',
            borderRadius: 999,
            fontWeight: 600,
          }}
        >
          {meta.label}
        </span>
        {typeof productCount === 'number' && (
          <span style={{fontSize: 11, color: color.textMuted}}>
            この商品 <strong style={{color: color.text}}>{productCount}</strong> 件に付いています
          </span>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(tag)}
            aria-label={`${tag} を選択から外す`}
            style={{
              marginLeft: 'auto',
              padding: '2px 8px',
              background: 'transparent',
              border: `1px solid ${color.border}`,
              borderRadius: radius.sm,
              color: color.textMuted,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: font.family,
            }}
          >
            外す
          </button>
        )}
      </header>

      <p
        style={{
          margin: 0,
          fontSize: font.sm,
          color: color.text,
          lineHeight: 1.6,
        }}
      >
        <strong style={{color: accent}}>このタグを付けると:</strong> {info.effect}
      </p>

      {info.whereVisible.length > 0 && (
        <div style={{marginTop: 8}}>
          <div
            style={{
              fontSize: font.xs,
              color: color.textMuted,
              marginBottom: 4,
              fontWeight: 600,
            }}
          >
            お客様に見える場所:
          </div>
          <ul
            style={{
              margin: 0,
              padding: '0 0 0 16px',
              fontSize: font.xs,
              color: color.text,
              lineHeight: 1.6,
            }}
          >
            {info.whereVisible.map((w, i) => (
              <li key={i}>
                <a
                  href={w.url}
                  target={w.url.startsWith('http') || w.url.startsWith('/') ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  style={{color: color.cyan, textDecoration: 'none'}}
                >
                  {w.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {info.warning && (
        <div
          role="note"
          style={{
            marginTop: 8,
            padding: '6px 10px',
            background: '#fbbf2415',
            border: '1px solid #fbbf2444',
            borderRadius: radius.sm,
            fontSize: font.xs,
            color: '#fbbf24',
            lineHeight: 1.5,
          }}
        >
          {info.warning}
        </div>
      )}

      <footer
        style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: `1px dashed ${color.border}`,
          fontSize: 11,
          color: color.textMuted,
          lineHeight: 1.4,
        }}
      >
        <strong>カテゴリの説明:</strong> {meta.categoryDescription}
      </footer>
    </article>
  );
}

export default TagEffectCard;
