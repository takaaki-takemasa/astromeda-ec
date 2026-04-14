/**
 * reviews.submit.tsx — Review submission API endpoint
 * Task 8b-5: Review collection system
 *
 * POST endpoint that:
 * - Accepts review data (JSON body)
 * - Validates using validateReview
 * - Logs reviews (placeholder for database/metafield storage)
 * - Rate limiting: max 5 reviews per email per hour (in-memory)
 * - Returns JSON response with success/error
 * - ErrorBoundary with RouteErrorBoundary
 */

import type {Route} from './+types/reviews.submit';
import {validateReview, type ReviewData} from '~/lib/review-collector';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

// In-memory rate limiter: email -> [timestamp, timestamp, ...]
const rateLimitMap = new Map<string, number[]>();

/**
 * Rate limit check: max 5 reviews per email per hour
 */
function checkRateLimit(email: string): {allowed: boolean; retryAfter?: number} {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  if (!rateLimitMap.has(email)) {
    rateLimitMap.set(email, [now]);
    return {allowed: true};
  }

  const timestamps = rateLimitMap.get(email)!;

  // Remove timestamps older than 1 hour
  const recentTimestamps = timestamps.filter((ts) => now - ts < oneHour);

  if (recentTimestamps.length >= 5) {
    // Find the oldest timestamp to calculate retry time
    const oldestTimestamp = Math.min(...recentTimestamps);
    const retryAfter = Math.ceil((oneHour - (now - oldestTimestamp)) / 1000);
    return {allowed: false, retryAfter};
  }

  recentTimestamps.push(now);
  rateLimitMap.set(email, recentTimestamps);
  return {allowed: true};
}

export async function action({request}: Route.ActionArgs) {
  // Only accept POST
  if (request.method !== 'POST') {
    return Response.json(
      {error: 'メソッドが許可されていません'},
      {status: 405}
    );
  }

  try {
    const body = await request.json();

    // Validate review data
    const validation = validateReview(body);
    if (!validation.valid) {
      return Response.json(
        {error: 'バリデーションエラー', details: validation.errors},
        {status: 400}
      );
    }

    const reviewData = body as ReviewData;

    // Rate limiting
    const rateLimit = checkRateLimit(reviewData.customerEmail);
    if (!rateLimit.allowed) {
      return Response.json(
        {
          error: `投稿制限に達しています。${rateLimit.retryAfter}秒後に再度お試しください。`,
        },
        {status: 429}
      );
    }

    // Log review (placeholder — future: store in database or Shopify metafield)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Review Submitted]', {
        productId: reviewData.productId,
        productName: reviewData.productName,
        customerName: reviewData.customerName,
        customerEmail: reviewData.customerEmail,
        rating: reviewData.rating,
        title: reviewData.title,
        bodyLength: reviewData.body.length,
        createdAt: reviewData.createdAt,
        verified: reviewData.verified,
      });
    }

    // TODO Phase 2: Store review in database or Shopify metafield
    // TODO: Send verification email to customerEmail
    // TODO: Add review to moderation queue

    return Response.json({
      success: true,
      message: 'レビューを投稿いただきありがとうございます。',
      reviewId: `review_${Date.now()}`,
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Review Submission Error]', err);
    }

    // Check for JSON parse error
    if (err instanceof SyntaxError) {
      return Response.json(
        {error: '無効なJSONフォーマットです'},
        {status: 400}
      );
    }

    return Response.json(
      {error: 'サーバーエラーが発生しました'},
      {status: 500}
    );
  }
}

// SEO: noindex API endpoint
export const meta = () => [
  {name: 'robots', content: 'noindex, nofollow'},
];

// Placeholder UI (if accessed via GET)
export default function ReviewSubmit() {
  return (
    <div
      style={{
        padding: '2rem',
        textAlign: 'center',
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div>
        <h1>レビュー投稿API</h1>
        <p>このエンドポイントはPOSTリクエストのみを受け付けます。</p>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
