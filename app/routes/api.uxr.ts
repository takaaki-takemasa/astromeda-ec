/**
 * API Route: POST /api/uxr
 *
 * patch 0123 Phase A: お客様の動き（クリック・スクロール・rage click）を
 * 受け取り、KV にバッチ保存する公開エンドポイント。
 *
 * セキュリティ:
 * - 認証なし（storefront から sendBeacon で送られる）
 * - rate limit 60/min/IP（RATE_LIMIT_PRESETS.public）
 * - Content-Length 上限 50KB（小さなバッチ前提）
 * - 1バッチあたり events 最大 100 件
 * - admin 配下のクリックは client 側で skip しているが、サーバ側でも path で deny
 *
 * 設計:
 * - 常に 200 を返す（client を失敗させない）
 * - エラー時は detail を返さず {ok:true} で擬装（プローブ防止）
 */

import type { Route } from './+types/api.uxr';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { writeBatch, type UxrBatch, type UxrEvent } from '~/lib/uxr-storage';

const MAX_EVENTS_PER_BATCH = 100;
const MAX_PAYLOAD_BYTES = 50_000;
const MAX_SEL_LEN = 80;
const MAX_TXT_LEN = 40;
const MAX_PATH_LEN = 200;

/** path は admin / api / cdn を拒否（管理画面と内部経路は計測しない） */
function isPathBlocked(path: string): boolean {
  if (typeof path !== 'string') return true;
  if (path.length > MAX_PATH_LEN) return true;
  if (path.startsWith('/admin')) return true;
  if (path.startsWith('/api/')) return true;
  if (path.startsWith('/cdn/')) return true;
  return false;
}

/** event を最低限の整形＋切り詰め（過大な payload 防止） */
function sanitizeEvent(raw: unknown): UxrEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const t = String(e.t || '');
  // patch 0124 Phase B: 'nav'（SPA 遷移）'input'（入力 focus 滞在秒数）を追加
  if (t !== 'pv' && t !== 'click' && t !== 'scroll' && t !== 'rage' && t !== 'nav' && t !== 'input') return null;
  const ts = Number(e.ts);
  if (!Number.isFinite(ts) || ts <= 0) return null;

  const out: UxrEvent = { t: t as UxrEvent['t'], ts };

  // x/y は 0-1 normalized
  if (typeof e.x === 'number' && Number.isFinite(e.x)) out.x = Math.max(0, Math.min(1, e.x));
  if (typeof e.y === 'number' && Number.isFinite(e.y)) out.y = Math.max(0, Math.min(1, e.y));
  if (typeof e.vw === 'number' && Number.isFinite(e.vw)) out.vw = Math.max(0, Math.min(10000, e.vw));
  if (typeof e.vh === 'number' && Number.isFinite(e.vh)) out.vh = Math.max(0, Math.min(10000, e.vh));
  if (typeof e.d === 'number' && Number.isFinite(e.d)) out.d = Math.max(0, Math.min(100, e.d));
  if (typeof e.c === 'number' && Number.isFinite(e.c)) out.c = Math.max(0, Math.min(100, Math.floor(e.c)));
  // patch 0124 Phase B: input 滞在秒数（0-600 = 10分上限）
  if (typeof e.dur === 'number' && Number.isFinite(e.dur)) out.dur = Math.max(0, Math.min(600, Math.round(e.dur)));

  if (typeof e.sel === 'string') out.sel = e.sel.slice(0, MAX_SEL_LEN);
  if (typeof e.txt === 'string') out.txt = e.txt.slice(0, MAX_TXT_LEN);
  if (typeof e.r === 'string') out.r = e.r.slice(0, 80);
  if (typeof e.u === 'string') out.u = e.u.slice(0, 40);
  // patch 0124 Phase B: nav 遷移先 path（先頭 / 必須・MAX_PATH_LEN 上限）
  if (typeof e.to === 'string' && e.to.startsWith('/') && e.to.length <= MAX_PATH_LEN) {
    out.to = e.to;
  }

  return out;
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const limited = applyRateLimit(request, 'api.uxr', RATE_LIMIT_PRESETS.public);
  if (limited) return limited;

  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > MAX_PAYLOAD_BYTES) {
    // 大きすぎるペイロードは拒否（4xxはclientには見えるが計測なら問題ない）
    return new Response(JSON.stringify({ ok: false }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let raw: unknown;
  try {
    // sendBeacon は Content-Type を text/plain にすることがあるので body.text() 経由で寛容に
    const txt = await request.text();
    if (!txt) return ok();
    raw = JSON.parse(txt);
  } catch {
    return ok();
  }

  if (!raw || typeof raw !== 'object') return ok();
  const body = raw as Record<string, unknown>;

  const sid = String(body.sid || '').slice(0, 40);
  const path = String(body.path || '');
  const ua = String(body.ua || '').slice(0, 80);
  const eventsRaw = Array.isArray(body.events) ? body.events : [];

  if (!sid) return ok();
  if (isPathBlocked(path)) return ok();
  if (eventsRaw.length === 0) return ok();

  const events = eventsRaw
    .slice(0, MAX_EVENTS_PER_BATCH)
    .map(sanitizeEvent)
    .filter((e): e is UxrEvent => e !== null);

  if (events.length === 0) return ok();

  const batch: UxrBatch = {
    sid,
    path,
    ua,
    ts: Date.now(),
    events,
  };

  try {
    const env = (context as unknown as { env: Env }).env || ({} as Env);
    await writeBatch(env as unknown as Record<string, unknown>, batch);
  } catch (err) {
    // KV 書き込み失敗は client には見せない（再送ループ防止）
    if (process.env.NODE_ENV === 'development') {
      console.warn('[api.uxr] write failed', err instanceof Error ? err.message : err);
    }
  }

  return ok();
}

export async function loader() {
  // GET は 405 ではなく 200 で {ok:true}（プローブ最小化）
  return ok();
}

function ok(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      // CORS: 同一 origin 想定だが安全側で beacon を許可
      'Access-Control-Allow-Origin': '*',
    },
  });
}
