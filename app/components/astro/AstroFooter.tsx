import {useState} from 'react';
import {Link, useRouteLoaderData} from 'react-router';
import {T, al, LEGAL, POLICY_BASE} from '~/lib/astromeda-data';
import {NewsletterSignup} from '~/components/astro/NewsletterSignup';
import type {RootLoader, MetaFooterConfig} from '~/root';

/* ─── Footer SVG Icons ──────────────────────────────── */
const iconProps = {width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const};
function SvgBuilding() { return <svg {...iconProps}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>; }
function SvgDocument() { return <svg {...iconProps}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>; }
function SvgShield() { return <svg {...iconProps}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>; }
function SvgLock() { return <svg {...iconProps}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>; }
function SvgTruck() { return <svg {...iconProps}><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>; }

export function AstroFooter() {
  const [sec, setSec] = useState<string | null>(null);
  const rootData = useRouteLoaderData<RootLoader>('root');
  const rawFooterConfigs: MetaFooterConfig[] = rootData?.metaFooterConfigs || [];
  // Sprint 2 Part 3-5: 完全性チェック — 全 active エントリが section_title + links を満たす
  const activeFooterConfigs = rawFooterConfigs.filter((c) => c.isActive);
  const footerMetaMode =
    activeFooterConfigs.length > 0 &&
    activeFooterConfigs.every((c) => c.sectionTitle.trim() !== '' && c.links.length > 0);
  const metaSections = footerMetaMode
    ? [...activeFooterConfigs].sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  const sections = [
    {k: 'company', l: '会社概要', icon: <SvgBuilding />},
    {k: 'tokusho', l: '特定商取引法に基づく表記', icon: <SvgDocument />},
    {k: 'warranty', l: '保証・修理について', icon: <SvgShield />},
    {k: 'privacy', l: 'プライバシーポリシー', icon: <SvgLock />},
    {k: 'shipping', l: '配送・返品について', icon: <SvgTruck />},
  ];

  const labelStyle: React.CSSProperties = {
    fontWeight: 700,
    color: T.t4,
    flexShrink: 0,
    fontSize: 'clamp(8px, 1.2vw, 10px)',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    marginBottom: 8,
    borderBottom: `1px solid ${T.t1}`,
    paddingBottom: 8,
  };

  return (
    <footer
      style={{
        borderTop: `1px solid ${T.t1}`,
        marginTop: 'auto',
      }}
    >
      <section
        style={{
          padding: 'clamp(28px, 4vw, 36px) clamp(20px, 4vw, 48px)',
        }}
      >
        {/* Brand */}
        <div style={{marginBottom: 'clamp(24px, 3vw, 32px)'}}>
          <div
            className="ph"
            style={{
              fontSize: 'clamp(14px, 2vw, 20px)',
              fontWeight: 900,
              color: T.tx,
              letterSpacing: 4,
              marginBottom: 8,
            }}
          >
            ASTROMEDA
          </div>
          <div style={{fontSize: 'clamp(10px, 1.3vw, 12px)', color: T.t4, maxWidth: 500}}>
            株式会社マイニングベースが手掛けるゲーミングPCブランド。
            国内自社工場での受注生産にこだわり、人気IPとのコラボレーションモデルを展開しています。
          </div>
        </div>

        {/* Newsletter signup */}
        <div style={{marginBottom: 'clamp(20px, 3vw, 28px)'}}>
          <NewsletterSignup />
        </div>

        {/* Info accordion — CSS media query for 1col/2col */}
        <div
          className="astro-footer-grid"
          style={{
            display: 'grid',
            gap: 'clamp(8px, 1vw, 10px)',
            marginBottom: 'clamp(20px, 3vw, 28px)',
          }}
        >
          {sections.map((s) => {
            const isOpen = sec === s.k;
            return (
              <div key={s.k}>
                <button
                  type="button"
                  onClick={() => setSec(isOpen ? null : s.k)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: 'clamp(12px, 1.5vw, 16px) clamp(14px, 1.5vw, 18px)',
                    borderRadius: 14,
                    border: `1px solid ${isOpen ? al(T.c, 0.2) : T.t1}`,
                    background: isOpen ? al(T.c, 0.04) : T.bgC,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{fontSize: 'clamp(14px, 1.5vw, 16px)', display: 'flex', alignItems: 'center', color: isOpen ? T.c : T.t4}}>{s.icon}</span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 'clamp(10px, 1.3vw, 12px)',
                      fontWeight: 700,
                      color: isOpen ? T.c : T.tx,
                    }}
                  >
                    {s.l}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: T.t4,
                      transform: isOpen ? 'rotate(90deg)' : 'none',
                      transition: 'transform .2s',
                    }}
                  >
                    ▶
                  </span>
                </button>
                {isOpen && (
                  <div
                    style={{
                      padding: 'clamp(14px, 1.5vw, 18px)',
                      background: T.bgE,
                      borderRadius: '0 0 14px 14px',
                      border: `1px solid ${T.t1}`,
                      borderTop: 'none',
                      fontSize: 'clamp(9px, 1.2vw, 11px)',
                      color: T.t5,
                      lineHeight: 1.9,
                    }}
                  >
                    {s.k === 'company' && (
                      <div>
                        {[
                          ['会社名', `${LEGAL.company.name} (${LEGAL.company.en})`],
                          ['代表取締役社長', LEGAL.company.ceo],
                          ['設立', LEGAL.company.est],
                          ['本社所在地', LEGAL.company.addr],
                          ['事業内容', LEGAL.company.biz],
                          ['主要取引先', LEGAL.company.partners],
                        ].map(([k, v]) => (
                          <div key={k} style={rowStyle}>
                            <span className="astro-footer-label" style={labelStyle}>{k}</span>
                            <span>{v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {s.k === 'tokusho' && (
                      <div>
                        {[
                          ['販売業者', LEGAL.tokusho.seller],
                          ['代表責任者', LEGAL.tokusho.resp],
                          ['所在地', LEGAL.tokusho.addr],
                          ['電話番号', LEGAL.tokusho.tel],
                          ['メール', LEGAL.tokusho.email],
                          ['支払方法', LEGAL.tokusho.pay],
                          ['送料', LEGAL.tokusho.ship],
                          ['出荷目安', LEGAL.tokusho.shipTime],
                          ['商品代金', LEGAL.tokusho.price],
                          ['キャンセル', LEGAL.tokusho.cancel],
                        ].map(([k, v]) => (
                          <div key={k} style={rowStyle}>
                            <span className="astro-footer-label" style={labelStyle}>{k}</span>
                            <span>{v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {s.k === 'warranty' && (
                      <div>
                        <div
                          style={{
                            fontWeight: 800,
                            color: T.c,
                            marginBottom: 10,
                            fontSize: 'clamp(10px, 1.3vw, 12px)',
                          }}
                        >
                          ■ PC保証プラン
                        </div>
                        {[
                          ['標準保証', LEGAL.warranty.base],
                          ['延長保証', LEGAL.warranty.ext],
                          ['2年延長', LEGAL.warranty.extPrice2],
                          ['3年延長', LEGAL.warranty.extPrice3],
                          ['対象範囲', LEGAL.warranty.scope],
                          ['対象外', LEGAL.warranty.exclude],
                        ].map(([k, v]) => (
                          <div key={k} style={{display: 'flex', gap: 8, marginBottom: 6}}>
                            <span style={{minWidth: 80, ...labelStyle}}>{k}</span>
                            <span>{v}</span>
                          </div>
                        ))}
                        <div
                          style={{
                            fontWeight: 800,
                            color: T.g,
                            marginTop: 14,
                            marginBottom: 10,
                            fontSize: 'clamp(10px, 1.3vw, 12px)',
                          }}
                        >
                          ■ 修理・サポート
                        </div>
                        {[
                          ['修理納期', LEGAL.warranty.repair],
                          ['修理費用', LEGAL.warranty.repairCost],
                          ['窓口', LEGAL.warranty.support],
                        ].map(([k, v]) => (
                          <div key={k} style={{display: 'flex', gap: 8, marginBottom: 6}}>
                            <span style={{minWidth: 80, ...labelStyle}}>{k}</span>
                            <span>{v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {s.k === 'privacy' && (
                      <div>
                        {LEGAL.privacy}
                        <br />
                        <br />
                        <a
                          href={`${POLICY_BASE}privacy-policy`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{color: T.c, textDecoration: 'underline'}}
                        >
                          詳細を見る ↗
                        </a>
                      </div>
                    )}
                    {s.k === 'shipping' && (
                      <div>
                        {[
                          ['返品条件', LEGAL.tokusho.returnP],
                          ['PC出荷', '注文後10〜15営業日前後（土日祝除く）'],
                          ['ガジェット出荷', '3〜5営業日'],
                          ['即日出荷', '14時までの注文で対応（対象モデル限定・土日祝除く）'],
                          ['梱包', '専用オリジナルデザイン段ボール・高品質梱包材使用'],
                        ].map(([k, v]) => (
                          <div key={k} style={rowStyle}>
                            <span className="astro-footer-label" style={labelStyle}>{k}</span>
                            <span>{v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Contact */}
        <div
          style={{
            textAlign: 'center',
            padding: 'clamp(16px, 2vw, 20px)',
            borderRadius: 14,
            background: T.bgC,
            border: `1px solid ${T.t1}`,
            marginBottom: 'clamp(20px, 3vw, 28px)',
          }}
        >
          <div style={{fontSize: 'clamp(9px, 1.2vw, 11px)', color: T.t4, marginBottom: 6}}>
            お問い合わせ
          </div>
          <div
            style={{
              fontSize: 'clamp(10px, 1.3vw, 12px)',
              fontWeight: 700,
              color: T.tx,
              marginBottom: 4,
            }}
          >
            📞 03-6903-5371 ／ ✉ customersupport@mng-base.com
          </div>
          <div style={{fontSize: 'clamp(8px, 1.1vw, 10px)', color: T.t4, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap'}}>
            <a href="https://page.line.me/481tayao" target="_blank" rel="noopener noreferrer" aria-label="LINE公式アカウント" style={{color: '#06C755', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#06C755" aria-hidden="true"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>
              LINE相談
            </a>
            <a href="https://x.com/Astromeda_JP" target="_blank" rel="noopener noreferrer" aria-label="X (旧Twitter) 公式アカウント" style={{color: T.t5, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              X 公式
            </a>
            <span style={{color: T.t3}}>でのお問い合わせも受付中</span>
          </div>
        </div>

        {/* Sprint 6 Gap 3: Metaobject columns (上段) + fallback bottom links (下段) を併存 */}
        {footerMetaMode && (
          <div
            style={{
              fontSize: 'clamp(9px, 1.1vw, 11px)',
              color: T.t3,
              lineHeight: 1.8,
              marginBottom: 24,
            }}
          >
            <div
              className="astro-footer-meta-grid"
              style={{
                display: 'grid',
                gap: 'clamp(16px, 2vw, 28px)',
                marginBottom: 16,
              }}
            >
              {metaSections.map((s) => (
                <div key={s.id}>
                  <div
                    style={{
                      fontWeight: 800,
                      color: T.tx,
                      fontSize: 'clamp(10px, 1.2vw, 12px)',
                      letterSpacing: 1,
                      marginBottom: 8,
                    }}
                  >
                    {s.sectionTitle}
                  </div>
                  <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                    {s.links.map((lk, i) => {
                      const isExternal = /^https?:\/\//.test(lk.url);
                      return isExternal ? (
                        <a
                          key={`${s.id}-${i}`}
                          href={lk.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{color: T.t4, textDecoration: 'underline'}}
                        >
                          {lk.label}
                        </a>
                      ) : (
                        <Link
                          key={`${s.id}-${i}`}
                          to={lk.url}
                          style={{color: T.t4, textDecoration: 'underline'}}
                        >
                          {lk.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Fallback bottom links (常時表示) */}
        <div
            style={{
              textAlign: 'center',
              fontSize: 'clamp(8px, 1.1vw, 10px)',
              color: T.t3,
              lineHeight: 1.8,
            }}
          >
            <Link to="/policies/terms-of-service" style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}>
              利用規約
            </Link>
            <Link to="/policies/privacy-policy" style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}>
              プライバシーポリシー
            </Link>
            <Link to="/legal/tokushoho" style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}>
              特定商取引法
            </Link>
            <Link to="/policies/refund-policy" style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}>
              返品ポリシー
            </Link>
            <Link to="/faq" style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}>
              よくある質問
            </Link>
            <Link to="/commitment" style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}>
              こだわり
            </Link>
            <Link to="/warranty" style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}>
              延長保証
            </Link>
            <Link to="/contact" style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}>
              お問い合わせ
            </Link>
            <Link to="/contact-houjin" style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}>
              法人のお問い合わせ
            </Link>
            <a
              href="https://mining-base.co.jp/"
              target="_blank"
              rel="noopener noreferrer"
              style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}
            >
              運営会社
            </a>
            <Link to="/recycle" style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}>
              家電リサイクル
            </Link>
            <Link to="/guides" style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}>
              購入ガイド
            </Link>
            <Link to="/blogs/news" style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}>
              ニュース
            </Link>
            <Link to="/gift-cards" style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}>
              ギフトカード
            </Link>
            <Link to="/wishlist" style={{color: T.t4, textDecoration: 'underline'}}>
              お気に入り
            </Link>
            <div style={{marginTop: 10}}>
              © Mining Base Co., Ltd. ALL RIGHTS RESERVED.
            </div>
          </div>
      </section>

      {/* SSR-safe responsive: 1col mobile, 2col desktop */}
      <style dangerouslySetInnerHTML={{__html: `
        .astro-footer-grid { grid-template-columns: 1fr; }
        .astro-footer-label { min-width: 80px; }
        .astro-footer-meta-grid { grid-template-columns: 1fr 1fr; }
        @media (min-width: 600px) {
          .astro-footer-grid { grid-template-columns: 1fr 1fr; }
          .astro-footer-label { min-width: 100px; }
        }
        @media (min-width: 900px) {
          .astro-footer-meta-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
        }
      `}} />
    </footer>
  );
}
