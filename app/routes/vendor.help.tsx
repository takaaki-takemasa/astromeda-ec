/**
 * /vendor/help — ベンダー向けヘルプ・連絡先 (patch 0184 MVP)
 */
import { redirect, Link, useLoaderData } from 'react-router';
import type { Route } from './+types/vendor.help';
import { AppSession } from '~/lib/session';

export async function loader({ context, request }: Route.LoaderArgs) {
  try {
    const env = context.env as Env;
    if (!env.SESSION_SECRET) return redirect('/admin/login');
    const sharedSession = (context as unknown as {session?: AppSession}).session;
    const session = sharedSession ?? await AppSession.init(request, [env.SESSION_SECRET]);
    if (session.get('isAdmin') !== true) return redirect('/admin/login?next=/vendor/help');
    const role = session.get('role') as string | undefined;
    if (role !== 'vendor' && role !== 'owner') return redirect('/admin');
    return { username: (session.get('username') as string) ?? 'vendor' };
  } catch {
    return redirect('/admin/login');
  }
}

export const meta = () => [{ title: 'ASTROMEDA | ベンダー — 困った時' }, { name: 'robots', content: 'noindex' }];

const C = { bg: '#0a0e1a', panel: '#11172a', border: '#1f2940', text: '#e8ecf3', muted: '#8a96b3', accent: '#3498DB' };

export default function VendorHelp() {
  const { username } = useLoaderData<typeof loader>() as {username: string};
  return (
    <div style={{minHeight: '100vh', background: C.bg, color: C.text, padding: '32px', fontFamily: 'system-ui, sans-serif'}}>
      <div style={{maxWidth: 880, margin: '0 auto'}}>
        <Link to="/vendor" style={{color: C.accent, textDecoration: 'none', fontSize: 14}}>← ベンダーホームに戻る</Link>
        <h1 style={{fontSize: 28, fontWeight: 900, margin: '16px 0 8px'}}>📚 困った時</h1>
        <p style={{fontSize: 14, color: C.muted, marginBottom: 32}}>{username} さん向けのヘルプ。やり方が分からない時はここを開いてください。</p>

        <section style={{background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 16}}>
          <h2 style={{fontSize: 18, fontWeight: 800, marginBottom: 12}}>🔑 触れる場所 / 触れない場所</h2>
          <p style={{fontSize: 14, color: C.muted, lineHeight: 1.7, marginBottom: 12}}>
            あなた (外注先) が触れるのは <strong style={{color: C.text}}>あなたの担当タグ</strong> が付いた商品とセクションだけです。
          </p>
          <ul style={{fontSize: 14, color: C.muted, lineHeight: 1.9, paddingLeft: 20}}>
            <li>✅ <strong style={{color: C.text}}>触れる</strong>: 担当セクションの HTML / CSS、担当商品の画像と並び順、自分の変更履歴</li>
            <li>❌ <strong style={{color: '#ef4444'}}>触れない</strong>: 商品の値段・在庫、お客様情報、注文、メンバー追加、サイト全体設定、IPコラボ商品</li>
          </ul>
          <p style={{fontSize: 13, color: C.muted, marginTop: 12}}>
            「触れない」と表示されたら、依頼元 (担当者) にメールで連絡してください。
          </p>
        </section>

        <section style={{background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 16}}>
          <h2 style={{fontSize: 18, fontWeight: 800, marginBottom: 12}}>📞 連絡先</h2>
          <p style={{fontSize: 14, color: C.muted, lineHeight: 1.7}}>
            担当者: ASTROMEDA 社 / マイニングベース<br />
            メール: <a href="mailto:business@mng-base.com" style={{color: C.accent}}>business@mng-base.com</a>
          </p>
        </section>

        <section style={{background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24}}>
          <h2 style={{fontSize: 18, fontWeight: 800, marginBottom: 12}}>📖 詳しいガイド</h2>
          <p style={{fontSize: 14, color: C.muted, lineHeight: 1.7}}>
            セクション上書きの書き方、画像のアップロード手順は GitHub の team-onboarding/ フォルダにあります。
            分からない時は依頼元にメールで PDF を送ってもらってください。
          </p>
        </section>
      </div>
    </div>
  );
}
