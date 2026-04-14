import {useLoaderData, Link} from 'react-router';
import type {Route} from './+types/policies._index';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {AppError} from '~/lib/app-error';
import type {PoliciesQuery, PolicyItemFragment} from 'storefrontapi.generated';
import {STORE_URL} from '~/lib/astromeda-data';

export const meta: Route.MetaFunction = () => {
  const url = `${STORE_URL}/policies`;
  const title = 'ASTROMEDA | ご利用規約・ポリシー';
  return [
    {title},
    {name: 'description', content: 'ASTROMEDAのプライバシーポリシー、利用規約、返品・配送ポリシーなど。'},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:url', content: url},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
    {name: 'robots', content: 'noindex'},
  ];
};

export async function loader({context}: Route.LoaderArgs) {
  let data: PoliciesQuery;
  try {
    data = await context.storefront.query(POLICIES_QUERY);
  } catch (error) {
    process.env.NODE_ENV === 'development' && console.error('[policies._index] Storefront API error:', error);
    throw AppError.externalApi('ポリシーデータの取得に失敗しました');
  }

  const shopPolicies = data.shop;
  const policies: PolicyItemFragment[] = [
    shopPolicies?.privacyPolicy,
    shopPolicies?.shippingPolicy,
    shopPolicies?.termsOfService,
    shopPolicies?.refundPolicy,
    shopPolicies?.subscriptionPolicy,
  ].filter((policy): policy is PolicyItemFragment => policy != null);

  if (!policies.length) {
    throw AppError.notFound('ポリシーが見つかりません');
  }

  return {policies};
}

export default function Policies() {
  const {policies} = useLoaderData<typeof loader>();

  return (
    <div className="policies">
      <h1>Policies</h1>
      <div>
        {policies.map((policy) => (
          <fieldset key={policy.id}>
            <Link to={`/policies/${policy.handle}`}>{policy.title}</Link>
          </fieldset>
        ))}
      </div>
    </div>
  );
}

const POLICIES_QUERY = `#graphql
  fragment PolicyItem on ShopPolicy {
    id
    title
    handle
  }
  query Policies ($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    shop {
      privacyPolicy {
        ...PolicyItem
      }
      shippingPolicy {
        ...PolicyItem
      }
      termsOfService {
        ...PolicyItem
      }
      refundPolicy {
        ...PolicyItem
      }
      subscriptionPolicy {
        id
        title
        handle
      }
    }
  }
` as const;

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
