/**
 * API Route: /api/qr-code?url=<URL>&size=<size>
 *
 * QRコード自動生成API（サーバーサイド）
 *
 * 医学メタファー: 通信系（情報伝達）
 * URLを視覚情報（QRコード）に変換してクライアントに提供。
 * キャッシュ効率化でリピート生成を回避。
 *
 * クエリパラメータ:
 * - url: エンコード対象のURL（必須）
 * - size: SVGサイズ（ピクセル、デフォルト: 256）
 * - margin: 余白（モジュール数、デフォルト: 4）
 *
 * レスポンス:
 * - Content-Type: image/svg+xml
 * - Cache-Control: public, max-age=86400（24時間キャッシュ）
 * - X-RateLimit-*: レート制限情報（参考情報）
 */

import type {Route} from './+types/api.qr-code';
import {generateQRCodeSVG, generateRateLimitHeaders} from '~/lib/qr-code';
import {QRCodeQuerySchema} from '~/lib/api-schemas';
import {AppError} from '~/lib/app-error';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';

/**
 * ローダー関数 — GET /api/qr-code
 * 免疫系: リクエスト検証、入力サニタイゼーション
 */
export async function loader({request}: Route.LoaderArgs) {
  // Rate limit check
  const limited = applyRateLimit(request, 'api.qr-code', RATE_LIMIT_PRESETS.public);
  if (limited) return limited;

  // HTTPメソッド検証
  if (request.method !== 'GET') {
    return Response.json(
      {error: 'Method not allowed'},
      {
        status: 405,
        headers: {
          'Allow': 'GET',
        },
      },
    );
  }

  try {
    const url = new URL(request.url);

    // H-008: Zodスキーマによる入力検証（免疫受容体の統一化）
    const parsed = QRCodeQuerySchema.safeParse({
      url: url.searchParams.get('url') || '',
      size: url.searchParams.get('size') || undefined,
      margin: url.searchParams.get('margin') || undefined,
    });
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? 'バリデーションエラー';
      return Response.json({error: firstError}, {status: 400});
    }

    const targetUrl = parsed.data.url;
    const sizeParam = url.searchParams.get('size');
    const marginParam = url.searchParams.get('margin');

    // サイズパラメータのバリデーション
    let size = 256;
    if (sizeParam) {
      const parsedSize = parseInt(sizeParam, 10);
      if (isNaN(parsedSize) || parsedSize < 64 || parsedSize > 1024) {
        return Response.json(
          {error: 'Invalid size: must be between 64 and 1024'},
          {status: 400},
        );
      }
      size = parsedSize;
    }

    // マージンパラメータのバリデーション
    let margin = 4;
    if (marginParam) {
      const parsedMargin = parseInt(marginParam, 10);
      if (isNaN(parsedMargin) || parsedMargin < 0 || parsedMargin > 20) {
        return Response.json(
          {error: 'Invalid margin: must be between 0 and 20'},
          {status: 400},
        );
      }
      margin = parsedMargin;
    }

    // QRコード生成
    const svgContent = generateQRCodeSVG(targetUrl, {
      size,
      margin,
      darkColor: '#000000',
      lightColor: '#FFFFFF',
    });

    // レスポンスヘッダーの構築
    const responseHeaders = new Headers({
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, immutable',
      'Access-Control-Allow-Origin': process.env.PUBLIC_STORE_DOMAIN ? `https://${process.env.PUBLIC_STORE_DOMAIN}` : 'https://shop.mining-base.co.jp',
      'Access-Control-Allow-Methods': 'GET',
      'Content-Disposition': `inline; filename="qr-code-${encodeURIComponent(
        new URL(targetUrl).hostname,
      )}.svg"`,
      ...generateRateLimitHeaders(1000, 1, 3600),
    });

    return new Response(svgContent, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    // エラーハンドリング（予期しないエラー）
    console.error('[QR Code API Error]', error);

    // URLが長すぎる場合の判定（安全な方法）
    const isLengthError = error instanceof Error && error.message?.includes('長すぎます');
    if (isLengthError) {
      return Response.json(
        {error: 'URL too long for QR code generation'},
        {status: 413},
      );
    }

    // その他のエラー
    return Response.json(
      {error: 'Failed to generate QR code'},
      {status: 500},
    );
  }
}

/**
 * レスポンスヘッダー関数
 * キャッシュプロファイル: static (24時間CDNキャッシュ)
 */
export function headers(_args: {actionData?: unknown; loaderData?: unknown}) {
  return {
    'Cache-Control': 'public, max-age=86400, immutable',
    'Content-Type': 'image/svg+xml; charset=utf-8',
  };
}
