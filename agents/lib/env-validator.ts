/**
 * Environment Variable Validator — 環境変数検証モジュール（診断装置）
 *
 * T008: Validates all required/optional environment variables on startup
 * Groups variables by category (Shopify, Database, AI, Notifications, Security)
 * Returns comprehensive error/warning reports for debugging and production readiness.
 *
 * 医学的メタファー: 健康診断。システムの「問診票」を検査し、
 * 重大な疾患（critical errors）と軽い症状（warnings）を分類する。
 *
 * Usage:
 * ```typescript
 * import { validateEnv } from '@/agents/lib/env-validator';
 * const result = validateEnv(process.env);
 * if (!result.valid) {
 *   console.error('環境設定エラー:', result.errors);
 *   process.exit(1);
 * }
 * if (result.warnings.length > 0) {
 *   console.warn('環境設定警告:', result.warnings);
 * }
 * ```
 */

import { createLogger } from '../core/logger.js';

const logger = createLogger('env-validator');

// ─── 型定義 ───

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  config: {
    shopify: Record<string, unknown>;
    database: Record<string, unknown>;
    ai: Record<string, unknown>;
    notifications: Record<string, unknown>;
    security: Record<string, unknown>;
  };
}

export interface EnvVariable {
  name: string;
  required: boolean;
  category: 'shopify' | 'database' | 'ai' | 'notifications' | 'security';
  description: string;
  validator?: (value: string) => { valid: boolean; message?: string };
}

// ─── 環境変数定義 ───

const ENV_VARS: EnvVariable[] = [
  // ── Shopify（必須）────────────────────────────────────────
  {
    name: 'PUBLIC_STOREFRONT_ID',
    required: true,
    category: 'shopify',
    description: 'Shopify Storefront ID (numeric identifier)',
    validator: (v) => ({
      valid: /^\d+$/.test(v),
      message: 'Must be a numeric Storefront ID',
    }),
  },
  {
    name: 'PUBLIC_STOREFRONT_API_TOKEN',
    required: true,
    category: 'shopify',
    description: 'Shopify Storefront API token (public, for client-side)',
    validator: (v) => ({
      valid: v.length >= 20,
      message: 'Token appears too short (expected >= 20 chars)',
    }),
  },
  {
    name: 'PRIVATE_STOREFRONT_API_TOKEN',
    required: true,
    category: 'shopify',
    description: 'Shopify Storefront API token (private, for server-side)',
    validator: (v) => ({
      valid: v.length >= 20 && v.startsWith('shpat_'),
      message: 'Expected shpat_ prefix and >= 20 chars total',
    }),
  },
  {
    name: 'PUBLIC_STORE_DOMAIN',
    required: true,
    category: 'shopify',
    description: 'Shopify store domain (e.g., staging-mining-base.myshopify.com)',
    validator: (v) => ({
      valid: v.includes('myshopify.com') || v.includes('.co.jp'),
      message: 'Must be a valid Shopify domain',
    }),
  },
  {
    name: 'SHOP_ID',
    required: true,
    category: 'shopify',
    description: 'Shopify Shop ID (numeric)',
    validator: (v) => ({
      valid: /^\d+$/.test(v),
      message: 'Must be numeric',
    }),
  },
  {
    name: 'PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID',
    required: true,
    category: 'shopify',
    description: 'Shopify Customer Account API Client ID (UUID format)',
    validator: (v) => ({
      valid: /^[a-f0-9\-]{36}$/i.test(v),
      message: 'Must be UUID format',
    }),
  },
  {
    name: 'PUBLIC_CUSTOMER_ACCOUNT_API_URL',
    required: true,
    category: 'shopify',
    description: 'Shopify Customer Account API URL',
    validator: (v) => ({
      valid: v.includes('shopify.com') || v.includes('.co.jp'),
      message: 'Must be a valid Shopify API URL',
    }),
  },

  // ── Database（本番時は必須）─────────────────────────────────
  {
    name: 'DATABASE_URL',
    required: false, // Optional for development, required for production
    category: 'database',
    description: 'PostgreSQL connection string (postgresql://user:password@host:5432/dbname)',
    validator: (v) => {
      if (!v) return { valid: true }; // Optional
      const valid = v.startsWith('postgresql://') || v.startsWith('postgres://');
      return {
        valid,
        message: 'Must start with postgresql:// or postgres://',
      };
    },
  },

  // ── AI Providers（オプション）──────────────────────────────
  {
    name: 'ANTHROPIC_API_KEY',
    required: false,
    category: 'ai',
    description: 'Anthropic API key for Claude integration',
    validator: (v) => ({
      valid: v.length >= 20,
      message: 'API key appears too short',
    }),
  },
  {
    name: 'GEMINI_API_KEY',
    required: false,
    category: 'ai',
    description: 'Google Gemini API key',
    validator: (v) => ({
      valid: v.length >= 20,
      message: 'API key appears too short',
    }),
  },

  // ── Notifications（オプション）────────────────────────────────
  {
    name: 'SLACK_WEBHOOK_URL',
    required: false,
    category: 'notifications',
    description: 'Slack Incoming Webhook URL for notifications',
    validator: (v) => ({
      valid: v.startsWith('https://hooks.slack.com/'),
      message: 'Must be valid Slack webhook URL',
    }),
  },
  {
    name: 'RESEND_API_KEY',
    required: false,
    category: 'notifications',
    description: 'Resend API key for email delivery',
    validator: (v) => ({
      valid: v.length >= 20,
      message: 'API key appears too short',
    }),
  },
  {
    name: 'NOTIFICATION_EMAIL_FROM',
    required: false,
    category: 'notifications',
    description: 'From email address for notifications',
    validator: (v) => ({
      valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: 'Must be valid email format',
    }),
  },

  // ── Security（必須）──────────────────────────────────────
  {
    name: 'SESSION_SECRET',
    required: true,
    category: 'security',
    description: 'Session encryption secret (min 32 chars for security)',
    validator: (v) => ({
      valid: v.length >= 32,
      message: 'Must be at least 32 characters for security (use `openssl rand -hex 32`)',
    }),
  },
  {
    name: 'ADMIN_PASSWORD',
    required: true,
    category: 'security',
    description: 'Admin dashboard password',
    validator: (v) => ({
      valid: v.length >= 12,
      message: 'Must be at least 12 characters',
    }),
  },
  {
    name: 'JWT_SECRET',
    required: false,
    category: 'security',
    description: 'JWT signing secret (min 32 chars recommended)',
    validator: (v) => ({
      valid: !v || v.length >= 32,
      message: 'If provided, must be at least 32 characters',
    }),
  },

  // ── Analytics（オプション）────────────────────────────────────
  {
    name: 'GA4_MEASUREMENT_ID',
    required: false,
    category: 'ai', // Grouped with AI since it's data collection
    description: 'Google Analytics 4 Measurement ID',
    validator: (v) => ({
      valid: v.startsWith('G-'),
      message: 'GA4 ID must start with G-',
    }),
  },
  {
    name: 'GA4_API_SECRET',
    required: false,
    category: 'ai',
    description: 'Google Analytics 4 API Secret',
    validator: (v) => ({
      valid: v.length >= 20,
      message: 'API secret appears too short',
    }),
  },

  // ── Agent System（オプション）────────────────────────────────
  {
    name: 'LOG_LEVEL',
    required: false,
    category: 'ai',
    description: 'Log level (debug|info|warn|error|fatal)',
    validator: (v) => ({
      valid: ['debug', 'info', 'warn', 'error', 'fatal'].includes(v),
      message: 'Must be one of: debug, info, warn, error, fatal',
    }),
  },
  {
    name: 'AGENT_KV',
    required: false,
    category: 'database',
    description: 'Cloudflare KV namespace binding (Workers only)',
  },
];

// ─── Helper Functions ───

/**
 * Detect common weak patterns in passwords
 */
function isWeakPassword(password: string): boolean {
  const commonPatterns = [
    /password/i,
    /123456/,
    /qwerty/i,
    /admin/i,
    /astromeda/i,
  ];
  return commonPatterns.some(p => p.test(password));
}

/**
 * Validate PostgreSQL connection string format
 */
function validatePostgreSQLUrl(url: string): { valid: boolean; message?: string } {
  if (!url) return { valid: true }; // Optional

  const pattern = /^(postgresql|postgres):\/\/[^:]+:[^@]+@[^:]+:\d+\/\w+/;
  if (!pattern.test(url)) {
    return {
      valid: false,
      message: 'Invalid PostgreSQL URL format. Expected: postgresql://user:pass@host:5432/dbname',
    };
  }

  // Check for obvious placeholder values
  if (url.includes('your-') || url.includes('XXXX')) {
    return {
      valid: false,
      message: 'PostgreSQL URL contains placeholder values (your-*, XXXX)',
    };
  }

  return { valid: true };
}

// ─── Main Validator ───

/**
 * Validate all environment variables
 *
 * @param env Environment object (typically process.env)
 * @returns Validation result with categorized errors/warnings
 */
export function validateEnv(env: Record<string, string | undefined>): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config: EnvValidationResult['config'] = {
    shopify: {},
    database: {},
    ai: {},
    notifications: {},
    security: {},
  };

  // Track which env vars we've seen
  const processedKeys = new Set<string>();

  for (const envVar of ENV_VARS) {
    processedKeys.add(envVar.name);
    const value = env[envVar.name];

    // Check if required variable is missing
    if (envVar.required && !value) {
      errors.push(
        `[${envVar.category.toUpperCase()}] ${envVar.name} is required but not set. ${envVar.description}`,
      );
      continue;
    }

    // Skip validation for optional unset variables
    if (!value) {
      continue;
    }

    // Run custom validator if present
    if (envVar.validator) {
      const validation = envVar.validator(value);
      if (!validation.valid) {
        const level = envVar.required ? 'error' : 'warning';
        const msg = `[${envVar.category.toUpperCase()}] ${envVar.name}: ${validation.message || 'Invalid format'}`;
        if (level === 'error') {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
        continue;
      }
    }

    // Store validated value in config
    config[envVar.category][envVar.name] = value;
  }

  // Special validation rules
  if (env.ADMIN_PASSWORD && isWeakPassword(env.ADMIN_PASSWORD)) {
    warnings.push(
      '[SECURITY] ADMIN_PASSWORD appears to contain a common pattern. Consider using a random string.',
    );
  }

  if (env.DATABASE_URL) {
    const pgValidation = validatePostgreSQLUrl(env.DATABASE_URL);
    if (!pgValidation.valid) {
      errors.push(`[DATABASE] DATABASE_URL: ${pgValidation.message}`);
    } else {
      config.database.DATABASE_URL = env.DATABASE_URL;
    }
  } else {
    warnings.push(
      '[DATABASE] DATABASE_URL not set. Using in-memory storage. Data will be lost on restart.',
    );
  }

  if (env.SESSION_SECRET && env.SESSION_SECRET.length < 64) {
    warnings.push(
      '[SECURITY] SESSION_SECRET is less than 64 chars. For extra security, use 64+ chars (run: openssl rand -hex 32)',
    );
  }

  if (env.JWT_SECRET && env.JWT_SECRET.length < 64) {
    warnings.push(
      '[SECURITY] JWT_SECRET is less than 64 chars. For extra security, use 64+ chars',
    );
  }

  // Check for unused/unknown env vars in ASTROMEDA namespace
  for (const key of Object.keys(env)) {
    if (
      (key.startsWith('PUBLIC_') || key.startsWith('PRIVATE_') || key.startsWith('ADMIN_')) &&
      !processedKeys.has(key)
    ) {
      warnings.push(`[UNKNOWN] ${key} is set but not recognized. Please verify it's intentional.`);
    }
  }

  const valid = errors.length === 0;

  if (valid) {
    logger.info('Environment validation passed', {
      shopifyVars: Object.keys(config.shopify).length,
      databaseVars: Object.keys(config.database).length,
      aiVars: Object.keys(config.ai).length,
      notificationVars: Object.keys(config.notifications).length,
      securityVars: Object.keys(config.security).length,
      warnings: warnings.length,
    });
  } else {
    logger.error('Environment validation failed', {
      errorCount: errors.length,
      warningCount: warnings.length,
    });
  }

  return {
    valid,
    errors,
    warnings,
    config,
  };
}

/**
 * Get all required Shopify variables
 */
export function getRequiredShopifyVars(): string[] {
  return ENV_VARS.filter(
    v => v.category === 'shopify' && v.required,
  ).map(v => v.name);
}

/**
 * Get all required security variables
 */
export function getRequiredSecurityVars(): string[] {
  return ENV_VARS.filter(
    v => v.category === 'security' && v.required,
  ).map(v => v.name);
}

/**
 * Get all optional database variables
 */
export function getOptionalDatabaseVars(): string[] {
  return ENV_VARS.filter(
    v => v.category === 'database' && !v.required,
  ).map(v => v.name);
}

/**
 * Get all optional AI variables
 */
export function getOptionalAIVars(): string[] {
  return ENV_VARS.filter(
    v => v.category === 'ai' && !v.required,
  ).map(v => v.name);
}
