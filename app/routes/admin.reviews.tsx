/** DEPRECATED (Phase L / 2026-05-14): Hydrogen 内蔵 admin UI 廃止 → astromeda-reviews-app.vercel.app に完全移行 */
export async function loader() {
  return new Response("Gone. Use https://admin.shopify.com/store/production-mining-base/apps/astromeda-reviews-1", { status: 410 });
}
export async function action() { return loader(); }
export default function Deprecated() { return null; }
