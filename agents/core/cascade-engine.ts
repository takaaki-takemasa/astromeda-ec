/**
 * Cascade Engine — カスケード連鎖実行エンジン（脊髄=反射弓）
 *
 * 生体対応: 脊髄反射弓 + 内分泌カスケード
 * Commander(脳)からの指令をL1(視床下部)→L2(各臓器)へ
 * カスケード式に伝播する。各段階でフィルタリング・変換が行われ、
 * 末端のAgentに適切な形で指令が届く。
 *
 * 例: Commander「SEO改善」→ 集客L1「コンテンツ最適化」
 *     → SEO Director「キーワード調査」+ Content Writer「記事更新」
 */

import type { CascadeCommand, AgentEvent, IAgentBus } from './types.js';
import type { AgentRegistry } from '../registry/agent-registry.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('cascade-engine');


interface CascadeStep {
  command: CascadeCommand;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'rolled_back';
  result?: unknown;
  error?: string;
  startTime?: number;
  endTime?: number;
}

interface CascadeExecution {
  id: string;
  rootCommand: CascadeCommand;
  steps: CascadeStep[];
  status: 'running' | 'completed' | 'failed' | 'rolled_back';
  startTime: number;
  endTime?: number;
}

/** リトライ設定（3A: 反射弓の再試行メカニズム） */
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

export class CascadeEngine {
  private bus: IAgentBus;
  private registry: AgentRegistry;
  private executions = new Map<string, CascadeExecution>();
  private maxConcurrent = 10;
  private activeCount = 0;
  private retryConfig: RetryConfig;
  private static readonly MAX_EXECUTIONS = 500; // 予防医学: 実行履歴の上限（メモリリーク防止）

  constructor(bus: IAgentBus, registry: AgentRegistry, retryConfig?: Partial<RetryConfig>) {
    this.bus = bus;
    this.registry = registry;
    this.retryConfig = { ...DEFAULT_RETRY, ...retryConfig };
  }

  /** カスケード実行（脳からの下行性制御） */
  async execute(command: CascadeCommand): Promise<CascadeExecution> {
    if (this.activeCount >= this.maxConcurrent) {
      throw new Error(`Cascade limit reached: ${this.activeCount}/${this.maxConcurrent}`);
    }

    const executionId = `cascade_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const execution: CascadeExecution = {
      id: executionId,
      rootCommand: command,
      steps: [],
      status: 'running',
      startTime: Date.now(),
    };

    this.executions.set(executionId, execution);
    this.pruneExecutions();
    this.activeCount++;

    try {
      // 各宛先に順次配信（シナプス伝達）
      for (const targetId of command.to) {
        const step: CascadeStep = {
          command: { ...command, to: [targetId] },
          status: 'pending',
        };
        execution.steps.push(step);

        step.status = 'executing';
        step.startTime = Date.now();

        try {
          // Agent Busを通じてコマンド配信
          const event: AgentEvent = {
            id: `${executionId}_${targetId}`,
            type: 'cascade.command',
            source: command.from,
            target: targetId,
            priority: command.priority,
            payload: {
              action: command.action,
              params: command.params,
              cascadeId: executionId,
            },
            timestamp: Date.now(),
            ttl: command.deadline ? command.deadline - Date.now() : undefined,
          };

          // タイムアウト付きリクエスト
          const timeout = command.deadline ? command.deadline - Date.now() : 30000;
          const response = await this.bus.request(event, Math.max(timeout, 5000));

          step.result = response.payload;
          step.status = 'completed';
          step.endTime = Date.now();
        } catch (err) {
          step.status = 'failed';
          step.error = err instanceof Error ? err.message : String(err);
          step.endTime = Date.now();

          // 失敗時の対応
          if (command.rollbackAction) {
            await this.rollback(execution, step);
          }
        }
      }

      // 全ステップの結果を判定
      const hasFailure = execution.steps.some((s) => s.status === 'failed');
      execution.status = hasFailure ? 'failed' : 'completed';
      execution.endTime = Date.now();

    } catch (err) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      // カスケード全体の失敗をBusに通知
      const failEvent: AgentEvent = {
        id: `cascade_fail_${executionId}`,
        type: 'cascade.execution.failed',
        source: 'cascade-engine',
        target: 'health-monitor',
        priority: 'high',
        payload: {
          cascadeId: executionId,
          error: err instanceof Error ? err.message : String(err),
          stepsCompleted: execution.steps.filter(s => s.status === 'completed').length,
          stepsTotal: execution.steps.length,
        },
        timestamp: Date.now(),
      };
      this.bus.publish(failEvent).catch((pubErr) => {
        log.warn('[CascadeEngine] Failed to publish cascade failure event:', pubErr instanceof Error ? pubErr.message : pubErr);
      });
    } finally {
      this.activeCount--;
    }

    return execution;
  }

  /**
   * 3A: 並列カスケード実行
   * 全宛先に同時配信し、全完了を待つ（交感神経の一斉活性化）
   */
  async executeParallel(command: CascadeCommand): Promise<CascadeExecution> {
    if (this.activeCount >= this.maxConcurrent) {
      throw new Error(`Cascade limit reached: ${this.activeCount}/${this.maxConcurrent}`);
    }

    const executionId = `cascade_par_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const execution: CascadeExecution = {
      id: executionId,
      rootCommand: command,
      steps: [],
      status: 'running',
      startTime: Date.now(),
    };

    this.executions.set(executionId, execution);
    this.pruneExecutions();
    this.activeCount++;

    try {
      const promises = command.to.map((targetId) => {
        const step: CascadeStep = {
          command: { ...command, to: [targetId] },
          status: 'pending',
        };
        execution.steps.push(step);
        return this.executeStepWithRetry(executionId, targetId, command, step);
      });

      await Promise.allSettled(promises);

      const hasFailure = execution.steps.some((s) => s.status === 'failed');
      execution.status = hasFailure ? 'failed' : 'completed';
      execution.endTime = Date.now();
    } catch (err) {
      execution.status = 'failed';
      execution.endTime = Date.now();
    } finally {
      this.activeCount--;
    }

    return execution;
  }

  /**
   * 3A: リトライ付きステップ実行（指数バックオフ）
   */
  private async executeStepWithRetry(
    executionId: string,
    targetId: string,
    command: CascadeCommand,
    step: CascadeStep,
  ): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(
          this.retryConfig.baseDelayMs * Math.pow(2, attempt - 1),
          this.retryConfig.maxDelayMs,
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      step.status = 'executing';
      step.startTime = step.startTime || Date.now();

      try {
        const event: AgentEvent = {
          id: `${executionId}_${targetId}_r${attempt}`,
          type: 'cascade.command',
          source: command.from,
          target: targetId,
          priority: command.priority,
          payload: {
            action: command.action,
            params: command.params,
            cascadeId: executionId,
            retryAttempt: attempt,
          },
          timestamp: Date.now(),
          ttl: command.deadline ? command.deadline - Date.now() : undefined,
        };

        const timeout = command.deadline ? command.deadline - Date.now() : 30000;
        const response = await this.bus.request(event, Math.max(timeout, 5000));

        step.result = response.payload;
        step.status = 'completed';
        step.endTime = Date.now();
        return; // 成功
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        log.warn(`[CascadeEngine] Step ${targetId} attempt ${attempt + 1} failed: ${lastError.message}`);
      }
    }

    // 全リトライ失敗
    step.status = 'failed';
    step.error = lastError?.message || 'Unknown error after retries';
    step.endTime = Date.now();
  }

  /** 実行履歴の古いエントリを削除（メモリリーク防止） */
  private pruneExecutions(): void {
    if (this.executions.size > CascadeEngine.MAX_EXECUTIONS) {
      for (const [id, exec] of this.executions) {
        if (exec.status !== 'running' && this.executions.size > CascadeEngine.MAX_EXECUTIONS) {
          this.executions.delete(id);
        }
      }
    }
  }

  /** ロールバック（損傷修復 — 完了保証付き） */
  private async rollback(execution: CascadeExecution, failedStep: CascadeStep): Promise<void> {
    const completedSteps = execution.steps.filter((s) => s.status === 'completed');
    let rollbackFailures = 0;

    for (const step of completedSteps.reverse()) {
      try {
        const rollbackEvent: AgentEvent = {
          id: `rollback_${execution.id}_${step.command.to[0]}`,
          type: 'cascade.rollback',
          source: execution.rootCommand.from,
          target: step.command.to[0],
          priority: 'high',
          payload: {
            originalAction: step.command.action,
            rollbackAction: execution.rootCommand.rollbackAction,
            cascadeId: execution.id,
          },
          timestamp: Date.now(),
        };

        // FATAL修正: publishではなくrequestで応答を待つ（完了保証）
        // requestが使えない場合（Agent未登録など）はpublishにフォールバック
        try {
          await this.bus.request(rollbackEvent, 10_000); // 10秒タイムアウト
        } catch {
          // requestが失敗してもpublishで最善努力
          await this.bus.publish(rollbackEvent);
        }
        step.status = 'rolled_back';
      } catch (rollbackErr) {
        rollbackFailures++;
        step.status = 'failed'; // rolled_backではなくfailedを明示
        // ロールバック失敗をBusに通知（反射弓の断裂を脳に報告）
        const failureEvent: AgentEvent = {
          id: `rollback_fail_${execution.id}_${step.command.to[0]}`,
          type: 'cascade.rollback.failed',
          source: 'cascade-engine',
          target: 'health-monitor',
          priority: 'critical',
          payload: {
            cascadeId: execution.id,
            targetAgent: step.command.to[0],
            originalAction: step.command.action,
            error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
          },
          timestamp: Date.now(),
        };
        // publish自体が失敗してもログは残す（最終防衛ライン）
        this.bus.publish(failureEvent).catch((pubErr) => {
          log.warn('[CascadeEngine] Rollback failure event publish failed:', pubErr instanceof Error ? pubErr.message : pubErr);
        });
      }
    }

    // ロールバック結果を正確にマーキング
    execution.status = rollbackFailures > 0 ? 'failed' : 'rolled_back';
  }

  // ── 診断API ──

  /** 実行履歴 */
  getExecution(executionId: string): CascadeExecution | undefined {
    return this.executions.get(executionId);
  }

  /** アクティブなカスケード */
  getActiveExecutions(): CascadeExecution[] {
    return [...this.executions.values()].filter((e) => e.status === 'running');
  }

  /** 統計 */
  getStats() {
    const all = [...this.executions.values()];
    return {
      total: all.length,
      running: all.filter((e) => e.status === 'running').length,
      completed: all.filter((e) => e.status === 'completed').length,
      failed: all.filter((e) => e.status === 'failed').length,
      rolledBack: all.filter((e) => e.status === 'rolled_back').length,
      activeCount: this.activeCount,
    };
  }
}
