import type {CustomerFragment} from 'customer-accountapi.generated';
import {CUSTOMER_UPDATE_MUTATION} from '~/graphql/customer-account/CustomerUpdateMutation';
import {
  CUSTOMER_METAFIELDS_SET_MUTATION,
  CUSTOMER_ID_QUERY,
} from '~/graphql/customer-account/CustomerMetafieldsSetMutation';
import {
  data,
  Form,
  useActionData,
  useNavigation,
  useOutletContext,
} from 'react-router';
import type {Route} from './+types/account.profile';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {T, al} from '~/lib/astromeda-data';

export type ActionResponse = {
  error: string | null;
  customer: CustomerFragment | null;
  success?: boolean;
};

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'ASTROMEDA | プロフィール'},
    {name: 'robots', content: 'noindex, nofollow'},
  ];
};

export async function loader({context}: Route.LoaderArgs) {
  context.customerAccount.handleAuthStatus();
  return {};
}

/** メタフィールドの値を配列から取得するヘルパー */
function getMetafieldValue(
  metafields: Array<{key: string; namespace: string; value: string} | null> | null | undefined,
  namespace: string,
  key: string,
): string {
  if (!metafields) return '';
  const mf = metafields.find(
    (m) => m && m.namespace === namespace && m.key === key,
  );
  return mf?.value ?? '';
}

/** 流入経路の選択肢 */
const REFERRAL_OPTIONS = [
  {value: '', label: '選択してください'},
  {value: 'X', label: 'X（旧Twitter）'},
  {value: 'Instagram', label: 'Instagram'},
  {value: 'TikTok', label: 'TikTok'},
  {value: 'YouTube', label: 'YouTube'},
  {value: '友人紹介', label: '友人紹介'},
  {value: 'オフラインイベント', label: 'オフラインイベント'},
  {value: 'SNS以外の広告', label: 'SNS以外の広告'},
  {value: 'その他', label: 'その他'},
];

/** 性別の選択肢 */
const GENDER_OPTIONS = [
  {value: '', label: '選択してください'},
  {value: '男性', label: '男性'},
  {value: '女性', label: '女性'},
  {value: 'その他', label: 'その他'},
  {value: '回答しない', label: '回答しない'},
];

export async function action({request, context}: Route.ActionArgs) {
  const {customerAccount} = context;

  if (request.method !== 'PUT') {
    return data({error: 'Method not allowed'}, {status: 405});
  }

  const form = await request.formData();

  try {
    const customer: Record<string, string> = {};

    // 基本フィールド
    const firstName = form.get('firstName');
    const lastName = form.get('lastName');
    if (typeof firstName === 'string' && firstName.length) {
      customer.firstName = firstName;
    }
    if (typeof lastName === 'string' && lastName.length) {
      customer.lastName = lastName;
    }

    // メタフィールド
    const birthDate = form.get('birthDate') as string;
    const gender = form.get('gender') as string;
    const referralSource = form.get('referralSource') as string;

    const metafields: Array<{
      key: string;
      namespace: string;
      type: string;
      value: string;
    }> = [];

    if (birthDate) {
      metafields.push({
        key: 'birth_date',
        namespace: 'facts',
        type: 'date',
        value: birthDate,
      });
    }
    if (gender) {
      metafields.push({
        key: 'gender',
        namespace: 'custom',
        type: 'single_line_text_field',
        value: gender,
      });
    }
    if (referralSource) {
      metafields.push({
        key: 'referral_source',
        namespace: 'custom',
        type: 'single_line_text_field',
        value: referralSource,
      });
    }

    // Step 1: Update basic fields (firstName/lastName) via customerUpdate
    // CustomerUpdateInput does NOT support metafields — they must be set separately.
    const {data: mutationData, errors} = await customerAccount.mutate(
      CUSTOMER_UPDATE_MUTATION,
      {
        variables: {
          customer,
          language: customerAccount.i18n.language,
        },
      },
    );

    if (errors?.length) {
      throw new Error(errors[0].message);
    }

    if (
      mutationData?.customerUpdate?.userErrors &&
      mutationData.customerUpdate.userErrors.length > 0
    ) {
      throw new Error(
        mutationData.customerUpdate.userErrors
          .map((e: {message: string}) => e.message)
          .join(', '),
      );
    }

    if (!mutationData?.customerUpdate?.customer) {
      throw new Error('プロフィールの更新に失敗しました。');
    }

    // Step 2: Set metafields via metafieldsSet (requires customer GID as ownerId)
    if (metafields.length > 0) {
      const {data: idData, errors: idErrors} = await customerAccount.query(
        CUSTOMER_ID_QUERY,
      );
      if (idErrors?.length) {
        throw new Error(idErrors[0].message);
      }
      const ownerId = idData?.customer?.id;
      if (!ownerId) {
        throw new Error('顧客IDを取得できませんでした。');
      }

      const metafieldsWithOwner = metafields.map((m) => ({
        ...m,
        ownerId,
      }));

      const {data: mfData, errors: mfErrors} = await customerAccount.mutate(
        CUSTOMER_METAFIELDS_SET_MUTATION,
        {
          variables: {
            metafields: metafieldsWithOwner,
          },
        },
      );

      if (mfErrors?.length) {
        throw new Error(mfErrors[0].message);
      }

      if (
        mfData?.metafieldsSet?.userErrors &&
        mfData.metafieldsSet.userErrors.length > 0
      ) {
        throw new Error(
          mfData.metafieldsSet.userErrors
            .map((e: {message: string}) => e.message)
            .join(', '),
        );
      }
    }

    // Optimistically merge updated metafields into the returned customer
    // so the UI reflects the saved values immediately.
    const updatedCustomer = {
      ...mutationData.customerUpdate.customer,
      metafields: metafields.map((m) => ({
        key: m.key,
        namespace: m.namespace,
        value: m.value,
      })),
    };

    return {
      error: null,
      customer: updatedCustomer as CustomerFragment,
      success: true,
    };
  } catch (error: unknown) {
    console.error('[account.profile] Error:', error);
    return data(
      {error: 'プロフィールの更新に失敗しました', customer: null, success: false},
      {status: 400},
    );
  }
}

export default function AccountProfile() {
  const account = useOutletContext<{customer: CustomerFragment}>();
  const {state} = useNavigation();
  const actionData = useActionData<ActionResponse>();
  const customer = actionData?.customer ?? account?.customer;

  // メタフィールドから値を取得
  const metafields = (customer as unknown as {metafields?: Array<{key: string; namespace: string; value: string} | null> | null})?.metafields;
  const birthDate = getMetafieldValue(metafields, 'facts', 'birth_date');
  const gender = getMetafieldValue(metafields, 'custom', 'gender');
  const referralSource = getMetafieldValue(
    metafields,
    'custom',
    'referral_source',
  );

  // プロフィール完了チェック
  const isProfileComplete =
    !!customer?.firstName &&
    !!customer?.lastName &&
    !!birthDate &&
    !!gender &&
    !!referralSource;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 10,
    border: `1px solid ${T.t2}`,
    background: T.bgC,
    color: T.tx,
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color .2s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: T.t5,
    marginBottom: 6,
  };

  const requiredBadge: React.CSSProperties = {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    color: T.r,
    marginLeft: 6,
  };

  const fieldGroup: React.CSSProperties = {
    marginBottom: 20,
  };

  return (
    <div>
      {/* プロフィール未完了の警告バナー */}
      {!isProfileComplete && (
        <div
          style={{
            padding: '16px 20px',
            borderRadius: 12,
            border: `1px solid ${al(T.g, 0.3)}`,
            background: al(T.g, 0.06),
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{fontSize: 22}}>⚠</span>
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                color: T.g,
                marginBottom: 4,
              }}
            >
              プロフィールを完了してください
            </div>
            <div style={{fontSize: 12, color: T.t4}}>
              ご購入にはすべての必須項目の入力が必要です。
            </div>
          </div>
        </div>
      )}

      {/* 成功メッセージ */}
      {actionData?.success && (
        <div
          style={{
            padding: '12px 20px',
            borderRadius: 12,
            border: `1px solid ${al(T.c, 0.3)}`,
            background: al(T.c, 0.06),
            marginBottom: 24,
            fontSize: 13,
            fontWeight: 600,
            color: T.c,
          }}
        >
          プロフィールを更新しました
        </div>
      )}

      <h2
        style={{
          fontSize: 'clamp(18px, 2.5vw, 22px)',
          fontWeight: 800,
          marginBottom: 24,
        }}
      >
        プロフィール
      </h2>

      <Form method="PUT">
        {/* 基本情報セクション */}
        <div
          style={{
            padding: 'clamp(16px, 3vw, 24px)',
            borderRadius: 16,
            border: `1px solid ${T.t2}`,
            background: T.bgC,
            marginBottom: 24,
          }}
        >
          <h3
            style={{
              fontSize: 15,
              fontWeight: 700,
              marginBottom: 20,
              color: T.c,
            }}
          >
            基本情報
          </h3>

          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16}}>
            <div style={fieldGroup}>
              <label htmlFor="lastName" style={labelStyle}>
                姓<span style={requiredBadge}>必須</span>
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                placeholder="山田"
                defaultValue={customer?.lastName ?? ''}
                required
                style={inputStyle}
              />
            </div>
            <div style={fieldGroup}>
              <label htmlFor="firstName" style={labelStyle}>
                名<span style={requiredBadge}>必須</span>
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                placeholder="太郎"
                defaultValue={customer?.firstName ?? ''}
                required
                style={inputStyle}
              />
            </div>
          </div>

          <div style={fieldGroup}>
            <label htmlFor="birthDate" style={labelStyle}>
              生年月日<span style={requiredBadge}>必須</span>
            </label>
            <input
              id="birthDate"
              name="birthDate"
              type="date"
              defaultValue={birthDate}
              required
              max={new Date().toISOString().split('T')[0]}
              min="1920-01-01"
              style={{
                ...inputStyle,
                colorScheme: 'dark',
              }}
            />
          </div>

          <div style={fieldGroup}>
            <label htmlFor="gender" style={labelStyle}>
              性別<span style={requiredBadge}>必須</span>
            </label>
            <select
              id="gender"
              name="gender"
              defaultValue={gender}
              required
              style={{
                ...inputStyle,
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff80' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 16px center',
                paddingRight: 40,
              }}
            >
              {GENDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 流入経路セクション */}
        <div
          style={{
            padding: 'clamp(16px, 3vw, 24px)',
            borderRadius: 16,
            border: `1px solid ${T.t2}`,
            background: T.bgC,
            marginBottom: 24,
          }}
        >
          <h3
            style={{
              fontSize: 15,
              fontWeight: 700,
              marginBottom: 20,
              color: T.c,
            }}
          >
            アンケート
          </h3>

          <div style={fieldGroup}>
            <label htmlFor="referralSource" style={labelStyle}>
              Astromedaをどこで知りましたか？
              <span style={requiredBadge}>必須</span>
            </label>
            <select
              id="referralSource"
              name="referralSource"
              defaultValue={referralSource}
              required
              style={{
                ...inputStyle,
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff80' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 16px center',
                paddingRight: 40,
              }}
            >
              {REFERRAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* エラー表示 */}
        {actionData?.error && (
          <div
            style={{
              padding: '12px 20px',
              borderRadius: 12,
              border: `1px solid ${al(T.r, 0.3)}`,
              background: al(T.r, 0.06),
              marginBottom: 20,
              fontSize: 13,
              fontWeight: 600,
              color: T.r,
            }}
          >
            {actionData.error}
          </div>
        )}

        {/* 送信ボタン */}
        <button
          type="submit"
          disabled={state !== 'idle'}
          style={{
            width: '100%',
            padding: '14px 24px',
            borderRadius: 12,
            border: 'none',
            background: `linear-gradient(135deg, ${T.c}, ${T.cD})`,
            color: '#000',
            fontSize: 15,
            fontWeight: 800,
            cursor: state !== 'idle' ? 'not-allowed' : 'pointer',
            opacity: state !== 'idle' ? 0.6 : 1,
            transition: 'all .2s',
            fontFamily: 'inherit',
          }}
        >
          {state !== 'idle' ? '更新中...' : 'プロフィールを更新する'}
        </button>
      </Form>
    </div>
  );
}

/**
 * プロフィール完了チェックユーティリティ
 * 他のルート（カート、チェックアウト等）からimportして使用
 */
interface CustomerWithMetafields {
  firstName?: string | null;
  lastName?: string | null;
  metafields?: Array<{namespace: string; key: string; value: string} | null> | null;
}
export function isCustomerProfileComplete(customer: CustomerWithMetafields | null | undefined): boolean {
  if (!customer) return false;
  if (!customer.firstName || !customer.lastName) return false;

  const metafields = customer.metafields;
  if (!metafields) return false;

  const birthDate = getMetafieldValue(metafields, 'facts', 'birth_date');
  const gender = getMetafieldValue(metafields, 'custom', 'gender');
  const referralSource = getMetafieldValue(
    metafields,
    'custom',
    'referral_source',
  );

  return !!birthDate && !!gender && !!referralSource;
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
