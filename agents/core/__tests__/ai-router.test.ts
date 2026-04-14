/**
 * AIRouter テスト — 47エージェントのAI層別ルーティング検証
 */

import { describe, it, expect } from 'vitest';
import { AIRouter, getAIRouter } from '../ai-router.js';
import type { ModelConfig } from '../ai-router.js';

describe('AIRouter', () => {
  let router: AIRouter;

  beforeEach(() => {
    router = new AIRouter();
  });

  describe('Tier A agents (highest priority)', () => {
    it('should have commander with Claude Sonnet primary', () => {
      const config = router.getModel('commander');

      expect(config).toBeDefined();
      expect(config?.provider).toBe('claude');
      expect(config?.model).toContain('claude-sonnet');
      expect(config?.tier).toBe('A');
    });

    it('should have l0-navigator with Claude Sonnet', () => {
      const config = router.getModel('l0-navigator');

      expect(config?.provider).toBe('claude');
      expect(config?.model).toContain('claude-sonnet');
      expect(config?.tier).toBe('A');
    });

    it('should have fallback to Gemini Pro for Tier A', () => {
      const fallback = router.getFallbackModel('commander');

      expect(fallback).toBeDefined();
      expect(fallback?.provider).toBe('gemini');
      expect(fallback?.model).toContain('gemini-2.0-pro');
    });

    it('should have acquisition-lead in Tier A', () => {
      const config = router.getModel('acquisition-lead');

      expect(config?.provider).toBe('claude');
      expect(config?.tier).toBe('A');
    });

    it('should have conversion-lead in Tier A', () => {
      const config = router.getModel('conversion-lead');

      expect(config?.provider).toBe('claude');
      expect(config?.tier).toBe('A');
    });

    it('should have ltv-lead in Tier A', () => {
      const config = router.getModel('ltv-lead');

      expect(config?.provider).toBe('claude');
      expect(config?.tier).toBe('A');
    });

    it('should have quality-auditor in Tier A', () => {
      const config = router.getModel('quality-auditor');

      expect(config?.provider).toBe('claude');
      expect(config?.tier).toBe('A');
    });

    it('should have security-guardian in Tier A', () => {
      const config = router.getModel('security-guardian');

      expect(config?.provider).toBe('claude');
      expect(config?.tier).toBe('A');
    });

    it('should have performance-optimizer in Tier A', () => {
      const config = router.getModel('performance-optimizer');

      expect(config?.provider).toBe('claude');
      expect(config?.tier).toBe('A');
    });
  });

  describe('Tier B agents (high priority)', () => {
    it('should have acquisition-l2 with Claude Haiku', () => {
      const config = router.getModel('acquisition-l2');

      expect(config?.provider).toBe('claude');
      expect(config?.model).toContain('claude-haiku');
      expect(config?.tier).toBe('B');
    });

    it('should have Gemini Flash as fallback for Tier B', () => {
      const fallback = router.getFallbackModel('acquisition-l2');

      expect(fallback?.provider).toBe('gemini');
      expect(fallback?.model).toContain('gemini-2.0-flash');
    });

    it('should have data-analyst in Tier B', () => {
      const config = router.getModel('data-analyst');

      expect(config?.provider).toBe('claude');
      expect(config?.tier).toBe('B');
    });

    it('should have budget-planner in Tier B', () => {
      const config = router.getModel('budget-planner');

      expect(config?.provider).toBe('claude');
      expect(config?.tier).toBe('B');
    });

    it('should have 14 Tier B agents total', () => {
      const tierBAgents = [
        'acquisition-l2',
        'conversion-l2',
        'ltv-l2',
        'intelligence-lead',
        'product-lead',
        'marketing-lead',
        'content-optimizer',
        'image-generator',
        'data-analyst',
        'sentiment-analyzer',
        'trend-detector',
        'budget-planner',
        'forecast-agent',
        'compliance-checker',
      ];

      for (const agentId of tierBAgents) {
        const config = router.getModel(agentId);
        expect(config?.tier).toBe('B');
      }
    });
  });

  describe('Tier C agents (medium priority, Gemini primary)', () => {
    it('should have content-moderator with Gemini Flash primary', () => {
      const config = router.getModel('content-moderator');

      expect(config?.provider).toBe('gemini');
      expect(config?.model).toContain('gemini-2.0-flash');
      expect(config?.tier).toBe('C');
    });

    it('should have Claude Haiku as fallback for Tier C', () => {
      const fallback = router.getFallbackModel('content-moderator');

      expect(fallback?.provider).toBe('claude');
      expect(fallback?.model).toContain('claude-haiku');
    });

    it('should have chatbot in Tier C', () => {
      const config = router.getModel('chatbot');

      expect(config?.provider).toBe('gemini');
      expect(config?.tier).toBe('C');
    });

    it('should have translation-agent in Tier C', () => {
      const config = router.getModel('translation-agent');

      expect(config?.provider).toBe('gemini');
      expect(config?.tier).toBe('C');
    });

    it('should have recommendation-engine in Tier C', () => {
      const config = router.getModel('recommendation-engine');

      expect(config?.provider).toBe('gemini');
      expect(config?.tier).toBe('C');
    });

    it('should have 18 Tier C agents total', () => {
      const tierCAgents = [
        'content-moderator',
        'email-responder',
        'chatbot',
        'seo-optimizer',
        'translation-agent',
        'qa-tester',
        'feedback-collector',
        'category-classifier',
        'recommendation-engine',
        'inventory-monitor',
        'pricing-optimizer',
        'promotional-manager',
        'coupon-generator',
        'event-scheduler',
        'notification-dispatcher',
        'report-generator',
        'log-analyzer',
        'doc-parser',
      ];

      for (const agentId of tierCAgents) {
        const config = router.getModel(agentId);
        expect(config?.tier).toBe('C');
      }
    });
  });

  describe('Tier D agents (lightweight, Gemini Flash-Lite)', () => {
    it('should have health-monitor with Gemini Flash-Lite', () => {
      const config = router.getModel('health-monitor');

      expect(config?.provider).toBe('gemini');
      expect(config?.model).toContain('gemini-2.0-flash-lite');
      expect(config?.tier).toBe('D');
    });

    it('should have Gemini Flash as fallback for Tier D', () => {
      const fallback = router.getFallbackModel('health-monitor');

      expect(fallback?.provider).toBe('gemini');
      expect(fallback?.model).toContain('gemini-2.0-flash');
    });

    it('should have heartbeat-agent in Tier D', () => {
      const config = router.getModel('heartbeat-agent');

      expect(config?.tier).toBe('D');
    });

    it('should have cache-warmer in Tier D', () => {
      const config = router.getModel('cache-warmer');

      expect(config?.tier).toBe('D');
    });

    it('should have 7 Tier D agents total', () => {
      const tierDAgents = [
        'health-monitor',
        'heartbeat-agent',
        'cache-warmer',
        'metric-collector',
        'event-router',
        'dependency-tracker',
        'scheduler-daemon',
      ];

      for (const agentId of tierDAgents) {
        const config = router.getModel(agentId);
        expect(config?.tier).toBe('D');
      }
    });
  });

  describe('Total agent count', () => {
    it('should have 47 agents (8+14+18+7)', () => {
      const routingTable = router.getRoutingTable();
      expect(routingTable.length).toBe(47);
    });
  });

  describe('Summary (tier breakdown)', () => {
    it('should have correct tier distribution', () => {
      const summary = router.getSummary();

      expect(summary['Tier A']).toBe(8);
      expect(summary['Tier B']).toBe(14);
      expect(summary['Tier C']).toBe(18);
      expect(summary['Tier D']).toBe(7);
    });

    it('should total to 47 agents', () => {
      const summary = router.getSummary();
      const total =
        summary['Tier A'] +
        summary['Tier B'] +
        summary['Tier C'] +
        summary['Tier D'];

      expect(total).toBe(47);
    });
  });

  describe('Unknown agent', () => {
    it('should return null for unknown agent ID', () => {
      const config = router.getModel('unknown-agent-xyz');
      expect(config).toBeNull();
    });

    it('should return null fallback for unknown agent', () => {
      const fallback = router.getFallbackModel('nonexistent-agent');
      expect(fallback).toBeNull();
    });
  });

  describe('Dynamic route update', () => {
    it('should allow updating routes', () => {
      const originalConfig = router.getModel('chatbot');
      expect(originalConfig?.provider).toBe('gemini');

      // Update route
      const newConfig: ModelConfig = {
        provider: 'claude',
        model: 'claude-haiku-4-20250514',
        tier: 'C',
      };

      router.updateRoute('chatbot', { primary: newConfig });

      const updated = router.getModel('chatbot');
      expect(updated?.provider).toBe('claude');
      expect(updated?.model).toContain('claude-haiku');
    });

    it('should warn on updating nonexistent agent', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const config: ModelConfig = {
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        tier: 'C',
      };

      router.updateRoute('fake-agent', { primary: config });

      // Spy should have been called with warning
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Agent-specific validation', () => {
    it('should have all leaders in Tier A', () => {
      const leaders = [
        'acquisition-lead',
        'conversion-lead',
        'ltv-lead',
      ];

      for (const id of leaders) {
        const config = router.getModel(id);
        expect(config?.tier).toBe('A');
        expect(config?.provider).toBe('claude');
      }
    });

    it('should have all L2s in Tier B', () => {
      const l2s = ['acquisition-l2', 'conversion-l2', 'ltv-l2'];

      for (const id of l2s) {
        const config = router.getModel(id);
        expect(config?.tier).toBe('B');
      }
    });

    it('should have all infrastructure agents light-weight', () => {
      const infraAgents = [
        'health-monitor',
        'heartbeat-agent',
        'event-router',
        'scheduler-daemon',
      ];

      for (const id of infraAgents) {
        const config = router.getModel(id);
        expect(
          config?.tier === 'C' || config?.tier === 'D',
        ).toBe(true);
      }
    });
  });

  describe('Singleton pattern', () => {
    it('should return same instance on multiple calls', () => {
      const router1 = getAIRouter();
      const router2 = getAIRouter();

      expect(router1).toBe(router2);
    });
  });

  describe('Fallback coverage', () => {
    it('should have fallback for every agent', () => {
      const routingTable = router.getRoutingTable();

      for (const entry of routingTable) {
        const fallback = router.getFallbackModel(entry.agentId);
        expect(fallback).toBeDefined();
        expect(fallback?.provider).toBeDefined();
        expect(fallback?.model).toBeDefined();
      }
    });

    it('should use different provider in fallback when possible', () => {
      // Tier A: Claude primary → Gemini fallback
      const tierAFallback = router.getFallbackModel('commander');
      const tierAPrimary = router.getModel('commander');

      expect(tierAPrimary?.provider).not.toBe(tierAFallback?.provider);

      // Tier D: Gemini → Gemini (same provider fallback)
      const tierDFallback = router.getFallbackModel('health-monitor');
      const tierDPrimary = router.getModel('health-monitor');

      expect(tierDFallback?.provider).toBe('gemini');
      expect(tierDPrimary?.provider).toBe('gemini');
      expect(tierDFallback?.model).not.toBe(tierDPrimary?.model);
    });
  });

  describe('Model naming consistency', () => {
    it('all Claude models should be recognized format', () => {
      const routingTable = router.getRoutingTable();

      for (const entry of routingTable) {
        if (entry.primary.provider === 'claude') {
          expect(entry.primary.model).toMatch(/^claude-(sonnet|haiku)/);
        }
        if (entry.fallback.provider === 'claude') {
          expect(entry.fallback.model).toMatch(/^claude-(sonnet|haiku)/);
        }
      }
    });

    it('all Gemini models should be recognized format', () => {
      const routingTable = router.getRoutingTable();

      for (const entry of routingTable) {
        if (entry.primary.provider === 'gemini') {
          expect(entry.primary.model).toMatch(
            /^gemini-2\.0-(pro|flash|flash-lite)/,
          );
        }
        if (entry.fallback.provider === 'gemini') {
          expect(entry.fallback.model).toMatch(
            /^gemini-2\.0-(pro|flash|flash-lite)/,
          );
        }
      }
    });
  });
});

// Mock vi for the test
import { vi } from 'vitest';
