/**
 * ブログ詳細ページ
 *
 * patch 0025 (P2-I): astromeda_article_content Metaobject から
 * slug 一致かつ is_published=true の記事を 1 件取得して表示。
 * body_html はサニタイズ済み想定で描画。
 */

import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/blog.$slug';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {sanitizeHtml} from '~/lib/sanitize-html';

interface BlogArticle {
  id: string;
  slug: string;
  title: string;
  author: string;
  publishedAt: string;
  bodyHtml: string;
  // patch 0154 (2026-04-24): 記事 → コレクション逆リンク。
  // 値ありなら記事ページに「📚 このコレクションを見る」CTA を表示する。
  relatedCollectionHandle: string;
}

export async function loader(args: Route.LoaderArgs) {
  const slug = args.params.slug || '';
  const {env} = args.context;
  let article: BlogArticle | null = null;
  try {
    const {setAdminEnv, getAdminClient} = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(env as unknown as Record<string, string | undefined>);
    const client = getAdminClient();
    const records = await client.getMetaobjects('astromeda_article_content', 100);
    for (const r of records || []) {
      const m: Record<string, string> = {};
      for (const f of r.fields) m[f.key] = f.value;
      const isPublished = (m['is_published'] || '').toLowerCase() === 'true';
      if (!isPublished) continue;
      if ((m['slug'] || '') !== slug) continue;
      article = {
        id: r.id,
        slug: m['slug'] || '',
        title: m['title'] || '',
        author: m['author'] || '',
        publishedAt: m['published_at'] || '',
        bodyHtml: sanitizeHtml(m['body_html'] || ''),
        // patch 0154: 記事 → コレクション逆リンク
        relatedCollectionHandle: m['related_collection_handle'] || '',
      };
      break;
    }
  } catch {
    article = null;
  }
  if (!article) {
    throw new Response('Not Found', {status: 404});
  }
  return {article};
}

export const meta: Route.MetaFunction = ({data}) => {
  const article = (data as {article: BlogArticle} | undefined)?.article;
  const title = article ? `${article.title} | ASTROMEDA ブログ` : 'ブログ | ASTROMEDA';
  const description = article
    ? article.bodyHtml.replace(/<[^>]*>/g, '').slice(0, 150)
    : 'ASTROMEDA 公式ブログ';
  const url = article ? `${STORE_URL}/blog/${article.slug}` : `${STORE_URL}/blog`;
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:type', content: 'article'},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:url', content: url},
    {name: 'twitter:card', content: 'summary_large_image'},
  ];
};

export const ErrorBoundary = RouteErrorBoundary;

export default function BlogDetail() {
  const {article} = useLoaderData<typeof loader>();
  return (
    <div style={{background: T.bg, color: T.tx, minHeight: '100vh'}}>
      <div style={{maxWidth: 780, margin: '0 auto', padding: 'clamp(32px, 6vw, 64px) clamp(16px, 4vw, 32px)'}}>
        <nav style={{marginBottom: 24, fontSize: 13, color: 'rgba(255,255,255,0.5)'}}>
          <Link to="/blog" style={{color: T.c, textDecoration: 'none'}}>
            ← ブログ一覧
          </Link>
        </nav>
        <article data-article-id={article.id} data-article-slug={article.slug}>
          <h1 style={{fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, lineHeight: 1.3, marginBottom: 16}}>
            {article.title}
          </h1>
          <div style={{marginBottom: 32, fontSize: 14, color: 'rgba(255,255,255,0.55)'}}>
            {article.author && <span>{article.author}</span>}
            {article.author && article.publishedAt && <span style={{margin: '0 8px'}}>·</span>}
            {article.publishedAt && (
              <time dateTime={article.publishedAt}>{article.publishedAt.slice(0, 10)}</time>
            )}
          </div>
          <div
            style={{lineHeight: 1.85, fontSize: 'clamp(15px, 1.8vw, 17px)', color: 'rgba(255,255,255,0.9)'}}
            dangerouslySetInnerHTML={{__html: article.bodyHtml}}
          />

          {/* patch 0154 (2026-04-24): 記事 → コレクション逆リンク
              記事側で「関連コレクション」が設定されていれば、記事末尾に CTA を表示。
              読み終えたお客様がそのままコレクションページへ進める。 */}
          {article.relatedCollectionHandle && (
            <aside
              data-related-collection={article.relatedCollectionHandle}
              style={{
                marginTop: 48,
                padding: 'clamp(20px, 3vw, 32px)',
                background: `linear-gradient(135deg, ${T.c}15, ${T.c}05)`,
                border: `1px solid ${T.c}40`,
                borderRadius: 12,
                textAlign: 'center',
              }}
            >
              <div style={{fontSize: 14, opacity: 0.75, marginBottom: 8}}>📚 この記事に関連するコレクション</div>
              <Link
                to={`/collections/${article.relatedCollectionHandle}`}
                style={{
                  display: 'inline-block',
                  padding: '12px 28px',
                  marginTop: 8,
                  background: T.c,
                  color: '#000',
                  fontWeight: 700,
                  textDecoration: 'none',
                  borderRadius: 8,
                  fontSize: 15,
                }}
              >
                このコレクションを見る →
              </Link>
            </aside>
          )}
        </article>
      </div>
    </div>
  );
}
