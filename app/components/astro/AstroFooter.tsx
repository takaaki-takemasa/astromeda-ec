import {useState} from 'react';
import {Link} from 'react-router';
import {T, al, fl, LEGAL, POLICY_BASE} from '~/lib/astromeda-data';

interface AstroFooterProps {
  vw?: number;
}

export function AstroFooter({vw = 1024}: AstroFooterProps) {
  const [sec, setSec] = useState<string | null>(null);

  const sections = [
    {k: 'company', l: '会社概要', i: '🏢'},
    {k: 'tokusho', l: '特定商取引法に基づく表記', i: '📋'},
    {k: 'warranty', l: '保証・修理について', i: '🛡️'},
    {k: 'privacy', l: 'プライバシーポリシー', i: '🔒'},
    {k: 'shipping', l: '配送・返品について', i: '🚚'},
  ];

  return (
    <footer
      style={{
        borderTop: `1px solid ${T.t1}`,
        marginTop: 'auto',
      }}
    >
      <section
        style={{
          padding: `${fl(28, 36, vw)}px ${fl(20, 48, vw)}px`,
        }}
      >
        {/* Brand */}
        <div style={{marginBottom: fl(24, 32, vw)}}>
          <div
            className="ph"
            style={{
              fontSize: fl(14, 20, vw),
              fontWeight: 900,
              color: T.tx,
              letterSpacing: 4,
              marginBottom: 8,
            }}
          >
            ASTROMEDA
          </div>
          <div style={{fontSize: fl(10, 12, vw), color: T.t4, maxWidth: 500}}>
            株式会社マイニングベースが手掛けるゲーミングPCブランド。
            国内自社工場での受注生産にこだわり、人気IPとのコラボレーションモデルを展開しています。
          </div>
        </div>

        {/* Info accordion */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: vw < 600 ? '1fr' : '1fr 1fr',
            gap: fl(8, 10, vw),
            marginBottom: fl(20, 28, vw),
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
                    padding: `${fl(12, 16, vw)}px ${fl(14, 18, vw)}px`,
                    borderRadius: 14,
                    border: `1px solid ${isOpen ? al(T.c, 0.2) : T.t1}`,
                    background: isOpen ? al(T.c, 0.04) : T.bgC,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{fontSize: fl(14, 16, vw)}}>{s.i}</span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: fl(10, 12, vw),
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
                      padding: fl(14, 18, vw),
                      background: T.bgE,
                      borderRadius: '0 0 14px 14px',
                      border: `1px solid ${T.t1}`,
                      borderTop: 'none',
                      fontSize: fl(9, 11, vw),
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
                          <div
                            key={k}
                            style={{
                              display: 'flex',
                              gap: 8,
                              marginBottom: 8,
                              borderBottom: `1px solid ${T.t1}`,
                              paddingBottom: 8,
                            }}
                          >
                            <span
                              style={{
                                minWidth: vw < 600 ? 80 : 100,
                                fontWeight: 700,
                                color: T.t4,
                                flexShrink: 0,
                                fontSize: fl(8, 10, vw),
                              }}
                            >
                              {k}
                            </span>
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
                          <div
                            key={k}
                            style={{
                              display: 'flex',
                              gap: 8,
                              marginBottom: 8,
                              borderBottom: `1px solid ${T.t1}`,
                              paddingBottom: 8,
                            }}
                          >
                            <span
                              style={{
                                minWidth: vw < 600 ? 80 : 100,
                                fontWeight: 700,
                                color: T.t4,
                                flexShrink: 0,
                                fontSize: fl(8, 10, vw),
                              }}
                            >
                              {k}
                            </span>
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
                            fontSize: fl(10, 12, vw),
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
                            <span
                              style={{
                                minWidth: 80,
                                fontWeight: 700,
                                color: T.t4,
                                flexShrink: 0,
                                fontSize: fl(8, 10, vw),
                              }}
                            >
                              {k}
                            </span>
                            <span>{v}</span>
                          </div>
                        ))}
                        <div
                          style={{
                            fontWeight: 800,
                            color: T.g,
                            marginTop: 14,
                            marginBottom: 10,
                            fontSize: fl(10, 12, vw),
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
                            <span
                              style={{
                                minWidth: 80,
                                fontWeight: 700,
                                color: T.t4,
                                flexShrink: 0,
                                fontSize: fl(8, 10, vw),
                              }}
                            >
                              {k}
                            </span>
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
                          <div
                            key={k}
                            style={{
                              display: 'flex',
                              gap: 8,
                              marginBottom: 8,
                              borderBottom: `1px solid ${T.t1}`,
                              paddingBottom: 8,
                            }}
                          >
                            <span
                              style={{
                                minWidth: vw < 600 ? 80 : 100,
                                fontWeight: 700,
                                color: T.t4,
                                flexShrink: 0,
                                fontSize: fl(8, 10, vw),
                              }}
                            >
                              {k}
                            </span>
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
            padding: `${fl(16, 20, vw)}px`,
            borderRadius: 14,
            background: T.bgC,
            border: `1px solid ${T.t1}`,
            marginBottom: fl(20, 28, vw),
          }}
        >
          <div style={{fontSize: fl(9, 11, vw), color: T.t4, marginBottom: 6}}>
            お問い合わせ
          </div>
          <div
            style={{
              fontSize: fl(10, 12, vw),
              fontWeight: 700,
              color: T.tx,
              marginBottom: 4,
            }}
          >
            📞 03-6903-5371 ／ ✉ customersupport@mng-base.com
          </div>
          <div style={{fontSize: fl(8, 10, vw), color: T.t4}}>
            LINE・X (旧Twitter) でのお問い合わせも受付中
          </div>
        </div>

        {/* Links & copyright */}
        <div
          style={{
            textAlign: 'center',
            fontSize: fl(8, 10, vw),
            color: T.t3,
            lineHeight: 1.8,
          }}
        >
          <Link
            to="/policies/terms-of-service"
            style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}
          >
            利用規約
          </Link>
          <Link
            to="/policies/privacy-policy"
            style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}
          >
            プライバシーポリシー
          </Link>
          <Link
            to="/policies/legal-notice"
            style={{color: T.t4, textDecoration: 'underline', marginRight: 12}}
          >
            特定商取引法
          </Link>
          <Link
            to="/policies/refund-policy"
            style={{color: T.t4, textDecoration: 'underline'}}
          >
            返品ポリシー
          </Link>
          <div style={{marginTop: 10}}>
            © Mining Base Co., Ltd. ALL RIGHTS RESERVED.
          </div>
        </div>
      </section>
    </footer>
  );
}
