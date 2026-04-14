import {Link} from 'react-router';
import {T, PAGE_WIDTH} from '~/lib/astromeda-data';

type GuideContext = 'gaming' | 'streaming' | 'creative' | 'general';

interface RelatedGuidesProps {
  context?: GuideContext;
}

const GUIDE_MAP: Record<GuideContext, Array<{slug: string; title: string; description: string}>> = {
  gaming: [
    {
      slug: 'benchmark',
      title: 'GPU性能ベンチマーク比較',
      description: 'RTX 5060〜5090の実測データ。複数ゲームでのFPS計測結果。',
    },
    {
      slug: 'how-to-choose',
      title: 'ゲーミングPCの選び方',
      description: '初心者向け完全ガイド。GPU別比較表、予算別構成を掲載。',
    },
    {
      slug: 'cospa',
      title: 'コスパ比較ガイド',
      description: '予算別おすすめスペック。20万・30万・40万円台の最適構成。',
    },
  ],
  streaming: [
    {
      slug: 'streaming',
      title: '配信向けPCガイド',
      description: 'OBS、StreamLabsの配信に必要なスペック解説。',
    },
    {
      slug: 'benchmark',
      title: 'GPU性能ベンチマーク',
      description: 'ゲームプレイ+配信同時処理に必要なGPU性能の目安。',
    },
    {
      slug: 'how-to-choose',
      title: 'PCの選び方ガイド',
      description: 'スペック選定の基礎知識から応用まで。',
    },
  ],
  creative: [
    {
      slug: 'cospa',
      title: 'コスパ比較ガイド',
      description: '動画編集・3DCG向けのスペック別コスパ比較。',
    },
    {
      slug: 'how-to-choose',
      title: 'ゲーミングPCの選び方',
      description: 'クリエイティブワークに向いたPC選定のポイント。',
    },
    {
      slug: 'benchmark',
      title: 'GPU性能ベンチマーク',
      description: 'レンダリング・エンコード処理での性能差を数値化。',
    },
  ],
  general: [
    {
      slug: 'beginners',
      title: 'ゲーミングPC入門ガイド',
      description: 'GPU、CPU、メモリの基礎知識から選び方まで。',
    },
    {
      slug: 'how-to-choose',
      title: 'ゲーミングPCの選び方',
      description: '初心者向けの完全ガイド。5000文字級の権威的記事。',
    },
    {
      slug: 'benchmark',
      title: 'GPU性能ベンチマーク比較',
      description: '実測データで性能を徹底比較。用途別推奨ガイド付き。',
    },
  ],
};

export function RelatedGuides({context = 'general'}: RelatedGuidesProps) {
  const guides = GUIDE_MAP[context];

  return (
    <section
      style={{
        borderTop: `1px solid ${T.bd}`,
        backgroundColor: `rgba(0, 240, 255, 0.02)`,
        backdropFilter: T.bl,
        marginTop: '60px',
        paddingTop: '40px',
        paddingBottom: '40px',
      }}
    >
      <div style={PAGE_WIDTH}>
        {/* Header */}
        <div style={{marginBottom: 32}}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.c,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              margin: '0 0 8px 0',
            }}
          >
            関連ガイド
          </p>
          <h2
            style={{
              fontSize: 'clamp(18px, 2vw, 24px)',
              fontWeight: 800,
              color: T.tx,
              margin: '0 0 8px 0',
            }}
          >
            PCの選び方をもっと詳しく
          </h2>
          <p
            style={{
              fontSize: 13,
              color: T.t4,
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            初心者向けガイドから性能比較まで。ASTROMEDAのスタッフが解説します。
          </p>
        </div>

        {/* Guide Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
          }}
        >
          {guides.map((guide) => (
            <Link
              key={guide.slug}
              to={`/guides/${guide.slug}`}
              style={{textDecoration: 'none', color: 'inherit'}}
            >
              <div
                style={{
                  padding: 24,
                  border: `1px solid ${T.bd}`,
                  borderRadius: 12,
                  backgroundColor: T.bgE,
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
                onMouseEnter={(e) => {
                  const elem = e.currentTarget as HTMLElement;
                  elem.style.borderColor = T.c;
                  elem.style.backgroundColor = `rgba(0, 240, 255, 0.08)`;
                  elem.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  const elem = e.currentTarget as HTMLElement;
                  elem.style.borderColor = T.bd;
                  elem.style.backgroundColor = T.bgE;
                  elem.style.transform = 'translateY(0)';
                }}
              >
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: T.c,
                    margin: '0 0 8px 0',
                    lineHeight: 1.4,
                  }}
                >
                  {guide.title}
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: T.t4,
                    margin: '0 0 16px 0',
                    lineHeight: 1.6,
                    flex: 1,
                  }}
                >
                  {guide.description}
                </p>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: T.g,
                    marginTop: 'auto',
                  }}
                >
                  詳しく読む →
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div style={{textAlign: 'center', marginTop: 32}}>
          <Link
            to="/guides"
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              border: `1px solid ${T.bd}`,
              borderRadius: 8,
              color: T.tx,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 700,
              transition: 'all 0.2s ease',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              const elem = e.currentTarget as HTMLElement;
              elem.style.borderColor = T.c;
              elem.style.backgroundColor = `rgba(0, 240, 255, 0.12)`;
            }}
            onMouseLeave={(e) => {
              const elem = e.currentTarget as HTMLElement;
              elem.style.borderColor = T.bd;
              elem.style.backgroundColor = 'transparent';
            }}
          >
            ガイド一覧を見る
          </Link>
        </div>
      </div>
    </section>
  );
}
