/**
 * FAQ（よくある質問）ページ
 *
 * SEO最適化:
 * - FAQPage Schema.org JSON-LD 構造化データ実装
 * - 20問のFAQ（注文・配送・保証・返品・カスタマイズ・コラボ）
 * - アコーディオン形式のUI
 * - meta description 最適化
 *
 * patch 0020 (P0-D): astromeda_faq_item Metaobject から CMS 駆動。
 * is_active=true のレコードがあれば CMS のリストを使い、無ければ
 * ハードコードされた FAQ_ITEMS にフォールバック。
 */

import {useState} from 'react';
import {useLoaderData} from 'react-router';
import type {Route} from './+types/faq';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

interface FaqItem {
  q: string;
  a: string;
  category: string;
}

export async function loader(args: Route.LoaderArgs) {
  const {env} = args.context;
  let items: FaqItem[] = [];
  try {
    const {setAdminEnv, getAdminClient} = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(env as unknown as Record<string, string | undefined>);
    const client = getAdminClient();
    const records = await client.getMetaobjects('astromeda_faq_item', 100);
    const parsed = (records || [])
      .map((r) => {
        const map: Record<string, string> = {};
        for (const f of r.fields) map[f.key] = f.value;
        return {
          question: map['question'] || '',
          answer: map['answer'] || '',
          category: map['category'] || 'その他',
          isActive: map['is_active'] === 'true',
          displayOrder: Number(map['display_order'] || 0),
        };
      })
      .filter((x) => x.isActive && x.question && x.answer);
    parsed.sort((a, b) => a.displayOrder - b.displayOrder);
    items = parsed.map((x) => ({q: x.question, a: x.answer, category: x.category}));
  } catch {
    items = [];
  }
  return {cmsItems: items};
}

export const meta: Route.MetaFunction = () => {
  const title = 'よくある質問（FAQ） | ASTROMEDA ゲーミングPC';
  const description = 'ASTROMEDAゲーミングPCに関するよくある質問。注文方法、配送、保証、返品、カスタマイズ、IPコラボレーションなど。';
  const url = `${STORE_URL}/faq`;
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:url', content: url},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
  ];
};

// FAQ データ（20問・CMSにレコードがないときのフォールバック）
const HARDCODED_FAQ_ITEMS: FaqItem[] = [
  // 注文・購入
  {
    category: '注文・購入',
    q: '注文方法を教えてください',
    a: '商品ページからお好きなモデルとスペックを選択し、「カートに追加」ボタンを押してください。カートページで数量を確認後、チェックアウトに進んでお支払い情報を入力します。クレジットカード（一括/分割）および銀行振込がご利用いただけます。',
  },
  {
    category: '注文・購入',
    q: '注文のキャンセルはできますか？',
    a: '銀行振込の場合、注文日から3営業日以内に入金確認ができない場合は自動キャンセルとなります。クレジットカード決済の場合、製造開始前であればカスタマーサポート（customersupport@mng-base.com）にご連絡ください。製造開始後のキャンセルは原則お受けできません。',
  },
  {
    category: '注文・購入',
    q: '分割払いは利用できますか？',
    a: 'はい、クレジットカードの分割払いに対応しています。分割回数はお使いのクレジットカード会社の規定に準じます。',
  },
  {
    category: '注文・購入',
    q: 'ギフトカードの購入方法を教えてください',
    a: 'ギフトカードページからお好きな金額を選択して購入できます。購入後、ギフトカードコードがメールで届きます。受取人にコードを共有し、チェックアウト時に入力することで割引が適用されます。',
  },
  // 配送
  {
    category: '配送',
    q: 'PCの納期はどのくらいですか？',
    a: 'ゲーミングPCは受注生産のため、ご注文後10〜15営業日（土日祝を除く）前後でのお届けとなります。パーツの在庫状況や繁忙期により若干前後する場合がございます。',
  },
  {
    category: '配送',
    q: 'ガジェット・グッズの配送期間は？',
    a: 'マウスパッド、キーボード、アクリルスタンド等のガジェット・グッズは、ご注文後3〜5営業日でのお届けとなります。',
  },
  {
    category: '配送',
    q: '送料はいくらですか？',
    a: 'ゲーミングPCは全国一律¥3,300（税込）です。ガジェット・グッズの送料は商品ページに記載の金額をご確認ください。一定金額以上のお買い上げで送料無料キャンペーンを実施する場合があります。',
  },
  {
    category: '配送',
    q: '海外発送は対応していますか？',
    a: '現在、日本国内のみの配送となっております。海外発送への対応は検討中です。',
  },
  // 保証・修理
  {
    category: '保証・修理',
    q: '保証期間はどのくらいですか？',
    a: '全てのゲーミングPCにメーカー1年保証が標準付帯されています。さらに延長保証（2年延長で合計3年：¥14,800）もご用意しています。CPU・GPU含む全パーツの自然故障が対象です。',
  },
  {
    category: '保証・修理',
    q: '修理にはどのくらいかかりますか？',
    a: '修理部材を在庫運用しており、最短翌日〜3営業日で返却しています。保証期間内は送料含め完全無料、保証期間後は工賃無料（パーツ代のみ実費）となります。',
  },
  {
    category: '保証・修理',
    q: 'サポートの連絡方法は？',
    a: 'メール（customersupport@mng-base.com）、電話（03-6903-5371）、LINEでのサポートを永年提供しています。お気軽にご連絡ください。',
  },
  // 返品・交換
  {
    category: '返品・交換',
    q: '返品は可能ですか？',
    a: '初期不良の場合のみ、商品到着後7日以内にカスタマーサポートへご連絡いただければ対応いたします。お客様都合による返品は受注生産品の性質上、原則お受けできません。',
  },
  {
    category: '返品・交換',
    q: '届いた商品に問題がある場合はどうすれば？',
    a: '商品到着後7日以内にカスタマーサポートへご連絡ください。初期不良の場合は無償で修理・交換対応いたします。到着時の梱包材は念のため保管をお願いいたします。',
  },
  // カスタマイズ・スペック
  {
    category: 'カスタマイズ',
    q: 'PCのスペックは選べますか？',
    a: 'はい、各モデルで3ティア（GAMER / STREAMER / CREATOR）からお選びいただけます。ティアによってGPU、CPU、RAM容量が異なります。詳細は各商品ページをご確認ください。',
  },
  {
    category: 'カスタマイズ',
    q: 'PCのカラーは何色ありますか？',
    a: '全8色（ホワイト、ブラック、ピンク、パープル、ライトブルー、レッド、グリーン、オレンジ）からお選びいただけます。UV高精細印刷によるIPコラボデザインとの組み合わせが可能です。',
  },
  {
    category: 'カスタマイズ',
    q: '着せ替えパネルとは何ですか？',
    a: 'PCケースの側面パネルをIPコラボレーションデザインに着せ替えできるオプションパーツです。気分やお部屋の雰囲気に合わせて交換できます。',
  },
  // IPコラボ
  {
    category: 'IPコラボ',
    q: 'どんなIPとコラボしていますか？',
    a: '現在26タイトル以上のIPとコラボレーションしています。ONE PIECE、NARUTO、僕のヒーローアカデミア、呪術廻戦、チェンソーマン、ぼっち・ざ・ろっく！、サンリオ、ソニック、BLEACHなど、多彩なジャンルのIPをラインナップしています。',
  },
  {
    category: 'IPコラボ',
    q: 'コラボ商品は期間限定ですか？',
    a: 'IPによって異なりますが、多くのコラボ商品は在庫がなくなり次第終了となります。入荷通知機能をご利用いただくと、再入荷時にメールでお知らせします。',
  },
  {
    category: 'IPコラボ',
    q: 'コラボPCにはどんなグッズがセットになりますか？',
    a: 'IPによって異なりますが、PCの他にマウスパッド、キーボード、PCケース、着せ替えパネル、アクリルスタンド、アクリルキーホルダー、Tシャツ、缶バッジ、メタルカードなどのグッズも展開しています。',
  },
  // その他
  {
    category: 'その他',
    q: '実店舗はありますか？',
    a: '現在、オンラインストアでの販売がメインとなっております。ただし、各種イベントやポップアップストアでの出展を行うことがあります。最新情報はメールマガジンやSNSでお知らせしています。',
  },
];

// カテゴリの順序
const CATEGORIES = [
  '注文・購入',
  '配送',
  '保証・修理',
  '返品・交換',
  'カスタマイズ',
  'IPコラボ',
  'その他',
];

export default function FAQ() {
  const {cmsItems} = useLoaderData<typeof loader>();
  const FAQ_ITEMS: FaqItem[] = cmsItems && cmsItems.length > 0 ? cmsItems : HARDCODED_FAQ_ITEMS;
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());

  const toggle = (index: number) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
        color: T.tx,
      }}
    >
      <div
        style={{
          maxWidth: 800,
          margin: '0 auto',
          padding: 'clamp(32px, 4vw, 64px) clamp(16px, 4vw, 48px)',
        }}
      >
        {/* Header */}
        <div style={{textAlign: 'center', marginBottom: 48}}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.c,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 8,
            }}
          >
            FAQ
          </span>
          <h1
            style={{
              fontSize: 'clamp(24px, 4vw, 36px)',
              fontWeight: 900,
              margin: '0 0 12px',
            }}
          >
            よくある質問
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.6)',
              lineHeight: 1.6,
            }}
          >
            ご注文・配送・保証など、お客様からよくいただくご質問をまとめました。
          </p>
        </div>

        {/* FAQ by category */}
        {CATEGORIES.map((category) => {
          const items = FAQ_ITEMS.filter((item) => item.category === category);
          if (items.length === 0) return null;

          return (
            <section key={category} style={{marginBottom: 32}}>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: T.c,
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: '1px solid rgba(0,240,255,.15)',
                }}
              >
                {category}
              </h2>
              <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                {items.map((item) => {
                  const globalIndex = FAQ_ITEMS.indexOf(item);
                  const isOpen = openItems.has(globalIndex);
                  return (
                    <div
                      key={globalIndex}
                      style={{
                        background: 'rgba(255,255,255,.03)',
                        borderRadius: 10,
                        border: `1px solid ${isOpen ? 'rgba(0,240,255,.15)' : 'rgba(255,255,255,.06)'}`,
                        overflow: 'hidden',
                        transition: 'border-color .2s',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(globalIndex)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '14px 18px',
                          background: 'none',
                          border: 'none',
                          color: '#fff',
                          fontSize: 14,
                          fontWeight: 600,
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          lineHeight: 1.5,
                        }}
                      >
                        <span>{item.q}</span>
                        <span
                          style={{
                            fontSize: 18,
                            color: T.c,
                            transform: isOpen
                              ? 'rotate(45deg)'
                              : 'rotate(0deg)',
                            transition: 'transform .2s',
                            flexShrink: 0,
                            marginLeft: 12,
                          }}
                        >
                          +
                        </span>
                      </button>
                      {isOpen && (
                        <div
                          style={{
                            padding: '0 18px 14px',
                            fontSize: 13,
                            color: 'rgba(255,255,255,.7)',
                            lineHeight: 1.7,
                          }}
                        >
                          {item.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* Contact CTA */}
        <div
          style={{
            marginTop: 48,
            textAlign: 'center',
            padding: 32,
            background: 'rgba(255,255,255,.03)',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,.06)',
          }}
        >
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.6)',
              marginBottom: 12,
            }}
          >
            解決しない場合はお気軽にお問い合わせください
          </p>
          <a
            href="mailto:customersupport@mng-base.com"
            style={{
              display: 'inline-block',
              padding: '12px 32px',
              background: T.c,
              color: '#000',
              fontSize: 14,
              fontWeight: 700,
              borderRadius: 10,
              textDecoration: 'none',
            }}
          >
            お問い合わせ
          </a>
        </div>
      </div>

      {/* FAQPage Schema.org JSON-LD */}
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
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
