/**
 * Static Page Loader — astromeda_static_page Metaobject から
 * page_slug 一致のレコードを取得するヘルパー。
 *
 * 個別ページ route (warranty.tsx, contact.tsx, about.tsx 等) の loader で使用。
 * CMS データが見つからない / is_published=false / Admin client null の場合は
 * 全て null を返す。呼び出し側はハードコード fallback で表示すること。
 *
 * patch 0019 (P0-C): astromeda_static_page を 7 ページに接続するための共通実装。
 */

interface MetaobjectRaw {
  id: string;
  handle: string;
  fields: Array<{key: string; value: string}>;
}

interface AdminClientLike {
  getMetaobjects: (type: string, first: number) => Promise<MetaobjectRaw[]>;
}

export interface StaticPageSection {
  heading: string;
  body: string;
}

export interface StaticPageCms {
  id: string;
  handle: string;
  title: string;
  pageSlug: string;
  metaDescription: string;
  bodyHtml: string;
  sections: StaticPageSection[];
  updatedLabel: string;
  isPublished: boolean;
}

/**
 * astromeda_static_page から page_slug が一致する公開レコードを 1 件返す。
 * - admin client が無ければ null
 * - レコードが無ければ null
 * - is_published !== 'true' でも返す（呼び出し側で判定したい場合のため）
 *   → ただし draft 扱いなので呼び出し側は isPublished フラグを必ず確認すること
 */
export async function loadStaticPageBySlug(
  adminClient: AdminClientLike | null,
  slug: string,
): Promise<StaticPageCms | null> {
  if (!adminClient) return null;
  if (!slug) return null;
  try {
    const records = await adminClient.getMetaobjects('astromeda_static_page', 50);
    const match = records.find((r) => {
      const f = fieldsToMap(r.fields);
      return f['page_slug'] === slug;
    });
    if (!match) return null;
    const f = fieldsToMap(match.fields);
    let sections: StaticPageSection[] = [];
    try {
      const parsed = JSON.parse(f['sections_json'] || '[]');
      if (Array.isArray(parsed)) {
        sections = parsed
          .filter(
            (x): x is StaticPageSection =>
              x != null &&
              typeof x === 'object' &&
              typeof (x as {heading?: unknown}).heading === 'string' &&
              typeof (x as {body?: unknown}).body === 'string',
          )
          .map((x) => ({heading: x.heading, body: x.body}));
      }
    } catch {
      sections = [];
    }
    return {
      id: match.id,
      handle: match.handle,
      title: f['title'] || '',
      pageSlug: f['page_slug'] || slug,
      metaDescription: f['meta_description'] || '',
      bodyHtml: f['body_html'] || '',
      sections,
      updatedLabel: f['updated_label'] || '',
      isPublished: f['is_published'] === 'true',
    };
  } catch {
    return null;
  }
}

function fieldsToMap(fields: Array<{key: string; value: string}>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const kv of fields) m[kv.key] = kv.value;
  return m;
}
