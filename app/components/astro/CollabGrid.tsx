import {useState} from 'react';
import {Link} from 'react-router';
import {T, al, fl, nameFs, FEATURED, REMAINING} from '~/lib/astromeda-data';

interface CollabGridProps {
  vw: number;
}

export function CollabGrid({vw}: CollabGridProps) {
  const [expanded, setExpanded] = useState(false);
  const sp = vw < 768;

  return (
    <section style={{padding: `0 ${fl(16, 48, vw)}px ${fl(20, 32, vw)}px`}}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          marginBottom: fl(16, 20, vw),
        }}
      >
        <span
          className="ph"
          style={{fontSize: fl(14, 18, vw), fontWeight: 900, color: T.tx}}
        >
          IP COLLABS
        </span>
        <span style={{fontSize: fl(10, 12, vw), color: T.t4}}>
          {FEATURED.length + (expanded ? REMAINING.length : 0)}タイトル表示中
        </span>
      </div>

      {/* Featured grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: sp
            ? '1fr 1fr'
            : 'repeat(3, 1fr)',
          gap: fl(10, 14, vw),
          marginBottom: fl(14, 20, vw),
        }}
      >
        {FEATURED.map((cb) => (
          <Link
            key={cb.id}
            to={`/collections/${cb.shop}`}
            className="collab-card"
            style={{
              border: `1px solid ${al(cb.accent, 0.12)}`,
              textDecoration: 'none',
            }}
          >
            {/* Image area with gradient placeholder */}
            <div
              style={{
                aspectRatio: sp ? '1/1' : '16/9',
                background: `linear-gradient(160deg, ${al(cb.accent, 0.25)}, ${T.bg} 65%)`,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `radial-gradient(circle at 35% 40%, ${al(cb.accent, 0.3)}, transparent 55%)`,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,.75))',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: sp ? 8 : 10,
                  left: sp ? 8 : 12,
                  right: sp ? 8 : 12,
                  zIndex: 1,
                }}
              >
                {cb.tag && (
                  <div
                    style={{
                      display: 'inline-block',
                      fontSize: sp ? 6 : 7,
                      fontWeight: 900,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: cb.tag === 'NEW' ? T.r : '#FF9500',
                      color: T.tx,
                      letterSpacing: 1,
                      marginBottom: sp ? 3 : 4,
                    }}
                  >
                    {cb.tag}
                  </div>
                )}
                <div
                  style={{
                    fontSize: nameFs(cb.name, fl(sp ? 11 : 13, sp ? 13 : 16, vw), fl(sp ? 8 : 10, sp ? 10 : 12, vw)),
                    fontWeight: 900,
                    color: T.tx,
                    textShadow: '0 2px 12px rgba(0,0,0,.8)',
                    lineHeight: 1.25,
                  }}
                >
                  {cb.name}
                </div>
                {!sp && (
                  <div style={{fontSize: 10, color: 'rgba(255,255,255,.5)', marginTop: 3}}>
                    {cb.cats.split(',').length}カテゴリ
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Expand button */}
      <div style={{textAlign: 'center'}}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            padding: sp ? '12px 20px' : '14px 40px',
            borderRadius: 14,
            border: `1px solid ${T.t2}`,
            background: expanded ? al(T.c, 0.06) : 'transparent',
            cursor: 'pointer',
            color: T.t5,
            fontSize: fl(10, 12, vw),
            fontWeight: 700,
            letterSpacing: 1,
            transition: 'background .3s, border-color .3s',
            width: sp ? '100%' : 'auto',
          }}
        >
          {expanded
            ? '閉じる ▲'
            : `すべてのコラボを見る（+${REMAINING.length}タイトル）▼`}
        </button>

        {expanded && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: sp ? '1fr 1fr' : 'repeat(4, 1fr)',
              gap: fl(8, 12, vw),
              marginTop: fl(12, 16, vw),
            }}
          >
            {REMAINING.map((cb) => (
              <Link
                key={cb.id}
                to={`/collections/${cb.shop}`}
                className="collab-card"
                style={{
                  border: `1px solid ${al(cb.accent, 0.08)}`,
                  textDecoration: 'none',
                }}
              >
                <div
                  style={{
                    aspectRatio: '16/9',
                    background: `linear-gradient(160deg, ${al(cb.accent, 0.2)}, ${T.bg} 65%)`,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: `radial-gradient(circle at 35% 40%, ${al(cb.accent, 0.25)}, transparent 55%)`,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,.7))',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 8,
                      left: 10,
                      right: 10,
                      zIndex: 1,
                    }}
                  >
                    {cb.tag && (
                      <div
                        style={{
                          display: 'inline-block',
                          fontSize: 6,
                          fontWeight: 900,
                          padding: '2px 5px',
                          borderRadius: 3,
                          background: cb.tag === 'NEW' ? T.r : '#FF9500',
                          color: T.tx,
                          letterSpacing: 0.5,
                          marginBottom: 3,
                        }}
                      >
                        {cb.tag}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: nameFs(cb.name, fl(11, 13, vw), fl(8, 10, vw)),
                        fontWeight: 800,
                        color: T.tx,
                        textShadow: '0 2px 10px rgba(0,0,0,.8)',
                        lineHeight: 1.25,
                      }}
                    >
                      {cb.name}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
