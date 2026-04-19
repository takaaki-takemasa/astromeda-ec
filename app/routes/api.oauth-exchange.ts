// Temporary OAuth token exchange + scope probe for write_files upgrade.
// POST JSON body: { shop, client_id, client_secret, code }
// GET ?probe=1 -> uses env token to introspect current granted scopes via Admin API.
// DELETE THIS ROUTE AFTER VERIFICATION IS DONE.
import { data } from 'react-router';
import type { Route } from './+types/api.oauth-exchange';

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return data({ error: 'POST only' }, { status: 405 });
  }
  try {
    const body = (await request.json()) as {
      shop?: string;
      client_id?: string;
      client_secret?: string;
      code?: string;
    };
    const { shop, client_id, client_secret, code } = body;
    if (!shop || !client_id || !client_secret || !code) {
      return data({ error: 'missing fields' }, { status: 400 });
    }
    const url = `https://${shop}/admin/oauth/access_token`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id, client_secret, code }),
    });
    const text = await r.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep raw text */
    }
    return data({ status: r.status, body: parsed }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return data({ error: msg }, { status: 500 });
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  if (url.searchParams.get('probe') !== '1') {
    return data({ ok: true, hint: 'POST JSON {shop, client_id, client_secret, code} or GET ?probe=1' });
  }
  const env = (context as any).env || {};
  const token = env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const shop = env.PUBLIC_STORE_DOMAIN || 'staging-mining-base.myshopify.com';
  if (!token) {
    return data({ error: 'no SHOPIFY_ADMIN_ACCESS_TOKEN in env' }, { status: 500 });
  }
  // Probe via accessScopes endpoint (REST) which returns granted scopes for this token
  try {
    const r = await fetch(`https://${shop}/admin/oauth/access_scopes.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    const body = await r.json();
    return data({
      probe: 'access_scopes',
      tokenPrefix: String(token).slice(0, 12) + '...',
      shop,
      status: r.status,
      body,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return data({ error: msg }, { status: 500 });
  }
}
