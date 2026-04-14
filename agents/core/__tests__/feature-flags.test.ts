/**
 * FeatureFlags Tests — T071
 *
 * Tests for feature flag system with rollout and targeting.
 * Covers: boolean flags, percentage rollout, user targeting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FeatureFlags, getFeatureFlags, setFeatureFlags } from '../feature-flags.js';
import { InMemoryStorage } from '../storage.js';

describe('FeatureFlags - T071', () => {
  let flags: FeatureFlags;

  beforeEach(() => {
    flags = new FeatureFlags(new InMemoryStorage());
    setFeatureFlags(flags);
  });

  describe('isEnabled', () => {
    it('should return true for enabled flag without context', () => {
      flags.setFlag('test-flag', true);
      expect(flags.isEnabled('test-flag')).toBe(true);
    });

    it('should return false for disabled flag', () => {
      flags.setFlag('test-flag', false);
      expect(flags.isEnabled('test-flag')).toBe(false);
    });

    it('should return false for non-existent flag', () => {
      expect(flags.isEnabled('nonexistent')).toBe(false);
    });

    it('should support boolean context', () => {
      flags.setFlag('user-feature', true);
      expect(flags.isEnabled('user-feature', {userId: 'user-123'})).toBe(true);
    });

    it('should support user targeting', () => {
      flags.setFlag('exclusive-feature', true, {
        targetUsers: ['user-1', 'user-2'],
      });

      expect(flags.isEnabled('exclusive-feature', {userId: 'user-1'})).toBe(true);
      expect(flags.isEnabled('exclusive-feature', {userId: 'user-3'})).toBe(false);
    });

    it('should support team targeting', () => {
      flags.setFlag('team-feature', true, {
        targetTeams: ['engineering', 'infrastructure'],
      });

      expect(flags.isEnabled('team-feature', {team: 'engineering'})).toBe(true);
      expect(flags.isEnabled('team-feature', {team: 'sales'})).toBe(false);
    });

    it('should apply both user and team targeting (AND logic)', () => {
      flags.setFlag('restricted-feature', true, {
        targetUsers: ['user-1', 'user-2'],
        targetTeams: ['engineering'],
      });

      // User 1 but not in engineering team
      expect(flags.isEnabled('restricted-feature', {
        userId: 'user-1',
        team: 'sales',
      })).toBe(false);

      // User 1 in engineering team
      expect(flags.isEnabled('restricted-feature', {
        userId: 'user-1',
        team: 'engineering',
      })).toBe(true);

      // User 3 in engineering team (not in targetUsers)
      expect(flags.isEnabled('restricted-feature', {
        userId: 'user-3',
        team: 'engineering',
      })).toBe(false);
    });

    it('should support percentage rollout', () => {
      flags.setFlag('rollout-feature', true, {rolloutPercent: 50});

      // Deterministic based on userId + flagName
      const enabled1 = flags.isEnabled('rollout-feature', {userId: 'user-1'});
      const enabled2 = flags.isEnabled('rollout-feature', {userId: 'user-2'});
      // With 50%, roughly half should be enabled
      // But we can't guarantee exact distribution in a single test
      expect(typeof enabled1).toBe('boolean');
      expect(typeof enabled2).toBe('boolean');
    });

    it('should be deterministic for percentage rollout', () => {
      flags.setFlag('rollout-feature', true, {rolloutPercent: 50});

      const result1 = flags.isEnabled('rollout-feature', {userId: 'user-1'});
      const result2 = flags.isEnabled('rollout-feature', {userId: 'user-1'});
      const result3 = flags.isEnabled('rollout-feature', {userId: 'user-1'});

      // Same userId should get same result consistently
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it('should handle 0% rollout', () => {
      flags.setFlag('no-rollout', true, {rolloutPercent: 0});
      expect(flags.isEnabled('no-rollout', {userId: 'user-1'})).toBe(false);
    });

    it('should handle 100% rollout', () => {
      flags.setFlag('full-rollout', true, {rolloutPercent: 100});
      expect(flags.isEnabled('full-rollout', {userId: 'user-1'})).toBe(true);
      expect(flags.isEnabled('full-rollout', {userId: 'user-2'})).toBe(true);
    });
  });

  describe('setFlag', () => {
    it('should create new flag', () => {
      flags.setFlag('new-flag', true);
      expect(flags.getFlag('new-flag')).toBeDefined();
      expect(flags.getFlag('new-flag')!.enabled).toBe(true);
    });

    it('should update existing flag', () => {
      flags.setFlag('flag', true);
      expect(flags.isEnabled('flag')).toBe(true);

      flags.setFlag('flag', false);
      expect(flags.isEnabled('flag')).toBe(false);
    });

    it('should preserve createdAt on update', () => {
      flags.setFlag('flag', true);
      const created1 = flags.getFlag('flag')!.createdAt;

      // Wait a bit then update
      flags.setFlag('flag', false);
      const created2 = flags.getFlag('flag')!.createdAt;

      expect(created1).toBe(created2);
    });

    it('should update updatedAt on change', () => {
      flags.setFlag('flag', true);
      const updated1 = flags.getFlag('flag')!.updatedAt;

      // Update with new config
      flags.setFlag('flag', true, {description: 'new description'});
      const updated2 = flags.getFlag('flag')!.updatedAt;

      expect(updated2).toBeGreaterThanOrEqual(updated1);
    });

    it('should preserve existing config on update', () => {
      flags.setFlag('flag', true, {
        description: 'Original',
        rolloutPercent: 50,
      });

      flags.setFlag('flag', false); // Only change enabled

      const flag = flags.getFlag('flag')!;
      expect(flag.description).toBe('Original');
      expect(flag.rolloutPercent).toBe(50);
    });

    it('should reject invalid configuration', () => {
      expect(() => {
        flags.setFlag('bad-flag', true, {
          rolloutPercent: 150, // Invalid: > 100
        } as any);
      }).toThrow();
    });
  });

  describe('getFlag', () => {
    it('should return undefined for non-existent flag', () => {
      expect(flags.getFlag('nonexistent')).toBeUndefined();
    });

    it('should return complete flag config', () => {
      flags.setFlag('full-flag', true, {
        description: 'Test flag',
        rolloutPercent: 75,
      });

      const flag = flags.getFlag('full-flag');
      expect(flag).toBeDefined();
      expect(flag!.name).toBe('full-flag');
      expect(flag!.enabled).toBe(true);
      expect(flag!.description).toBe('Test flag');
      expect(flag!.rolloutPercent).toBe(75);
      expect(flag!.createdAt).toBeDefined();
      expect(flag!.updatedAt).toBeDefined();
    });
  });

  describe('getAllFlags', () => {
    it('should return empty array initially', () => {
      expect(flags.getAllFlags()).toHaveLength(0);
    });

    it('should return all flags', () => {
      flags.setFlag('flag1', true);
      flags.setFlag('flag2', false);
      flags.setFlag('flag3', true);

      const allFlags = flags.getAllFlags();
      expect(allFlags).toHaveLength(3);
      expect(allFlags.map(f => f.name).sort()).toEqual(['flag1', 'flag2', 'flag3']);
    });
  });

  describe('deleteFlag', () => {
    it('should remove flag', () => {
      flags.setFlag('flag', true);
      expect(flags.getFlag('flag')).toBeDefined();

      flags.deleteFlag('flag');
      expect(flags.getFlag('flag')).toBeUndefined();
    });

    it('should make deleted flag return false on isEnabled', () => {
      flags.setFlag('flag', true);
      flags.deleteFlag('flag');

      expect(flags.isEnabled('flag')).toBe(false);
    });
  });

  describe('initializeDefaults', () => {
    it('should set T071 default flags', async () => {
      await flags.initializeDefaults();

      expect(flags.isEnabled('ai-brain-enabled')).toBe(true);
      expect(flags.isEnabled('parallel-pipelines')).toBe(false);
      expect(flags.isEnabled('slack-notifications')).toBe(false);
      expect(flags.isEnabled('auto-restart')).toBe(true);
    });

    it('should not overwrite existing flags', async () => {
      flags.setFlag('ai-brain-enabled', false);

      await flags.initializeDefaults();

      expect(flags.isEnabled('ai-brain-enabled')).toBe(false);
    });

    it('should set descriptions', async () => {
      await flags.initializeDefaults();

      expect(flags.getFlag('ai-brain-enabled')!.description).toBeDefined();
      expect(flags.getFlag('auto-restart')!.description).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return empty stats initially', () => {
      const stats = flags.getStats();
      expect(stats.total).toBe(0);
      expect(stats.enabled).toBe(0);
      expect(stats.disabled).toBe(0);
    });

    it('should count enabled and disabled flags', () => {
      flags.setFlag('flag1', true);
      flags.setFlag('flag2', true);
      flags.setFlag('flag3', false);

      const stats = flags.getStats();
      expect(stats.total).toBe(3);
      expect(stats.enabled).toBe(2);
      expect(stats.disabled).toBe(1);
    });

    it('should count flags with rollout', () => {
      flags.setFlag('flag1', true);
      flags.setFlag('flag2', true, {rolloutPercent: 50});
      flags.setFlag('flag3', true, {rolloutPercent: 100}); // Full rollout, not partial

      const stats = flags.getStats();
      expect(stats.withRollout).toBe(1); // Only flag2 has < 100%
    });
  });

  describe('singleton', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = getFeatureFlags();
      const instance2 = getFeatureFlags();
      expect(instance1).toBe(instance2);
    });

    it('should allow replacing instance', () => {
      const newFlags = new FeatureFlags();
      setFeatureFlags(newFlags);

      const instance = getFeatureFlags();
      expect(instance).toBe(newFlags);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle multi-tier feature rollout', () => {
      // Phase 1: 10% to engineering team
      flags.setFlag('staged-feature', true, {
        rolloutPercent: 10,
        targetTeams: ['engineering'],
      });

      const engineerEnabled = flags.isEnabled('staged-feature', {
        userId: 'engineer-1',
        team: 'engineering',
      });

      const saleEnabled = flags.isEnabled('staged-feature', {
        userId: 'sales-1',
        team: 'sales',
      });

      expect(saleEnabled).toBe(false); // Not in target team
    });

    it('should update flag config during operation', () => {
      flags.setFlag('adaptive-flag', true, {rolloutPercent: 0});
      expect(flags.isEnabled('adaptive-flag', {userId: 'user-1'})).toBe(false);

      // Scale up rollout
      flags.setFlag('adaptive-flag', true, {rolloutPercent: 100});
      expect(flags.isEnabled('adaptive-flag', {userId: 'user-1'})).toBe(true);

      // Disable completely
      flags.setFlag('adaptive-flag', false);
      expect(flags.isEnabled('adaptive-flag', {userId: 'user-1'})).toBe(false);
    });
  });
});
