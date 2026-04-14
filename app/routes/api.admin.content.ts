/**
 * コンテンツ管理API — L15感覚統合（視覚野→制作物確認）
 *
 * ContentWriter / QualityAuditor の出力をCEOが確認・承認するためのAPI
 * 成熟レイヤー: L15（大脳皮質感覚統合 — CEOの目として機能）
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.content';
import { setBridgeEnv, ensureInitialized } from '~/lib/agent-bridge';
import { getStorage, TABLES } from '../../agents/core/storage.js';
import { ContentActionSchema } from '~/lib/api-schemas';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

// ── 型定義 ──
interface ContentItem {
  id: string;
  type: 'article' | 'product_desc' | 'landing_page';
  title: string;
  body: string;
  wordCount: number;
  keywords: string[];
  seoScore: number;
  status: 'published' | 'review' | 'draft';
  createdAt: number;
  updatedAt: number;
}

// GET: コンテンツ一覧取得
export async function loader({ request, context }: Route.LoaderArgs) {
  try {
    // 免疫チェック: 認証なしアクセスを遮断
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    // RBAC: products.view permission required
    const session = await AppSession.init(request, [contextEnv.SESSION_SECRET || '']);
    const role = requirePermission(session, 'products.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/content [GET]', success: true });

    setBridgeEnv(contextEnv);
    await ensureInitialized();

    const storage = getStorage();
    const allRecords = await storage.query(TABLES.AGENT_STATE, {});
    const contentRecords = allRecords.filter(r => {
      const rWithData = r as Record<string, unknown>;
      const key = rWithData.key as string | undefined || '';
      return key.startsWith('content_') || key.startsWith('article_') || key.startsWith('landing_');
    });

    const contents: ContentItem[] = contentRecords.map(r => {
      const rWithData = r as Record<string, unknown>;
      const d = (rWithData.data as Record<string, unknown>) || {};
      const key = (rWithData.key as string) || (rWithData.id as string) || 'unknown';
      const timestamp = (rWithData.timestamp as number) || Date.now();
      return {
        id: ((d.id as string) || key) as string,
        type: (d.type as 'article' | 'product_desc' | 'landing_page') || 'article',
        title: (d.title as string) || '(無題)',
        body: (d.body as string) || '',
        wordCount: (d.wordCount as number) || 0,
        keywords: (d.keywords as string[]) || [],
        seoScore: (d.seoScore as number) || 0,
        status: (d.status as 'published' | 'review' | 'draft') || 'draft',
        createdAt: (d.createdAt as number) || timestamp,
        updatedAt: timestamp,
      };
    });

    // ContentWriterのインメモリ状態もチェック
    const { getRegisteredAgents } = await import('../../agents/registration/agent-registration.js');
    const agents = (getRegisteredAgents?.() || []) as Array<{ id: string; getState?: () => Record<string, unknown> }>;
    const contentWriter = agents.find((a: { id: string }) => a.id === 'content-writer');
    if (contentWriter?.getState) {
      const state = contentWriter.getState() as Record<string, unknown>;
      if (state.recentOutputs) {
        for (const output of (state.recentOutputs as Array<Record<string, unknown>>) || []) {
          if (!contents.find(c => c.id === output.id)) {
            contents.push({
              id: output.id,
              type: output.type || 'article',
              title: output.title || '(無題)',
              body: output.body || '',
              wordCount: output.wordCount || 0,
              keywords: output.keywords || [],
              seoScore: output.seoScore || 0,
              status: 'draft',
              createdAt: output.createdAt || Date.now(),
              updatedAt: Date.now(),
            });
          }
        }
      }
    }

    return data({
      success: true,
      contents: contents.sort((a, b) => b.updatedAt - a.updatedAt),
      total: contents.length,
      stats: {
        published: contents.filter(c => c.status === 'published').length,
        review: contents.filter(c => c.status === 'review').length,
        draft: contents.filter(c => c.status === 'draft').length,
      },
    });
  } catch (error) {
    return data({
      success: true,
      contents: [],
      total: 0,
      stats: { published: 0, review: 0, draft: 0 },
      note: 'Agent未初期化 — コンテンツ生成後に表示されます',
    });
  }
}

// POST: コンテンツ操作（公開/非公開/削除）
export async function action({ request, context }: Route.ActionArgs) {
  const csrfError = await verifyCsrfForAdmin(request, context.env);
  if (csrfError) return csrfError;

  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // 免疫チェック: 認証なしアクセスを遮断
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    // RBAC: products.edit permission required
    const session = await AppSession.init(request, [contextEnv.SESSION_SECRET || '']);
    const role = requirePermission(session, 'products.edit');

    setBridgeEnv(contextEnv);

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
        details: validation.error.errors.map(e => e.message),
      }, { status: 400 });
    }

    const { action: act, contentId } = validation.data;

    const storage = getStorage();

    const newStatus = act === 'publish' ? 'published' : 'draft';
    await storage.upsert(TABLES.AGENT_STATE, {
      id: contentId,
      status: newStatus,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    } as unknown as Parameters<typeof storage.upsert>[1]);
    auditLog({
      action: 'content_edit',
      role,
      resource: contentId,
      detail: `status=${newStatus}`,
      success: true,
    });
    return data({ success: true, contentId, status: newStatus });
  } catch (error) {
    return data({ error: '操作に失敗しました' }, { status: 500 });
  }
}
