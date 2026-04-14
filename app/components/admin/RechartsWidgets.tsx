/**
 * RechartsWidgets — Recharts ベースのデータ可視化コンポーネント
 * 感覚器系: CEO が売上トレンドとチャネル分布を3秒で把握
 */
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, CartesianGrid,
} from 'recharts';
import { color, font, radius, formatJPY, chartPalette } from '~/lib/design-tokens';

// ── 売上トレンドチャート ──
interface TrendDataPoint {
  label: string;
  revenue: number;
  orders?: number;
}

interface SalesTrendChartProps {
  data: TrendDataPoint[];
  height?: number;
  showOrders?: boolean;
}

export function SalesTrendChart({ data, height = 240, showOrders = false }: SalesTrendChartProps) {
  if (data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.textDim, fontSize: font.sm }}>
        データなし
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color.cyan} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color.cyan} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="ordersGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color.green} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color.green} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: color.textDim, fontSize: 10, fontFamily: font.mono }}
          axisLine={{ stroke: color.border }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: color.textDim, fontSize: 10, fontFamily: font.mono }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatJPY(v)}
          width={60}
        />
        <Tooltip
          contentStyle={{
            background: color.bg1, border: `1px solid ${color.border}`,
            borderRadius: radius.md, fontSize: font.xs, fontFamily: font.family,
            color: color.text, boxShadow: '0 4px 16px rgba(0,0,0,.4)',
          }}
          formatter={((value: number, name: string) => [
            name === 'revenue' ? formatJPY(value) : `${value}件`,
            name === 'revenue' ? '売上' : '注文数',
          ]) as unknown as (value: number, name: string) => [string, string]}
          labelStyle={{ color: color.textMuted, fontSize: 10 }}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke={color.cyan}
          strokeWidth={2}
          fill="url(#revenueGrad)"
          dot={false}
          activeDot={{ r: 4, fill: color.cyan, stroke: color.bg0, strokeWidth: 2 }}
        />
        {showOrders && (
          <Area
            type="monotone"
            dataKey="orders"
            stroke={color.green}
            strokeWidth={1.5}
            fill="url(#ordersGrad)"
            dot={false}
            yAxisId="right"
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── チャネルドーナツチャート ──
interface ChannelDataPoint {
  channel: string;
  revenue: number;
  orders: number;
}

interface ChannelDonutProps {
  data: ChannelDataPoint[];
  height?: number;
}

export function ChannelDonut({ data, height = 200 }: ChannelDonutProps) {
  if (data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.textDim, fontSize: font.sm }}>
        データなし
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <ResponsiveContainer width="50%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="revenue"
            nameKey="channel"
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={chartPalette[i % chartPalette.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: color.bg1, border: `1px solid ${color.border}`,
              borderRadius: radius.md, fontSize: font.xs, fontFamily: font.family,
              color: color.text,
            }}
            formatter={((value: number) => [formatJPY(value), '売上']) as unknown as (value: number) => [string, string]}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* レジェンド */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {data.slice(0, 6).map((d, i) => (
          <div key={d.channel} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '2px', flexShrink: 0,
              background: chartPalette[i % chartPalette.length],
            }} />
            <span style={{ fontSize: font.xs, color: color.textSecondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.channel}
            </span>
            <span style={{ fontSize: '10px', color: color.textDim, fontFamily: font.mono }}>
              {total > 0 ? `${((d.revenue / total) * 100).toFixed(0)}%` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 日別注文数バーチャート ──
interface DailyBarDataPoint {
  label: string;
  orders: number;
}

interface DailyOrdersBarProps {
  data: DailyBarDataPoint[];
  height?: number;
}

export function DailyOrdersBar({ data, height = 160 }: DailyOrdersBarProps) {
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: color.textDim, fontSize: 10, fontFamily: font.mono }}
          axisLine={{ stroke: color.border }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: color.textDim, fontSize: 10, fontFamily: font.mono }}
          axisLine={false}
          tickLine={false}
          width={30}
        />
        <Tooltip
          contentStyle={{
            background: color.bg1, border: `1px solid ${color.border}`,
            borderRadius: radius.md, fontSize: font.xs, fontFamily: font.family,
            color: color.text,
          }}
          formatter={((value: number) => [`${value}件`, '注文数']) as unknown as (value: number) => [string, string]}
        />
        <Bar dataKey="orders" fill={color.cyan} radius={[3, 3, 0, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
