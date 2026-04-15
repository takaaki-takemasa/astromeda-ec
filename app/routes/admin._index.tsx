/**
 * Admin Dashboard — CEO向け管理画面（3分レビュー対応）
 *
 * T075-T088: Tab refactoring with error boundaries and URL routing
 * 8つのタブコンポーネントをadmin/tabs/以下に分割・管理
 */

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { data, useLoaderData, useSearchParams } from 'react-router';
import type { Route } from './+types/admin._index';
import { RouteErrorBoundary } from '~/components/astro/RouteErrorBoundary';
import { Sidebar, type SectionId } from '~/components/admin/Sidebar';
import { GlobalBar } from '~/components/admin/GlobalBar';
import { useIsMobile } from '~/hooks/useMediaQuery';
import { color, font, formatJPY } from '~/lib/design-tokens';

// DG-04: Lazy-load admin tab components to reduce initial bundle
// Only AdminHome is eagerly loaded (summary tab shown by default)
import { AdminHome } from '~/components/admin/tabs';

// DG-04: Heavy admin components lazy-loaded on tab click
const AdminContent = lazy(() => import('~/components/admin/tabs/AdminContent'));
const AdminMarketing = lazy(() => import('~/components/admin/tabs/AdminMarketing'));
const AdminAnalytics = lazy(() => import('~/components/admin/tabs/AdminAnalytics'));
const AdminAgents = lazy(() => import('~/components/admin/tabs/AdminAgents'));
const AdminPipelines = lazy(() => import('~/components/admin/tabs/AdminPipelines'));
const AdminControl = lazy(() => import('~/components/admin/tabs/AdminControl'));
const AdminSettings = lazy(() => import('~/components/admin/tabs/AdminSettings'));
const AdminProducts = lazy(() => import('~/components/admin/tabs/AdminProducts'));
const AdminCustomization = lazy(() => import('~/components/admin/tabs/AdminCustomization'));
const AdminHomepageCMS = lazy(() => import('~/components/admin/tabs/AdminHomepageCMS'));
const AdminPageEditor = lazy(() => import('~/components/admin/tabs/AdminPageEditor'));

// Type imports
import type {
  AgentStatus,
  PipelineStatus,
  SystemMetrics,
  StorageStats,
  AttributionData,
  RevenueData,
  QuickActionDefinition,
} from '~/types/admin';

// Agent Bridge imports
import {
  getAdminStatus,
  getAgentList,
  getPipelineList,
  isInitializedFlag,
  setBridgeEnv,
  getQuickActions,
  getAttributionSummary,
} from '~/lib/agent-bridge';
import { getStorage } from '../../agents/core/storage.js';

// ── Utility function ──
function bridgeToMetrics(status: Awaited<ReturnType<typeof getAdminStatus>>): SystemMetrics {
  return {
    andonStatus: status.system.andonStatus,
    totalAgents: status.agents.total,
    activeAgents: status.agents.active,
    healthyAgents: status.agents.healthy,
    totalPipelines: status.pipelines.total,
    activePipelines: status.pipelines.active,
    eventsPerMinute: status.bus.eventsPublished > 0
      ? Math.round(status.bus.eventsPublished / Math.max(status.system.uptime / 60, 1))
      : 0,
    cascadesActive: status.cascades.running,
    feedbackRecords: status.feedback.totalRecords,
    uptime: status.system.uptime,
  };
}

// ── Loader Data Type ──
interface LoaderData {
  metrics: SystemMetrics;
  agents: AgentStatus[];
  pipelines: PipelineStatus[];
  isLive: boolean;
  quickActions: QuickActionDefinition[];
  storageStats: StorageStats;
  attribution: AttributionData;
  revenueToday: RevenueData;
  revenue7d: RevenueData;
  revenue30d: RevenueData;
  revenue365d: RevenueData;
  pendingApprovals: number;
}

// ── Router Loader ──
export async function loader({ context }: Route.LoaderArgs) {
  setBridgeEnv(context.env as unknown as Record<string, string | undefined>);

  const emptyRevenue: RevenueData = {
    totalRevenue: 0,
    orderCount: 0,
    averageOrderValue: 0,
    currency: 'JPY',
    isMock: true,
  };

  try {
    const [adminStatus, agentList, pipelineList, attrSummary] = await Promise.all([
      getAdminStatus(),
      getAgentList(),
      getPipelineList(),
      getAttributionSummary(30).catch(() => ({
        totalRevenue: 0,
        attributedOrders: 0,
        topChannels: [],
      })),
    ]);

    const quickActions = getQuickActions();

    let storageStats: StorageStats = { totalRecords: 0, tables: {} };
    try {
      const storage = getStorage();
      const stats = await storage.stats();
      const tableRecords: Record<string, number> = {};
      for (const [key, val] of Object.entries(stats)) {
        if (typeof val === 'number') tableRecords[key] = val;
      }
      storageStats = {
        totalRecords: Object.values(tableRecords).reduce((a, b) => a + b, 0),
        tables: tableRecords,
      };
    } catch {
      /* Storage未初期化時はデフォルト値 */
    }

    let revenueToday = emptyRevenue;
    let revenue7d = emptyRevenue;
    let revenue30d = emptyRevenue;
    let revenue365d = emptyRevenue;
    try {
      const { getAdminClient } = await import('../../agents/core/shopify-admin.js');
      const client = getAdminClient();
      if (client) {
        const toRevenueData = (r: { totalRevenue: number; totalOrders: number; avgOrderValue: number; currency?: string } | null): RevenueData => {
          if (!r) return emptyRevenue;
          return {
            totalRevenue: r.totalRevenue,
            orderCount: r.totalOrders,
            averageOrderValue: r.avgOrderValue,
            currency: r.currency || 'JPY',
            isMock: false,
          };
        };
        const [rToday, r7, r30, r365] = await Promise.all([
          client.getOrderSummary(1).catch(() => null),
          client.getOrderSummary(7).catch(() => null),
          client.getOrderSummary(30).catch(() => null),
          client.getOrderSummary(365).catch(() => null),
        ]);
        revenueToday = toRevenueData(rToday);
        revenue7d = toRevenueData(r7);
        revenue30d = toRevenueData(r30);
        revenue365d = toRevenueData(r365);
      }
    } catch {
      /* Shopify API未接続時はモック */
    }

    let pendingApprovals = 0;
    try {
      const { getApprovalQueue } = await import('../../agents/core/approval-queue.js');
      const queue = getApprovalQueue();
      const aqStats = await queue.getStats();
      pendingApprovals = aqStats.pending;
    } catch {
      /* silent */
    }

    return data({
      metrics: bridgeToMetrics(adminStatus),
      agents: agentList,
      pipelines: pipelineList,
      isLive: isInitializedFlag(),
      quickActions,
      storageStats,
      attribution: attrSummary as AttributionData,
      revenueToday,
      revenue7d,
      revenue30d,
      revenue365d,
      pendingApprovals,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development')
      console.error('[Admin Loader] Agent bridge 完全障害:', error);
    return data({
      metrics: {
        andonStatus: 'yellow' as const,
        totalAgents: 0,
        activeAgents: 0,
        healthyAgents: 0,
        totalPipelines: 0,
        activePipelines: 0,
        eventsPerMinute: 0,
        cascadesActive: 0,
        feedbackRecords: 0,
        uptime: 0,
      },
      agents: [],
      pipelines: [],
      isLive: false,
      quickActions: [],
      storageStats: { totalRecords: 0, tables: {} },
      attribution: { totalRevenue: 0, attributedOrders: 0, topChannels: [] },
      revenueToday: emptyRevenue,
      revenue7d: emptyRevenue,
      revenue30d: emptyRevenue,
      revenue365d: emptyRevenue,
      pendingApprovals: 0,
    });
  }
}

// ── Meta ──
export const meta = () => [
  { title: 'ASTROMEDA | 管理ダッシュボード' },
  { name: 'robots', content: 'noindex, nofollow' },
];

// ── Tab configuration ──
type SubTab = 'summary' | 'content' | 'products' | 'customization' | 'homepage' | 'pageEditor' | 'marketing' | 'analytics' | 'agents' | 'pipelines' | 'control' | 'update';

const SECTION_TABS: Record<SectionId, { tabs: SubTab[]; default: SubTab }> = {
  home: { tabs: ['summary'], default: 'summary' },
  commerce: { tabs: ['content', 'products', 'customization', 'homepage', 'pageEditor', 'marketing', 'analytics'], default: 'content' },
  ai: { tabs: ['agents'], default: 'agents' },
  operations: { tabs: ['pipelines', 'control'], default: 'pipelines' },
  settings: { tabs: ['update'], default: 'update' },
};

const SUB_TAB_LABELS: Record<SubTab, string> = {
  summary: '経営サマリー',
  content: 'コンテンツ',
  products: '商品管理',
  customization: 'カスタマイズ',
  homepage: 'ホームページ',
  pageEditor: 'ページ編集',
  marketing: 'マーケティング',
  analytics: 'データ分析',
  agents: 'AI運用',
  pipelines: '自動化',
  control: '緊急対応',
  update: '設定',
};

// ── Main Component ──
export default function AdminDashboard() {
  const loaderData = useLoaderData<LoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [section, setSection] = useState<SectionId>('home');
  const [subTab, setSubTab] = useState<SubTab>('summary');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();

  const [metrics, setMetrics] = useState<SystemMetrics>(loaderData.metrics);
  const [agents, setAgents] = useState<AgentStatus[]>(loaderData.agents);
  const [pipelines, setPipelines] = useState<PipelineStatus[]>(loaderData.pipelines);
  const [isLive, setIsLive] = useState(loaderData.isLive);
  const [andonConfirm, setAndonConfirm] = useState(false);
  const [quickActions] = useState<QuickActionDefinition[]>(loaderData.quickActions);
  const [actionResults, setActionResults] = useState<
    Record<string, { loading: boolean; result?: unknown; error?: string }>
  >({});
  const [storageStats] = useState<StorageStats>(loaderData.storageStats);
  const [attribution] = useState<AttributionData>(loaderData.attribution);
  const [revenueToday] = useState<RevenueData>(loaderData.revenueToday);
  const [revenue7d] = useState<RevenueData>(loaderData.revenue7d);
  const [revenue30d] = useState<RevenueData>(loaderData.revenue30d);
  const [revenue365d] = useState<RevenueData>(loaderData.revenue365d);
  const [pendingApprovals] = useState(loaderData.pendingApprovals);

  // Sync URL params with tab state (T083: URL routing)
  useEffect(() => {
    const tabParam = searchParams.get('tab') as SubTab | null;
    if (tabParam && Object.keys(SUB_TAB_LABELS).includes(tabParam)) {
      setSubTab(tabParam);
    }
  }, [searchParams]);

  const handleNavigate = useCallback((id: SectionId) => {
    setSection(id);
    const defaultTab = SECTION_TABS[id].default;
    setSubTab(defaultTab);
    setSearchParams({ tab: defaultTab });
  }, [setSearchParams]);

  const handleTabChange = useCallback((newTab: SubTab) => {
    setSubTab(newTab);
    setSearchParams({ tab: newTab });
  }, [setSearchParams]);

  // Auto-update (10 seconds)
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5_000); // 5s timeout for internal API
      try {
        const res = await fetch('/api/admin/status', { signal: controller.signal });
        if (!res.ok) return;
        const status = (await res.json()) as Record<string, unknown>;
        if ((status as unknown as {error?: unknown}).error) return;
        const typedStatus = status as unknown as {
          system?: {andonStatus?: string; uptime?: number};
          agents?: {total?: number; active?: number; healthy?: number};
          pipelines?: {total?: number; active?: number};
          bus?: {eventsPublished?: number};
        };
        setMetrics({
          andonStatus: typedStatus.system?.andonStatus || 'yellow',
          totalAgents: typedStatus.agents?.total || 0,
          activeAgents: typedStatus.agents?.active || 0,
          healthyAgents: typedStatus.agents?.healthy || 0,
          totalPipelines: typedStatus.pipelines?.total || 0,
          activePipelines: typedStatus.pipelines?.active || 0,
          eventsPerMinute:
            (typedStatus.bus?.eventsPublished || 0) > 0
              ? Math.round(
                  (typedStatus.bus?.eventsPublished || 0) / Math.max((typedStatus.system?.uptime || 1) / 60, 1)
                )
              : 0,
          cascadesActive: status.cascades?.running || 0,
          feedbackRecords: status.feedback?.totalRecords || 0,
          uptime: status.system?.uptime || 0,
        });
      } catch {
        /* ポーリング失敗は静かに無視 */
      } finally {
        clearTimeout(timeoutId);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isLive]);

  const handleAndonPull = useCallback(() => {
    setAndonConfirm(true);
  }, []);

  const confirmAndon = useCallback(async () => {
    const action = metrics.andonStatus === 'red' ? 'clear' : 'pull';
    setAndonConfirm(false);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000); // 5s timeout for internal API
    try {
      const res = await fetch('/api/admin/andon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: 'CEO手動操作' }),
        signal: controller.signal,
      });
      const result = (await res.json()) as Record<string, unknown>;
      if ((result as unknown as {success?: unknown}).success) {
        setMetrics((prev) => ({
          ...prev,
          andonStatus: result.andonStatus || (action === 'pull' ? 'red' : 'green'),
        }));
      } else {
        setMetrics((prev) => ({
          ...prev,
          andonStatus: action === 'pull' ? 'red' : 'green',
        }));
      }
    } catch {
      setMetrics((prev) => ({
        ...prev,
        andonStatus: action === 'pull' ? 'red' : 'green',
      }));
    } finally {
      clearTimeout(timeoutId);
    }
  }, [metrics.andonStatus]);

  const handleQuickAction = useCallback(async (actionId: string) => {
    setActionResults((prev) => ({ ...prev, [actionId]: { loading: true } }));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000); // 5s timeout for internal API
    try {
      const res = await fetch('/api/admin/quick-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId }),
        signal: controller.signal,
      });
      const result = (await res.json()) as Record<string, unknown>;
      const typedResult = result as unknown as {success?: boolean; result?: unknown; error?: string};
      setActionResults((prev) => ({
        ...prev,
        [actionId]: {
          loading: false,
          result: typedResult.success ? typedResult.result : null,
          error: typedResult.error,
        },
      }));
    } catch (err) {
      setActionResults((prev) => ({
        ...prev,
        [actionId]: { loading: false, error: '通信エラー' },
      }));
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const currentTabs = SECTION_TABS[section].tabs;

  return (
    <div
      style={{
        display: 'flex',
        background: color.bg0,
        minHeight: '100vh',
        fontFamily: font.family,
        color: color.text,
      }}
    >
      <Sidebar
        active={section}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        badges={pendingApprovals > 0 ? { operations: pendingApprovals } : {}}
        isMobile={isMobile}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <GlobalBar
          andonStatus={metrics.andonStatus}
          pendingApprovals={pendingApprovals}
          onAndonClick={handleAndonPull}
          isMobile={isMobile}
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        {currentTabs.length > 1 && (
          <div
            style={{
              display: 'flex',
              gap: 0,
              borderBottom: `1px solid ${color.border}`,
              padding: '0 32px',
              background: color.bg0,
            }}
          >
            {currentTabs.map((t) => (
              <button
                key={t}
                onClick={() => handleTabChange(t)}
                style={{
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: subTab === t ? 600 : 400,
                  color: subTab === t ? color.cyan : color.textMuted,
                  background: 'none',
                  border: 'none',
                  borderBottom:
                    subTab === t ? `2px solid ${color.cyan}` : '2px solid transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all .15s',
                  fontFamily: font.family,
                }}
              >
                {SUB_TAB_LABELS[t]}
              </button>
            ))}
          </div>
        )}

        <main style={{ flex: 1, padding: '24px 32px', overflow: 'auto' }}>
          {subTab === 'summary' && (
            <AdminHome
              metrics={metrics}
              agents={agents}
              pipelines={pipelines}
              storageStats={storageStats}
              attribution={attribution}
              revenueToday={revenueToday}
              revenue7d={revenue7d}
              revenue30d={revenue30d}
              revenue365d={revenue365d}
              pendingApprovals={pendingApprovals}
            />
          )}
          {subTab === 'content' && (
            <Suspense fallback={<div className="animate-pulse p-8" style={{color: color.textMuted}}>読み込み中...</div>}>
              <AdminContent />
            </Suspense>
          )}
          {subTab === 'products' && (
            <Suspense fallback={<div className="animate-pulse p-8" style={{color: color.textMuted}}>読み込み中...</div>}>
              <AdminProducts />
            </Suspense>
          )}
          {subTab === 'customization' && (
            <Suspense fallback={<div className="animate-pulse p-8" style={{color: color.textMuted}}>読み込み中...</div>}>
              <AdminCustomization />
            </Suspense>
          )}
          {subTab === 'homepage' && (
            <Suspense fallback={<div className="animate-pulse p-8" style={{color: color.textMuted}}>読み込み中...</div>}>
              <AdminHomepageCMS />
            </Suspense>
          )}
          {subTab === 'pageEditor' && (
            <Suspense fallback={<div className="animate-pulse p-8" style={{color: color.textMuted}}>読み込み中...</div>}>
              <AdminPageEditor />
            </Suspense>
          )}
          {subTab === 'marketing' && (
            <Suspense fallback={<div className="animate-pulse p-8" style={{color: color.textMuted}}>読み込み中...</div>}>
              <AdminMarketing />
            </Suspense>
          )}
          {subTab === 'analytics' && (
            <Suspense fallback={<div className="animate-pulse p-8" style={{color: color.textMuted}}>読み込み中...</div>}>
              <AdminAnalytics />
            </Suspense>
          )}
          {subTab === 'agents' && (
            <Suspense fallback={<div className="animate-pulse p-8" style={{color: color.textMuted}}>読み込み中...</div>}>
              <AdminAgents agents={agents} />
            </Suspense>
          )}
          {subTab === 'pipelines' && (
            <Suspense fallback={<div className="animate-pulse p-8" style={{color: color.textMuted}}>読み込み中...</div>}>
              <AdminPipelines pipelines={pipelines} />
            </Suspense>
          )}
          {subTab === 'control' && (
            <Suspense fallback={<div className="animate-pulse p-8" style={{color: color.textMuted}}>読み込み中...</div>}>
              <AdminControl
                metrics={metrics}
                onAndonPull={handleAndonPull}
                andonConfirm={andonConfirm}
                onAndonConfirm={confirmAndon}
                onAndonCancel={() => setAndonConfirm(false)}
                quickActions={quickActions}
                actionResults={actionResults}
                onExecuteAction={handleQuickAction}
              />
            </Suspense>
          )}
          {subTab === 'update' && (
            <Suspense fallback={<div className="animate-pulse p-8" style={{color: color.textMuted}}>読み込み中...</div>}>
              <AdminSettings />
            </Suspense>
          )}
        </main>
      </div>

      {andonConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
          }}
          onClick={() => setAndonConfirm(false)}
        >
          <div
            style={{
              background: color.bg1,
              border: `1px solid ${color.border}`,
              borderRadius: '12px',
              padding: '32px',
              maxWidth: '400px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: '16px', color: color.text }}>
              {metrics.andonStatus === 'red' ? 'Andon解除' : 'Andon発動'}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: color.textMuted }}>
              {metrics.andonStatus === 'red'
                ? '全システムを通常運用に復帰させますか？'
                : '全AI処理を緊急停止します。よろしいですか？'}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAndonConfirm(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: `1px solid ${color.border}`,
                  background: 'transparent',
                  color: color.textMuted,
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontFamily: font.family,
                }}
              >
                キャンセル
              </button>
              <button
                onClick={confirmAndon}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background:
                    metrics.andonStatus === 'red' ? color.green : color.red,
                  color: '#000',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px',
                  fontFamily: font.family,
                }}
              >
                {metrics.andonStatus === 'red' ? '解除する' : '緊急停止'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}} />
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };
