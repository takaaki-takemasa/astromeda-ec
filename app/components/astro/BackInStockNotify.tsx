/**
 * BackInStockNotify — 入荷通知登録コンポーネント
 *
 * 売り切れ商品の「カートに追加」ボタン下に表示。
 * メールアドレスを登録すると、Shopifyの顧客データに
 * 「入荷通知リクエスト」として記録される。
 *
 * バックエンド:
 * - Shopify Customer metafield に通知リクエストを保存
 * - Shopify Flow / Klaviyo が在庫変動時にメール送信
 *
 * 値下げ通知:
 * - 同じフォームでオプション選択可能
 * - compareAtPrice > price 時に自動トリガー
 */

import {useState} from 'react';
import {useFetcher} from 'react-router';
import {T, al} from '~/lib/astromeda-data';

interface BackInStockNotifyProps {
  /** 商品ハンドル */
  productHandle: string;
  /** バリアントID */
  variantId?: string;
  /** 商品名（表示用） */
  productTitle: string;
}

export function BackInStockNotify({
  productHandle,
  variantId,
  productTitle,
}: BackInStockNotifyProps) {
  const fetcher = useFetcher();
  const [email, setEmail] = useState('');
  const [notifyType, setNotifyType] = useState<'restock' | 'price_drop'>(
    'restock',
  );

  const isSubmitting = fetcher.state !== 'idle';
  const isSuccess = fetcher.data?.success === true;
  const errorMsg = fetcher.data?.error as string | undefined;

  if (isSuccess) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '14px 16px',
          background: 'rgba(0,255,136,.06)',
          borderRadius: 12,
          border: '1px solid rgba(0,255,136,.15)',
          marginTop: 12,
        }}
      >
        <span style={{fontSize: 16, color: T.c}}>✓</span>
        <span style={{fontSize: 13, color: T.c, fontWeight: 600}}>
          {notifyType === 'restock'
            ? '入荷時にメールでお知らせします'
            : '値下げ時にメールでお知らせします'}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 12,
        padding: '16px',
        background: T.bgC,
        borderRadius: 12,
        border: `1px solid ${T.bd}`,
      }}
    >
      <p
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: T.tx,
          margin: '0 0 4px',
        }}
      >
        在庫切れです
      </p>
      <p
        style={{
          fontSize: 11,
          color: T.t5,
          margin: '0 0 12px',
          lineHeight: 1.5,
        }}
      >
        メールアドレスを登録すると、入荷時にお知らせします。
      </p>

      {/* Notify type toggle */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          marginBottom: 10,
        }}
      >
        {(
          [
            {value: 'restock', label: '入荷通知'},
            {value: 'price_drop', label: '値下げ通知'},
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setNotifyType(opt.value)}
            style={{
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: notifyType === opt.value ? 700 : 500,
              background:
                notifyType === opt.value
                  ? al(T.c, 0.12)
                  : T.bgC,
              border: `1px solid ${
                notifyType === opt.value
                  ? al(T.c, 0.3)
                  : T.bd
              }`,
              borderRadius: 8,
              color:
                notifyType === opt.value
                  ? T.c
                  : T.t5,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all .2s',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <fetcher.Form method="post" action="/api/notify">
        <input type="hidden" name="productHandle" value={productHandle} />
        <input type="hidden" name="variantId" value={variantId || ''} />
        <input type="hidden" name="productTitle" value={productTitle} />
        <input type="hidden" name="notifyType" value={notifyType} />

        <div style={{display: 'flex', gap: 8}}>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            required
            aria-label="通知を受け取るメールアドレス"
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
              padding: '10px 16px',
              fontSize: 12,
              fontWeight: 700,
              background:
                isSubmitting || !email
                  ? al(T.c, 0.2)
                  : T.c,
              color: isSubmitting || !email ? T.t4 : T.bg,
              border: 'none',
              borderRadius: 10,
              cursor: isSubmitting || !email ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {isSubmitting ? '...' : '通知登録'}
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
    </div>
  );
}
