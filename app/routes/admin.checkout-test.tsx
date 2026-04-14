/**
 * Admin Checkout E2E Test Dashboard — admin.checkout-test.tsx
 * 医学メタファー: 心電図 (ECG) — 支払いフローの脈拍監視
 *
 * Automated checkout flow verification:
 * 1. Route Accessibility (/, /cart, /collections, etc.)
 * 2. Cart API (cartCreate mutation)
 * 3. Product Availability
 * 4. Checkout Redirect Chain
 *
 * Dark theme with T constants (inline styles, no Tailwind)
 */

import { useState, useEffect } from 'react';
import { useLoaderData, Form, useNavigation } from 'react-router';
import type { Route } from './+types/admin.checkout-test';
import { AppError } from '~/lib/app-error';
import { runFullCheckoutSuite, type CheckoutTestSuite } from '~/lib/checkout-tester';
import { PAGE_WIDTH, T, STORE_URL } from '~/lib/astromeda-data';
import { RouteErrorBoundary } from '~/components/astro/RouteErrorBoundary';

/**
 * Loader: Run full test suite on page load
 */
export async function loader({ context, request }: Route.LoaderArgs) {
  try {
    const baseUrl = new URL(request.url).origin;
    const testSuite = await runFullCheckoutSuite(context.storefront, baseUrl);

    return {
      testSuite,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[admin.checkout-test] Loader error:', error);
    }
    throw AppError.internal('チェックアウトテストの実行に失敗しました');
  }
}

/**
 * Action: Re-run tests on form submission
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return { error: 'Invalid method' };
  }

  try {
    const baseUrl = new URL(request.url).origin;
    const testSuite = await runFullCheckoutSuite(context.storefront, baseUrl);

    return {
      testSuite,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[admin.checkout-test] Action error:', error);
    return {
      error: 'チェックアウトテスト実行中にエラーが発生しました',
      testSuite: null,
    };
  }
}

export const meta: Route.MetaFunction = () => [
  { title: 'チェックアウトテスト | ASTROMEDA Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

/**
 * TestResultRow — Display single test result
 */
interface TestResultRowProps {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration: number;
}

function TestResultRow({ name, status, message, duration }: TestResultRowProps) {
  const statusColor =
    status === 'pass' ? T.c : status === 'fail' ? T.r : T.t4;
  const statusIcon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';

  return (
    <tr
      style={{
        borderBottom: `1px solid ${T.bd}`,
        height: '56px',
      }}
    >
      <td
        style={{
          padding: '12px 16px',
          fontSize: '14px',
          color: T.tx,
          textAlign: 'left',
        }}
      >
        {name}
      </td>
      <td
        style={{
          padding: '12px 16px',
          fontSize: '14px',
          color: statusColor,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {statusIcon} {status.toUpperCase()}
      </td>
      <td
        style={{
          padding: '12px 16px',
          fontSize: '13px',
          color: T.t4,
        }}
      >
        {message}
      </td>
      <td
        style={{
          padding: '12px 16px',
          fontSize: '13px',
          color: T.t5,
          textAlign: 'right',
          whiteSpace: 'nowrap',
        }}
      >
        {duration}ms
      </td>
    </tr>
  );
}

/**
 * Page Component
 */
export default function AdminCheckoutTest() {
  const loaderData = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state === 'submitting';

  const testSuite: CheckoutTestSuite = loaderData?.testSuite;
  const timestamp = loaderData?.timestamp;

  // If re-run was submitted and succeeded
  const actionData = navigation.formData
    ? { timestamp: new Date().toISOString() }
    : null;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: T.bg,
        color: T.tx,
        paddingTop: '32px',
        paddingBottom: '64px',
      }}
    >
      {/* Header */}
      <div style={PAGE_WIDTH}>
        <h1
          style={{
            fontSize: '28px',
            fontWeight: 900,
            marginBottom: '8px',
            background: `linear-gradient(135deg, ${T.c}, ${T.g})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          チェックアウトE2Eテスト
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: T.t4,
            marginBottom: '32px',
          }}
        >
          支払いフロー & API エンドポイント 自動検証
        </p>

        {/* Summary Card */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '12px',
            marginBottom: '32px',
          }}
        >
          {/* Pass Count */}
          <div
            style={{
              padding: '16px',
              background: `linear-gradient(135deg, ${T.bgC}, ${T.bgE})`,
              border: `1px solid ${T.bd}`,
              borderRadius: '8px',
            }}
          >
            <div
              style={{
                fontSize: '24px',
                fontWeight: 900,
                color: T.c,
                marginBottom: '4px',
              }}
            >
              {testSuite?.totalPass ?? 0}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: T.t4,
                fontWeight: 600,
              }}
            >
              PASS
            </div>
          </div>

          {/* Fail Count */}
          <div
            style={{
              padding: '16px',
              background: `linear-gradient(135deg, ${T.bgC}, ${T.bgE})`,
              border: `1px solid ${T.bd}`,
              borderRadius: '8px',
            }}
          >
            <div
              style={{
                fontSize: '24px',
                fontWeight: 900,
                color: testSuite?.totalFail ? T.r : T.c,
                marginBottom: '4px',
              }}
            >
              {testSuite?.totalFail ?? 0}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: T.t4,
                fontWeight: 600,
              }}
            >
              FAIL
            </div>
          </div>

          {/* Warn Count */}
          <div
            style={{
              padding: '16px',
              background: `linear-gradient(135deg, ${T.bgC}, ${T.bgE})`,
              border: `1px solid ${T.bd}`,
              borderRadius: '8px',
            }}
          >
            <div
              style={{
                fontSize: '24px',
                fontWeight: 900,
                color: T.t4,
                marginBottom: '4px',
              }}
            >
              {testSuite?.totalWarn ?? 0}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: T.t4,
                fontWeight: 600,
              }}
            >
              WARN
            </div>
          </div>

          {/* Timestamp */}
          <div
            style={{
              padding: '16px',
              background: `linear-gradient(135deg, ${T.bgC}, ${T.bgE})`,
              border: `1px solid ${T.bd}`,
              borderRadius: '8px',
              gridColumn: 'span 1',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: T.t5,
                fontFamily: 'monospace',
                lineHeight: 1.4,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {timestamp
                ? new Date(timestamp).toLocaleString('ja-JP', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : 'N/A'}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: T.t4,
                fontWeight: 600,
                marginTop: '4px',
              }}
            >
              実行時刻
            </div>
          </div>
        </div>

        {/* Re-run Button */}
        <Form method="post" style={{ marginBottom: '32px' }}>
          <button
            type="submit"
            disabled={isLoading}
            style={{
              padding: '10px 20px',
              background: isLoading
                ? `linear-gradient(135deg, ${T.t3}, ${T.t2})`
                : `linear-gradient(135deg, ${T.c}, ${T.g})`,
              color: isLoading ? T.t4 : T.bg,
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 200ms ease',
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? '実行中...' : 'テストを再実行'}
          </button>
        </Form>

        {/* Results Table */}
        {testSuite?.results && testSuite.results.length > 0 ? (
          <div
            style={{
              overflowX: 'auto',
              borderRadius: '8px',
              border: `1px solid ${T.bd}`,
              background: T.bgE,
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '13px',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: `2px solid ${T.bd}`,
                    background: T.bgC,
                  }}
                >
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontWeight: 700,
                      color: T.t5,
                      fontSize: '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    テスト名
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontWeight: 700,
                      color: T.t5,
                      fontSize: '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    ステータス
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontWeight: 700,
                      color: T.t5,
                      fontSize: '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    メッセージ
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontWeight: 700,
                      color: T.t5,
                      fontSize: '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    実行時間
                  </th>
                </tr>
              </thead>
              <tbody>
                {testSuite.results.map((result, idx) => (
                  <TestResultRow
                    key={idx}
                    name={result.name}
                    status={result.status}
                    message={result.message}
                    duration={result.duration}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              padding: '32px',
              background: T.bgC,
              border: `1px solid ${T.bd}`,
              borderRadius: '8px',
              textAlign: 'center',
              color: T.t4,
            }}
          >
            テスト結果がありません
          </div>
        )}

        {/* Footer Note */}
        <div
          style={{
            marginTop: '32px',
            padding: '16px',
            background: T.bgC,
            border: `1px solid ${T.bd}`,
            borderRadius: '6px',
            fontSize: '12px',
            color: T.t5,
            lineHeight: 1.6,
          }}
        >
          <strong>テスト対象:</strong> ルートアクセス可能性、カートAPI、商品在庫、チェックアウトリダイレクト
          <br />
          <strong>更新頻度:</strong> ページロード時に自動実行。手動実行は「テストを再実行」ボタンから。
          <br />
          <strong>注:</strong> このページは管理者のみアクセス可能（noindex/nofollow）。
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
