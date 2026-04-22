/**
 * AdminUxr Tab — お客様の動きを見る（クリックヒートマップ MVP）
 *
 * patch 0123 Phase A: storefront 上のお客様クリック・スクロールを集計し、
 * 「どこをクリックされたか」「どこで離脱したか」を非エンジニア（中学生レベル）でも
 * ひと目でわかる形に可視化する。
 *
 * 機能:
 * - ページ選択（記録があるページの一覧、サンプル数つき）
 * - 期間選択（1日/7日/30日）
 * - クリックヒートマップ: x/y を 0-1 normalized で記録 → 抽象的な viewBox に dot 描画
 * - イライラクリック（rage click）警告: 短時間に同じ場所を連打した点
 * - スクロール平均到達率
 * - クリックされやすいリンク Top 10
 *
 * UX:
 * - 凡例は中学生向け: 「🔴 赤＝みんながクリック / 🔵 青＝誰も見てない」
 * - データなしのときは EmptyCard で「まだ何も計測されていません」と案内
 */

import { useEffect, useMemo, useState } from 'react';
import { color } from '~/lib/design-tokens';
import { AdminListSkeleton, AdminEmptyCard } from '~/components/admin/ds/InlineListState';
import { TabHeaderHint } from '~/components/admin/ds/TabHeaderHint';

interface PageEntry {
  path: string;
  sample: number;
}

interface ClickPoint {
  x: number;
  y: number;
  sel?: string;
  txt?: string;
  vw?: number;
  vh?: number;
}

interface RagePoint {
  x: number;
  y: number;
  c?: number;
}

interface TopLink {
  count: number;
  sel: string;
  txt?: string;
}

interface HeatmapData {
  page: string;
  days: number;
  sessions: number;
  pageviews: number;
  clicks: ClickPoint[];
  rages: RagePoint[];
  avgScroll: number;
  topLinks: TopLink[];
  batchCount: number;
}

const HEATMAP_W = 960;
const HEATMAP_H = 540;
const DOT_RADIUS = 18;

export default function AdminUxr() {
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [loadingPages, setLoadingPages] = useState(true);
  const [selectedPage, setSelectedPage] = useState<string>('');
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loadingHeatmap, setLoadingHeatmap] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 1. ページ一覧の読み込み ──
  useEffect(() => {
    let cancelled = false;
    setLoadingPages(true);
    fetch('/api/admin/uxr?action=pages', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { success?: boolean; pages?: PageEntry[] }) => {
        if (cancelled) return;
        const arr = Array.isArray(d.pages) ? d.pages : [];
        setPages(arr);
        if (arr.length > 0) setSelectedPage(arr[0].path);
        setLoadingPages(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingPages(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── 2. 選択ページのヒートマップ取得 ──
  useEffect(() => {
    if (!selectedPage) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoadingHeatmap(true);
    setError(null);
    const params = new URLSearchParams({
      action: 'heatmap',
      page: selectedPage,
      days: String(days),
    });
    fetch('/api/admin/uxr?' + params.toString(), { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { success?: boolean; error?: string } & Partial<HeatmapData>) => {
        if (cancelled) return;
        if (!d.success) {
          setError(d.error || 'データ取得に失敗しました');
          setData(null);
        } else {
          setData(d as HeatmapData);
        }
        setLoadingHeatmap(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '通信エラー');
        setLoadingHeatmap(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPage, days]);

  // ── 3. クリック密度を計算（近接点を束ねて熱気を出す） ──
  const heatBlobs = useMemo(() => {
    if (!data || data.clicks.length === 0) return [];
    // grid: 24x14 マスに分けて count
    const gx = 24;
    const gy = 14;
    const grid: Record<string, { x: number; y: number; n: number }> = {};
    for (const c of data.clicks) {
      const ix = Math.min(gx - 1, Math.max(0, Math.floor(c.x * gx)));
      const iy = Math.min(gy - 1, Math.max(0, Math.floor(c.y * gy)));
      const k = ix + ':' + iy;
      const slot = grid[k] || {
        x: (ix + 0.5) / gx,
        y: (iy + 0.5) / gy,
        n: 0,
      };
      slot.n += 1;
      grid[k] = slot;
    }
    const arr = Object.values(grid);
    const max = arr.reduce((m, b) => Math.max(m, b.n), 1);
    return arr.map((b) => ({
      cx: b.x * HEATMAP_W,
      cy: b.y * HEATMAP_H,
      // 強度 0-1
      intensity: b.n / max,
      n: b.n,
    }));
  }, [data]);

  if (loadingPages) {
    return <AdminListSkeleton rows={4} />;
  }

  return (
    <div>
      <TabHeaderHint
        title="お客様の動きを見る"
        description="お店のページで、お客様が「どこをクリックしたか」「どこまでスクロールしたか」を地図のように見られます。赤いところはみんながクリックした人気エリアです。"
        relatedTabs={[
          { label: 'キャンペーン効果', tab: 'marketing' },
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 240 }}>
          <label
            htmlFor="uxr-page-select"
            style={{ fontSize: 11, color: color.textMuted, fontWeight: 600 }}
          >
            見たいページ
          </label>
          <select
            id="uxr-page-select"
            value={selectedPage}
            onChange={(e) => setSelectedPage(e.target.value)}
            disabled={pages.length === 0}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid ' + color.border,
              background: color.bg1,
              color: color.text,
              fontSize: 12,
              minWidth: 240,
            }}
          >
            {pages.length === 0 ? (
              <option value="">（まだ計測データなし）</option>
            ) : (
              pages.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.path}（{p.sample}件）
                </option>
              ))
            )}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            htmlFor="uxr-days-select"
            style={{ fontSize: 11, color: color.textMuted, fontWeight: 600 }}
          >
            期間
          </label>
          <select
            id="uxr-days-select"
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
      </div>

      {/* ── 計測データなし ── */}
      {pages.length === 0 && (
        <AdminEmptyCard
          icon="🎬"
          title="まだお客様の動きが記録されていません"
          description="お店のページに人が訪れて、クリックやスクロールが起きると、ここに自動で集まります。最初のお客様を待っている状態です。"
        />
      )}

      {/* ── データロード中 ── */}
      {pages.length > 0 && loadingHeatmap && <AdminListSkeleton rows={3} />}

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

      {/* ── ヒートマップ本体 ── */}
      {data && !loadingHeatmap && (
        <>
          {/* KPI カード */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <KpiCard label="お客様（人）" value={data.sessions.toLocaleString()} sub="ユニーク訪問" />
            <KpiCard
              label="ページ表示"
              value={data.pageviews.toLocaleString()}
              sub="のべ閲覧回数"
            />
            <KpiCard
              label="クリック数"
              value={data.clicks.length.toLocaleString()}
              sub="押された場所の合計"
            />
            <KpiCard
              label="平均スクロール"
              value={data.avgScroll + '%'}
              sub="どこまで読まれたか"
              accent={data.avgScroll < 30 ? 'red' : data.avgScroll < 60 ? 'yellow' : 'green'}
            />
            <KpiCard
              label="イライラクリック"
              value={data.rages.length.toLocaleString()}
              sub="連打された点"
              accent={data.rages.length > 0 ? 'red' : 'muted'}
            />
          </div>

          {/* 凡例 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
              marginBottom: 12,
              fontSize: 11,
              color: color.textMuted,
            }}
          >
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  background: '#ff2d55',
                  borderRadius: '50%',
                  marginRight: 4,
                }}
              />
              赤 ＝ みんながクリックした人気エリア
            </span>
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  background: '#ffb300',
                  borderRadius: '50%',
                  marginRight: 4,
                }}
              />
              黄 ＝ そこそこクリック
            </span>
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  background: '#00f0ff',
                  borderRadius: '50%',
                  marginRight: 4,
                }}
              />
              青 ＝ 少しだけ
            </span>
            <span>
              <span style={{ color: color.red, fontWeight: 700, marginRight: 4 }}>▲</span>
              イライラクリック（うまく動かない場所のサイン）
            </span>
          </div>

          {/* SVG ヒートマップ */}
          <div
            style={{
              background: color.bg1,
              border: '1px solid ' + color.border,
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
              overflow: 'auto',
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: color.textMuted,
                marginBottom: 8,
              }}
            >
              ページ <strong style={{ color: color.text }}>{data.page}</strong> のクリック分布（過去 {data.days} 日）
            </div>
            {data.clicks.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: 40,
                  color: color.textMuted,
                  fontSize: 12,
                }}
              >
                このページではまだクリックが記録されていません
              </div>
            ) : (
              <svg
                viewBox={`0 0 ${HEATMAP_W} ${HEATMAP_H}`}
                role="img"
                aria-label="クリックヒートマップ"
                style={{
                  width: '100%',
                  maxWidth: HEATMAP_W,
                  height: 'auto',
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,.03) 0%, rgba(255,255,255,.01) 100%)',
                  borderRadius: 8,
                }}
              >
                {/* 上部ヘッダー帯（ページ上部の目印） */}
                <rect
                  x={0}
                  y={0}
                  width={HEATMAP_W}
                  height={48}
                  fill="rgba(255,255,255,.04)"
                />
                <text
                  x={HEATMAP_W / 2}
                  y={28}
                  textAnchor="middle"
                  fill={color.textMuted}
                  fontSize={11}
                >
                  ↑ ページの上の方
                </text>

                {/* スクロール到達ライン（赤の点線） */}
                {data.avgScroll > 0 && data.avgScroll < 100 && (
                  <g>
                    <line
                      x1={0}
                      y1={(HEATMAP_H * data.avgScroll) / 100}
                      x2={HEATMAP_W}
                      y2={(HEATMAP_H * data.avgScroll) / 100}
                      stroke="rgba(255,179,0,.5)"
                      strokeWidth={1.5}
                      strokeDasharray="6 6"
                    />
                    <text
                      x={HEATMAP_W - 12}
                      y={(HEATMAP_H * data.avgScroll) / 100 - 6}
                      textAnchor="end"
                      fill="#ffb300"
                      fontSize={10}
                      fontWeight={700}
                    >
                      平均スクロール {data.avgScroll}%
                    </text>
                  </g>
                )}

                {/* クリックヒート点 */}
                {heatBlobs.map((b, i) => {
                  const c =
                    b.intensity > 0.66
                      ? '#ff2d55'
                      : b.intensity > 0.33
                        ? '#ffb300'
                        : '#00f0ff';
                  return (
                    <circle
                      key={'c' + i}
                      cx={b.cx}
                      cy={b.cy}
                      r={DOT_RADIUS + b.intensity * 14}
                      fill={c}
                      opacity={0.18 + b.intensity * 0.55}
                    >
                      <title>
                        {b.n} 件のクリック
                      </title>
                    </circle>
                  );
                })}

                {/* イライラクリック ▲ */}
                {data.rages.map((r, i) => {
                  const cx = r.x * HEATMAP_W;
                  const cy = r.y * HEATMAP_H;
                  return (
                    <polygon
                      key={'r' + i}
                      points={`${cx},${cy - 10} ${cx - 9},${cy + 8} ${cx + 9},${cy + 8}`}
                      fill="rgba(255,45,85,.85)"
                      stroke="#fff"
                      strokeWidth={1}
                    >
                      <title>
                        イライラクリック（{r.c || '?'} 連打）
                      </title>
                    </polygon>
                  );
                })}

                {/* 下部 */}
                <text
                  x={HEATMAP_W / 2}
                  y={HEATMAP_H - 12}
                  textAnchor="middle"
                  fill={color.textMuted}
                  fontSize={11}
                >
                  ↓ ページの下の方
                </text>
              </svg>
            )}
          </div>

          {/* よくクリックされたリンク */}
          <div
            style={{
              background: color.bg1,
              border: '1px solid ' + color.border,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: color.text,
                marginBottom: 12,
              }}
            >
              🔝 よくクリックされた場所 Top {data.topLinks.length}
            </div>
            {data.topLinks.length === 0 ? (
              <div style={{ fontSize: 11, color: color.textMuted }}>
                クリックされたリンクの情報はまだありません
              </div>
            ) : (
              <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {data.topLinks.map((l, i) => {
                  const max = data.topLinks[0]?.count || 1;
                  const pct = Math.round((l.count / max) * 100);
                  return (
                    <li
                      key={i}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '32px 1fr 80px',
                        gap: 8,
                        alignItems: 'center',
                        padding: '8px 0',
                        borderBottom:
                          i < data.topLinks.length - 1
                            ? '1px solid ' + color.border
                            : 'none',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: i < 3 ? color.cyan : color.textMuted,
                        }}
                      >
                        {i + 1}.
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            color: color.text,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={l.txt || l.sel}
                        >
                          {l.txt || '（テキストなし）'}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: color.textMuted,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={l.sel}
                        >
                          {l.sel}
                        </div>
                        <div
                          style={{
                            background: 'rgba(0,240,255,.08)',
                            height: 4,
                            borderRadius: 2,
                            marginTop: 4,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: pct + '%',
                              height: '100%',
                              background: color.cyan,
                            }}
                          />
                        </div>
                      </div>
                      <span
                        style={{
                          textAlign: 'right',
                          fontSize: 11,
                          color: color.cyan,
                          fontWeight: 700,
                        }}
                      >
                        {l.count} 回
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div
            style={{
              fontSize: 10,
              color: color.textMuted,
              marginTop: 12,
              textAlign: 'right',
            }}
          >
            集計バッチ数: {data.batchCount}
          </div>
        </>
      )}
    </div>
  );
}

// ── 小さな KPI カード ──
function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'red' | 'yellow' | 'green' | 'muted';
}) {
  const accentColor =
    accent === 'red'
      ? color.red
      : accent === 'yellow'
        ? color.yellow
        : accent === 'green'
          ? color.green
          : color.cyan;
  return (
    <div
      style={{
        background: color.bg1,
        border: '1px solid ' + color.border,
        borderRadius: 10,
        padding: '12px 14px',
      }}
    >
      <div style={{ fontSize: 10, color: color.textMuted, fontWeight: 600 }}>{label}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: accentColor,
          marginTop: 4,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: color.textMuted, marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}
