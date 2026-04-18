/**
 * SEO ランディングページ
 *
 * patch 0025 (P2-J): astromeda_seo_article Metaobject から
 * slug 一致かつ is_published=true の記事を 1 件取得し、
 * meta_description / keywords を meta タグに反映して表示。
 * body_markdown は軽量 Markdown→HTML 変換で描画。
 */

import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/seo.$slug';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {sanitizeHtml} from '~/lib/sanitize-html';

interface SeoArticle {
  id: string;
  slug: string;
  title: string;
  metaDescription: string;
  keywords: string;
  bodyHtml: string;
  targetKeywordVolume: number;
}

// 最小限の Markdown → HTML 変換（見出し/段落/リスト/リンク/強調のみ）
function lightMarkdown(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      continue;
    }
    const h = /^(#{1,6})\s+(.+)$/.exec(line);
    if (h) {
      if (inList) { out.push('</ul>'); inList = false; }
      const level = h[1].length;
      out.push(`<h${level}>${escapeAttr(h[2])}</h${level}>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineMd(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (inList) { out.push('</ul>'); inList = false; }
    out.push(`<p>${inlineMd(line)}</p>`);
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}
function inlineMd(s: string): string {
  return escapeAttr(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+|\/[^)]*)\)/g, '<a href="$2">$1</a>');
}
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function loader(args: Route.LoaderArgs) {
  const slug = args.params.slug || '';
  const {env} = args.context;
  let article: SeoArticle | null = null;
  try {
    const {setAdminEnv, getAdminClient} = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(env as unknown as Record<string, string | undefined>);
    const client = getAdminClient();
    const records = await client.getMetaobjects('astromeda_seo_article', 100);
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
        metaDescription: m['meta_description'] || '',
        keywords: m['keywords'] || '',
        bodyHtml: sanitizeHtml(lightMarkdown(m['body_markdown'] || '')),
        targetKeywordVolume: parseInt(m['target_keyword_volume'] || '0', 10) || 0,
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
  const article = (data as {article: SeoArticle} | undefined)?.article;
  if (!article) {
    return [{title: 'SEO | ASTROMEDA'}];
  }
  const title = `${article.title} | ASTROMEDA`;
  const description = article.metaDescription || `${article.title}について詳しく解説します。`;
  const url = `${STORE_URL}/seo/${article.slug}`;
  const out: Array<Record<string, string>> = [
    {title},
    {name: 'description', content: description},
    {tagName: 'link', rel: 'canonical', href: url},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:url', content: url},
    {name: 'twitter:card', content: 'summary'},
  ];
  if (article.keywords) {
    out.push({name: 'keywords', content: article.keywords});
  }
  return out as Route.MetaDescriptor[];
};

export const ErrorBoundary = RouteErrorBoundary;

export default function SeoArticlePage() {
  const {article} = useLoaderData<typeof loader>();
  return (
    <div style={{background: T.bg, color: T.tx, minHeight: '100vh'}}>
      <div style={{maxWidth: 840, margin: '0 auto', padding: 'clamp(32px, 6vw, 64px) clamp(16px, 4vw, 32px)'}}>
        <nav style={{marginBottom: 24, fontSize: 13, color: 'rgba(255,255,255,0.5)'}}>
          <Link to="/" style={{color: T.c, textDecoration: 'none'}}>
            ← ホーム
          </Link>
        </nav>
        <article data-seo-id={article.id} data-seo-slug={article.slug}>
          <h1 style={{fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, lineHeight: 1.3, marginBottom: 24}}>
            {article.title}
          </h1>
          {article.metaDescription && (
            <p
              style={{
                fontSize: 'clamp(15px, 1.8vw, 17px)',
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.7,
                marginBottom: 32,
                paddingBottom: 24,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {article.metaDescription}
            </p>
          )}
          <div
            style={{lineHeight: 1.85, fontSize: 'clamp(15px, 1.8vw, 17px)', color: 'rgba(255,255,255,0.9)'}}
            dangerouslySetInnerHTML={{__html: article.bodyHtml}}
          />
        </article>
      </div>
    </div>
  );
}
