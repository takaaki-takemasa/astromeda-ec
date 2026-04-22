/**
 * Product card component for collection pages
 * Extracted from app/routes/collections.$handle.tsx
 */

import {Link} from 'react-router';
import {Image} from '@shopify/hydrogen';
import {al, T} from '~/lib/astromeda-data';
import {extractSpec, extractHardwareSpec} from '~/lib/collection-helpers';
import {trackSelectItem} from '~/lib/ga4-ecommerce';

export type CollectionProduct = {
  id: string;
  handle: string;
  title: string;
  tags?: string[];
  productType?: string; // patch 0103: プルダウン項目判定に必要
  featuredImage?: {id: string; altText?: string; url: string; width?: number; height?: number};
  priceRange?: {minVariantPrice?: {amount?: string; currencyCode?: string}};
  variants?: {nodes?: Array<{availableForSale: boolean; selectedOptions?: Array<{name: string; value: string}>}>};
};

export function AstroProductItem({product, accent, loading}: {product: CollectionProduct; accent: string; loading?: 'eager' | 'lazy'}) {
  const tags: string[] = product.tags ?? [];
  const firstVariant = product.variants?.nodes?.[0];
  const available = firstVariant?.availableForSale !== false;
  // patch 0014: タグに CPU:/GPU: が無い商品でもタイトルから抽出して chip 表示
  const gpu = extractHardwareSpec(product.title, tags, 'GPU');
  const cpu = extractHardwareSpec(product.title, tags, 'CPU');
  const ram = extractSpec(tags, 'RAM');
  const hasSpec = gpu || cpu || ram;

  return (
    <Link to={`/products/${product.handle}`} className="astro-product-card" style={{textDecoration: 'none', position: 'relative'}} onClick={() => { try { trackSelectItem('collection', { id: product.id, title: product.title, price: product.priceRange?.minVariantPrice?.amount }); } catch { /* GA4 failure must not block navigation */ } }}>
      {!available && (
        <div style={{position: 'absolute', top: 8, left: 8, zIndex: 2, fontSize: 9, fontWeight: 900, padding: '3px 8px', borderRadius: 4, background: 'rgba(0,0,0,.7)', color: '#aaa', letterSpacing: 1}}>在庫なし</div>
      )}
      {product.featuredImage ? (
        <div style={{aspectRatio: '4/3', overflow: 'hidden', background: al(accent, 0.05)}}>
          <Image data={product.featuredImage} alt={product.featuredImage?.altText || product.title} loading={loading} sizes="(min-width: 768px) 25vw, 50vw" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        </div>
      ) : (
        <div style={{aspectRatio: '4/3', background: `linear-gradient(135deg, ${al(accent, 0.1)}, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.t3, fontSize: 11}}>No Image</div>
      )}
      <div style={{padding: '10px 0'}}>
        <h3 style={{fontSize: 'clamp(10px, 1.2vw, 13px)', fontWeight: 700, color: T.tx, lineHeight: 1.4, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden'}}>{product.title}</h3>
        {hasSpec && (
          <div style={{display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4}}>
            {gpu && <span style={{fontSize: 8, background: al(T.c, 0.1), color: T.c, padding: '1px 5px', borderRadius: 3}}>{gpu}</span>}
            {cpu && <span style={{fontSize: 8, background: al(T.g, 0.1), color: T.g, padding: '1px 5px', borderRadius: 3}}>{cpu}</span>}
            {ram && <span style={{fontSize: 8, background: al('#a855f7', 0.1), color: '#a855f7', padding: '1px 5px', borderRadius: 3}}>{ram}</span>}
          </div>
        )}
        <div style={{marginTop: 6}}>
          <span style={{fontSize: 'clamp(12px, 1.4vw, 16px)', fontWeight: 900, color: T.c}}>
            {product.priceRange?.minVariantPrice?.amount !== '0.0' ? `¥${Number(product.priceRange?.minVariantPrice?.amount).toLocaleString()}` : '価格はお問い合わせ'}
          </span>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        .astro-product-card { background: ${T.bgC}; border-radius: 10px; overflow: hidden; border: 1px solid ${T.t1}; transition: transform .2s, border-color .2s; }
        .astro-product-card:hover { transform: translateY(-3px); border-color: ${al(accent, 0.3)}; }
      `}} />
    </Link>
  );
}
