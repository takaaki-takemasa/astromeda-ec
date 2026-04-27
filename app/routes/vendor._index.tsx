/**
 * /vendor — ベンダー (外注先デザイン会社) 専用ページ
 *
 * patch 0184 (2026-04-27): CEO 指示「ベンダー専用ページを作成、その中には
 * ベンダーしか触れないところのみを表示する」への対応。
 *
 * 設計原則:
 *  - admin (/admin/*) からは完全分離。vendor が /admin に来ても
 *    admin._index.tsx loader が /vendor に redirect する。
 *  - このページは「vendor が業務に必要な機能だけ」を持つ minimal hub。
 *  - owner も /vendor を見られる (vendor の見え方を確認するため)。
 *  - vendor 以外 (admin/editor/viewer) はここには入らない (admin に redirect)。
 *
 * MVP の 4 機能:
 *  1. 🎨 セクション上書き (HTML/CSS) — sectionOverride Metaobject CRUD
 *  2. 🖼️ 担当商品の画像差し替え — vendor:{username} tag 付き商品のみ
 *  3. 📤 公開・取り下げ — 自分の最近の変更を一覧表示 (将来 review queue)
 *  4. 📚 困った時 — vendor 用ガイド + 連絡先
 */

import { data, redirect, Link, useLoaderData } from 'react-router';
import type { Route } from './+types/vendor._index';
import { AppSession } from '~/lib/session';

interface VendorLoaderData {
  username: string;
  email: string;
  vendorTag: string; // tag:vendor:{username}
}

export async function loader({ context, request }: Route.LoaderArgs) {
  // patch 0184 P0: /vendor は vendor または owner のみアクセス可。
  // それ以外は /admin に redirect (admin が間違って /vendor に来た場合)。
  // session が無い場合は admin/login へ redirect。
  try {
    const env = context.env as Env;
    if (!env.SESSION_SECRET) {
      return redirect('/admin/login');
    }
    const sharedSession = (context as unknown as {session?: AppSession}).session;
    const session = sharedSession ?? await AppSession.init(request, [env.SESSION_SECRET]);
    const isAdmin = session.get('isAdmin');
    if (isAdmin !== true) {
      return redirect('/admin/login?next=/vendor');
    }
    const role = session.get('role') as string | undefined;
    if (role !== 'vendor' && role !== 'owner') {
      // admin/editor/viewer は /vendor を使わない
      return redirect('/admin');
    }
    const username = (session.get('username') as string | undefined) ?? 'vendor';
    const email = (session.get('email') as string | undefined) ?? '';
    return data<VendorLoaderData>({
      username,
      email,
      vendorTag: `vendor:${username}`,
    });
  } catch {
    return redirect('/admin/login');
  }
}

export const meta = () => [
  { title: 'ASTROMEDA | ベンダー専用ページ' },
  { name: 'robots', content: 'noindex, nofollow' },
];

const COLORS = {
  bg: '#0a0e1a',
  panel: '#11172a',
  border: '#1f2940',
  text: '#e8ecf3',
  textMuted: '#8a96b3',
  accent: '#3498DB',
  success: '#10b981',
};

function Card({
  to, icon, title, desc,
}: {to: string; icon: string; title: string; desc: string}) {
  return (
    <Link
      to={to}
      style={{
        display: 'block',
        padding: '24px 28px',
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        textDecoration: 'none',
        color: COLORS.text,
        transition: 'border-color .15s, transform .1s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.accent;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{fontSize: 36, lineHeight: 1, marginBottom: 12}}>{icon}</div>
      <div style={{fontSize: 18, fontWeight: 800, marginBottom: 6}}>{title}</div>
      <div style={{fontSize: 13, color: COLORS.textMuted, lineHeight: 1.55}}>{desc}</div>
    </Link>
  );
}

export default function VendorHome() {
  const { username, email, vendorTag } = useLoaderData<typeof loader>() as VendorLoaderData;

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }}>
      {/* Header */}
      <header style={{
        padding: '20px 32px',
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{fontSize: 11, color: COLORS.accent, letterSpacing: 2, fontWeight: 700}}>VENDOR</div>
          <div style={{fontSize: 22, fontWeight: 900, marginTop: 2}}>ベンダー専用ページ</div>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
          <div style={{textAlign: 'right'}}>
            <div style={{fontSize: 13, fontWeight: 700}}>{username || 'vendor'}</div>
            {email && <div style={{fontSize: 11, color: COLORS.textMuted}}>{email}</div>}
          </div>
          <form method="post" action="/api/admin/logout" style={{margin: 0}}>
            <button
              type="submit"
              style={{
                padding: '8px 16px',
                background: 'transparent',
                color: COLORS.textMuted,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              🚪 ログアウト
            </button>
          </form>
        </div>
      </header>

      {/* Main */}
      <main style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '40px 32px',
      }}>
        <div style={{marginBottom: 32}}>
          <h1 style={{fontSize: 28, fontWeight: 900, marginBottom: 8}}>
            こんにちは、{username || 'ベンダー'}さん
          </h1>
          <p style={{fontSize: 15, color: COLORS.textMuted, lineHeight: 1.65}}>
            ここは外注先のあなただけが触れる管理ページです。
            お店の他の機能 (商品の値段・在庫、お客様情報、注文、メンバー設定など) は触れません。
            <br />
            あなたの担当: <code style={{
              background: COLORS.panel,
              padding: '2px 8px',
              borderRadius: 6,
              color: COLORS.accent,
              fontSize: 13,
            }}>{vendorTag || 'vendor:?'}</code> タグが付いた商品とセクションのみ。
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}>
          <Card
            to="/vendor/section-override"
            icon="🎨"
            title="見た目を変える"
            desc="トップページの一部を HTML / CSS で上書きできます。担当セクションのみ。"
          />
          <Card
            to="/vendor/products"
            icon="🖼️"
            title="担当商品の画像"
            desc="あなたが担当する商品の画像と並び順を変えられます。価格・在庫は触れません。"
          />
          <Card
            to="/vendor/changes"
            icon="📤"
            title="自分の変更履歴"
            desc="最近 30 日間にあなたが変更した内容を一覧で確認できます。"
          />
          <Card
            to="/vendor/help"
            icon="📚"
            title="困った時"
            desc="やり方が分からない・触れない場所がある時はこちらを開いてください。"
          />
        </div>

        <div style={{
          marginTop: 48,
          padding: 20,
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 12,
          fontSize: 13,
          color: COLORS.textMuted,
          lineHeight: 1.7,
        }}>
          <strong style={{color: COLORS.text}}>ℹ️ 触れない機能について</strong>
          <br />
          このページにない機能 (商品の値段、お客様情報、メンバー追加、サイト設定など) は
          ASTROMEDA 社内のオーナー・スタッフのみが触れる仕組みになっています。
          必要なときは依頼元 (担当者) にメールでご連絡ください。
        </div>
      </main>
    </div>
  );
}
