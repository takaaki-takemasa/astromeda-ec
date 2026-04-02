import {useState, useEffect} from 'react';
import {Link} from 'react-router';
import {T, al, fl, nameFs, FEATURED} from '~/lib/astromeda-data';

interface HeroSliderProps {
  vw: number;
}

export function HeroSlider({vw}: HeroSliderProps) {
  const [hi, setHi] = useState(0);
  const sp = vw < 768;

  useEffect(() => {
    const t = setInterval(() => {
      setHi((p) => (p + 1) % FEATURED.length);
    }, 4500);
    return () => clearInterval(t);
  }, []);

  const hc = FEATURED[hi];

  return (
    <div style={{position: 'relative'}}>
      <Link
        to={`/collections/${hc.shop}`}
        style={{textDecoration: 'none', display: 'block'}}
      >
        {/* Hero image area */}
        <div
          style={{
            aspectRatio: sp ? '4/5' : '2/1',
            background: `linear-gradient(160deg, ${al(hc.accent, 0.25)}, ${T.bg} 65%)`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(circle at 35% 40%, ${al(hc.accent, 0.35)}, transparent 55%)`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(0deg, rgba(0,0,0,.65) 0%, rgba(0,0,0,.1) 45%, transparent 100%)',
            }}
          />

          {/* Content overlay */}
          <div
            key={hi}
            style={{
              position: 'absolute',
              bottom: fl(20, 40, vw),
              left: fl(16, 48, vw),
              right: fl(16, 48, vw),
              zIndex: 1,
              animation: 'fadeSlide .5s ease-out',
            }}
          >
            <span
              style={{
                fontSize: fl(8, 10, vw),
                fontWeight: 900,
                color: T.tx,
                padding: `${fl(3, 5, vw)}px ${fl(10, 14, vw)}px`,
                borderRadius: 6,
                background: `linear-gradient(135deg, ${hc.accent}, ${al(hc.accent, 0.6)})`,
                letterSpacing: 2,
                display: 'inline-block',
                marginBottom: fl(8, 12, vw),
              }}
            >
              NEW COLLABORATION
            </span>
            <div
              className="ph"
              style={{
                fontSize: nameFs(hc.name, fl(20, 44, vw), fl(15, 32, vw)),
                fontWeight: 900,
                color: T.tx,
                lineHeight: 1.15,
                textShadow: `0 0 50px ${al(hc.accent, 0.5)}, 0 4px 24px rgba(0,0,0,.7)`,
              }}
            >
              {hc.name}
            </div>
            <div
              className="ph"
              style={{
                fontSize: nameFs(hc.name, fl(16, 36, vw), fl(13, 28, vw)),
                fontWeight: 900,
                color: T.tx,
                lineHeight: 1.15,
                textShadow: `0 0 50px ${al(hc.accent, 0.5)}`,
              }}
            >
              × ASTROMEDA
            </div>
            {!sp && (
              <div
                style={{
                  fontSize: fl(11, 14, vw),
                  color: T.t5,
                  marginTop: 10,
                  lineHeight: 1.7,
                }}
              >
                {hc.desc}
              </div>
            )}
            <div style={{marginTop: fl(10, 14, vw)}}>
              <span
                className="cta"
                style={{
                  padding: `${fl(9, 12, vw)}px ${fl(18, 28, vw)}px`,
                  fontSize: fl(11, 14, vw),
                  display: 'inline-block',
                }}
              >
                製品を見る →
              </span>
            </div>
          </div>
        </div>
      </Link>

      {/* Dot indicators */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          padding: `${fl(10, 14, vw)}px 0 ${fl(4, 6, vw)}px`,
        }}
      >
        {FEATURED.map((col, i) => (
          <button
            key={col.id}
            type="button"
            onClick={() => setHi(i)}
            style={{
              width: i === hi ? 28 : 7,
              height: 7,
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              background: i === hi ? hc.accent : T.t2,
              transition: 'width .4s, background .4s',
              padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}
