/**
 * IP Allowlist — 免疫系の自己/非自己識別
 *
 * IM-05: Admin APIへのアクセスをIPアドレスで制限
 *
 * 医学メタファー: 胸腺（Thymus）でのT細胞教育
 * 自己MHCを認識できるT細胞だけが末梢に放出される。
 * 登録済みIPのみがadminエンドポイントにアクセスできる。
 *
 * 設計:
 * - 環境変数 ADMIN_ALLOWED_IPS にカンマ区切りでIPを設定
 * - 未設定時は全IP許可（開発モード互換）
 * - CIDR表記は Phase 2 で対応
 * - IPv4/IPv6 両対応
 */

/** 許可済みIPのキャッシュ（パース結果をメモリ保持） */
let allowedIPs: Set<string> | null = null;
let lastEnvValue: string | undefined;

/**
 * 環境変数からIPリストをパース・キャッシュ
 * カンマ区切り、空白トリム、空文字は除外
 */
function parseAllowedIPs(envValue: string | undefined): Set<string> {
  if (!envValue || envValue.trim() === '') {
    return new Set(); // 空 = 制限なし（isAllowedで分岐）
  }
  return new Set(
    envValue
      .split(',')
      .map((ip) => ip.trim().toLowerCase())
      .filter((ip) => ip.length > 0),
  );
}

/**
 * IP許可リストが設定されているか確認
 *
 * @param env - 環境変数（ADMIN_ALLOWED_IPS を参照）
 * @returns true=許可リスト設定済み, false=未設定（全IP許可モード）
 *
 * @example
 * ```ts
 * if (!isIPAllowlistConfigured(env)) {
 *   // 管理画面でセキュリティ警告を表示
 *   showSecurityWarning('IPホワイトリストが未設定です');
 * }
 * ```
 */
export function isIPAllowlistConfigured(env: Record<string, unknown>): boolean {
  const envValue = env.ADMIN_ALLOWED_IPS as string | undefined;
  return !!envValue && envValue.trim() !== '';
}

/**
 * IPがAdmin APIにアクセス可能か検証
 *
 * @param ip - クライアントIP
 * @param env - 環境変数（ADMIN_ALLOWED_IPS を参照）
 * @returns true=許可, false=拒否
 *
 * セキュリティポリシー (M8-DNA-02):
 * - 未設定時: 全IP拒否（Deny by Default）。開発モードではlocalhost(127.0.0.1/::1)のみ許可
 * - "*" 設定時: 全IP許可（明示的な全開放。本番では非推奨）
 * - IP列挙時: 列挙されたIPのみ許可（推奨）
 */
export function isIPAllowed(ip: string, env: Record<string, unknown>): boolean {
  const envValue = env.ADMIN_ALLOWED_IPS as string | undefined;

  // M8-DNA-02: 未設定時は全IP拒否（Deny by Default）
  // 医学メタファー: 胸腺未発達の新生児 — 全ての外来抗原を拒絶する
  // 開発環境のみ: NODE_ENV=development かつ IP が localhost なら許可
  if (!envValue || envValue.trim() === '') {
    if (process.env.NODE_ENV === 'development') {
      const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === 'unknown';
      if (isLocalhost) return true;
      console.warn(`[IM-05] ADMIN_ALLOWED_IPS未設定。開発モードでlocalhostのみ許可中。IP=${ip}は拒否`);
    }
    return false;
  }

  // 明示的に "*" を設定した場合のみ全IP許可（意図的な全開放）
  if (envValue.trim() === '*') {
    return true;
  }

  // キャッシュ無効化チェック（環境変数変更検知）
  if (envValue !== lastEnvValue) {
    allowedIPs = parseAllowedIPs(envValue);
    lastEnvValue = envValue;
  }

  if (!allowedIPs || allowedIPs.size === 0) {
    return true;
  }

  return allowedIPs.has(ip.trim().toLowerCase());
}

/**
 * IP許可チェックをレスポンスとして返す（admin APIルート用）
 *
 * @returns null=許可, Response=403拒否
 *
 * @example
 * ```ts
 * const blocked = checkIPAllowlist(request, env);
 * if (blocked) return blocked;
 * ```
 */
export function checkIPAllowlist(
  request: Request,
  env: Record<string, unknown>,
): Response | null {
  const ip = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown';

  if (isIPAllowed(ip, env)) {
    return null;
  }

  return Response.json(
    {
      type: '/errors/ip-restricted',
      title: 'IP Not Allowed',
      status: 403,
      detail: 'このIPアドレスからのアクセスは許可されていません。',
      timestamp: new Date().toISOString(),
    },
    {
      status: 403,
      headers: { 'Content-Type': 'application/problem+json' },
    },
  );
}

/**
 * テスト用: キャッシュをリセット
 */
export function resetIPAllowlistCache(): void {
  allowedIPs = null;
  lastEnvValue = undefined;
}
