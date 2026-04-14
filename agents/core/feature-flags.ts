/**
 * FeatureFlags — 機能フラグシステム（遺伝子発現制御）
 *
 * 生体対応: 遺伝子発現（Gene expression）
 * 同じ DNA でも環境や信号に応じて異なる遺伝子が発現する。
 * 機能フラグはこの原理で、実行時に機能のOn/Off を制御。
 *
 * 機能:
 * - Boolean フラグ（On/Off）
 * - Percentage rollout（段階的デプロイ）
 * - User targeting（特定ユーザー向け機能）
 * - Storage により永続化
 *
 * T071 実装
 */

import { createLogger } from './logger.js';
import { getStorage } from './storage.js';
import { z } from 'zod';
import type { IStorageAdapter, StorageRecord } from './storage.js';

const log = createLogger('feature-flags');

// ── Zodスキーマ ──

/** フラグ設定のスキーマ */
export const FlagConfigSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
  description: z.string().optional(),
  rolloutPercent: z.number().min(0).max(100).optional(),
  targetUsers: z.array(z.string()).optional(),
  targetTeams: z.array(z.string()).optional(),
  createdAt: z.number().positive(),
  updatedAt: z.number().positive(),
});
export type FlagConfig = z.infer<typeof FlagConfigSchema>;

/** フラグレコード（Storage用） */
export interface FlagRecord extends StorageRecord {
  name: string;
  enabled: boolean;
  description?: string;
  rolloutPercent?: number;
  targetUsers?: string[];
  targetTeams?: string[];
}

interface EvaluationContext {
  userId?: string;
  team?: string;
  [key: string]: unknown;
}

/**
 * FeatureFlags — 機能フラグシステム
 *
 * 医学メタファー: ホルモン制御システム
 * - ホルモン（フラグ）の On/Off で器官の動作を制御
 * - 部分的な投与（rolloutPercent）で副作用を監視しながら全員投与
 * - 特定患者（targetUsers）への個別治療
 */
export class FeatureFlags {
  private flags = new Map<string, FlagConfig>();
  private storage: IStorageAdapter;

  constructor(storage?: IStorageAdapter) {
    this.storage = storage ?? getStorage();
  }

  /**
   * フラグが有効か判定（最も基本的なメソッド）
   *
   * @param flagName フラグ名
   * @param context 評価コンテキスト（userId, team等）
   * @returns true フラグが有効な場合
   */
  isEnabled(flagName: string, context?: EvaluationContext): boolean {
    const flag = this.flags.get(flagName);
    if (!flag || !flag.enabled) return false;

    // Context 不要な場合は早期終了
    if (!context) {
      // rolloutPercent がある場合は確率判定
      if (flag.rolloutPercent !== undefined && flag.rolloutPercent < 100) {
        // Deterministic: flagName + userId でハッシュ化して確率判定
        // context なしなら常に on/off
        return flag.rolloutPercent >= 50; // 簡略版: 50%以上なら有効
      }
      return true;
    }

    // User targeting: 指定ユーザーのみ
    if (flag.targetUsers && flag.targetUsers.length > 0) {
      if (!flag.targetUsers.includes(context.userId ?? '')) {
        return false;
      }
    }

    // Team targeting: 指定チームのみ
    if (flag.targetTeams && flag.targetTeams.length > 0) {
      if (!flag.targetTeams.includes(context.team ?? '')) {
        return false;
      }
    }

    // Percentage rollout: ユーザーIDとフラグ名でハッシュ化して確率判定
    if (flag.rolloutPercent !== undefined && flag.rolloutPercent < 100) {
      const hash = this.hashForRollout(flagName, context.userId ?? 'anonymous');
      return (hash % 100) < flag.rolloutPercent;
    }

    return true;
  }

  /**
   * フラグを設定または作成
   *
   * @param name フラグ名
   * @param enabled 有効状態
   * @param config 設定（description, rolloutPercent等）
   */
  setFlag(name: string, enabled: boolean, config?: Partial<Omit<FlagConfig, 'name' | 'enabled' | 'createdAt' | 'updatedAt'>>): void {
    const existing = this.flags.get(name);
    const now = Date.now();

    const flag: FlagConfig = {
      name,
      enabled,
      description: config?.description ?? existing?.description,
      rolloutPercent: config?.rolloutPercent ?? existing?.rolloutPercent,
      targetUsers: config?.targetUsers ?? existing?.targetUsers,
      targetTeams: config?.targetTeams ?? existing?.targetTeams,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    // Zodで型検証
    const validation = FlagConfigSchema.safeParse(flag);
    if (!validation.success) {
      log.error('[FeatureFlags] setFlag validation failed:', validation.error.message);
      throw new TypeError(`[FeatureFlags] setFlag validation failed — ${validation.error.message}`);
    }

    this.flags.set(name, validation.data);
    log.debug(`[FeatureFlags] Set flag: ${name} = ${enabled}`, { name, enabled, config });

    // Storage に永続化
    this.persistFlag(name, validation.data);
  }

  /**
   * フラグ情報を取得
   */
  getFlag(name: string): FlagConfig | undefined {
    return this.flags.get(name);
  }

  /**
   * 全フラグを取得
   */
  getAllFlags(): FlagConfig[] {
    return Array.from(this.flags.values());
  }

  /**
   * フラグを削除
   */
  deleteFlag(name: string): void {
    this.flags.delete(name);
    log.debug(`[FeatureFlags] Deleted flag: ${name}`, { name });

    // Storage から削除
    this.storage.delete('feature_flags', name).catch(err => {
      log.warn('[FeatureFlags] Failed to delete flag from storage:', err instanceof Error ? err.message : err);
    });
  }

  /**
   * デフォルトフラグセットを初期化（このメソッドは boot 時に呼び出す）
   *
   * T071 要件:
   * - 'ai-brain-enabled': true
   * - 'parallel-pipelines': false
   * - 'slack-notifications': false
   * - 'auto-restart': true
   */
  async initializeDefaults(): Promise<void> {
    const defaults = [
      { name: 'ai-brain-enabled', enabled: true, description: 'Enable AI brain agent' },
      { name: 'parallel-pipelines', enabled: false, description: 'Enable parallel pipeline execution' },
      { name: 'slack-notifications', enabled: false, description: 'Enable Slack notifications' },
      { name: 'auto-restart', enabled: true, description: 'Enable agent auto-restart on failure' },
    ];

    for (const def of defaults) {
      if (!this.flags.has(def.name)) {
        this.setFlag(def.name, def.enabled, { description: def.description });
      }
    }

    log.info('[FeatureFlags] Initialized default flags', { count: defaults.length });
  }

  /**
   * Storage からフラグを読み込む（サーバー起動時）
   */
  async loadFromStorage(): Promise<void> {
    try {
      const records = await this.storage.query<FlagRecord>('feature_flags', {});
      for (const record of records) {
        const flag: FlagConfig = {
          name: record.name,
          enabled: record.enabled,
          description: record.description,
          rolloutPercent: record.rolloutPercent,
          targetUsers: record.targetUsers,
          targetTeams: record.targetTeams,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        };

        const validation = FlagConfigSchema.safeParse(flag);
        if (validation.success) {
          this.flags.set(flag.name, validation.data);
        }
      }
      log.info('[FeatureFlags] Loaded flags from storage', { count: this.flags.size });
    } catch (err) {
      log.warn('[FeatureFlags] Failed to load flags from storage:', err instanceof Error ? err.message : err);
    }
  }

  /**
   * 統計情報を取得
   */
  getStats(): {total: number; enabled: number; disabled: number; withRollout: number} {
    const all = Array.from(this.flags.values());
    return {
      total: all.length,
      enabled: all.filter(f => f.enabled).length,
      disabled: all.filter(f => !f.enabled).length,
      withRollout: all.filter(f => f.rolloutPercent !== undefined && f.rolloutPercent < 100).length,
    };
  }

  // ── 内部ヘルパー ──

  private async persistFlag(name: string, flag: FlagConfig): Promise<void> {
    try {
      const record: FlagRecord = {
        id: name,
        ...flag,
      };
      await this.storage.put('feature_flags', record);
    } catch (err) {
      log.warn(`[FeatureFlags] Failed to persist flag ${name}:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * Rollout 用ハッシュ関数（userId とフラグ名から確定的なハッシュを生成）
   * @internal
   */
  private hashForRollout(flagName: string, userId: string): number {
    const str = `${flagName}:${userId}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

// ── シングルトン ──

let featureFlagsInstance: FeatureFlags | null = null;

/**
 * FeatureFlags インスタンスを取得
 */
export function getFeatureFlags(): FeatureFlags {
  if (!featureFlagsInstance) {
    featureFlagsInstance = new FeatureFlags();
  }
  return featureFlagsInstance;
}

/**
 * インスタンスを差し替え（テスト用）
 */
export function setFeatureFlags(flags: FeatureFlags): void {
  featureFlagsInstance = flags;
}
