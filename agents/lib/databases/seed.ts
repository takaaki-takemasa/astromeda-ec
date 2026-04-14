/**
 * Seed Data — シードデータ投入（初期栄養素）
 *
 * 医学メタファー: 胎児への初期栄養供給。
 * システム起動直後に最低限のデータを投入し、エージェントが即座に動作できるようにする。
 *
 * 冪等性保証: ON CONFLICT DO NOTHING で重複挿入を防止。
 */

import { getDatabase, isDatabaseConnected } from './connection';
import { createLogger } from '../../core/logger.js';

const log = createLogger('seed');


export async function seedDatabase(): Promise<{ inserted: Record<string, number> }> {
  const { sql } = await getDatabase();
  if (!sql) {
    // P-02: サイレントスキップ→明示エラー。DATABASE_URL設定済みなのにDB接続失敗=本当の障害
    const hasDbUrl = !!process.env.DATABASE_URL;
    if (hasDbUrl) {
      throw new Error('[Seed] DATABASE_URL is set but SQL connection failed — DB障害の可能性');
    }
    log.warn('[Seed] DB未接続（InMemoryモード） — Seed スキップ');
    return { inserted: {} };
  }

  const result: Record<string, number> = {};

  // ─── 1. analytics_daily: 過去30日分 ───
  const today = new Date();
  let analyticsCount = 0;

  for (let i = 30; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    // 曜日で変動（週末は少ない）
    const dow = d.getDay();
    const weekendFactor = (dow === 0 || dow === 6) ? 0.6 : 1.0;
    const baseSessions = Math.round((800 + Math.random() * 400) * weekendFactor);
    const baseUsers = Math.round(baseSessions * 0.7);
    const baseOrders = Math.round(baseSessions * 0.015);
    const baseRevenue = baseOrders * (180000 + Math.round(Math.random() * 60000));

    const res = await sql`
      INSERT INTO analytics_daily (date, sessions, users, new_users, pageviews, bounce_rate, avg_session_sec, orders, revenue_jpy, aov_jpy, conversion_rate, device_breakdown, source_breakdown)
      VALUES (
        ${dateStr},
        ${baseSessions},
        ${baseUsers},
        ${Math.round(baseUsers * 0.4)},
        ${Math.round(baseSessions * 3.2)},
        ${(0.35 + Math.random() * 0.15).toFixed(4)},
        ${(120 + Math.random() * 60).toFixed(2)},
        ${baseOrders},
        ${baseRevenue},
        ${baseOrders > 0 ? Math.round(baseRevenue / baseOrders) : 0},
        ${baseOrders > 0 ? (baseOrders / baseSessions).toFixed(4) : '0'},
        ${JSON.stringify({ desktop: 0.55, mobile: 0.38, tablet: 0.07 })},
        ${JSON.stringify({ organic: 0.42, paid: 0.28, direct: 0.18, social: 0.12 })}
      )
      ON CONFLICT (date) DO NOTHING
    `;
    if (res.count > 0) analyticsCount++;
  }
  result['analytics_daily'] = analyticsCount;

  // ─── 2. competitor_weekly: PC7社の初期データ ───
  const competitors = [
    { name: 'dospara', products: [
      { name: 'GALLERIA XA7C-R47TS', price: 299980, cpu: 'Core i7-14700F', gpu: 'RTX 4070 Ti SUPER', ram: 32 },
      { name: 'GALLERIA RM7C-R46T', price: 219980, cpu: 'Core i7-14700F', gpu: 'RTX 4060 Ti', ram: 16 },
    ]},
    { name: 'mouse', products: [
      { name: 'G-Tune FG-A7G7T', price: 329800, cpu: 'Ryzen 7 7800X3D', gpu: 'RTX 4070 Ti', ram: 32 },
      { name: 'G-Tune DG-I7G6T', price: 199800, cpu: 'Core i7-14700F', gpu: 'RTX 4060 Ti', ram: 16 },
    ]},
    { name: 'pc-koubou', products: [
      { name: 'LEVEL-R779-LC147-ULX', price: 289800, cpu: 'Core i7-14700', gpu: 'RTX 4070 Ti SUPER', ram: 32 },
    ]},
    { name: 'tsukumo', products: [
      { name: 'G-GEAR GA7J-H247/B', price: 269800, cpu: 'Core i7-14700F', gpu: 'RTX 4070 SUPER', ram: 32 },
    ]},
    { name: 'sycom', products: [
      { name: 'G-Master Spear X670A', price: 349800, cpu: 'Ryzen 9 7950X', gpu: 'RTX 4080 SUPER', ram: 32 },
    ]},
    { name: 'frontier', products: [
      { name: 'FRGAG-B760/WS1024', price: 209800, cpu: 'Core i7-14700F', gpu: 'RTX 4060 Ti', ram: 32 },
    ]},
    { name: 'hp', products: [
      { name: 'OMEN 45L Desktop', price: 389800, cpu: 'Core i9-14900K', gpu: 'RTX 4090', ram: 64 },
    ]},
  ];

  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // 直近の日曜
  const weekStr = weekStart.toISOString().split('T')[0];
  let compCount = 0;

  for (const comp of competitors) {
    for (const prod of comp.products) {
      const res = await sql`
        INSERT INTO competitor_weekly (week_start, competitor, product_name, price_jpy, in_stock, cpu, gpu, ram_gb, storage_desc)
        VALUES (
          ${weekStr},
          ${comp.name},
          ${prod.name},
          ${prod.price},
          TRUE,
          ${prod.cpu},
          ${prod.gpu},
          ${prod.ram},
          '1TB NVMe SSD'
        )
        ON CONFLICT (week_start, competitor, product_name) DO NOTHING
      `;
      if (res.count > 0) compCount++;
    }
  }
  result['competitor_weekly'] = compCount;

  // ─── 3. approval_queue: テスト用承認リクエスト ───
  const testApprovals = [
    { id: 'test-approval-001', agent: 'content-writer', type: 'content', title: '新商品紹介記事: RTX 5080搭載モデル', confidence: 0.82 },
    { id: 'test-approval-002', agent: 'seo-director', type: 'seo', title: 'メタタグ一括更新: 夏セール対応', confidence: 0.71 },
    { id: 'test-approval-003', agent: 'pricing-agent', type: 'pricing', title: '競合価格連動: GALLERIA対抗値下げ', confidence: 0.65 },
    { id: 'test-approval-004', agent: 'sns-manager', type: 'content', title: 'X投稿: 呪術廻戦コラボ新商品告知', confidence: 0.88 },
    { id: 'test-approval-005', agent: 'promotion-agent', type: 'promotion', title: 'ゴールデンウィーク限定クーポン発行', confidence: 0.75 },
  ];

  let approvalCount = 0;
  for (const a of testApprovals) {
    const res = await sql`
      INSERT INTO approval_queue (request_id, agent_id, action_type, title, confidence, risk_level, status)
      VALUES (${a.id}, ${a.agent}, ${a.type}, ${a.title}, ${a.confidence}, 'medium', 'pending')
      ON CONFLICT (request_id) DO NOTHING
    `;
    if (res.count > 0) approvalCount++;
  }
  result['approval_queue'] = approvalCount;

  log.info('[Seed] 完了:', result);
  return { inserted: result };
}
