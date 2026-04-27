/**
 * AdminMarketingStats — マーケ分析ダッシュボード (patch 0161)
 *
 * 1 画面に全部:
 *  - 訪問数・PV・コンバージョン率 (KPI)
 *  - 流入経路 ランキング (referrer / utm)
 *  - クリックされたリンク Top
 *  - 売れた商品 ランキング (Shopify orders 集計)
 *  - PV Top URL
 */
import {useEffect, useState, useCallback} from 'react';
import {color, radius, space} from '~/lib/design-tokens';
import {AdminListSkeleton, AdminEmptyCard} from '~/components/admin/ds/InlineListState';
import {TabHeaderHint} from '~/components/admin/ds/TabHeaderHint';

interface ReferrerStat {source: string; sessions: number; share: number}
interface ClickedLinkStat {page: string; target: string; clicks: number}
interface PageStat {path: string; pageviews: number}
interface MarketingResp {
  success: boolean;
  days: number;
  totalSessions: number;
  totalPageviews: number;
  totalClicks: number;
  referrers: ReferrerStat[];
  clickedLinks: ClickedLinkStat[];
  topPages: PageStat[];
}
interface RankedProduct {
  rank: number; productTitle: string; handle: string;
  totalQuantity: number; totalRevenue: number; orderCount: number; avgPrice: number;
  imageUrl: string | null;
}
interface FunnelResp {
  success: boolean;
  totalSessions: number;
  stages: Array<{stage: string; label: string; sessions: number; conversionFromTop: number; dropoffRate: number}>;
}

const cardStyle: React.CSSProperties = {
  background: color.bg1, border: `1px solid ${color.border}`, borderRadius: radius.lg,
  padding: space[4], marginBottom: space[3],
};
const kpiStyle: React.CSSProperties = {
  background: color.bg1, border: `1px solid ${color.border}`, borderRadius: radius.lg,
  padding: space[4], textAlign: 'center', flex: 1, minWidth: 140,
};

export default function AdminMarketingStats() {
  const [days, setDays] = useState(7);
  const [marketing, setMarketing] = useState<MarketingResp | null>(null);
  const [funnel, setFunnel] = useState<FunnelResp | null>(null);
  const [products, setProducts] = useState<RankedProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const [m, f, p] = await Promise.all([
        fetch(`/api/admin/uxr?action=marketing&days=${d}&topN=15`, {credentials: 'include'}).then((r) => r.json() as Promise<MarketingResp | null>).catch(() => null),
        fetch(`/api/admin/uxr?action=funnel&days=${d}`, {credentials: 'include'}).then((r) => r.json() as Promise<FunnelResp | null>).catch(() => null),
        fetch(`/api/admin/product-ranking?days=${d}&limit=15`, {credentials: 'include'}).then((r) => r.json() as Promise<{success: boolean; ranking?: RankedProduct[]} | null>).catch(() => null),
      ]);
      setMarketing(m && m.success ? m : null);
      setFunnel(f && f.success ? f : null);
      setProducts(p && p.success && Array.isArray(p.ranking) ? p.ranking : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(days); }, [days, refresh]);

  // CVR = checkout 段 / landing 段
  const cvr = funnel ? (() => {
    const checkout = funnel.stages?.find((s) => s.stage === 'checkout');
    return checkout?.conversionFromTop ?? 0;
  })() : 0;

  return (
    <div style={{padding: space[4]}}>
      <TabHeaderHint
        title="📈 マーケ分析"
        description="サイトへの訪問数、流入経路、コンバージョン率、よくクリックされるリンク、売れた商品ランキングを 1 画面で確認します。"
      />

      {/* 期間切替 */}
      <div style={{display: 'flex', gap: space[2], marginBottom: space[3]}}>
        {[7, 14, 30].map((d) => (
          <button key={d} onClick={() => setDays(d)} style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600,
            color: days === d ? '#000' : color.textMuted,
            background: days === d ? '#00F0FF' : 'transparent',
            border: `1px solid ${days === d ? '#00F0FF' : color.border}`,
            borderRadius: 6, cursor: 'pointer',
          }}>過去 {d} 日</button>
        ))}
      </div>

      {loading ? <AdminListSkeleton rows={4} /> : (
        <>
          {/* KPI 4 枚 */}
          <div style={{display: 'flex', gap: space[3], marginBottom: space[3], flexWrap: 'wrap'}}>
            <Kpi label="👥 訪問数" value={marketing?.totalSessions ?? 0} unit="人" />
            <Kpi label="👁 ページビュー" value={marketing?.totalPageviews ?? 0} unit="回" />
            <Kpi label="🖱 クリック数" value={marketing?.totalClicks ?? 0} unit="回" />
            <Kpi label="🎯 購入手続き率 (CVR)" value={cvr.toFixed(1)} unit="%" highlight={cvr > 0} />
          </div>

          {/* 売れた商品 (Shopify orders) */}
          <div style={cardStyle}>
            <h3 style={{margin: 0, marginBottom: space[2], fontSize: 14, color: color.text}}>🏆 売れた商品 ランキング (過去 {days} 日)</h3>
            {products.length === 0 ? (
              <AdminEmptyCard title="まだ売上データがありません" description="本番運用が始まると、売れた数・売上額が並びます。" />
            ) : (
              <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 12}}>
                <thead>
                  <tr style={{textAlign: 'left', borderBottom: `1px solid ${color.border}`, color: color.textMuted}}>
                    <th style={{padding: '6px 4px'}}>順位</th>
                    <th style={{padding: '6px 4px'}}>商品</th>
                    <th style={{padding: '6px 4px', textAlign: 'right'}}>販売数</th>
                    <th style={{padding: '6px 4px', textAlign: 'right'}}>売上 (円)</th>
                    <th style={{padding: '6px 4px', textAlign: 'right'}}>注文件数</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={`${p.rank}-${p.handle}`} style={{borderBottom: `1px solid ${color.border}`}}>
                      <td style={{padding: '6px 4px', color: color.cyan, fontWeight: 700}}>#{p.rank}</td>
                      <td style={{padding: '6px 4px'}}>
                        <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                          {p.imageUrl && <img src={p.imageUrl} alt="" width={28} height={28} style={{borderRadius: 4, objectFit: 'cover'}} />}
                          <span style={{color: color.text}}>{p.productTitle}</span>
                        </div>
                      </td>
                      <td style={{padding: '6px 4px', textAlign: 'right', fontWeight: 700, color: color.text}}>{p.totalQuantity}</td>
                      <td style={{padding: '6px 4px', textAlign: 'right', color: '#00E676'}}>¥{p.totalRevenue.toLocaleString()}</td>
                      <td style={{padding: '6px 4px', textAlign: 'right', color: color.textMuted}}>{p.orderCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 2 カラム: 流入経路 + PV Top URL */}
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: space[3]}}>
            {/* 流入経路 */}
            <div style={cardStyle}>
              <h3 style={{margin: 0, marginBottom: space[2], fontSize: 14, color: color.text}}>🚦 流入経路 ランキング</h3>
              {!marketing || marketing.referrers.length === 0 ? (
                <AdminEmptyCard title="流入データがありません" description="お客様が訪問するとここに集まります。" />
              ) : (
                <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 12}}>
                  <thead>
                    <tr style={{textAlign: 'left', borderBottom: `1px solid ${color.border}`, color: color.textMuted}}>
                      <th style={{padding: '6px 4px'}}>どこから来たか</th>
                      <th style={{padding: '6px 4px', textAlign: 'right'}}>訪問数</th>
                      <th style={{padding: '6px 4px', textAlign: 'right'}}>占有率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketing.referrers.map((r, i) => (
                      <tr key={i} style={{borderBottom: `1px solid ${color.border}`}}>
                        <td style={{padding: '6px 4px', color: color.text}}>{r.source}</td>
                        <td style={{padding: '6px 4px', textAlign: 'right', color: color.text}}>{r.sessions}</td>
                        <td style={{padding: '6px 4px', textAlign: 'right'}}>
                          <span style={{color: '#00F0FF', fontWeight: 600}}>{r.share}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* PV Top URL */}
            <div style={cardStyle}>
              <h3 style={{margin: 0, marginBottom: space[2], fontSize: 14, color: color.text}}>📄 よく見られたページ Top</h3>
              {!marketing || marketing.topPages.length === 0 ? (
                <AdminEmptyCard title="ページビューデータがありません" />
              ) : (
                <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 12}}>
                  <thead>
                    <tr style={{textAlign: 'left', borderBottom: `1px solid ${color.border}`, color: color.textMuted}}>
                      <th style={{padding: '6px 4px'}}>URL</th>
                      <th style={{padding: '6px 4px', textAlign: 'right'}}>表示回数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketing.topPages.map((p, i) => (
                      <tr key={i} style={{borderBottom: `1px solid ${color.border}`}}>
                        <td style={{padding: '6px 4px', color: color.text, fontFamily: 'monospace', fontSize: 11}}>{p.path}</td>
                        <td style={{padding: '6px 4px', textAlign: 'right', color: color.text, fontWeight: 600}}>{p.pageviews}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* クリックされたリンク */}
          <div style={cardStyle}>
            <h3 style={{margin: 0, marginBottom: space[2], fontSize: 14, color: color.text}}>🖱 よくクリックされたリンク Top</h3>
            {!marketing || marketing.clickedLinks.length === 0 ? (
              <AdminEmptyCard title="クリックデータがありません" description="ヒートマップが集まるとここに並びます。" />
            ) : (
              <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 12}}>
                <thead>
                  <tr style={{textAlign: 'left', borderBottom: `1px solid ${color.border}`, color: color.textMuted}}>
                    <th style={{padding: '6px 4px'}}>ページ</th>
                    <th style={{padding: '6px 4px'}}>クリックされた要素</th>
                    <th style={{padding: '6px 4px', textAlign: 'right'}}>回数</th>
                  </tr>
                </thead>
                <tbody>
                  {marketing.clickedLinks.map((c, i) => (
                    <tr key={i} style={{borderBottom: `1px solid ${color.border}`}}>
                      <td style={{padding: '6px 4px', fontFamily: 'monospace', fontSize: 11, color: color.textMuted}}>{c.page}</td>
                      <td style={{padding: '6px 4px', color: color.text}}>{c.target}</td>
                      <td style={{padding: '6px 4px', textAlign: 'right', color: '#00F0FF', fontWeight: 600}}>{c.clicks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 補足 */}
          <div style={{fontSize: 10, color: color.textMuted, marginTop: space[2]}}>
            ※ 流入・クリック・PV データは このシステム内蔵のヒートマップ追跡から (Google Analytics 不要・お客様データは外部送信なし)。
            売上ランキングは Shopify 注文データから集計。
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({label, value, unit, highlight}: {label: string; value: number | string; unit: string; highlight?: boolean}) {
  return (
    <div style={kpiStyle}>
      <div style={{fontSize: 11, color: color.textMuted, marginBottom: 6}}>{label}</div>
      <div style={{fontSize: 28, fontWeight: 800, color: highlight ? '#00F0FF' : color.text}}>
        {value}<span style={{fontSize: 12, fontWeight: 400, color: color.textMuted, marginLeft: 4}}>{unit}</span>
      </div>
    </div>
  );
}
