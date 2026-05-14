/** DEPRECATED (Phase L): Shopify Flow + Shopify Email + Vercel /api/tokens/issue に移行 */
export async function loader() { return new Response(JSON.stringify({ error: "deprecated", new_location: "Shopify Flow + Shopify Email" }), { status: 410, headers: { "content-type": "application/json" } }); }
export async function action() { return loader(); }
