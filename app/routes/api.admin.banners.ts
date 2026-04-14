/**
 * バナー管理API — L15感覚統合（視覚野→画像確認）
 *
 * ImageGenerator / QualityAuditor の出力をCEOがプレビュー・承認するためのAPI
 * 26IPコラボレーションのバナー状態を一覧表示
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.banners';
import { setBridgeEnv, ensureInitialized } from '~/lib/agent-bridge';
import { BannerActionSchema } from '~/lib/api-schemas';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

// Shopifyコレクションハンドル（CLAUDE.md準拠）
const IP_COLLECTIONS = [
  { ip: 'ONE PIECE バウンティラッシュ', handle: 'one-piece-bountyrush-collaboration' },
  { ip: 'NARUTO-ナルト- 疾風伝', handle: 'naruto-shippuden' },
  { ip: '僕のヒーローアカデミア', handle: 'heroaca-collaboration' },
  { ip: 'ストリートファイター6', handle: 'streetfighter-collaboration' },
  { ip: 'サンリオキャラクターズ', handle: 'sanrio-characters-collaboration' },
  { ip: 'ソニック', handle: 'sega-sonic-astromeda-collaboration' },
  { ip: '呪術廻戦', handle: 'jujutsukaisen-collaboration' },
  { ip: 'チェンソーマン レゼ篇', handle: 'chainsawman-movie-reze' },
  { ip: 'ぼっち・ざ・ろっく！', handle: 'bocchi-rocks-collaboration' },
  { ip: 'hololive English', handle: 'hololive-english-collaboration' },
  { ip: 'BLEACH Rebirth of Souls', handle: 'bleach-rebirth-of-souls-collaboration' },
  { ip: 'BLEACH 千年血戦篇', handle: 'bleach-anime-astromeda-collaboration' },
  { ip: 'コードギアス', handle: 'geass-collaboration' },
  { ip: '東京喰種', handle: 'tokyoghoul-collaboration' },
  { ip: 'ラブライブ！虹ヶ咲', handle: 'lovelive-nijigasaki-collaboration' },
  { ip: 'SAO', handle: 'swordart-online-collaboration' },
  { ip: 'ゆるキャン△', handle: 'yurucamp-collaboration' },
  { ip: 'パックマス', handle: 'pacmas-astromeda-collaboration' },
  { ip: 'すみっコぐらし', handle: 'sumikko' },
  { ip: 'ガールズ＆パンツァー', handle: 'girls-und-panzer-collaboration' },
  { ip: 'リラックマ', handle: 'goods-rilakkuma' },
  { ip: '新兎わい', handle: 'pc-nitowai' },
  { ip: 'Palworld', handle: 'astromeda-palworld-collaboration-pc' },
  { ip: 'アイマス ミリオンライブ', handle: 'imas-millionlive-collaboration' },
  { ip: 'ミリプロ', handle: 'milpr-pc' },
  { ip: '黒い砂漠', handle: 'black-desert-collaboration' },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.banners', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  try {
    // 免疫チェック: 認証なしアクセスを遮断
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    // RBAC: products.view permission required
    const session = await AppSession.init(request, [String((contextEnv as unknown as {SESSION_SECRET?: string}).SESSION_SECRET || '')]);
    const role = requirePermission(session, 'products.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/banners [GET]', success: true });

    setBridgeEnv(contextEnv);

    // Shopify Storefront APIからコレクション画像を一括取得
    const env = contextEnv;
    const storeDomain = env.PUBLIC_STORE_DOMAIN || 'staging-mining-base.myshopify.com';
    const storefrontToken = env.PUBLIC_STOREFRONT_API_TOKEN || '';

    let collectionImages: Record<string, string> = {};

    if (storefrontToken) {
      try {
        const query = `{ collections(first: 250) { nodes { handle image { url } } } }`;
        const res = await fetch(`https://${storeDomain}/api/2024-01/graphql.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': storefrontToken },
          body: JSON.stringify({ query }),
        });
        const json = (await res.json()) as {
          data?: {collections?: {nodes?: Array<{handle: string; image?: {url: string}}>}};
        };
        for (const node of json?.data?.collections?.nodes || []) {
          if (node.image?.url) collectionImages[node.handle] = node.image.url;
        }
      } catch { /* Shopify未接続時は空 */ }
    }

    const banners = IP_COLLECTIONS.map(ip => {
      const imageUrl = collectionImages[ip.handle] || null;
      return {
        collectionHandle: ip.handle,
        ipName: ip.ip,
        bannerUrl: imageUrl ? `${imageUrl}&width=800&format=webp` : null,
        thumbnailUrl: imageUrl ? `${imageUrl}&width=300&format=webp` : null,
        status: imageUrl ? 'active' as const : 'missing' as const,
        hasShopifyImage: !!imageUrl,
      };
    });

    return data({
      success: true,
      banners,
      total: banners.length,
      stats: {
        active: banners.filter(b => b.status === 'active').length,
        missing: banners.filter(b => b.status === 'missing').length,
      },
      shopifyConnected: !!storefrontToken,
    });
  } catch (error) {
    return data({
      success: true,
      banners: IP_COLLECTIONS.map(ip => ({
        collectionHandle: ip.handle,
        ipName: ip.ip,
        bannerUrl: null,
        thumbnailUrl: null,
        status: 'unknown' as const,
        hasShopifyImage: false,
      })),
      total: IP_COLLECTIONS.length,
      stats: { active: 0, missing: IP_COLLECTIONS.length },
      shopifyConnected: false,
    });
  }
}

// POST: バナー再生成
export async function action({ request, context }: Route.ActionArgs) {
  const csrfError = await verifyCsrfForAdmin(request, context.env);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.banners', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // 免疫チェック: 認証なしアクセスを遮断
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    // RBAC: products.edit permission required
    const session = await AppSession.init(request, [contextEnv.SESSION_SECRET || '']);
    const role = requirePermission(session, 'products.edit');

    setBridgeEnv(contextEnv);
    await ensureInitialized();

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = BannerActionSchema.safeParse(rawBody);
    if (!validation.success) {
      return data({
        error: '入力値が無効です',
        details: validation.error.errors.map(e => e.message),
      }, { status: 400 });
    }

    const { action: act, collectionHandle } = validation.data;

    if (act === 'regenerate' && collectionHandle) {
      const { getRegisteredAgents } = await import('../../agents/registration/agent-registration.js');
      const agents = (getRegisteredAgents?.() || []) as Array<{ id: string; onCommand?: (cmd: unknown) => Promise<unknown> }>;
      const imageGen = agents.find((a: { id: string }) => a.id === 'image-generator');
      if (imageGen?.onCommand) {
        const result = await imageGen.onCommand({
          action: 'generate_banner',
          params: { collectionHandle },
        });
        return data({ success: true, result });
      }
      return data({ error: 'ImageGeneratorが見つかりません' }, { status: 503 });
    }

    return data({ error: `不明なアクション: ${act}` }, { status: 400 });
  } catch (error) {
    return data({ error: 'バナー再生成に失敗しました' }, { status: 500 });
  }
}
