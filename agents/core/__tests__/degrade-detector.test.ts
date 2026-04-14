/**
 * DegradeDetector Tests — T070
 *
 * Tests for test result degradation detection.
 * Covers: result recording, degradation detection, issue generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DegradeDetector, getDegradeDetector, setDegradeDetector } from '../degrade-detector.js';

describe('DegradeDetector - T070', () => {
  let detector: DegradeDetector;

  beforeEach(() => {
    detector = new DegradeDetector(100, 5);
    setDegradeDetector(detector);
  });

  describe('recordTestResult', () => {
    it('should record a test result', () => {
      detector.recordTestResult('test-suite', 50, 0, 100);

      const metrics = detector.getMetrics('test-suite');
      expect(metrics).toBeDefined();
      expect(metrics!.totalTests).toBe(50);
      expect(metrics!.failureCount).toBe(0);
    });

    it('should calculate pass rate correctly', () => {
      detector.recordTestResult('suite1', 80, 20, 100);

      const metrics = detector.getMetrics('suite1');
      expect(metrics!.currentPassRate).toBe(80);
    });

    it('should maintain result history', () => {
      detector.recordTestResult('suite1', 50, 0, 100);
      detector.recordTestResult('suite1', 50, 0, 100);
      detector.recordTestResult('suite1', 50, 0, 100);

      const history = detector.getHistory('suite1');
      expect(history.length).toBe(3);
    });

    it('should respect history limit', () => {
      const limitedDetector = new DegradeDetector(5, 5);
      for (let i = 0; i < 10; i++) {
        limitedDetector.recordTestResult('suite1', 50, 0, 100);
      }

      const history = limitedDetector.getHistory('suite1');
      expect(history.length).toBeLessThanOrEqual(5);
    });

    it('should reject invalid data', () => {
      expect(() => {
        detector.recordTestResult('suite1', -1, 0, 100);
      }).toThrow();
    });

    it('should handle 0 tests', () => {
      detector.recordTestResult('suite1', 0, 0, 100);

      const metrics = detector.getMetrics('suite1');
      expect(metrics!.currentPassRate).toBe(100);
    });

    it('should handle multiple suites independently', () => {
      detector.recordTestResult('suite1', 80, 20, 100);
      detector.recordTestResult('suite2', 60, 40, 100);

      const m1 = detector.getMetrics('suite1');
      const m2 = detector.getMetrics('suite2');

      expect(m1!.currentPassRate).toBe(80);
      expect(m2!.currentPassRate).toBe(60);
    });
  });

  describe('checkForDegradation', () => {
    it('should detect degradation when pass rate drops', () => {
      // Build baseline: 100% for 10 results
      for (let i = 0; i < 10; i++) {
        detector.recordTestResult('suite1', 100, 0, 100);
      }

      // Baseline is now 100%
      let metrics = detector.getMetrics('suite1');
      expect(metrics!.baselinePassRate).toBe(100);

      // Now drop to 95% (5% degradation = exactly threshold)
      detector.recordTestResult('suite1', 95, 5, 100);

      // Check should still be false at exactly threshold
      expect(detector.checkForDegradation()).toBe(false);

      // Drop further to 93% (which gives ~7% degradation from 100% baseline > 5% threshold)
      detector.recordTestResult('suite1', 93, 7, 100);

      expect(detector.checkForDegradation()).toBe(true);
    });

    it('should return false when no degradation', () => {
      for (let i = 0; i < 10; i++) {
        detector.recordTestResult('suite1', 100, 0, 100);
      }

      expect(detector.checkForDegradation()).toBe(false);
    });

    it('should handle multiple suites', () => {
      // suite1: stable
      for (let i = 0; i < 10; i++) {
        detector.recordTestResult('suite1', 100, 0, 100);
      }

      // suite2: degraded
      for (let i = 0; i < 10; i++) {
        detector.recordTestResult('suite2', 100, 0, 100);
      }
      detector.recordTestResult('suite2', 80, 20, 100);

      expect(detector.checkForDegradation()).toBe(true);
    });

    it('should use rolling baseline (last 10 results)', () => {
      // Results 1-10: 100%
      for (let i = 0; i < 10; i++) {
        detector.recordTestResult('suite1', 100, 0, 100);
      }

      // Results 11-15: 50% (update baseline)
      for (let i = 0; i < 5; i++) {
        detector.recordTestResult('suite1', 50, 50, 100);
      }

      // Result 16: 48% (only 4% below new baseline of ~50%, < 5% threshold)
      detector.recordTestResult('suite1', 48, 2, 100);

      // Should not degrade (baseline shifted down)
      expect(detector.checkForDegradation()).toBe(false);
    });
  });

  describe('generateIssueReports', () => {
    it('should generate report for degraded suite', () => {
      for (let i = 0; i < 10; i++) {
        detector.recordTestResult('suite1', 100, 0, 100);
      }
      detector.recordTestResult('suite1', 75, 25, 100); // 25% degradation

      const reports = detector.generateIssueReports();

      expect(reports.length).toBeGreaterThan(0);
      expect(reports[0].title).toContain('Degradation Detected');
      expect(reports[0].title).toContain('suite1');
    });

    it('should generate report with correct severity levels', () => {
      for (let i = 0; i < 10; i++) {
        detector.recordTestResult('suite1', 100, 0, 100);
      }

      // Test different degradation levels
      detector.recordTestResult('suite1', 96, 4, 100); // 4%, no report

      let reports = detector.generateIssueReports();
      expect(reports.length).toBe(0);

      // 6% degradation = medium
      detector.recordTestResult('suite1', 94, 6, 100);
      reports = detector.generateIssueReports();
      expect(reports[0].severity).toBe('medium');

      // Reset and test high severity
      detector.reset();
      for (let i = 0; i < 10; i++) {
        detector.recordTestResult('suite2', 100, 0, 100);
      }
      detector.recordTestResult('suite2', 85, 15, 100); // 15% = high
      reports = detector.generateIssueReports();
      expect(reports[0].severity).toBe('high');

      // Reset and test critical
      detector.reset();
      for (let i = 0; i < 10; i++) {
        detector.recordTestResult('suite3', 100, 0, 100);
      }
      detector.recordTestResult('suite3', 75, 25, 100); // 25% = critical
      reports = detector.generateIssueReports();
      expect(reports[0].severity).toBe('critical');
    });

    it('should include affected modules in report', () => {
      for (let i = 0; i < 10; i++) {
        detector.recordTestResult('my-suite', 100, 0, 100);
      }
      detector.recordTestResult('my-suite', 80, 20, 100);

      const reports = detector.generateIssueReports();
      expect(reports[0].affectedModules).toContain('my-suite');
    });

    it('should include metrics in report', () => {
      for (let i = 0; i < 10; i++) {
        detector.recordTestResult('suite1', 100, 0, 100);
      }
      detector.recordTestResult('suite1', 75, 25, 100);

      const reports = detector.generateIssueReports();
      expect(reports[0].metrics).toEqual(
        expect.objectContaining({
          baselinePassRate: expect.any(Number),
          currentPassRate: expect.any(Number),
          degradationPercent: expect.any(Number),
        })
      );
    });

    it('should return empty array when no degradation', () => {
      for (let i = 0; i < 10; i++) {
        detector.recordTestResult('suite1', 100, 0, 100);
      }

      const reports = detector.generateIssueReports();
      expect(reports).toHaveLength(0);
    });

    it('should generate multiple reports for multiple degraded suites', () => {
      for (let i = 0; i < 10; i++) {
        detector.recordTestResult('suite1', 100, 0, 100);
        detector.recordTestResult('suite2', 100, 0, 100);
      }

      detector.recordTestResult('suite1', 80, 20, 100);
      detector.recordTestResult('suite2', 75, 25, 100);

      const reports = detector.generateIssueReports();
      expect(reports.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getMetrics', () => {
    it('should return undefined for unknown suite', () => {
      const metrics = detector.getMetrics('unknown');
      expect(metrics).toBeUndefined();
    });

    it('should return metrics for recorded suite', () => {
      detector.recordTestResult('suite1', 50, 50, 100);
      const metrics = detector.getMetrics('suite1');

      expect(metrics).toBeDefined();
      expect(metrics!.totalTests).toBe(100);
      expect(metrics!.currentPassRate).toBe(50);
    });

    it('should include baseline and current pass rates', () => {
      for (let i = 0; i < 10; i++) {
        detector.recordTestResult('suite1', 80, 20, 100);
      }

      const metrics = detector.getMetrics('suite1');
      expect(metrics!.baselinePassRate).toBe(80);
      expect(metrics!.currentPassRate).toBe(80);
    });
  });

  describe('getAllMetrics', () => {
    it('should return all suite metrics', () => {
      detector.recordTestResult('suite1', 50, 50, 100);
      detector.recordTestResult('suite2', 60, 40, 100);
      detector.recordTestResult('suite3', 70, 30, 100);

      const allMetrics = detector.getAllMetrics();
      expect(Object.keys(allMetrics)).toHaveLength(3);
      expect(allMetrics['suite1']).toBeDefined();
      expect(allMetrics['suite2']).toBeDefined();
      expect(allMetrics['suite3']).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should clear all metrics', () => {
      detector.recordTestResult('suite1', 50, 50, 100);
      detector.reset();

      const metrics = detector.getMetrics('suite1');
      expect(metrics).toBeUndefined();

      const allMetrics = detector.getAllMetrics();
      expect(Object.keys(allMetrics)).toHaveLength(0);
    });
  });

  describe('singleton', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = getDegradeDetector();
      const instance2 = getDegradeDetector();
      expect(instance1).toBe(instance2);
    });

    it('should allow replacing instance', () => {
      const newDetector = new DegradeDetector();
      setDegradeDetector(newDetector);

      const instance = getDegradeDetector();
      expect(instance).toBe(newDetector);
    });
  });
});
