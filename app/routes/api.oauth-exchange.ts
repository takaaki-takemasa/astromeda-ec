// Temporary OAuth token exchange endpoint for write_files scope upgrade.
// POST JSON body: { shop, client_id, client_secret, code }
// Server-side fetch to Shopify OAuth (Oxygen worker can reach *.myshopify.com).
// DELETE THIS ROUTE AFTER TOKEN IS OBTAINED.
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

export async function loader() {
  return data({ ok: true, hint: 'POST JSON {shop, client_id, client_secret, code}' });
}
