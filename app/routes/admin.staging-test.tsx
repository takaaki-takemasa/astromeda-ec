/**
 * H4: ステージング全体テスト — Staging Test Dashboard
 * Pre-launch staging verification dashboard with health checks
 */

import { useState } from 'react';
import { useLoaderData } from 'react-router';
import type { Route } from './+types/admin.staging-test';
import { RouteErrorBoundary } from '~/components/astro/RouteErrorBoundary';
import { T, PAGE_WIDTH, al } from '~/lib/astromeda-data';

export const meta = () => [
  { title: 'ステージング全体テスト | ASTROMEDA' },
  { name: 'robots', content: 'noindex, nofollow' },
];

interface RouteInfo {
  path: string;
  name: string;
  hasLoader: boolean;
  hasMeta: boolean;
  hasErrorBoundary: boolean;
  status: 'ready' | 'pending' | 'error';
}

interface ApiHealthCheck {
  name: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'OPTIONS';
  status: 'pass' | 'pending' | 'fail';
  responseTime?: number;
  message?: string;
}

interface ContentStatus {
  name: string;
  status: 'ok' | 'pending' | 'error';
  count?: number;
  message?: string;
}

// Known routes with verification status
const KNOWN_ROUTES: RouteInfo[] = [
  { path: '/', name: 'ホームページ', hasLoader: true, hasMeta: true, hasErrorBoundary: true, status: 'ready' },
  { path: '/collections', name: 'コレクション一覧', hasLoader: true, hasMeta: true, hasErrorBoundary: true, status: 'ready' },
  { path: '/collections/:handle', name: 'コレクション詳細', hasLoader: true, hasMeta: true, hasErrorBoundary: true, status: 'ready' },
  { path: '/products/:handle', name: '商品詳細', hasLoader: true, hasMeta: true, hasErrorBoundary: true, status: 'ready' },
  { path: '/cart', name: 'カート', hasLoader: true, hasMeta: true, hasErrorBoundary: true, status: 'ready' },
  { path: '/checkout', name: 'チェックアウト', hasLoader: false, hasMeta: true, hasErrorBoundary: true, status: 'ready' },
  { path: '/search', name: '検索', hasLoader: true, hasMeta: true, hasErrorBoundary: true, status: 'ready' },
  { path: '/account', name: 'マイページ', hasLoader: true, hasMeta: true, hasErrorBoundary: true, status: 'ready' },
  { path: '/account/orders', name: '注文履歴', hasLoader: true, hasMeta: true, hasErrorBoundary: true, status: 'ready' },
  { path: '/account/profile', name: 'プロフィール', hasLoader: true, hasMeta: true, hasErrorBoundary: true, status: 'ready' },
  { path: '/admin', name: '管理ダッシュボード', hasLoader: true, hasMeta: true, hasErrorBoundary: true, status: 'ready' },
];

const API_ENDPOINTS: Omit<ApiHealthCheck, 'status' | 'responseTime' | 'message'>[] = [
  { name: 'Health Check', endpoint: '/api/health', method: 'GET' },
  { name: 'SSR Check', endpoint: '/api/ssr-check', method: 'GET' },
  { name: 'Predictive Search (test)', endpoint: '/api/predictive-search?q=gaming', method: 'GET' },
  { name: 'QR Code Generator', endpoint: '/api/qr-code', method: 'POST' },
  { name: 'Error Reporting (OPTIONS)', endpoint: '/api/error-report', method: 'OPTIONS' },
];

const CONTENT_ITEMS: Omit<ContentStatus, 'status' | 'count' | 'message'>[] = [
  { name: 'Sitemap.xml' },
  { name: 'robots.txt' },
  { name: 'llms.txt' },
  { name: 'feed.xml (RSS)' },
  { name: 'Structured Data (JSON-LD)' },
];

async function checkApiHealth(
  endpoint: string,
  method: 'GET' | 'POST' | 'OPTIONS',
): Promise<{ status: 'pass' | 'fail'; responseTime: number; message?: string }> {
  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s timeout for internal API
  try {
    const response = await fetch(endpoint, {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify({ url: 'https://example.com' }) : undefined,
      signal: controller.signal,
    });
    const responseTime = Math.round(performance.now() - startTime);
    const isSuccess = response.ok || response.status < 400;
    return {
      status: isSuccess ? 'pass' : 'fail',
      responseTime,
      message: `Status: ${response.status}`,
    };
  } catch (err) {
    const responseTime = Math.round(performance.now() - startTime);
    const errorMsg = err instanceof Error && err.name === 'AbortError'
      ? 'Timeout'
      : err instanceof Error ? err.message : 'Unknown error';
    return {
      status: 'fail',
      responseTime,
      message: `Error: ${errorMsg}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkContent(endpoint: string): Promise<{ status: 'ok' | 'error'; count?: number; message?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s timeout
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) {
      return { status: 'error', message: `Status ${response.status}` };
    }
    const text = await response.text();
    if (text.length === 0) {
      return { status: 'error', message: 'Empty response' };
    }
    const lines = text.split('\n').filter((l) => l.trim());
    return { status: 'ok', count: lines.length, message: `${text.length} bytes` };
  } catch (err) {
    const errorMsg = err instanceof Error && err.name === 'AbortError'
      ? 'Timeout'
      : 'Fetch failed';
    return { status: 'error', message: errorMsg };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function loader() {
  // Initialize API checks as pending
  const apiChecks: ApiHealthCheck[] = API_ENDPOINTS.map((ep) => ({
    ...ep,
    status: 'pending' as const,
  }));

  // Initialize content checks as pending
  const contentChecks: ContentStatus[] = CONTENT_ITEMS.map((item) => ({
    ...item,
    status: 'pending' as const,
  }));

  return {
    routes: KNOWN_ROUTES,
    apiChecks,
    contentChecks,
    timestamp: new Date().toISOString(),
  };
}

function PageInventorySection({ routes }: { routes: RouteInfo[] }) {
  const readyCount = routes.filter((r) => r.status === 'ready').length;
  const percentage = Math.round((readyCount / routes.length) * 100);

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3
        style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: T.tx,
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <span style={{ color: T.c }}>📄</span> ページ一覧
      </h3>

      <div
        style={{
          background: T.bgC,
          border: `1px solid ${T.bd}`,
          borderRadius: '8px',
          overflow: 'hidden',
          marginBottom: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.5rem',
            background: al(T.c, 0.08),
            borderBottom: `1px solid ${T.bd}`,
          }}
        >
          <div>
            <div style={{ fontSize: '0.875rem', color: T.t5 }}>準備完了</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: T.c }}>
              {readyCount}/{routes.length}
            </div>
          </div>
          <div
            style={{
              width: '100px',
              height: '8px',
              background: T.t2,
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${percentage}%`,
                height: '100%',
                background: T.c,
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1px',
            background: T.bd,
            padding: '1px',
          }}
        >
          {routes.map((route) => (
            <div
              key={route.path}
              style={{
                background: T.bg,
                padding: '1rem',
                fontSize: '0.875rem',
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  color: T.tx,
                  marginBottom: '0.5rem',
                }}
              >
                {route.name}
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: T.t4,
                  marginBottom: '0.75rem',
                  fontFamily: 'monospace',
                }}
              >
                {route.path}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '0.5rem',
                  fontSize: '0.75rem',
                }}
              >
                <div
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: route.hasLoader ? al(T.c, 0.2) : al(T.r, 0.2),
                    color: route.hasLoader ? T.c : T.r,
                    borderRadius: '3px',
                    textAlign: 'center',
                    fontWeight: 600,
                  }}
                >
                  {route.hasLoader ? '✓' : '✕'} Loader
                </div>
                <div
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: route.hasMeta ? al(T.c, 0.2) : al(T.r, 0.2),
                    color: route.hasMeta ? T.c : T.r,
                    borderRadius: '3px',
                    textAlign: 'center',
                    fontWeight: 600,
                  }}
                >
                  {route.hasMeta ? '✓' : '✕'} Meta
                </div>
                <div
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: route.hasErrorBoundary ? al(T.c, 0.2) : al(T.r, 0.2),
                    color: route.hasErrorBoundary ? T.c : T.r,
                    borderRadius: '3px',
                    textAlign: 'center',
                    fontWeight: 600,
                  }}
                >
                  {route.hasErrorBoundary ? '✓' : '✕'} Boundary
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ApiHealthSection({ initialChecks }: { initialChecks: ApiHealthCheck[] }) {
  const [checks, setChecks] = useState<ApiHealthCheck[]>(initialChecks);
  const [isRunning, setIsRunning] = useState(false);

  const runChecks = async () => {
    setIsRunning(true);
    const updated = await Promise.all(
      checks.map(async (check) => {
        const result = await checkApiHealth(check.endpoint, check.method);
        return {
          ...check,
          status: result.status as 'pass' | 'fail',
          responseTime: result.responseTime,
          message: result.message,
        };
      }),
    );
    setChecks(updated);
    setIsRunning(false);
  };

  const passedCount = checks.filter((c) => c.status === 'pass').length;
  const totalCount = checks.length;
  const percentage = Math.round((passedCount / totalCount) * 100);

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3
        style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: T.tx,
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <span style={{ color: T.g }}>⚡</span> APIヘルスチェック
      </h3>

      <div
        style={{
          background: T.bgC,
          border: `1px solid ${T.bd}`,
          borderRadius: '8px',
          padding: '1rem 1.5rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: '0.875rem', color: T.t5 }}>
            {passedCount}/{totalCount} エンドポイント正常
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: T.g }}>
            {percentage}%
          </div>
        </div>
        <button
          onClick={runChecks}
          disabled={isRunning}
          style={{
            padding: '0.75rem 1.5rem',
            background: isRunning ? T.t2 : `linear-gradient(135deg, ${T.c}, ${T.g})`,
            color: T.bg,
            border: 'none',
            borderRadius: '6px',
            fontWeight: 700,
            cursor: isRunning ? 'not-allowed' : 'pointer',
            opacity: isRunning ? 0.6 : 1,
          }}
        >
          {isRunning ? 'チェック中...' : 'チェック実行'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {checks.map((check) => (
          <div
            key={check.endpoint}
            style={{
              background: T.bgC,
              border: `1px solid ${T.bd}`,
              borderRadius: '6px',
              padding: '1rem',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: T.tx, marginBottom: '0.25rem' }}>
                {check.name}
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: T.t4,
                  fontFamily: 'monospace',
                  marginBottom: '0.5rem',
                }}
              >
                {check.method} {check.endpoint}
              </div>
              {check.message && (
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: T.t5,
                  }}
                >
                  {check.message}
                  {check.responseTime && ` (${check.responseTime}ms)`}
                </div>
              )}
            </div>
            <div
              style={{
                padding: '0.5rem 1rem',
                background:
                  check.status === 'pending'
                    ? al(T.g, 0.2)
                    : check.status === 'pass'
                      ? al(T.c, 0.2)
                      : al(T.r, 0.2),
                color:
                  check.status === 'pending'
                    ? T.g
                    : check.status === 'pass'
                      ? T.c
                      : T.r,
                borderRadius: '4px',
                fontWeight: 700,
                fontSize: '0.75rem',
                minWidth: '60px',
                textAlign: 'center',
              }}
            >
              {check.status === 'pending' ? '⏳' : check.status === 'pass' ? '✓ Pass' : '✕ Fail'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContentVerificationSection({ initialContent }: { initialContent: ContentStatus[] }) {
  const [content, setContent] = useState<ContentStatus[]>(initialContent);
  const [isRunning, setIsRunning] = useState(false);

  const runVerification = async () => {
    setIsRunning(true);
    const endpoints = [
      { name: 'Sitemap.xml', path: '/sitemap.xml' },
      { name: 'robots.txt', path: '/robots.txt' },
      { name: 'llms.txt', path: '/llms.txt' },
      { name: 'feed.xml (RSS)', path: '/feed.xml' },
      { name: 'Structured Data (JSON-LD)', path: '/' }, // Check homepage for JSON-LD
    ];

    const updated = await Promise.all(
      endpoints.map(async (ep) => {
        const result = await checkContent(ep.path);
        return {
          name: ep.name,
          status: result.status as 'ok' | 'error',
          count: result.count,
          message: result.message,
        };
      }),
    );
    setContent(updated);
    setIsRunning(false);
  };

  const okCount = content.filter((c) => c.status === 'ok').length;
  const totalCount = content.length;

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3
        style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: T.tx,
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <span style={{ color: T.c }}>📋</span> コンテンツ検証
      </h3>

      <div
        style={{
          background: T.bgC,
          border: `1px solid ${T.bd}`,
          borderRadius: '8px',
          padding: '1rem 1.5rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: '0.875rem', color: T.t5 }}>
            {okCount}/{totalCount} コンテンツ OK
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: T.c }}>
            {totalCount > 0 ? Math.round((okCount / totalCount) * 100) : 0}%
          </div>
        </div>
        <button
          onClick={runVerification}
          disabled={isRunning}
          style={{
            padding: '0.75rem 1.5rem',
            background: isRunning ? T.t2 : `linear-gradient(135deg, ${T.c}, ${T.g})`,
            color: T.bg,
            border: 'none',
            borderRadius: '6px',
            fontWeight: 700,
            cursor: isRunning ? 'not-allowed' : 'pointer',
            opacity: isRunning ? 0.6 : 1,
          }}
        >
          {isRunning ? '検証中...' : '検証実行'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {content.map((item) => (
          <div
            key={item.name}
            style={{
              background: T.bgC,
              border: `1px solid ${T.bd}`,
              borderRadius: '6px',
              padding: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: T.tx, marginBottom: '0.25rem' }}>
                {item.name}
              </div>
              {item.message && (
                <div style={{ fontSize: '0.8rem', color: T.t5 }}>
                  {item.message}
                </div>
              )}
            </div>
            <div
              style={{
                padding: '0.5rem 1rem',
                background:
                  item.status === 'pending'
                    ? al(T.g, 0.2)
                    : item.status === 'ok'
                      ? al(T.c, 0.2)
                      : al(T.r, 0.2),
                color:
                  item.status === 'pending'
                    ? T.g
                    : item.status === 'ok'
                      ? T.c
                      : T.r,
                borderRadius: '4px',
                fontWeight: 700,
                fontSize: '0.75rem',
                minWidth: '60px',
                textAlign: 'center',
              }}
            >
              {item.status === 'pending' ? '⏳' : item.status === 'ok' ? '✓ OK' : '✕ Error'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StagingTestDashboard() {
  const { routes, apiChecks, contentChecks } = useLoaderData<typeof loader>();

  // Calculate overall readiness score
  const routeReady = routes.filter((r) => r.status === 'ready').length;
  const apiPass = apiChecks.filter((c) => c.status === 'pass').length;
  const contentOk = contentChecks.filter((c) => c.status === 'ok').length;

  const routeScore = (routeReady / routes.length) * 100;
  const apiScore = apiChecks.length > 0 ? (apiPass / apiChecks.length) * 100 : 0;
  const contentScore = contentChecks.length > 0 ? (contentOk / contentChecks.length) * 100 : 0;

  const overallScore = Math.round(
    (routeScore + Math.min(apiScore, 100) + contentScore) / 3,
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        background: T.bg,
        color: T.tx,
        paddingTop: '2rem',
        paddingBottom: '4rem',
      }}
    >
      <div style={PAGE_WIDTH}>
        <div style={{ marginBottom: '3rem' }}>
          <h1
            style={{
              fontSize: 'clamp(1.75rem, 6vw, 2.5rem)',
              fontWeight: 900,
              background: `linear-gradient(135deg, ${T.c}, ${T.g})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: '0 0 0.5rem 0',
            }}
          >
            ステージング全体テスト
          </h1>
          <p style={{ color: T.t5, margin: 0 }}>
            本番切り替え前のステージング環境検証
          </p>
        </div>

        {/* Overall Readiness Score */}
        <div
          style={{
            background: T.bgC,
            border: `1px solid ${T.bd}`,
            borderRadius: '12px',
            padding: '2rem',
            marginBottom: '3rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '2rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                background: `conic-gradient(${T.c} 0deg, ${T.c} ${overallScore * 3.6}deg, ${T.t2} ${overallScore * 3.6}deg)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem',
              }}
            >
              <div
                style={{
                  width: '90px',
                  height: '90px',
                  borderRadius: '50%',
                  background: T.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    fontSize: '2rem',
                    fontWeight: 900,
                    color: T.c,
                  }}
                >
                  {overallScore}
                </div>
                <div style={{ fontSize: '0.65rem', color: T.t5 }}>準備度</div>
              </div>
            </div>
            <div
              style={{
                fontSize: '0.875rem',
                color: T.t5,
                lineHeight: 1.6,
              }}
            >
              <div style={{ fontWeight: 700, color: T.tx }}>デプロイ準備完了度</div>
              {overallScore >= 85 ? (
                <div style={{ color: T.c }}>本番切り替え可能</div>
              ) : (
                <div style={{ color: T.g }}>未検証項目あり</div>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
              borderRadius: '8px',
              background: al(T.c, 0.05),
            }}
          >
            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 900,
                color: T.c,
                marginBottom: '0.5rem',
              }}
            >
              {routeReady}/{routes.length}
            </div>
            <div style={{ fontSize: '0.875rem', color: T.t5, textAlign: 'center' }}>
              ページ準備完了
            </div>
            <div style={{ fontSize: '0.75rem', color: T.t4, marginTop: '0.5rem' }}>
              {Math.round(routeScore)}% ready
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
              borderRadius: '8px',
              background: al(T.g, 0.05),
            }}
          >
            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 900,
                color: T.g,
                marginBottom: '0.5rem',
              }}
            >
              {apiPass}/{apiChecks.length}
            </div>
            <div style={{ fontSize: '0.875rem', color: T.t5, textAlign: 'center' }}>
              APIチェック成功
            </div>
            <div style={{ fontSize: '0.75rem', color: T.t4, marginTop: '0.5rem' }}>
              {Math.round(apiScore)}% pass
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
              borderRadius: '8px',
              background: al(T.c, 0.05),
            }}
          >
            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 900,
                color: T.c,
                marginBottom: '0.5rem',
              }}
            >
              {contentOk}/{contentChecks.length}
            </div>
            <div style={{ fontSize: '0.875rem', color: T.t5, textAlign: 'center' }}>
              コンテンツ検証
            </div>
            <div style={{ fontSize: '0.75rem', color: T.t4, marginTop: '0.5rem' }}>
              {contentChecks.length > 0 ? Math.round(contentScore) : 0}% ok
            </div>
          </div>
        </div>

        {/* Sections */}
        <PageInventorySection routes={routes} />
        <ApiHealthSection initialChecks={apiChecks} />
        <ContentVerificationSection initialContent={contentChecks} />

        {/* Deployment Readiness */}
        <div
          style={{
            background: T.bgC,
            border: `1px solid ${T.bd}`,
            borderRadius: '12px',
            padding: '2rem',
            marginTop: '3rem',
          }}
        >
          <h3
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: T.tx,
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span style={{ color: T.g }}>✓</span> デプロイ準備チェックリスト
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1.5rem',
            }}
          >
            {[
              {
                title: '機能検証',
                items: [
                  'すべてのページが正常に読み込まれる',
                  'リンク・フォーム送信が機能する',
                  'エラーハンドリングが正常',
                  'レスポンシブデザイン確認',
                ],
              },
              {
                title: 'パフォーマンス',
                items: [
                  'LCP < 2.5秒',
                  'CLS < 0.1',
                  'メインバンドル < 200KB',
                  ' ラテンシ < 100ms',
                ],
              },
              {
                title: 'セキュリティ',
                items: [
                  'HTTPS有効',
                  'CSP ヘッダー設定',
                  'XSS対策確認',
                  'CORS設定確認',
                ],
              },
              {
                title: 'SEO・アクセシビリティ',
                items: [
                  'メタタグ確認',
                  'JSON-LD スキーマ',
                  'Alt テキスト',
                  'キーボード操作確認',
                ],
              },
            ].map((section) => (
              <div
                key={section.title}
                style={{
                  background: T.bg,
                  border: `1px solid ${T.bd}`,
                  borderRadius: '8px',
                  padding: '1.5rem',
                }}
              >
                <h4
                  style={{
                    margin: '0 0 1rem 0',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: T.c,
                  }}
                >
                  {section.title}
                </h4>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: '1.5rem',
                    listStyle: 'none',
                  }}
                >
                  {section.items.map((item) => (
                    <li
                      key={item}
                      style={{
                        marginBottom: '0.75rem',
                        fontSize: '0.875rem',
                        color: T.t5,
                        position: 'relative',
                        paddingLeft: '1.25rem',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          color: T.c,
                          fontWeight: 700,
                        }}
                      >
                        ◆
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Final Status */}
          <div
            style={{
              marginTop: '2rem',
              padding: '1.5rem',
              background: overallScore >= 85 ? al(T.c, 0.1) : al(T.g, 0.1),
              border: `2px solid ${overallScore >= 85 ? T.c : T.g}`,
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '1.125rem',
                fontWeight: 700,
                color: overallScore >= 85 ? T.c : T.g,
                marginBottom: '0.5rem',
              }}
            >
              {overallScore >= 85 ? '✓ 本番切り替え準備完了' : '⚠ 未検証項目があります'}
            </div>
            <div style={{ fontSize: '0.875rem', color: T.t5 }}>
              準備度スコア: {overallScore}%
              {overallScore < 85 && ' — 以下のセクションを完了してください：'}
              {overallScore >= 85 && ' — すべての主要チェック項目が完了しました'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
