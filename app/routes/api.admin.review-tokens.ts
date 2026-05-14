/** DEPRECATED (Phase L): astromeda-reviews-app.vercel.app/api/tokens/issue に移行 */
export async function loader() { return new Response(JSON.stringify({ error: "deprecated", new_location: "https://astromeda-reviews-app.vercel.app/api/tokens/issue" }), { status: 410, headers: { "content-type": "application/json" } }); }
export async function action() { return loader(); }
