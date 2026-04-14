/**
 * SEO管理API — L15感覚統合（SEO視覚化）
 *
 * SEODirector のキーワード調査・監査・ランキング結果をCEOが確認するためのAPI
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.seo';
import { setBridgeEnv, ensureInitialized } from '~/lib/agent-bridge';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';

interface RegisteredAgent {
  id: string;
  getState?: () => Record<string, unknown>;
}

interface KeywordData {
  keyword: string;
  volume?: number;
  difficulty?: number;
  cpc?: number;
  intent?: string;
}

interface AuditData {
  score?: number;
  issues?: unknown[];
  note?: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  try {
    // 免疫チェック: 認証なしアクセスを遮断
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const auth = await verifyAdminAuth(request, (context as unknown as { env: Env }).env);
    if (!auth.authenticated) return auth.response;

    // RBAC: geo.view permission required
    const session = await AppSession.init(request, [(context as unknown as { env: Env }).env.SESSION_SECRET]);
    const role = requirePermission(session, 'geo.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/seo [GET]', success: true });

    setBridgeEnv((context as unknown as { env: Env }).env || {});
    await ensureInitialized();

    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'all';

    const { getRegisteredAgents } = await import('../../agents/registration/agent-registration.js');
    const agents = (getRegisteredAgents?.() || []) as RegisteredAgent[];
    const seoDirector = agents.find((a: RegisteredAgent) => a.id === 'seo-director');

    let keywords: KeywordData[] = [];
    let audit: AuditData | null = null;
    let suggestions: unknown[] = [];
    let rankings: unknown[] = [];

    if (seoDirector?.getState) {
      const state = seoDirector.getState() as Record<string, unknown>;
      // キーワードDBからデータ取得
      if ((state.keywordDatabase as Map<string, unknown> | undefined)?.values) {
        keywords = Array.from((state.keywordDatabase as Map<string, unknown>).values()).slice(0, 20);
      }
      if (state.lastAudit) audit = state.lastAudit as unknown as {score?: number; note?: string};
      if (state.lastSuggestions) suggestions = state.lastSuggestions as unknown as Array<{text?: string}>;
      if (state.lastRankings) rankings = state.lastRankings as unknown as Array<{rank?: number; url?: string}>;
    }

    // キーワードが空の場合のフォールバック（値0 — SEOエージェント起動後に実データ取得）
    if (keywords.length === 0) {
      keywords = [
        { keyword: 'ゲーミングPC', volume: 0, difficulty: 0, cpc: 0, intent: 'commercial', source: 'placeholder' },
        { keyword: 'ゲーミングPC おすすめ', volume: 0, difficulty: 0, cpc: 0, intent: 'commercial', source: 'placeholder' },
        { keyword: 'Astromeda', volume: 0, difficulty: 0, cpc: 0, intent: 'navigational', source: 'placeholder' },
        { keyword: 'コラボPC', volume: 0, difficulty: 0, cpc: 0, intent: 'commercial', source: 'placeholder' },
        { keyword: 'ゲーミングPC BTO', volume: 0, difficulty: 0, cpc: 0, intent: 'transactional', source: 'placeholder' },
      ];
    }

    return data({
      success: true,
      keywords: keywords.sort((a: KeywordData, b: KeywordData) => (b.volume || 0) - (a.volume || 0)),
      audit: audit || { score: 0, issues: [], note: 'SEO監査未実行 — Quick Actionsから実行してください' },
      suggestions,
      rankings,
      agentActive: !!seoDirector,
    });
  } catch (error) {
    return data({
      success: true,
      keywords: [],
      audit: { score: 0, issues: [], note: 'Agent未初期化' },
      suggestions: [],
      rankings: [],
      agentActive: false,
    });
  }
}
