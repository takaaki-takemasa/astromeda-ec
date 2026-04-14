import {Link} from 'react-router';
import {T, PAGE_WIDTH} from '~/lib/astromeda-data';

type ProductContext = 'gaming' | 'streaming' | 'creative' | 'general';

interface RelatedProductsProps {
  context?: ProductContext;
}

const COLLECTION_MAP: Record<ProductContext, Array<{handle: string; title: string; description: string}>> = {
  gaming: [
    {
      handle: 'astromeda',
      title: 'ASTROMEDA ゲーミングPC',
      description: '初心者からeスポーツプロまで対応。3ティア構成で最適なスペックが見つかる。',
    },
    {
      handle: 'gadgets',
      title: 'ゲーミングガジェット',
      description: 'マウスパッド、キーボード、PCケースなどの周辺機器。',
    },
  ],
  streaming: [
    {
      handle: 'astromeda',
      title: 'ASTROMEDA ゲーミングPC',
      description: 'STREAMER/CREATORティアは配信・エンコーディングに最適化。',
    },
    {
      handle: 'goods',
      title: 'ストリーマー向けグッズ',
      description: 'コラボグッズ、アクスタなど配信スタイルに合わせたアイテム。',
    },
  ],
  creative: [
    {
      handle: 'astromeda',
      title: 'ASTROMEDA ゲーミングPC',
      description: 'CREATORティアは3Dレンダリング、動画編集に最高性能。RTX 5090搭載。',
    },
    {
      handle: 'gadgets',
      title: '周辺機器・アクセサリ',
      description: 'クリエイティブワークに便利なキーボード、パッドなど。',
    },
  ],
  general: [
    {
      handle: 'astromeda',
      title: 'ASTROMEDA ゲーミングPC',
      description: 'ゲーミングPC初心者向けから高性能モデルまで。IPコラボモデルも豊富。',
    },
    {
      handle: 'goods',
      title: 'グッズ・アクセサリ',
      description: 'Tシャツ、アクスタ、缶バッジなど推し活応援グッズ。',
    },
  ],
};

export function RelatedProducts({context = 'general'}: RelatedProductsProps) {
  const collections = COLLECTION_MAP[context];

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
            おすすめのPC
          </p>
          <h2
            style={{
              fontSize: 'clamp(18px, 2vw, 24px)',
              fontWeight: 800,
              color: T.tx,
              margin: '0 0 8px 0',
            }}
          >
            ガイドで学んだスペックを購入
          </h2>
          <p
            style={{
              fontSize: 13,
              color: T.t4,
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            ASTROMEDA ゲーミングPCは自社工場で高品質に製造。IPコラボモデルも充実。
          </p>
        </div>

        {/* Collection Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
          }}
        >
          {collections.map((collection) => (
            <Link
              key={collection.handle}
              to={`/collections/${collection.handle}`}
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
                  {collection.title}
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
                  {collection.description}
                </p>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: T.g,
                    marginTop: 'auto',
                  }}
                >
                  商品を見る →
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div style={{textAlign: 'center', marginTop: 32}}>
          <Link
            to="/collections/astromeda"
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              background: T.c,
              color: '#000',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 700,
              transition: 'all 0.2s ease',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              const elem = e.currentTarget as HTMLElement;
              elem.style.opacity = '0.9';
              elem.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              const elem = e.currentTarget as HTMLElement;
              elem.style.opacity = '1';
              elem.style.transform = 'translateY(0)';
            }}
          >
            PCラインナップを見る
          </Link>
        </div>
      </div>
    </section>
  );
}
