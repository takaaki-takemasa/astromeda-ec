/**
 * Admin Dashboard Type Definitions
 */

export interface AgentStatus {
  id: string;
  name: string;
  level: 'L0' | 'L1' | 'L2';
  team: string;
  status: 'healthy' | 'degraded' | 'error' | 'offline' | 'pending';
  uptime: number;
  errorCount: number;
  lastHeartbeat: number;
  taskQueue: number;
  version: string;
}

export interface PipelineStatus {
  id: string;
  name: string;
  status: 'running' | 'idle' | 'error' | 'paused';
  lastRun: number;
  successRate: number;
  avgDuration: number;
  runsToday: number;
}

export interface SystemMetrics {
  andonStatus: 'green' | 'yellow' | 'red';
  totalAgents: number;
  activeAgents: number;
  healthyAgents: number;
  totalPipelines: number;
  activePipelines: number;
  eventsPerMinute: number;
  cascadesActive: number;
  feedbackRecords: number;
  uptime: number;
}

export interface StorageStats {
  totalRecords: number;
  tables: Record<string, number>;
}

export interface AttributionData {
  totalRevenue: number;
  attributedOrders: number;
  topChannels: Array<{channel: string; revenue: number; orders: number}>;
}

export interface RevenueData {
  totalRevenue: number;
  orderCount: number;
  averageOrderValue: number;
  currency: string;
  isMock: boolean;
}

export interface QuickActionDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'analytics' | 'operations' | 'quality' | 'marketing';
  agentId: string;
}
