/// <reference types="vite/client" />
/// <reference types="react-router" />
/// <reference types="@shopify/oxygen-workers-types" />
/// <reference types="@shopify/hydrogen/react-router-types" />

// Enhance TypeScript's built-in typings.
import '@total-typescript/ts-reset';

/**
 * Env — Oxygen (Cloudflare Workers) 環境変数の型定義
 *
 * 医学メタファー: DNA塩基配列
 * 全ての細胞（モジュール）がこの遺伝子情報を参照する。
 * 型定義が不完全だと、タンパク質（コード）の合成にエラーが生じる。
 *
 * Shopify Hydrogen は HydrogenEnv を提供するが、カスタム変数は
 * このinterface で明示的に型安全性を保証する。
 */
declare global {
  interface Env {
    // ═══ Shopify 標準（Hydrogen/Oxygen 提供） ═══
    SESSION_SECRET: string;
    PUBLIC_STOREFRONT_API_TOKEN: string;
    PRIVATE_STOREFRONT_API_TOKEN: string;
    PUBLIC_STORE_DOMAIN: string;
    PUBLIC_STOREFRONT_ID: string;
    PUBLIC_CHECKOUT_DOMAIN?: string;
    PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: string;
    PUBLIC_CUSTOMER_ACCOUNT_API_URL: string;
    SHOP_ID: string;

    // ═══ Admin認証（免疫系 MHC分子） ═══
    ADMIN_PASSWORD: string;

    // ═══ Webhook 検証（免疫系 抗体） ═══
    SHOPIFY_WEBHOOK_SECRET?: string;

    // ═══ Shopify Admin API（循環器系） ═══
    /** Shopify Admin API トークン（正式名） */
    SHOPIFY_ADMIN_ACCESS_TOKEN?: string;
    /** フォールバック互換（一部モジュールが参照） */
    SHOPIFY_ADMIN_API_TOKEN?: string;
    SHOPIFY_SHOP_DOMAIN?: string;

    // ═══ GA4 Analytics（感覚器系） ═══
    PUBLIC_GA_MEASUREMENT_ID?: string;
    GA4_API_SECRET?: string;

    // ═══ Microsoft Clarity Analytics ═══
    PUBLIC_CLARITY_PROJECT_ID?: string;

    // ═══ Google Tag Manager（計測統合コンテナ） ═══
    PUBLIC_GTM_CONTAINER_ID?: string;

    // ═══ Meta Pixel (Facebook)（広告計測） ═══
    PUBLIC_META_PIXEL_ID?: string;
    /** Meta Conversions API アクセストークン（サーバーサイドイベント用） */
    META_CONVERSIONS_API_TOKEN?: string;

    // ═══ Agent System（神経系） ═══
    /** Cloudflare KV Namespace バインディング（骨格系=永続記憶） */
    AGENT_KV?: KVNamespace;

    // ═══ Database（脳脊髄液 — 栄養供給・メッセージ仲介） ═══
    /** D1 Database バインディング（エージェント状態・監査ログ・メトリクス永続化） */
    DB?: D1Database;
    /** D1 Database Preview環境用バインディング */
    DB_PREVIEW?: D1Database;
    /** PostgreSQL接続URL（オンプレミス運用時の代替） */
    DATABASE_URL?: string;

    // ═══ AI Agent Brain（脳 — 高次認知・判断） ═══
    /** Anthropic API Key（Claude モデルアクセス） */
    ANTHROPIC_API_KEY?: string;
    /** OpenAI API Key（GPT-4o/GPT-4o-mini モデルアクセス） */
    OPENAI_API_KEY?: string;
    /** Google Gemini API Key（Gemini Flash/Pro モデルアクセス） */
    GEMINI_API_KEY?: string;

    // ═══ Security（免疫系 — 管理者認証・認可） ═══
    /** 2要素認証有効化フラグ（Phase 2） */
    ADMIN_2FA_ENABLED?: string;
    /** 管理者2FA共有秘密鍵（Base32エンコード済み） */
    ADMIN_2FA_SECRET?: string;
    /** 管理者許可IP（ホワイトリスト） */
    ADMIN_ALLOWED_IPS?: string;

    // ═══ Notifications（感覚神経系 — 管理者への通知配信） ═══
    /** Slack Incoming Webhook URL（管理者アラート配信） */
    SLACK_WEBHOOK_URL?: string;
    /** 管理者Email（Email通知送信先） */
    ADMIN_EMAIL?: string;
    /** Resend API Key（Email送信サービス） */
    RESEND_API_KEY?: string;
    /** 通知Webhook URL（外部インテグレーション） */
    NOTIFICATION_WEBHOOK_URL?: string;
    /** Webhook署名検証用シークレット */
    WEBHOOK_SECRET?: string;

    // ═══ Error Aggregation（免疫系 — エラー監視・集約） ═══
    /** Sentry DSN（エラー追跡サービス） */
    SENTRY_DSN?: string;
    /** Datadog API Key（ログ・メトリクス集約） */
    DATADOG_API_KEY?: string;
  }
}
