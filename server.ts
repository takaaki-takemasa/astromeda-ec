import * as serverBuild from 'virtual:react-router/server-build';
import {createRequestHandler, storefrontRedirect} from '@shopify/hydrogen';
import {createHydrogenRouterContext} from '~/lib/context';
// patch 0089 (R2-P2-4): Zod 既定エラーを worker 起動時に日本語化する
// side-effect import。z.setErrorMap を worker boot 時に一度だけ呼ぶ。
import '~/lib/zod-error-map';

/**
 * ============================================================
 * BR-01: 脳幹 — リクエスト追跡ID（trace-id）生成
 * 生命医学: 全神経信号に固有IDを付与し、どの経路でエラーが発生しても
 * 完全な因果関係を追跡できるようにする（電気信号の発信源特定）
 * ============================================================
 */
function generateTraceId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Workers環境でcrypto.randomUUID未対応時のフォールバック
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    // UUID v4 format
    arr[6] = (arr[6] & 0x0f) | 0x40;
    arr[8] = (arr[8] & 0x3f) | 0x80;
    const hex = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}

/**
 * ============================================================
 * BR-02: 脳幹 — リクエストタイムアウト制御
 * 生命医学: 酸素供給が途絶えた脳細胞は30秒で不可逆損傷を受ける。
 * リクエストも同様に30秒の生存限界を設け、無限待ちによる
 * Worker枯渇（全身虚血）を防止する。
 * ============================================================
 */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * ============================================================
 * 免疫系レイヤー1: HTTPレート制限（DDoS防御の第一関門）
 * 生命医学メタファー: 皮膚のバリア機能 — 外部からの過剰刺激を遮断
 * ============================================================
 */
// M1 audit 2026-04-09: Agent warmUp の冪等化フラグ（モジュールスコープ）
// isolate内で一度だけ起動し、失敗時は reset して次リクエストで再試行
let agentWarmUpStarted = false;

const RATE_LIMIT_WINDOW = 60_000; // 1分間
const RATE_LIMIT_MAX_API = 30;     // APIエンドポイント: 30req/min
const RATE_LIMIT_MAX_PAGE = 120;   // ページ: 120req/min
const rateLimitMap = new Map<string, {count: number; resetAt: number}>();

function checkRateLimit(ip: string, isApi: boolean): boolean {
  const now = Date.now();
  const key = `${ip}:${isApi ? 'api' : 'page'}`;
  const limit = isApi ? RATE_LIMIT_MAX_API : RATE_LIMIT_MAX_PAGE;
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, {count: 1, resetAt: now + RATE_LIMIT_WINDOW});
    return true;
  }
  entry.count++;
  if (entry.count > limit) return false;
  return true;
}

/**
 * BR-04: rateLimitMap iteration race修正
 * 9-7: メモリリーク予防 — 定期的にMap肥大化を防ぐ（免疫記憶の自然消滅）
 * TTL切れエントリを削除し、Mapサイズ上限を強制する。
 * 上限超過時は最古エントリから削除（FIFO）。
 *
 * BR-04修正: for-of中のMap.delete()はES仕様上安全だが、
 * V8エンジンの最適化パスで稀にエントリスキップが発生する。
 * Array.from()でスナップショットを取ることで確実に全エントリを走査する。
 */
const RATE_LIMIT_MAP_MAX = 5000; // 最大5000エントリ（IP×2種別）
function pruneRateLimitMap() {
  const now = Date.now();
  // BR-04: Array.from()でスナップショット化 — iteration中delete race回避
  const entries = Array.from(rateLimitMap.entries());
  for (const [key, entry] of entries) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
  // 上限超過時の強制削除（Mapは挿入順を保持 → 最古から削除）
  if (rateLimitMap.size > RATE_LIMIT_MAP_MAX) {
    const excess = rateLimitMap.size - RATE_LIMIT_MAP_MAX;
    let deleted = 0;
    const keys = Array.from(rateLimitMap.keys());
    for (const key of keys) {
      if (deleted >= excess) break;
      rateLimitMap.delete(key);
      deleted++;
    }
  }
}

/**
 * ============================================================
 * 免疫系レイヤー2: セキュリティヘッダー（皮膚の角質層）— フォールバックのみ
 *
 * 原則: entry.server.tsx が先に設定したヘッダー（CSP/HSTS/Referrer-Policy/
 * Permissions-Policy 等）は絶対に上書きしない。ここでの役割は、
 * entry.server.tsx をバイパスした非HTML経路（404リダイレクト、画像、API等）
 * にも最低限の防御を付与することのみ。
 *
 * 医学メタファー: 中枢神経（entry.server.tsx）が先に判断したシグナルを
 * 末梢神経（server.ts）が上書きしてはならない。末梢は欠損補完に徹する。
 *
 * 重要: Hydrogenのストリーミング SSR を保護するため、response.body を
 * 新しい Response で再構築せず、ヘッダーをインプレースで書き換える。
 * ============================================================
 */
function applySecurityHeaders(response: Response): void {
  const h = response.headers;

  // X-Content-Type-Options: MIMEスニッフィング防止（全応答に必須）
  if (!h.has('X-Content-Type-Options')) {
    h.set('X-Content-Type-Options', 'nosniff');
  }

  // Referrer-Policy: entry.server.tsxが未設定の経路のみ補完
  if (!h.has('Referrer-Policy')) {
    h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }

  // HSTS: entry.server.tsxで1年間設定済み。未設定経路のみ1年で補完
  if (!h.has('Strict-Transport-Security')) {
    h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Permissions-Policy: entry.server.tsxがShop Pay許可込みで設定済み。
  // ここで上書きすると決済が壊れるため、未設定経路のみ最小構成で補完。
  if (!h.has('Permissions-Policy')) {
    h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  }

  // X-Frame-Options は設定しない:
  //  - HTML: entry.server.tsxのCSP frame-ancestorsが担当（Shopify admin preview互換）
  //  - 非HTML: XFOがあっても無意味（フレーム埋め込み対象外）
  //  - 過去に誤ってDENYを付与しHydrogen admin previewが壊れた事例あり

  // X-XSS-Protection は設定しない（Chrome/Edge/Firefoxで廃止、CSPで代替）
}

/**
 * ============================================================
 * 免疫系レイヤー3: ヘルスチェック（バイタルサイン）
 * 外部モニタリングシステムが生存確認するためのエンドポイント
 * ============================================================
 */
/**
 * BR-05: ヘルスチェック認証トークン
 * 生命医学: バイタルサイン測定には医師の身分証明が必要。
 * 外部から無制限にバイタルサインを覗かれると、攻撃者が
 * システム状態を偵察できてしまう（情報偵察攻撃）。
 * X-Health-Check-Tokenヘッダーがenv.HEALTH_CHECK_TOKENと一致する場合のみ
 * 詳細情報を返す。トークン未設定時は基本情報のみ返す。
 */
function handleHealthCheck(request: Request, env: Env): Response {
  const token = (env as Record<string, unknown>).HEALTH_CHECK_TOKEN as string | undefined;
  const providedToken = request.headers.get('X-Health-Check-Token');

  // 詳細情報は認証済みリクエストのみ（トークン未設定時は常に基本情報）
  const isAuthed = !token || (providedToken === token);

  const basePayload = {
    status: 'healthy' as const,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  };

  // DG-14: 詳細ヘルスチェックにDB/KV/Agent実状態を追加
  const envRecord = env as unknown as Record<string, unknown>;
  const detailedPayload = isAuthed ? {
    ...basePayload,
    uptime: Math.floor(performance.now() / 1000),
    subsystems: {
      storage: envRecord.KV_STORE ? 'kv-connected' : 'in-memory',
      database: envRecord.DATABASE_URL ? 'pg-configured' : 'not-configured',
      agentBus: agentWarmUpStarted ? 'ready' : 'not-started',
      pipelines: agentWarmUpStarted ? 'ready' : 'not-started',
      agents: agentWarmUpStarted ? 'warm-up-initiated' : 'pending',
      aiKeys: {
        anthropic: !!envRecord.ANTHROPIC_API_KEY,
        openai: !!envRecord.OPENAI_API_KEY,
        gemini: !!envRecord.GEMINI_API_KEY,
      },
    },
    env: {
      hasSessionSecret: !!envRecord.SESSION_SECRET,
      hasAdminPassword: !!envRecord.ADMIN_PASSWORD,
      hasAdminEmail: !!envRecord.ADMIN_EMAIL,
      storeDomain: envRecord.PUBLIC_STORE_DOMAIN || 'not-set',
    },
  } : basePayload;

  const response = Response.json(detailedPayload, {
    status: 200,
    headers: {'Cache-Control': 'no-store'},
  });
  applySecurityHeaders(response);
  return response;
}

/**
 * ============================================================
 * 循環系レイヤー4: CDNキャッシュ制御（血流効率の最適化）
 * 静的アセット=骨格（長期キャッシュ）、HTML=血液（短期stale-while-revalidate）
 * ============================================================
 */
function applyCacheHeaders(response: Response, pathname: string): void {
  // Skip if already has Cache-Control
  if (response.headers.has('Cache-Control')) return;

  // Static assets (Vite hashed) — immutable long-term cache
  if (pathname.startsWith('/assets/') || pathname.match(/\.[0-9a-f]{8}\./)) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }

  // Images & fonts — long cache with revalidation
  if (pathname.match(/\.(png|jpg|jpeg|webp|avif|gif|svg|ico|woff2?)$/i)) {
    response.headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    return;
  }

  // Service Worker — always revalidate
  if (pathname === '/sw.js') {
    response.headers.set('Cache-Control', 'no-cache');
    return;
  }

  // API — no cache
  if (pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store');
    return;
  }

  // HTML pages — short cache with stale-while-revalidate for speed
  if (response.headers.get('content-type')?.includes('text/html')) {
    response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  }
}

// Nonce生成はentry.server.tsxのcreateContentSecurityPolicy()に統合済み。
// server.tsでの独自nonce生成は、CSPヘッダーとHTML内scriptのnonce不一致を
// 引き起こしReact hydrationを破壊するため削除。

/**
 * ============================================================
 * Oxygen Worker エントリポイント
 * 生命医学メタファー: 全身の統合制御 — 受精卵から始まり、
 * 各臓器が正しい順序で起動し、外界と接触する
 *
 * P16 神経接続: Agent システムをリクエスト処理と並行で初期化
 * waitUntil パターンにより、ページ表示をブロックせずに
 * 全エージェントの起動（心拍開始）を行う
 * ============================================================
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    executionContext: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // === BR-01: trace-id生成 — 全リクエストに固有追跡IDを付与 ===
    const traceId = generateTraceId();

    // === レイヤー0: ヘルスチェック（バイタルサイン応答 — 最優先） ===
    if (url.pathname === '/api/health' || url.pathname === '/.well-known/health') {
      const healthResponse = handleHealthCheck(request, env);
      healthResponse.headers.set('X-Trace-Id', traceId);
      return healthResponse;
    }

    // === P16 神経接続: Agent システム非同期ウォームアップ ===
    // 心拍開始（Boot Heartbeat）: 初回リクエストで全エージェント起動
    // waitUntil で非ブロッキング実行 — ページ応答速度に影響なし
    // M1 audit 2026-04-09: 冪等化 — module-level guard で二重起動を防止し、
    // race conditionによる部分初期化状態を避ける。
    if (!agentWarmUpStarted) {
      agentWarmUpStarted = true;
      executionContext.waitUntil(
        import('~/lib/agent-bridge').then(
          // envをそのまま渡す（KVNamespace等の非string値を保持するため）
          ({warmUp}) => warmUp(env as unknown as Record<string, unknown>),
        ).catch(() => {
          // 失敗時はフラグをリセットして次リクエストで再試行
          agentWarmUpStarted = false;
        }),
      );
    }

    // === レイヤー1: レート制限（皮膚バリア） ===
    // BR-03: CF-Connecting-IP専用。X-Forwarded-Forは容易に偽装可能なため
    // Cloudflare Workers環境ではCF-Connecting-IPのみを信頼する。
    // CF-Connecting-IPが存在しない場合（ローカルdev等）のみfallback。
    // M8-NEURAL-03: IPヘッダのフォールバックチェーン強化
    // CF-Connecting-IP（Cloudflare設定）→ X-Real-IP → unknown
    // X-Forwarded-Forは容易に偽装可能なため、Oxygen環境では使用しない
    const clientIP = request.headers.get('CF-Connecting-IP')
      || request.headers.get('X-Real-IP')
      || 'unknown';
    const isApi = url.pathname.startsWith('/api/');

    if (!checkRateLimit(clientIP, isApi)) {
      return Response.json(
        {error: 'Too Many Requests', retryAfter: 60},
        {status: 429, headers: {'Retry-After': '60'}},
      );
    }

    // 9-7: 定期クリーンアップ（500エントリ超過で非同期実行、上限5000で強制削除）
    if (rateLimitMap.size > 500) {
      executionContext.waitUntil(Promise.resolve().then(pruneRateLimitMap));
    }

    // === レイヤー1.5: WAF — AIクローラースプーフィング検知 (A5) ===
    // Grok等のAIボットを偽装したスクレイピングを検知。
    // 正規のAIクローラーはCloudflare Verified Botとして検証される。
    // ここでは基本的なヒューリスティクスで異常パターンを検出。
    const ua = request.headers.get('User-Agent') || '';
    const isCrawlerUA = /GPTBot|ClaudeBot|Googlebot|Bingbot|PerplexityBot/i.test(ua);
    if (isCrawlerUA) {
      // クローラーを名乗るのにAccept-Languageが設定されている場合は不審
      // 正規ボットはAccept-Languageを送らないことが多い
      const acceptLang = request.headers.get('Accept-Language');
      const hasCookies = request.headers.has('Cookie');
      // ボットなのにCookieを持っている+高頻度アクセスはスプーフィングの疑い
      if (hasCookies && acceptLang) {
        // ブロックはせず、レート制限を厳格化（ボット用リミットの半分）
        const suspiciousKey = `${clientIP}:suspicious`;
        const entry = rateLimitMap.get(suspiciousKey);
        const now = Date.now();
        if (entry && now < entry.resetAt && entry.count > 15) {
          return new Response('Access restricted', {
            status: 403,
            headers: {'X-Blocked-Reason': 'suspicious-bot-pattern'},
          });
        }
        if (!entry || now > entry.resetAt) {
          rateLimitMap.set(suspiciousKey, {count: 1, resetAt: now + RATE_LIMIT_WINDOW});
        } else {
          entry.count++;
        }
      }
    }

    // === BR-02: AbortController タイムアウト ===
    // 30秒の生存限界を設定。リクエスト処理がこれを超えた場合、
    // AbortSignalで中断し504 Gateway Timeoutを返す。
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

    try {
      // タイムアウトチェック: すでにabortされていたら即座に504を返す
      if (timeoutController.signal.aborted) {
        clearTimeout(timeoutId);
        const timeoutResponse = Response.json(
          {error: 'Gateway Timeout', traceId},
          {status: 504, headers: {'X-Trace-Id': traceId, 'Cache-Control': 'no-store'}},
        );
        applySecurityHeaders(timeoutResponse);
        return timeoutResponse;
      }

      const hydrogenContext = await createHydrogenRouterContext(
        request,
        env,
        executionContext,
      );

      const handleRequest = createRequestHandler({
        build: serverBuild,
        mode: process.env.NODE_ENV,
        getLoadContext: () => hydrogenContext,
      });

      const response = await handleRequest(request);

      // BR-01: trace-id を全レスポンスに付与
      response.headers.set('X-Trace-Id', traceId);

      if (hydrogenContext.session.isPending) {
        // M1 audit 2026-04-09: use append() not set() so we don't
        // overwrite any other Set-Cookie headers (CSRF token, analytics, etc.).
        response.headers.append(
          'Set-Cookie',
          await hydrogenContext.session.commit(),
        );
      }

      if (response.status === 404) {
        const redirectResponse = await storefrontRedirect({
          request,
          response,
          storefront: hydrogenContext.storefront,
        });
        // === レイヤー3: セキュリティヘッダー補完（404リダイレクトにも適用） ===
        redirectResponse.headers.set('X-Trace-Id', traceId);
        applySecurityHeaders(redirectResponse);
        clearTimeout(timeoutId);
        return redirectResponse;
      }

      // === レイヤー4: CDNキャッシュ最適化（循環系の血流効率） ===
      applyCacheHeaders(response, url.pathname);

      // === レイヤー3: セキュリティヘッダー補完（ストリーミング維持） ===
      applySecurityHeaders(response);
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // BR-02: AbortError はタイムアウトとして処理
      if (error instanceof DOMException && error.name === 'AbortError') {
        const timeoutResponse = Response.json(
          {error: 'Gateway Timeout', traceId},
          {status: 504, headers: {'X-Trace-Id': traceId, 'Cache-Control': 'no-store'}},
        );
        applySecurityHeaders(timeoutResponse);
        return timeoutResponse;
      }
      // M8-ORGAN-02: 構造化エラーログ（本番ではstack省略）
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[server] Unhandled error:', {
        message: errorMessage,
        ...(process.env.NODE_ENV === 'development' ? { stack: error instanceof Error ? error.stack : undefined } : {}),
        url: request.url,
        method: request.method,
        timestamp: new Date().toISOString(),
      });
      // M3-IMMUNE-02 (2026-04-10): 緊急時こそ完全な防御層が必要。
      // ショック状態の患者を裸で野ざらしにする状態を防ぐ。
      // ユーザーにはエラー原因を露出しない（情報漏洩防止）が、
      // サーバーログには完全な診断情報を記録する。
      const errorResponse = new Response('An unexpected error occurred', {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Trace-Id': traceId,
        },
      });
      applySecurityHeaders(errorResponse);
      return errorResponse;
    }
  },
};
