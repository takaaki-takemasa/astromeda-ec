/**
 * DeployManager — L2 デプロイ管理エージェント（循環系ポンプ制御）
 *
 * 生体対応: 心臓弁膜（血流制御・逆流防止）
 * CI/CDパイプライン、GitHub Actions→Oxygen、プレビュー環境、
 * ロールバック機能、ステージング管理を実行。
 * EngineeringLeadから指令を受け、安全なデプロイフローを維持。
 *
 * 担当タスク: deploy_staging, deploy_production, rollback, preview_env, deploy_status
 * 所属パイプライン: P11（デプロイメントパイプライン）
 */

import type {
  AgentId,
  AgentEvent,
  CascadeCommand,
  IAgentBus,
} from '../core/types';
import {BaseL2Agent} from './base-l2-agent';

type DeployStage = 'pending' | 'building' | 'testing' | 'deploying' | 'verifying' | 'completed' | 'failed' | 'rolled_back';
type DeployTarget = 'staging' | 'production' | 'preview';

interface Deployment {
  id: string;
  target: DeployTarget;
  stage: DeployStage;
  commitHash: string;
  branch: string;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  buildResult?: 'success' | 'failure';
  testResult?: 'success' | 'failure';
  deployUrl?: string;
  error?: string;
  rolledBack: boolean;
  initiatedBy: string;
}

interface RollbackInfo {
  deploymentId: string;
  previousDeploymentId: string;
  reason: string;
  executedAt: number;
  success: boolean;
}

export class DeployManager extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'deploy-manager',
    name: 'DeployManager',
    level: 'L2',
    team: 'engineering',
    version: '1.0.0',
  };

  private deployments: Map<string, Deployment> = new Map();
  private rollbacks: RollbackInfo[] = [];
  private currentDeployment: string | null = null;
  private readonly MAX_DEPLOYMENTS = 200;

  constructor(bus: IAgentBus) {
    super(bus);
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('deploy.*');
    this.subscribe('ci.build.*');
    this.subscribe('ci.test.*');
  }

  protected async onShutdown(): Promise<void> {
    this.deployments.clear();
    this.rollbacks = [];
    this.currentDeployment = null;
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'ci.build.completed') {
      await this.handleBuildCompleted(event);
    } else if (event.type === 'ci.test.completed') {
      await this.handleTestCompleted(event);
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'deploy_staging':
        return this.initiateDeploy('staging', command.params);
      case 'deploy_production':
        return this.initiateDeploy('production', command.params);
      case 'rollback':
        return this.executeRollback(command.params);
      case 'preview_env':
        return this.createPreviewEnvironment(command.params);
      case 'deploy_status':
        return this.getDeployStatus();
      case 'get_status':
        return this.getManagerStatus();
      default:
        return {status: 'unknown_action', action: command.action};
    }
  }

  // ── Core Operations ──

  private async initiateDeploy(
    target: DeployTarget,
    params: Record<string, unknown> | undefined,
  ): Promise<Deployment> {
    // 本番デプロイは安全ガード（CLAUDE.mdの「本番切り替え禁止」）
    if (target === 'production') {
      const forceOverride = params?.forceOverride === true;
      if (!forceOverride) {
        const blocked: Deployment = {
          id: `deploy_${Date.now()}`,
          target,
          stage: 'failed',
          commitHash: (params?.commitHash as string) ?? 'unknown',
          branch: (params?.branch as string) ?? 'main',
          startedAt: Date.now(),
          completedAt: Date.now(),
          error: '本番デプロイは完全なデバッグ・構成確認が終わるまで禁止です（CLAUDE.md準拠）',
          rolledBack: false,
          initiatedBy: (params?.initiatedBy as string) ?? 'system',
        };
        this.addDeployment(blocked);
        return blocked;
      }
    }

    const deployment: Deployment = {
      id: `deploy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      target,
      stage: 'pending',
      commitHash: (params?.commitHash as string) ?? 'HEAD',
      branch: (params?.branch as string) ?? 'main',
      startedAt: Date.now(),
      rolledBack: false,
      initiatedBy: (params?.initiatedBy as string) ?? 'system',
    };

    this.addDeployment(deployment);
    this.currentDeployment = deployment.id;

    // デプロイ開始通知
    await this.publishEvent('deploy.started', {
      deploymentId: deployment.id,
      target,
      branch: deployment.branch,
    });

    // ビルドフェーズへ進行
    deployment.stage = 'building';

    return deployment;
  }

  private async handleBuildCompleted(event: AgentEvent): Promise<void> {
    if (!this.currentDeployment) return;
    const deployment = this.deployments.get(this.currentDeployment);
    if (!deployment) return;

    const payload = event.payload as {success?: boolean} | undefined;
    deployment.buildResult = payload?.success ? 'success' : 'failure';

    if (deployment.buildResult === 'failure') {
      deployment.stage = 'failed';
      deployment.completedAt = Date.now();
      deployment.duration = deployment.completedAt - deployment.startedAt;
      deployment.error = 'ビルド失敗';
      this.currentDeployment = null;

      await this.publishEvent('deploy.failed', {
        deploymentId: deployment.id,
        stage: 'building',
        error: deployment.error,
      }, 'high');
      return;
    }

    deployment.stage = 'testing';
  }

  private async handleTestCompleted(event: AgentEvent): Promise<void> {
    if (!this.currentDeployment) return;
    const deployment = this.deployments.get(this.currentDeployment);
    if (!deployment || deployment.stage !== 'testing') return;

    const payload = event.payload as {success?: boolean} | undefined;
    deployment.testResult = payload?.success ? 'success' : 'failure';

    if (deployment.testResult === 'failure') {
      deployment.stage = 'failed';
      deployment.completedAt = Date.now();
      deployment.duration = deployment.completedAt - deployment.startedAt;
      deployment.error = 'テスト失敗';
      this.currentDeployment = null;

      await this.publishEvent('deploy.failed', {
        deploymentId: deployment.id,
        stage: 'testing',
        error: deployment.error,
      }, 'high');
      return;
    }

    // デプロイフェーズへ
    deployment.stage = 'deploying';
    await this.publishEvent('deploy.deploying', {deploymentId: deployment.id});
  }

  private async executeRollback(
    params: Record<string, unknown> | undefined,
  ): Promise<RollbackInfo> {
    const deploymentId = (params?.deploymentId as string) ?? this.currentDeployment ?? '';
    const reason = (params?.reason as string) ?? '手動ロールバック';

    const deployment = this.deployments.get(deploymentId);
    if (deployment) {
      deployment.stage = 'rolled_back';
      deployment.rolledBack = true;
      deployment.completedAt = Date.now();
    }

    // 前回の成功デプロイを探す
    const previousSuccess = Array.from(this.deployments.values())
      .filter(d => d.stage === 'completed' && d.id !== deploymentId)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0];

    const rollback: RollbackInfo = {
      deploymentId,
      previousDeploymentId: previousSuccess?.id ?? 'unknown',
      reason,
      executedAt: Date.now(),
      success: true,
    };

    this.rollbacks.push(rollback);
    this.currentDeployment = null;

    await this.publishEvent('deploy.rolledback', rollback, 'high');
    return rollback;
  }

  private async createPreviewEnvironment(
    params: Record<string, unknown> | undefined,
  ): Promise<Deployment> {
    return this.initiateDeploy('preview', params);
  }

  private getDeployStatus(): Record<string, unknown> {
    const all = Array.from(this.deployments.values());
    const current = this.currentDeployment ? this.deployments.get(this.currentDeployment) : null;

    return {
      currentDeployment: current ?? null,
      totalDeployments: all.length,
      successful: all.filter(d => d.stage === 'completed').length,
      failed: all.filter(d => d.stage === 'failed').length,
      rolledBack: all.filter(d => d.rolledBack).length,
      recentDeployments: all.slice(-10),
    };
  }

  private getManagerStatus(): Record<string, unknown> {
    return {
      totalDeployments: this.deployments.size,
      currentDeployment: this.currentDeployment,
      rollbacks: this.rollbacks.length,
      lastDeploy: Array.from(this.deployments.values()).pop() ?? null,
    };
  }

  private addDeployment(deployment: Deployment): void {
    this.deployments.set(deployment.id, deployment);
    if (this.deployments.size > this.MAX_DEPLOYMENTS) {
      const oldestKey = this.deployments.keys().next().value;
      if (oldestKey) this.deployments.delete(oldestKey);
    }
  }
}
