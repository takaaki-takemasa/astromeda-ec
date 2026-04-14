/**
 * Environment Validator Test Suite
 *
 * T008: Tests env-validator.ts validation logic
 * Covers required/optional variables, format validation, weak password detection
 */

import { describe, it, expect } from 'vitest';
import {
  validateEnv,
  getRequiredShopifyVars,
  getRequiredSecurityVars,
  getOptionalDatabaseVars,
  getOptionalAIVars,
} from '../env-validator';

describe('validateEnv', () => {
  describe('required Shopify variables', () => {
    it('should fail if PUBLIC_STOREFRONT_ID is missing', () => {
      const env = {
        PUBLIC_STOREFRONT_API_TOKEN: 'abcdef1234567890abcdef123456',
        PRIVATE_STOREFRONT_API_TOKEN: 'shpat_abcdef1234567890abcdef',
        PUBLIC_STORE_DOMAIN: 'test.myshopify.com',
        SHOP_ID: '123456789',
        PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: '12345678-1234-1234-1234-123456789012',
        PUBLIC_CUSTOMER_ACCOUNT_API_URL: 'https://shopify.com/123456789',
        SESSION_SECRET: '12345678901234567890123456789012',
        ADMIN_PASSWORD: 'secure_password_12345',
      };

      const result = validateEnv(env);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('PUBLIC_STOREFRONT_ID'))).toBe(true);
    });

    it('should fail if Shopify store domain is invalid', () => {
      const env = {
        PUBLIC_STOREFRONT_ID: '1000122846',
        PUBLIC_STOREFRONT_API_TOKEN: 'abcdef1234567890abcdef123456',
        PRIVATE_STOREFRONT_API_TOKEN: 'shpat_abcdef1234567890abcdef',
        PUBLIC_STORE_DOMAIN: 'invalid-domain.com', // ❌ not myshopify.com or .co.jp
        SHOP_ID: '74104078628',
        PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: '12345678-1234-1234-1234-123456789012',
        PUBLIC_CUSTOMER_ACCOUNT_API_URL: 'https://shopify.com/74104078628',
        SESSION_SECRET: '12345678901234567890123456789012',
        ADMIN_PASSWORD: 'secure_password_12345',
      };

      const result = validateEnv(env);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('PUBLIC_STORE_DOMAIN'))).toBe(true);
    });

    it('should pass with valid Shopify variables', () => {
      const env = {
        PUBLIC_STOREFRONT_ID: '1000122846',
        PUBLIC_STOREFRONT_API_TOKEN: 'abcdef1234567890abcdef123456',
        PRIVATE_STOREFRONT_API_TOKEN: 'shpat_abcdef1234567890abcdef',
        PUBLIC_STORE_DOMAIN: 'staging-mining-base.myshopify.com',
        SHOP_ID: '74104078628',
        PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: 'af2b6e52-c6f8-4ee9-ae36-df75c97ecfe9',
        PUBLIC_CUSTOMER_ACCOUNT_API_URL: 'https://shopify.com/74104078628',
        SESSION_SECRET: '12345678901234567890123456789012',
        ADMIN_PASSWORD: 'secure_password_12345',
      };

      const result = validateEnv(env);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('required security variables', () => {
    it('should fail if SESSION_SECRET is too short', () => {
      const env = {
        PUBLIC_STOREFRONT_ID: '1000122846',
        PUBLIC_STOREFRONT_API_TOKEN: 'abcdef1234567890abcdef123456',
        PRIVATE_STOREFRONT_API_TOKEN: 'shpat_abcdef1234567890abcdef',
        PUBLIC_STORE_DOMAIN: 'test.myshopify.com',
        SHOP_ID: '123456789',
        PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: '12345678-1234-1234-1234-123456789012',
        PUBLIC_CUSTOMER_ACCOUNT_API_URL: 'https://shopify.com/123456789',
        SESSION_SECRET: 'short', // ❌ < 32 chars
        ADMIN_PASSWORD: 'secure_password_12345',
      };

      const result = validateEnv(env);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('SESSION_SECRET'))).toBe(true);
    });

    it('should warn if ADMIN_PASSWORD is weak', () => {
      const env = {
        PUBLIC_STOREFRONT_ID: '1000122846',
        PUBLIC_STOREFRONT_API_TOKEN: 'abcdef1234567890abcdef123456',
        PRIVATE_STOREFRONT_API_TOKEN: 'shpat_abcdef1234567890abcdef',
        PUBLIC_STORE_DOMAIN: 'test.myshopify.com',
        SHOP_ID: '123456789',
        PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: '12345678-1234-1234-1234-123456789012',
        PUBLIC_CUSTOMER_ACCOUNT_API_URL: 'https://shopify.com/123456789',
        SESSION_SECRET: '12345678901234567890123456789012',
        ADMIN_PASSWORD: 'password123456', // ❌ contains "password"
      };

      const result = validateEnv(env);
      expect(result.valid).toBe(true); // Still valid but warned
      expect(result.warnings.some(w => w.includes('ADMIN_PASSWORD'))).toBe(true);
    });

    it('should warn if ADMIN_PASSWORD is less than 12 chars', () => {
      const env = {
        PUBLIC_STOREFRONT_ID: '1000122846',
        PUBLIC_STOREFRONT_API_TOKEN: 'abcdef1234567890abcdef123456',
        PRIVATE_STOREFRONT_API_TOKEN: 'shpat_abcdef1234567890abcdef',
        PUBLIC_STORE_DOMAIN: 'test.myshopify.com',
        SHOP_ID: '123456789',
        PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: '12345678-1234-1234-1234-123456789012',
        PUBLIC_CUSTOMER_ACCOUNT_API_URL: 'https://shopify.com/123456789',
        SESSION_SECRET: '12345678901234567890123456789012',
        ADMIN_PASSWORD: 'short', // ❌ < 12 chars
      };

      const result = validateEnv(env);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('ADMIN_PASSWORD'))).toBe(true);
    });
  });

  describe('optional database variables', () => {
    it('should pass if DATABASE_URL is omitted', () => {
      const env = {
        PUBLIC_STOREFRONT_ID: '1000122846',
        PUBLIC_STOREFRONT_API_TOKEN: 'abcdef1234567890abcdef123456',
        PRIVATE_STOREFRONT_API_TOKEN: 'shpat_abcdef1234567890abcdef',
        PUBLIC_STORE_DOMAIN: 'test.myshopify.com',
        SHOP_ID: '123456789',
        PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: '12345678-1234-1234-1234-123456789012',
        PUBLIC_CUSTOMER_ACCOUNT_API_URL: 'https://shopify.com/123456789',
        SESSION_SECRET: '12345678901234567890123456789012',
        ADMIN_PASSWORD: 'secure_password_12345',
      };

      const result = validateEnv(env);
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('DATABASE_URL'))).toBe(true);
    });

    it('should fail if DATABASE_URL format is invalid', () => {
      const env = {
        PUBLIC_STOREFRONT_ID: '1000122846',
        PUBLIC_STOREFRONT_API_TOKEN: 'abcdef1234567890abcdef123456',
        PRIVATE_STOREFRONT_API_TOKEN: 'shpat_abcdef1234567890abcdef',
        PUBLIC_STORE_DOMAIN: 'test.myshopify.com',
        SHOP_ID: '123456789',
        PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: '12345678-1234-1234-1234-123456789012',
        PUBLIC_CUSTOMER_ACCOUNT_API_URL: 'https://shopify.com/123456789',
        SESSION_SECRET: '12345678901234567890123456789012',
        ADMIN_PASSWORD: 'secure_password_12345',
        DATABASE_URL: 'mysql://invalid', // ❌ not PostgreSQL
      };

      const result = validateEnv(env);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('DATABASE_URL'))).toBe(true);
    });

    it('should pass with valid PostgreSQL DATABASE_URL', () => {
      const env = {
        PUBLIC_STOREFRONT_ID: '1000122846',
        PUBLIC_STOREFRONT_API_TOKEN: 'abcdef1234567890abcdef123456',
        PRIVATE_STOREFRONT_API_TOKEN: 'shpat_abcdef1234567890abcdef',
        PUBLIC_STORE_DOMAIN: 'test.myshopify.com',
        SHOP_ID: '123456789',
        PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: '12345678-1234-1234-1234-123456789012',
        PUBLIC_CUSTOMER_ACCOUNT_API_URL: 'https://shopify.com/123456789',
        SESSION_SECRET: '12345678901234567890123456789012',
        ADMIN_PASSWORD: 'secure_password_12345',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/astromeda_agents',
      };

      const result = validateEnv(env);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('optional AI variables', () => {
    it('should pass if AI keys are omitted', () => {
      const env = {
        PUBLIC_STOREFRONT_ID: '1000122846',
        PUBLIC_STOREFRONT_API_TOKEN: 'abcdef1234567890abcdef123456',
        PRIVATE_STOREFRONT_API_TOKEN: 'shpat_abcdef1234567890abcdef',
        PUBLIC_STORE_DOMAIN: 'test.myshopify.com',
        SHOP_ID: '123456789',
        PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: '12345678-1234-1234-1234-123456789012',
        PUBLIC_CUSTOMER_ACCOUNT_API_URL: 'https://shopify.com/123456789',
        SESSION_SECRET: '12345678901234567890123456789012',
        ADMIN_PASSWORD: 'secure_password_12345',
      };

      const result = validateEnv(env);
      expect(result.valid).toBe(true);
    });

    it('should pass with valid ANTHROPIC_API_KEY', () => {
      const env = {
        PUBLIC_STOREFRONT_ID: '1000122846',
        PUBLIC_STOREFRONT_API_TOKEN: 'abcdef1234567890abcdef123456',
        PRIVATE_STOREFRONT_API_TOKEN: 'shpat_abcdef1234567890abcdef',
        PUBLIC_STORE_DOMAIN: 'test.myshopify.com',
        SHOP_ID: '123456789',
        PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: '12345678-1234-1234-1234-123456789012',
        PUBLIC_CUSTOMER_ACCOUNT_API_URL: 'https://shopify.com/123456789',
        SESSION_SECRET: '12345678901234567890123456789012',
        ADMIN_PASSWORD: 'secure_password_12345',
        ANTHROPIC_API_KEY: 'sk-ant-abcdef1234567890abcdef1234567890',
      };

      const result = validateEnv(env);
      expect(result.valid).toBe(true);
    });
  });

  describe('helper functions', () => {
    it('should return all required Shopify variables', () => {
      const vars = getRequiredShopifyVars();
      expect(vars).toContain('PUBLIC_STOREFRONT_ID');
      expect(vars).toContain('PUBLIC_STOREFRONT_API_TOKEN');
      expect(vars).toContain('PRIVATE_STOREFRONT_API_TOKEN');
      expect(vars).toContain('PUBLIC_STORE_DOMAIN');
      expect(vars).toContain('SHOP_ID');
    });

    it('should return all required security variables', () => {
      const vars = getRequiredSecurityVars();
      expect(vars).toContain('SESSION_SECRET');
      expect(vars).toContain('ADMIN_PASSWORD');
    });

    it('should return optional database variables', () => {
      const vars = getOptionalDatabaseVars();
      expect(vars).toContain('DATABASE_URL');
    });

    it('should return optional AI variables', () => {
      const vars = getOptionalAIVars();
      expect(vars.length).toBeGreaterThan(0);
      expect(vars).toContain('ANTHROPIC_API_KEY');
    });
  });

  describe('config output', () => {
    it('should organize validated variables by category', () => {
      const env = {
        PUBLIC_STOREFRONT_ID: '1000122846',
        PUBLIC_STOREFRONT_API_TOKEN: 'abcdef1234567890abcdef123456',
        PRIVATE_STOREFRONT_API_TOKEN: 'shpat_abcdef1234567890abcdef',
        PUBLIC_STORE_DOMAIN: 'test.myshopify.com',
        SHOP_ID: '123456789',
        PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: '12345678-1234-1234-1234-123456789012',
        PUBLIC_CUSTOMER_ACCOUNT_API_URL: 'https://shopify.com/123456789',
        SESSION_SECRET: '12345678901234567890123456789012',
        ADMIN_PASSWORD: 'secure_password_12345',
        ANTHROPIC_API_KEY: 'sk-ant-abcdef1234567890abcdef1234567890',
      };

      const result = validateEnv(env);
      expect(result.config.shopify).toBeDefined();
      expect(Object.keys(result.config.shopify).length).toBeGreaterThan(0);
      expect(result.config.security).toBeDefined();
      expect(result.config.ai).toBeDefined();
    });
  });
});
