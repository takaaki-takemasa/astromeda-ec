import {useState} from 'react';
import {Link} from 'react-router';
import {T, al, fl, yen, PC_COLORS, PC_TIERS} from '~/lib/astromeda-data';

interface PCShowcaseProps {
  vw: number;
}

const SCENES = [
  'White Edition — Pure Clean Build',
  'Black Edition — Stealth Dark Build',
  'Pink Edition — Rose Gaming Setup',
  'Purple Edition — Royal Violet Build',
  'Blue Edition — Ocean Gaming Setup',
  'Red Edition — Flame Racing Build',
  'Green Edition — Forest Gaming Setup',
  'Orange Edition — Sunset Hot Build',
];

export function PCShowcase({vw}: PCShowcaseProps) {
  const [pcC, setPcC] = useState(0);
  const [pcAn, setPcAn] = useState(0);
  const sp = vw < 768;
  const c = PC_COLORS[pcC];

  return (
    <section
      style={{
        margin: `0 ${fl(16, 48, vw)}px ${fl(16, 28, vw)}px`,
        borderRadius: fl(16, 22, vw),
        border: `1px solid ${al(c.h, c.d ? 0.3 : 0.15)}`,
        overflow: 'hidden',
        background: `linear-gradient(165deg, ${al(c.h, 0.06)}, transparent 55%)`,
        transition: 'background .6s, border-color .6s',
        position: 'relative',
      }}
    >
      <div
        style={{
          padding: `${fl(14, 28, vw)}px ${fl(14, 36, vw)}px 0`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <div
            className="ph"
            style={{fontSize: fl(13, 24, vw), fontWeight: 900, color: T.tx, letterSpacing: 3}}
          >
            GAMING PC
          </div>
          <div style={{fontSize: fl(9, 11, vw), color: T.t4, marginTop: 2}}>
            全8色 × 25タイトルコラボ × 国内受注生産
          </div>
        </div>
        {!sp && (
          <Link
            to="/collections/all"
            className="cta"
            style={{padding: '12px 28px', fontSize: fl(11, 13, vw), textDecoration: 'none'}}
          >
            詳しく見る →
          </Link>
        )}
      </div>

      {/* Color dots */}
      <div
        style={{
          padding: `${fl(10, 16, vw)}px ${fl(14, 36, vw)}px`,
          display: 'flex',
          gap: fl(6, 9, vw),
          flexWrap: 'wrap',
        }}
      >
        {PC_COLORS.map((cl, i) => {
          const act = i === pcC;
          return (
            <button
              key={cl.n}
              type="button"
              onClick={() => {
                if (i !== pcC) {
                  setPcC(i);
                  setPcAn((k) => k + 1);
                }
              }}
              title={cl.n}
              style={{
                width: fl(30, 42, vw),
                height: fl(30, 42, vw),
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                background: cl.h,
                outline: act
                  ? `2px solid ${cl.d ? '#888' : cl.h}`
                  : '2px solid transparent',
                outlineOffset: 3,
                transform: act ? 'scale(1.15)' : 'scale(1)',
                transition: 'transform .3s, outline .3s, box-shadow .3s',
                boxShadow: act
                  ? `0 0 24px ${al(cl.g, 0.3)}`
                  : '0 2px 8px rgba(0,0,0,.4)',
                position: 'relative',
              }}
            />
          );
        })}
      </div>

      {/* PC desk scene (gradient placeholder) */}
      <div style={{padding: `0 ${fl(14, 36, vw)}px ${fl(14, 28, vw)}px`}}>
        <div
          key={pcAn}
          style={{
            animation: 'pcIn .6s cubic-bezier(.16,1,.3,1)',
            width: '100%',
            height: fl(200, 280, vw),
            background: `linear-gradient(180deg, ${al(c.h, 0.08)}, ${T.bg})`,
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              textAlign: 'center',
              padding: fl(16, 24, vw),
            }}
          >
            <div
              className="ph"
              style={{
                fontSize: fl(14, 20, vw),
                fontWeight: 900,
                color: c.h,
                textShadow: `0 0 40px ${al(c.g, 0.5)}`,
                marginBottom: 8,
              }}
            >
              {c.n} EDITION
            </div>
            <div style={{fontSize: fl(10, 12, vw), color: T.t4}}>{SCENES[pcC]}</div>
          </div>
        </div>
      </div>

      {sp && (
        <div style={{padding: '0 14px 14px'}}>
          <Link
            to="/collections/all"
            className="cta"
            style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              fontSize: fl(10, 12, vw),
              textDecoration: 'none',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            ゲーミングPCを見る →
          </Link>
        </div>
      )}
    </section>
  );
}

// Tier cards component for PC page
export function PCTierCards({vw}: {vw: number}) {
  const sp = vw < 768;

  return (
    <div
      style={
        sp
          ? {
              display: 'flex',
              gap: 10,
              overflowX: 'auto',
              marginBottom: 20,
              paddingBottom: 4,
            }
          : {
              display: 'grid',
              gridTemplateColumns: vw < 900 ? '1fr 1fr' : '1fr 1fr 1fr',
              gap: 14,
              marginBottom: 28,
            }
      }
    >
      {PC_TIERS.map((t) => (
        <div
          key={t.tier}
          style={{
            background: T.bgC,
            borderRadius: fl(14, 18, vw),
            border: t.pop
              ? `2px solid ${al(T.c, 0.2)}`
              : `1px solid ${T.bd}`,
            padding: `${fl(14, 22, vw)}px`,
            position: 'relative',
            overflow: 'hidden',
            minWidth: sp ? 180 : undefined,
            flexShrink: sp ? 0 : undefined,
          }}
        >
          {t.pop && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background: T.c,
              }}
            />
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: fl(8, 10, vw),
            }}
          >
            <span
              className="ph"
              style={{
                fontSize: fl(11, 14, vw),
                fontWeight: 900,
                color: t.pop ? T.c : T.t5,
              }}
            >
              {t.tier}
            </span>
            {t.pop && (
              <span
                style={{
                  fontSize: 7,
                  fontWeight: 900,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: al(T.c, 0.1),
                  color: T.c,
                }}
              >
                人気No.1
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: fl(9, 10, vw),
              color: T.t4,
              marginBottom: fl(8, 12, vw),
            }}
          >
            {t.gpu} / {t.cpu} / {t.ram}
          </div>
          <div
            className="ph"
            style={{
              fontSize: fl(18, 26, vw),
              fontWeight: 900,
              color: T.c,
              marginBottom: fl(8, 12, vw),
            }}
          >
            {yen(t.price)}
            <span style={{fontSize: fl(9, 11, vw), color: T.t4, fontWeight: 500}}>〜</span>
          </div>
          <Link
            to="/collections/astromeda"
            className="cta"
            style={{
              display: 'block',
              width: '100%',
              padding: `${fl(10, 14, vw)}px`,
              fontSize: fl(10, 13, vw),
              textDecoration: 'none',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            この構成で見る →
          </Link>
        </div>
      ))}
    </div>
  );
}
