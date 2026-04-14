/**
 * NewsletterSignup — メール配信登録コンポーネント
 *
 * Shopify Customer API の customerCreate mutation を使用し、
 * メールアドレスでニュースレター購読を登録する。
 * Shopify Email / Klaviyo と連携し、以下の自動メールを有効化:
 * - ウェルカムメール
 * - カゴ落ちメール（Shopify標準機能）
 * - 入荷通知 / 値下げ通知（Phase 3-5/3-6で拡張）
 *
 * フッターに配置。インラインフォーム（ダークテーマ対応）。
 */

import {useState} from 'react';
import {useFetcher} from 'react-router';
import {T, al} from '~/lib/astromeda-data';

export function NewsletterSignup() {
  const fetcher = useFetcher();
  const [email, setEmail] = useState('');

  const isSubmitting = fetcher.state !== 'idle';
  const isSuccess = fetcher.data?.success === true;
  const errorMsg = fetcher.data?.error as string | undefined;

  return (
    <div
      style={{
        background: T.bgC,
        borderRadius: 14,
        border: `1px solid ${T.bd}`,
        padding: 'clamp(16px, 3vw, 24px)',
        maxWidth: 420,
      }}
    >
      <h3
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: T.tx,
          margin: '0 0 4px',
          letterSpacing: '0.02em',
        }}
      >
        最新情報をお届け
      </h3>
      <p
        style={{
          fontSize: 11,
          color: T.t5,
          margin: '0 0 12px',
          lineHeight: 1.5,
        }}
      >
        新作IPコラボ・セール・入荷情報をいち早くお届けします。
      </p>

      {isSuccess ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 16px',
            background: 'rgba(0,255,136,.08)',
            borderRadius: 10,
            border: '1px solid rgba(0,255,136,.2)',
          }}
        >
          <span style={{fontSize: 18}}>✓</span>
          <span
            style={{
              fontSize: 13,
              color: T.c,
              fontWeight: 600,
            }}
          >
            登録完了！ありがとうございます。
          </span>
        </div>
      ) : (
        <fetcher.Form method="post" action="/api/newsletter">
          <div style={{display: 'flex', gap: 8}}>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="メールアドレスを入力"
              required
              aria-label="ニュースレター登録メールアドレス"
              style={{
                flex: 1,
                padding: '10px 14px',
                fontSize: 13,
                background: T.bd,
                border: `1px solid ${al(T.tx, 0.1)}`,
                borderRadius: 10,
                color: T.tx,
                outline: 'none',
                fontFamily: 'inherit',
                transition: 'border-color .2s',
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = al(T.c, 0.25))
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = al(T.tx, 0.1))
              }
            />
            <button
              type="submit"
              disabled={isSubmitting || !email}
              style={{
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 700,
                background:
                  isSubmitting || !email
                    ? al(T.c, 0.2)
                    : `linear-gradient(135deg, ${T.c}, ${T.cD})`,
                color: isSubmitting || !email ? T.t4 : T.bg,
                border: 'none',
                borderRadius: 10,
                cursor: isSubmitting || !email ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                transition: 'opacity .2s',
              }}
            >
              {isSubmitting ? '送信中...' : '登録'}
            </button>
          </div>
          {errorMsg && (
            <p
              style={{
                fontSize: 11,
                color: T.r,
                margin: '8px 0 0',
              }}
            >
              {errorMsg}
            </p>
          )}
        </fetcher.Form>
      )}
    </div>
  );
}
