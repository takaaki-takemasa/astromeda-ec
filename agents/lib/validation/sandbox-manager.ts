/**
 * Sandbox Manager — Phase 7, G-037
 *
 * Creates isolated test environments (in-memory for now)
 * Features:
 *   - Sandbox creation/destruction
 *   - PII sanitization
 *   - Baseline metric capture
 */

import type { SandboxConfig, SandboxBaseline } from './types';
import { descriptiveStats } from './statistical-engine';
import { createLogger } from '../../core/logger.js';

const log = createLogger('sandbox-manager');


export interface SandboxState {
  id: string;
  config: SandboxConfig;
  baseline?: SandboxBaseline;
  startedAt: number;
  endedAt?: number;
  isActive: boolean;
  memoryUsage: number;
}

export class SandboxManager {
  private sandboxes: Map<string, SandboxState> = new Map();
  private dataStore: Map<string, unknown> = new Map();
  private readonly MAX_SANDBOXES = 10;

  /**
   * Create a new sandbox
   */
  createSandbox(config: SandboxConfig): string {
    if (this.sandboxes.size >= this.MAX_SANDBOXES) {
      // Clean up oldest inactive sandbox
      let oldest: [string, SandboxState] | null = null;
      for (const entry of this.sandboxes) {
        if (!entry[1].isActive && (!oldest || entry[1].startedAt < oldest[1].startedAt)) {
          oldest = entry;
        }
      }
      if (oldest) {
        this.sandboxes.delete(oldest[0]);
      }
    }

    const state: SandboxState = {
      id: config.id,
      config,
      startedAt: Date.now(),
      isActive: true,
      memoryUsage: 0,
    };

    this.sandboxes.set(config.id, state);

    if (config.captureBaseline) {
      this.takeBaseline(config.id);
    }

    log.info(`[SandboxManager] Created sandbox "${config.id}"`);
    return config.id;
  }

  /**
   * Destroy a sandbox
   */
  destroySandbox(id: string): boolean {
    const state = this.sandboxes.get(id);
    if (!state) {
      return false;
    }

    state.isActive = false;
    state.endedAt = Date.now();

    // Clean up any data associated with this sandbox
    const keysToDelete: string[] = [];
    for (const key of this.dataStore.keys()) {
      if (key.startsWith(`${id}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.dataStore.delete(key);
    }

    log.info(`[SandboxManager] Destroyed sandbox "${id}"`);
    return true;
  }

  /**
   * Sanitize PII from data
   * Masks emails, phone numbers, names, etc.
   */
  sanitizeData(data: unknown): unknown {
    if (typeof data === 'string') {
      // Email
      let sanitized = data.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
      // Phone (JP format)
      sanitized = sanitized.replace(/\d{2,4}-?\d{3,4}-?\d{4}/g, '[PHONE]');
      // Numbers that look like IDs (10+ digits)
      sanitized = sanitized.replace(/\d{10,}/g, '[ID]');
      return sanitized;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeData(item));
    }

    if (data && typeof data === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        // Skip sensitive field names
        if (
          key.toLowerCase().includes('password') ||
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('key')
        ) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeData(value);
        }
      }
      return sanitized;
    }

    return data;
  }

  /**
   * Capture baseline metrics for a sandbox
   */
  takeBaseline(id: string): SandboxBaseline | null {
    const state = this.sandboxes.get(id);
    if (!state) {
      return null;
    }

    // Simulate baseline capture (in real impl, would measure actual system metrics)
    const baseline: SandboxBaseline = {
      id: `baseline-${id}-${Date.now()}`,
      cpuUsage: Math.random() * 30, // 0-30%
      memoryUsage: Math.random() * 100, // 0-100MB
      latency: Math.random() * 50 + 10, // 10-60ms
      errorRate: Math.random() * 0.02, // 0-2%
      throughput: Math.random() * 1000 + 500, // 500-1500 ops/sec
      capturedAt: Date.now(),
    };

    state.baseline = baseline;
    return baseline;
  }

  /**
   * Store data in sandbox (for simulation purposes)
   */
  storeData(sandboxId: string, key: string, value: unknown): void {
    const state = this.sandboxes.get(sandboxId);
    if (!state) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    const fullKey = `${sandboxId}:${key}`;
    this.dataStore.set(fullKey, this.sanitizeData(value));
  }

  /**
   * Retrieve data from sandbox
   */
  getData(sandboxId: string, key: string): unknown {
    const state = this.sandboxes.get(sandboxId);
    if (!state) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    const fullKey = `${sandboxId}:${key}`;
    return this.dataStore.get(fullKey);
  }

  /**
   * Get sandbox state
   */
  getSandbox(id: string): SandboxState | null {
    return this.sandboxes.get(id) || null;
  }

  /**
   * List all active sandboxes
   */
  getActiveSandboxes(): SandboxState[] {
    return Array.from(this.sandboxes.values()).filter((s) => s.isActive);
  }

  /**
   * Compare metrics against baseline
   */
  compareToBaseline(
    id: string,
    currentMetrics: {
      cpuUsage: number;
      memoryUsage: number;
      latency: number;
      errorRate: number;
      throughput: number;
    },
  ): {
    regressions: string[];
    improvements: string[];
  } {
    const state = this.sandboxes.get(id);
    if (!state || !state.baseline) {
      return { regressions: [], improvements: [] };
    }

    const baseline = state.baseline;
    const regressions: string[] = [];
    const improvements: string[] = [];

    // CPU usage should not increase > 50%
    if (currentMetrics.cpuUsage > baseline.cpuUsage * 1.5) {
      regressions.push(
        `CPU usage increased from ${baseline.cpuUsage.toFixed(1)}% to ${currentMetrics.cpuUsage.toFixed(1)}%`,
      );
    }

    // Memory usage should not increase > 50%
    if (currentMetrics.memoryUsage > baseline.memoryUsage * 1.5) {
      regressions.push(
        `Memory usage increased from ${baseline.memoryUsage.toFixed(1)}MB to ${currentMetrics.memoryUsage.toFixed(1)}MB`,
      );
    }

    // Latency should not increase > 25%
    if (currentMetrics.latency > baseline.latency * 1.25) {
      regressions.push(
        `Latency increased from ${baseline.latency.toFixed(1)}ms to ${currentMetrics.latency.toFixed(1)}ms`,
      );
    }

    // Error rate should not increase
    if (currentMetrics.errorRate > baseline.errorRate + 0.01) {
      regressions.push(
        `Error rate increased from ${(baseline.errorRate * 100).toFixed(2)}% to ${(currentMetrics.errorRate * 100).toFixed(2)}%`,
      );
    }

    // Throughput should not decrease > 25%
    if (currentMetrics.throughput < baseline.throughput * 0.75) {
      improvements.push(
        `⚠️ Throughput decreased from ${baseline.throughput.toFixed(0)} to ${currentMetrics.throughput.toFixed(0)} ops/sec`,
      );
    } else if (currentMetrics.throughput > baseline.throughput * 1.1) {
      improvements.push(
        `✅ Throughput improved from ${baseline.throughput.toFixed(0)} to ${currentMetrics.throughput.toFixed(0)} ops/sec`,
      );
    }

    return { regressions, improvements };
  }

  /**
   * Cleanup all sandboxes
   */
  cleanupAll(): number {
    const count = this.sandboxes.size;
    this.sandboxes.clear();
    this.dataStore.clear();
    log.info(`[SandboxManager] Cleaned up ${count} sandboxes`);
    return count;
  }

  /**
   * Health check
   */
  getHealth(): {
    activeSandboxes: number;
    totalSandboxes: number;
    dataItems: number;
  } {
    const active = Array.from(this.sandboxes.values()).filter((s) => s.isActive).length;
    return {
      activeSandboxes: active,
      totalSandboxes: this.sandboxes.size,
      dataItems: this.dataStore.size,
    };
  }
}
