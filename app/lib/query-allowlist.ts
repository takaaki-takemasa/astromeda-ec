/**
 * Query Allowlist — 免疫系のT細胞レパートリー選択
 *
 * IM-02: GraphQL Persisted Queries / Query Allowlist
 *
 * 医学メタファー: 胸腺でのポジティブ/ネガティブ選択
 * T細胞は胸腺で「自己MHCを認識できるか」「自己抗原に過剰反応しないか」
 * の2段階選別を受ける。同様にGraphQLクエリも:
 * 1. 既知の安全なクエリパターンに合致するか（ポジティブ選択）
 * 2. 悪意あるパターンが含まれないか（ネガティブ選択 = graphql-guard.ts）
 *
 * 設計:
 * - ハッシュベースの永続化クエリ（SHA-256）
 * - 開発モード: 未登録クエリも通すが警告ログ
 * - 本番モード: 未登録クエリを拒否（env.ENFORCE_QUERY_ALLOWLIST=true時）
 * - Shopify Hydrogen の内部クエリは自動許可
 */

/**
 * SHA-256ハッシュを生成（Cloudflare Workers / Node.js 両対応）
 */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 許可済みクエリハッシュのレジストリ */
const allowedHashes = new Set<string>();

/** ハッシュ→クエリ名のマッピング（デバッグ用） */
const hashLabels = new Map<string, string>();

/**
 * クエリをallowlistに登録
 *
 * @param queryText - GraphQLクエリ文字列（正規化済み）
 * @param label - デバッグ用ラベル（例: 'ProductQuery', 'CollectionList'）
 */
export async function registerQuery(queryText: string, label?: string): Promise<string> {
  const normalized = normalizeQuery(queryText);
  const hash = await sha256(normalized);
  allowedHashes.add(hash);
  if (label) {
    hashLabels.set(hash, label);
  }
  return hash;
}

/**
 * クエリハッシュを直接登録（ビルド時にpre-computeしたハッシュ用）
 */
export function registerHash(hash: string, label?: string): void {
  allowedHashes.add(hash);
  if (label) {
    hashLabels.set(hash, label);
  }
}

/**
 * クエリがallowlistに登録されているか検証
 *
 * @param queryText - GraphQLクエリ文字列
 * @param env - 環境変数（ENFORCE_QUERY_ALLOWLISTを参照）
 * @returns allowed=true なら通過、false なら拒否
 */
export async function isQueryAllowed(
  queryText: string,
  env?: Record<string, unknown>,
): Promise<{allowed: boolean; hash: string; label?: string; reason?: string}> {
  const normalized = normalizeQuery(queryText);
  const hash = await sha256(normalized);
  const label = hashLabels.get(hash);

  if (allowedHashes.has(hash)) {
    return {allowed: true, hash, label};
  }

  // M8-NEURAL-01: Shopify Hydrogen内部クエリの #graphql プレフィックス検証
  // 医学メタファー: 神経伝達物質の受容体特異性 — 正しい形式のシグナルのみ通過
  // #graphql プレフィックスは Hydrogen SDK が自動付与する識別子だが、
  // ハッシュ未登録のクエリを無条件通過させるとインジェクション経路になる。
  // 対策: #graphql付きでも、強制モード時はハッシュ検証を実行する。
  //        非強制モード時のみ警告付きで通過（開発利便性確保）。
  if (queryText.trim().startsWith('#graphql')) {
    const enforce = env?.ENFORCE_QUERY_ALLOWLIST === 'true' || env?.ENFORCE_QUERY_ALLOWLIST === true;
    if (!enforce) {
      // 非強制モード: Hydrogen内部クエリは通過（開発時の利便性）
      return {allowed: true, hash, label: label ?? 'hydrogen-internal', reason: 'hydrogen-prefix-dev'};
    }
    // 強制モード: #graphql付きでもハッシュ検証必須（ここでは落ちる）
    return {
      allowed: false,
      hash,
      reason: 'Hydrogen内部クエリもENFORCE_QUERY_ALLOWLIST=true時はハッシュ登録が必要です。registerQuery()で事前登録してください。',
    };
  }

  // 強制モードの確認
  const enforce = env?.ENFORCE_QUERY_ALLOWLIST === 'true' || env?.ENFORCE_QUERY_ALLOWLIST === true;

  if (!enforce) {
    // 非強制モード: 警告のみで通過
    console.warn(
      `[IM-02] 未登録GraphQLクエリ検出 (hash: ${hash.slice(0, 12)}...)。` +
      `本番では ENFORCE_QUERY_ALLOWLIST=true で拒否されます。`,
    );
    return {allowed: true, hash, reason: 'unregistered-warning'};
  }

  return {
    allowed: false,
    hash,
    reason: 'クエリがallowlistに登録されていません。',
  };
}

/**
 * クエリ文字列を正規化（ホワイトスペース・コメント除去）
 * 同じ意味のクエリが異なるハッシュを生成しないようにする。
 */
function normalizeQuery(query: string): string {
  return query
    // 単行コメント除去
    .replace(/#[^\n]*/g, '')
    // 複数行の空白を単一スペースに
    .replace(/\s+/g, ' ')
    // 前後の空白を除去
    .trim();
}

/**
 * 登録済みクエリ数を取得（監視用）
 */
export function getAllowlistStats(): {
  registeredQueries: number;
  labels: string[];
} {
  return {
    registeredQueries: allowedHashes.size,
    labels: Array.from(hashLabels.values()),
  };
}

/**
 * テスト用: allowlistをクリア
 */
export function clearAllowlist(): void {
  allowedHashes.clear();
  hashLabels.clear();
}
