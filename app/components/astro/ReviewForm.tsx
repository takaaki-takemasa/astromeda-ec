/**
 * ReviewForm.tsx — Star rating + review submission form
 * Task 8b-5: Review system
 *
 * Features:
 * - Interactive 1-5 star rating with hover/click
 * - Title input (max 100 chars)
 * - Body textarea (10-2000 chars)
 * - Customer name input
 * - Character count display
 * - Submit button with loading state
 * - Success/error message display
 * - Dark theme with T constants
 * - Uses fetch to POST to /reviews/submit
 * - Client-side form validation
 */

import {useState, useRef, type FormEvent} from 'react';
import {T, PAGE_WIDTH} from '~/lib/astromeda-data';
import {ReviewStars} from './ReviewStars';
import {validateReview} from '~/lib/review-collector';

interface ReviewFormProps {
  productId: string;
  productName: string;
  customerEmail?: string;
  onSubmitSuccess?: () => void;
}

export function ReviewForm({
  productId,
  productName,
  customerEmail: initialEmail,
  onSubmitSuccess,
}: ReviewFormProps) {
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState(initialEmail ?? '');

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error'; text: string} | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);
    setFormErrors([]);

    // Client-side validation
    const validation = validateReview({
      productId,
      productName,
      customerName,
      customerEmail,
      rating,
      title,
      body,
      createdAt: new Date().toISOString(),
      verified: false,
    });

    if (!validation.valid) {
      setFormErrors(validation.errors);
      return;
    }

    setIsLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000); // 5s timeout for internal API

    try {
      const response = await fetch('/reviews/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId,
          productName,
          customerName,
          customerEmail,
          rating,
          title,
          body,
          createdAt: new Date().toISOString(),
          verified: false,
        }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({
          type: 'error',
          text: data.error || 'レビュー投稿に失敗しました。もう一度お試しください。',
        });
        return;
      }

      setMessage({
        type: 'success',
        text: 'レビューを投稿いただきありがとうございます。掲載までしばらくお待ちください。',
      });

      // Reset form
      if (formRef.current) {
        formRef.current.reset();
      }
      setTitle('');
      setBody('');
      setCustomerName('');
      setRating(5);

      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Review submission error:', err);
      }
      const errorMsg = err instanceof Error && err.name === 'AbortError'
        ? 'リクエストがタイムアウトしました。もう一度お試しください。'
        : 'ネットワークエラーが発生しました。インターネット接続を確認してください。';
      setMessage({
        type: 'error',
        text: errorMsg,
      });
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        ...PAGE_WIDTH,
        maxWidth: 700,
        margin: '0 auto',
        padding: '0 clamp(16px, 5vw, 80px)',
      }}
    >
      <div
        style={{
          padding: 'clamp(24px, 3vw, 40px)',
          background: `linear-gradient(135deg, ${T.c}08, ${T.g}08)`,
          border: `1px solid ${T.bd}`,
          borderRadius: 16,
        }}
      >
        <h2
          style={{
            fontSize: 'clamp(18px, 2.5vw, 24px)',
            fontWeight: 700,
            marginBottom: 24,
            color: T.tx,
          }}
        >
          レビューを書く
        </h2>

        {/* Product Info */}
        <div
          style={{
            marginBottom: 24,
            padding: 12,
            background: 'rgba(255,255,255,.03)',
            borderRadius: 8,
            border: `1px solid ${T.bd}`,
          }}
        >
          <div style={{fontSize: 11, color: T.t4, marginBottom: 4}}>商品</div>
          <div style={{fontSize: 14, fontWeight: 600, color: T.tx}}>{productName}</div>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: 20}}>
          {/* Rating */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: T.tx,
                marginBottom: 12,
              }}
            >
              評価 <span style={{color: T.r}}>*</span>
            </label>
            <div
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  cursor: 'pointer',
                }}
                onMouseLeave={() => setHoverRating(null)}
              >
                {([1, 2, 3, 4, 5] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRating(r)}
                    onMouseEnter={() => setHoverRating(r)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'transform .15s',
                      transform: hoverRating && r <= hoverRating ? 'scale(1.15)' : 'scale(1)',
                    }}
                    aria-label={`${r}つ星`}
                  >
                    <svg
                      width={28}
                      height={28}
                      viewBox="0 0 24 24"
                      style={{
                        display: 'block',
                      }}
                    >
                      <path
                        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                        fill={
                          (hoverRating ? r <= hoverRating : r <= rating)
                            ? T.c
                            : 'rgba(255,255,255,.1)'
                        }
                        style={{
                          transition: 'fill .15s',
                        }}
                      />
                    </svg>
                  </button>
                ))}
              </div>
              <span style={{fontSize: 13, color: T.t4, fontWeight: 600}}>
                {hoverRating ? `${hoverRating} / 5` : `${rating} / 5`}
              </span>
            </div>
          </div>

          {/* Customer Name */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: T.tx,
                marginBottom: 8,
              }}
            >
              お名前 <span style={{color: T.r}}>*</span>
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="山田太郎"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                background: `rgba(255,255,255,.05)`,
                border: `1px solid ${T.bd}`,
                borderRadius: 8,
                color: T.tx,
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                transition: 'border-color .2s',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = T.c;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = T.bd;
              }}
            />
          </div>

          {/* Customer Email */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: T.tx,
                marginBottom: 8,
              }}
            >
              メールアドレス <span style={{color: T.r}}>*</span>
            </label>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                background: `rgba(255,255,255,.05)`,
                border: `1px solid ${T.bd}`,
                borderRadius: 8,
                color: T.tx,
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                transition: 'border-color .2s',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = T.c;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = T.bd;
              }}
            />
          </div>

          {/* Title */}
          <div>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8}}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: T.tx,
                }}
              >
                タイトル <span style={{color: T.r}}>*</span>
              </label>
              <span style={{fontSize: 11, color: T.t4}}>
                {title.length} / 100
              </span>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 100))}
              placeholder="例：デザインと性能を両立した最高のPC"
              maxLength={100}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                background: `rgba(255,255,255,.05)`,
                border: `1px solid ${T.bd}`,
                borderRadius: 8,
                color: T.tx,
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                transition: 'border-color .2s',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = T.c;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = T.bd;
              }}
            />
          </div>

          {/* Body */}
          <div>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8}}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: T.tx,
                }}
              >
                レビュー本文 <span style={{color: T.r}}>*</span>
              </label>
              <span style={{fontSize: 11, color: T.t4}}>
                {body.length} / 2000
              </span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 2000))}
              placeholder="商品の使用感、性能、デザインなど、実際の体験をお聞かせください。"
              maxLength={2000}
              style={{
                width: '100%',
                padding: '12px 12px',
                fontSize: 14,
                background: `rgba(255,255,255,.05)`,
                border: `1px solid ${T.bd}`,
                borderRadius: 8,
                color: T.tx,
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                resize: 'vertical',
                minHeight: '120px',
                transition: 'border-color .2s',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = T.c;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = T.bd;
              }}
            />
          </div>

          {/* Error Messages */}
          {formErrors.length > 0 && (
            <div
              style={{
                padding: 12,
                background: `rgba(255,45,85,.1)`,
                border: `1px solid ${T.r}`,
                borderRadius: 8,
              }}
            >
              <div style={{fontSize: 12, color: T.r, fontWeight: 600, marginBottom: 8}}>エラー</div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {formErrors.map((err, i) => (
                  <li key={i} style={{fontSize: 12, color: T.r}}>
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Message Display */}
          {message && (
            <div
              style={{
                padding: 12,
                background:
                  message.type === 'success'
                    ? `rgba(76,175,80,.1)`
                    : `rgba(255,45,85,.1)`,
                border: `1px solid ${message.type === 'success' ? '#4CAF50' : T.r}`,
                borderRadius: 8,
                color: message.type === 'success' ? '#4CAF50' : T.r,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {message.text}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              padding: '12px 24px',
              background: isLoading
                ? `rgba(0,240,255,.3)`
                : `linear-gradient(135deg, ${T.c}, ${T.g})`,
              color: isLoading ? T.t3 : '#000',
              fontSize: 14,
              fontWeight: 700,
              border: 'none',
              borderRadius: 10,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all .2s',
              opacity: isLoading ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.opacity = '0.9';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading) {
                e.currentTarget.style.opacity = '1';
              }
            }}
          >
            {isLoading ? 'レビューを投稿中...' : 'レビューを投稿'}
          </button>
        </form>
      </div>
    </div>
  );
}
