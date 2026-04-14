import {createHydrogenContext, type HydrogenEnv} from '@shopify/hydrogen';
import {AppSession} from '~/lib/session';
import {CART_QUERY_FRAGMENT} from '~/lib/fragments';
import {AppError} from '~/lib/app-error';

/**
 * ============================================================
 * BR-10: 環境変数バリデーション（脳幹の生命維持チェック）
 *
 * 生命医学: 出生直後の新生児は、体温・血糖・酸素飽和度が
 * 正常範囲内であることを最初に確認する（Apgar スコア）。
 * 環境変数はシステムの「生命維持パラメータ」であり、
 * 不足していたら起動自体を拒否する（蘇生不能状態）。
 * ============================================================
 */

/** 必須環境変数リスト */
const REQUIRED_ENV_VARS = [
  'SESSION_SECRET',
  'PUBLIC_STOREFRONT_API_TOKEN',
  'PUBLIC_STORE_DOMAIN',
  'PUBLIC_STOREFRONT_ID',
] as const;

/** 推奨（未設定時は警告のみ）環境変数リスト */
const RECOMMENDED_ENV_VARS = [
  'PRIVATE_STOREFRONT_API_TOKEN',
  'PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID',
  'ADMIN_PASSWORD',
] as const;

/**
 * BR-10: 環境変数の完全バリデーション
 * 必須変数が未設定ならAppErrorで即座にfail。
 * 推奨変数が未設定ならconsole.warnで警告。
 */
function validateEnv(env: Env): void {
  const missing: string[] = [];
  const envRecord = env as unknown as Record<string, unknown>;

  for (const key of REQUIRED_ENV_VARS) {
    if (!envRecord[key] || (typeof envRecord[key] === 'string' && envRecord[key] === '')) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw AppError.configuration(
      `必須環境変数が未設定です: ${missing.join(', ')}。` +
      `.envファイルまたはOxygen Secretsで設定してください。`
    );
  }

  // 推奨変数の警告
  for (const key of RECOMMENDED_ENV_VARS) {
    if (!envRecord[key]) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[BR-10] 推奨環境変数 ${key} が未設定です。機能が制限される場合があります。`);
      }
    }
  }
}

/**
 * DG-04: DB/KV初期化をcontextに統合
 * 生命医学: 消化器系の起動 — DATABASE_URLがあればPostgreSQLに接続し、
 * なければInMemoryフォールバックで動作。KV_STOREも同様。
 * context生成時に一度だけ初期化し、全ルートで共有する。
 */
import {initKVStore, getKVStore} from '~/lib/kv-storage';

// Define the additional context object
const additionalContext = {
  // Additional context for custom properties, CMS clients, 3P SDKs, etc.
} as const;

// Automatically augment HydrogenAdditionalContext with the additional context type
type AdditionalContextType = typeof additionalContext;

declare global {
  interface HydrogenAdditionalContext extends AdditionalContextType {}
}

/**
 * BR-11: caches.openシングルトン化
 * Workers環境でcaches.open()は毎回同じオブジェクトを返すが、
 * awaitのオーバーヘッドを避けるためモジュールレベルでキャッシュする。
 */
let cachedCache: Cache | null = null;

/**
 * Creates Hydrogen context for React Router 7.9.x
 * Returns HydrogenRouterContextProvider with hybrid access patterns
 */
export async function createHydrogenRouterContext(
  request: Request,
  env: Env,
  executionContext: ExecutionContext,
) {
  // BR-10: 全必須環境変数を検証
  validateEnv(env);

  const waitUntil = executionContext.waitUntil.bind(executionContext);

  // BR-11: caches.openのシングルトン化 — 2回目以降はawait不要
  if (!cachedCache) {
    cachedCache = await caches.open('hydrogen');
  }

  // DG-04: KVストア初期化（シングルトン — 2回目以降は即座にreturn）
  // DG-05: wrangler.tomlのKV_STOREバインディングが設定されていれば
  // CloudflareKVを使用、未設定ならInMemoryフォールバック
  initKVStore(env as unknown as Record<string, unknown>);

  const session = await AppSession.init(request, [env.SESSION_SECRET]);

  const hydrogenContext = createHydrogenContext(
    {
      env: env as unknown as HydrogenEnv,
      request,
      cache: cachedCache,
      waitUntil,
      session,
      // 日本市場向け: JA-JP固定（将来の多言語化時はURL/cookieベースで動的切替可能に拡張）
      i18n: {language: 'JA', country: 'JP'},
      cart: {
        queryFragment: CART_QUERY_FRAGMENT,
      },
    },
    additionalContext,
  );

  return hydrogenContext;
}

// テスト用エクスポート
export { validateEnv, REQUIRED_ENV_VARS, RECOMMENDED_ENV_VARS };
