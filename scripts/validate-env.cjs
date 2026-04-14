#!/usr/bin/env node
/**
 * BR-10: Environment Validation Script
 * ─────────────────────────────────────────────────────────────────────
 * 医学メタファー: 健康診断 — 環境設定の「バイタルサイン」チェック
 *
 * 用途:
 * - 全必須env変数が設定されているかを確認
 * - 本番/プレビュー/ローカル環境ごとの設定差をチェック
 * - KV Namespace IDs, D1 Database IDsの未設定警告
 * - API Key形式の基本バリデーション
 *
 * 実行:
 * node scripts/validate-env.js
 *
 * 終了コード:
 * 0 = 全て正常
 * 1 = 必須変数不足
 * 2 = 警告あり（本番環境では要注意）
 */

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────
// 環境変数グループ定義
// ─────────────────────────────────────────────────────────────────────

const ENV_GROUPS = [
  {
    name: 'Shopify Integration',
    category: 'critical',
    description: 'Shopify Storefront & Admin API連携',
    vars: [
      {
        key: 'PUBLIC_STOREFRONT_ID',
        required: true,
        description: 'Shopify Storefront ID',
        placeholder: 'gid://shopify/Shop/1000122846',
      },
      {
        key: 'PUBLIC_STOREFRONT_API_TOKEN',
        required: true,
        description: 'Shopify Storefront API Token (public)',
      },
      {
        key: 'PRIVATE_STOREFRONT_API_TOKEN',
        required: true,
        description: 'Shopify Storefront API Token (private)',
      },
      {
        key: 'PUBLIC_STORE_DOMAIN',
        required: true,
        description: 'Shopify Store Domain',
        placeholder: 'staging-mining-base.myshopify.com',
      },
      {
        key: 'SESSION_SECRET',
        required: true,
        description: 'Session暗号化キー（32バイト以上）',
        validator: (val) => {
          if (Buffer.byteLength(val, 'utf8') < 32) {
            return { valid: false, message: '32バイト以上必要' };
          }
          return { valid: true };
        },
      },
    ],
  },
  {
    name: 'Admin Authentication',
    category: 'required',
    description: '管理者認証・管理画面アクセス',
    vars: [
      {
        key: 'ADMIN_PASSWORD',
        required: true,
        description: '管理者パスワード（12文字以上：大文字・小文字・数字・記号混在）',
        validator: (val) => {
          if (val.length < 12) return { valid: false, message: '12文字以上必要' };
          const hasUpper = /[A-Z]/.test(val);
          const hasLower = /[a-z]/.test(val);
          const hasNum = /[0-9]/.test(val);
          const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(val);
          if (!hasUpper || !hasLower || !hasNum || !hasSymbol) {
            return {
              valid: false,
              message: '大文字・小文字・数字・記号を全て含める必要がある',
            };
          }
          return { valid: true };
        },
      },
    ],
  },
  {
    name: 'Webhooks',
    category: 'recommended',
    description: 'Webhook署名検証',
    vars: [
      {
        key: 'SHOPIFY_WEBHOOK_SECRET',
        required: false,
        description: 'Shopify Webhook署名シークレット',
      },
      {
        key: 'WEBHOOK_SECRET',
        required: false,
        description: '汎用Webhook署名シークレット',
      },
    ],
  },
  {
    name: 'Customer Account API',
    category: 'required',
    description: 'Shopify Customer Account API',
    vars: [
      {
        key: 'PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID',
        required: true,
        description: 'Customer Account API Client ID',
      },
      {
        key: 'PUBLIC_CUSTOMER_ACCOUNT_API_URL',
        required: true,
        description: 'Customer Account API Endpoint',
        placeholder: 'https://accounts.shopify.com',
      },
    ],
  },
  {
    name: 'Shopify Admin API',
    category: 'recommended',
    description: 'Admin APIトークン（オプション）',
    vars: [
      {
        key: 'SHOPIFY_ADMIN_ACCESS_TOKEN',
        required: false,
        description: 'Shopify Admin API Access Token (推奨名)',
      },
      {
        key: 'SHOPIFY_ADMIN_API_TOKEN',
        required: false,
        description: 'Shopify Admin API Token (互換性フォールバック)',
      },
      {
        key: 'SHOPIFY_SHOP_DOMAIN',
        required: false,
        description: 'Shopify Shop Domain',
        placeholder: 'mining-base.myshopify.com',
      },
      {
        key: 'SHOP_ID',
        required: false,
        description: 'Shopify Shop ID',
        placeholder: 'gid://shopify/Shop/74104078628',
      },
    ],
  },
  {
    name: 'Analytics',
    category: 'optional',
    description: '計測・分析プラットフォーム',
    vars: [
      {
        key: 'PUBLIC_GA_MEASUREMENT_ID',
        required: false,
        description: 'Google Analytics 4 Measurement ID',
        placeholder: 'G-XXXXXXXXXX',
      },
      {
        key: 'PUBLIC_CLARITY_PROJECT_ID',
        required: false,
        description: 'Microsoft Clarity Project ID',
      },
      {
        key: 'PUBLIC_GTM_CONTAINER_ID',
        required: false,
        description: 'Google Tag Manager Container ID',
        placeholder: 'GTM-XXXXXXX',
      },
      {
        key: 'PUBLIC_META_PIXEL_ID',
        required: false,
        description: 'Meta Pixel (Facebook Ads) ID',
      },
    ],
  },
  {
    name: 'Database (Phase 1 Brainstem)',
    category: 'recommended',
    description: 'D1 Database & KV Store',
    vars: [
      {
        key: 'DATABASE_URL',
        required: false,
        description: 'D1 Database URL or PostgreSQL connection string',
        placeholder: 'postgresql://user:pass@localhost/astromeda-ec',
      },
    ],
  },
  {
    name: 'AI Brain (Phase 2)',
    category: 'optional',
    description: 'AI推論エンジンAPI',
    vars: [
      {
        key: 'ANTHROPIC_API_KEY',
        required: false,
        description: 'Anthropic Claude API Key',
        validator: (val) => {
          if (val && !val.startsWith('sk-ant-')) {
            return { valid: false, message: 'Anthropic APIキーは "sk-ant-" で開始する必要がある' };
          }
          return { valid: true };
        },
      },
      {
        key: 'OPENAI_API_KEY',
        required: false,
        description: 'OpenAI API Key',
        validator: (val) => {
          if (val && !val.startsWith('sk-')) {
            return { valid: false, message: 'OpenAI APIキーは "sk-" で開始する必要がある' };
          }
          return { valid: true };
        },
      },
      {
        key: 'GEMINI_API_KEY',
        required: false,
        description: 'Google Gemini API Key',
      },
    ],
  },
  {
    name: 'Security (Immune System)',
    category: 'recommended',
    description: '2FA・IP許可リスト',
    vars: [
      {
        key: 'ADMIN_2FA_ENABLED',
        required: false,
        description: '2要素認証の有効化（"true" or "false"）',
        placeholder: 'false',
      },
      {
        key: 'ADMIN_ALLOWED_IPS',
        required: false,
        description: 'IP許可リスト（カンマ区切り, CIDRサポート）',
        placeholder: '192.168.1.1,10.0.0.0/8,::1',
      },
    ],
  },
  {
    name: 'Notifications (Sensory Nerves)',
    category: 'recommended',
    description: '管理者通知配信',
    vars: [
      {
        key: 'SLACK_WEBHOOK_URL',
        required: false,
        description: 'Slack Incoming Webhook URL',
        placeholder: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
        validator: (val) => {
          if (val && !val.startsWith('https://hooks.slack.com/')) {
            return { valid: false, message: 'Slack Webhook URLが無効な形式' };
          }
          return { valid: true };
        },
      },
      {
        key: 'ADMIN_EMAIL',
        required: false,
        description: '管理者メールアドレス',
        placeholder: 'admin@mining-base.co.jp',
        validator: (val) => {
          if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
            return { valid: false, message: 'Email形式が無効' };
          }
          return { valid: true };
        },
      },
      {
        key: 'RESEND_API_KEY',
        required: false,
        description: 'Resend Email API Key',
        validator: (val) => {
          if (val && !val.startsWith('re_')) {
            return { valid: false, message: 'Resend APIキーは "re_" で開始する必要がある' };
          }
          return { valid: true };
        },
      },
      {
        key: 'NOTIFICATION_WEBHOOK_URL',
        required: false,
        description: '通知用汎用Webhook URL',
        placeholder: 'https://example.com/webhooks/notify',
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────
// メイン検証ロジック
// ─────────────────────────────────────────────────────────────────────

function validateEnv() {
  // .env ファイルを読む
  const envPath = path.join(process.cwd(), '.env');
  const examplePath = path.join(process.cwd(), '.env.example');
  let envVars = {};

  // プロセス環境変数を取得
  envVars = { ...process.env };

  // .env があればパース（優先度低）
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const [key, ...rest] = trimmed.split('=');
      const value = rest.join('=');
      if (key && !envVars[key]) {
        envVars[key] = value || '';
      }
    });
  }

  const results = [];
  const errors = [];
  const warnings = [];
  let hasCritical = false;
  let hasRequired = false;

  // 各グループを検証
  ENV_GROUPS.forEach((group) => {
    group.vars.forEach((varDef) => {
      const value = envVars[varDef.key];
      const isSet = value !== undefined && value !== '';
      const isCritical = group.category === 'critical';
      const isRequired = varDef.required;

      if (!isSet && isRequired) {
        if (isCritical) {
          hasCritical = true;
          errors.push(`[CRITICAL] ${varDef.key}: ${varDef.description} が未設定です`);
        } else if (group.category === 'required') {
          hasRequired = true;
          errors.push(`[REQUIRED] ${varDef.key}: ${varDef.description} が未設定です`);
        } else {
          warnings.push(`[RECOMMENDED] ${varDef.key}: ${varDef.description} の設定を推奨します`);
        }
      }

      // バリデーター実行
      let validationError = undefined;
      if (isSet && varDef.validator) {
        const result = varDef.validator(value);
        if (!result.valid) {
          validationError = result.message;
          if (isRequired || isCritical) {
            errors.push(`[VALIDATION] ${varDef.key}: ${result.message}`);
          } else {
            warnings.push(`[VALIDATION] ${varDef.key}: ${result.message}`);
          }
        }
      }

      results.push({
        key: varDef.key,
        isSet,
        isRequired,
        category: group.name,
        value: isSet ? '✓ SET' : '✗ NOT SET',
        validationError,
        description: varDef.description,
      });
    });
  });

  // wrangler.toml チェック
  const wranglerPath = path.join(process.cwd(), 'wrangler.toml');
  if (fs.existsSync(wranglerPath)) {
    const wranglerContent = fs.readFileSync(wranglerPath, 'utf-8');
    if (wranglerContent.includes('id = ""') || wranglerContent.includes('id = "REPLACE_WITH_')) {
      warnings.push('[WRANGLER] KV Namespace ID が未設定です（本番デプロイ時に設定が必要）');
    }
    if (wranglerContent.includes('database_id = ""') || wranglerContent.includes('database_id = "REPLACE_WITH_')) {
      warnings.push('[WRANGLER] D1 Database ID が未設定です（Phase 2で設定が必要）');
    }
  }

  return { results, errors, warnings, hasCritical, hasRequired };
}

// ─────────────────────────────────────────────────────────────────────
// 出力フォーマッティング
// ─────────────────────────────────────────────────────────────────────

function printReport(results, errors, warnings) {
  console.log('\n' + '═'.repeat(80));
  console.log('環境変数検証レポート — Astromeda EC Brainstem');
  console.log('═'.repeat(80) + '\n');

  // グループ別に結果を整理
  const grouped = results.reduce((acc, result) => {
    if (!acc[result.category]) acc[result.category] = [];
    acc[result.category].push(result);
    return acc;
  }, {});

  Object.keys(grouped).forEach((category) => {
    console.log(`\n【${category}】`);
    console.log('─'.repeat(80));
    grouped[category].forEach((result) => {
      const statusIcon = result.isSet ? '✓' : '✗';
      const requiredMark = result.isRequired ? '[必須]' : '[オプション]';
      console.log(`${statusIcon} ${result.key.padEnd(40)} ${result.value.padEnd(15)} ${requiredMark}`);
      if (result.validationError) {
        console.log(`  ⚠  ${result.validationError}`);
      }
    });
  });

  // エラーサマリー
  console.log('\n' + '═'.repeat(80));
  if (errors.length > 0) {
    console.log('\n❌ エラー:');
    errors.forEach((err) => console.log(`  ${err}`));
  }

  if (warnings.length > 0) {
    console.log('\n⚠  警告:');
    warnings.forEach((warn) => console.log(`  ${warn}`));
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('\n✅ 全ての必須変数が設定されています！\n');
  }
}

// ─────────────────────────────────────────────────────────────────────
// メイン実行
// ─────────────────────────────────────────────────────────────────────

function main() {
  const { results, errors, warnings, hasCritical, hasRequired } = validateEnv();

  printReport(results, errors, warnings);

  console.log('═'.repeat(80));
  console.log('バイタルサイン診断:');
  console.log(`  Critical Issues: ${hasCritical ? '🔴 あり (デプロイ不可)' : '🟢 なし'}`);
  console.log(`  Required Issues: ${hasRequired ? '🟡 あり (要設定)' : '🟢 なし'}`);
  console.log(`  Warnings: ${warnings.length > 0 ? `🟡 ${warnings.length} 件` : '🟢 なし'}`);
  console.log('═'.repeat(80) + '\n');

  // 終了コード
  if (hasCritical) {
    process.exit(1);
  }
  if (hasRequired || errors.length > 0) {
    process.exit(1);
  }
  if (warnings.length > 0) {
    process.exit(2);
  }
  process.exit(0);
}

main();
