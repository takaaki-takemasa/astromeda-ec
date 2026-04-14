/**
 * Pipeline Integration Test — 16パイプライン統合E2Eテスト
 * #93: 全パイプライン定義の整合性・完全性を検証
 */

import { describe, it, expect } from 'vitest';
import {
  getDefaultPipelines,
  getPipelineDefinition,
  getPipelineDescription,
} from '../pipeline-definitions.js';
import type { PipelineDefinition } from '../../core/types.js';

describe('Pipeline Integration — 17パイプライン統合テスト', () => {
  const pipelines = getDefaultPipelines();

  it('全21パイプラインが登録されている', () => {
    expect(pipelines).toHaveLength(27);
  });

  it('全パイプラインIDが一意', () => {
    const ids = pipelines.map((p) => p.id);
    expect(new Set(ids).size).toBe(27);
  });

  it('P01-P17の連番IDが全て存在する', () => {
    for (let i = 1; i <= 17; i++) {
      const id = `P${String(i).padStart(2, '0')}`;
      expect(pipelines.find((p) => p.id === id)).toBeDefined();
    }
  });

  it('全パイプラインにname, trigger, steps, onFailureが定義されている', () => {
    for (const p of pipelines) {
      expect(p.name).toBeTruthy();
      expect(p.trigger).toBeDefined();
      expect(p.trigger.type).toBeDefined();
      expect(p.steps.length).toBeGreaterThan(0);
      expect(p.onFailure).toBeDefined();
    }
  });

  it('全ステップにid, agentId, action, timeout, retryCountが定義されている', () => {
    for (const p of pipelines) {
      for (const step of p.steps) {
        expect(step.id).toBeTruthy();
        expect(step.agentId).toBeTruthy();
        expect(step.action).toBeTruthy();
        expect(step.timeout).toBeGreaterThan(0);
        expect(step.retryCount).toBeDefined();
      }
    }
  });

  it('2番目以降のステップにinputFromが設定されている', () => {
    for (const p of pipelines) {
      for (let i = 1; i < p.steps.length; i++) {
        expect(p.steps[i].inputFrom).toBeTruthy();
      }
    }
  });

  it('inputFromが同パイプライン内の先行ステップIDを参照している', () => {
    for (const p of pipelines) {
      const stepIds = p.steps.map((s) => s.id);
      for (let i = 1; i < p.steps.length; i++) {
        const ref = p.steps[i].inputFrom!;
        const refIdx = stepIds.indexOf(ref);
        expect(refIdx).toBeGreaterThanOrEqual(0);
        expect(refIdx).toBeLessThan(i);
      }
    }
  });

  it('getPipelineDefinition()で各パイプラインが個別取得可能', () => {
    for (let i = 1; i <= 17; i++) {
      const id = `P${String(i).padStart(2, '0')}`;
      const p = getPipelineDefinition(id);
      expect(p).toBeDefined();
      expect(p!.id).toBe(id);
    }
  });

  it('getPipelineDescription()で全パイプラインに説明文がある', () => {
    for (let i = 1; i <= 17; i++) {
      const id = `P${String(i).padStart(2, '0')}`;
      const desc = getPipelineDescription(id);
      expect(desc).not.toBe('未知のパイプライン');
      expect(desc.length).toBeGreaterThan(10);
    }
  });

  it('triggerタイプがschedule/manual/eventのいずれか', () => {
    const validTypes = ['schedule', 'manual', 'event', 'cascade'];
    for (const p of pipelines) {
      expect(validTypes).toContain(p.trigger.type);
    }
  });

  it('schedule triggerにはcron式が設定されている', () => {
    for (const p of pipelines) {
      if (p.trigger.type === 'schedule') {
        expect(p.trigger.cron).toBeTruthy();
        expect(p.trigger.cron!.split(' ')).toHaveLength(5);
      }
    }
  });

  it('event triggerにはeventTypeが設定されている', () => {
    for (const p of pipelines) {
      if (p.trigger.type === 'event') {
        expect(p.trigger.eventType).toBeTruthy();
      }
    }
  });

  it('onFailure戦略がhalt/skip/retry/rollbackのいずれか', () => {
    const validStrategies = ['halt', 'skip', 'retry', 'rollback'];
    for (const p of pipelines) {
      expect(validStrategies).toContain(p.onFailure);
    }
  });

  // チーム別パイプライン確認
  describe('チーム別パイプライン割り当て', () => {
    it('Sales Team: P07-P09 (pricing/promotion/conversion)', () => {
      const salesAgents = ['pricing-agent', 'promotion-agent', 'conversion-agent'];
      for (const id of ['P07', 'P08', 'P09']) {
        const p = getPipelineDefinition(id)!;
        const agents = p.steps.map((s) => s.agentId);
        expect(agents.some((a) => salesAgents.includes(a))).toBe(true);
      }
    });

    it('Engineering Team: P10-P12 (devops/security/performance)', () => {
      const engAgents = ['devops-agent', 'security-agent', 'performance-agent', 'quality-auditor'];
      for (const id of ['P10', 'P11', 'P12']) {
        const p = getPipelineDefinition(id)!;
        const agents = p.steps.map((s) => s.agentId);
        expect(agents.some((a) => engAgents.includes(a))).toBe(true);
      }
    });

    it('Data Team: P13-P15 (analyst/ab-test/insight)', () => {
      const dataAgents = ['data-analyst', 'ab-test-agent', 'insight-agent'];
      for (const id of ['P13', 'P14', 'P15']) {
        const p = getPipelineDefinition(id)!;
        const agents = p.steps.map((s) => s.agentId);
        expect(agents.some((a) => dataAgents.includes(a))).toBe(true);
      }
    });

    it('Support Team: P16 (support-agent)', () => {
      const p = getPipelineDefinition('P16')!;
      expect(p.steps.some((s) => s.agentId === 'support-agent')).toBe(true);
    });

    it('Revenue Team: P17 (data-analyst/insight-agent) — Webhookトリガー', () => {
      const p = getPipelineDefinition('P17')!;
      const agents = p.steps.map((s) => s.agentId);
      expect(agents).toContain('data-analyst');
      expect(agents).toContain('insight-agent');
      expect(p.trigger.type).toBe('event');
      expect(p.trigger.eventType).toBe('webhook.orders.paid');
    });
  });

  // デプロイパイプライン特殊検証
  it('P10デプロイパイプラインはonFailure=haltで安全に停止する', () => {
    const p = getPipelineDefinition('P10')!;
    expect(p.onFailure).toBe('halt');
  });

  it('P10本番デプロイステップはリトライ0（1回限り）', () => {
    const p = getPipelineDefinition('P10')!;
    const prodStep = p.steps.find((s) => s.action === 'deploy_production');
    expect(prodStep).toBeDefined();
    expect(prodStep!.retryCount).toBe(0);
  });

  // ステップ数の合理性チェック
  it('各パイプラインのステップ数が2-5の範囲', () => {
    for (const p of pipelines) {
      expect(p.steps.length).toBeGreaterThanOrEqual(2);
      expect(p.steps.length).toBeLessThanOrEqual(5);
    }
  });

  // タイムアウトの合理性チェック
  it('全ステップのtimeoutが5秒以上5分以下', () => {
    for (const p of pipelines) {
      for (const step of p.steps) {
        expect(step.timeout).toBeGreaterThanOrEqual(5000);
        expect(step.timeout).toBeLessThanOrEqual(300000);
      }
    }
  });
});
