/**
 * API Route: POST /api/newsletter
 *
 * Shopify Storefront API の customerCreate mutation を使用し、
 * メールアドレスでニュースレター購読を登録する。
 *
 * Shopify管理画面の「顧客」にメール購読状態(acceptsMarketing: true)で登録される。
 * Shopify Email / Klaviyo がこの購読リストを自動的に利用する。
 */

import type {Route} from './+types/api.newsletter';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { NewsletterSchema } from '~/lib/api-schemas';

export async function action({request, context}: Route.ActionArgs) {
  const limited = applyRateLimit(request, 'api.newsletter', RATE_LIMIT_PRESETS.submit);
  if (limited) return limited;
  const formData = await request.formData();
  const email = String(formData.get('email') || '').trim();

  // Zodバリデーション
  const validation = NewsletterSchema.safeParse({email});
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

    // Shopify Storefront API: customerCreate
    const result = await storefront.mutate(CUSTOMER_CREATE_MUTATION, {
      variables: {
        input: {
          email: validation.data.email,
          acceptsMarketing: true,
        },
      },
    });

    const errors = result?.customerCreate?.customerUserErrors || [];

    if (errors.length > 0) {
      // TAKEN = 既に登録済み（これは成功として扱う）
      const alreadyExists = errors.some(
        (e: {code?: string}) => e.code === 'TAKEN',
      );
      if (alreadyExists) {
        return {success: true};
      }
      // その他のエラー
      const msg = errors.map((e: {message?: string}) => e.message).join(', ');
      return {success: false, error: msg || '登録に失敗しました。'};
    }

    return {success: true};
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error('[Newsletter] Error:', err);
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
