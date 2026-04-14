/**
 * ImageGenerator — L2 画像生成エージェント（メラノサイト = 色素生成細胞）
 *
 * 生体対応: メラノサイト（色素細胞）
 * IPコラボバナー、商品画像の生成・最適化を担当。
 * ProductLeadから指令を受け、Shopify CDN上の画像を管理する。
 *
 * 担当タスク: generate_banner, update_banner, regenerate_all_banners
 * 所属パイプライン: P1（バナー自動生成）
 */

import type {
  AgentId,
  AgentEvent,
  CascadeCommand,
  IAgentBus,
} from '../core/types';
import {BaseL2Agent} from './base-l2-agent';
import {getAdminClient} from '../core/shopify-admin.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('image-generator');


interface BannerSpec {
  collectionHandle: string;
  ipName: string;
  accent: string;
  width?: number;
  height?: number;
}

interface GenerationResult {
  bannerUrl?: string;
  collectionHandle: string;
  status: 'generated' | 'skipped' | 'error';
  reason?: string;
}

export class ImageGenerator extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'image-generator',
    name: 'ImageGenerator',
    level: 'L2',
    team: 'conversion',
    version: '1.0.0',
  };

  private generationQueue: BannerSpec[] = [];
  private completedCount = 0;

  constructor(bus: IAgentBus) {
    super(bus);
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('product.image.*');
    this.subscribe('shopify.product.update');
  }

  protected async onShutdown(): Promise<void> {
    this.generationQueue = [];
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'shopify.product.update') {
      // 商品更新時にバナー再生成が必要か判定
      const payload = event.payload as { handle?: string; imageChanged?: boolean };
      if (payload.imageChanged) {
        await this.publishEvent('image.generation.queued', {
          handle: payload.handle,
          reason: 'product_image_updated',
        });
      }
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'generate_banner':
        return this.generateBanner(command.params as unknown as BannerSpec);

      case 'update_banner':
        return this.updateBanner(command.params);

      case 'regenerate_all_banners':
        return this.regenerateAllBanners(command.params);

      default:
        throw new Error(`ImageGenerator: unknown action "${command.action}"`);
    }
  }

  // ── Core Operations ──

  private async generateBanner(spec: BannerSpec): Promise<GenerationResult> {
    const width = spec.width ?? 1400;
    const height = spec.height ?? 600;

    await this.publishEvent('image.generation.started', {
      collection: spec.collectionHandle,
      ip: spec.ipName,
      dimensions: `${width}x${height}`,
    });

    // Phase 2: AI画像生成API（DALL-E 3）を優先、次にShopify Admin API、最後にフォールバック
    let bannerUrl: string | undefined;

    // Try DALL-E 3 first (if API key available)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        bannerUrl = await this.generateWithDallE(spec, width, height);
      } catch (err) {
        log.warn(`[ImageGenerator] DALL-E generation failed for ${spec.collectionHandle}:`,
          err instanceof Error ? err.message : String(err));
      }
    }

    // Fallback to Shopify Admin API
    if (!bannerUrl) {
      try {
        const adminClient = getAdminClient();

        if (adminClient.available) {
          // Admin API経由でコレクション画像URLを取得
          const collectionImage = await this.fetchCollectionImage(spec.collectionHandle);
          if (collectionImage) {
            // Shopify CDNのimage_transformパラメータで最適サイズを取得
            bannerUrl = this.optimizeImageUrl(collectionImage, width, height);
          }
        }
      } catch (err) {
        // Admin API障害時はフォールバック（感覚器官の鈍麻 → 代替経路）
        log.warn(`[ImageGenerator] Admin API fallback for ${spec.collectionHandle}:`,
          err instanceof Error ? err.message : String(err));
      }
    }

    // フォールバック: Storefront APIのCDNパスから直接構築
    if (!bannerUrl) {
      bannerUrl = this.buildFallbackUrl(spec.collectionHandle, width);
    }

    const result: GenerationResult = {
      collectionHandle: spec.collectionHandle,
      status: 'generated',
      bannerUrl,
    };

    this.completedCount++;

    await this.publishEvent('image.generation.completed', {
      collection: spec.collectionHandle,
      result,
      totalGenerated: this.completedCount,
    });

    return result;
  }

  /**
   * Generate banner image using OpenAI DALL-E 3 API
   * Returns image URL from the generated image
   */
  private async generateWithDallE(spec: BannerSpec, width: number, height: number): Promise<string | undefined> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return undefined;
    }

    try {
      const prompt = `Professional gaming PC product banner for "${spec.ipName}" IP collaboration.
      Accent color: ${spec.accent}.
      Style: Modern, vibrant, clean design suitable for e-commerce.
      Dimensions: ${width}x${height}px.
      Include gaming aesthetic with the IP theme integrated seamlessly.`;

      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt,
          n: 1,
          size: '1024x1024', // DALL-E 3 supports 1024x1024
          quality: 'hd',
          style: 'vivid',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        throw new Error(`DALL-E API error: ${response.status} - ${errorData.error?.message ?? 'Unknown'}`);
      }

      const data = await response.json() as { data?: Array<{ url?: string; b64_json?: string }> };
      const imageUrl = data.data?.[0]?.url;

      if (imageUrl) {
        log.warn(`[ImageGenerator] DALL-E generated image for ${spec.collectionHandle}`);
        return imageUrl;
      }

      return undefined;
    } catch (err) {
      log.warn('[ImageGenerator] DALL-E generation error:', err instanceof Error ? err.message : err);
      return undefined;
    }
  }

  /**
   * Shopify Admin APIからコレクション画像を取得
   * 医学メタファー: 視覚野への血流（Admin API）が正常なら鮮明な画像が得られる
   */
  private async fetchCollectionImage(handle: string): Promise<string | null> {
    const adminClient = getAdminClient();
    if (!adminClient.available) return null;

    try {
      const data = await adminClient.query<{
        collectionByHandle: {
          image: { url: string; altText?: string } | null;
        } | null;
      }>(`
        query CollectionImage($handle: String!) {
          collectionByHandle(handle: $handle) {
            image {
              url
              altText
            }
          }
        }
      `, { handle });

      return data?.collectionByHandle?.image?.url ?? null;
    } catch (err) {
      log.warn('[ImageGenerator] collection image fetch failed:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * Shopify CDN URLに最適化パラメータを付与
   * WebP変換 + リサイズで帯域削減（画像圧縮 = 血液の酸素飽和度最適化）
   */
  private optimizeImageUrl(originalUrl: string, width: number, _height: number): string {
    // Shopify CDN URL形式: https://cdn.shopify.com/s/files/.../filename.jpg
    // パラメータ: ?width=N&format=webp&crop=center
    const url = new URL(originalUrl);
    url.searchParams.set('width', String(width));
    url.searchParams.set('format', 'webp');
    url.searchParams.set('crop', 'center');
    return url.toString();
  }

  /**
   * Admin API不通時のフォールバックURL構築
   * 医学メタファー: 主要動脈が閉塞した場合の側副血行路
   */
  private buildFallbackUrl(handle: string, width: number): string {
    return `https://cdn.shopify.com/s/files/1/0741/0407/8628/collections/${handle}.jpg?width=${width}&format=webp`;
  }

  private async updateBanner(params: Record<string, unknown>): Promise<GenerationResult> {
    const handle = params.collectionHandle as string;
    if (!handle) throw new Error('collectionHandle is required');

    return this.generateBanner({
      collectionHandle: handle,
      ipName: (params.ipName as string) ?? handle,
      accent: (params.accent as string) ?? '#00F0FF',
      width: (params.width as number) ?? 1400,
      height: (params.height as number) ?? 600,
    });
  }

  private async regenerateAllBanners(params: Record<string, unknown>): Promise<{ total: number; results: GenerationResult[] }> {
    const handles = (params.handles as string[]) ?? [];
    const results: GenerationResult[] = [];

    for (const handle of handles) {
      try {
        const result = await this.generateBanner({
          collectionHandle: handle,
          ipName: handle,
          accent: '#00F0FF',
        });
        results.push(result);
      } catch (err) {
        log.warn('[ImageGenerator] banner generation failed for:', handle, err instanceof Error ? err.message : err);
        results.push({
          collectionHandle: handle,
          status: 'error',
          reason: 'generation_failed',
        });
      }
    }

    return { total: results.length, results };
  }
}
