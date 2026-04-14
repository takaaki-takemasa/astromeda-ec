/**
 * DB Adapter — Storage↔Drizzle ORM ブリッジ（幹細胞分化装置）
 *
 * 医学メタファー: 幹細胞は未分化の万能細胞。
 * InMemoryStorage（幹細胞）から特定のテーブル操作（分化細胞）への変換レイヤー。
 *
 * 設計:
 * - InMemoryStorage を Drizzle スキーマ型で型安全にラップ
 * - 将来のPostgreSQL移行時にこのレイヤーだけ差し替え
 * - 監査証跡を自動記録（免疫記憶）
 */

import type { IStorageAdapter, StorageRecord, StorageQuery } from '../../core/storage.js';
import { getStorage, TABLES } from '../../core/storage.js';
import type {
  NewAgentConfig, AgentConfig,
  NewSystemSettings, SystemSettings,
  NewNotificationLog, NotificationLog,
  NewCronSchedule, CronSchedule,
  NewShopifySyncLog, ShopifySyncLog,
  NewAuditTrail, AuditTrail,
  NewAgentHealthLog,
  NewFeedbackHistory,
  NewApprovalQueue,
  NewPipelineExecutionLog,
} from './schema.js';
import { ALL_TABLES } from './schema.js';

// ─── ヘルパー: DB型 ↔ StorageRecord 変換 ───

function toStorageRecord(table: string, data: Record<string, unknown>): StorageRecord {
  const id = (data.id as string) || `${table}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    ...data,
    id: String(id),
    createdAt: data.createdAt instanceof Date
      ? data.createdAt.getTime()
      : (data.createdAt as number) || Date.now(),
    updatedAt: Date.now(),
  };
}

function fromStorageRecord<T>(record: StorageRecord): T {
  return record as unknown as T;
}

// ─── テーブル別リポジトリ ───

/**
 * 汎用リポジトリ — CRUD操作の共通実装
 * 医学メタファー: 細胞の基本機能（増殖、代謝、修復）
 */
export class Repository<TInsert extends Record<string, unknown>, TSelect> {
  constructor(
    private readonly tableName: string,
    private readonly storage: IStorageAdapter = getStorage(),
  ) {}

  async create(data: TInsert): Promise<string> {
    const record = toStorageRecord(this.tableName, data);
    await this.storage.put(this.tableName, record);
    return record.id;
  }

  async upsert(data: TInsert & { id?: string }): Promise<string> {
    const record = toStorageRecord(this.tableName, data);
    await this.storage.upsert(this.tableName, record);
    return record.id;
  }

  async findById(id: string): Promise<TSelect | null> {
    const record = await this.storage.get(this.tableName, id);
    return record ? fromStorageRecord<TSelect>(record) : null;
  }

  async findOne(where: Record<string, unknown>): Promise<TSelect | null> {
    const results = await this.storage.query(this.tableName, { where, limit: 1 });
    return results.length > 0 ? fromStorageRecord<TSelect>(results[0]) : null;
  }

  async findMany(query: StorageQuery = {}): Promise<TSelect[]> {
    const records = await this.storage.query(this.tableName, query);
    return records.map((r) => fromStorageRecord<TSelect>(r));
  }

  async count(query?: StorageQuery): Promise<number> {
    return this.storage.count(this.tableName, query);
  }

  async delete(id: string): Promise<boolean> {
    return this.storage.delete(this.tableName, id);
  }

  async purge(olderThan: number): Promise<number> {
    return this.storage.purge(this.tableName, olderThan);
  }
}

// ─── 特化リポジトリ（臓器別） ───

/**
 * AgentConfigRepository — DNA管理
 * エージェント設定の永続化と検索
 */
export class AgentConfigRepository extends Repository<NewAgentConfig, AgentConfig> {
  constructor(storage?: IStorageAdapter) {
    super(ALL_TABLES.AGENT_CONFIG, storage);
  }

  async findByAgentId(agentId: string): Promise<AgentConfig | null> {
    return this.findOne({ agentId });
  }

  async findByLevel(level: string): Promise<AgentConfig[]> {
    return this.findMany({ where: { level } });
  }

  async findEnabled(): Promise<AgentConfig[]> {
    return this.findMany({ where: { enabled: true } });
  }

  async updateConfig(agentId: string, config: Partial<NewAgentConfig>): Promise<void> {
    const existing = await this.findByAgentId(agentId);
    if (existing) {
      await this.upsert({ ...existing, ...config, id: existing.id } as NewAgentConfig & { id: string });
    }
  }
}

/**
 * CronScheduleRepository — 松果体リズム管理
 */
export class CronScheduleRepository extends Repository<NewCronSchedule, CronSchedule> {
  constructor(storage?: IStorageAdapter) {
    super(ALL_TABLES.CRON_SCHEDULE, storage);
  }

  async findDueSchedules(now: Date = new Date()): Promise<CronSchedule[]> {
    const all = await this.findMany({ where: { enabled: true } });
    return all.filter((s) => {
      if (!s.nextRunAt) return true; // 未実行スケジュールは即実行対象
      return new Date(s.nextRunAt) <= now;
    });
  }

  async findByAgent(agentId: string): Promise<CronSchedule[]> {
    return this.findMany({ where: { agentId } });
  }

  async recordRun(scheduleId: string, status: string, durationMs: number, nextRunAt: Date): Promise<void> {
    const schedule = await this.findOne({ scheduleId });
    if (schedule) {
      await this.upsert({
        ...schedule,
        id: schedule.id,
        lastRunAt: new Date(),
        lastRunStatus: status,
        lastRunDurationMs: durationMs,
        nextRunAt,
        consecutiveFailures: status === 'success' ? 0 : (schedule.consecutiveFailures || 0) + 1,
      } as NewCronSchedule & { id: string | number });
    }
  }
}

/**
 * NotificationLogRepository — 感覚神経ログ
 */
export class NotificationLogRepository extends Repository<NewNotificationLog, NotificationLog> {
  constructor(storage?: IStorageAdapter) {
    super(ALL_TABLES.NOTIFICATION_LOG, storage);
  }

  async findByChannel(channel: string, limit = 50): Promise<NotificationLog[]> {
    return this.findMany({ where: { channel }, limit });
  }

  async findUnread(recipientId: string): Promise<NotificationLog[]> {
    const all = await this.findMany({ where: { recipientId } });
    return all.filter((n) => n.status !== 'read');
  }

  async markRead(notificationId: string): Promise<void> {
    const notification = await this.findOne({ notificationId });
    if (notification) {
      await this.upsert({
        ...notification,
        id: notification.id,
        status: 'read',
        readAt: new Date(),
      } as NewNotificationLog & { id: string | number });
    }
  }
}

/**
 * ShopifySyncLogRepository — 臍帯接続ログ
 */
export class ShopifySyncLogRepository extends Repository<NewShopifySyncLog, ShopifySyncLog> {
  constructor(storage?: IStorageAdapter) {
    super(ALL_TABLES.SHOPIFY_SYNC_LOG, storage);
  }

  async findByResource(resourceType: string, limit = 50): Promise<ShopifySyncLog[]> {
    return this.findMany({ where: { resourceType }, limit });
  }

  async findFailures(limit = 20): Promise<ShopifySyncLog[]> {
    const all = await this.findMany({ where: { status: 'failure' }, limit });
    return all;
  }

  async getRecentSyncStats(): Promise<{
    total: number; success: number; failure: number; avgDurationMs: number;
  }> {
    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const recent = await this.findMany({ since: last24h });
    const success = recent.filter((s) => s.status === 'success').length;
    const failure = recent.filter((s) => s.status === 'failure').length;
    const durations = recent.filter((s) => s.durationMs).map((s) => s.durationMs!);
    const avgDurationMs = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    return { total: recent.length, success, failure, avgDurationMs };
  }
}

/**
 * AuditTrailRepository — 免疫記憶
 */
export class AuditTrailRepository extends Repository<NewAuditTrail, AuditTrail> {
  constructor(storage?: IStorageAdapter) {
    super(ALL_TABLES.AUDIT_TRAIL, storage);
  }

  async log(entry: Omit<NewAuditTrail, 'trailId'>): Promise<string> {
    const trailId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return this.create({ ...entry, trailId } as NewAuditTrail);
  }

  async findByActor(actorType: string, actorId: string, limit = 50): Promise<AuditTrail[]> {
    return this.findMany({ where: { actorType, actorId }, limit });
  }

  async findByTarget(targetType: string, targetId: string, limit = 50): Promise<AuditTrail[]> {
    return this.findMany({ where: { targetType, targetId }, limit });
  }

  async findHighRisk(limit = 20): Promise<AuditTrail[]> {
    const all = await this.findMany({ limit: 200 });
    return all.filter((a) => a.riskLevel === 'high' || a.riskLevel === 'critical').slice(0, limit);
  }
}

/**
 * SystemSettingsRepository — 視床下部
 */
export class SystemSettingsRepository extends Repository<NewSystemSettings, SystemSettings> {
  constructor(storage?: IStorageAdapter) {
    super(ALL_TABLES.SYSTEM_SETTINGS, storage);
  }

  async get(key: string): Promise<unknown | null> {
    const setting = await this.findOne({ key });
    return setting?.value ?? null;
  }

  async set(key: string, value: unknown, category: string, description?: string, updatedBy?: string): Promise<void> {
    const existing = await this.findOne({ key });
    if (existing) {
      await this.upsert({
        ...existing, id: existing.id, value, category, description, updatedBy,
      } as NewSystemSettings & { id: string | number });
    } else {
      await this.create({ key, value, category, description, updatedBy } as NewSystemSettings);
    }
  }

  async getByCategory(category: string): Promise<SystemSettings[]> {
    return this.findMany({ where: { category } });
  }
}

// ─── DB ファサード（全臓器のアクセスポイント） ───

let dbInstance: DB | null = null;

/**
 * DB — 全リポジトリへのシングルアクセスポイント
 * 医学メタファー: 中枢神経系のような統合インターフェース
 */
export class DB {
  readonly agentConfig: AgentConfigRepository;
  readonly cronSchedule: CronScheduleRepository;
  readonly notificationLog: NotificationLogRepository;
  readonly shopifySyncLog: ShopifySyncLogRepository;
  readonly auditTrail: AuditTrailRepository;
  readonly systemSettings: SystemSettingsRepository;
  // 既存テーブル用汎用リポジトリ
  readonly agentHealthLog: Repository<NewAgentHealthLog, Record<string, unknown>>;
  readonly feedbackHistory: Repository<NewFeedbackHistory, Record<string, unknown>>;
  readonly approvalQueue: Repository<NewApprovalQueue, Record<string, unknown>>;
  readonly pipelineExecutionLog: Repository<NewPipelineExecutionLog, Record<string, unknown>>;

  constructor(storage?: IStorageAdapter) {
    const s = storage || getStorage();
    this.agentConfig = new AgentConfigRepository(s);
    this.cronSchedule = new CronScheduleRepository(s);
    this.notificationLog = new NotificationLogRepository(s);
    this.shopifySyncLog = new ShopifySyncLogRepository(s);
    this.auditTrail = new AuditTrailRepository(s);
    this.systemSettings = new SystemSettingsRepository(s);
    this.agentHealthLog = new Repository(ALL_TABLES.AGENT_HEALTH_LOG, s);
    this.feedbackHistory = new Repository(ALL_TABLES.FEEDBACK_HISTORY, s);
    this.approvalQueue = new Repository(ALL_TABLES.APPROVAL_QUEUE, s);
    this.pipelineExecutionLog = new Repository(ALL_TABLES.PIPELINE_EXECUTION_LOG, s);
  }
}

/**
 * DB シングルトン取得
 */
export function getDB(storage?: IStorageAdapter): DB {
  if (!dbInstance || storage) {
    dbInstance = new DB(storage);
  }
  return dbInstance;
}

/** DB インスタンスリセット（テスト用） */
export function resetDB(): void {
  dbInstance = null;
}
