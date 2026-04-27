/**
 * /vendor/changes — 自分の変更履歴 (patch 0184 MVP)
 *
 * Phase 2 で audit log を actorUsername フィルタで取得して表示。
 */
import { redirect, Link, useLoaderData } from 'react-router';
import type { Route } from './+types/vendor.changes';
import { AppSession } from '~/lib/session';

export async function loader({ context, request }: Route.LoaderArgs) {
  try {
    const env = context.env as Env;
    if (!env.SESSION_SECRET) return redirect('/admin/login');
    const sharedSession = (context as unknown as {session?: AppSession}).session;
    const session = sharedSession ?? await AppSession.init(request, [env.SESSION_SECRET]);
    if (session.get('isAdmin') !== true) return redirect('/admin/login?next=/vendor/changes');
    const role = session.get('role') as string | undefined;
    if (role !== 'vendor' && role !== 'owner') return redirect('/admin');
    return { username: (session.get('username') as string) ?? 'vendor' };
  } catch {
    return redirect('/admin/login');
  }
}

export const meta = () => [{ title: 'ASTROMEDA | ベンダー — 自分の変更履歴' }, { name: 'robots', content: 'noindex' }];

const C = { bg: '#0a0e1a', panel: '#11172a', border: '#1f2940', text: '#e8ecf3', muted: '#8a96b3', accent: '#3498DB' };

export default function VendorChanges() {
  const { username } = useLoaderData<typeof loader>() as {username: string};
  return (
    <div style={{minHeight: '100vh', background: C.bg, color: C.text, padding: '32px', fontFamily: 'system-ui, sans-serif'}}>
      <div style={{maxWidth: 880, margin: '0 auto'}}>
        <Link to="/vendor" style={{color: C.accent, textDecoration: 'none', fontSize: 14}}>← ベンダーホームに戻る</Link>
        <h1 style={{fontSize: 28, fontWeight: 900, margin: '16px 0 8px'}}>📤 自分の変更履歴</h1>
        <p style={{fontSize: 14, color: C.muted, marginBottom: 24}}>
          <strong style={{color: C.text}}>{username}</strong> さんが最近 30 日間に行った変更の一覧。
        </p>

        <section style={{background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24}}>
          <h2 style={{fontSize: 16, fontWeight: 800, marginBottom: 12}}>🚧 変更履歴 (準備中)</h2>
          <p style={{fontSize: 14, color: C.muted, lineHeight: 1.7}}>
            patch 0184 Phase 2 で本実装されます。Phase 2 では:
          </p>
          <ul style={{fontSize: 14, color: C.muted, lineHeight: 1.9, paddingLeft: 20, marginTop: 8}}>
            <li>あなたが変更したセクション・商品画像の一覧 (新しい順)</li>
            <li>各変更の before / after プレビュー</li>
            <li>必要に応じて取り下げ (rollback)</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
