/**
 * CMS Loader — 全 Metaobject セクションの一括取得ヘルパー
 *
 * _index.tsx や root.tsx の loader で使用。
 * Admin API 経由で全 CMS Metaobject を並列取得し、
 * フロントエンド表示用に整形して返す。
 */

import type {MetaCollab} from '~/components/astro/CollabGrid';
import type {MetaBanner} from '~/components/astro/HeroSlider';
import type {MetaColorModel} from '~/components/astro/PCShowcase';

export interface CMSData {
  metaCollabs: MetaCollab[];
  metaBanners: MetaBanner[];
  metaColors: MetaColorModel[];
  metaCategoryCards: MetaCategoryCard[];
  metaProductShelves: MetaProductShelf[];
  metaAboutSections: MetaAboutSection[];
  metaFooterConfigs: MetaFooterConfig[];
}

export interface MetaCategoryCard {
  id: string;
  handle: string;
  title: string;
  description: string | null;
  priceFrom: number | null;
  image: string | null;
  linkUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface MetaProductShelf {
  id: string;
  handle: string;
  title: string;
  subtitle: string;
  productIds: string[];
  limit: number;
  sortKey: 'manual' | 'best_selling' | 'newest';
  sortOrder: number;
  isActive: boolean;
}

export interface MetaAboutSection {
  id: string;
  handle: string;
  title: string;
  bodyHtml: string;
  image: string | null;
  linkUrl: string;
  linkLabel: string;
  isActive: boolean;
}

export interface MetaFooterConfig {
  id: string;
  handle: string;
  sectionTitle: string;
  links: Array<{label: string; url: string}>;
  sortOrder: number;
  isActive: boolean;
}

type MetaobjectRaw = {id: string; handle: string; fields: Array<{key: string; value: string}>};

function fieldsToMap(fields: Array<{key: string; value: string}>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of fields) m[f.key] = f.value;
  return m;
}

/**
 * Admin API クライアントを使って全 CMS Metaobject を並列取得
 */
export async function loadAllCMSData(
  adminClient: {getMetaobjects: (type: string, first: number) => Promise<MetaobjectRaw[]>} | null,
): Promise<CMSData> {
  const empty: CMSData = {
    metaCollabs: [],
    metaBanners: [],
    metaColors: [],
    metaCategoryCards: [],
    metaProductShelves: [],
    metaAboutSections: [],
    metaFooterConfigs: [],
  };

  if (!adminClient) return empty;

  const emptyArr = (): Promise<MetaobjectRaw[]> => Promise.resolve([]);
  const safe = (p: Promise<MetaobjectRaw[]>) => p.catch(() => [] as MetaobjectRaw[]);

  const [collabsRaw, bannersRaw, colorsRaw, cardsRaw, shelvesRaw, aboutRaw, footerRaw] = await Promise.all([
    safe(adminClient.getMetaobjects('astromeda_ip_banner', 100)),
    safe(adminClient.getMetaobjects('astromeda_hero_banner', 50)),
    safe(adminClient.getMetaobjects('astromeda_pc_color_model', 100)),
    safe(adminClient.getMetaobjects('astromeda_category_card', 100)),
    safe(adminClient.getMetaobjects('astromeda_product_shelf', 50)),
    safe(adminClient.getMetaobjects('astromeda_about_section', 10)),
    safe(adminClient.getMetaobjects('astromeda_footer_config', 50)),
  ]);

  return {
    metaCollabs: collabsRaw.map((mo) => {
      const f = fieldsToMap(mo.fields);
      return {
        id: mo.id, handle: mo.handle,
        name: f['name'] || '', shopHandle: f['collection_handle'] || '',
        image: f['image'] || null, tagline: f['tagline'] || null,
        label: f['label'] || null,
        sortOrder: parseInt(f['display_order'] || '0', 10),
        featured: f['is_active'] === 'true',
      };
    }),
    metaBanners: bannersRaw.map((mo) => {
      const f = fieldsToMap(mo.fields);
      return {
        id: mo.id, handle: mo.handle,
        title: f['title'] || '', subtitle: f['subtitle'] || null,
        image: f['image'] || null, linkUrl: f['link_url'] || null,
        ctaLabel: f['cta_label'] || null,
        sortOrder: parseInt(f['display_order'] || '0', 10),
        isActive: f['is_active'] === 'true',
        startAt: f['start_at'] || null, endAt: f['end_at'] || null,
      };
    }),
    metaColors: colorsRaw.map((mo) => {
      const f = fieldsToMap(mo.fields);
      return {
        id: mo.id, handle: mo.handle,
        name: f['name'] || '', slug: f['slug'] || '',
        image: f['image'] || null,
        colorCode: f['color_code'] || '#888888',
        sortOrder: parseInt(f['display_order'] || '0', 10),
        isActive: f['is_active'] === 'true',
      };
    }),
    metaCategoryCards: cardsRaw.map((mo) => {
      const f = fieldsToMap(mo.fields);
      const priceRaw = f['price_from'];
      return {
        id: mo.id, handle: mo.handle,
        title: f['title'] || '', description: f['description'] || null,
        priceFrom: priceRaw ? parseInt(priceRaw, 10) : null,
        image: f['image'] || null, linkUrl: f['link_url'] || null,
        sortOrder: parseInt(f['display_order'] || '0', 10),
        isActive: f['is_active'] === 'true',
      };
    }),
    metaProductShelves: shelvesRaw.map((mo) => {
      const f = fieldsToMap(mo.fields);
      let productIds: string[] = [];
      try {
        const parsed = JSON.parse(f['product_ids_json'] || '[]');
        if (Array.isArray(parsed)) productIds = parsed.filter((x): x is string => typeof x === 'string');
      } catch { productIds = []; }
      const rawLimit = parseInt(f['limit'] || '6', 10);
      const sk = f['sort_key'];
      return {
        id: mo.id, handle: mo.handle,
        title: f['title'] || '', subtitle: f['subtitle'] || '',
        productIds,
        limit: Number.isFinite(rawLimit) && rawLimit >= 1 && rawLimit <= 24 ? rawLimit : 6,
        sortKey: (sk === 'best_selling' || sk === 'newest' ? sk : 'manual') as 'manual' | 'best_selling' | 'newest',
        sortOrder: parseInt(f['display_order'] || '0', 10),
        isActive: f['is_active'] === 'true',
      };
    }),
    metaAboutSections: aboutRaw.map((mo) => {
      const f = fieldsToMap(mo.fields);
      return {
        id: mo.id, handle: mo.handle,
        title: f['title'] || '', bodyHtml: f['body_html'] || '',
        image: f['image'] || null,
        linkUrl: f['link_url'] || '', linkLabel: f['link_label'] || '',
        isActive: f['is_active'] === 'true',
      };
    }),
    metaFooterConfigs: footerRaw.map((mo) => {
      const f = fieldsToMap(mo.fields);
      let links: Array<{label: string; url: string}> = [];
      try {
        const parsed = JSON.parse(f['links_json'] || '[]');
        if (Array.isArray(parsed)) {
          links = parsed.filter((x): x is {label: string; url: string} =>
            x != null && typeof x === 'object' &&
            typeof (x as {label?: unknown}).label === 'string' &&
            typeof (x as {url?: unknown}).url === 'string',
          );
        }
      } catch { links = []; }
      return {
        id: mo.id, handle: mo.handle,
        sectionTitle: f['section_title'] || '', links,
        sortOrder: parseInt(f['display_order'] || '0', 10),
        isActive: f['is_active'] === 'true',
      };
    }),
  };
}
