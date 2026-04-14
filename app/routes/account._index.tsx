import {redirect} from 'react-router';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export async function loader() {
  return redirect('/account/orders');
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
