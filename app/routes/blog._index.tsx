/**
 * ブログ一覧ページ
 *
 * patch 0025 (P2-I): astromeda_article_content Metaobject から
 * is_published=true のレコードを published_at 降順で一覧表示。
 */

import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/blog._index';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

interface BlogListItem {
  id: string;
  slug: string;
  title: string;
  author: string;
  publishedAt: string;
  excerpt: string;
}

export async function loader(args: Route.LoaderArgs) {
  const {env} = args.context;
  let items: BlogListItem[] = [];
  try {
    const {setAdminEnv, getAdminClient} = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(env as unknown as Record<string, string | undefined>);
    const client = getAdminClient();
    const records = await client.getMetaobjects('astromeda_article_content', 100);
    const parsed = (records || [])
      .map((r) => {
        const m: Record<string, string> = {};
        for (const f of r.fields) m[f.key] = f.value;
        const bodyPlain = (m['body_html'] || '').replace(/<[^>]*>/g, '').trim();
        return {
          id: r.id,
          slug: m['slug'] || '',
          title: m['title'] || '',
          author: m['author'] || '',
          publishedAt: m['published_at'] || '',
          excerpt: bodyPlain.slice(0, 140),
          isPublished: (m['is_published'] || '').toLowerCase() === 'true',
          publishedMs: m['published_at'] ? Date.parse(m['published_at']) : 0,
        };
      })
      .filter((x) => x.isPublished && x.slug && x.title);
    parsed.sort((a, b) => b.publishedMs - a.publishedMs);
    items = parsed.map((x) => ({
      id: x.id,
      slug: x.slug,
      title: x.title,
      author: x.author,
      publishedAt: x.publishedAt,
      excerpt: x.excerpt,
    }));
  } catch {
    items = [];
  }
  return {items};
}

export const meta: Route.MetaFunction = () => {
  const title = 'ブログ | ASTROMEDA';
  const description = 'ASTROMEDA 公式ブログ — ゲーミングPCの最新情報、コラボ発表、使い方ガイドをお届けします。';
  const url = `${STORE_URL}/blog`;
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:url', content: url},
    {name: 'twitter:card', content: 'summary'},
  ];
};

export const ErrorBoundary = RouteErrorBoundary;

export default function BlogIndex() {
  const {items} = useLoaderData<typeof loader>();
  return (
    <div style={{background: T.bg, color: T.tx, minHeight: '100vh'}}>
      <div style={{maxWidth: 960, margin: '0 auto', padding: 'clamp(32px, 6vw, 64px) clamp(16px, 4vw, 32px)'}}>
        <h1 style={{fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, marginBottom: 16}}>BLOG</h1>
        <p style={{color: 'rgba(255,255,255,0.7)', marginBottom: 32}}>
          ASTROMEDA 公式ブログ。新製品情報・コラボ発表・テクニカルガイドを掲載。
        </p>

        {items.length === 0 ? (
          <div
            style={{
              padding: 32,
              background: 'rgba(255,255,255,0.04)',
              border: '1px dashed rgba(255,255,255,0.2)',
              borderRadius: 12,
              textAlign: 'center',
            }}
          >
            <p style={{margin: 0, color: 'rgba(255,255,255,0.6)'}}>
              現在、公開中の記事はありません。
            </p>
          </div>
        ) : (
          <ul style={{listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 16}}>
            {items.map((item) => (
              <li
                key={item.id}
                data-article-id={item.id}
                data-article-slug={item.slug}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <Link
                  to={`/blog/${item.slug}`}
                  style={{color: T.c, textDecoration: 'none', fontSize: 'clamp(18px, 2.4vw, 22px)', fontWeight: 700}}
                >
                  {item.title}
                </Link>
                <div style={{marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.5)'}}>
                  {item.author && <span>{item.author}</span>}
                  {item.author && item.publishedAt && <span style={{margin: '0 8px'}}>·</span>}
                  {item.publishedAt && (
                    <time dateTime={item.publishedAt}>{item.publishedAt.slice(0, 10)}</time>
                  )}
                </div>
                {item.excerpt && (
                  <p style={{marginTop: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7}}>
                    {item.excerpt}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
