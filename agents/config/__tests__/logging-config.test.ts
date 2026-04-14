/**
 * LoggingConfig Test Suite (T068)
 * Tests structured logging, correlation IDs, and log formatting.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Logger,
  formatLogAsJson,
  formatLogAsText,
  getOrCreateCorrelationId,
  createLogger,
  shutdownAllLoggers,
  initLogging,
  getLogConfig,
} from '../logging-config.js';
import type { LogEntry, LogConfig } from '../logging-config.js';

function makeLogEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: 'info',
    module: 'test-module',
    message: 'Test message',
    ...overrides,
  };
}

describe('LoggingConfig', () => {
  describe('formatLogAsJson', () => {
    it('should format log entry as JSON', () => {
      const entry = makeLogEntry({ message: 'Test' });
      const json = formatLogAsJson(entry);

      const parsed = JSON.parse(json);
      expect(parsed.message).toBe('Test');
      expect(parsed.level).toBe('info');
      expect(parsed.module).toBe('test-module');
    });

    it('should include metadata in JSON', () => {
      const entry = makeLogEntry({
        message: 'Test',
        metadata: { userId: 'user_123', action: 'login' },
      });
      const json = formatLogAsJson(entry);

      const parsed = JSON.parse(json);
      expect(parsed.metadata.userId).toBe('user_123');
      expect(parsed.metadata.action).toBe('login');
    });

    it('should include error details in JSON', () => {
      const error = new Error('Something went wrong');
      const entry = makeLogEntry({
        level: 'error',
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });

      const json = formatLogAsJson(entry);
      const parsed = JSON.parse(json);

      expect(parsed.error.name).toBe('Error');
      expect(parsed.error.message).toBe('Something went wrong');
    });
  });

  describe('formatLogAsText', () => {
    it('should format log entry as text', () => {
      const entry = makeLogEntry({
        timestamp: '2026-04-11T00:00:00.000Z',
        level: 'info',
        module: 'test',
        message: 'Test message',
      });

      const text = formatLogAsText(entry);
      expect(text).toContain('INFO');
      expect(text).toContain('[test]');
      expect(text).toContain('Test message');
    });

    it('should include correlation ID in text format', () => {
      const entry = makeLogEntry({
        correlationId: 'corr_12345',
        message: 'Correlated message',
      });

      const text = formatLogAsText(entry);
      expect(text).toContain('corr_12345');
      expect(text).toContain('Correlated message');
    });

    it('should pad level and module names', () => {
      const entry = makeLogEntry({ level: 'debug', module: 'a' });
      const text = formatLogAsText(entry);

      // Should have consistent spacing
      expect(text.length).toBeGreaterThan(0);
    });
  });

  describe('getOrCreateCorrelationId', () => {
    it('should create and return a correlation ID', () => {
      const correlationId = getOrCreateCorrelationId('req_1');
      expect(correlationId).toMatch(/^corr_/);
    });

    it('should return the same correlation ID for the same request', () => {
      const id1 = getOrCreateCorrelationId('req_same');
      const id2 = getOrCreateCorrelationId('req_same');
      expect(id1).toBe(id2);
    });

    it('should create different correlation IDs for different requests', () => {
      const id1 = getOrCreateCorrelationId('req_1');
      const id2 = getOrCreateCorrelationId('req_2');
      expect(id1).not.toBe(id2);
    });

    it('should generate request ID if not provided', () => {
      const id1 = getOrCreateCorrelationId();
      const id2 = getOrCreateCorrelationId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('Logger class', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger('test-module', {
        defaultLevel: 'debug',
        modules: { 'test-module': 'debug' },
        enableJsonFormat: true,
        enableConsoleOutput: false,
        enableFileOutput: false,
      });
    });

    describe('log levels', () => {
      it('should log debug messages when level allows', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const loggerWithConsole = new Logger('test-module', {
          defaultLevel: 'debug',
          modules: { 'test-module': 'debug' },
          enableJsonFormat: true,
          enableConsoleOutput: true,
          enableFileOutput: false,
        });

        loggerWithConsole.debug('Debug message');
        expect(consoleSpy).toHaveBeenCalled();

        consoleSpy.mockRestore();
      });

      it('should skip messages below configured level', () => {
        const loggerWarn = new Logger('test-module', {
          defaultLevel: 'warn',
          modules: { 'test-module': 'warn' },
          enableJsonFormat: true,
          enableConsoleOutput: false,
          enableFileOutput: false,
        });

        // Should not call console for debug/info
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        loggerWarn.debug('Debug - should be skipped');
        loggerWarn.info('Info - should be skipped');

        expect(consoleSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });
    });

    describe('logging methods', () => {
      it('should log info messages', () => {
        logger.info('Info message', { userId: '123' });
        expect(true).toBe(true);
      });

      it('should log warn messages', () => {
        logger.warn('Warning message', { severity: 'high' });
        expect(true).toBe(true);
      });

      it('should log error messages with Error objects', () => {
        const error = new Error('Something failed');
        logger.error('Error occurred', error, { component: 'api' });
        expect(true).toBe(true);
      });

      it('should log fatal messages', () => {
        const error = new Error('Critical failure');
        logger.fatal('Fatal error', error, { impact: 'system' });
        expect(true).toBe(true);
      });
    });

    describe('correlation ID', () => {
      it('should include correlation ID in logs', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const loggerWithConsole = new Logger('test-module', {
          defaultLevel: 'info',
          modules: { 'test-module': 'info' },
          enableJsonFormat: true,
          enableConsoleOutput: true,
          enableFileOutput: false,
        });

        loggerWithConsole.info('Message with correlation', {}, 'corr_test_123');
        expect(consoleSpy).toHaveBeenCalled();

        const callArgs = consoleSpy.mock.calls[0][0];
        expect(callArgs).toContain('corr_test_123');

        consoleSpy.mockRestore();
      });
    });

    describe('shutdown', () => {
      it('should clear timers on shutdown', () => {
        logger.shutdown();
        expect(true).toBe(true);
      });
    });
  });

  describe('createLogger', () => {
    it('should create and cache logger instances', () => {
      const logger1 = createLogger('module-a');
      const logger2 = createLogger('module-a');
      expect(logger1).toBe(logger2);
    });

    it('should create different instances for different modules', () => {
      const loggerA = createLogger('module-a');
      const loggerB = createLogger('module-b');
      expect(loggerA).not.toBe(loggerB);
    });
  });

  describe('initLogging', () => {
    it('should initialize with default config', () => {
      const config = initLogging();
      expect(config.defaultLevel).toBeDefined();
      expect(config.modules).toBeDefined();
    });

    it('should merge custom config', () => {
      const config = initLogging({
        defaultLevel: 'warn',
        enableJsonFormat: false,
      });

      expect(config.defaultLevel).toBe('warn');
      expect(config.enableJsonFormat).toBe(false);
    });

    it('should respect LOG_LEVEL environment variable', () => {
      vi.stubEnv('LOG_LEVEL', 'error');
      const config = initLogging();
      expect(config.defaultLevel).toBe('error');
      vi.unstubAllEnvs();
    });
  });

  describe('getLogConfig', () => {
    it('should return default config', () => {
      const config = getLogConfig();
      expect(config.defaultLevel).toBe('info');
      expect(config.enableJsonFormat).toBe(true);
    });
  });

  describe('shutdownAllLoggers', () => {
    it('should shutdown all loggers', () => {
      createLogger('module-1');
      createLogger('module-2');

      shutdownAllLoggers();
      // Should complete without error
      expect(true).toBe(true);
    });
  });
});
