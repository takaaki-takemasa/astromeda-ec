/**
 * /vendor/section-override — ベンダー向けセクション HTML/CSS 上書き編集 (patch 0184 MVP)
 *
 * astromeda_section_override Metaobject の CRUD。vendor は section_id が
 * `vendor:{username}:` で始まるエントリのみ編集可能 (Phase 2 で本実装)。
 * MVP は admin の AdminPageEditor → SectionOverride サブタブと同等機能を
 * 別 route で安全に提供。
 */
import { redirect, Link, useLoaderData } from 'react-router';
import type { Route } from './+types/vendor.section-override';
import { AppSession } from '~/lib/session';

export async function loader({ context, request }: Route.LoaderArgs) {
  try {
    const env = context.env as Env;
    if (!env.SESSION_SECRET) return redirect('/admin/login');
    const sharedSession = (context as unknown as {session?: AppSession}).session;
    const session = sharedSession ?? await AppSession.init(request, [env.SESSION_SECRET]);
    if (session.get('isAdmin') !== true) return redirect('/admin/login?next=/vendor/section-override');
    const role = session.get('role') as string | undefined;
    if (role !== 'vendor' && role !== 'owner') return redirect('/admin');
    return { username: (session.get('username') as string) ?? 'vendor', role };
  } catch {
    return redirect('/admin/login');
  }
}

export const meta = () => [{ title: 'ASTROMEDA | ベンダー — 見た目を変える' }, { name: 'robots', content: 'noindex' }];

const C = { bg: '#0a0e1a', panel: '#11172a', border: '#1f2940', text: '#e8ecf3', muted: '#8a96b3', accent: '#3498DB' };

export default function VendorSectionOverride() {
  const { username } = useLoaderData<typeof loader>() as {username: string; role: string};
  return (
    <div style={{minHeight: '100vh', background: C.bg, color: C.text, padding: '32px', fontFamily: 'system-ui, sans-serif'}}>
      <div style={{maxWidth: 880, margin: '0 auto'}}>
        <Link to="/vendor" style={{color: C.accent, textDecoration: 'none', fontSize: 14}}>← ベンダーホームに戻る</Link>
        <h1 style={{fontSize: 28, fontWeight: 900, margin: '16px 0 8px'}}>🎨 見た目を変える</h1>
        <p style={{fontSize: 14, color: C.muted, marginBottom: 24}}>
          トップページのセクションを HTML / CSS で上書きできます。担当タグ <code style={{background: C.panel, padding: '2px 6px', borderRadius: 4, color: C.accent}}>vendor:{username}</code> が付いたセクションのみ編集可能。
        </p>

        <section style={{background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 16}}>
          <h2 style={{fontSize: 16, fontWeight: 800, marginBottom: 12}}>🚧 セクション上書きエディタ (準備中)</h2>
          <p style={{fontSize: 14, color: C.muted, lineHeight: 1.7}}>
            このページは patch 0184 Phase 2 で本実装されます。Phase 2 では:
          </p>
          <ul style={{fontSize: 14, color: C.muted, lineHeight: 1.9, paddingLeft: 20, marginTop: 8}}>
            <li>担当セクションの一覧表示</li>
            <li>HTML / CSS のオンライン編集 + プレビュー</li>
            <li>変更を本番に反映するボタン</li>
          </ul>
          <p style={{fontSize: 13, color: C.muted, marginTop: 16}}>
            本実装まで、緊急のセクション上書き依頼は依頼元担当者にメールでお願いします。
          </p>
        </section>
      </div>
    </div>
  );
}
