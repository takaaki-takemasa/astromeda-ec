import type {Route} from './+types/account_.authorize';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export async function loader({context}: Route.LoaderArgs) {
  return context.customerAccount.authorize();
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
