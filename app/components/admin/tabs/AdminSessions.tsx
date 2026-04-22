/**
 * AdminSessions Tab — お客様セッション再生（誰が・いつ・何を見たか）
 *
 * patch 0124 Phase B: storefront 上のお客様セッション 1人分を時系列で並べて、
 * 「このお客様はトップ → 商品ページ → カートまで進んだ」「ここで離脱した」を
 * 中学生でもひと目でわかる形で見られる管理 UI。
 *
 * 機能:
 * - 期間選択（1日/7日/30日）
 * - セッション一覧（左ペイン）：path/PV/click/rage/最終時刻
 * - セッション詳細（右ペイン）：イベント時系列 + クリック位置 mini-map + nav route 切替帯
 *
 * UX:
 * - 凡例は中学生向け絵文字: 🔵 ページ表示 / 🔴 クリック / 🟡 スクロール / ⚠ イライラ / ↗ ページ移動 / ✏ 入力
 * - データなしのときは EmptyCard で「まだお客様の動きが記録されていません」と案内
 *
 * 設計:
 * - data fetch: GET /api/admin/uxr?action=sessions&days=N&limit=M
 * - selection fetch: GET /api/admin/uxr?action=session&sid=X
 * - 入力フィールドの値は記録しない（duration のみ・privacy 安全）
 */

import { useEffect, useMemo, useState } from 'react';
import { color } from '~/lib/design-tokens';
import { AdminListSkeleton, AdminEmptyCard } from '~/components/admin/ds/InlineListState';
import { TabHeaderHint } from '~/components/admin/ds/TabHeaderHint';

interface SessionSummary {
  sid: string;
  paths: string[];
  firstSeen: number;
  lastSeen: number;
  eventCount: number;
  clickCount: number;
  rageCount: number;
  pageviews: number;
  ua: string;
}

interface UxrEvent {
  t: 'pv' | 'click' | 'scroll' | 'rage' | 'nav' | 'input';
  ts: number;
  x?: number;
  y?: number;
  vw?: number;
  vh?: number;
  sel?: string;
  txt?: string;
  d?: number;
  r?: string;
  u?: string;
  c?: number;
  dur?: number;
  to?: string;
  path?: string; // batch level path 注入後
}

interface BatchMeta {
  path: string;
  ts: number;
  ua: string;
  eventCount: number;
}

interface SessionDetail {
  sid: string;
  batchCount: number;
  eventCount: number;
  batches: BatchMeta[];
  events: UxrEvent[];
}

const MINI_W = 320;
const MINI_H = 180;

export default function AdminSessions() {
  const [days, setDays] = useState<number>(7);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [selectedSid, setSelectedSid] = useState<string>('');
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 1. セッション一覧の読み込み ──
  useEffect(() => {
    let cancelled = false;
    setLoadingSessions(true);
    setError(null);
    const params = new URLSearchParams({
      action: 'sessions',
      days: String(days),
      limit: '50',
    });
    fetch('/api/admin/uxr?' + params.toString(), { credentials: 'include' })
      .then((r) => r.json() as Promise<{ success?: boolean; sessions?: SessionSummary[]; error?: string }>)
      .then((d) => {
        if (cancelled) return;
        if (!d.success) {
          setError(d.error || 'セッション一覧の取得に失敗しました');
          setSessions([]);
        } else {
          const arr = Array.isArray(d.sessions) ? d.sessions : [];
          setSessions(arr);
          // 既選択 sid が一覧に残っていなければ先頭を自動選択
          if (arr.length > 0 && !arr.find((s) => s.sid === selectedSid)) {
            setSelectedSid(arr[0].sid);
          } else if (arr.length === 0) {
            setSelectedSid('');
          }
        }
        setLoadingSessions(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '通信エラー');
        setLoadingSessions(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  // ── 2. 選択セッションの詳細取得 ──
  useEffect(() => {
    if (!selectedSid) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setError(null);
    const params = new URLSearchParams({ action: 'session', sid: selectedSid });
    fetch('/api/admin/uxr?' + params.toString(), { credentials: 'include' })
      .then((r) => r.json() as Promise<{ success?: boolean; error?: string } & Partial<SessionDetail>>)
      .then((d) => {
        if (cancelled) return;
        if (!d.success) {
          setError(d.error || 'セッション詳細の取得に失敗しました');
          setDetail(null);
        } else {
          setDetail(d as SessionDetail);
        }
        setLoadingDetail(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '通信エラー');
        setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSid]);

  // ── 3. クリック位置の mini-map データ（最後の path に絞る） ──
  const miniMap = useMemo(() => {
    if (!detail || detail.events.length === 0) return null;
    // 最も多くイベントを集めた path を選ぶ
    const pathCount: Record<string, number> = {};
    for (const e of detail.events) {
      if (!e.path) continue;
      pathCount[e.path] = (pathCount[e.path] || 0) + 1;
    }
    const topPath = Object.entries(pathCount).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!topPath) return null;
    const clicks = detail.events.filter(
      (e) =>
        e.path === topPath &&
        e.t === 'click' &&
        typeof e.x === 'number' &&
        typeof e.y === 'number',
    );
    const rages = detail.events.filter(
      (e) =>
        e.path === topPath &&
        e.t === 'rage' &&
        typeof e.x === 'number' &&
        typeof e.y === 'number',
    );
    return { path: topPath, clicks, rages };
  }, [detail]);

  if (loadingSessions && sessions.length === 0) {
    return (
      <div>
        <TabHeaderHint
          title="お客様セッション再生"
          description="お客様1人ひとりが「いつ・どのページを・どんな順番で見たか」を時系列で見られます。「どこで離脱したか」「どこで困ったか」がわかります。"
          relatedTabs={[
            { label: 'ヒートマップ', tab: 'uxr' },
            { label: '詳しいデータ分析', tab: 'analytics' },
          ]}
        />
        <AdminListSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div>
      <TabHeaderHint
        title="お客様セッション再生"
        description="お客様1人ひとりが「いつ・どのページを・どんな順番で見たか」を時系列で見られます。「どこで離脱したか」「どこで困ったか」がわかります。"
        relatedTabs={[
          { label: 'ヒートマップ', tab: 'uxr' },
          { label: '詳しいデータ分析', tab: 'analytics' },
        ]}
      />

      {/* ── 上部コントロール ── */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            htmlFor="sessions-days-select"
            style={{ fontSize: 11, color: color.textMuted, fontWeight: 600 }}
          >
            期間
          </label>
          <select
            id="sessions-days-select"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid ' + color.border,
              background: color.bg1,
              color: color.text,
              fontSize: 12,
            }}
          >
            <option value={1}>直近 1 日</option>
            <option value={7}>直近 7 日</option>
            <option value={30}>直近 30 日</option>
          </select>
        </div>
        <div
          style={{
            fontSize: 11,
            color: color.textMuted,
            paddingBottom: 8,
          }}
        >
          {sessions.length} 人のお客様の動きを記録中
        </div>
      </div>

      {/* ── エラー ── */}
      {error && (
        <div
          style={{
            background: 'rgba(255,45,85,.05)',
            border: '1px solid rgba(255,45,85,.2)',
            borderRadius: 8,
            padding: 12,
            color: color.red,
            fontSize: 12,
            marginBottom: 16,
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* ── 計測データなし ── */}
      {sessions.length === 0 && !loadingSessions && (
        <AdminEmptyCard
          icon="🎬"
          title="まだお客様セッションが記録されていません"
          description="お店のページに人が訪れて、ページめくり・クリック・スクロールが起きると、ここに自動で集まります。最初のお客様を待っている状態です。"
        />
      )}

      {/* ── 2 ペイン本体 ── */}
      {sessions.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(280px, 360px) 1fr',
            gap: 16,
            alignItems: 'flex-start',
          }}
        >
          {/* 左：セッション一覧 */}
          <div
            style={{
              background: color.bg1,
              border: '1px solid ' + color.border,
              borderRadius: 12,
              padding: 8,
              maxHeight: 720,
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: color.textMuted,
                padding: '6px 10px 10px 10px',
                fontWeight: 600,
                borderBottom: '1px solid ' + color.border,
                marginBottom: 6,
              }}
            >
              👥 お客様一覧（新しい順）
            </div>
            {sessions.map((s) => {
              const active = s.sid === selectedSid;
              const lastPath = s.paths[s.paths.length - 1] || '/';
              const dur = Math.round((s.lastSeen - s.firstSeen) / 1000);
              return (
                <button
                  key={s.sid}
                  type="button"
                  onClick={() => setSelectedSid(s.sid)}
                  aria-pressed={active}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: active ? 'rgba(0,240,255,.08)' : 'transparent',
                    border: '1px solid ' + (active ? color.cyan : 'transparent'),
                    borderRadius: 8,
                    padding: '10px 12px',
                    marginBottom: 4,
                    cursor: 'pointer',
                    color: color.text,
                    fontSize: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: active ? color.cyan : color.textMuted,
                      fontWeight: 700,
                      marginBottom: 4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={lastPath}
                  >
                    📍 {lastPath}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: color.textMuted,
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>👁 {s.pageviews}P</span>
                    <span>🖱 {s.clickCount}回</span>
                    {s.rageCount > 0 && (
                      <span style={{ color: color.red, fontWeight: 700 }}>
                        ⚠ {s.rageCount}
                      </span>
                    )}
                    <span>⏱ {dur < 60 ? dur + '秒' : Math.round(dur / 60) + '分'}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: color.textMuted,
                      marginTop: 4,
                    }}
                  >
                    {formatTimeAgo(s.lastSeen)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 右：セッション詳細 */}
          <div>
            {loadingDetail && <AdminListSkeleton rows={5} />}
            {!loadingDetail && detail && (
              <SessionDetailPane detail={detail} miniMap={miniMap} />
            )}
            {!loadingDetail && !detail && !error && (
              <div
                style={{
                  background: color.bg1,
                  border: '1px solid ' + color.border,
                  borderRadius: 12,
                  padding: 32,
                  textAlign: 'center',
                  color: color.textMuted,
                  fontSize: 12,
                }}
              >
                左の一覧からお客様を選ぶと、その人の動きが時系列で表示されます
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── セッション詳細ペイン ──
function SessionDetailPane({
  detail,
  miniMap,
}: {
  detail: SessionDetail;
  miniMap: { path: string; clicks: UxrEvent[]; rages: UxrEvent[] } | null;
}) {
  const events = detail.events;
  const firstTs = events[0]?.ts || 0;
  const lastTs = events[events.length - 1]?.ts || 0;
  const totalSec = Math.round((lastTs - firstTs) / 1000);
  const clicks = events.filter((e) => e.t === 'click').length;
  const rages = events.filter((e) => e.t === 'rage').length;
  const pvs = events.filter((e) => e.t === 'pv').length;
  const inputs = events.filter((e) => e.t === 'input').length;

  return (
    <div>
      {/* KPI 行 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <KpiTile icon="👁" label="ページ表示" value={pvs} />
        <KpiTile icon="🖱" label="クリック" value={clicks} />
        <KpiTile icon="✏" label="入力" value={inputs} />
        <KpiTile icon="⚠" label="イライラ" value={rages} accent={rages > 0 ? 'red' : 'muted'} />
        <KpiTile icon="⏱" label="滞在" value={totalSec < 60 ? totalSec + '秒' : Math.round(totalSec / 60) + '分'} />
      </div>

      {/* 凡例 */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          fontSize: 10,
          color: color.textMuted,
          padding: '0 4px 8px 4px',
        }}
      >
        <span>🔵 ページ表示</span>
        <span>🔴 クリック</span>
        <span>🟡 スクロール</span>
        <span>⚠ イライラ連打</span>
        <span>↗ ページ移動</span>
        <span>✏ フォーム入力</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr minmax(280px, 360px)',
          gap: 12,
        }}
      >
        {/* タイムライン */}
        <div
          style={{
            background: color.bg1,
            border: '1px solid ' + color.border,
            borderRadius: 12,
            padding: 12,
            maxHeight: 600,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: color.textMuted,
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            🎬 イベント時系列（{events.length} 件）
          </div>
          {events.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                color: color.textMuted,
                fontSize: 11,
                padding: 24,
              }}
            >
              このお客様のイベントはまだありません
            </div>
          ) : (
            <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {events.map((e, i) => {
                const dt = i === 0 ? 0 : Math.max(0, e.ts - events[i - 1].ts);
                return <TimelineRow key={i} ev={e} index={i} dtMs={dt} />;
              })}
            </ol>
          )}
        </div>

        {/* mini-map（クリック位置） */}
        <div>
          {miniMap && (miniMap.clicks.length > 0 || miniMap.rages.length > 0) ? (
            <div
              style={{
                background: color.bg1,
                border: '1px solid ' + color.border,
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: color.textMuted,
                  marginBottom: 8,
                }}
              >
                🗺 クリックの場所:{' '}
                <strong style={{ color: color.text }}>{miniMap.path}</strong>
              </div>
              <svg
                viewBox={`0 0 ${MINI_W} ${MINI_H}`}
                role="img"
                aria-label="クリック位置 mini-map"
                style={{
                  width: '100%',
                  height: 'auto',
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01))',
                  borderRadius: 8,
                }}
              >
                <rect x={0} y={0} width={MINI_W} height={20} fill="rgba(255,255,255,.04)" />
                {miniMap.clicks.map((c, i) => (
                  <circle
                    key={'c' + i}
                    cx={(c.x || 0) * MINI_W}
                    cy={(c.y || 0) * MINI_H}
                    r={5 + Math.min(8, i)}
                    fill="#ff2d55"
                    opacity={0.55}
                  >
                    <title>クリック {i + 1}番目</title>
                  </circle>
                ))}
                {miniMap.rages.map((r, i) => {
                  const cx = (r.x || 0) * MINI_W;
                  const cy = (r.y || 0) * MINI_H;
                  return (
                    <polygon
                      key={'r' + i}
                      points={`${cx},${cy - 8} ${cx - 7},${cy + 6} ${cx + 7},${cy + 6}`}
                      fill="rgba(255,45,85,.9)"
                      stroke="#fff"
                      strokeWidth={1}
                    >
                      <title>イライラクリック</title>
                    </polygon>
                  );
                })}
              </svg>
            </div>
          ) : null}

          {/* 訪問ページ一覧 */}
          <div
            style={{
              background: color.bg1,
              border: '1px solid ' + color.border,
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: color.textMuted,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              📑 訪問したページ（{detail.batches.length} バッチ）
            </div>
            {detail.batches.length === 0 ? (
              <div style={{ fontSize: 11, color: color.textMuted }}>
                訪問ページの情報はありません
              </div>
            ) : (
              <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {detail.batches.map((b, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 11,
                      color: color.text,
                      padding: '6px 0',
                      borderBottom:
                        i < detail.batches.length - 1
                          ? '1px solid ' + color.border
                          : 'none',
                    }}
                  >
                    <div
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={b.path}
                    >
                      {i + 1}. {b.path}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: color.textMuted,
                        marginTop: 2,
                      }}
                    >
                      {b.eventCount}件のイベント · {formatTimeAgo(b.ts)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      {/* セッション ID（debug 用・非エンジニア向けには小さく） */}
      <div
        style={{
          fontSize: 10,
          color: color.textMuted,
          marginTop: 12,
          textAlign: 'right',
          fontFamily: 'monospace',
        }}
      >
        sid: {detail.sid}
      </div>
    </div>
  );
}

// ── タイムラインの 1 行 ──
function TimelineRow({
  ev,
  index,
  dtMs,
}: {
  ev: UxrEvent;
  index: number;
  dtMs: number;
}) {
  const meta = describeEvent(ev);
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 60px 1fr',
        gap: 8,
        alignItems: 'flex-start',
        padding: '6px 0',
        borderBottom: '1px solid rgba(255,255,255,.04)',
      }}
    >
      <span
        aria-hidden
        style={{
          fontSize: 14,
          textAlign: 'center',
        }}
        title={meta.label}
      >
        {meta.icon}
      </span>
      <span
        style={{
          fontSize: 10,
          color: color.textMuted,
          fontFamily: 'monospace',
          paddingTop: 2,
        }}
      >
        {index === 0 ? 'start' : '+' + formatDt(dtMs)}
      </span>
      <span
        style={{
          fontSize: 11,
          color: meta.color || color.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <strong style={{ color: meta.color || color.text }}>{meta.label}</strong>
        {meta.detail && (
          <span style={{ color: color.textMuted, marginLeft: 6 }}>{meta.detail}</span>
        )}
      </span>
    </li>
  );
}

function describeEvent(e: UxrEvent): { icon: string; label: string; detail?: string; color?: string } {
  switch (e.t) {
    case 'pv':
      return {
        icon: '🔵',
        label: 'ページ表示',
        detail: e.path || undefined,
        color: color.cyan,
      };
    case 'click':
      return {
        icon: '🔴',
        label: 'クリック',
        detail: e.txt ? '「' + e.txt + '」' : e.sel || undefined,
        color: color.red,
      };
    case 'scroll':
      return {
        icon: '🟡',
        label: 'スクロール',
        detail: typeof e.d === 'number' ? e.d + '% まで' : undefined,
        color: color.yellow,
      };
    case 'rage':
      return {
        icon: '⚠',
        label: 'イライラ連打',
        detail: e.c ? e.c + '回連打' : undefined,
        color: color.red,
      };
    case 'nav':
      return {
        icon: '↗',
        label: 'ページ移動',
        detail: e.to ? '→ ' + e.to : undefined,
        color: color.cyan,
      };
    case 'input':
      return {
        icon: '✏',
        label: '入力フォーム',
        detail:
          (e.sel ? e.sel : '') + (typeof e.dur === 'number' ? '（' + e.dur + '秒）' : ''),
        color: color.text,
      };
    default:
      return { icon: '·', label: String(e.t), detail: undefined };
  }
}

function formatDt(ms: number): string {
  if (ms < 1000) return ms + 'ms';
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + 's';
  return Math.round(s / 60) + 'm';
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return Math.round(diff / 1000) + ' 秒前';
  if (diff < 3_600_000) return Math.round(diff / 60_000) + ' 分前';
  if (diff < 86_400_000) return Math.round(diff / 3_600_000) + ' 時間前';
  return Math.round(diff / 86_400_000) + ' 日前';
}

// ── 小さめ KPI タイル ──
function KpiTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: number | string;
  accent?: 'red' | 'muted';
}) {
  const accentColor = accent === 'red' ? color.red : color.text;
  return (
    <div
      style={{
        background: color.bg1,
        border: '1px solid ' + color.border,
        borderRadius: 8,
        padding: '8px 10px',
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: color.textMuted,
          fontWeight: 600,
        }}
      >
        {icon} {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: accentColor,
          marginTop: 2,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
    </div>
  );
}
