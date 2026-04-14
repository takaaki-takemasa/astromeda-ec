/**
 * Agent Registry — エージェント登録・発見サービス（細胞表面マーカー）
 *
 * 生体対応: MHC（主要組織適合遺伝子複合体）+ 細胞表面受容体
 * 各細胞（Agent）が「自分は何者で、何ができるか」を表明し、
 * 他の細胞がそれを発見・認識する仕組み。
 *
 * 機能:
 * - Agent登録・解除（細胞の誕生と死）
 * - 能力ベース検索（受容体マッチング）
 * - 依存関係解決（組織間の連携構造）
 * - バージョン管理（細胞の分化段階）
 */

import type { AgentId, AgentBlueprint, AgentLevel, TeamId, IAgent } from '../core/types.js';

interface RegisteredAgent {
  id: AgentId;
  blueprint: AgentBlueprint;
  instance?: IAgent;
  registeredAt: number;
  status: 'registered' | 'active' | 'inactive' | 'deprecated';
}

export class AgentRegistry {
  private agents = new Map<string, RegisteredAgent>();
  private blueprints = new Map<string, AgentBlueprint>();

  /** Blueprint登録（遺伝子テンプレートの格納） */
  registerBlueprint(blueprint: AgentBlueprint): void {
    this.blueprints.set(blueprint.id, blueprint);
  }

  /** Agent登録（細胞の誕生届） */
  register(id: AgentId, blueprint: AgentBlueprint, instance?: IAgent): void {
    this.agents.set(id.id, {
      id,
      blueprint,
      instance,
      registeredAt: Date.now(),
      status: instance ? 'active' : 'registered',
    });
  }

  /** Agent解除（細胞死） */
  unregister(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'inactive';
    }
  }

  /** Agent取得 */
  get(agentId: string): RegisteredAgent | undefined {
    return this.agents.get(agentId);
  }

  /** インスタンス取得 */
  getInstance(agentId: string): IAgent | undefined {
    return this.agents.get(agentId)?.instance;
  }

  /** レベル別検索（組織階層による分類） */
  getByLevel(level: AgentLevel): RegisteredAgent[] {
    return [...this.agents.values()].filter((a) => a.id.level === level && a.status === 'active');
  }

  /** チーム別検索 */
  getByTeam(team: TeamId): RegisteredAgent[] {
    return [...this.agents.values()].filter((a) => a.id.team === team && a.status === 'active');
  }

  /** 能力ベース検索（受容体マッチング） */
  findByCapability(capability: string): RegisteredAgent[] {
    return [...this.agents.values()].filter(
      (a) => a.status === 'active' && a.blueprint.capabilities.includes(capability)
    );
  }

  /** 依存関係チェック（組織間連携の整合性確認） */
  checkDependencies(agentId: string): { satisfied: boolean; missing: string[] } {
    const agent = this.agents.get(agentId);
    if (!agent) return { satisfied: false, missing: [agentId] };

    const missing = agent.blueprint.dependencies.filter((dep) => {
      const depAgent = this.agents.get(dep);
      return !depAgent || depAgent.status !== 'active';
    });

    return { satisfied: missing.length === 0, missing };
  }

  /** 全依存関係の順序解決（発達順序の決定） */
  resolveDependencyOrder(): string[] {
    const resolved: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error(`Circular dependency detected: ${id}`);

      visiting.add(id);
      const agent = this.agents.get(id);
      if (agent) {
        for (const dep of agent.blueprint.dependencies) {
          visit(dep);
        }
      }
      visiting.delete(id);
      visited.add(id);
      resolved.push(id);
    };

    for (const id of this.agents.keys()) {
      visit(id);
    }

    return resolved;
  }

  /** Blueprint取得 */
  getBlueprint(blueprintId: string): AgentBlueprint | undefined {
    return this.blueprints.get(blueprintId);
  }

  /** 全Agent一覧 */
  listAll(): RegisteredAgent[] {
    return [...this.agents.values()];
  }

  /** アクティブAgent数 */
  getActiveCount(): number {
    return [...this.agents.values()].filter((a) => a.status === 'active').length;
  }

  /** 統計 */
  getStats() {
    const all = [...this.agents.values()];
    return {
      total: all.length,
      active: all.filter((a) => a.status === 'active').length,
      registered: all.filter((a) => a.status === 'registered').length,
      inactive: all.filter((a) => a.status === 'inactive').length,
      blueprints: this.blueprints.size,
      byLevel: {
        L0: all.filter((a) => a.id.level === 'L0').length,
        L1: all.filter((a) => a.id.level === 'L1').length,
        L2: all.filter((a) => a.id.level === 'L2').length,
        Infra: all.filter((a) => a.id.level === 'Infra').length,
        Registry: all.filter((a) => a.id.level === 'Registry').length,
      },
    };
  }
}
