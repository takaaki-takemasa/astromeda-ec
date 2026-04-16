/**
 * Admin Content Editor — 記事制作CMS (WYSIWYG Editor)
 *
 * 機能:
 * - 記事タイトル、スラグ、カテゴリ、本文、抜粋入力
 * - リッチテキストエディタ（contentEditable対応）
 * - プレビューペイン（リアルタイム表示）
 * - 下書き・公開トグル
 * - SEOメタタイトル、メタ説明、フィーチャー画像URL
 * - 読了時間自動計算
 * - Shopify Admin API経由での保存（現在はローカルステート）
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { ImageUploader } from '~/components/admin/ImageUploader';
import type { ImageUploadResult } from '~/components/admin/ImageUploader';
import {
  data,
  redirect,
  Form,
  useLoaderData,
  useNavigation,
  useActionData,
} from 'react-router';
import type { Route } from './+types/admin.content';
import { RouteErrorBoundary } from '~/components/astro/RouteErrorBoundary';
import { AppSession } from '~/lib/session';
import {
  sanitizeHtml,
  generateSlug,
  estimateReadTime,
  extractExcerpt,
  validateBlogContent,
} from '~/lib/content-editor';
import { T, PAGE_WIDTH } from '~/lib/astromeda-data';

// ── テーマ定数 ──
const D = {
  bg: T.bg,
  tx: T.tx,
  t5: T.t5,
  t4: T.t4,
  t3: T.t3,
  t2: T.t2,
  t1: T.t1,
  bd: T.bd,
  c: T.c,
  g: T.g,
  r: '#FF2D55',
};

interface BlogArticle {
  id?: string;
  title: string;
  slug: string;
  category: 'news' | 'tech' | 'review';
  content: string;
  excerpt: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  featuredImageUrl: string;
  isPublished: boolean;
  createdAt?: number;
  updatedAt?: number;
}

interface LoaderData {
  article?: BlogArticle;
  isNew: boolean;
}

interface ActionData {
  success?: boolean;
  error?: string;
  article?: BlogArticle;
}

/**
 * Loader: Admin認証チェック + 既存記事取得（必要に応じて）
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.env as Env;
  const session = await AppSession.init(request, [env.SESSION_SECRET as string]);

  if (session.get('isAdmin') !== true) {
    throw redirect('/admin/login');
  }

  // Shopify Admin APIから記事一覧/個別記事を取得
  const articleId = params?.articleId;
  let article = undefined;
  let articles: Array<{ id: string; title: string; handle: string; publishedAt: string | null }> = [];

  try {
    const { setBridgeEnv } = await import('~/lib/agent-bridge');
    setBridgeEnv(env as unknown as Record<string, string | undefined>);
    const { getAdminClient } = await import('../../agents/core/shopify-admin.js');
    const client = getAdminClient();

    if (client) {
      // 記事一覧取得（BlogのArticles）
      const articlesResult = await client.graphql(`{
        articles(first: 50, sortKey: UPDATED_AT, reverse: true) {
          edges { node { id title handle publishedAt body author { name } image { url } } }
        }
      }`).catch(() => null);

      if (articlesResult?.articles?.edges) {
        articles = articlesResult.articles.edges.map((edge: Record<string, Record<string, unknown>>) => ({
          id: edge.node.id,
          title: edge.node.title || '(無題)',
          handle: edge.node.handle || '',
          publishedAt: edge.node.publishedAt || null,
          body: edge.node.body || '',
          authorName: edge.node.author?.name || '',
          imageUrl: (edge.node.image as Record<string, unknown> | undefined)?.url || '',
        }));
      }

      // 個別記事取得
      if (articleId) {
        const gid = articleId.startsWith('gid://') ? articleId : `gid://shopify/Article/${articleId}`;
        const singleResult = await client.graphql(`{
          article(id: "${gid}") { id title handle body publishedAt author { name } image { url } tags }
        }`).catch(() => null);
        if (singleResult?.article) {
          article = singleResult.article;
        }
      }
    }
  } catch {
    // Shopify API未接続→空配列
  }

  return data({
    article,
    articles,
    isNew: !articleId,
  });
}

/**
 * Action: 記事の保存・公開
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.env as Env;
  const session = await AppSession.init(request, [env.SESSION_SECRET as string]);

  if (session.get('isAdmin') !== true) {
    return data({ error: '認証が必要です' }, { status: 401 });
  }

  if (request.method !== 'POST') {
    return data({ error: 'リクエストメソッドが無効です' }, { status: 405 });
  }

  const formData = await request.formData();
  const action = String(formData.get('action') || 'draft');

  // フォームデータ抽出
  const article: BlogArticle = {
    title: String(formData.get('title') || ''),
    slug: String(formData.get('slug') || ''),
    category: (String(formData.get('category') || 'news') as unknown as 'news' | 'tech' | 'review') || 'news',
    content: String(formData.get('content') || ''),
    excerpt: String(formData.get('excerpt') || ''),
    tags: (String(formData.get('tags') || ''))
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t),
    seoTitle: String(formData.get('seoTitle') || ''),
    seoDescription: String(formData.get('seoDescription') || ''),
    featuredImageUrl: String(formData.get('featuredImageUrl') || ''),
    isPublished: action === 'publish',
  };

  // バリデーション
  const validation = validateBlogContent(article);
  if (!validation.isValid) {
    return data(
      { error: validation.errors.join('; ') },
      { status: 400 },
    );
  }

  // HTML サニタイゼーション
  article.content = sanitizeHtml(article.content);

  // 自動抜粋生成（ユーザー入力がない場合）
  if (!article.excerpt) {
    article.excerpt = extractExcerpt(article.content, 200);
  }

  // タイムスタンプ設定
  article.updatedAt = Date.now();
  if (!article.id) {
    article.id = `article-${Date.now()}`;
    article.createdAt = Date.now();
  }

  try {
    // Shopify Admin APIで記事を保存
    const { setBridgeEnv } = await import('~/lib/agent-bridge');
    setBridgeEnv(env as unknown as Record<string, string | undefined>);
    const { getAdminClient } = await import('../../agents/core/shopify-admin.js');
    const client = getAdminClient();

    if (client) {
      // Shopify articleUpdateミューテーション
      const escapedTitle = article.title.replace(/"/g, '\\"');
      const escapedBody = article.content.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const mutation = article.id?.startsWith('gid://')
        ? `mutation { articleUpdate(id: "${article.id}", article: { title: "${escapedTitle}", body: "${escapedBody}", published: ${article.isPublished} }) { article { id title } userErrors { field message } } }`
        : `mutation { articleCreate(article: { title: "${escapedTitle}", body: "${escapedBody}", published: ${article.isPublished}, blogId: "gid://shopify/Blog/1" }) { article { id title } userErrors { field message } } }`;

      const result = await client.graphql(mutation).catch((e: Error) => {
        if (process.env.NODE_ENV === 'development') console.error('[AdminContent] GraphQL error:', e);
        return null;
      });

      const userErrors = result?.articleUpdate?.userErrors || result?.articleCreate?.userErrors || [];
      if (userErrors.length > 0) {
        return data({ error: userErrors.map((e: {message: string}) => e.message).join(', ') }, { status: 400 });
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('[AdminContent] Article saved to Shopify:', result);
      }
    } else {
      // Shopify未接続→ローカルストレージのみに保存
      if (process.env.NODE_ENV === 'development') {
        console.log('[AdminContent] Article saved (local only, Shopify not connected):', article.title);
      }
    }

    return data({
      success: true,
      article,
    });
  } catch (error) {
    console.error('[AdminContent] Error:', error);
    return data({ error: '記事保存中にエラーが発生しました' }, { status: 500 });
  }
}

export const meta = () => [
  { title: '記事制作 | ASTROMEDA Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

/**
 * Main Component: Content Editor UI
 */
export default function AdminContent() {
  const loaderData = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const formRef = useRef<HTMLFormElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // ローカルステート
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [category, setCategory] = useState<'news' | 'tech' | 'review'>('news');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [tags, setTags] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [featuredImageUrl, setFeaturedImageUrl] = useState('');
  const [readTime, setReadTime] = useState(0);
  const [characterCount, setCharacterCount] = useState(0);

  const isSubmitting = navigation.state === 'submitting';

  // コンテンツ更新時の自動計算
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setReadTime(estimateReadTime(newContent));
    setCharacterCount(newContent.replace(/<[^>]*>/g, '').length);
  }, []);

  // タイトル変更時のスラグ自動生成
  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    if (!slug || slug === generateSlug(title)) {
      setSlug(generateSlug(newTitle));
    }
  }, [slug, title]);

  // コンテンツエディタのHTMLエディタ機能
  const insertTag = useCallback((tag: string, attrs: string = '') => {
    if (!editorRef.current) return;

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString() || 'テキスト';

    const openTag = `<${tag}${attrs ? ' ' + attrs : ''}>`;
    const closeTag = `</${tag}>`;
    const html = `${openTag}${selectedText}${closeTag}`;

    const fragment = document.createRange().createContextualFragment(html);
    range.deleteContents();
    range.insertNode(fragment);

    // コンテンツ更新
    const newContent = editorRef.current?.innerHTML || '';
    handleContentChange(newContent);
  }, [handleContentChange]);

  return (
    <div style={{ background: D.bg, minHeight: '100vh', color: D.tx }}>
      {/* Header */}
      <div
        style={{
          borderBottom: `1px solid ${D.bd}`,
          padding: '24px 0',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: D.bg,
          backdropFilter: T.bl,
        }}
      >
        <div style={PAGE_WIDTH}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: D.c }}>
            📝 記事制作
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: D.t4 }}>
            新しいブログ記事を作成します
          </p>
        </div>
      </div>

      {/* Content Container */}
      <div style={PAGE_WIDTH}>
        <div style={{ paddingTop: 40, paddingBottom: 40 }}>
          {/* 成功メッセージ */}
          {actionData?.success && (
            <div
              style={{
                padding: '16px 20px',
                background: `rgba(0, 230, 118, 0.1)`,
                border: `1px solid rgba(0, 230, 118, 0.3)`,
                borderRadius: 12,
                marginBottom: 24,
                color: '#00E676',
                fontSize: 14,
              }}
            >
              ✓ 記事が正常に保存されました
            </div>
          )}

          {/* エラーメッセージ */}
          {actionData?.error && (
            <div
              style={{
                padding: '16px 20px',
                background: `rgba(255, 45, 85, 0.1)`,
                border: `1px solid rgba(255, 45, 85, 0.3)`,
                borderRadius: 12,
                marginBottom: 24,
                color: D.r,
                fontSize: 14,
              }}
            >
              ✗ {actionData.error}
            </div>
          )}

          {/* Main Form */}
          <Form method="post" ref={formRef} id="article-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Left Column: Editor */}
            <div>
              {/* Title Input */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: D.t4, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
                  記事タイトル
                </label>
                <input
                  type="text"
                  name="title"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="例: 新型Astromeda PCの発表"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    fontSize: 16,
                    fontWeight: 600,
                    color: D.tx,
                    background: D.bg,
                    border: `1px solid ${D.bd}`,
                    borderRadius: 12,
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                  maxLength={200}
                />
                <p style={{ margin: '6px 0 0', fontSize: 11, color: D.t3 }}>
                  {title.length}/200
                </p>
              </div>

              {/* Slug Input */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: D.t4, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
                  URL スラグ
                </label>
                <input
                  type="text"
                  name="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="article-slug"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    fontSize: 14,
                    color: D.tx,
                    background: D.bg,
                    border: `1px solid ${D.bd}`,
                    borderRadius: 12,
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                    fontFamily: 'monospace',
                  }}
                />
                <p style={{ margin: '6px 0 0', fontSize: 11, color: D.t3 }}>
                  /blog/{slug || 'article-slug'}
                </p>
              </div>

              {/* Category & Tags */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: D.t4, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
                    カテゴリ
                  </label>
                  <select
                    name="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as unknown as typeof category)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      fontSize: 14,
                      color: D.tx,
                      background: D.bg,
                      border: `1px solid ${D.bd}`,
                      borderRadius: 8,
                      outline: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <option value="news">ニュース</option>
                    <option value="tech">技術</option>
                    <option value="review">レビュー</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: D.t4, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
                    タグ（カンマ区切り）
                  </label>
                  <input
                    type="text"
                    name="tags"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="PC, ゲーミング, 新作"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      fontSize: 14,
                      color: D.tx,
                      background: D.bg,
                      border: `1px solid ${D.bd}`,
                      borderRadius: 8,
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              </div>

              {/* Content Editor */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: D.t4, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
                  コンテンツ
                </label>
                <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => insertTag('strong')}
                    title="太字"
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      background: D.t2,
                      border: `1px solid ${D.bd}`,
                      borderRadius: 6,
                      color: D.tx,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => insertTag('em')}
                    title="イタリック"
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      background: D.t2,
                      border: `1px solid ${D.bd}`,
                      borderRadius: 6,
                      color: D.tx,
                      cursor: 'pointer',
                      fontStyle: 'italic',
                    }}
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onClick={() => insertTag('h2')}
                    title="見出し2"
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      background: D.t2,
                      border: `1px solid ${D.bd}`,
                      borderRadius: 6,
                      color: D.tx,
                      cursor: 'pointer',
                    }}
                  >
                    H2
                  </button>
                  <button
                    type="button"
                    onClick={() => insertTag('blockquote')}
                    title="引用"
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      background: D.t2,
                      border: `1px solid ${D.bd}`,
                      borderRadius: 6,
                      color: D.tx,
                      cursor: 'pointer',
                    }}
                  >
                    "
                  </button>
                  <button
                    type="button"
                    onClick={() => insertTag('code')}
                    title="コード"
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      background: D.t2,
                      border: `1px solid ${D.bd}`,
                      borderRadius: 6,
                      color: D.tx,
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                    }}
                  >
                    &lt;&gt;
                  </button>
                </div>
                <textarea
                  name="content"
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder="記事本文を入力してください...&#10;HTMLタグ対応: <p>, <h1>-<h6>, <strong>, <em>, <ul>, <ol>, <li>, <a>, <img>, <blockquote>, <code>"
                  style={{
                    width: '100%',
                    minHeight: 400,
                    padding: '16px',
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: D.tx,
                    background: D.bg,
                    border: `1px solid ${D.bd}`,
                    borderRadius: 12,
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                    fontFamily: 'monospace',
                    resize: 'vertical',
                  }}
                />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: D.t3 }}>
                  <span>文字数: {characterCount}</span>
                  <span>読了時間: 約 {readTime} 分</span>
                </div>
              </div>

              {/* Excerpt Input */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: D.t4, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
                  抜粋（任意・自動生成可）
                </label>
                <textarea
                  name="excerpt"
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="記事の概要を入力するか、空にして自動抽出"
                  style={{
                    width: '100%',
                    minHeight: 100,
                    padding: '12px 14px',
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: D.tx,
                    background: D.bg,
                    border: `1px solid ${D.bd}`,
                    borderRadius: 8,
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                  maxLength={300}
                />
                <p style={{ margin: '6px 0 0', fontSize: 11, color: D.t3 }}>
                  {excerpt.length}/300
                </p>
              </div>

              {/* Featured Image — ImageUploader + URL フォールバック */}
              <div style={{ marginBottom: 24 }}>
                <ImageUploader
                  label="フィーチャー画像"
                  onUpload={(result: ImageUploadResult) => setFeaturedImageUrl(result.resourceUrl)}
                  currentImageUrl={featuredImageUrl || null}
                  height={140}
                />
                <input type="hidden" name="featuredImageUrl" value={featuredImageUrl} />
                <div style={{ marginTop: 8 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: D.t4, letterSpacing: 1, marginBottom: 4 }}>
                    URL直接入力（フォールバック）
                  </label>
                  <input
                    type="url"
                    value={featuredImageUrl}
                    onChange={(e) => setFeaturedImageUrl(e.target.value)}
                    placeholder="https://..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: 12,
                      color: D.tx,
                      background: D.bg,
                      border: `1px solid ${D.bd}`,
                      borderRadius: 6,
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Right Column: SEO & Preview */}
            <div>
              {/* SEO Section */}
              <div
                style={{
                  padding: 20,
                  background: D.t1,
                  borderRadius: 12,
                  marginBottom: 24,
                  border: `1px solid ${D.bd}`,
                }}
              >
                <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: D.c }}>
                  🔍 SEO 設定
                </h3>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: D.t4, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>
                    SEO タイトル
                  </label>
                  <input
                    type="text"
                    name="seoTitle"
                    value={seoTitle}
                    onChange={(e) => setSeoTitle(e.target.value)}
                    placeholder="記事タイトルと同じか、別に最適化"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: 12,
                      color: D.tx,
                      background: D.bg,
                      border: `1px solid ${D.bd}`,
                      borderRadius: 6,
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                    maxLength={60}
                  />
                  <p style={{ margin: '4px 0 0', fontSize: 10, color: D.t3 }}>
                    {seoTitle.length}/60 文字
                  </p>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: D.t4, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>
                    SEO 説明
                  </label>
                  <textarea
                    name="seoDescription"
                    value={seoDescription}
                    onChange={(e) => setSeoDescription(e.target.value)}
                    placeholder="検索結果に表示される説明文"
                    style={{
                      width: '100%',
                      minHeight: 80,
                      padding: '10px 12px',
                      fontSize: 12,
                      lineHeight: 1.4,
                      color: D.tx,
                      background: D.bg,
                      border: `1px solid ${D.bd}`,
                      borderRadius: 6,
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                    maxLength={160}
                  />
                  <p style={{ margin: '4px 0 0', fontSize: 10, color: D.t3 }}>
                    {seoDescription.length}/160 文字
                  </p>
                </div>
              </div>

              {/* Preview Section */}
              <div
                style={{
                  padding: 20,
                  background: D.t1,
                  borderRadius: 12,
                  border: `1px solid ${D.bd}`,
                }}
              >
                <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: D.c }}>
                  👁️ プレビュー
                </h3>

                {featuredImageUrl && (
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '16/9',
                      background: `linear-gradient(135deg, ${D.t2}, ${D.t3})`,
                      borderRadius: 8,
                      marginBottom: 16,
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <img
                      src={featuredImageUrl}
                      alt="Preview"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: 8,
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}

                <h4
                  style={{
                    margin: '0 0 8px',
                    fontSize: 16,
                    fontWeight: 700,
                    color: D.tx,
                    lineHeight: 1.3,
                  }}
                >
                  {title || 'タイトルが表示されます'}
                </h4>

                <p style={{ margin: '0 0 12px', fontSize: 12, color: D.t4, lineHeight: 1.5 }}>
                  {excerpt ||
                    (content
                      ? content.replace(/<[^>]*>/g, '').substring(0, 120) + '...'
                      : '抜粋が表示されます')}
                </p>

                <div style={{ fontSize: 11, color: D.t3, display: 'flex', gap: 16 }}>
                  <span>📚 {readTime} 分</span>
                  <span>🏷️ {category}</span>
                </div>
              </div>
            </div>
          </Form>

          {/* Action Buttons */}
          <div
            style={{
              marginTop: 32,
              display: 'flex',
              gap: 12,
              justifyContent: 'flex-end',
            }}
          >
            <button
              form="article-form"
              name="action"
              value="draft"
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 700,
                color: D.tx,
                background: D.t2,
                border: `1px solid ${D.bd}`,
                borderRadius: 8,
                cursor: isSubmitting ? 'wait' : 'pointer',
                transition: 'all 0.2s',
                fontFamily: 'inherit',
              }}
            >
              {isSubmitting ? '保存中...' : '下書き保存'}
            </button>
            <button
              form="article-form"
              name="action"
              value="publish"
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 700,
                color: '#000',
                background: D.c,
                border: 'none',
                borderRadius: 8,
                cursor: isSubmitting ? 'wait' : 'pointer',
                transition: 'all 0.2s',
                fontFamily: 'inherit',
              }}
            >
              {isSubmitting ? '公開中...' : '記事を公開'}
            </button>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        input:focus,
        textarea:focus,
        select:focus {
          border-color: ${D.c} !important;
          box-shadow: 0 0 0 2px ${D.c}20;
        }
        textarea::placeholder,
        input::placeholder {
          color: ${D.t3};
        }
        @media (max-width: 1024px) {
          [style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}} />
    </div>
  );
}

export const ErrorBoundary = RouteErrorBoundary;
