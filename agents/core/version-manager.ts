/**
 * Version Manager + Canary Release — エージェントバージョン管理＆段階的ロールアウト
 *
 * 生体対応: 成長ホルモン管理
 * 新しいエージェントバージョンを段階的に導入し、ヘルススコアが低下したら即座に前バージョンへロールバック。
 * 1% → 10% → 50% → 100% の漸進的導入で、フルロールアウト前に本番環境での振る舞いを観測できる。
 */

import type { AgentId } from './types.js';

// ── Version Types ──

export type VersionStatus = 'active' | 'canary' | 'retired' | 'candidate';

export interface AgentVersion {
  versionString: string;           // e.g., "1.2.3"
  timestamp: number;               // Unix timestamp
  configHash: string;              // config.jsonの SHA-256 hash
  status: VersionStatus;
  createdBy?: string;              // リリースエンジニア名
  releaseNotes?: string;
  metadata?: Record<string, unknown>;
}

export type CanaryStage = 1 | 10 | 50 | 100;

export interface CanaryConfig {
  stages: CanaryStage[];           // Default: [1, 10, 50, 100]
  minDurationMs: number;           // 各ステージの最小保持時間 (デフォルト: 300000 = 5分)
  healthThreshold: number;         // 次ステージへの進行判定 (デフォルト: 0.85 = 85%)
  rollbackThreshold: number;       // ロールバック判定 (デフォルト: 0.5 = 50%)
  metricsCheckIntervalMs: number;  // ヘルスチェック間隔 (デフォルト: 30000 = 30秒)
}

export interface CanaryState {
  agentId: string;
  currentVersion: string;
  canaryVersion: string;
  currentStage: CanaryStage;
  canaryPercentage: number;        // 何%のリクエストが新バージョンに流れるか
  startTime: number;               // canary開始時刻
  stageStartTime: number;          // 現ステージ開始時刻
  healthScore: number;             // 0.0 ~ 1.0
  errorRate: number;               // canary版のエラー率
  decisionLog: Array<{
    timestamp: number;
    decision: 'advance' | 'hold' | 'rollback';
    healthScore: number;
    reason: string;
  }>;
}

export interface VersionMetrics {
  versionString: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  averageLatencyMs: number;
  p99LatencyMs: number;
  timestamp: number;
}

// ── Main Class ──

export class VersionManager {
  private versions: Map<string, AgentVersion[]> = new Map();          // agentId -> versions[]
  private canaryStates: Map<string, CanaryState> = new Map();         // agentId -> canaryState
  private metricsBuffer: Map<string, VersionMetrics[]> = new Map();   // agentId_version -> metrics[]
  private canaryCheckIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(
    private config: {
      maxVersionsPerAgent?: number;  // デフォルト: 10
      metricsRetentionMs?: number;   // デフォルト: 3600000 = 1時間
      canaryDefaults?: Partial<CanaryConfig>;
    } = {},
  ) {
    this.config.maxVersionsPerAgent ??= 10;
    this.config.metricsRetentionMs ??= 3600000;
  }

  /**
   * 新しいエージェントバージョンを登録
   */
  registerVersion(agentId: string, versionString: string, config: Partial<AgentVersion> = {}): AgentVersion {
    const version: AgentVersion = {
      versionString,
      timestamp: Date.now(),
      configHash: config.configHash ?? this.hashConfig(config),
      status: 'candidate',
      createdBy: config.createdBy,
      releaseNotes: config.releaseNotes,
      metadata: config.metadata,
    };

    if (!this.versions.has(agentId)) {
      this.versions.set(agentId, []);
    }

    const agentVersions = this.versions.get(agentId)!;
    agentVersions.push(version);

    // 古いバージョンを削除
    if (agentVersions.length > (this.config.maxVersionsPerAgent ?? 10)) {
      agentVersions.shift();
    }

    // 初回登録ならactive化
    if (agentVersions.filter((v) => v.status === 'active').length === 0) {
      version.status = 'active';
    }

    return version;
  }

  /**
   * 現在アクティブなバージョンを取得
   */
  getCurrentVersion(agentId: string): AgentVersion | null {
    const agentVersions = this.versions.get(agentId);
    if (!agentVersions) return null;

    return agentVersions.find((v) => v.status === 'active') ?? null;
  }

  /**
   * Canary releaseを開始
   */
  startCanaryRelease(
    agentId: string,
    newVersionString: string,
    canaryConfig?: Partial<CanaryConfig>,
  ): CanaryState {
    const currentVersion = this.getCurrentVersion(agentId);
    if (!currentVersion) {
      throw new Error(`No active version found for agent ${agentId}`);
    }

    const newVersion = this.versions
      .get(agentId)
      ?.find((v) => v.versionString === newVersionString);

    if (!newVersion) {
      throw new Error(`Version ${newVersionString} not found for agent ${agentId}`);
    }

    const mergedConfig = { ...this.getDefaultCanaryConfig(), ...canaryConfig };

    const canaryState: CanaryState = {
      agentId,
      currentVersion: currentVersion.versionString,
      canaryVersion: newVersionString,
      currentStage: mergedConfig.stages[0],
      canaryPercentage: mergedConfig.stages[0],
      startTime: Date.now(),
      stageStartTime: Date.now(),
      healthScore: 1.0,
      errorRate: 0,
      decisionLog: [],
    };

    newVersion.status = 'canary';

    this.canaryStates.set(agentId, canaryState);

    // 定期的にヘルスチェック
    this.startCanaryHealthCheck(agentId, mergedConfig);

    return canaryState;
  }

  /**
   * Canaryを次のステージに進める
   */
  advanceCanary(agentId: string): CanaryState {
    const canaryState = this.canaryStates.get(agentId);
    if (!canaryState) {
      throw new Error(`No canary release in progress for agent ${agentId}`);
    }

    const mergedConfig = this.getDefaultCanaryConfig();
    const currentIndex = mergedConfig.stages.indexOf(canaryState.currentStage);

    if (currentIndex === -1) {
      throw new Error(`Invalid canary stage: ${canaryState.currentStage}`);
    }

    if (currentIndex === mergedConfig.stages.length - 1) {
      // すべてのステージ完了 → 本番化
      return this.promoteCanaryToProduction(agentId);
    }

    const nextStage = mergedConfig.stages[currentIndex + 1];
    canaryState.currentStage = nextStage;
    canaryState.canaryPercentage = nextStage;
    canaryState.stageStartTime = Date.now();

    canaryState.decisionLog.push({
      timestamp: Date.now(),
      decision: 'advance',
      healthScore: canaryState.healthScore,
      reason: `Automatically advanced to stage ${nextStage}%`,
    });

    return canaryState;
  }

  /**
   * Canaryをロールバック（前バージョンに戻す）
   */
  rollbackCanary(agentId: string, reason?: string): AgentVersion {
    const canaryState = this.canaryStates.get(agentId);
    if (!canaryState) {
      throw new Error(`No canary release in progress for agent ${agentId}`);
    }

    const currentVersion = this.versions
      .get(agentId)
      ?.find((v) => v.versionString === canaryState.currentVersion);

    if (!currentVersion) {
      throw new Error(`Current version not found for agent ${agentId}`);
    }

    const canaryVersion = this.versions
      .get(agentId)
      ?.find((v) => v.versionString === canaryState.canaryVersion);

    if (canaryVersion) {
      canaryVersion.status = 'retired';
    }

    currentVersion.status = 'active';

    canaryState.decisionLog.push({
      timestamp: Date.now(),
      decision: 'rollback',
      healthScore: canaryState.healthScore,
      reason: reason ?? 'Manual rollback',
    });

    this.canaryStates.delete(agentId);
    this.stopCanaryHealthCheck(agentId);

    return currentVersion;
  }

  /**
   * Canaryステータスを取得
   */
  getCanaryStatus(agentId: string): CanaryState | null {
    return this.canaryStates.get(agentId) ?? null;
  }

  /**
   * バージョン履歴を取得
   */
  getVersionHistory(agentId: string): AgentVersion[] {
    return (this.versions.get(agentId) ?? []).slice().reverse();
  }

  /**
   * バージョンのメトリクスを記録
   */
  recordMetrics(
    agentId: string,
    versionString: string,
    metrics: Omit<VersionMetrics, 'versionString' | 'timestamp'>,
  ): void {
    const key = `${agentId}_${versionString}`;
    if (!this.metricsBuffer.has(key)) {
      this.metricsBuffer.set(key, []);
    }

    const buffer = this.metricsBuffer.get(key)!;
    buffer.push({
      versionString,
      timestamp: Date.now(),
      ...metrics,
    });

    // 古いメトリクスを削除
    const cutoffTime = Date.now() - (this.config.metricsRetentionMs ?? 3600000);
    const idx = buffer.findIndex((m) => m.timestamp > cutoffTime);
    if (idx > 0) {
      buffer.splice(0, idx);
    }
  }

  /**
   * バージョンのメトリクスを取得
   */
  getMetrics(agentId: string, versionString?: string): VersionMetrics[] {
    if (versionString) {
      const key = `${agentId}_${versionString}`;
      return (this.metricsBuffer.get(key) ?? []).slice();
    }

    // agentIdのすべてのバージョンのメトリクスを返す
    const result: VersionMetrics[] = [];
    const metricsArray = Array.from(this.metricsBuffer.entries());
    for (let i = 0; i < metricsArray.length; i++) {
      const [key, metrics] = metricsArray[i];
      if (key.startsWith(`${agentId}_`)) {
        result.push(...metrics);
      }
    }
    return result;
  }

  /**
   * ヘルススコアを計算・更新
   */
  updateCanaryHealth(agentId: string, healthScore: number, errorRate: number): void {
    const canaryState = this.canaryStates.get(agentId);
    if (!canaryState) return;

    canaryState.healthScore = healthScore;
    canaryState.errorRate = errorRate;
  }

  // ── Private ──

  private promoteCanaryToProduction(agentId: string): CanaryState {
    const canaryState = this.canaryStates.get(agentId);
    if (!canaryState) throw new Error(`No canary state for ${agentId}`);

    const currentVersion = this.versions
      .get(agentId)
      ?.find((v) => v.versionString === canaryState.currentVersion);

    const newVersion = this.versions
      .get(agentId)
      ?.find((v) => v.versionString === canaryState.canaryVersion);

    if (currentVersion) {
      currentVersion.status = 'retired';
    }
    if (newVersion) {
      newVersion.status = 'active';
    }

    canaryState.decisionLog.push({
      timestamp: Date.now(),
      decision: 'advance',
      healthScore: canaryState.healthScore,
      reason: 'Promoted to production (100% traffic)',
    });

    this.canaryStates.delete(agentId);
    this.stopCanaryHealthCheck(agentId);

    return canaryState;
  }

  private startCanaryHealthCheck(agentId: string, config: CanaryConfig): void {
    this.stopCanaryHealthCheck(agentId);

    const interval = setInterval(() => {
      const canaryState = this.canaryStates.get(agentId);
      if (!canaryState) {
        this.stopCanaryHealthCheck(agentId);
        return;
      }

      const mergedConfig = { ...this.getDefaultCanaryConfig(), ...config };

      // ロールバック判定
      if (canaryState.healthScore < mergedConfig.rollbackThreshold) {
        this.rollbackCanary(
          agentId,
          `Auto-rollback: health score ${canaryState.healthScore} < ${mergedConfig.rollbackThreshold}`,
        );
        return;
      }

      // 次ステージへの自動進行判定
      const stageElapsed = Date.now() - canaryState.stageStartTime;
      if (
        stageElapsed >= mergedConfig.minDurationMs &&
        canaryState.healthScore >= mergedConfig.healthThreshold
      ) {
        this.advanceCanary(agentId);
      }
    }, config.metricsCheckIntervalMs ?? 30000);

    this.canaryCheckIntervals.set(agentId, interval);
  }

  private stopCanaryHealthCheck(agentId: string): void {
    const interval = this.canaryCheckIntervals.get(agentId);
    if (interval) {
      clearInterval(interval);
      this.canaryCheckIntervals.delete(agentId);
    }
  }

  private getDefaultCanaryConfig(): CanaryConfig {
    return {
      stages: [1, 10, 50, 100],
      minDurationMs: 300000,
      healthThreshold: 0.85,
      rollbackThreshold: 0.5,
      metricsCheckIntervalMs: 30000,
      ...this.config.canaryDefaults,
    };
  }

  private hashConfig(config: unknown): string {
    // シンプルなハッシュ (本番環境ではcrypto.createHashを使用すること)
    const str = JSON.stringify(config);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * 全Canaryを停止（シャットダウン時に呼び出す）
   */
  shutdown(): void {
    const intervalsArray = Array.from(this.canaryCheckIntervals.entries());
    for (let i = 0; i < intervalsArray.length; i++) {
      const [agentId] = intervalsArray[i];
      this.stopCanaryHealthCheck(agentId);
    }
  }
}

// ── Singleton Instance ──

let versionManagerInstance: VersionManager | null = null;

export function getVersionManager(
  config?: Partial<{
    maxVersionsPerAgent?: number;
    metricsRetentionMs?: number;
    canaryDefaults?: Partial<CanaryConfig>;
  }>,
): VersionManager {
  if (!versionManagerInstance) {
    versionManagerInstance = new VersionManager(config);
  }
  return versionManagerInstance;
}

export function resetVersionManager(): void {
  if (versionManagerInstance) {
    versionManagerInstance.shutdown();
  }
  versionManagerInstance = null;
}
