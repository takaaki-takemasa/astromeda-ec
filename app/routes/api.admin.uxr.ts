/**
 * API Route: GET /api/admin/uxr
 *
 * patch 0123 Phase A: ヒートマップ可視化のための集計エンドポイント。
 *
 * クエリ:
 * - ?action=pages          → 計測されたページ一覧（path + sample 数）
 * - ?action=heatmap&page=/ → そのページのクリック点群（最新200バッチ集約）
 *
 * セキュリティ: RateLimit → AdminAuth（BR-09 規約準拠）
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.uxr';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import {
  listKnownPaths,
  readBatchesForPath,
  listRecentSessions,
  readEventsForSession,
} from '~/lib/uxr-storage';

async function authenticateAdmin(request: Request, contextEnv: Env, context: unknown) {
  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, contextEnv);
  if (!auth.authenticated) return { error: auth.response };

  const sessionFromContext = (context as { session?: AppSession }).session;
  const session =
    sessionFromContext ??
    (await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]));

  const { requirePermission } = await import('~/lib/rbac');
  const role = requirePermission(session as AppSession, 'products.edit');

  return { role, session };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.uxr', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  const authResult = await authenticateAdmin(request, contextEnv, context);
  if ('error' in authResult) return authResult.error;

  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'pages';

  try {
    if (action === 'pages') {
      const pages = await listKnownPaths(contextEnv as unknown as Record<string, unknown>);
      auditLog({
        action: 'api_access',
        role: authResult.role,
        resource: 'api/admin/uxr?action=pages',
        success: true,
      });
      return data({ success: true, pages, total: pages.length });
    }

    if (action === 'heatmap') {
      const page = url.searchParams.get('page');
      if (!page) {
        return data({ success: false, error: 'page query param required' }, { status: 400 });
      }
      const days = Math.max(1, Math.min(30, Number(url.searchParams.get('days') || '7')));
      const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
      const batches = await readBatchesForPath(contextEnv as unknown as Record<string, unknown>, page, {
        maxBatches: 200,
        sinceMs,
      });

      // 集計: クリック点 / rage 点 / scroll depth ヒストグラム
      const clicks: Array<{ x: number; y: number; sel?: string; txt?: string; vw?: number; vh?: number }> = [];
      const rages: Array<{ x: number; y: number; c?: number }> = [];
      const scrollDepths: number[] = [];
      const sessions = new Set<string>();
      let pageviews = 0;

      for (const batch of batches) {
        sessions.add(batch.sid);
        for (const e of batch.events) {
          if (e.t === 'click' && typeof e.x === 'number' && typeof e.y === 'number') {
            clicks.push({ x: e.x, y: e.y, sel: e.sel, txt: e.txt, vw: e.vw, vh: e.vh });
          } else if (e.t === 'rage' && typeof e.x === 'number' && typeof e.y === 'number') {
            rages.push({ x: e.x, y: e.y, c: e.c });
          } else if (e.t === 'scroll' && typeof e.d === 'number') {
            scrollDepths.push(e.d);
          } else if (e.t === 'pv') {
            pageviews++;
          }
        }
      }

      // sel × txt で hot link top10
      const hotLinks: Record<string, { count: number; sel: string; txt?: string }> = {};
      for (const c of clicks) {
        if (!c.sel) continue;
        const k = c.sel + '|' + (c.txt || '');
        const slot = hotLinks[k] || { count: 0, sel: c.sel, txt: c.txt };
        slot.count += 1;
        hotLinks[k] = slot;
      }
      const topLinks = Object.values(hotLinks)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // scroll 平均最大値
      const avgScroll = scrollDepths.length
        ? Math.round(scrollDepths.reduce((s, d) => s + d, 0) / scrollDepths.length)
        : 0;

      auditLog({
        action: 'api_access',
        role: authResult.role,
        resource: `api/admin/uxr?action=heatmap&page=${page}`,
        success: true,
      });

      return data({
        success: true,
        page,
        days,
        sessions: sessions.size,
        pageviews,
        clicks,
        rages,
        avgScroll,
        topLinks,
        batchCount: batches.length,
      });
    }

    // patch 0124 Phase B: セッション一覧（admin sessions タブ用）
    if (action === 'sessions') {
      const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || '50')));
      const days = Math.max(1, Math.min(30, Number(url.searchParams.get('days') || '7')));
      const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
      const sessions = await listRecentSessions(contextEnv as unknown as Record<string, unknown>, {
        limit,
        sinceMs,
      });
      auditLog({
        action: 'api_access',
        role: authResult.role,
        resource: 'api/admin/uxr?action=sessions',
        success: true,
      });
      return data({
        success: true,
        days,
        sessions,
        total: sessions.length,
      });
    }

    // patch 0124 Phase B: 1セッション分の event timeline（admin 再生 UI 用）
    if (action === 'session') {
      const sid = url.searchParams.get('sid');
      if (!sid) {
        return data({ success: false, error: 'sid query param required' }, { status: 400 });
      }
      const result = await readEventsForSession(
        contextEnv as unknown as Record<string, unknown>,
        sid,
        { maxBatches: 200 },
      );
      // batch level の path / ts / ua を返す（client が path 切り替えを再現できるように）
      const batchMeta = result.batches.map((b) => ({
        path: b.path,
        ts: b.ts,
        ua: b.ua,
        eventCount: b.events.length,
      }));
      // patch 0124-fu: events を flatten し path を各 event に注入
      // （storage 層は { event, path } wrapper を返すが、UI 層は flat UxrEvent + path? を期待）
      const flatEvents = result.events.map(({ event, path: eventPath }) => ({
        ...event,
        path: eventPath,
      }));
      auditLog({
        action: 'api_access',
        role: authResult.role,
        resource: `api/admin/uxr?action=session&sid=${sid.slice(0, 12)}`,
        success: true,
      });
      return data({
        success: true,
        sid,
        batchCount: result.batches.length,
        eventCount: result.events.length,
        batches: batchMeta,
        events: flatEvents,
      });
    }

    return data({ success: false, error: `unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return data({ success: false, error: msg }, { status: 500 });
  }
}
