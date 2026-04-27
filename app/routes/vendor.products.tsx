/**
 * /vendor/products — ベンダー担当商品の画像差し替え (patch 0184 MVP)
 *
 * vendor:{username} tag が付いた商品のみ表示。Phase 2 で画像 upload + 並び替え実装。
 */
import { redirect, Link, useLoaderData } from 'react-router';
import type { Route } from './+types/vendor.products';
import { AppSession } from '~/lib/session';

export async function loader({ context, request }: Route.LoaderArgs) {
  try {
    const env = context.env as Env;
    if (!env.SESSION_SECRET) return redirect('/admin/login');
    const sharedSession = (context as unknown as {session?: AppSession}).session;
    const session = sharedSession ?? await AppSession.init(request, [env.SESSION_SECRET]);
    if (session.get('isAdmin') !== true) return redirect('/admin/login?next=/vendor/products');
    const role = session.get('role') as string | undefined;
    if (role !== 'vendor' && role !== 'owner') return redirect('/admin');
    return { username: (session.get('username') as string) ?? 'vendor' };
  } catch {
    return redirect('/admin/login');
  }
}

export const meta = () => [{ title: 'ASTROMEDA | ベンダー — 担当商品の画像' }, { name: 'robots', content: 'noindex' }];

const C = { bg: '#0a0e1a', panel: '#11172a', border: '#1f2940', text: '#e8ecf3', muted: '#8a96b3', accent: '#3498DB' };

export default function VendorProducts() {
  const { username } = useLoaderData<typeof loader>() as {username: string};
  return (
    <div style={{minHeight: '100vh', background: C.bg, color: C.text, padding: '32px', fontFamily: 'system-ui, sans-serif'}}>
      <div style={{maxWidth: 880, margin: '0 auto'}}>
        <Link to="/vendor" style={{color: C.accent, textDecoration: 'none', fontSize: 14}}>← ベンダーホームに戻る</Link>
        <h1 style={{fontSize: 28, fontWeight: 900, margin: '16px 0 8px'}}>🖼️ 担当商品の画像</h1>
        <p style={{fontSize: 14, color: C.muted, marginBottom: 24}}>
          <code style={{background: C.panel, padding: '2px 6px', borderRadius: 4, color: C.accent}}>vendor:{username}</code> タグが付いた商品の画像を差し替え・並び替えできます。価格や在庫は触れません。
        </p>

        <section style={{background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24}}>
          <h2 style={{fontSize: 16, fontWeight: 800, marginBottom: 12}}>🚧 担当商品リスト (準備中)</h2>
          <p style={{fontSize: 14, color: C.muted, lineHeight: 1.7}}>
            patch 0184 Phase 2 で本実装されます。Phase 2 では:
          </p>
          <ul style={{fontSize: 14, color: C.muted, lineHeight: 1.9, paddingLeft: 20, marginTop: 8}}>
            <li>担当タグが付いた商品の一覧 (画像付き)</li>
            <li>画像のアップロード・差し替え (ドラッグ&ドロップ)</li>
            <li>画像の並び順変更</li>
          </ul>
          <p style={{fontSize: 13, color: C.muted, marginTop: 16}}>
            ASTROMEDA 担当者に商品に <code style={{background: C.bg, padding: '1px 5px', borderRadius: 3}}>vendor:{username}</code> タグを付けてもらえば、ここに表示されます。
          </p>
        </section>
      </div>
    </div>
  );
}
