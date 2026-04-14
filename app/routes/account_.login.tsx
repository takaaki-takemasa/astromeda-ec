import type {Route} from './+types/account_.login';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const meta: Route.MetaFunction = () => [
  {title: 'ASTROMEDA | ログイン'},
  {name: 'description', content: 'ASTROMEDAアカウントにログイン。注文履歴やお気に入りの管理ができます。'},
  {name: 'robots', content: 'noindex'},
];

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}

export async function loader({request, context}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const acrValues = url.searchParams.get('acr_values') || undefined;
  const loginHint = url.searchParams.get('login_hint') || undefined;
  const loginHintMode = url.searchParams.get('login_hint_mode') || undefined;
  const locale = url.searchParams.get('locale') || undefined;

  return context.customerAccount.login({
    countryCode: context.storefront.i18n.country,
    acrValues,
    loginHint,
    loginHintMode,
    locale,
  });
}
