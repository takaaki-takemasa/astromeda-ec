/**
 * API Route: POST /api/notify
 *
 * 入荷通知 / 値下げ通知のリクエストを受け付ける。
 *
 * 処理フロー:
 * 1. メールアドレスでCustomerを作成 or 取得（acceptsMarketing: true）
 * 2. 通知リクエストをShopify顧客のタグに記録
 *    - 形式: "notify:restock:product-handle" or "notify:price_drop:product-handle"
 * 3. Shopify Flow / Klaviyo が在庫変動・価格変動時にフィルタリングしてメール送信
 *
 * 将来的にはmetafield APIでより構造化された通知管理に移行予定。
 */

import type {Route} from './+types/api.notify';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { NotifySchema } from '~/lib/api-schemas';

export async function action({request, context}: Route.ActionArgs) {
  const limited = applyRateLimit(request, 'api.notify', RATE_LIMIT_PRESETS.submit);
  if (limited) return limited;
  const formData = await request.formData();
  const email = String(formData.get('email') || '').trim();
  const productHandle = String(formData.get('productHandle') || '').trim();
  const notifyType = String(formData.get('notifyType') || 'restock').trim();

  // Zodバリデーション
  const validation = NotifySchema.safeParse({email, productHandle, notifyType});
  if (!validation.success) {
    return {
      success: false,
      error: '入力値が無効です',
      details: validation.error.errors.map(e => e.message),
    };
  }

  try {
    const {storefront} = context;
    if (!storefront) {
      return {success: false, error: 'サーバー設定エラーが発生しました。'};
    }

    // 1. Customerを作成（既存なら自動的にエラーが返るのでOK）
    const createResult = await storefront.mutate(CUSTOMER_CREATE_MUTATION, {
      variables: {
        input: {
          email: validation.data.email,
          acceptsMarketing: true,
          tags: [`notify:${validation.data.notifyType}:${validation.data.productHandle}`],
        },
      },
    });

    const errors =
      createResult?.customerCreate?.customerUserErrors || [];
    const isTaken = errors.some(
      (e: {code?: string}) => e.code === 'TAKEN',
    );

    if (errors.length > 0 && !isTaken) {
      const msg = errors
        .map((e: {message?: string}) => e.message)
        .join(', ');
      return {success: false, error: msg || '登録に失敗しました。'};
    }

    // 既存顧客の場合もタグは管理画面側で手動 or Flow で追加
    // Storefront API ではcustomerUpdateに認証が必要なため、
    // 新規登録時のタグ付与のみ対応。既存顧客へのタグ追加は
    // Admin API / Shopify Flow で実装する。

    return {success: true};
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error('[Notify] Error:', err);
    return {
      success: false,
      error: '一時的なエラーが発生しました。しばらくしてからお試しください。',
    };
  }
}

const CUSTOMER_CREATE_MUTATION = `#graphql
  mutation customerCreate($input: CustomerCreateInput!) {
    customerCreate(input: $input) {
      customer {
        id
        email
      }
      customerUserErrors {
        code
        field
        message
      }
    }
  }
` as const;
