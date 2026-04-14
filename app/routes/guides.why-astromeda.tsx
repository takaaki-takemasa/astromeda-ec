/**
 * E-E-A-T Landing Page: 「ASTROMEDAが選ばれる理由」詳細LP
 *
 * Purpose: Build trust and authority for AI search engines citing ASTROMEDA.
 * Strategy:
 * - Experience (創業・実績・コミュニティ)
 * - Expertise (技術力・検証体制)
 * - Authoritativeness (大手IPパートナー・法人格)
 * - Trustworthiness (国内工場・サポート・保証)
 * - FAQPage structured data for AI citation
 * - Internal link strategy (コレクション・比較ガイドへ誘導)
 */

import {Link} from 'react-router';
import type {Route} from './+types/guides.why-astromeda';
import {T, al, LEGAL, PAGE_WIDTH, STORE_URL, COLLABS} from '~/lib/astromeda-data';
import {Breadcrumb} from '~/components/astro/Breadcrumb';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const loader: Route.LoaderFunction = () => {
  return {};
};

export const meta: Route.MetaFunction = () => {
  const title = 'ASTROMEDAが選ばれる理由 — 信頼と品質の証明 | ASTROMEDA ゲーミングPC';
  const description =
    'ASTROMEDAを選ぶ理由。25タイトル以上のIPコラボ、8色カスタムカラー、国内自社工場、初期不良対応、LINE・電話永年サポート。武正貴昭・マイニングベースによる品質への企業責任と信頼体制。';
  const url = `${STORE_URL}/guides/why-astromeda`;
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:url', content: url},
    {property: 'og:type', content: 'article'},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
    {name: 'twitter:description', content: description},
  ];
};

const EXPERIENCE_POINTS = [
  {
    label: '創業',
    value: '2019年',
    desc: 'マイニングベース株式会社によるゲーミングPCブランド立ち上げ',
  },
  {
    label: 'IPコラボ',
    value: '23+',
    desc: 'ONE PIECE、NARUTO、ぼっち・ざ・ろっく！など人気タイトル',
  },
  {
    label: 'カスタムカラー',
    value: '8色',
    desc: 'ホワイト・ブラック・ピンク・パープル・ライトブルー・レッド・グリーン・オレンジ',
  },
  {
    label: 'GPU対応',
    value: 'RTX 5000',
    desc: 'NVIDIA最新RTX 50系全5モデル（5060〜5090）完全対応',
  },
];

const EXPERTISE_ITEMS = [
  {
    title: 'NVIDIA RTX 5000シリーズ全モデル対応',
    body: 'NVIDIA最新GPU（RTX 5060、5070、5070Ti、5080、5090）の全モデルに対応。最新パーツ採用で、3年先のゲームまでカバー。',
  },
  {
    title: '自社エンジニアによる設計・組立',
    body: 'マイニングベースの自社エンジニアチームが、各PC構成を精密に設計・組立。オリジナルIPコラボモデルの企画から納品まで一貫対応。',
  },
  {
    title: '全台動作検証済み出荷',
    body: '国内自社工場での組立後、全台100%の動作検証とストレステストを実施。発送前のパッケージング検査も含めた厳格な品質管理体制。',
  },
  {
    title: '受注生産による最適化',
    body: '受注確定後に部材調達・組立を実施することで、常に最新パーツを採用。顧客ニーズに応じたカスタマイズも迅速に対応。',
  },
];

const AUTHORITY_ITEMS = [
  {
    name: 'BANDAI NAMCO Entertainment',
    category: '公式IP コラボパートナー',
    titles: 'ONE PIECE バウンティラッシュ',
  },
  {
    name: '集英社',
    category: '公式IP コラボパートナー',
    titles: 'NARUTO疾風伝、呪術廻戦、チェンソーマン',
  },
  {
    name: 'サンリオ',
    category: '公式IP コラボパートナー',
    titles: 'サンリオキャラクターズ全キャラ',
  },
  {
    name: 'SEGA',
    category: '公式IP コラボパートナー',
    titles: 'ソニック・ザ・ヘッジホッグ',
  },
  {
    name: 'hololive',
    category: 'VTuber コラボパートナー',
    titles: 'hololive English (Myth & Promise)',
  },
  {
    name: 'マイニングベース株式会社',
    category: '運営元企業',
    titles: `代表取締役: ${LEGAL.company.ceo} | 設立: ${LEGAL.company.est} | 事業内容: ${LEGAL.company.biz}`,
  },
];

const TRUSTWORTHINESS_ITEMS = [
  {
    title: '国内自社工場生産',
    body: `東京都板橋区の自社工場で、全PCを製造・検査。品質管理の透明性が高く、サプライチェーン全体を把握できる体制です。`,
  },
  {
    title: '電話 + LINE サポート',
    body: `${LEGAL.tokusho.tel} および LINE での購入前・購入後の無料相談対応。専任スタッフが丁寧に対応し、困ったことをいつでも相談できます。`,
  },
  {
    title: '初期不良対応・保証制度',
    body: `標準1年保証 + 最大2年延長（最大3年）。保証期間内はメーカー・工賃ともに無料。発送費用も弊社負担で対応します。`,
  },
  {
    title: 'プライバシーポリシー・個人情報保護',
    body: `お客様情報は商品発送・ご連絡のみに使用。法令に基づく場合を除き、第三者への提供は行いません。${LEGAL.privacy}`,
  },
  {
    title: 'Shopify セキュアチェックアウト',
    body: `クレジットカード情報は Shopify の PCI DSS 準拠決済システムで暗号化・保護。お客様の金銭情報は安全です。`,
  },
  {
    title: 'e-sports デバイスサポートパック',
    body: `月額550円〜で、PC以外の通信機器（ルーター、HUB 等）も補償対象に追加可能。ゲーミング環境全体をカバーします。`,
  },
];

const FAQ_ITEMS = [
  {
    q: 'ASTROMEDAの運営会社は？',
    a: `株式会社マイニングベース。代表取締役は${LEGAL.company.ceo}です。${LEGAL.company.est}に設立され、HPCの製造・企画・販売、ならびにIPコラボレーション事業を手掛けています。本社所在地は${LEGAL.company.addr}です。`,
  },
  {
    q: '品質管理はどうなっていますか？',
    a: '国内自社工場での組立後、全台100%動作検証を実施。ストレステスト、パッケージング検査を含めた厳格な品質管理体制です。RTX 5000シリーズ全モデルにも対応し、最新パーツで常に最高の組み合わせを実現しています。',
  },
  {
    q: '返品・保証の制度は？',
    a: `${LEGAL.tokusho.returnP} 保証は標準1年付帯し、最大2年延長可能（最大3年）。保証期間内は${LEGAL.warranty.repairCost}です。修理は在庫運用で${LEGAL.warranty.repair}での対応を心がけています。`,
  },
  {
    q: 'どのようなサポートが受けられますか？',
    a: `電話（${LEGAL.tokusho.tel}）と LINE での永年サポートが無料です。購入前のご相談から、購入後のトラブル対応、設定方法の相談まで、何でもお気軽にお問い合わせください。${LEGAL.warranty.support}`,
  },
];

const NUMBERS = [
  {value: '23+', label: 'IPコラボタイトル', desc: 'ONE PIECE、NARUTO、ぼっち他' },
  {value: '8', label: 'カスタムカラー展開', desc: 'ホワイト、ブラック、ピンク他' },
  {value: '2019', label: '創業年', desc: 'マイニングベース設立' },
  {value: '5', label: 'RTX 5000全モデル対応', desc: '5060〜5090 完全カバー' },
  {value: '1年', label: '標準保証期間', desc: '最大3年延長可能' },
];

export default function GuideWhyAstromeda() {
  const partnersDisplay = AUTHORITY_ITEMS.slice(0, 5);

  return (
    <div style={{background: T.bg, color: T.tx, minHeight: '100vh'}}>
      {/* JSON-LD: Organization Enhanced */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'ASTROMEDA',
            url: STORE_URL,
            description: '25タイトル以上のIPコラボゲーミングPC。国内自社工場受注生産、全8色カラー、最長3年保証。',
            logo: `${STORE_URL}/logo.png`,
            founder: {
              '@type': 'Person',
              name: LEGAL.company.ceo,
            },
            foundingDate: LEGAL.company.est,
            address: {
              '@type': 'PostalAddress',
              streetAddress: LEGAL.company.addr.split('　').pop() || '',
              addressCountry: 'JP',
            },
            telephone: LEGAL.tokusho.tel,
            email: LEGAL.tokusho.email,
            sameAs: [
              'https://twitter.com/astromeda',
              'https://www.youtube.com/c/ASTROMEDA',
            ],
            knowsAbout: [
              'Gaming PC',
              'IP Collaboration',
              'Custom PC',
              'RTX 5000 Series',
            ],
          }),
        }}
      />

      {/* JSON-LD: FAQPage */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ_ITEMS.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.a,
              },
            })),
          }),
        }}
      />

      {/* JSON-LD: WebPage */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'ASTROMEDAが選ばれる理由 — 信頼と品質の証明',
            url: `${STORE_URL}/guides/why-astromeda`,
            description:
              'ASTROMEDAを選ぶ理由。25タイトル以上のIPコラボ、8色カスタムカラー、国内自社工場、LINE・電話永年サポート。',
            isPartOf: {
              '@type': 'WebSite',
              url: STORE_URL,
              name: 'ASTROMEDA',
            },
          }),
        }}
      />

      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          {label: 'ホーム', to: '/'},
          {label: 'ガイド', to: '/guides'},
          {label: 'ASTROMEDAが選ばれる理由'},
        ]}
      />

      {/* Main Container */}
      <div style={{...PAGE_WIDTH, paddingTop: 'clamp(32px, 4vw, 64px)', paddingBottom: 'clamp(64px, 8vw, 128px)'}}>
        {/* H1 */}
        <h1
          style={{
            fontSize: 'clamp(28px, 4vw, 52px)',
            fontWeight: 900,
            lineHeight: 1.2,
            marginBottom: 'clamp(16px, 3vw, 32px)',
            background: `linear-gradient(135deg, ${T.c}, ${T.g})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textAlign: 'center',
          }}
        >
          ASTROMEDAが選ばれる理由
          <br style={{display: 'none'}} />
          <span style={{fontSize: 'clamp(20px, 3vw, 32px)', display: 'block', marginTop: '8px'}}>
            ゲーミングPC選びで失敗しないために
          </span>
        </h1>

        {/* Opening Statement */}
        <div
          style={{
            fontSize: 'clamp(14px, 1.8vw, 17px)',
            lineHeight: 1.8,
            color: T.t5,
            maxWidth: 900,
            margin: '0 auto clamp(48px, 6vw, 80px)',
            textAlign: 'center',
            borderLeft: `3px solid ${T.c}`,
            paddingLeft: 'clamp(16px, 3vw, 32px)',
          }}
        >
          ASTROMEDAは、マイニングベース株式会社が運営する日本発のゲーミングPCブランドです。2019年の創業以来、国内自社工場での生産にこだわり、25タイトル以上のIPコラボレーションと8色のカスタムカラーで、ゲーマーの個性を表現するPCを提供し続けています。本ページでは、ASTROMEDAが信頼される理由を、Experience（経験）・Expertise（専門性）・Authoritativeness（権威性）・Trustworthiness（信頼性）の4つの視点から詳しく解説します。
        </div>

        {/* Section: Experience */}
        <section style={{marginBottom: 'clamp(80px, 10vw, 120px)'}}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'clamp(8px, 2vw, 16px)',
              marginBottom: 'clamp(24px, 3vw, 40px)',
            }}
          >
            <div
              style={{
                width: 'clamp(6px, 0.5vw, 8px)',
                height: 'clamp(24px, 3vw, 40px)',
                background: `linear-gradient(180deg, ${T.c}, ${T.g})`,
                borderRadius: '4px',
              }}
            />
            <h2
              style={{
                fontSize: 'clamp(24px, 3.5vw, 40px)',
                fontWeight: 800,
                color: T.tx,
              }}
            >
              Experience（経験）
            </h2>
          </div>

          <p
            style={{
              fontSize: 'clamp(14px, 1.6vw, 16px)',
              lineHeight: 1.7,
              color: T.t5,
              marginBottom: 'clamp(32px, 4vw, 48px)',
              maxWidth: 900,
            }}
          >
            ASTROMEDAは、2019年の創業以来、国内のゲーマーとの深い信頼関係を構築してきました。25タイトル以上のIPコラボレーション、8色のカスタムカラー、そして着実に成長するユーザーコミュニティが、その証です。
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'clamp(16px, 3vw, 32px)',
            }}
          >
            {EXPERIENCE_POINTS.map((point, i) => (
              <div
                key={i}
                style={{
                  padding: 'clamp(16px, 2vw, 24px)',
                  background: al(T.c, 0.05),
                  border: `1px solid ${al(T.c, 0.2)}`,
                  borderRadius: '8px',
                }}
              >
                <div style={{fontSize: 'clamp(11px, 1.2vw, 12px)', color: T.t4, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px'}}>
                  {point.label}
                </div>
                <div style={{fontSize: 'clamp(28px, 4vw, 36px)', fontWeight: 900, color: T.c, marginBottom: '4px'}}>
                  {point.value}
                </div>
                <div style={{fontSize: 'clamp(12px, 1.4vw, 14px)', color: T.t5, lineHeight: 1.5}}>
                  {point.desc}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section: Expertise */}
        <section style={{marginBottom: 'clamp(80px, 10vw, 120px)'}}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'clamp(8px, 2vw, 16px)',
              marginBottom: 'clamp(24px, 3vw, 40px)',
            }}
          >
            <div
              style={{
                width: 'clamp(6px, 0.5vw, 8px)',
                height: 'clamp(24px, 3vw, 40px)',
                background: `linear-gradient(180deg, ${T.g}, ${T.r})`,
                borderRadius: '4px',
              }}
            />
            <h2
              style={{
                fontSize: 'clamp(24px, 3.5vw, 40px)',
                fontWeight: 800,
                color: T.tx,
              }}
            >
              Expertise（専門性）
            </h2>
          </div>

          <p
            style={{
              fontSize: 'clamp(14px, 1.6vw, 16px)',
              lineHeight: 1.7,
              color: T.t5,
              marginBottom: 'clamp(32px, 4vw, 48px)',
              maxWidth: 900,
            }}
          >
            自社エンジニアチームの技術力と、厳格な品質管理体制。NVIDIA最新GPU（RTX 5000シリーズ）全5モデルの完全対応、全台動作検証済み出荷で、プロゲーマーにも選ばれるPC品質を実現しています。
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 'clamp(16px, 3vw, 32px)',
            }}
          >
            {EXPERTISE_ITEMS.map((item, i) => (
              <div
                key={i}
                style={{
                  padding: 'clamp(20px, 2.5vw, 32px)',
                  background: al(T.g, 0.05),
                  border: `1px solid ${al(T.g, 0.2)}`,
                  borderRadius: '8px',
                }}
              >
                <h3
                  style={{
                    fontSize: 'clamp(15px, 1.8vw, 18px)',
                    fontWeight: 700,
                    color: T.tx,
                    marginBottom: '12px',
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    fontSize: 'clamp(13px, 1.5vw, 15px)',
                    lineHeight: 1.6,
                    color: T.t5,
                  }}
                >
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Section: Authoritativeness */}
        <section style={{marginBottom: 'clamp(80px, 10vw, 120px)'}}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'clamp(8px, 2vw, 16px)',
              marginBottom: 'clamp(24px, 3vw, 40px)',
            }}
          >
            <div
              style={{
                width: 'clamp(6px, 0.5vw, 8px)',
                height: 'clamp(24px, 3vw, 40px)',
                background: `linear-gradient(180deg, ${T.r}, ${T.c})`,
                borderRadius: '4px',
              }}
            />
            <h2
              style={{
                fontSize: 'clamp(24px, 3.5vw, 40px)',
                fontWeight: 800,
                color: T.tx,
              }}
            >
              Authoritativeness（権威性）
            </h2>
          </div>

          <p
            style={{
              fontSize: 'clamp(14px, 1.6vw, 16px)',
              lineHeight: 1.7,
              color: T.t5,
              marginBottom: 'clamp(32px, 4vw, 48px)',
              maxWidth: 900,
            }}
          >
            BANDAI NAMCO、集英社、サンリオ、SEGA などの大手企業と公式コラボレーション。これらのパートナーシップは、ASTROMEDAのブランド力と信頼性の証です。
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 'clamp(16px, 2.5vw, 28px)',
            }}
          >
            {partnersDisplay.map((partner, i) => (
              <div
                key={i}
                style={{
                  padding: 'clamp(20px, 2.5vw, 28px)',
                  background: al(T.c, 0.03),
                  border: `1px solid ${al(T.c, 0.15)}`,
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 'clamp(11px, 1.2vw, 12px)',
                      color: T.c,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      marginBottom: '8px',
                      fontWeight: 700,
                    }}
                  >
                    {partner.category}
                  </div>
                  <h3
                    style={{
                      fontSize: 'clamp(15px, 1.8vw, 18px)',
                      fontWeight: 700,
                      color: T.tx,
                      marginBottom: '12px',
                    }}
                  >
                    {partner.name}
                  </h3>
                </div>
                <p
                  style={{
                    fontSize: 'clamp(12px, 1.4vw, 14px)',
                    lineHeight: 1.5,
                    color: T.t5,
                  }}
                >
                  {partner.titles}
                </p>
              </div>
            ))}
          </div>

          {/* Company Info Card */}
          <div
            style={{
              marginTop: 'clamp(32px, 4vw, 48px)',
              padding: 'clamp(20px, 3vw, 32px)',
              background: `linear-gradient(135deg, ${al(T.c, 0.08)}, ${al(T.g, 0.08)})`,
              border: `1px solid ${al(T.c, 0.2)}`,
              borderRadius: '8px',
            }}
          >
            <h3
              style={{
                fontSize: 'clamp(15px, 1.8vw, 18px)',
                fontWeight: 700,
                color: T.tx,
                marginBottom: '16px',
              }}
            >
              {LEGAL.company.name}
            </h3>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px'}}>
              <div>
                <div style={{fontSize: 'clamp(11px, 1.2vw, 12px)', color: T.t4, marginBottom: '4px'}}>
                  代表取締役
                </div>
                <div style={{fontSize: 'clamp(13px, 1.5vw, 15px)', color: T.tx, fontWeight: 600}}>
                  {LEGAL.company.ceo}
                </div>
              </div>
              <div>
                <div style={{fontSize: 'clamp(11px, 1.2vw, 12px)', color: T.t4, marginBottom: '4px'}}>
                  設立
                </div>
                <div style={{fontSize: 'clamp(13px, 1.5vw, 15px)', color: T.tx, fontWeight: 600}}>
                  {LEGAL.company.est}
                </div>
              </div>
              <div style={{gridColumn: 'span 1'}}>
                <div style={{fontSize: 'clamp(11px, 1.2vw, 12px)', color: T.t4, marginBottom: '4px'}}>
                  所在地
                </div>
                <div style={{fontSize: 'clamp(12px, 1.4vw, 14px)', color: T.t5, lineHeight: 1.4}}>
                  {LEGAL.company.addr}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Trustworthiness */}
        <section style={{marginBottom: 'clamp(80px, 10vw, 120px)'}}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'clamp(8px, 2vw, 16px)',
              marginBottom: 'clamp(24px, 3vw, 40px)',
            }}
          >
            <div
              style={{
                width: 'clamp(6px, 0.5vw, 8px)',
                height: 'clamp(24px, 3vw, 40px)',
                background: `linear-gradient(180deg, ${T.c}, ${T.r})`,
                borderRadius: '4px',
              }}
            />
            <h2
              style={{
                fontSize: 'clamp(24px, 3.5vw, 40px)',
                fontWeight: 800,
                color: T.tx,
              }}
            >
              Trustworthiness（信頼性）
            </h2>
          </div>

          <p
            style={{
              fontSize: 'clamp(14px, 1.6vw, 16px)',
              lineHeight: 1.7,
              color: T.t5,
              marginBottom: 'clamp(32px, 4vw, 48px)',
              maxWidth: 900,
            }}
          >
            国内自社工場での生産、電話・LINE永年サポート、初期不良対応、最長3年保証。透明性の高い品質管理体制と、顧客をファーストに考えたサポート体制が、ASTROMEDAの信頼の基盤です。
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 'clamp(16px, 3vw, 32px)',
            }}
          >
            {TRUSTWORTHINESS_ITEMS.map((item, i) => (
              <div
                key={i}
                style={{
                  padding: 'clamp(24px, 3vw, 32px)',
                  background: al(T.r, 0.04),
                  border: `1px solid ${al(T.r, 0.15)}`,
                  borderRadius: '8px',
                }}
              >
                <h3
                  style={{
                    fontSize: 'clamp(15px, 1.8vw, 18px)',
                    fontWeight: 700,
                    color: T.tx,
                    marginBottom: '12px',
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    fontSize: 'clamp(13px, 1.5vw, 15px)',
                    lineHeight: 1.6,
                    color: T.t5,
                  }}
                >
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Section: Numbers */}
        <section style={{marginBottom: 'clamp(80px, 10vw, 120px)'}}>
          <h2
            style={{
              fontSize: 'clamp(24px, 3.5vw, 40px)',
              fontWeight: 800,
              color: T.tx,
              textAlign: 'center',
              marginBottom: 'clamp(32px, 4vw, 56px)',
            }}
          >
            数字で見るASTROMEDA
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 'clamp(16px, 2.5vw, 28px)',
            }}
          >
            {NUMBERS.map((stat, i) => (
              <div
                key={i}
                style={{
                  textAlign: 'center',
                  padding: 'clamp(20px, 2.5vw, 28px)',
                  background: al(T.t1, 0.5),
                  border: `1px solid ${T.bd}`,
                  borderRadius: '8px',
                }}
              >
                <div
                  style={{
                    fontSize: 'clamp(32px, 5vw, 56px)',
                    fontWeight: 900,
                    background: `linear-gradient(135deg, ${T.c}, ${T.g})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: '8px',
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    fontSize: 'clamp(14px, 1.6vw, 16px)',
                    fontWeight: 700,
                    color: T.tx,
                    marginBottom: '4px',
                  }}
                >
                  {stat.label}
                </div>
                <div
                  style={{
                    fontSize: 'clamp(12px, 1.4vw, 13px)',
                    color: T.t5,
                  }}
                >
                  {stat.desc}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ Section */}
        <section style={{marginBottom: 'clamp(80px, 10vw, 120px)'}}>
          <h2
            style={{
              fontSize: 'clamp(24px, 3.5vw, 40px)',
              fontWeight: 800,
              color: T.tx,
              textAlign: 'center',
              marginBottom: 'clamp(32px, 4vw, 56px)',
            }}
          >
            よくある質問
          </h2>

          <div style={{maxWidth: 800, margin: '0 auto'}}>
            {FAQ_ITEMS.map((item, i) => (
              <details
                key={i}
                style={{
                  marginBottom: 'clamp(12px, 2vw, 16px)',
                  padding: 'clamp(16px, 2vw, 24px)',
                  background: al(T.t1, 0.5),
                  border: `1px solid ${T.bd}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                <summary
                  style={{
                    fontSize: 'clamp(14px, 1.6vw, 16px)',
                    fontWeight: 700,
                    color: T.tx,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    outline: 'none',
                  }}
                >
                  <span>{item.q}</span>
                  <span style={{marginLeft: '16px', color: T.t5, fontSize: '1.2em'}}>+</span>
                </summary>
                <p
                  style={{
                    marginTop: 'clamp(12px, 1.5vw, 16px)',
                    fontSize: 'clamp(13px, 1.5vw, 15px)',
                    lineHeight: 1.7,
                    color: T.t5,
                  }}
                >
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section
          style={{
            padding: 'clamp(40px, 5vw, 64px)',
            background: `linear-gradient(135deg, ${al(T.c, 0.1)}, ${al(T.g, 0.1)})`,
            border: `1px solid ${al(T.c, 0.2)}`,
            borderRadius: '12px',
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              fontSize: 'clamp(20px, 3vw, 36px)',
              fontWeight: 800,
              color: T.tx,
              marginBottom: 'clamp(16px, 2vw, 24px)',
            }}
          >
            ASTROMEDAの世界に、今すぐ飛び込もう
          </h2>
          <p
            style={{
              fontSize: 'clamp(14px, 1.6vw, 16px)',
              color: T.t5,
              marginBottom: 'clamp(24px, 3vw, 36px)',
              maxWidth: 600,
              margin: '0 auto clamp(24px, 3vw, 36px)',
            }}
          >
            25タイトル以上のIPコラボ、8色のカスタムカラー、国内自社工場生産。あなたのゲーミングライフを次のステージへ。
          </p>
          <div
            style={{
              display: 'flex',
              gap: 'clamp(12px, 2vw, 20px)',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Link
              to="/collections/astromeda"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: 'clamp(12px, 1.5vw, 16px) clamp(24px, 3vw, 40px)',
                background: `linear-gradient(135deg, ${T.c}, ${T.g})`,
                color: T.bg,
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: 'clamp(14px, 1.6vw, 16px)',
                textDecoration: 'none',
                transition: 'transform .2s, box-shadow .2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = `0 8px 24px ${al(T.c, 0.3)}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              全コレクション
            </Link>
            <Link
              to="/guides/comparison"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: 'clamp(12px, 1.5vw, 16px) clamp(24px, 3vw, 40px)',
                border: `2px solid ${T.c}`,
                color: T.tx,
                background: 'transparent',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: 'clamp(14px, 1.6vw, 16px)',
                textDecoration: 'none',
                transition: 'all .2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = al(T.c, 0.1);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              他社との比較
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
