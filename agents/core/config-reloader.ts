/**
 * ConfigReloader — 動的設定リロード（ホルモン再チューニング）
 *
 * 生体対応: ホルモン分泌の再調整（視床下部-下垂体軸）
 * 実行時に JSON 設定ファイルの変更を検知し、
 * Agent Bus 経由で全システムに通知する。
 *
 * 機能:
 * - polling により JSON 設定を定期監視
 * - 変更を検知したら 'config.changed' イベント発行
 * - リスナーが変更に応応
 * - Feature Flags と統合
 *
 * T072 実装
 *
 * 注: Node.js/Deno 環境での fs.watch が使いにくいため、
 * polling (30秒間隔) で実装。
 */

import { createLogger } from './logger.js';
import { z } from 'zod';
import type { IAgentBus } from './types.js';

const log = createLogger('config-reloader');

// ── Zodスキーマ ──

/** 設定変更リスナーの型 */
export type ConfigChangeCallback = (key: string, oldValue: unknown, newValue: unknown) => Promise<void>;

interface ConfigChangeListener {
  key: string;
  callback: ConfigChangeCallback;
}

/**
 * ConfigReloader — 動的設定リロード
 *
 * 医学メタファー: 視床下部-下垂体軸
 * - 環境変化を検知（polling）
 * - ホルモン分泌指令を再計算
 * - 全身の器官にシグナル送信
 */
export class ConfigReloader {
  private config: Record<string, unknown> = {};
  private configPath: string;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private pollingIntervalMs: number = 30000; // デフォルト: 30秒
  private lastLoadTime: number = 0;
  private listeners: ConfigChangeListener[] = [];
  private bus?: IAgentBus;

  constructor(configPath: string, pollingIntervalMs: number = 30000) {
    this.configPath = configPath;
    this.pollingIntervalMs = pollingIntervalMs;
  }

  /**
   * Agent Bus に接続（イベント発行用）
   */
  connectBus(bus: IAgentBus): void {
    this.bus = bus;
    log.debug('[ConfigReloader] Connected to Agent Bus');
  }

  /**
   * 設定ファイルを読み込む
   *
   * @param path ファイルパス（相対パスは agents/config/ から相対）
   * @returns パースされた設定オブジェクト
   */
  async loadConfig(path: string): Promise<Record<string, unknown>> {
    try {
      // Node.js 環境を想定
      // Oxygen (Cloudflare Workers) ではこのメソッドは呼び出されない想定
      // テスト/ローカル開発用

      // Dynamic import で readFileSync を避ける（Universal JS 対応）
      let content: string;

      // 環境判定: window オブジェクトがあれば Browser/Deno, なければ Node.js
      if (typeof window === 'undefined' && typeof global !== 'undefined') {
        // Node.js
        const fs = await import('fs');
        content = fs.readFileSync(path, 'utf-8');
      } else {
        // Browser/Cloudflare Workers: fetch でリソース取得
        const response = await fetch(path);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        content = await response.text();
      }

      const parsed = JSON.parse(content);
      this.lastLoadTime = Date.now();
      log.debug(`[ConfigReloader] Loaded config from: ${path}`, { path });
      return parsed;
    } catch (err) {
      log.error(`[ConfigReloader] Failed to load config from ${path}:`, err instanceof Error ? err.message : err);
      throw err;
    }
  }

  /**
   * 現在の設定を取得
   *
   * @param key キー名（ドット記法: 'agent.healthCheck.interval'）
   * @returns 設定値、なければ undefined
   */
  getConfig(key: string): unknown {
    // ドット記法に対応
    const keys = key.split('.');
    let value: unknown = this.config;

    for (const k of keys) {
      if (typeof value === 'object' && value !== null && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * 設定全体を取得
   */
  getAllConfig(): Record<string, unknown> {
    return JSON.parse(JSON.stringify(this.config)); // deep copy
  }

  /**
   * 設定変更リスナーを登録
   *
   * @param key 監視キー（ドット記法）
   * @param callback 変更時コールバック
   */
  onConfigChange(key: string, callback: ConfigChangeCallback): void {
    this.listeners.push({ key, callback });
    log.debug(`[ConfigReloader] Registered listener for key: ${key}`, { key });
  }

  /**
   * Polling を開始（サーバー起動時に呼び出す）
   *
   * @param intervalMs ポーリング間隔（デフォルト: 30秒）
   */
  startPolling(intervalMs?: number): void {
    if (this.pollingTimer) {
      log.warn('[ConfigReloader] Polling already started');
      return;
    }

    if (intervalMs) {
      this.pollingIntervalMs = intervalMs;
    }

    // 即座に初回読み込み
    this.doPoll();

    // 定期的に polling
    this.pollingTimer = setInterval(() => {
      this.doPoll();
    }, this.pollingIntervalMs);

    log.info(`[ConfigReloader] Started polling with interval ${this.pollingIntervalMs}ms`, {
      interval: this.pollingIntervalMs,
    });
  }

  /**
   * Polling を停止
   */
  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      log.info('[ConfigReloader] Stopped polling');
    }
  }

  /**
   * 一度の polling サイクル（内部用）
   * @internal
   */
  private async doPoll(): Promise<void> {
    try {
      const newConfig = await this.loadConfig(this.configPath);

      // 変更があるか比較
      const changes = this.detectChanges(this.config, newConfig);

      if (changes.length > 0) {
        log.info(`[ConfigReloader] Configuration changed: ${changes.length} key(s)`, {
          changedKeys: changes.map(c => c.key),
        });

        // 設定を更新
        this.config = newConfig;

        // リスナーに通知
        for (const change of changes) {
          await this.notifyListeners(change.key, change.oldValue, change.newValue);
        }

        // Agent Bus にイベント発行
        if (this.bus) {
          try {
            await this.bus.publish({
              id: `cfg_${Date.now()}`,
              type: 'config.changed',
              source: 'config-reloader',
              priority: 'normal',
              payload: {
                changedKeys: changes.map(c => c.key),
                timestamp: Date.now(),
              },
              timestamp: Date.now(),
            });
          } catch (err) {
            log.warn('[ConfigReloader] Failed to publish config.changed event:', err instanceof Error ? err.message : err);
          }
        }
      }
    } catch (err) {
      log.warn('[ConfigReloader] Polling cycle failed:', err instanceof Error ? err.message : err);
    }
  }

  /**
   * 変更箇所を検出
   * @internal
   */
  private detectChanges(
    oldConfig: Record<string, unknown>,
    newConfig: Record<string, unknown>,
  ): Array<{key: string; oldValue: unknown; newValue: unknown}> {
    const changes: Array<{key: string; oldValue: unknown; newValue: unknown}> = [];

    const allKeys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);

    for (const key of allKeys) {
      const oldValue = oldConfig[key];
      const newValue = newConfig[key];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({ key, oldValue, newValue });
      }
    }

    return changes;
  }

  /**
   * リスナーに通知
   * @internal
   */
  private async notifyListeners(key: string, oldValue: unknown, newValue: unknown): Promise<void> {
    const matchedListeners = this.listeners.filter(l => {
      // Exact match または prefix match
      return l.key === key || key.startsWith(l.key + '.');
    });

    for (const listener of matchedListeners) {
      try {
        await listener.callback(key, oldValue, newValue);
      } catch (err) {
        log.error(`[ConfigReloader] Listener callback error for ${key}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  /**
   * Polling 状態を取得（診断用）
   */
  getStatus(): {
    isPolling: boolean;
    pollingIntervalMs: number;
    lastLoadTime: number;
    listenerCount: number;
    configSize: number;
  } {
    return {
      isPolling: this.pollingTimer !== null,
      pollingIntervalMs: this.pollingIntervalMs,
      lastLoadTime: this.lastLoadTime,
      listenerCount: this.listeners.length,
      configSize: Object.keys(this.config).length,
    };
  }
}

// ── シングルトン ──

let reloaderInstance: ConfigReloader | null = null;

/**
 * ConfigReloader インスタンスを取得
 */
export function getConfigReloader(configPath?: string): ConfigReloader {
  if (!reloaderInstance) {
    reloaderInstance = new ConfigReloader(configPath ?? 'agents/config/default.json');
  }
  return reloaderInstance;
}

/**
 * インスタンスを差し替え（テスト用）
 */
export function setConfigReloader(reloader: ConfigReloader): void {
  reloaderInstance = reloader;
}
