/**
 * コンテンツ管理API — CMS
 *
 * GET:  Metaobject「astromeda_article_content」一覧 + ContentWriter Agent の draft を補完
 * POST: 記事 create / update / delete / publish / unpublish
 *
 * Metaobject 定義は api/admin/metaobject-setup で一括作成（本ファイルからは作成しない）
 *
 * セキュリティ: RateLimit → AdminAuth → RBAC → AuditLog → CSRF(POST) → Zod
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.content';
import { z } from 'zod';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

// ── Metaobject 型名（metaobject-setup.ts と整合） ──
const METAOBJECT_TYPE = 'astromeda_article_content';

// ── Zod スキーマ ──
// body_html は HTML を含むので <script> のみ禁止に緩和
const safeString = (maxLen: number = 500) =>
  z.string().max(maxLen).refine(
    (s) => !/<[^>]*>/g.test(s),
    { message: 'HTMLタグは使用できません' },
  );

const safeHtml = (maxLen: number = 100_000) =>
  z.string().max(maxLen).refine(
    (s) => !/<script[\s\S]*?>/i.test(s),
    { message: '<script>タグは使用できません' },
  );

const ContentActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    handle: safeString(100),
    title: safeString(500),
    slug: safeString(255),
    body_html: safeHtml(100_000).optional().default(''),
    author: safeString(255).optional().default(''),
    featured_image: safeString(2048).optional(),
    published_at: safeString(50).optional(),
    is_published: z.boolean().optional().default(false),
  }).strict(),
  z.object({
    action: z.literal('update'),
    metaobjectId: z.string().min(1),
    title: safeString(500).optional(),
    slug: safeString(255).optional(),
    body_html: safeHtml(100_000).optional(),
    author: safeString(255).optional(),
    featured_image: safeString(2048).optional(),
    published_at: safeString(50).optional(),
    is_published: z.boolean().optional(),
  }).strict(),
  z.object({
    action: z.literal('delete'),
    metaobjectId: z.string().min(1),
  }).strict(),
  z.object({
    action: z.literal('publish'),
    metaobjectId: z.string().min(1),
  }).strict(),
  z.object({
    action: z.literal('unpublish'),
    metaobjectId: z.string().min(1),
  }).strict(),
]);

// ── 型定義 ──
interface ContentItem {
  id: string;
  handle: string;
  title: string;
  slug: string;
  body_html: string;
  author: string;
  featured_image: string | null;
  published_at: string | null;
  is_published: boolean;
  source: 'metaobject' | 'agent_draft';
}

// ── GET: 記事一覧 ──

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.content', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  try {
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const session = await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]);
    const role = requirePermission(session, 'products.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/content [GET]', success: true });

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    const metaobjects = await client.getMetaobjects(METAOBJECT_TYPE, 100).catch(
      () => [] as Array<{ id: string; handle: string; fields: Array<{ key: string; value: string }> }>,
    );

    const contents: ContentItem[] = metaobjects.map((mo) => {
      const f = fieldsToMap(mo.fields);
      return {
        id: mo.id,
        handle: mo.handle,
        title: f['title'] || '(無題)',
        slug: f['slug'] || '',
        body_html: f['body_html'] || '',
        author: f['author'] || '',
        featured_image: f['featured_image'] || null,
        published_at: f['published_at'] || null,
        is_published: f['is_published'] === 'true',
        source: 'metaobject',
      };
    });

    // ContentWriter Agent の draft を補完（Metaobject 未登録のもののみ）
    try {
      const { getRegisteredAgents } = await import('../../agents/registration/agent-registration.js');
      const agents = (getRegisteredAgents?.() || []) as Array<{ id: string; getState?: () => Record<string, unknown> }>;
      const contentWriter = agents.find((a) => a.id === 'content-writer');
      if (contentWriter?.getState) {
        const state = contentWriter.getState() as Record<string, unknown>;
        const recentOutputs = (state.recentOutputs as Array<Record<string, unknown>> | undefined) || [];
        for (const output of recentOutputs) {
          const draftId = String(output.id || '');
          if (!draftId) continue;
          if (contents.some((c) => c.handle === draftId || c.id === draftId)) continue;
          contents.push({
            id: draftId,
            handle: draftId,
            title: String(output.title || '(無題)'),
            slug: String(output.slug || draftId),
            body_html: String(output.body || ''),
            author: String(output.author || 'ContentWriter'),
            featured_image: null,
            published_at: null,
            is_published: false,
            source: 'agent_draft',
          });
        }
      }
    } catch {
      // Agent 未登録時はスキップ
    }

    return data({
      success: true,
      contents,
      total: contents.length,
      stats: {
        published: contents.filter((c) => c.is_published).length,
        draft: contents.filter((c) => !c.is_published && c.source === 'metaobject').length,
        agentDraft: contents.filter((c) => c.source === 'agent_draft').length,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `コンテンツ取得失敗: ${msg}` }, { status: 500 });
  }
}

// ── POST: CRUD + publish toggle ──

export async function action({ request, context }: Route.ActionArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.content', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const session = await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = ContentActionSchema.safeParse(rawBody);
    if (!validation.success) {
      return data({
        error: '入力値が無効です',
        details: validation.error.errors.map((e) => e.message),
      }, { status: 400 });
    }

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();
    const v = validation.data;

    switch (v.action) {
      case 'create': {
        const role = requirePermission(session, 'products.edit');
        const fields: Array<{ key: string; value: string }> = [
          { key: 'title', value: v.title },
          { key: 'slug', value: v.slug },
          { key: 'body_html', value: v.body_html },
          { key: 'author', value: v.author },
          { key: 'is_published', value: String(v.is_published) },
        ];
        if (v.featured_image) fields.push({ key: 'featured_image', value: v.featured_image });
        if (v.published_at) fields.push({ key: 'published_at', value: v.published_at });

        const result = await client.createMetaobject(METAOBJECT_TYPE, v.handle, fields);
        auditLog({ action: 'content_create', role, resource: `metaobject/${result.id}`, success: true });
        return data({ success: true, metaobject: result });
      }

      case 'update': {
        const role = requirePermission(session, 'products.edit');
        const fields: Array<{ key: string; value: string }> = [];
        if (v.title !== undefined) fields.push({ key: 'title', value: v.title });
        if (v.slug !== undefined) fields.push({ key: 'slug', value: v.slug });
        if (v.body_html !== undefined) fields.push({ key: 'body_html', value: v.body_html });
        if (v.author !== undefined) fields.push({ key: 'author', value: v.author });
        if (v.featured_image !== undefined) fields.push({ key: 'featured_image', value: v.featured_image });
        if (v.published_at !== undefined) fields.push({ key: 'published_at', value: v.published_at });
        if (v.is_published !== undefined) fields.push({ key: 'is_published', value: String(v.is_published) });

        const result = await client.updateMetaobject(v.metaobjectId, fields);
        auditLog({ action: 'content_update', role, resource: `metaobject/${v.metaobjectId}`, success: true });
        return data({ success: true, metaobject: result });
      }

      case 'delete': {
        const role = requirePermission(session, 'products.delete');
        const result = await client.deleteMetaobject(v.metaobjectId);
        auditLog({ action: 'content_delete', role, resource: `metaobject/${v.metaobjectId}`, success: result });
        return data({ success: result });
      }

      case 'publish':
      case 'unpublish': {
        const role = requirePermission(session, 'products.edit');
        const isPub = v.action === 'publish';
        const fields: Array<{ key: string; value: string }> = [
          { key: 'is_published', value: String(isPub) },
        ];
        if (isPub) fields.push({ key: 'published_at', value: new Date().toISOString() });
        const result = await client.updateMetaobject(v.metaobjectId, fields);
        auditLog({
          action: 'content_edit',
          role,
          resource: `metaobject/${v.metaobjectId}`,
          detail: `is_published=${isPub}`,
          success: true,
        });
        return data({ success: true, metaobject: result });
      }

      default:
        return data({ error: '不明なアクションです' }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data({ success: false, error: `コンテンツ操作失敗: ${msg}` }, { status: 500 });
  }
}

// ── ヘルパー ──

function fieldsToMap(fields: Array<{ key: string; value: string }>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of fields) m[f.key] = f.value;
  return m;
}
