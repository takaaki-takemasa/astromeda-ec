/**
 * AdminFunnel Tab — ファネル（どこで離脱しているか）
 *
 * patch 0125 Phase C: storefront に来たお客様が「サイトに来た → 商品ページを見た →
 * カートに入れた → 購入手続きに進んだ」の各段階で何 % 落ちているかを、
 * 中学生でも一目で分かる形で可視化する。
 *
 * データ源: KV に貯まっている UxrBatch を sid 別に集計（ヒートマップと同じ素材）。
 *
 * UX:
 * - 4 段の横棒で「どこで詰まっているか」が視覚的に分かる
 * - 各段の右に「前段からの到達率」「離脱数 / 離脱率」を併記
 * - 期間切替（1/7/14/30 日）
 * - 補助診断: 人気商品 path Top5 / 人気カート path Top5
 */

import { useEffect, useState } from 'react';
import { color } from '~/lib/design-tokens';
import { AdminListSkeleton, AdminEmptyCard } from '~/components/admin/ds/InlineListState';
import { TabHeaderHint } from '~/components/admin/ds/TabHeaderHint';

interface FunnelStageStat {
  stage: 'landing' | 'product' | 'cart' | 'checkout';
  label: string;
  sessions: number;
  conversionFromPrev: number;
  conversionFromTop: number;
  dropoffCount: number;
  dropoffRate: number;
}

interface FunnelResult {
  days: number;
  totalSessions: number;
  stages: FunnelStageStat[];
  topProductPaths: Array<{ path: string; sessions: number }>;
  topCartPaths: Array<{ path: string; sessions: number }>;
}

const STAGE_COLORS: Record<FunnelStageStat['stage'], string> = {
  landing: '#00f0ff', // cyan
  product: '#7af0a3', // green
  cart: '#ffb300', // amber
  checkout: '#ff2d55', // red（最終ゴール）
};

export default function AdminFunnel() {
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<FunnelResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      action: 'funnel',
      days: String(days),
    });
    fetch('/api/admin/uxr?' + params.toString(), { credentials: 'include' })
      .then((r) => r.json())
      .then((raw: unknown) => {
        if (cancelled) return;
        const d = (raw || {}) as { success?: boolean; error?: string } & Partial<FunnelResult>;
        if (!d.success) {
          setError(d.error || 'データ取得に失敗しました');
          setData(null);
        } else {
          setData(d as FunnelResult);
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '通信エラー');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <div>
      <TabHeaderHint
        title="ファネル（どこで離脱しているか）"
        description="お客様が「サイトに来た → 商品を見た → カートに入れた → 購入手続きに進んだ」のどの段階で何 % 離脱しているかが分かります。一番細くなっているところが「お店の改善ポイント」です。"
        relatedTabs={[
          { label: 'お客様の動きを見る', tab: 'uxr' },
          { label: 'お客様セッション再生', tab: 'sessions' },
          { label: '詳しいデータ分析', tab: 'analytics' },
        ]}
      />

      {/* ── 期間セレクタ ── */}
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
            htmlFor="funnel-days-select"
            style={{ fontSize: 11, color: color.textMuted, fontWeight: 600 }}
          >
            期間
          </label>
          <select
            id="funnel-days-select"
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
            <option value={14}>直近 14 日</option>
            <option value={30}>直近 30 日</option>
          </select>
        </div>
      </div>

      {/* ── ロード中 ── */}
      {loading && <AdminListSkeleton rows={4} />}

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

      {/* ── データなし ── */}
      {!loading && data && data.totalSessions === 0 && (
        <AdminEmptyCard
          icon="🪜"
          title="まだ集計対象のお客様データがありません"
          description="お店のページに人が訪れて、クリックやページ遷移が起きると、ここに自動で集まります。最初のお客様を待っている状態です。"
        />
      )}

      {/* ── ファネル本体 ── */}
      {!loading && data && data.totalSessions > 0 && (
        <>
          {/* サマリー */}
          <div
            style={{
              background: color.bg1,
              border: '1px solid ' + color.border,
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 16,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 24,
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 10, color: color.textMuted, fontWeight: 600 }}>
                集計期間
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: color.text,
                  marginTop: 2,
                }}
              >
                直近 {data.days} 日
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: color.textMuted, fontWeight: 600 }}>
                お客様（人）
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: color.cyan,
                  marginTop: 2,
                  letterSpacing: '-0.02em',
                }}
              >
                {data.totalSessions.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: color.textMuted, fontWeight: 600 }}>
                購入手続きまで進んだ率
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: data.stages[3]?.conversionFromTop > 1 ? '#7af0a3' : color.red,
                  marginTop: 2,
                  letterSpacing: '-0.02em',
                }}
              >
                {data.stages[3]?.conversionFromTop ?? 0}%
              </div>
            </div>
          </div>

          {/* ── 凡例 ── */}
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
            <span>📏 横棒の長さ ＝ 1段目（サイトに来た人）からの到達率</span>
            <span>📉 矢印の数字 ＝ 前の段階から離脱した人数と割合</span>
          </div>

          {/* ── 4段ファネル ── */}
          <div
            style={{
              background: color.bg1,
              border: '1px solid ' + color.border,
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            {data.stages.map((s, idx) => {
              const isLast = idx === data.stages.length - 1;
              const stageColor = STAGE_COLORS[s.stage];
              // 横棒は conversionFromTop に比例（landing は常に 100%）
              const barPct = Math.max(2, s.conversionFromTop);
              return (
                <div key={s.stage}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '180px 1fr 200px',
                      gap: 16,
                      alignItems: 'center',
                      padding: '8px 0',
                    }}
                  >
                    {/* ラベル */}
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: color.text,
                        }}
                      >
                        {s.label}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: color.textMuted,
                          marginTop: 2,
                        }}
                      >
                        STEP {idx + 1}/4
                      </div>
                    </div>

                    {/* バー */}
                    <div
                      style={{
                        position: 'relative',
                        height: 36,
                        background: 'rgba(255,255,255,.04)',
                        borderRadius: 8,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: barPct + '%',
                          height: '100%',
                          background: stageColor,
                          opacity: 0.85,
                          transition: 'width 0.4s ease',
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          paddingLeft: 12,
                          fontSize: 13,
                          fontWeight: 800,
                          color: '#0D0D18',
                          textShadow: '0 1px 0 rgba(255,255,255,.35)',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {s.sessions.toLocaleString()} 人
                      </div>
                    </div>

                    {/* 数字 */}
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: stageColor,
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {s.conversionFromTop}%
                      </div>
                      <div style={{ fontSize: 10, color: color.textMuted, marginTop: 2 }}>
                        サイトに来た人を基準にした到達率
                      </div>
                    </div>
                  </div>

                  {/* 段間の離脱数（last 段以外） */}
                  {!isLast && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '180px 1fr 200px',
                        gap: 16,
                        padding: '4px 0',
                        alignItems: 'center',
                      }}
                    >
                      <div></div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          paddingLeft: 12,
                          fontSize: 11,
                          color: data.stages[idx + 1].dropoffRate > 50 ? color.red : color.textMuted,
                        }}
                      >
                        <span style={{ fontSize: 16 }}>↓</span>
                        <span>
                          ここで{' '}
                          <strong
                            style={{
                              color: data.stages[idx + 1].dropoffRate > 50 ? color.red : color.text,
                            }}
                          >
                            {data.stages[idx + 1].dropoffCount.toLocaleString()} 人
                          </strong>{' '}
                          離脱（{data.stages[idx + 1].dropoffRate}%）
                        </span>
                      </div>
                      <div
                        style={{
                          textAlign: 'right',
                          fontSize: 11,
                          color: color.textMuted,
                        }}
                      >
                        次への到達{' '}
                        <strong style={{ color: color.text }}>
                          {data.stages[idx + 1].conversionFromPrev}%
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── 補助診断: Top5 商品 / Top5 カート ── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
              marginBottom: 16,
            }}
          >
            <DiagPanel
              title="🛍 よく見られた商品ページ Top5"
              emptyMsg="まだ商品ページが見られていません"
              items={data.topProductPaths}
              accent="#7af0a3"
            />
            <DiagPanel
              title="🛒 よく到達したカート Top5"
              emptyMsg="まだカートに入れた人がいません"
              items={data.topCartPaths}
              accent="#ffb300"
            />
          </div>

          {/* ── 改善ヒント ── */}
          <ImprovementHint stages={data.stages} />
        </>
      )}
    </div>
  );
}

// ── 診断パネル ──
function DiagPanel({
  title,
  emptyMsg,
  items,
  accent,
}: {
  title: string;
  emptyMsg: string;
  items: Array<{ path: string; sessions: number }>;
  accent: string;
}) {
  return (
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
        {title}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: color.textMuted }}>{emptyMsg}</div>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {items.map((it, i) => {
            const max = items[0]?.sessions || 1;
            const pct = Math.round((it.sessions / max) * 100);
            return (
              <li
                key={it.path}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr 60px',
                  gap: 8,
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: i < items.length - 1 ? '1px solid ' + color.border : 'none',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: i < 3 ? accent : color.textMuted,
                  }}
                >
                  {i + 1}.
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: color.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={it.path}
                  >
                    {it.path}
                  </div>
                  <div
                    style={{
                      background: 'rgba(255,255,255,.05)',
                      height: 3,
                      borderRadius: 2,
                      marginTop: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: pct + '%',
                        height: '100%',
                        background: accent,
                      }}
                    />
                  </div>
                </div>
                <span
                  style={{
                    textAlign: 'right',
                    fontSize: 11,
                    color: accent,
                    fontWeight: 700,
                  }}
                >
                  {it.sessions} 人
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ── 改善ヒント（一番大きく落ちている段を指摘） ──
function ImprovementHint({ stages }: { stages: FunnelStageStat[] }) {
  // 段間の dropoffRate が最大の段（idx >= 1）を探す
  let worstIdx = -1;
  let worstRate = -1;
  for (let i = 1; i < stages.length; i++) {
    if (stages[i].dropoffRate > worstRate) {
      worstRate = stages[i].dropoffRate;
      worstIdx = i;
    }
  }

  if (worstIdx < 0 || worstRate <= 0) {
    return (
      <div
        style={{
          background: 'rgba(122,240,163,.05)',
          border: '1px solid rgba(122,240,163,.2)',
          borderRadius: 8,
          padding: 12,
          color: '#7af0a3',
          fontSize: 12,
        }}
      >
        ✨ 全段階で離脱がほぼありません。今のままでも順調です。
      </div>
    );
  }

  const prevLabel = stages[worstIdx - 1].label;
  const currLabel = stages[worstIdx].label;
  const dropoff = stages[worstIdx].dropoffCount;
  const rate = stages[worstIdx].dropoffRate;

  // 段ごとの改善ヒント
  const HINTS: Record<FunnelStageStat['stage'], string> = {
    landing: '',
    product:
      'トップページからの導線（バナー画像 / メニュー / おすすめ商品）を見直すと改善しやすい段階です。',
    cart:
      '商品ページの「カートに入れる」ボタンの目立ちやすさ・在庫表示・選択肢（プルダウン）の分かりやすさが効きます。',
    checkout:
      'カート画面の合計金額・送料表示・購入手続きボタンの目立ちやすさを見直すと改善しやすい段階です。',
  };

  const hint = HINTS[stages[worstIdx].stage];

  return (
    <div
      style={{
        background: 'rgba(255,179,0,.05)',
        border: '1px solid rgba(255,179,0,.25)',
        borderRadius: 10,
        padding: 14,
        fontSize: 12,
        color: color.text,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: '#ffb300', marginBottom: 6 }}>
        💡 改善ヒント — もっとも詰まっている段階
      </div>
      <div style={{ marginBottom: 6 }}>
        <strong>{prevLabel}</strong> → <strong>{currLabel}</strong> の間で{' '}
        <strong style={{ color: color.red }}>
          {dropoff.toLocaleString()} 人（{rate}%）
        </strong>{' '}
        が離脱しています。
      </div>
      {hint && <div style={{ color: color.textMuted, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}
