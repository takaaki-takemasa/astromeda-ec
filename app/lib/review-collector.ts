/**
 * review-collector.ts — Review collection utility
 * Task 8b-5: Review collection system
 *
 * Handles:
 * - ReviewData interface and validation
 * - Rating calculation and statistics
 * - Review request URL generation
 */

export interface ReviewData {
  productId: string;
  productName: string;
  customerName: string;
  customerEmail: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  body: string;
  createdAt: string;
  verified: boolean;
}

export interface ReviewValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate review data
 * - All required fields present
 * - Rating 1-5
 * - Title: 5-100 chars
 * - Body: 10-2000 chars
 * - Email format validation
 */
export function validateReview(data: Partial<ReviewData>): ReviewValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!data.productId || typeof data.productId !== 'string') {
    errors.push('商品IDが必要です');
  }
  if (!data.productName || typeof data.productName !== 'string') {
    errors.push('商品名が必要です');
  }
  if (!data.customerName || typeof data.customerName !== 'string') {
    errors.push('お客様名が必要です');
  }
  if (!data.customerEmail || typeof data.customerEmail !== 'string') {
    errors.push('メールアドレスが必要です');
  } else if (!isValidEmail(data.customerEmail)) {
    errors.push('有効なメールアドレスを入力してください');
  }

  // Rating validation (1-5)
  if (!data.rating || ![1, 2, 3, 4, 5].includes(data.rating)) {
    errors.push('5つ星の中から評価を選択してください');
  }

  // Title validation (5-100 chars)
  if (!data.title || typeof data.title !== 'string') {
    errors.push('タイトルが必要です');
  } else if (data.title.length < 5) {
    errors.push('タイトルは最低5文字以上である必要があります');
  } else if (data.title.length > 100) {
    errors.push('タイトルは100文字以内である必要があります');
  }

  // Body validation (10-2000 chars)
  if (!data.body || typeof data.body !== 'string') {
    errors.push('レビュー本文が必要です');
  } else if (data.body.length < 10) {
    errors.push('レビュー本文は最低10文字以上である必要があります');
  } else if (data.body.length > 2000) {
    errors.push('レビュー本文は2000文字以内である必要があります');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Simple email format validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generate a unique review request URL with token
 * Token format: base64(orderId:productId:timestamp:random)
 */
export function generateReviewRequestUrl(orderId: string, productId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const tokenData = `${orderId}:${productId}:${timestamp}:${random}`;

  // Simple base64 encoding (node and browser compatible)
  let token: string;
  if (typeof window === 'undefined') {
    // Server-side: use Buffer
    token = Buffer.from(tokenData).toString('base64');
  } else {
    // Client-side: use btoa
    token = btoa(tokenData);
  }

  return `/reviews/submit?token=${encodeURIComponent(token)}`;
}

/**
 * Calculate review statistics
 */
export interface ReviewStatistics {
  average: number;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export function calculateAverageRating(reviews: ReviewData[]): ReviewStatistics {
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  if (reviews.length === 0) {
    return {
      average: 0,
      count: 0,
      distribution,
    };
  }

  let sum = 0;
  for (const review of reviews) {
    sum += review.rating;
    distribution[review.rating]++;
  }

  return {
    average: Math.round((sum / reviews.length) * 10) / 10,
    count: reviews.length,
    distribution,
  };
}
