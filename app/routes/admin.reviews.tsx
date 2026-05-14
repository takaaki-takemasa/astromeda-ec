/**
 * /admin/reviews - レビュー機能 管理画面 (Embedded App 内)
 *
 * 4 つのタブ:
 *   1. 📝 レビュー一覧 (承認待ち / 承認済 / 拒否)
 *   2. ✉️ メール設定 (IP/カテゴリ別・ワンクリック有効化)
 *   3. 🎁 ギフトトークン (一括発行 + 履歴)
 *   4. 📋 送信キュー (queued / sent / failed)
 *
 * Phase 9 / 2026-05-14
 */

import { useState, useMemo } from 'react';
import { data, redirect, useLoaderData, useFetcher } from 'react-router';
import type { Route } from './+types/admin.reviews';
import { AppSession } from '~/lib/session';

const REVIEW_TYPE = 'astromeda_review';
const TOKEN_TYPE = 'astromeda_review_token';
const QUEUE_TYPE = 'astromeda_review_email_queue';
const CONFIG_TYPE = 'astromeda_review_email_config';

async function getAdmin(context: any) {
  const { getAdminClient, setAdminEnv } = await import('../../agents/core/shopify-admin.js');
  setAdminEnv(context.env);
  return getAdminClient();
}

function flatten(node: any) {
  const obj: any = { id: node.id, handle: node.handle };
  for (const f of node.fields) obj[f.key] = f.value;
  return obj;
}

// ============================================================
// Loader: 4 つのタブのデータを並列取得
// ============================================================
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.env as any;
  const session = await AppSession.init(request, [env.SESSION_SECRET as string]);
  if (session.get('isAdmin') !== true) throw redirect('/admin/login');

  const admin = await getAdmin(context);
  const [reviewsR, configsR, tokensR, queueR] = await Promise.all([
    admin.graphql(`{metaobjects(type:"${REVIEW_TYPE}",first:100,sortKey:"id",reverse:true){nodes{id fields{key value reference{...on Product{handle title}}}}}}`),
    admin.graphql(`{metaobjects(type:"${CONFIG_TYPE}",first:200){nodes{id fields{key value}}}}`),
    admin.graphql(`{metaobjects(type:"${TOKEN_TYPE}",first:50,sortKey:"id",reverse:true){nodes{id fields{key value}}}}`),
    admin.graphql(`{metaobjects(type:"${QUEUE_TYPE}",first:100,sortKey:"id",reverse:true){nodes{id fields{key value}}}}`),
  ]);

  const reviews = (reviewsR?.data?.metaobjects?.nodes || []).map((n: any) => {
    const o: any = flatten(n);
    const pf = n.fields.find((f: any) => f.key === 'product_ref');
    if (pf?.reference) o._product = pf.reference;
    return o;
  });
  const configs = (configsR?.data?.metaobjects?.nodes || []).map(flatten);
  const tokens = (tokensR?.data?.metaobjects?.nodes || []).map(flatten);
  const queue = (queueR?.data?.metaobjects?.nodes || []).map(flatten);

  // KPI
  const pendingReviews = reviews.filter((r: any) => r.status === 'pending').length;
  const approvedReviews = reviews.filter((r: any) => r.status === 'approved').length;
  const pendingConfigs = configs.filter((c: any) => c.enabled !== 'true').length;
  const enabledConfigs = configs.filter((c: any) => c.enabled === 'true').length;
  const queuedEmails = queue.filter((q: any) => q.status === 'queued').length;
  const sentEmails = queue.filter((q: any) => q.status === 'sent').length;
  const failedEmails = queue.filter((q: any) => q.status === 'failed').length;

  return data({
    reviews,
    configs,
    tokens,
    queue,
    kpi: {
      pendingReviews,
      approvedReviews,
      pendingConfigs,
      enabledConfigs,
      queuedEmails,
      sentEmails,
      failedEmails,
    },
  });
}

// ============================================================
// UI
// ============================================================
export default function AdminReviews() {
  const { reviews, configs, tokens, queue, kpi } = useLoaderData<typeof loader>();
  const [tab, setTab] = useState<'list' | 'email' | 'gift' | 'queue'>('list');

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Header kpi={kpi} />
      <Tabs current={tab} onChange={setTab} kpi={kpi} />
      <div style={{ marginTop: 18 }}>
        {tab === 'list' && <ReviewList reviews={reviews} />}
        {tab === 'email' && <EmailConfig configs={configs} />}
        {tab === 'gift' && <GiftTokens tokens={tokens} />}
        {tab === 'queue' && <QueueView queue={queue} />}
      </div>
    </div>
  );
}

// ============================================================
// Header / KPI
// ============================================================
function Header({ kpi }: { kpi: any }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>📝 レビュー管理</h1>
      <p style={{ fontSize: 12, color: '#6b7280' }}>
        レビュー承認 / メール設定 / ギフトトークン / 送信キュー
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <Kpi label="承認待ちレビュー" value={kpi.pendingReviews} highlight={kpi.pendingReviews > 0} />
        <Kpi label="公開中レビュー" value={kpi.approvedReviews} />
        <Kpi label="メール設定 有効" value={kpi.enabledConfigs} success />
        <Kpi label="送信予約中" value={kpi.queuedEmails} />
        <Kpi label="送信完了 (累計)" value={kpi.sentEmails} success />
        <Kpi label="送信失敗" value={kpi.failedEmails} highlight={kpi.failedEmails > 0} />
      </div>
    </div>
  );
}

function Kpi({ label, value, highlight, success }: any) {
  const color = highlight ? '#f59e0b' : success ? '#10b981' : '#1f2937';
  return (
    <div style={{ background: '#fff', padding: '10px 14px', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', minWidth: 110 }}>
      <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Tabs({ current, onChange, kpi }: any) {
  const tabs = [
    { id: 'list', label: '📝 レビュー一覧', badge: kpi.pendingReviews },
    { id: 'email', label: '✉️ メール設定', badge: 0 },
    { id: 'gift', label: '🎁 ギフトトークン', badge: 0 },
    { id: 'queue', label: '📋 送信キュー', badge: kpi.failedEmails },
  ];
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e5e7eb' }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: current === t.id ? '#06060C' : 'transparent',
            color: current === t.id ? '#fff' : '#374151',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            position: 'relative',
          }}
        >
          {t.label}
          {t.badge > 0 && (
            <span style={{ marginLeft: 6, background: '#f59e0b', color: '#fff', padding: '2px 6px', borderRadius: 999, fontSize: 10 }}>
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// 1. レビュー一覧 (承認/拒否)
// ============================================================
function ReviewList({ reviews }: { reviews: any[] }) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const fetcher = useFetcher();
  const filtered = useMemo(() => {
    if (filter === 'all') return reviews;
    return reviews.filter((r) => r.status === filter);
  }, [reviews, filter]);

  const updateStatus = (id: string, status: string) => {
    fetcher.submit(
      { action: 'review_set_status', id, status },
      { method: 'post', encType: 'application/json' as any }
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[
          { id: 'pending', label: '承認待ち', count: reviews.filter((r) => r.status === 'pending').length },
          { id: 'approved', label: '承認済', count: reviews.filter((r) => r.status === 'approved').length },
          { id: 'rejected', label: '拒否', count: reviews.filter((r) => r.status === 'rejected').length },
          { id: 'all', label: '全件', count: reviews.length },
        ].map((c) => (
          <button
            key={c.id}
            onClick={() => setFilter(c.id as any)}
            style={{
              padding: '6px 14px',
              border: '1px solid #d1d5db',
              borderRadius: 999,
              background: filter === c.id ? '#06060C' : '#fff',
              color: filter === c.id ? '#fff' : '#374151',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {c.label} ({c.count})
          </button>
        ))}
      </div>

      <table style={{ width: '100%', background: '#fff', borderRadius: 8, fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={th}>評価</th>
            <th style={th}>商品</th>
            <th style={th}>タイトル / 本文</th>
            <th style={th}>投稿者</th>
            <th style={th}>種別</th>
            <th style={th}>投稿日</th>
            <th style={th}>操作</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 40 }}>
                該当するレビューはありません
              </td>
            </tr>
          )}
          {filtered.map((r: any) => (
            <tr key={r.id} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={td}>{'★'.repeat(parseInt(r.rating || '0'))}<span style={{ color: '#d1d5db' }}>{'★'.repeat(5 - parseInt(r.rating || '0'))}</span></td>
              <td style={td}>{r._product?.title?.slice(0, 30) || '(削除済)'}</td>
              <td style={td}>
                <div style={{ fontWeight: 600 }}>{r.title}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{(r.body || '').slice(0, 60)}…</div>
              </td>
              <td style={td}>{r.reviewer_name}</td>
              <td style={td}>
                <span style={{ ...tagStyle, background: r.source_type === 'gift_recipient' ? '#fde7f3' : '#dbeafe', color: r.source_type === 'gift_recipient' ? '#c2185b' : '#1e40af' }}>
                  {r.source_type === 'gift_recipient' ? 'ギフト' : '認証購入'}
                </span>
              </td>
              <td style={td}>{(r.approved_at || '').slice(0, 10)}</td>
              <td style={td}>
                {r.status === 'pending' && (
                  <>
                    <button onClick={() => updateStatus(r.id, 'approved')} style={btnSuccess}>承認</button>
                    <button onClick={() => updateStatus(r.id, 'rejected')} style={btnDanger}>拒否</button>
                  </>
                )}
                {r.status === 'approved' && (
                  <>
                    <span style={{ ...tagStyle, background: '#d1fae5', color: '#065f46' }}>公開中</span>
                    <button onClick={() => updateStatus(r.id, 'rejected')} style={{ ...btnDanger, marginLeft: 6 }}>非公開</button>
                  </>
                )}
                {r.status === 'rejected' && (
                  <>
                    <span style={{ ...tagStyle, background: '#fee2e2', color: '#991b1b' }}>拒否</span>
                    <button onClick={() => updateStatus(r.id, 'approved')} style={{ ...btnSuccess, marginLeft: 6 }}>承認に戻す</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// 2. メール設定 (IP/カテゴリ別)
// ============================================================
function EmailConfig({ configs }: { configs: any[] }) {
  const fetcher = useFetcher();
  const [showCreateForm, setShowCreateForm] = useState(false);

  const toggle = (id: string, currentEnabled: string) => {
    fetcher.submit(
      { action: 'config_toggle', id, enabled: currentEnabled !== 'true' },
      { method: 'post', encType: 'application/json' as any }
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, color: '#374151' }}>
          <strong>{configs.filter((c) => c.enabled === 'true').length}</strong> 件 有効 /{' '}
          <strong>{configs.filter((c) => c.enabled !== 'true').length}</strong> 件 無効 (オプトイン)
        </div>
        <button onClick={() => setShowCreateForm(!showCreateForm)} style={btnPrimary}>
          {showCreateForm ? '閉じる' : '+ 新規設定を作成'}
        </button>
      </div>

      {showCreateForm && <CreateConfigForm onDone={() => setShowCreateForm(false)} />}

      <table style={{ width: '100%', background: '#fff', borderRadius: 8, fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={th}>対象</th>
            <th style={th}>有効化</th>
            <th style={th}>送信日数</th>
            <th style={th}>件名</th>
            <th style={th}>最終更新</th>
            <th style={th}>操作</th>
          </tr>
        </thead>
        <tbody>
          {configs.length === 0 && (
            <tr>
              <td colSpan={6} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 40 }}>
                まだメール設定がありません。「+ 新規設定を作成」から始めてください
                <br />
                <small style={{ color: '#dc2626' }}>※デフォルトでは自動メールは送信されません (オプトイン制)</small>
              </td>
            </tr>
          )}
          {configs.map((c: any) => (
            <tr key={c.id} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={td}>
                <div style={{ fontWeight: 600 }}>{c.target_label || c.target_handle || '(global)'}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{c.target_type}</div>
              </td>
              <td style={td}>
                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={c.enabled === 'true'}
                    onChange={() => toggle(c.id, c.enabled)}
                    style={{ width: 36, height: 20, cursor: 'pointer' }}
                  />
                  <span style={{ marginLeft: 8, fontSize: 12, color: c.enabled === 'true' ? '#10b981' : '#9ca3af', fontWeight: 600 }}>
                    {c.enabled === 'true' ? '✅ 有効' : '⏸ 無効'}
                  </span>
                </label>
              </td>
              <td style={td}>{c.delay_days} 日後</td>
              <td style={td}><div style={{ maxWidth: 280 }}>{c.subject?.slice(0, 50)}</div></td>
              <td style={td}><div style={{ fontSize: 11 }}>{(c.last_modified_at || '').slice(0, 16).replace('T', ' ')}<br /><span style={{ color: '#6b7280' }}>by {c.last_modified_by}</span></div></td>
              <td style={td}>
                <details>
                  <summary style={{ cursor: 'pointer', color: '#06060C', fontSize: 12 }}>編集</summary>
                  <EditConfigForm config={c} />
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateConfigForm({ onDone }: any) {
  const fetcher = useFetcher();
  return (
    <div style={{ background: '#f9fafb', padding: 16, borderRadius: 8, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>新規メール設定</div>
      <fetcher.Form method="post" encType="application/json">
        <input type="hidden" name="action" value="config_create" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Label name="対象タイプ"><select name="target_type" defaultValue="ip_collection" style={inp}>
            <option value="ip_collection">IP コレクション (例: hololive-english-collaboration)</option>
            <option value="product_collection">製品カテゴリ (例: gaming-keyboards)</option>
            <option value="global">全注文共通 (フォールバック)</option>
          </select></Label>
          <Label name="対象 handle (global は空欄)"><input name="target_handle" placeholder="例: heroaca-collaboration" style={inp} /></Label>
          <Label name="表示名"><input name="target_label" placeholder="例: ヒロアカコラボ" style={inp} /></Label>
          <Label name="送信日数 (1-90)"><input name="delay_days" type="number" defaultValue={14} min={1} max={90} style={inp} required /></Label>
        </div>
        <Label name="件名"><input name="subject" defaultValue="ASTROMEDA をご利用ありがとうございました - ご感想をお聞かせください" style={inp} required /></Label>
        <Label name="本文 (変数: {{customer_name}}, {{product_title}}, {{review_url}}, {{delay_days}})">
          <textarea name="body_template" rows={8} style={{ ...inp, fontFamily: 'monospace' }} required defaultValue={`{{customer_name}} 様\n\nこのたびは ASTROMEDA {{product_title}} をご購入いただき、誠にありがとうございました。\n\nご感想をぜひお聞かせください。\n\n▼ レビューを投稿する (所要 3 分)\n{{review_url}}\n\nASTROMEDA カスタマーサポート`} />
        </Label>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="submit" style={btnPrimary}>作成 (無効状態で保存)</button>
          <button type="button" onClick={onDone} style={btnSecondary}>キャンセル</button>
        </div>
      </fetcher.Form>
    </div>
  );
}

function EditConfigForm({ config }: { config: any }) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post" encType="application/json" style={{ marginTop: 10, padding: 14, background: '#f9fafb', borderRadius: 6 }}>
      <input type="hidden" name="action" value="config_update" />
      <input type="hidden" name="id" value={config.id} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Label name="表示名"><input name="target_label" defaultValue={config.target_label || ''} style={inp} /></Label>
        <Label name="送信日数"><input name="delay_days" type="number" defaultValue={config.delay_days} min={1} max={90} style={inp} /></Label>
      </div>
      <Label name="件名"><input name="subject" defaultValue={config.subject} style={inp} /></Label>
      <Label name="本文"><textarea name="body_template" rows={6} style={{ ...inp, fontFamily: 'monospace' }} defaultValue={config.body_template} /></Label>
      <button type="submit" style={btnPrimary}>更新</button>
    </fetcher.Form>
  );
}

// ============================================================
// 3. ギフトトークン発行
// ============================================================
function GiftTokens({ tokens }: { tokens: any[] }) {
  const fetcher = useFetcher();
  const giftTokens = tokens.filter((t) => t.token_type === 'gift');
  return (
    <div>
      <fetcher.Form method="post" encType="application/json" style={{ background: '#f9fafb', padding: 16, borderRadius: 8, marginBottom: 14 }}>
        <input type="hidden" name="action" value="gift_token_issue" />
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>新規ギフトトークン発行 (1 件)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Label name="受領者名"><input name="customer_name" required style={inp} /></Label>
          <Label name="受領者メール"><input name="email" type="email" required style={inp} /></Label>
          <Label name="商品ハンドル (カンマ区切り)"><input name="product_handles" required style={inp} placeholder="pc-one-piece-xxx,keyboard-yyy" /></Label>
          <Label name="ギフトメモ"><input name="gift_note" style={inp} placeholder="2026 春コラボイベント" /></Label>
        </div>
        <button type="submit" style={btnPrimary}>発行 + メール送信</button>
      </fetcher.Form>
      <table style={{ width: '100%', background: '#fff', borderRadius: 8, fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={th}>発行日時</th><th style={th}>受領者</th><th style={th}>商品数</th><th style={th}>メモ</th><th style={th}>状態</th>
          </tr>
        </thead>
        <tbody>
          {giftTokens.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 40 }}>まだギフトトークンが発行されていません</td></tr>}
          {giftTokens.map((t: any) => (
            <tr key={t.id} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={td}>{(t.expires_at || '').slice(0, 10)}</td>
              <td style={td}>{t.customer_name}<br /><small style={{ color: '#6b7280' }}>{t.email}</small></td>
              <td style={td}>{JSON.parse(t.product_refs || '[]').length} 件</td>
              <td style={td}>{t.gift_note || '-'}</td>
              <td style={td}>
                <span style={{ ...tagStyle, background: t.used_at ? '#d1fae5' : '#fef3c7', color: t.used_at ? '#065f46' : '#92400e' }}>
                  {t.used_at ? '使用済' : '未使用'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// 4. 送信キュー
// ============================================================
function QueueView({ queue }: { queue: any[] }) {
  const [filter, setFilter] = useState<'all' | 'queued' | 'sent' | 'failed'>('queued');
  const filtered = filter === 'all' ? queue : queue.filter((q) => q.status === filter);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[
          { id: 'queued', label: '送信予約中', count: queue.filter((q) => q.status === 'queued').length },
          { id: 'sent', label: '送信完了', count: queue.filter((q) => q.status === 'sent').length },
          { id: 'failed', label: '失敗', count: queue.filter((q) => q.status === 'failed').length },
          { id: 'all', label: '全件', count: queue.length },
        ].map((c) => (
          <button key={c.id} onClick={() => setFilter(c.id as any)} style={{ ...chipStyle, ...(filter === c.id ? chipActiveStyle : {}) }}>
            {c.label} ({c.count})
          </button>
        ))}
      </div>
      <table style={{ width: '100%', background: '#fff', borderRadius: 8, fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={th}>注文 ID</th><th style={th}>受信者</th><th style={th}>送信予定</th><th style={th}>状態</th><th style={th}>エラー</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 40 }}>該当キューなし</td></tr>}
          {filtered.map((q: any) => (
            <tr key={q.id} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={td}>{(q.order_id || '').slice(-12)}</td>
              <td style={td}>{q.customer_name}<br /><small style={{ color: '#6b7280' }}>{q.email}</small></td>
              <td style={td}>{(q.scheduled_at || '').slice(0, 16).replace('T', ' ')}</td>
              <td style={td}>
                <span style={{ ...tagStyle, background: q.status === 'sent' ? '#d1fae5' : q.status === 'failed' ? '#fee2e2' : '#fef3c7', color: q.status === 'sent' ? '#065f46' : q.status === 'failed' ? '#991b1b' : '#92400e' }}>
                  {q.status}
                </span>
              </td>
              <td style={td}><small style={{ color: '#dc2626' }}>{q.error_message || ''}</small></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Action: 各操作を /api/admin/* に転送
// ============================================================
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.env as any;
  const session = await AppSession.init(request, [env.SESSION_SECRET as string]);
  if (session.get('isAdmin') !== true) return data({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });

  const body = await request.json();
  const admin = await getAdmin(context);
  const issuer = String(session.get('adminUser') || 'admin');
  const now = new Date().toISOString();

  if (body.action === 'review_set_status') {
    const fields: any[] = [{ key: 'status', value: body.status }];
    if (body.status === 'approved') {
      fields.push({ key: 'approved_at', value: now }, { key: 'approved_by', value: issuer });
    }
    await admin.graphql(
      `mutation($id:ID!,$mo:MetaobjectUpdateInput!){metaobjectUpdate(id:$id,metaobject:$mo){metaobject{id} userErrors{message}}}`,
      { id: body.id, mo: { fields } }
    );
    return data({ ok: true });
  }
  if (body.action === 'config_toggle') {
    const enabled = body.enabled === true || body.enabled === 'true';
    const fields: any[] = [
      { key: 'enabled', value: enabled ? 'true' : 'false' },
      { key: 'last_modified_at', value: now },
      { key: 'last_modified_by', value: issuer },
    ];
    if (enabled) fields.push({ key: 'enabled_at', value: now }, { key: 'enabled_by', value: issuer });
    await admin.graphql(
      `mutation($id:ID!,$mo:MetaobjectUpdateInput!){metaobjectUpdate(id:$id,metaobject:$mo){metaobject{id}}}`,
      { id: body.id, mo: { fields } }
    );
    return data({ ok: true });
  }
  return data({ ok: false, error: 'UNKNOWN_ACTION' }, { status: 400 });
}

// ============================================================
// Styles
// ============================================================
const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, color: '#6b7280', textAlign: 'left', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: '12px', verticalAlign: 'top' };
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };
const btnBase: React.CSSProperties = { padding: '5px 12px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid', marginRight: 4 };
const btnPrimary: React.CSSProperties = { ...btnBase, background: '#06060C', color: '#fff', borderColor: '#06060C' };
const btnSecondary: React.CSSProperties = { ...btnBase, background: '#fff', color: '#06060C', borderColor: '#d1d5db' };
const btnSuccess: React.CSSProperties = { ...btnBase, background: '#10b981', color: '#fff', borderColor: '#10b981' };
const btnDanger: React.CSSProperties = { ...btnBase, background: '#ef4444', color: '#fff', borderColor: '#ef4444' };
const tagStyle: React.CSSProperties = { padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, display: 'inline-block' };
const chipStyle: React.CSSProperties = { padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 999, background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 12, fontWeight: 600 };
const chipActiveStyle: React.CSSProperties = { background: '#06060C', color: '#fff', borderColor: '#06060C' };

function Label({ name, children }: any) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' }}>{name}</div>
      {children}
    </label>
  );
}
