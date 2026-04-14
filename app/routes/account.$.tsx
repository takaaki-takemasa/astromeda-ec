import {redirect} from 'react-router';
import type {Route} from './+types/account.$';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

// fallback wild card for all unauthenticated routes in account section
export async function loader({context}: Route.LoaderArgs) {
  context.customerAccount.handleAuthStatus();

  return redirect('/account');
}

// Layer 7: 免疫システム — アカウントフォールバックのエラーハンドリング
export const ErrorBoundary = RouteErrorBoundary;
