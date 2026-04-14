/**
 * Admin Store — 中枢神経のシナプス結合
 *
 * NV-10: Zustand ベースの Admin ダッシュボード状態管理
 *
 * 医学メタファー: 大脳皮質のワーキングメモリー
 * ダッシュボード全体の状態を一元管理し、各コンポーネント間で
 * シナプス伝達（状態共有）を即時実現する。
 *
 * 設計:
 * - サーバーサイドで使用不可（クライアント専用）
 * - SSR互換: 初期状態はサーバーから注入、hydration後にZustandに引き継ぎ
 * - 複数スライスに分割可能（agents, pipelines, ui）
 */

// Zustand はクライアント依存のため、型定義とファクトリーパターンで抽象化。
// 実際のstore生成はクライアントコンポーネント内で行う。

import type {AgentStatus, PipelineStatus, SystemMetrics} from '~/types/admin';

// ━━━ 状態型定義 ━━━

export interface AdminUIState {
  /** サイドバー開閉 */
  sidebarOpen: boolean;
  /** 現在のテーマ */
  theme: 'dark' | 'light';
  /** アクティブなタブ（ダッシュボード内） */
  activeTab: string;
  /** モバイル表示かどうか */
  isMobile: boolean;
  /** ローディング状態 */
  isLoading: boolean;
  /** 最後のデータ更新時刻 */
  lastRefresh: number | null;
}

export interface AdminDataState {
  /** エージェント一覧 */
  agents: AgentStatus[];
  /** パイプライン一覧 */
  pipelines: PipelineStatus[];
  /** システムメトリクス */
  metrics: SystemMetrics | null;
  /** アンドンステータス */
  andonStatus: 'green' | 'yellow' | 'red';
}

export interface AdminNotificationState {
  /** 未読通知数 */
  unreadCount: number;
  /** 通知リスト */
  notifications: AdminNotification[];
}

export interface AdminNotification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

export type AdminState = AdminUIState & AdminDataState & AdminNotificationState;

export interface AdminActions {
  // UI
  toggleSidebar: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setActiveTab: (tab: string) => void;
  setMobile: (isMobile: boolean) => void;
  setLoading: (loading: boolean) => void;

  // Data
  setAgents: (agents: AgentStatus[]) => void;
  updateAgent: (id: string, update: Partial<AgentStatus>) => void;
  setPipelines: (pipelines: PipelineStatus[]) => void;
  setMetrics: (metrics: SystemMetrics) => void;
  setAndonStatus: (status: 'green' | 'yellow' | 'red') => void;

  // Notifications
  addNotification: (notification: Omit<AdminNotification, 'id' | 'timestamp' | 'read'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearNotifications: () => void;

  // General
  refresh: () => void;
  reset: () => void;
}

export type AdminStore = AdminState & AdminActions;

// ━━━ 初期状態 ━━━

export const initialAdminState: AdminState = {
  // UI
  sidebarOpen: true,
  theme: 'dark',
  activeTab: 'overview',
  isMobile: false,
  isLoading: false,
  lastRefresh: null,

  // Data
  agents: [],
  pipelines: [],
  metrics: null,
  andonStatus: 'green',

  // Notifications
  unreadCount: 0,
  notifications: [],
};

/**
 * Zustand storeファクトリー（クライアントサイド用）
 *
 * 使用例:
 * ```tsx
 * import { create } from 'zustand';
 * import { createAdminStoreSlice } from '~/lib/admin-store';
 *
 * export const useAdminStore = create<AdminStore>()(
 *   createAdminStoreSlice
 * );
 * ```
 */
export function createAdminStoreSlice(
  set: (partial: Partial<AdminState> | ((state: AdminState) => Partial<AdminState>)) => void,
  get: () => AdminState,
): AdminStore {
  return {
    ...initialAdminState,

    // ━━━ UI Actions ━━━
    toggleSidebar: () => set((s) => ({sidebarOpen: !s.sidebarOpen})),
    setTheme: (theme) => set({theme}),
    setActiveTab: (tab) => set({activeTab: tab}),
    setMobile: (isMobile) => set({isMobile, sidebarOpen: !isMobile}),
    setLoading: (isLoading) => set({isLoading}),

    // ━━━ Data Actions ━━━
    setAgents: (agents) => set({agents}),
    updateAgent: (id, update) =>
      set((s) => ({
        agents: s.agents.map((a) => (a.id === id ? {...a, ...update} : a)),
      })),
    setPipelines: (pipelines) => set({pipelines}),
    setMetrics: (metrics) => set({metrics}),
    setAndonStatus: (status) => set({andonStatus: status}),

    // ━━━ Notification Actions ━━━
    addNotification: (notif) =>
      set((s) => {
        const newNotif: AdminNotification = {
          ...notif,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          read: false,
        };
        return {
          notifications: [newNotif, ...s.notifications].slice(0, 100),
          unreadCount: s.unreadCount + 1,
        };
      }),
    markRead: (id) =>
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.id === id ? {...n, read: true} : n,
        ),
        unreadCount: Math.max(0, s.unreadCount - 1),
      })),
    markAllRead: () =>
      set((s) => ({
        notifications: s.notifications.map((n) => ({...n, read: true})),
        unreadCount: 0,
      })),
    clearNotifications: () => set({notifications: [], unreadCount: 0}),

    // ━━━ General Actions ━━━
    refresh: () => set({lastRefresh: Date.now(), isLoading: true}),
    reset: () => set(initialAdminState),
  };
}
