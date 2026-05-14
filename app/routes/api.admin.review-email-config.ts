/** DEPRECATED (Phase L): astromeda-reviews-app の Tab 2 (メール設定) に移行 */
export async function loader() { return new Response(JSON.stringify({ error: "deprecated", new_location: "Astromeda Reviews app Tab 2 メール設定" }), { status: 410, headers: { "content-type": "application/json" } }); }
export async function action() { return loader(); }
