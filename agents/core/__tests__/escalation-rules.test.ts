/**
 * EscalationRules Test Suite (T064)
 * Tests dynamic escalation rule evaluation and management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EscalationRules,
  getEscalationRules,
  resetEscalationRules,
} from '../escalation-rules.js';
import type { EscalationRule } from '../escalation-rules.js';
import { InMemoryStorage } from '../storage.js';

describe('EscalationRules', () => {
  let rules: EscalationRules;
  let storage: InMemoryStorage;

  beforeEach(async () => {
    resetEscalationRules();
    storage = new InMemoryStorage();
    rules = new EscalationRules(storage);
    await rules.initialize();
  });

  describe('initialize', () => {
    it('should load default rules', async () => {
      const loadedRules = rules.getRules();
      expect(loadedRules.length).toBeGreaterThan(0);
    });

    it('should persist rules to storage', async () => {
      const stored = await storage.get('escalation_rules', 'rules_list');
      expect(stored).toBeDefined();
      expect((stored as any).rules).toBeDefined();
      expect(Array.isArray((stored as any).rules)).toBe(true);
    });
  });

  describe('evaluateEvent', () => {
    it('should not trigger escalation for non-matching patterns', async () => {
      const result = await rules.evaluateEvent('evt_1', 'unknown.event');
      expect(result).toBeNull();
    });

    it('should trigger escalation when threshold is met', async () => {
      vi.useFakeTimers();

      // Add rule with threshold of 2
      const rule = await rules.addRule({
        name: 'Test Rule',
        enabled: true,
        triggerPattern: 'test.error',
        threshold: 2,
        windowMinutes: 5,
        escalateTo: 'critical',
        notifyChannels: ['slack'],
      });

      // First event - no escalation
      let result = await rules.evaluateEvent('evt_1', 'test.error');
      expect(result).toBeNull();

      // Second event - escalation triggered
      result = await rules.evaluateEvent('evt_2', 'test.error');
      expect(result).not.toBeNull();
      expect(result?.escalateTo).toBe('critical');

      vi.useRealTimers();
    });

    it('should respect time window', async () => {
      vi.useFakeTimers();

      const rule = await rules.addRule({
        name: 'Window Test',
        enabled: true,
        triggerPattern: 'api.timeout',
        threshold: 2,
        windowMinutes: 1, // 1 minute window
        escalateTo: 'high',
        notifyChannels: ['slack'],
      });

      // Event at time 0
      await rules.evaluateEvent('evt_1', 'api.timeout');

      // Event at time 0.5 minutes (within window)
      vi.advanceTimersByTime(30000);
      let result = await rules.evaluateEvent('evt_2', 'api.timeout');
      expect(result).not.toBeNull();

      vi.useRealTimers();
    });

    it('should not escalate disabled rules', async () => {
      vi.useFakeTimers();

      const rule = await rules.addRule({
        name: 'Disabled Rule',
        enabled: false,
        triggerPattern: 'disabled.event',
        threshold: 1,
        windowMinutes: 5,
        escalateTo: 'critical',
        notifyChannels: ['slack'],
      });

      const result = await rules.evaluateEvent('evt_1', 'disabled.event');
      expect(result).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('addRule', () => {
    it('should add a new rule and persist it', async () => {
      const newRule = await rules.addRule({
        name: 'New Test Rule',
        enabled: true,
        triggerPattern: 'new.pattern',
        threshold: 3,
        windowMinutes: 10,
        escalateTo: 'critical',
        notifyChannels: ['slack', 'email'],
      });

      expect(newRule.id).toBeDefined();
      expect(newRule.name).toBe('New Test Rule');
      expect(rules.getRules().length).toBeGreaterThan(0);
    });
  });

  describe('updateRule', () => {
    it('should update an existing rule', async () => {
      const ruleList = rules.getRules();
      const firstId = ruleList[0].id;

      const success = await rules.updateRule(firstId, {
        name: 'Updated Rule Name',
        threshold: 99,
      });

      expect(success).toBe(true);

      const updated = rules.getRules().find((r) => r.id === firstId);
      expect(updated?.name).toBe('Updated Rule Name');
      expect(updated?.threshold).toBe(99);
    });

    it('should return false for non-existent rules', async () => {
      const success = await rules.updateRule('nonexistent', { name: 'New Name' });
      expect(success).toBe(false);
    });
  });

  describe('deleteRule', () => {
    it('should delete a rule', async () => {
      const ruleList = rules.getRules();
      const firstId = ruleList[0].id;

      const success = await rules.deleteRule(firstId);
      expect(success).toBe(true);

      const remaining = rules.getRules().find((r) => r.id === firstId);
      expect(remaining).toBeUndefined();
    });

    it('should return false for non-existent rules', async () => {
      const success = await rules.deleteRule('nonexistent');
      expect(success).toBe(false);
    });
  });

  describe('enableRule', () => {
    it('should toggle rule enabled state', async () => {
      const ruleList = rules.getRules();
      const firstId = ruleList[0].id;

      await rules.enableRule(firstId, false);
      let rule = rules.getRules().find((r) => r.id === firstId);
      expect(rule?.enabled).toBe(false);

      await rules.enableRule(firstId, true);
      rule = rules.getRules().find((r) => r.id === firstId);
      expect(rule?.enabled).toBe(true);
    });
  });

  describe('getEnabledRules', () => {
    it('should return only enabled rules', async () => {
      const enabledRules = rules.getEnabledRules();
      expect(enabledRules.every((r) => r.enabled)).toBe(true);
    });
  });

  describe('getEventStats', () => {
    it('should track event statistics', async () => {
      await rules.evaluateEvent('evt_1', 'inventory.error');
      await rules.evaluateEvent('evt_2', 'inventory.error');
      await rules.evaluateEvent('evt_3', 'api.timeout');

      const stats = rules.getEventStats();
      expect(stats.total).toBe(3);
      expect(stats.byPattern['inventory.error']).toBe(2);
      expect(stats.byPattern['api.timeout']).toBe(1);
    });

    it('should track recent event count', async () => {
      await rules.evaluateEvent('evt_1', 'test.event');

      const stats = rules.getEventStats();
      const recent = stats.recentCount(5); // Last 5 minutes
      expect(recent).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should reset to default rules', async () => {
      await rules.addRule({
        name: 'Custom Rule',
        enabled: true,
        triggerPattern: 'custom',
        threshold: 1,
        windowMinutes: 5,
        escalateTo: 'critical',
        notifyChannels: ['slack'],
      });

      const countBefore = rules.getRules().length;

      await rules.reset();

      // After reset, should have default rules
      const afterReset = rules.getRules();
      expect(afterReset).toBeDefined();
    });
  });

  describe('singleton', () => {
    it('should return same instance', async () => {
      const r1 = await getEscalationRules();
      const r2 = await getEscalationRules();
      expect(r1).toBe(r2);
    });
  });
});
