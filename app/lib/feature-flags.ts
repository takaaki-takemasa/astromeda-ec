/**
 * Feature Flags — 免疫系のサイトカインネットワーク
 *
 * 医学メタファー: サイトカイン（Cytokines）
 * 免疫系のシグナル伝達分子。各機能の活性化/抑制を
 * 中央制御するスイッチシステム。障害発生時に特定機能を
 * 即座に無効化（免疫抑制）できる。
 *
 * 設計原則:
 * 1. デフォルト値は常にコード内に持つ（KV障害時のフォールバック）
 * 2. 環境変数 > KV > デフォルト値 の優先順位
 * 3. 型安全: フラグ名はリテラル型で管理
 * 4. 成長対応: 新フラグの追加は定義追加のみで完了
 * 5. 監視: フラグ状態の一覧取得API付き
 */

import { getKVStore } from '~/lib/kv-storage';

/** フラグ定義: 名前, デフォルト値, 説明 */
const FLAG_DEFINITIONS = {
  /** エージェントシステム（30体AI） */
  'agents.enabled': { default: true, description: 'AIエージェントシステムの有効化' },
  /** 予測検索（リアルタイムサジェスト） */
  'search.predictive': { default: true, description: '予測検索機能の有効化' },
  /** レビューシステム */
  'reviews.enabled': { default: true, description: '商品レビュー機能の有効化' },
  /** カスタマイズ価格（カート合計反映） */
  'customization.pricing': { default: true, description: 'カスタマイズ追加料金の有効化' },
  /** ニュースレター登録 */
  'newsletter.enabled': { default: true, description: 'ニュースレター登録の有効化' },
  /** GA4サーバーサイド計測 */
  'analytics.ga4': { default: false, description: 'GA4サーバーサイド計測の有効化' },
  /** メンテナンスモード */
  'maintenance.mode': { default: false, description: 'メンテナンスモード（全ページにメンテ表示）' },
  /** PC診断ウィジェット */
  'widget.pc-diagnosis': { default: true, description: 'PC診断ウィジェットの有効化' },
  /** 管理画面の有効化 */
  'admin.enabled': { default: true, description: '管理ダッシュボードの有効化' },
} as const;

export type FeatureFlagName = keyof typeof FLAG_DEFINITIONS;

/** フラグキャッシュ（KV読み取りの最小化） */
const flagCache = new Map<string, { value: boolean; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000; // 1分

/**
 * フラグの値を取得
 * 優先順位: 環境変数 > KV > デフォルト値
 */
export async function isEnabled(
  flag: FeatureFlagName,
  env?: Record<string, unknown>,
): Promise<boolean> {
  // 1. 環境変数チェック（最優先 — デプロイ時の即時切替）
  if (env) {
    const envKey = `FF_${flag.toUpperCase().replace(/\./g, '_')}`;
    const envValue = env[envKey];
    if (envValue === 'true') return true;
    if (envValue === 'false') return false;
  }

  // 2. キャッシュチェック
  const cached = flagCache.get(flag);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  // 3. KVチェック
  try {
    const kv = getKVStore();
    const stored = await kv.get<string>(`ff:${flag}`);
    if (stored !== null) {
      const value = stored === 'true';
      flagCache.set(flag, { value, fetchedAt: Date.now() });
      return value;
    }
  } catch {
    // KV障害 → デフォルトにフォールバック
  }

  // 4. デフォルト値
  return FLAG_DEFINITIONS[flag].default;
}

/**
 * フラグの値を設定（管理画面から使用）
 */
export async function setFlag(flag: FeatureFlagName, value: boolean): Promise<void> {
  const kv = getKVStore();
  await kv.put(`ff:${flag}`, String(value));
  flagCache.set(flag, { value, fetchedAt: Date.now() });
}

/**
 * 全フラグの状態を取得（管理画面・ヘルスチェック用）
 */
export async function getAllFlags(
  env?: Record<string, unknown>,
): Promise<Array<{
  name: FeatureFlagName;
  enabled: boolean;
  description: string;
  source: 'env' | 'kv' | 'default';
}>> {
  const flags: Array<{
    name: FeatureFlagName;
    enabled: boolean;
    description: string;
    source: 'env' | 'kv' | 'default';
  }> = [];

  for (const [name, def] of Object.entries(FLAG_DEFINITIONS)) {
    const flagName = name as FeatureFlagName;
    let source: 'env' | 'kv' | 'default' = 'default';
    let enabled = def.default;

    // 環境変数
    if (env) {
      const envKey = `FF_${name.toUpperCase().replace(/\./g, '_')}`;
      if (env[envKey] === 'true') { enabled = true; source = 'env'; }
      else if (env[envKey] === 'false') { enabled = false; source = 'env'; }
    }

    // KV
    if (source === 'default') {
      try {
        const kv = getKVStore();
        const stored = await kv.get<string>(`ff:${name}`);
        if (stored !== null) {
          enabled = stored === 'true';
          source = 'kv';
        }
      } catch { /* fallback */ }
    }

    flags.push({ name: flagName, enabled, description: def.description, source });
  }

  return flags;
}

/**
 * フラグキャッシュをクリア（テスト用・設定変更後の即時反映）
 */
export function clearFlagCache(): void {
  flagCache.clear();
}
