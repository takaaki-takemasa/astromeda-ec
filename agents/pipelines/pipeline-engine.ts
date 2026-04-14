/**
 * Pipeline Execution Engine — パイプライン実行エンジン（血管系=物質輸送）
 *
 * 生体対応: 血管系（毛細血管→栄養物輸送）
 * 複数の処理ステップを順序立てて実行し、各ステップの結果を次のステップに渡す。
 * リトライロジック、失敗時の処理モード（halt/skip/retry/rollback）をサポート。
 *
 * 設計原則:
 * - ステップシーケンシャル実行（血流の一方向性）
 * - リトライメカニズム（血管の再チャレンジ）
 * - 失敗モード処理（血液凝固=halt, 迂回路=skip）
 * - イベント駆動トリガー（ホルモン指令による自動始動）
 */

import type {
  PipelineDefinition,
  PipelineExecution,
  PipelineStatus,
  PipelineStep,
  AgentEvent,
  IAgentBus,
} from '../core/types.js';
import { z } from 'zod';
import { AgentRegistry } from '../registry/agent-registry.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('pipeline-engine');


// ── Zodスキーマ（T017: パイプライン実行検証） ──

/** パイプライン定義のZodスキーマ */
export const PipelineDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  steps: z.array(z.object({
    id: z.string().min(1),
    agentId: z.string().min(1),
    action: z.string().min(1),
    inputFrom: z.string().optional(),
    timeout: z.number().positive(),
    retryCount: z.number().nonnegative(),
    retryDelay: z.number().nonnegative(),
    rollbackAction: z.string().optional(),
    parallel: z.boolean().optional(), // T057: 並行実行フラグ
  })).min(1),
  trigger: z.object({
    type: z.enum(['event', 'schedule', 'manual', 'cascade']),
    eventType: z.string().optional(),
    cron: z.string().optional(),
    cascadeFrom: z.string().optional(),
  }),
  onFailure: z.enum(['halt', 'skip', 'retry', 'rollback']),
});

/** パイプライン実行トリガーパラメータのZodスキーマ */
export const PipelineTriggerParamsSchema = z.record(z.unknown()).optional();


export class PipelineEngine {
  private definitions = new Map<string, PipelineDefinition>();
  private executions = new Map<string, PipelineExecution>();
  private executionHistory: PipelineExecution[] = [];
  private eventListeners = new Map<string, string>(); // eventType -> subscriptionId
  private stepTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** 実行履歴の最大保持件数（メモリリーク防止） */
  private static readonly MAX_HISTORY = 1000;

  constructor(
    private bus: IAgentBus,
    private registry: AgentRegistry,
  ) {}

  /** 実行履歴を追加（上限超過時は古い履歴を自動削除 — 代謝老廃物の排出） */
  private addToHistory(execution: PipelineExecution): void {
    this.executionHistory.push(execution);
    if (this.executionHistory.length > PipelineEngine.MAX_HISTORY) {
      this.executionHistory = this.executionHistory.slice(-PipelineEngine.MAX_HISTORY);
    }
  }

  /**
   * パイプライン定義を登録
   * 血管構造を解剖学的に定義する
   */
  registerPipeline(definition: PipelineDefinition): void {
    // T017: パイプライン定義をZodで検証
    const validation = PipelineDefinitionSchema.safeParse(definition);
    if (!validation.success) {
      log.error('[PipelineEngine] registerPipeline validation failed:', validation.error.message);
      throw new Error(`[PipelineEngine] registerPipeline validation failed — ${validation.error.message}`);
    }

    // バリデーション: 各ステップのAgentが登録されていること
    for (const step of definition.steps) {
      const agent = this.registry.get(step.agentId);
      if (!agent) {
        throw new Error(
          `[PipelineEngine] Agent ${step.agentId} not registered for pipeline ${definition.id}`,
        );
      }
    }

    this.definitions.set(definition.id, definition);
    log.info(`[PipelineEngine] Registered pipeline: ${definition.id} (${definition.name})`);
  }

  /**
   * パイプラインを手動実行
   * 血液が心臓から押し出されるように、パイプラインが始動される
   */
  async executePipeline(
    pipelineId: string,
    params?: Record<string, unknown>,
  ): Promise<PipelineExecution> {
    // T017: トリガーパラメータをZodで検証
    const paramValidation = PipelineTriggerParamsSchema.safeParse(params);
    if (!paramValidation.success) {
      log.error('[PipelineEngine] executePipeline params validation failed:', paramValidation.error.message);
      throw new Error(`[PipelineEngine] executePipeline params validation failed — ${paramValidation.error.message}`);
    }

    const definition = this.definitions.get(pipelineId);
    if (!definition) {
      throw new Error(`[PipelineEngine] Pipeline ${pipelineId} not found`);
    }

    const executionId = `exec_${pipelineId}_${Date.now()}`;
    const execution: PipelineExecution = {
      executionId,
      pipelineId,
      status: 'running',
      currentStep: 0,
      startTime: Date.now(),
      results: new Map(),
      errors: [],
    };

    // params をfirst stepのinputとして保存
    if (params) {
      execution.results.set('_params', params);
    }

    this.executions.set(executionId, execution);

    // パイプライン開始イベントを発行
    await this.bus.publish({
      id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'pipeline.started',
      source: 'pipeline-engine',
      priority: 'high',
      payload: { executionId, pipelineId },
      timestamp: Date.now(),
    });

    // 4-06: fire-and-forget → await実行化
    // 旧: this.executeSteps().catch() — 呼び出し元が完了を知れない（火災報知器が鳴っても誰も聞いていない）
    // 新: await で完了を待ち、結果をexecutionに反映する
    try {
      await this.executeSteps(executionId, definition);
      if (execution.status === 'running') {
        execution.status = 'completed';
        execution.endTime = Date.now();
      }
    } catch (err) {
      execution.status = 'failed';
      execution.errors.push({
        step: 'unknown',
        error: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      });
      execution.endTime = Date.now();

      // 4-09: rollback機構 — 失敗時に完了済みステップを逆順でロールバック
      if (definition.onFailure === 'rollback') {
        await this.rollbackSteps(executionId, definition);
      }
    }

    this.addToHistory(execution);
    return execution;
  }

  /**
   * ステップの逐次実行（血管内での物質流通）
   * T057: parallel フラグ付きステップは Promise.allSettled で並行実行
   */
  private async executeSteps(executionId: string, definition: PipelineDefinition): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    // T057: 並行実行可能なステップをグループ化
    // parallel: true のステップは同一バッチで実行、false または undefined は単独実行
    let stepIdx = 0;
    while (stepIdx < definition.steps.length) {
      execution.currentStep = stepIdx;
      const currentStep = definition.steps[stepIdx];

      // 並行実行グループを検出（連続した parallel: true のステップ）
      const parallelGroup: typeof definition.steps = [currentStep];
      if (currentStep.parallel) {
        while (
          stepIdx + 1 < definition.steps.length &&
          definition.steps[stepIdx + 1].parallel
        ) {
          parallelGroup.push(definition.steps[++stepIdx]);
        }
      }

      // グループ実行
      if (parallelGroup.length > 1) {
        // T057: 複数ステップを並行実行（Promise.allSettled）
        await this.executeParallelSteps(executionId, definition, parallelGroup, execution);
      } else {
        // 単一ステップの逐次実行
        await this.executeSingleStep(executionId, definition, currentStep, stepIdx, execution);
      }

      // エラーで失敗した場合は中断
      if (execution.status === 'failed') {
        return;
      }

      stepIdx++;
    }

    // 全ステップ完了
    execution.status = 'completed';
    execution.endTime = Date.now();
    this.addToHistory(execution);

    // パイプライン完了イベント
    await this.bus.publish({
      id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'pipeline.completed',
      source: 'pipeline-engine',
      priority: 'normal',
      payload: { executionId, pipelineId: definition.id, results: Object.fromEntries(execution.results) },
      timestamp: Date.now(),
    });
  }

  /**
   * 単一ステップの実行（毛細血管での物質交換）
   */
  private async executeStep(step: PipelineStep, execution: PipelineExecution): Promise<unknown> {
    // inputFrom で前ステップの結果を取得
    let stepInput: unknown = null;
    if (step.inputFrom) {
      stepInput = execution.results.get(step.inputFrom);
    } else if (execution.results.has('_params')) {
      stepInput = execution.results.get('_params');
    }

    // Agentへのコマンド実行（bus.request）
    const commandEvent: AgentEvent = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: `command.${step.action}`,
      source: 'pipeline-engine',
      target: step.agentId,
      priority: 'high',
      payload: {
        pipelineExecutionId: execution.executionId,
        stepId: step.id,
        action: step.action,
        input: stepInput,
      },
      timestamp: Date.now(),
    };

    try {
      const responseEvent = await this.bus.request(commandEvent, step.timeout);
      return responseEvent.payload;
    } catch (err) {
      throw new Error(`Step ${step.id} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * T057: 複数ステップを並行実行
   * Promise.allSettled で全て実行し、全て失敗した場合のみエラー
   */
  private async executeParallelSteps(
    executionId: string,
    definition: PipelineDefinition,
    steps: PipelineStep[],
    execution: PipelineExecution,
  ): Promise<void> {
    log.info(
      `[PipelineEngine] Executing ${steps.length} parallel steps: ${steps.map(s => s.id).join(', ')}`,
    );

    // 全ステップを並行実行
    const promises = steps.map(step => this.executeSingleStepInternal(executionId, definition, step, 0, execution));
    const results = await Promise.allSettled(promises);

    // 結果を集計
    let allFailed = true;
    const failures: { step: string; error: Error }[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const step = steps[i];

      if (result.status === 'fulfilled') {
        allFailed = false;
        execution.results.set(step.id, result.value);
      } else {
        failures.push({
          step: step.id,
          error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
        });
      }
    }

    // 全てが失敗した場合のみエラーとして扱う
    if (allFailed && failures.length > 0) {
      const errorMessages = failures.map(f => `${f.step}: ${f.error.message}`).join('; ');
      const error = new Error(`All parallel steps failed: ${errorMessages}`);

      const errorRecord = {
        step: steps.map(s => s.id).join('+'),
        error: error.message,
        timestamp: Date.now(),
      };
      execution.errors.push(errorRecord);

      // 失敗イベント
      await this.bus.publish({
        id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'pipeline.step.failed',
        source: 'pipeline-engine',
        priority: 'high',
        payload: { executionId, stepIds: steps.map(s => s.id), error: error.message },
        timestamp: Date.now(),
      });

      // 失敗処理
      const shouldContinue = await this.handleFailure(
        executionId,
        definition,
        0,
        error,
      );
      if (!shouldContinue) {
        execution.status = 'failed';
        execution.endTime = Date.now();
      }
    }
  }

  /**
   * T057: 単一ステップの実行内部メソッド
   */
  private async executeSingleStepInternal(
    executionId: string,
    definition: PipelineDefinition,
    step: PipelineStep,
    stepIdx: number,
    execution: PipelineExecution,
  ): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= step.retryCount; attempt++) {
      try {
        const result = await this.executeStep(step, execution);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < step.retryCount) {
          // T056: 指数バックオフ
          const baseDelay = step.retryDelay || 1000;
          const exponentialDelay = baseDelay * Math.pow(2, attempt);
          const jitter = Math.random() * 0.2 - 0.1;
          const delayWithJitter = Math.max(100, exponentialDelay * (1 + jitter));

          log.info(
            `[PipelineEngine] Retrying step ${step.id} (attempt ${attempt + 1}/${step.retryCount}) after ${Math.round(delayWithJitter)}ms`,
          );
          await this.delay(Math.round(delayWithJitter));
        }
      }
    }

    throw lastError || new Error(`Step ${step.id} failed after ${step.retryCount} retries`);
  }

  /**
   * T057: 単一ステップの実行（外部API）
   */
  private async executeSingleStep(
    executionId: string,
    definition: PipelineDefinition,
    step: PipelineStep,
    stepIdx: number,
    execution: PipelineExecution,
  ): Promise<void> {
    try {
      const result = await this.executeSingleStepInternal(executionId, definition, step, stepIdx, execution);
      execution.results.set(step.id, result);

      // ステップ完了イベント
      await this.bus.publish({
        id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'pipeline.step.completed',
        source: 'pipeline-engine',
        priority: 'normal',
        payload: { executionId, stepId: step.id, stepIdx, result },
        timestamp: Date.now(),
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      const errorRecord = {
        step: step.id,
        error: error.message,
        timestamp: Date.now(),
      };
      execution.errors.push(errorRecord);

      // ステップ失敗イベント
      await this.bus.publish({
        id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'pipeline.step.failed',
        source: 'pipeline-engine',
        priority: 'high',
        payload: { executionId, stepId: step.id, error: error.message },
        timestamp: Date.now(),
      });

      // onFailure モード処理
      const shouldContinue = await this.handleFailure(executionId, definition, stepIdx, error);
      if (!shouldContinue) {
        execution.status = 'failed';
        execution.endTime = Date.now();
        this.addToHistory(execution);

        // パイプライン失敗イベント
        await this.bus.publish({
          id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'pipeline.failed',
          source: 'pipeline-engine',
          priority: 'high',
          payload: { executionId, pipelineId: definition.id, failedStep: step.id },
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * 失敗時の処理モード
   * halt: 即座に停止（血液凝固）
   * skip: このステップをスキップして続行（迂回路）
   * retry: リトライロジックが既に処理（ここで追加処理なし）
   * rollback: 前のステップまで巻き戻し
   */
  private async handleFailure(
    executionId: string,
    definition: PipelineDefinition,
    failedStepIdx: number,
    error: Error,
  ): Promise<boolean> {
    const mode = definition.onFailure;

    switch (mode) {
      case 'halt':
        // 即座に失敗状態に
        log.info(
          `[PipelineEngine] Pipeline ${definition.id} halted due to step failure`,
        );
        return false;

      case 'skip':
        // このステップをスキップして続行
        log.info(
          `[PipelineEngine] Skipping failed step in pipeline ${definition.id}, continuing...`,
        );
        return true;

      case 'retry':
        // リトライロジックは executeStep で既に処理
        // ここでは追加のリトライ判定なし
        return false;

      case 'rollback':
        // 完了済みステップを逆順に巻き戻し（補償トランザクション）
        // 外科手術の「止血→縫合→閉創」のように、影響を最小化する
        await this.executeRollback(executionId, definition, failedStepIdx);
        return false;

      default:
        return false;
    }
  }

  /**
   * パイプラインを一時停止
   * 血流が止まる（ただし細胞はまだ生きている）
   */
  pausePipeline(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === 'running') {
      execution.status = 'paused';
      log.info(`[PipelineEngine] Paused pipeline execution ${executionId}`);
    }
  }

  /**
   * 一時停止中のパイプラインを再開
   * 血流が再開する
   */
  async resumePipeline(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'paused') {
      throw new Error(`[PipelineEngine] Execution ${executionId} is not paused`);
    }

    const definition = this.definitions.get(execution.pipelineId);
    if (!definition) {
      throw new Error(`[PipelineEngine] Pipeline definition ${execution.pipelineId} not found`);
    }

    execution.status = 'running';
    log.info(`[PipelineEngine] Resumed pipeline execution ${executionId}`);

    // 現在のステップから再開
    const remainingSteps = definition.steps.slice(execution.currentStep);
    const partialDef: PipelineDefinition = {
      ...definition,
      steps: remainingSteps,
    };

    // 残りのステップを実行
    await this.executeSteps(executionId, partialDef);
  }

  /**
   * パイプラインをキャンセル
   * 血流が完全に止まる（細胞死）
   */
  cancelPipeline(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (execution) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.errors.push({
        step: 'cancel',
        error: 'Pipeline was cancelled by user',
        timestamp: Date.now(),
      });
      this.addToHistory(execution);
      this.executions.delete(executionId);

      // タイマーをクリア
      for (const [key, timer] of this.stepTimers) {
        if (key.startsWith(executionId)) {
          clearTimeout(timer);
          this.stepTimers.delete(key);
        }
      }

      log.info(`[PipelineEngine] Cancelled pipeline execution ${executionId}`);
    }
  }

  /**
   * 全パイプライン定義を取得
   */
  getDefinitions(): PipelineDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * 実行中のパイプラインを取得
   */
  getActiveExecutions(): PipelineExecution[] {
    return Array.from(this.executions.values()).filter(
      (exec) => exec.status === 'running' || exec.status === 'paused',
    );
  }

  /**
   * 実行状態を取得（単一）
   */
  getExecutionStatus(executionId: string): PipelineExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * 実行履歴を取得
   */
  getExecutionHistory(pipelineId?: string, limit = 100): PipelineExecution[] {
    let filtered = this.executionHistory;
    if (pipelineId) {
      filtered = filtered.filter((exec) => exec.pipelineId === pipelineId);
    }
    return filtered.slice(-limit);
  }

  /**
   * 統計情報
   */
  getStats(): {
    total: number;
    active: number;
    completed: number;
    failed: number;
  } {
    const active = this.getActiveExecutions().length;
    const completed = this.executionHistory.filter((e) => e.status === 'completed').length;
    const failed = this.executionHistory.filter((e) => e.status === 'failed').length;

    return {
      total: this.executionHistory.length,
      active,
      completed,
      failed,
    };
  }

  /**
   * イベントトリガーの自動実行を開始
   * ホルモン指令を受信してパイプラインが自動起動される
   */
  startEventListeners(): void {
    for (const [pipelineId, definition] of this.definitions) {
      if (definition.trigger.type === 'event' && definition.trigger.eventType) {
        const eventType = definition.trigger.eventType;
        const subscriptionId = this.bus.subscribe(eventType, async (event) => {
          log.info(
            `[PipelineEngine] Auto-triggered pipeline ${pipelineId} by event: ${eventType}`,
          );
          try {
            await this.executePipeline(pipelineId, event.payload as Record<string, unknown>);
          } catch (err) {
            log.error(
              `[PipelineEngine] Failed to auto-execute pipeline ${pipelineId}:`,
              err,
            );
          }
        });
        this.eventListeners.set(eventType, subscriptionId);
      }
    }
  }

  /**
   * ランタイムでパイプラインを追加登録（成長期の新血管形成）
   *
   * システム稼働中に新しいパイプラインを追加できる。
   * IPコラボ追加やビジネス拡大時に、再デプロイなしで新経路を開通させる。
   * event型トリガーの場合、自動的にBus購読を開始する。
   */
  addPipelineAtRuntime(definition: PipelineDefinition): void {
    // 既存チェック
    if (this.definitions.has(definition.id)) {
      throw new Error(`[PipelineEngine] Pipeline ${definition.id} already exists. Use removePipeline() first.`);
    }

    // Agent存在チェック
    for (const step of definition.steps) {
      const agent = this.registry.get(step.agentId);
      if (!agent) {
        throw new Error(
          `[PipelineEngine] Agent ${step.agentId} not registered — cannot add pipeline ${definition.id}`,
        );
      }
    }

    this.definitions.set(definition.id, definition);

    // eventトリガーの場合、即座にBus購読を開始
    if (definition.trigger.type === 'event' && definition.trigger.eventType) {
      const eventType = definition.trigger.eventType;
      const subscriptionId = this.bus.subscribe(eventType, async (event) => {
        log.info(`[PipelineEngine] Runtime-triggered pipeline ${definition.id} by event: ${eventType}`);
        try {
          await this.executePipeline(definition.id, event.payload as Record<string, unknown>);
        } catch (err) {
          log.error(`[PipelineEngine] Failed to auto-execute runtime pipeline ${definition.id}:`, err);
        }
      });
      this.eventListeners.set(eventType, subscriptionId);
    }

    log.info(`[PipelineEngine] Runtime pipeline added: ${definition.id} (${definition.name})`);
  }

  /**
   * ランタイムでパイプラインを削除（壊死血管の除去手術）
   *
   * 不要になったパイプラインを安全に除去する。
   * 進行中の実行がある場合はエラーを返す（手術中の血管は切れない）。
   */
  removePipeline(pipelineId: string): void {
    if (!this.definitions.has(pipelineId)) {
      throw new Error(`[PipelineEngine] Pipeline ${pipelineId} not found`);
    }

    // 進行中の実行がないか確認
    const activeExecution = [...this.executions.values()].find(
      e => e.pipelineId === pipelineId && e.status === 'running',
    );
    if (activeExecution) {
      throw new Error(
        `[PipelineEngine] Pipeline ${pipelineId} has active execution ${activeExecution.executionId}. Wait for completion.`,
      );
    }

    const definition = this.definitions.get(pipelineId)!;

    // eventリスナーの解除
    if (definition.trigger.type === 'event' && definition.trigger.eventType) {
      const subId = this.eventListeners.get(definition.trigger.eventType);
      if (subId) {
        this.bus.unsubscribe(subId);
        this.eventListeners.delete(definition.trigger.eventType);
      }
    }

    this.definitions.delete(pipelineId);
    log.info(`[PipelineEngine] Pipeline removed: ${pipelineId}`);
  }

  /**
   * Rollback実行（外科的補償トランザクション）
   *
   * 失敗したステップより前の完了済みステップを逆順に巻き戻す。
   * 各ステップにrollbackAction定義がある場合、そのアクションを実行。
   * なければ結果をクリアして巻き戻し完了とする。
   *
   * 人体で言えば: 手術の「止血→縫合→閉創」プロセス
   */
  private async executeRollback(
    executionId: string,
    definition: PipelineDefinition,
    failedStepIdx: number,
  ): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    log.info(
      `[PipelineEngine] Starting rollback for pipeline ${definition.id} (failed at step ${failedStepIdx})`,
    );

    const rolledBackSteps: string[] = [];

    // 完了済みステップを逆順にロールバック
    for (let i = failedStepIdx - 1; i >= 0; i--) {
      const step = definition.steps[i];
      const stepResult = execution.results.get(step.id);

      if (stepResult === undefined) continue; // 未実行ステップはスキップ

      try {
        // rollbackAction が定義されている場合は補償アクションを実行
        if (step.rollbackAction) {
          const rollbackEvent: AgentEvent = {
            id: `rollback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: `command.${step.rollbackAction}`,
            source: 'pipeline-engine',
            target: step.agentId,
            priority: 'high',
            payload: {
              pipelineExecutionId: executionId,
              stepId: step.id,
              action: step.rollbackAction,
              originalResult: stepResult,
            },
            timestamp: Date.now(),
          };

          await this.bus.request(rollbackEvent, step.timeout);
        }

        // 結果をクリア
        execution.results.delete(step.id);
        rolledBackSteps.push(step.id);

        log.info(`[PipelineEngine] Rolled back step: ${step.id}`);
      } catch (rollbackErr) {
        // ロールバック自体が失敗した場合、記録して続行
        log.error(
          `[PipelineEngine] Rollback failed for step ${step.id}:`,
          rollbackErr,
        );
        execution.errors.push({
          step: `rollback:${step.id}`,
          error: `Rollback failed: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`,
          timestamp: Date.now(),
        });
      }
    }

    // ロールバック完了イベント
    await this.bus.publish({
      id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'pipeline.rolledback',
      source: 'pipeline-engine',
      priority: 'high',
      payload: {
        executionId,
        pipelineId: definition.id,
        rolledBackSteps,
        failedStep: definition.steps[failedStepIdx]?.id,
      },
      timestamp: Date.now(),
    });

    log.info(
      `[PipelineEngine] Rollback complete: ${rolledBackSteps.length} steps reverted`,
    );
  }

  /**
   * 4-09: 全完了ステップのロールバック（executeRollbackのラッパー）
   * トップレベルの例外キャッチ後に呼び出される。
   * execution.currentStep を使って失敗位置を特定する。
   */
  private async rollbackSteps(executionId: string, definition: PipelineDefinition): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) return;
    const failedIdx = Math.min(execution.currentStep + 1, definition.steps.length);
    await this.executeRollback(executionId, definition, failedIdx);
  }

  /**
   * クリーンアップ
   * 細胞死時に臓器を停止する
   */
  shutdown(): void {
    // すべてのイベントリスナーを解除
    for (const subscriptionId of this.eventListeners.values()) {
      this.bus.unsubscribe(subscriptionId);
    }
    this.eventListeners.clear();

    // 実行中のタイマーをクリア
    for (const timer of this.stepTimers.values()) {
      clearTimeout(timer);
    }
    this.stepTimers.clear();

    // 実行中のパイプラインをキャンセル
    for (const execution of this.getActiveExecutions()) {
      this.cancelPipeline(execution.executionId);
    }

    log.info('[PipelineEngine] Shutdown complete');
  }

  /**
   * ユーティリティ: 遅延
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.stepTimers.set(`delay_${Date.now()}_${Math.random()}`, timer);
    });
  }
}
