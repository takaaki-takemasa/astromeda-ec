/**
 * Commander Watchdog — 生命維持装置（ICU人工心肺）
 *
 * 医学メタファー: 集中治療室（ICU）の生命維持装置
 * Commander（脳幹）が心停止した場合、外部から蘇生を試みる。
 * HealthMonitorが臓器の状態を見る「自律神経」なら、
 * Watchdogは脳幹自体を監視する「ICUの心電図モニター + 除細動器」。
 *
 * 設計原則:
 * 1. Commander非依存 — Commander自身に依存しない独立監視
 * 2. Bus非依存 — Busが死んでもWatchdogは動作可能
 * 3. 最小依存 — Registry + タイマーのみに依存
 * 4. 自己修復 — Watchdog自身のエラーも安全に処理
 *
 * 起動タイミング: initializeAgents() の Step 6 以降
 * （全Agent起動後、HealthMonitorと並列に動作）
 */

import type { AgentRegistry } from '../registry/agent-registry.js';
import type { AgentBus } from './agent-bus.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('commander-watchdog');


export interface WatchdogConfig {
  /** Commander のヘルスチェック間隔 (ms) */
  checkIntervalMs: number;
  /** 応答なしと判定するまでの連続失敗回数 */
  failureThreshold: number;
  /** 再起動試行の最大回数 */
  maxRestartAttempts: number;
  /** 再起動間のクールダウン (ms) */
  restartCooldownMs: number;
}

export interface WatchdogStatus {
  running: boolean;
  lastCheckTime: number;
  lastSuccessTime: number;
  consecutiveFailures: number;
  restartAttempts: number;
  commanderAlive: boolean;
}

const DEFAULT_CONFIG: WatchdogConfig = {
  checkIntervalMs: 15000,       // 15秒間隔
  failureThreshold: 3,          // 3回連続失敗で蘇生開始
  maxRestartAttempts: 3,         // 最大3回蘇生試行
  restartCooldownMs: 30000,      // 蘇生間30秒クールダウン
};

export class CommanderWatchdog {
  private registry: AgentRegistry;
  private bus: AgentBus | null;
  private config: WatchdogConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  // 状態追跡
  private lastCheckTime = 0;
  private lastSuccessTime = Date.now();
  private consecutiveFailures = 0;
  private restartAttempts = 0;
  private lastRestartTime = 0;

  constructor(
    registry: AgentRegistry,
    bus: AgentBus | null = null,
    config: Partial<WatchdogConfig> = {},
  ) {
    this.registry = registry;
    this.bus = bus;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Watchdog 起動 */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastSuccessTime = Date.now();
    this.consecutiveFailures = 0;
    this.restartAttempts = 0;

    // 即時チェック + 定期チェック
    void this.checkCommander();
    this.timer = setInterval(() => {
      void this.checkCommander();
    }, this.config.checkIntervalMs);

    log.info('[Watchdog] Commander Watchdog 起動 — 生命維持装置オンライン');
  }

  /** Watchdog 停止 */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info('[Watchdog] Commander Watchdog 停止');
  }

  /** 状態取得 */
  getStatus(): WatchdogStatus {
    return {
      running: this.running,
      lastCheckTime: this.lastCheckTime,
      lastSuccessTime: this.lastSuccessTime,
      consecutiveFailures: this.consecutiveFailures,
      restartAttempts: this.restartAttempts,
      commanderAlive: this.consecutiveFailures < this.config.failureThreshold,
    };
  }

  /** Commanderのヘルスチェック（心電図モニター） */
  private async checkCommander(): Promise<void> {
    this.lastCheckTime = Date.now();

    try {
      const commander = this.registry.get('commander');

      if (!commander?.instance) {
        // Commanderがレジストリに存在しない → 致命的
        await this.handleFailure('Commander not found in registry');
        return;
      }

      const health = commander.instance.getHealth();

      if (health.status === 'healthy' || health.status === 'initializing') {
        // 心拍確認 — 正常
        this.consecutiveFailures = 0;
        this.lastSuccessTime = Date.now();
        return;
      }

      if (health.status === 'shutdown') {
        // 正常シャットダウン中 — 介入不要
        return;
      }

      // error / degraded → 異常
      await this.handleFailure(`Commander status: ${health.status}, errors: ${health.errorCount}`);

    } catch (err) {
      // getHealth() 自体が例外 → Commander深刻故障
      await this.handleFailure(`Commander health check threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** 異常検出時の処理（除細動器） */
  private async handleFailure(reason: string): Promise<void> {
    this.consecutiveFailures++;
    log.warn(`[Watchdog] Commander異常検出 (${this.consecutiveFailures}/${this.config.failureThreshold}): ${reason}`);

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      await this.attemptRestart(reason);
    }
  }

  /** Commander蘇生試行（心臓マッサージ + 除細動） */
  private async attemptRestart(reason: string): Promise<void> {
    // 最大試行回数チェック
    if (this.restartAttempts >= this.config.maxRestartAttempts) {
      log.error(`[Watchdog] CRITICAL: Commander蘇生 ${this.config.maxRestartAttempts}回失敗。人間の介入が必要です。`);
      this.emitCriticalAlert(`Commander restart failed after ${this.config.maxRestartAttempts} attempts: ${reason}`);
      this.stop(); // これ以上の自動蘇生は危険
      return;
    }

    // クールダウンチェック
    const now = Date.now();
    if (now - this.lastRestartTime < this.config.restartCooldownMs) {
      return; // クールダウン中
    }

    this.restartAttempts++;
    this.lastRestartTime = now;
    log.info(`[Watchdog] Commander蘇生試行 ${this.restartAttempts}/${this.config.maxRestartAttempts}...`);

    try {
      const commander = this.registry.get('commander');
      if (commander?.instance) {
        // Phase 1: initialize() で再起動を試みる
        await commander.instance.initialize();
        this.consecutiveFailures = 0;
        this.lastSuccessTime = Date.now();
        log.info(`[Watchdog] Commander蘇生成功（試行 ${this.restartAttempts}回目）`);

        // Bus経由で蘇生完了を通知（Bus生存時のみ）
        this.emitRestartSuccess();
      }
    } catch (err) {
      log.error(`[Watchdog] Commander蘇生失敗:`, err instanceof Error ? err.message : err);
      // 次のcheckCycleで再試行
    }
  }

  /** Bus経由で蘇生成功を通知（Busが死んでいても安全） */
  private emitRestartSuccess(): void {
    if (!this.bus) return;
    try {
      this.bus.publish({
        id: `watchdog_restart_${Date.now()}`,
        type: 'watchdog.commander.restarted',
        source: 'commander-watchdog',
        priority: 'critical',
        payload: {
          restartAttempts: this.restartAttempts,
          downtime: Date.now() - this.lastSuccessTime,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      }).catch(() => { /* Bus障害時は無視 — Watchdog自体を止めない */ });
    } catch {
      // 例外も飲み込む — Watchdog生存が最優先
    }
  }

  /** 致命的アラート発行（Busが死んでいても安全） */
  private emitCriticalAlert(reason: string): void {
    if (!this.bus) return;
    try {
      this.bus.publish({
        id: `watchdog_critical_${Date.now()}`,
        type: 'watchdog.commander.critical',
        source: 'commander-watchdog',
        priority: 'critical',
        payload: { reason, timestamp: Date.now() },
        timestamp: Date.now(),
      }).catch(() => { /* Bus障害時は無視 */ });
    } catch {
      // 例外も飲み込む
    }
  }
}

// ── シングルトン ──

let watchdogInstance: CommanderWatchdog | null = null;

export function createWatchdog(
  registry: AgentRegistry,
  bus: AgentBus | null = null,
  config?: Partial<WatchdogConfig>,
): CommanderWatchdog {
  watchdogInstance = new CommanderWatchdog(registry, bus, config);
  return watchdogInstance;
}

export function getWatchdog(): CommanderWatchdog | null {
  return watchdogInstance;
}

export function resetWatchdog(): void {
  if (watchdogInstance) {
    watchdogInstance.stop();
    watchdogInstance = null;
  }
}
