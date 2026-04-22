/**
 * API Input Schemas — Zod バリデーション定義（S-04 免疫受容体）
 *
 * 医学メタファー: 免疫受容体（Immune Receptors）
 * 各APIエンドポイントへの入力を構造化・検証する。
 * 不正な入力はここで拒否され、内部に侵入しない。
 *
 * 原則:
 * - すべてのPOSTボディは対応するZodスキーマを通過する
 * - 許可リスト方式（定義されたフィールドのみ通過）
 * - .strict() で未知フィールドを拒否
 */

import { z } from 'zod';

// ═══ 共通パーツ ═══

/** 安全な文字列（XSS対策: HTMLタグ禁止、最大長制限） */
const safeString = (maxLen: number = 500) =>
  z.string().max(maxLen).refine(
    (s) => !/<[^>]*>/g.test(s),
    { message: 'HTMLタグは使用できません' },
  );

/** メールアドレス */
const emailSchema = z.string().email('有効なメールアドレスを入力してください').max(254);

/** URL文字列 */
const urlSchema = z.string().url('有効なURLを入力してください').max(2048);

// ═══ Admin API スキーマ ═══

/** ANDON（緊急停止/解除）: POST /api/admin/andon */
export const AndonActionSchema = z.object({
  action: z.enum(['pull', 'clear'], { required_error: 'actionは必須です' }),
  reason: safeString(200).optional().default('CEO操作'),
}).strict();
export type AndonAction = z.infer<typeof AndonActionSchema>;

/** クイックアクション: POST /api/admin/quick-actions */
export const QuickActionSchema = z.object({
  actionId: safeString(100),
  params: z.record(z.unknown()).optional(),
}).strict();
export type QuickAction = z.infer<typeof QuickActionSchema>;

/** スケジューラ: POST /api/admin/scheduler */
export const SchedulerActionSchema = z.object({
  pipelineId: safeString(100),
}).strict();
export type SchedulerAction = z.infer<typeof SchedulerActionSchema>;

/** パイプライン実行: POST /api/admin/pipelines */
export const PipelineActionSchema = z.object({
  pipelineId: safeString(100),
  params: z.record(z.unknown()).optional(),
}).strict();
export type PipelineAction = z.infer<typeof PipelineActionSchema>;

/** バナー管理: POST /api/admin/banners */
export const BannerActionSchema = z.object({
  action: z.enum(['regenerate'], { required_error: 'actionは必須です' }),
  collectionHandle: safeString(200).optional(),
}).strict();
export type BannerAction = z.infer<typeof BannerActionSchema>;

/** キャンペーン管理: POST /api/admin/campaigns */
export const CampaignActionSchema = z.object({
  action: z.enum(['create', 'activate', 'deactivate', 'delete', 'list'], {
    required_error: 'actionは必須です',
  }),
  campaign: z.record(z.unknown()).optional(),
  campaignId: safeString(100).optional(),
  count: z.number().int().min(1).max(100).optional().default(10),
}).strict();
export type CampaignAction = z.infer<typeof CampaignActionSchema>;

/** コンテンツ管理: POST /api/admin/content */
export const ContentActionSchema = z.object({
  action: z.enum(['publish', 'unpublish'], { required_error: 'actionは必須です' }),
  contentId: safeString(100),
}).strict();
export type ContentAction = z.infer<typeof ContentActionSchema>;

/** 承認管理: POST /api/admin/approvals */
export const ApprovalActionSchema = z.object({
  requestId: safeString(100),
  decision: z.enum(['approve', 'reject'], { required_error: 'decisionは必須です' }),
  reason: safeString(500).optional(),
}).strict();
export type ApprovalAction = z.infer<typeof ApprovalActionSchema>;

/** AI分析: POST /api/admin/ai */
export const AIActionSchema = z.object({
  action: z.enum(['analyze', 'assessRisk', 'getUsage'], {
    required_error: 'actionは必須です',
  }),
  dataType: safeString(50).optional(),
  question: safeString(1000).optional(),
  pipelineId: safeString(100).optional(),
}).strict();
export type AIAction = z.infer<typeof AIActionSchema>;

/** ユーザー管理: POST /api/admin/users */
export const UserActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    email: emailSchema,
    displayName: safeString(100),
    role: z.enum(['admin', 'editor', 'viewer']),
    password: z.string().min(12, 'パスワードは12文字以上必要です').max(128),
  }).strict(),
  z.object({
    action: z.literal('deactivate'),
    userId: safeString(100),
  }).strict(),
  z.object({
    action: z.literal('changeRole'),
    userId: safeString(100),
    newRole: z.enum(['admin', 'editor', 'viewer']),
  }).strict(),
]);
export type UserAction = z.infer<typeof UserActionSchema>;

/** パスワード変更: POST /api/admin/password */
export const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1, '現在のパスワードは必須です').max(128),
  newPassword: z.string().min(12, '新しいパスワードは12文字以上必要です').max(128),
  userId: safeString(100).optional(),
}).strict();
export type PasswordChange = z.infer<typeof PasswordChangeSchema>;

/** PSI分析: POST /api/admin/psi */
export const PSIActionSchema = z.object({
  urls: z.array(urlSchema).min(1).max(10).optional()
    .default(['https://shop.mining-base.co.jp']),
  strategy: z.enum(['mobile', 'desktop']).optional().default('mobile'),
}).strict();
export type PSIAction = z.infer<typeof PSIActionSchema>;

// ═══ 公開API スキーマ ═══

/** IndexNow通知: POST /api/indexnow */
export const IndexNowSchema = z.object({
  urls: z.array(urlSchema).min(1, 'URLは1件以上必要です').max(10000),
}).strict();
export type IndexNowAction = z.infer<typeof IndexNowSchema>;

/** ニュースレター購読: POST /api/newsletter */
export const NewsletterSchema = z.object({
  email: emailSchema,
}).strict();
export type Newsletter = z.infer<typeof NewsletterSchema>;

/** 入荷/値下げ通知: POST /api/notify */
export const NotifySchema = z.object({
  email: emailSchema,
  productHandle: z.string()
    .min(1, '商品ハンドルは必須です')
    .max(255)
    .refine(/^[a-z0-9](?:[a-z0-9-]{0,100})?$/i.test, {
      message: '商品ハンドルは英小文字・数字・ハイフンのみ使用可能です',
    }),
  notifyType: z.enum(['restock', 'price_drop'], {
    required_error: '通知種別は必須です',
  }),
}).strict();
export type Notify = z.infer<typeof NotifySchema>;

/** エラーレポート: POST /api/error-report */
export const ErrorReportSchema = z.array(
  z.object({
    message: z.string().min(1).max(2000, 'メッセージは2000文字以内です'),
    stack: z.string().max(8000, 'スタックトレースは8000文字以内です').optional(),
    url: z.string().url('有効なURLを入力してください').max(2000),
    timestamp: z.string().datetime({ message: '有効なISO 8601タイムスタンプを入力してください' }),
    userAgent: z.string().max(500, 'ユーザーエージェントは500文字以内です'),
    context: z.record(z.string()).optional(),
  }).strict(),
).min(1, 'エラーレポートは1件以上必要です').max(50, 'エラーレポートは50件以下です');
export type ErrorReport = z.infer<typeof ErrorReportSchema>;

// ═══ クエリパラメータスキーマ ═══

/** QRコード: GET /api/qr-code */
export const QRCodeQuerySchema = z.object({
  url: urlSchema,
  size: z.coerce.number().int().min(64).max(1024).optional().default(256),
  margin: z.coerce.number().int().min(0).max(20).optional().default(4),
});
export type QRCodeQuery = z.infer<typeof QRCodeQuerySchema>;

/** 予測検索: GET /api/predictive-search */
export const PredictiveSearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});
export type PredictiveSearchQuery = z.infer<typeof PredictiveSearchQuerySchema>;

/** レコメンド: GET /api/recommendations */
export const RecommendationsQuerySchema = z.object({
  productId: z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/, '無効なproductIdです'),
});
export type RecommendationsQuery = z.infer<typeof RecommendationsQuerySchema>;

// ═══ 商品管理スキーマ（CMS Phase A） ═══

/** バリアント入力 */
const VariantInputSchema = z.object({
  id: safeString(200).optional(),
  title: safeString(255).optional(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, '価格は正の数値で入力してください'),
  sku: safeString(100).optional(),
  inventoryQuantity: z.number().int().min(0).max(999999).optional(),
  options: z.array(safeString(255)).max(3).optional(),
}).strict();

/** 商品作成: POST /api/admin/products { action: 'create', product: {...} } */
export const ProductCreateSchema = z.object({
  title: z.string().min(1, '商品名は必須です').max(255).refine(
    (s) => !/<[^>]*>/g.test(s),
    { message: 'HTMLタグは使用できません' },
  ),
  descriptionHtml: z.string().max(50000).optional(),
  productType: safeString(255).optional(),
  vendor: safeString(255).optional(),
  tags: z.array(safeString(255)).max(250).optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional().default('DRAFT'),
  variants: z.array(VariantInputSchema).max(100).optional(),
}).strict();
export type ProductCreate = z.infer<typeof ProductCreateSchema>;

/**
 * 商品更新: POST /api/admin/products { action: 'update', productId: '...', product: {...} }
 *
 * patch 0111 (P0-1, 全保存パターン監査 2026-04-22):
 * tags フィールドは productUpdate には含めない (Shopify productUpdate は tags を全置換するため
 * 「タイトルだけ修正」が patch 0110 で苦労した手動 pulldown:* タグを毎回潰してしまう)。
 * タグ操作は 'update' アクションに付随する tagsAdd/tagsRemove を使うこと。
 * これにより productUpdate を呼んでも tags は preserve される (差分送信)。
 */
export const ProductUpdateSchema = z.object({
  title: safeString(255).optional(),
  descriptionHtml: z.string().max(50000).optional(),
  productType: safeString(255).optional(),
  vendor: safeString(255).optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  variants: z.array(VariantInputSchema).max(100).optional(),
}).strict();
export type ProductUpdate = z.infer<typeof ProductUpdateSchema>;

/** タグ差分配列の共通バリデータ (patch 0111) */
const ProductTagDiffArray = z.array(safeString(255)).max(250).optional();

/** 商品管理アクション: POST /api/admin/products */
export const ProductActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    product: ProductCreateSchema,
  }).strict(),
  z.object({
    action: z.literal('update'),
    productId: z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/, '無効なproductIdです'),
    product: ProductUpdateSchema,
    // patch 0111: タグ差分送信 — 全置換ではなく add/remove のみ。
    // 旧 product.tags フィールドは廃止。クライアントは initial vs current を diff してこれに詰める。
    tagsAdd: ProductTagDiffArray,
    tagsRemove: ProductTagDiffArray,
  }).strict(),
  z.object({
    action: z.literal('delete'),
    productId: z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/, '無効なproductIdです'),
  }).strict(),
]);
export type ProductAction = z.infer<typeof ProductActionSchema>;
