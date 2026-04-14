/**
 * AgentFactory — L2 エージェント工場（骨髄 = 新細胞の生成器）
 *
 * 生体対応: 骨髄（ボーンマロウ）
 * 新しいL2エージェントの動的生成・設定・登録を担当。
 * Commanderからの指令で新エージェントをインスタンス化し、
 * AgentRegistryに登録してシステムに参加させる。
 *
 * 担当タスク: create_agent, clone_agent, reconfigure_agent, decommission_agent
 */

import type {
  AgentId,
  AgentEvent,
  AgentBlueprint,
  CascadeCommand,
  IAgentBus,
} from '../core/types';
import {BaseL2Agent} from './base-l2-agent';

interface CreateAgentResult {
  agentId: string;
  status: 'created' | 'failed';
  blueprint: AgentBlueprint;
  reason?: string;
}

// Blueprint catalog for known agent types
const AGENT_BLUEPRINTS: Record<string, Omit<AgentBlueprint, 'id'>> = {
  'image-generator': {
    agentType: 'ImageGenerator',
    version: '1.0.0',
    config: { maxConcurrent: 3, outputFormat: 'webp' },
    capabilities: ['generate_banner', 'update_banner', 'regenerate_all_banners'],
    dependencies: ['agent-bus'],
    healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 },
  },
  'product-catalog': {
    agentType: 'ProductCatalog',
    version: '1.0.0',
    config: { syncInterval: 300000, batchSize: 50 },
    capabilities: ['update_catalog', 'sync_products', 'audit_catalog'],
    dependencies: ['agent-bus'],
    healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 },
  },
  'ux-agent': {
    agentType: 'UXAgent',
    version: '1.0.0',
    config: { defaultDevice: 'mobile', lighthousePreset: 'perf' },
    capabilities: ['ux_audit', 'ux_test', 'lighthouse_run'],
    dependencies: ['agent-bus'],
    healthCheck: { interval: 30000, timeout: 10000, unhealthyThreshold: 3 },
  },
  'content-writer': {
    agentType: 'ContentWriter',
    version: '1.0.0',
    config: { defaultTone: 'enthusiastic', locale: 'ja-JP' },
    capabilities: ['write_article', 'write_product_desc', 'write_landing_page', 'update_content', 'content_audit'],
    dependencies: ['agent-bus'],
    healthCheck: { interval: 30000, timeout: 15000, unhealthyThreshold: 3 },
  },
  'seo-director': {
    agentType: 'SEODirector',
    version: '1.0.0',
    config: { targetMarket: 'ja-JP', primaryDomain: 'shop.mining-base.co.jp' },
    capabilities: ['keyword_research', 'seo_audit', 'meta_optimize', 'sitemap_update', 'ranking_check'],
    dependencies: ['agent-bus'],
    healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 },
  },
  'quality-auditor': {
    agentType: 'QualityAuditor',
    version: '1.0.0',
    config: { defaultThreshold: 70, autoCheck: true },
    capabilities: ['quality_check', 'banner_review', 'content_review', 'full_audit'],
    dependencies: ['agent-bus'],
    healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 },
  },
};

export class AgentFactory extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'agent-factory',
    name: 'AgentFactory',
    level: 'L2',
    team: 'infrastructure',
    version: '1.0.0',
  };

  private createdAgents: Map<string, AgentBlueprint> = new Map();

  constructor(bus: IAgentBus) {
    super(bus);
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('factory.*');
    this.subscribe('system.agent.request');
  }

  protected async onShutdown(): Promise<void> {
    this.createdAgents.clear();
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'system.agent.request') {
      const payload = event.payload as { agentType: string };
      await this.publishEvent('factory.request.received', {
        agentType: payload.agentType,
        requestFrom: event.source,
      });
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'create_agent':
        return this.createAgent(command.params);

      case 'clone_agent':
        return this.cloneAgent(command.params);

      case 'reconfigure_agent':
        return this.reconfigureAgent(command.params);

      case 'decommission_agent':
        return this.decommissionAgent(command.params);

      case 'list_blueprints':
        return this.listBlueprints();

      default:
        throw new Error(`AgentFactory: unknown action "${command.action}"`);
    }
  }

  // ── Core Operations ──

  private async createAgent(params: Record<string, unknown>): Promise<CreateAgentResult> {
    const agentType = params.agentType as string;
    const customConfig = params.config as Record<string, unknown> | undefined;

    await this.publishEvent('factory.create.started', { agentType });

    const templateBlueprint = AGENT_BLUEPRINTS[agentType];
    if (!templateBlueprint) {
      const emptyBlueprint: AgentBlueprint = {
        id: agentType,
        agentType: '',
        version: '0.0.0',
        config: {},
        capabilities: [],
        dependencies: [],
        healthCheck: {
          interval: 60000,
          timeout: 5000,
          unhealthyThreshold: 3,
        },
      };
      return {
        agentId: agentType,
        status: 'failed',
        blueprint: emptyBlueprint,
        reason: `Unknown agent type: ${agentType}. Available: ${Object.keys(AGENT_BLUEPRINTS).join(', ')}`,
      };
    }

    const blueprint: AgentBlueprint = {
      id: agentType,
      agentType: templateBlueprint.agentType,
      version: templateBlueprint.version,
      capabilities: templateBlueprint.capabilities || [],
      dependencies: templateBlueprint.dependencies || [],
      healthCheck: templateBlueprint.healthCheck,
      config: { ...templateBlueprint.config, ...customConfig },
    };

    this.createdAgents.set(agentType, blueprint);

    await this.publishEvent('factory.create.completed', {
      agentId: agentType,
      blueprint,
    });

    return {
      agentId: agentType,
      status: 'created',
      blueprint,
    };
  }

  private async cloneAgent(params: Record<string, unknown>): Promise<CreateAgentResult> {
    const sourceId = params.sourceId as string;
    const newId = params.newId as string;

    const existing = this.createdAgents.get(sourceId) ?? (AGENT_BLUEPRINTS[sourceId] ? {
      id: sourceId,
      ...AGENT_BLUEPRINTS[sourceId],
    } as AgentBlueprint : undefined);

    if (!existing) {
      return {
        agentId: newId,
        status: 'failed',
        blueprint: {} as AgentBlueprint,
        reason: `Source agent ${sourceId} not found`,
      };
    }

    const cloned: AgentBlueprint = { ...existing, id: newId };
    this.createdAgents.set(newId, cloned);

    return {
      agentId: newId,
      status: 'created',
      blueprint: cloned,
    };
  }

  private async reconfigureAgent(params: Record<string, unknown>): Promise<{ success: boolean; agentId: string }> {
    const agentId = params.agentId as string;
    const newConfig = params.config as Record<string, unknown>;

    const existing = this.createdAgents.get(agentId);
    if (!existing) {
      return { success: false, agentId };
    }

    existing.config = { ...existing.config, ...newConfig };
    this.createdAgents.set(agentId, existing);

    await this.publishEvent('factory.reconfigure.completed', { agentId, config: existing.config });
    return { success: true, agentId };
  }

  private async decommissionAgent(params: Record<string, unknown>): Promise<{ success: boolean; agentId: string }> {
    const agentId = params.agentId as string;

    const removed = this.createdAgents.delete(agentId);

    await this.publishEvent('factory.decommission.completed', { agentId, removed });
    return { success: removed, agentId };
  }

  private async listBlueprints(): Promise<{ available: string[]; created: string[] }> {
    return {
      available: Object.keys(AGENT_BLUEPRINTS),
      created: Array.from(this.createdAgents.keys()),
    };
  }
}
