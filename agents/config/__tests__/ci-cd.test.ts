/**
 * CI/CD Pipeline テスト — 自動デプロイメント配管（循環系）の検証
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CICDPipeline,
  getCICDPipeline,
  resetCICDPipeline,
  type DeploymentStatus,
  type CheckResult,
} from '../ci-cd.js';

describe('CICDPipeline', () => {
  let pipeline: CICDPipeline;

  beforeEach(() => {
    resetCICDPipeline();
    pipeline = getCICDPipeline();
  });

  describe('runPreDeployChecks', () => {
    it('デプロイ前チェックを実行する', async () => {
      const results = await pipeline.runPreDeployChecks('staging');

      expect(results).toHaveLength(7);
      expect(results.every((r) => r.passed)).toBe(true);
      expect(results[0].name).toBe('checkout');
    });

    it('すべてのチェック結果にタイムスタンプがある', async () => {
      const results = await pipeline.runPreDeployChecks('staging');

      results.forEach((result) => {
        expect(result.timestamp).toBeGreaterThan(0);
      });
    });

    it('チェック結果に実行時間が含まれている', async () => {
      const results = await pipeline.runPreDeployChecks('staging');

      results.forEach((result) => {
        expect(result.duration).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('runPostDeployChecks', () => {
    it('stagingデプロイ後チェックを実行する', async () => {
      const results = await pipeline.runPostDeployChecks('staging');

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('smoke-test-staging');
      expect(results[1].name).toBe('health-check');
    });

    it('productionデプロイ後チェックを実行する', async () => {
      const results = await pipeline.runPostDeployChecks('production');

      expect(results).toHaveLength(3);
      expect(results[2].name).toBe('smoke-test-production');
    });

    it('すべてのチェックが正常に完了する', async () => {
      const results = await pipeline.runPostDeployChecks('staging');

      expect(results.every((r) => r.passed)).toBe(true);
    });
  });

  describe('getDeploymentStatus', () => {
    it('デプロイメントステータスを取得する', () => {
      const status = pipeline.initializeDeployment('deploy-1', 'staging');

      const retrieved = pipeline.getDeploymentStatus('deploy-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.phase).toBe('pre-deploy-checks');
    });

    it('未登録のデプロイメントではnullを返す', () => {
      const status = pipeline.getDeploymentStatus('nonexistent');
      expect(status).toBeNull();
    });
  });

  describe('initializeDeployment', () => {
    it('stagingデプロイメントを初期化する', () => {
      const status = pipeline.initializeDeployment('deploy-staging-1', 'staging');

      expect(status.phase).toBe('pre-deploy-checks');
      expect(status.progress).toBe(0);
      expect(status.errors).toEqual([]);
      expect(status.approvalStatus).toBe('approved');
    });

    it('productionデプロイメントの承認状態はpendingで初期化される', () => {
      const status = pipeline.initializeDeployment('deploy-prod-1', 'production');

      expect(status.approvalStatus).toBe('pending');
    });

    it('startTimeが設定される', () => {
      const beforeInit = Date.now();
      const status = pipeline.initializeDeployment('deploy-2', 'staging');
      const afterInit = Date.now();

      expect(status.startTime).toBeGreaterThanOrEqual(beforeInit);
      expect(status.startTime).toBeLessThanOrEqual(afterInit);
    });
  });

  describe('updateDeploymentStatus', () => {
    it('チェック結果をマージする', () => {
      const status = pipeline.initializeDeployment('deploy-3', 'staging');

      const checkResults: CheckResult[] = [
        {
          name: 'type-check',
          passed: true,
          duration: 1000,
          output: 'OK',
          timestamp: Date.now(),
        },
        {
          name: 'lint',
          passed: false,
          duration: 500,
          output: '',
          timestamp: Date.now(),
          errorMessage: 'Lint errors found',
        },
      ];

      pipeline.updateDeploymentStatus('deploy-3', checkResults);

      const updated = pipeline.getDeploymentStatus('deploy-3');
      expect(updated?.results.size).toBe(2);
      expect(updated?.errors).toHaveLength(1);
    });

    it('進捗を計算する', () => {
      pipeline.initializeDeployment('deploy-4', 'staging');

      const checkResults: CheckResult[] = [
        { name: 'type-check', passed: true, duration: 100, output: '', timestamp: Date.now() },
        { name: 'lint', passed: true, duration: 100, output: '', timestamp: Date.now() },
        { name: 'test-unit', passed: false, duration: 100, output: '', timestamp: Date.now(), errorMessage: 'Failed' },
      ];

      pipeline.updateDeploymentStatus('deploy-4', checkResults);

      const updated = pipeline.getDeploymentStatus('deploy-4');
      expect(updated?.progress).toBe(66); // 2/3 = 66%
    });
  });

  describe('completeDeployment', () => {
    it('成功したデプロイメントを完了する', () => {
      pipeline.initializeDeployment('deploy-5', 'staging');
      pipeline.completeDeployment('deploy-5', true);

      const completed = pipeline.getDeploymentStatus('deploy-5');
      expect(completed?.endTime).toBeGreaterThan(0);
      expect(completed?.progress).toBe(100);
    });

    it('失敗したデプロイメントを完了する', () => {
      pipeline.initializeDeployment('deploy-6', 'staging');
      pipeline.completeDeployment('deploy-6', false);

      const completed = pipeline.getDeploymentStatus('deploy-6');
      expect(completed?.endTime).toBeGreaterThan(0);
      expect(completed?.progress).toBe(0);
    });
  });

  describe('generateGitHubActionsConfig', () => {
    it('GitHub Actionsの設定を生成する', () => {
      const config = pipeline.generateGitHubActionsConfig();

      expect(config).toBeTruthy();
      expect(config).toContain('Deploy Astromeda Agents');
      expect(config).toContain('ubuntu-latest');
    });

    it('設定にチェックアウトステップが含まれている', () => {
      const config = pipeline.generateGitHubActionsConfig();

      expect(config).toContain('actions/checkout@v4');
    });

    it('設定にNode.jsセットアップステップが含まれている', () => {
      const config = pipeline.generateGitHubActionsConfig();

      expect(config).toContain('actions/setup-node@v4');
    });

    it('設定にビルドステップが含まれている', () => {
      const config = pipeline.generateGitHubActionsConfig();

      expect(config).toContain('npm run build');
    });

    it('設定にtypeチェックとlintが含まれている', () => {
      const config = pipeline.generateGitHubActionsConfig();

      expect(config).toContain('npm run type-check');
      expect(config).toContain('npm run lint');
    });

    it('設定にテストが含まれている', () => {
      const config = pipeline.generateGitHubActionsConfig();

      expect(config).toContain('npm run test:unit');
      expect(config).toContain('npm run test:integration');
    });

    it('設定にセキュリティスキャンが含まれている', () => {
      const config = pipeline.generateGitHubActionsConfig();

      expect(config).toContain('npm run security:scan');
      expect(config).toContain('npm audit');
    });

    it('設定に本番デプロイメント設定が含まれている', () => {
      const config = pipeline.generateGitHubActionsConfig();

      expect(config).toContain('astromeda-agents-production');
      expect(config).toContain('FLY_API_TOKEN_PRODUCTION');
    });

    it('設定にSlack通知が含まれている', () => {
      const config = pipeline.generateGitHubActionsConfig();

      expect(config).toContain('slackapi/slack-github-action@v1');
      expect(config).toContain('SLACK_WEBHOOK_URL');
    });

    it('生成された設定はJSON形式である', () => {
      const config = pipeline.generateGitHubActionsConfig();

      expect(() => {
        JSON.parse(config);
      }).not.toThrow();
    });
  });

  describe('generateFlyDeployConfig', () => {
    it('Fly.io設定を生成する', () => {
      const config = pipeline.generateFlyDeployConfig('astromeda-agents-staging');

      expect(config).toBeTruthy();
      expect(config).toContain('astromeda-agents-staging');
    });

    it('設定にビルド設定が含まれている', () => {
      const config = pipeline.generateFlyDeployConfig('astromeda-agents-staging');

      expect(config).toContain('paketobuildpacks/builder:base');
    });

    it('設定にサービス設定が含まれている', () => {
      const config = pipeline.generateFlyDeployConfig('astromeda-agents-staging');

      expect(config).toContain('protocol = "tcp"');
      expect(config).toContain('internal_port = 8080');
    });

    it('設定にヘルスチェック設定が含まれている', () => {
      const config = pipeline.generateFlyDeployConfig('astromeda-agents-staging');

      expect(config).toContain('/api/health');
      expect(config).toContain('30s');
    });

    it('設定にプロセス定義が含まれている', () => {
      const config = pipeline.generateFlyDeployConfig('astromeda-agents-staging');

      expect(config).toContain('app = "node dist/server.js"');
      expect(config).toContain('worker = "node dist/worker.js"');
    });

    it('設定にVMサイズが含まれている', () => {
      const config = pipeline.generateFlyDeployConfig('astromeda-agents-staging');

      expect(config).toContain('size = "performance-1x"');
    });

    it('デフォルトリージョンはsjcである', () => {
      const config = pipeline.generateFlyDeployConfig('astromeda-agents-staging');

      expect(config).toContain('primary_region = "sjc"');
    });

    it('指定されたリージョンを使用できる', () => {
      const config = pipeline.generateFlyDeployConfig('astromeda-agents-staging', 'nrt');

      expect(config).toContain('primary_region = "nrt"');
    });
  });

  describe('デプロイメントフロー', () => {
    it('stagingデプロイメントの完全フロー', async () => {
      // 1. デプロイメント初期化
      const status1 = pipeline.initializeDeployment('deploy-flow-1', 'staging');
      expect(status1.progress).toBe(0);

      // 2. デプロイ前チェック実行
      const preChecks = await pipeline.runPreDeployChecks('staging');
      pipeline.updateDeploymentStatus('deploy-flow-1', preChecks);

      const status2 = pipeline.getDeploymentStatus('deploy-flow-1');
      expect(status2?.progress).toBe(100);
      expect(status2?.errors).toHaveLength(0);

      // 3. デプロイ後チェック実行
      const postChecks = await pipeline.runPostDeployChecks('staging');
      pipeline.updateDeploymentStatus('deploy-flow-1', postChecks);

      // 4. 完了
      pipeline.completeDeployment('deploy-flow-1', true);

      const finalStatus = pipeline.getDeploymentStatus('deploy-flow-1');
      expect(finalStatus?.endTime).toBeGreaterThanOrEqual(finalStatus?.startTime!);
      expect(finalStatus?.progress).toBe(100);
    });
  });

  describe('Singleton pattern', () => {
    it('同じインスタンスを返す', () => {
      const cicd1 = getCICDPipeline();
      const cicd2 = getCICDPipeline();

      expect(cicd1).toBe(cicd2);
    });

    it('resetCICDPipelineで初期化できる', () => {
      const cicd1 = getCICDPipeline();
      cicd1.initializeDeployment('test-1', 'staging');

      resetCICDPipeline();

      const cicd2 = getCICDPipeline();
      expect(cicd1).not.toBe(cicd2);
      expect(cicd2.getDeploymentStatus('test-1')).toBeNull();
    });
  });

  describe('複数デプロイメントの並列管理', () => {
    it('複数のデプロイメントを同時に管理できる', async () => {
      const status1 = pipeline.initializeDeployment('deploy-parallel-1', 'staging');
      const status2 = pipeline.initializeDeployment('deploy-parallel-2', 'production');

      expect(status1.target).toBe('staging');
      expect(status2.target).toBe('production');

      const retrieved1 = pipeline.getDeploymentStatus('deploy-parallel-1');
      const retrieved2 = pipeline.getDeploymentStatus('deploy-parallel-2');

      expect(retrieved1).not.toBeNull();
      expect(retrieved2).not.toBeNull();
      expect(retrieved1?.approvalStatus).toBe('approved');
      expect(retrieved2?.approvalStatus).toBe('pending');
    });

    it('各デプロイメントのチェック結果は独立している', async () => {
      pipeline.initializeDeployment('deploy-indep-1', 'staging');
      pipeline.initializeDeployment('deploy-indep-2', 'staging');

      const checks1: CheckResult[] = [
        { name: 'type-check', passed: true, duration: 100, output: '', timestamp: Date.now() },
      ];

      const checks2: CheckResult[] = [
        { name: 'lint', passed: false, duration: 100, output: '', timestamp: Date.now(), errorMessage: 'Lint error' },
      ];

      pipeline.updateDeploymentStatus('deploy-indep-1', checks1);
      pipeline.updateDeploymentStatus('deploy-indep-2', checks2);

      const status1 = pipeline.getDeploymentStatus('deploy-indep-1');
      const status2 = pipeline.getDeploymentStatus('deploy-indep-2');

      expect(status1?.errors).toHaveLength(0);
      expect(status2?.errors).toHaveLength(1);
    });
  });

  describe('エラーハンドリング', () => {
    it('存在しないデプロイメントのupdateは無視される', async () => {
      const checks: CheckResult[] = [
        { name: 'type-check', passed: true, duration: 100, output: '', timestamp: Date.now() },
      ];

      expect(() => {
        pipeline.updateDeploymentStatus('nonexistent', checks);
      }).not.toThrow();
    });

    it('存在しないデプロイメントのcompleteは無視される', () => {
      expect(() => {
        pipeline.completeDeployment('nonexistent', true);
      }).not.toThrow();
    });
  });

  describe('設定オプション', () => {
    it('カスタムデプロイメント設定を使用できる', () => {
      const customPipeline = new CICDPipeline({
        target: 'staging',
        checks: ['type-check', 'test-unit'],
        timeout: 600000,
      });

      expect(customPipeline).toBeTruthy();
    });
  });
});
