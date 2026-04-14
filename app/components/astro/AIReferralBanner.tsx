/**
 * AIReferralBanner — AI検索エンジンからのアクセス表示バナー
 *
 * ChatGPT、Claude、Geminiなどの生成AI検索結果から到達したユーザーに
 * 感謝メッセージを表示。セッション中に1回だけ表示される。
 *
 * ダークテーマ・Astromeda カラーパレット対応。
 * dismissible で閉じると、 sessionStorage に記録される。
 */

import {useEffect, useState} from 'react';
import {T} from '~/lib/astromeda-data';
import {getAIReferralInfo, getAISourceDisplayName, isAIReferralAlreadyTracked} from '~/lib/ai-referrer-tracker';

const DISMISS_KEY = 'astromeda_ai_banner_dismissed';

export function AIReferralBanner() {
  const [aiSource, setAiSource] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  // クライアント側でのみ実行（hydration避け）
  useEffect(() => {
    const dismissed = sessionStorage.getItem(DISMISS_KEY) === '1';
    setIsDismissed(dismissed);

    if (!dismissed && isAIReferralAlreadyTracked()) {
      const referral = getAIReferralInfo();
      if (referral) {
        setAiSource(referral.source);
      }
    }
  }, []);

  if (!aiSource || isDismissed) {
    return null;
  }

  const displayName = getAISourceDisplayName(aiSource);

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setIsDismissed(true);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 999,
        background: `linear-gradient(135deg, ${T.bg}, rgba(0,240,255,0.05))`,
        borderBottom: `1px solid ${T.bd}`,
        backdropFilter: T.bl,
        padding: 'clamp(8px, 2vw, 14px) clamp(16px, 5vw, 80px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          maxWidth: 1440,
          marginLeft: 'auto',
          marginRight: 'auto',
          gap: 'clamp(12px, 3vw, 24px)',
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 'clamp(8px, 2vw, 16px)', flex: 1}}>
          {/* AI Icon (generic) */}
          <span
            style={{
              fontSize: 'clamp(18px, 4vw, 24px)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 'clamp(32px, 6vw, 40px)',
              height: 'clamp(32px, 6vw, 40px)',
              background: `linear-gradient(135deg, ${T.c}, ${T.cD})`,
              borderRadius: '50%',
              color: T.bg,
              fontWeight: 700,
            }}
          >
            ⚡
          </span>

          {/* Message */}
          <div style={{flex: 1, minWidth: 0}}>
            <p
              style={{
                fontSize: 'clamp(11px, 2vw, 13px)',
                fontWeight: 500,
                color: T.tx,
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              <strong>{displayName}</strong>
              からのご案内でお越しいただきありがとうございます。
            </p>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={handleDismiss}
          style={{
            flexShrink: 0,
            background: 'transparent',
            border: 'none',
            color: T.t5,
            cursor: 'pointer',
            fontSize: 18,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            transition: 'color .2s, background .2s',
            borderRadius: 6,
            hover: {
              background: T.t2,
            },
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = T.tx;
            e.currentTarget.style.background = T.t2;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = T.t5;
            e.currentTarget.style.background = 'transparent';
          }}
          title="閉じる"
          aria-label="バナーを閉じる"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
