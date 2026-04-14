/**
 * CrossSell — IPコラボ横断提案コンポーネント
 *
 * 現在閲覧中の商品が属するIPコラボを特定し、
 * 同じカテゴリ（PC, パッド, パネル等）を持つ他のIPコラボを提案する。
 *
 * 表示: 横スクロールカード（バナー画像+IP名+カテゴリバッジ）
 * データソース: COLLABS（astromeda-data.ts）— Shopify APIコール不要
 */

import React, {useMemo} from 'react';
import {Link} from 'react-router';
import {COLLABS, type CollabItem, T, al} from '~/lib/astromeda-data';

interface CrossSellProps {
  /** 現在の商品タイトル（IP名マッチング用） */
  productTitle: string;
  /** 現在の商品タグ（IPマッチング補助） */
  productTags?: string[];
  /** 表示上限（デフォルト6） */
  limit?: number;
}

// カテゴリの日本語ラベル
const CAT_LABELS: Record<string, string> = {
  pc: 'PC',
  pad: 'マウスパッド',
  panel: 'パネル',
  case: 'PCケース',
  kb: 'キーボード',
  acrylic: 'アクスタ',
  keychain: 'アクキー',
  tshirt: 'Tシャツ',
  badge: '缶バッジ',
  metalcard: 'メタルカード',
};

/**
 * 商品タイトル/タグからどのIPコラボに属するか特定
 */
function detectCurrentIP(
  title: string,
  tags: string[],
): CollabItem | null {
  const lowerTitle = title.toLowerCase();
  const lowerTags = tags.map((t) => t.toLowerCase());

  for (const collab of COLLABS) {
    // IP名がタイトルに含まれるかチェック
    const nameParts = collab.name.split(/[\s/／・]+/);
    for (const part of nameParts) {
      if (part.length >= 2 && lowerTitle.includes(part.toLowerCase())) {
        return collab;
      }
    }
    // IDがタグに含まれるかチェック
    if (lowerTags.some((t) => t.includes(collab.id))) {
      return collab;
    }
    // shopハンドルがタグに含まれるかチェック
    if (lowerTags.some((t) => t.includes(collab.shop))) {
      return collab;
    }
  }
  return null;
}

/**
 * 関連IPを取得（カテゴリ重複度でスコアリング）
 */
function getRelatedIPs(
  currentIP: CollabItem | null,
  limit: number,
): CollabItem[] {
  if (!currentIP) {
    // IP特定できない場合はフィーチャーIPを返す
    return COLLABS.filter((c) => c.f === 1).slice(0, limit);
  }

  const currentCats = new Set(currentIP.cats.split(','));

  // スコア計算: カテゴリ重複数
  const scored = COLLABS.filter((c) => c.id !== currentIP.id).map((collab) => {
    const collabCats = collab.cats.split(',');
    const overlap = collabCats.filter((cat) => currentCats.has(cat)).length;
    // フィーチャーIPにボーナス
    const bonus = collab.f ? 1 : 0;
    return {collab, score: overlap + bonus};
  });

  // スコア降順ソート
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.collab);
}

function CrossSellComponent({
  productTitle,
  productTags = [],
  limit = 6,
}: CrossSellProps) {
  const currentIP = useMemo(
    () => detectCurrentIP(productTitle, productTags),
    [productTitle, productTags]
  );
  const related = useMemo(
    () => getRelatedIPs(currentIP, limit),
    [currentIP, limit]
  );

  if (related.length === 0) return null;

  return (
    <section
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '32px clamp(16px, 4vw, 48px)',
      }}
    >
      {/* Section header */}
      <div style={{marginBottom: 20}}>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: T.tx,
            margin: 0,
            letterSpacing: '0.02em',
          }}
        >
          {currentIP
            ? `${currentIP.name}が好きな方におすすめ`
            : 'おすすめIPコラボ'}
        </h2>
        <p
          style={{
            fontSize: 12,
            color: T.t5,
            margin: '4px 0 0',
          }}
        >
          他のIPコラボレーション商品もチェック
        </p>
      </div>

      {/* Horizontal scroll cards */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          paddingBottom: 8,
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
        className="cross-sell-scroll"
      >
        {related.map((collab) => {
          const cats = collab.cats.split(',').slice(0, 3);
          return (
            <Link
              key={collab.id}
              to={`/collections/${collab.shop}`}
              style={{
                flexShrink: 0,
                width: 220,
                scrollSnapAlign: 'start',
                textDecoration: 'none',
                color: T.tx,
              }}
            >
              <div
                style={{
                  background: T.bgC,
                  borderRadius: 14,
                  overflow: 'hidden',
                  border: `1px solid ${T.bd}`,
                  transition: 'border-color .2s, transform .2s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    collab.accent + '40';
                  (e.currentTarget as HTMLElement).style.transform =
                    'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = T.bd;
                  (e.currentTarget as HTMLElement).style.transform = 'none';
                }}
              >
                {/* Banner image */}
                <div
                  style={{
                    width: '100%',
                    height: 120,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {collab.banner ? (
                    <img
                      src={collab.banner + '?width=440&format=webp'}
                      alt={collab.name}
                      loading="lazy"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: `linear-gradient(135deg, ${collab.accent}22, ${collab.accent}44)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 28,
                        fontWeight: 800,
                        color: collab.accent,
                        opacity: 0.6,
                      }}
                    >
                      {collab.name.slice(0, 2)}
                    </div>
                  )}
                  {/* Tag badge */}
                  {collab.tag && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        background: collab.accent,
                        color: T.tx,
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 4,
                        letterSpacing: '0.05em',
                      }}
                    >
                      {collab.tag}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div style={{padding: '10px 12px'}}>
                  <h3
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      margin: 0,
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {collab.name}
                  </h3>
                  {/* Category badges */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 4,
                      flexWrap: 'wrap',
                      marginTop: 6,
                    }}
                  >
                    {cats.map((cat) => (
                      <span
                        key={cat}
                        style={{
                          fontSize: 9,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: T.bd,
                          color: al(T.tx, 0.6),
                          fontWeight: 500,
                        }}
                      >
                        {CAT_LABELS[cat] || cat}
                      </span>
                    ))}
                    {collab.cats.split(',').length > 3 && (
                      <span
                        style={{
                          fontSize: 9,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: T.bd,
                          color: T.t4,
                        }}
                      >
                        +{collab.cats.split(',').length - 3}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Hide scrollbar styling */}
      <style dangerouslySetInnerHTML={{__html: `
        .cross-sell-scroll::-webkit-scrollbar { height: 4px; }
        .cross-sell-scroll::-webkit-scrollbar-track { background: transparent; }
        .cross-sell-scroll::-webkit-scrollbar-thumb { background: ${al(T.tx, 0.1)}; border-radius: 2px; }
      `}} />
    </section>
  );
}

export const CrossSell = React.memo(CrossSellComponent);
CrossSell.displayName = 'CrossSell';
