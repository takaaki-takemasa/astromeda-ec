import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/policies.$handle';
import {type Shop} from '@shopify/hydrogen/storefront-api-types';
import {sanitizeHtml} from '~/lib/sanitize-html';
import {AppError} from '~/lib/app-error';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {Breadcrumb} from '~/components/astro/Breadcrumb';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

type SelectedPolicies = keyof Pick<
  Shop,
  'privacyPolicy' | 'shippingPolicy' | 'termsOfService' | 'refundPolicy'
>;

export const meta: Route.MetaFunction = ({data}) => {
  const handle = data?.policy?.handle ?? '';
  const url = `${STORE_URL}/policies/${handle}`;
  const title = `ASTROMEDA | ${data?.policy?.title ?? ''}`;
  return [
    {title},
    {name: 'description', content: `ASTROMEDA — ${data?.policy?.title ?? ''}。お客様の権利と当社の方針について。`},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:url', content: url},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
    {name: 'robots', content: 'noindex'},
  ];
};

export async function loader({params, context}: Route.LoaderArgs) {
  if (!params.handle) {
    throw AppError.notFound('ハンドルが指定されていません');
  }

  const policyName = params.handle.replace(
    /-([a-z])/g,
    (_: unknown, m1: string) => m1.toUpperCase(),
  ) as SelectedPolicies;

  const data = await context.storefront.query(POLICY_CONTENT_QUERY, {
    variables: {
      privacyPolicy: false,
      shippingPolicy: false,
      termsOfService: false,
      refundPolicy: false,
      [policyName]: true,
      language: context.storefront.i18n?.language,
    },
  });

  const policy = data.shop?.[policyName];

  if (!policy) {
    throw AppError.notFound('ポリシーが見つかりません');
  }

  return {policy};
}

export default function Policy() {
  const {policy} = useLoaderData<typeof loader>();

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
        color: T.tx,
      }}
    >
      <Breadcrumb
        items={[
          {label: 'ホーム', to: '/'},
          {label: 'ポリシー', to: '/policies'},
          {label: policy.title},
        ]}
      />
      <div
        style={{
          maxWidth: 900,
          margin: '0 auto',
          padding: 'clamp(16px, 3vw, 32px) clamp(16px, 4vw, 48px)',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(20px, 3vw, 28px)',
            fontWeight: 900,
            marginBottom: 24,
          }}
        >
          {policy.title}
        </h1>
        <div
          className="policy-body"
          dangerouslySetInnerHTML={{__html: sanitizeHtml(policy.body)}}
        />
      </div>
    </div>
  );
}

// NOTE: https://shopify.dev/docs/api/storefront/latest/objects/Shop
const POLICY_CONTENT_QUERY = `#graphql
  fragment Policy on ShopPolicy {
    body
    handle
    id
    title
    url
  }
  query Policy(
    $country: CountryCode
    $language: LanguageCode
    $privacyPolicy: Boolean!
    $refundPolicy: Boolean!
    $shippingPolicy: Boolean!
    $termsOfService: Boolean!
  ) @inContext(language: $language, country: $country) {
    shop {
      privacyPolicy @include(if: $privacyPolicy) {
        ...Policy
      }
      shippingPolicy @include(if: $shippingPolicy) {
        ...Policy
      }
      termsOfService @include(if: $termsOfService) {
        ...Policy
      }
      refundPolicy @include(if: $refundPolicy) {
        ...Policy
      }
    }
  }
` as const;

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
