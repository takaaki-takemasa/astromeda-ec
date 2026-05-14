/**
 * DEPRECATED (Phase L / 2026-05-14):
 * 旧 Hydrogen 経由の口コミ投稿ルート。
 * App Proxy は今 Vercel (astromeda-reviews-app) を指しているので、
 * このファイルは到達不能なはずだが、念のため 301 redirect で防御。
 */
import { redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "@shopify/remix-oxygen";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  return redirect(`https://shop.mining-base.co.jp/apps/reviews/submit${token ? `?token=${encodeURIComponent(token)}` : ""}`, 301);
}
export async function action({ request }: ActionFunctionArgs) {
  return loader({ request } as LoaderFunctionArgs);
}
export default function Deprecated() { return null; }
