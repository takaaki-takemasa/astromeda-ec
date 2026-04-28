/**
 * ProductContentSection — 商品個別ページ下段の説明セクション (patch 0192)
 *
 * 旧サイト https://shop.mining-base.co.jp/products/pc-lovelive-nijigasaki-ueharaayumu-amd-entry の
 * Y=4127〜10000 範囲 (信頼できるメーカー品 / 360mm水冷 / 強化サイドガラス / 限定特典 等) を
 * 新サイトでも再現するための component。
 *
 * 設計:
 *   - astromeda_product_content Metaobject を fetch (loader 側で実施済)
 *   - 商品の tags に target_tag が含まれる content のみ表示
 *   - display_order 昇順
 *   - 各 content は { heading, content_html, image_url } で構成
 */
import {sanitizeHtml} from '~/lib/sanitize-html';

export interface ProductContentItem {
  id: string;
  targetTag: string;
  heading: string;
  contentHtml: string;
  imageUrl: string;
  displayOrder: number;
  isActive: boolean;
}

export function ProductContentSection({contents}: {contents: ProductContentItem[]}) {
  if (!contents || contents.length === 0) return null;
  const active = contents.filter((c) => c.isActive).sort((a, b) => a.displayOrder - b.displayOrder);
  if (active.length === 0) return null;
  return (
    <section
      data-product-content
      style={{
        padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 48px)',
        maxWidth: 1200,
        margin: '0 auto',
      }}
    >
      {active.map((c) => (
        <article
          key={c.id}
          style={{
            marginBottom: 'clamp(40px, 6vw, 72px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(16px, 2vw, 24px)',
          }}
        >
          {c.imageUrl && (
            <img
              src={c.imageUrl}
              alt={c.heading || ''}
              loading="lazy"
              style={{width: '100%', height: 'auto', borderRadius: 12, display: 'block'}}
            />
          )}
          {c.heading && (
            <h2
              style={{
                fontSize: 'clamp(20px, 2.6vw, 32px)',
                fontWeight: 900,
                lineHeight: 1.4,
                margin: 0,
              }}
            >
              {c.heading}
            </h2>
          )}
          {c.contentHtml && (
            <div
              style={{fontSize: 'clamp(14px, 1.4vw, 16px)', lineHeight: 1.8, opacity: 0.85}}
              dangerouslySetInnerHTML={{__html: sanitizeHtml(c.contentHtml)}}
            />
          )}
        </article>
      ))}
    </section>
  );
}
