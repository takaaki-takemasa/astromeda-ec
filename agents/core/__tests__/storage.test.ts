/**
 * Storage Test Suite
 *
 * Tests the InMemoryStorage adapter and IStorageAdapter compliance.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryStorage,
  type StorageRecord,
  type StorageQuery,
  TABLES,
} from '../storage.js';

interface TestRecord extends StorageRecord {
  name: string;
  value: number;
}

describe('InMemoryStorage', () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage(1000);
  });

  describe('constructor', () => {
    it('should create a new InMemoryStorage instance', () => {
      expect(storage).toBeDefined();
      expect(storage).toBeInstanceOf(InMemoryStorage);
    });

    it('should accept maxRecordsPerTable parameter', () => {
      const limitedStorage = new InMemoryStorage(100);
      expect(limitedStorage).toBeInstanceOf(InMemoryStorage);
    });

    it('should use default maxRecordsPerTable if not specified', () => {
      const defaultStorage = new InMemoryStorage();
      expect(defaultStorage).toBeInstanceOf(InMemoryStorage);
    });
  });

  describe('put', () => {
    it('should insert a record', async () => {
      const record: TestRecord = {
        id: 'test-1',
        name: 'Test Record',
        value: 42,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.put('test_table', record);

      const retrieved = await storage.get('test_table', 'test-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Record');
    });

    it('should update existing record (upsert behavior)', async () => {
      const record1: TestRecord = {
        id: 'test-1',
        name: 'Original',
        value: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const record2: TestRecord = {
        id: 'test-1',
        name: 'Updated',
        value: 2,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.put('test_table', record1);
      await storage.put('test_table', record2);

      const retrieved = await storage.get('test_table', 'test-1');
      expect(retrieved?.name).toBe('Updated');
      expect(retrieved?.value).toBe(2);
    });

    it('should preserve createdAt on update', async () => {
      const now = Date.now();
      const record1: TestRecord = {
        id: 'test-1',
        name: 'Original',
        value: 1,
        createdAt: now,
        updatedAt: now,
      };

      await storage.put('test_table', record1);

      const updated: TestRecord = {
        id: 'test-1',
        name: 'Updated',
        value: 2,
        createdAt: now + 1000, // different time
        updatedAt: Date.now(),
      };

      await storage.put('test_table', updated);

      const retrieved = await storage.get('test_table', 'test-1');
      expect(retrieved?.createdAt).toBe(now);
    });

    it('should set updatedAt to current time', async () => {
      const before = Date.now();

      const record: TestRecord = {
        id: 'test-1',
        name: 'Test',
        value: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.put('test_table', record);

      const after = Date.now();
      const retrieved = await storage.get('test_table', 'test-1');

      expect(retrieved!.updatedAt).toBeGreaterThanOrEqual(before);
      expect(retrieved!.updatedAt).toBeLessThanOrEqual(after + 10);
    });
  });

  describe('get', () => {
    it('should retrieve a stored record', async () => {
      const record: TestRecord = {
        id: 'test-1',
        name: 'Test',
        value: 42,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.put('test_table', record);
      const retrieved = await storage.get('test_table', 'test-1');

      expect(retrieved).toEqual(expect.objectContaining({
        id: 'test-1',
        name: 'Test',
        value: 42,
      }));
    });

    it('should return null for non-existent record', async () => {
      const retrieved = await storage.get('test_table', 'non-existent');
      expect(retrieved).toBeNull();
    });

    it('should return null for non-existent table', async () => {
      const retrieved = await storage.get('non_existent_table', 'test-1');
      expect(retrieved).toBeNull();
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      const now = Date.now();
      const records: TestRecord[] = [
        { id: 'r1', name: 'Alpha', value: 1, createdAt: now - 3000, updatedAt: now },
        { id: 'r2', name: 'Beta', value: 2, createdAt: now - 2000, updatedAt: now },
        { id: 'r3', name: 'Gamma', value: 3, createdAt: now - 1000, updatedAt: now },
        { id: 'r4', name: 'Delta', value: 4, createdAt: now, updatedAt: now },
      ];

      for (const record of records) {
        await storage.put('test_table', record);
      }
    });

    it('should query all records by default', async () => {
      const results = await storage.query('test_table', {});
      expect(results.length).toBe(4);
    });

    it('should filter by where clause', async () => {
      const results = await storage.query('test_table', { where: { name: 'Alpha' } });
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Alpha');
    });

    it('should sort by orderBy (default descending)', async () => {
      const results = await storage.query('test_table', { orderBy: 'value' });
      expect(results[0].value).toBe(4);
      expect(results[results.length - 1].value).toBe(1);
    });

    it('should sort ascending when desc=false', async () => {
      const results = await storage.query('test_table', { orderBy: 'value', desc: false });
      expect(results[0].value).toBe(1);
      expect(results[results.length - 1].value).toBe(4);
    });

    it('should respect limit parameter', async () => {
      const results = await storage.query('test_table', { limit: 2 });
      expect(results.length).toBe(2);
    });

    it('should respect offset parameter', async () => {
      const allResults = await storage.query('test_table', {});
      const offsetResults = await storage.query('test_table', { offset: 2 });
      expect(offsetResults.length).toBe(2);
      expect(offsetResults[0].id).toBe(allResults[2].id);
    });

    it('should filter by since timestamp', async () => {
      const now = Date.now();
      const results = await storage.query('test_table', { since: now - 1500 });
      expect(results.length).toBe(2); // r3, r4
    });

    it('should filter by until timestamp', async () => {
      const now = Date.now();
      // until = now - 1500 → r1(now-3000), r2(now-2000) qualify (createdAt <= now-1500)
      const results = await storage.query('test_table', { until: now - 1500 });
      expect(results.length).toBe(2); // r1, r2
    });

    it('should return empty array for non-existent table', async () => {
      const results = await storage.query('non_existent', {});
      expect(results).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete a record', async () => {
      const record: TestRecord = {
        id: 'test-1',
        name: 'Test',
        value: 42,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.put('test_table', record);
      const deleted = await storage.delete('test_table', 'test-1');

      expect(deleted).toBe(true);

      const retrieved = await storage.get('test_table', 'test-1');
      expect(retrieved).toBeNull();
    });

    it('should return false when deleting non-existent record', async () => {
      const deleted = await storage.delete('test_table', 'non-existent');
      expect(deleted).toBe(false);
    });

    it('should return false for non-existent table', async () => {
      const deleted = await storage.delete('non_existent', 'test-1');
      expect(deleted).toBe(false);
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 5; i++) {
        const record: TestRecord = {
          id: `test-${i}`,
          name: `Record ${i}`,
          value: i,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await storage.put('test_table', record);
      }
    });

    it('should count all records without query', async () => {
      const count = await storage.count('test_table');
      expect(count).toBe(5);
    });

    it('should count with where filter', async () => {
      const count = await storage.count('test_table', { where: { name: 'Record 1' } });
      expect(count).toBe(1);
    });

    it('should return 0 for non-existent table', async () => {
      const count = await storage.count('non_existent');
      expect(count).toBe(0);
    });
  });

  describe('stats', () => {
    it('should return storage stats', async () => {
      const record: TestRecord = {
        id: 'test-1',
        name: 'Test',
        value: 42,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.put('test_table', record);

      const stats = await storage.stats();

      expect(stats).toBeDefined();
      expect(stats.tables).toBeDefined();
      expect(stats.totalRecords).toBeGreaterThan(0);
      expect(stats.memoryUsageBytes).toBeGreaterThan(0);
    });

    it('should track records per table', async () => {
      const record1: TestRecord = {
        id: 'test-1',
        name: 'Test',
        value: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const record2: TestRecord = {
        id: 'test-2',
        name: 'Test',
        value: 2,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.put('table1', record1);
      await storage.put('table2', record2);

      const stats = await storage.stats();

      expect(stats.tables['table1'].count).toBe(1);
      expect(stats.tables['table2'].count).toBe(1);
      expect(stats.totalRecords).toBe(2);
    });
  });

  describe('purge', () => {
    beforeEach(async () => {
      const now = Date.now();
      const records: TestRecord[] = [
        { id: 'r1', name: 'Old', value: 1, createdAt: now - 10000, updatedAt: now },
        { id: 'r2', name: 'Recent', value: 2, createdAt: now - 1000, updatedAt: now },
      ];

      for (const record of records) {
        await storage.put('test_table', record);
      }
    });

    it('should delete records older than timestamp', async () => {
      const now = Date.now();
      const purged = await storage.purge('test_table', now - 5000);

      expect(purged).toBe(1);

      const remaining = await storage.query('test_table', {});
      expect(remaining.length).toBe(1);
      expect(remaining[0].name).toBe('Recent');
    });

    it('should return 0 for non-existent table', async () => {
      const now = Date.now();
      const purged = await storage.purge('non_existent', now);
      expect(purged).toBe(0);
    });
  });

  describe('upsert', () => {
    it('should insert new record', async () => {
      const record: TestRecord = {
        id: 'test-1',
        name: 'Test',
        value: 42,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.upsert('test_table', record);

      const retrieved = await storage.get('test_table', 'test-1');
      expect(retrieved?.name).toBe('Test');
    });

    it('should update existing record', async () => {
      const record1: TestRecord = {
        id: 'test-1',
        name: 'Original',
        value: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.upsert('test_table', record1);

      const record2: TestRecord = {
        id: 'test-1',
        name: 'Updated',
        value: 2,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.upsert('test_table', record2);

      const retrieved = await storage.get('test_table', 'test-1');
      expect(retrieved?.name).toBe('Updated');
    });
  });

  describe('export and import', () => {
    it('should export all data', async () => {
      const record1: TestRecord = {
        id: 'test-1',
        name: 'Test 1',
        value: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const record2: TestRecord = {
        id: 'test-2',
        name: 'Test 2',
        value: 2,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.put('table1', record1);
      await storage.put('table2', record2);

      const exported = await storage.exportAll();

      expect(exported.table1).toBeDefined();
      expect(exported.table2).toBeDefined();
      expect(exported.table1.length).toBe(1);
      expect(exported.table2.length).toBe(1);
    });

    it('should import data into storage', async () => {
      const data = {
        test_table: [
          {
            id: 'imported-1',
            name: 'Imported',
            value: 99,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      };

      await storage.importAll(data);

      const retrieved = await storage.get('test_table', 'imported-1');
      expect(retrieved?.name).toBe('Imported');
    });
  });

  describe('TABLES constants', () => {
    it('should define all required table names', () => {
      expect(TABLES.AGENT_ACTIONS).toBeDefined();
      expect(TABLES.HEALTH_HISTORY).toBeDefined();
      expect(TABLES.PIPELINE_RUNS).toBeDefined();
      expect(TABLES.FEEDBACK).toBeDefined();
      expect(TABLES.SYSTEM_EVENTS).toBeDefined();
      expect(TABLES.AGENT_STATE).toBeDefined();
      expect(TABLES.ATTRIBUTION).toBeDefined();
    });
  });
});
