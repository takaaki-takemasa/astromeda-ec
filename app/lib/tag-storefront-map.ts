/**
 * Tag → Storefront 配線マップ — patch 0143 P0
 *
 * CEO 指令:
 *   「タグがタグとして機能し、ユーザー画面とどのようにつながるのかを
 *    構造的にすべて設計してください。ただのフラグでは何の意味もありません。
 *    IPグループを一つのタグですべてまとめて、タグのフラグがついた製品を
 *    IPバナーと紐づけたり、上部タブのゲーミングPCやガジェット、グッズなどと
 *    紐づけたり、ガジェット内のキーボードなどの中分類に紐づけたりと、
 *    タグマネジメントで様々な管理が明確にできるようになる。」
 *
 * このヘルパーは「タグを 1 個」受け取って、それが storefront のどの表示要素を
 * 駆動するかを決定論的に返す。admin の TagPipelineMap UI で「このタグを付けたら
 * ストアのここに反映される」を視覚化するために使う。
 *
 * ## マッピング設計 (CEO 正解 4 配線)
 *
 * | タグカテゴリ | storefront 配線先 |
 * |---|---|
 * | 🎬 IPコラボ (例: hololive English) | ① トップページ IPバナー (CollabGrid) ② IPコラボページ ③ 上部メニューの該当 IP |
 * | 💻 PCスペック (例: core-i7-14700f) | ① ゲーミングPCコレクション ② スペック絞り込みフィルタ |
 * | 🎨 カラー (例: Black) | ① 8色から選ぶセクション ② カラー別コレクション |
 * | 📦 商品ジャンル (例: キーボード) | ① 上部タブ「ガジェット」 ② ガジェット内 キーボード中分類 ③ 商品種コレクション |
 * | 📦 商品ジャンル (例: Tシャツ) | ① 上部タブ「グッズ」 ② グッズ内 Tシャツ中分類 |
 * | 🧩 プルダウン部品 | お客様一覧から完全に隠す (storefront 非表示) |
 * | 📣 キャンペーン (例: featured) | ① トップページ特集枠 ② キャンペーンバナー |
 * | ⚙️ システム (例: _hidden) | 内部処理のみ (storefront 非表示) |
 *
 * ## API
 * `getTagStorefrontPipeline(tag, category)` → StorefrontTarget[] を返す
 */

import {classifyTagCategory, type TagCategory} from './tag-classifier';
import {COLLABS} from './astromeda-data';

/** storefront 上の表示先 1 箇所 */
export interface StorefrontTarget {
  /** どこに表示されるか (高校生向けラベル) */
  label: string;
  /** その箇所の絵記号 */
  icon: string;
  /** 該当 storefront URL (新タブで開く) */
  url: string;
  /** 表示先の種類 (UI 集計用) */
  kind: 'home-banner' | 'top-tab' | 'sub-category' | 'collection-page' | 'campaign' | 'menu' | 'hidden' | 'system';
}

/**
 * IP コラボタグの specific URL を COLLABS から取得
 * 該当 IP が見つかれば collection URL を返す
 */
function findIpCollectionUrl(tag: string): string | null {
  const lower = tag.toLowerCase();
  for (const c of COLLABS) {
    if (c.shop && lower.includes(c.shop.toLowerCase())) {
      return `/collections/${c.shop}`;
    }
    if (c.tag && lower.includes(c.tag.toLowerCase())) {
      return `/collections/${c.shop || c.tag}`;
    }
    if (c.name && lower.includes(c.name.toLowerCase().replace(/[【】「」『』！？!?・\s]+/g, ''))) {
      return c.shop ? `/collections/${c.shop}` : null;
    }
  }
  return null;
}

/**
 * 1 タグ → storefront 配線先リスト (決定論的)
 * 各カテゴリで storefront のどこに反映されるかを返す。
 */
export function getTagStorefrontPipeline(tag: string, category?: TagCategory): StorefrontTarget[] {
  const cat = category ?? classifyTagCategory(tag);

  switch (cat) {
    case 'ip': {
      const ipUrl = findIpCollectionUrl(tag);
      const targets: StorefrontTarget[] = [
        {
          label: 'トップページの IPコラボバナー',
          icon: '🎬',
          url: '/#collabs',
          kind: 'home-banner',
        },
        {
          label: 'ヘッダー / フッターの IPメニュー',
          icon: '🧭',
          url: '/',
          kind: 'menu',
        },
      ];
      if (ipUrl) {
        targets.unshift({
          label: `${tag} 専用コレクションページ`,
          icon: '📚',
          url: ipUrl,
          kind: 'collection-page',
        });
      }
      return targets;
    }

    case 'spec':
      return [
        {
          label: '上部タブ「ゲーミングPC」コレクション',
          icon: '💻',
          url: '/collections/gaming-pc',
          kind: 'top-tab',
        },
        {
          label: 'ゲーミングPC内のスペック絞り込みフィルタ',
          icon: '🔍',
          url: '/collections/gaming-pc',
          kind: 'sub-category',
        },
        {
          label: '商品詳細ページのカタログ表',
          icon: '📋',
          url: '/products/',
          kind: 'collection-page',
        },
      ];

    case 'color':
      return [
        {
          label: 'トップページの「8色から選ぶ」セクション',
          icon: '🎨',
          url: '/#colors',
          kind: 'home-banner',
        },
        {
          label: `カラー別コレクション (${tag})`,
          icon: '📚',
          url: `/collections/${tag.toLowerCase()}`,
          kind: 'collection-page',
        },
      ];

    case 'productType': {
      // 「キーボード」「Tシャツ」等 — どの上部タブに属するかを判定
      const lowerTag = tag.toLowerCase();
      const isGoods = /(tシャツ|tshirt|tees?|パーカー|hoodie|缶バッジ|メタルカード|トートバッグ|アクリル|sticker|シール|hat|cap)/i.test(tag);
      const isGadget = /(マウスパッド|mousepad|キーボード|keyboard|モバイルバッテリー|バッテリー|pcケース|case|panel|パネル|stand|フィギュア|headset|ヘッドセット|マウス|mouse(?!pad)|webcam|microphone|マイク)/i.test(tag);

      if (isGadget) {
        return [
          {
            label: '上部タブ「ガジェット」コレクション',
            icon: '🎧',
            url: '/collections/gadgets',
            kind: 'top-tab',
          },
          {
            label: `ガジェット内「${tag}」中分類フィルタ`,
            icon: '📁',
            url: `/collections/gadgets?type=${encodeURIComponent(tag)}`,
            kind: 'sub-category',
          },
          {
            label: `${tag} 専用コレクション`,
            icon: '📚',
            url: `/collections/${lowerTag.replace(/\s+/g, '-')}`,
            kind: 'collection-page',
          },
        ];
      }
      if (isGoods) {
        return [
          {
            label: '上部タブ「グッズ」コレクション',
            icon: '🎁',
            url: '/collections/goods',
            kind: 'top-tab',
          },
          {
            label: `グッズ内「${tag}」中分類フィルタ`,
            icon: '📁',
            url: `/collections/goods?type=${encodeURIComponent(tag)}`,
            kind: 'sub-category',
          },
        ];
      }
      // どちらでもない → 一般商品ジャンルとして上部タブ判定不能
      return [
        {
          label: 'コレクション一覧のジャンル絞り込み',
          icon: '📚',
          url: `/collections/${lowerTag.replace(/\s+/g, '-')}`,
          kind: 'collection-page',
        },
      ];
    }

    case 'campaign':
      return [
        {
          label: 'トップページの特集枠 / キャンペーンバナー',
          icon: '📣',
          url: '/',
          kind: 'campaign',
        },
        {
          label: 'admin → キャンペーン管理',
          icon: '🎟️',
          url: '/admin?tab=marketing',
          kind: 'campaign',
        },
      ];

    case 'pulldown':
      return [
        {
          label: '商品ページのプルダウン選択肢 (例: メモリ追加)',
          icon: '🧩',
          url: '#pulldown-component',
          kind: 'hidden',
        },
        {
          label: '⚠️ お客様の商品一覧には完全に表示されません',
          icon: '🚫',
          url: '#hidden',
          kind: 'hidden',
        },
      ];

    case 'system':
      return [
        {
          label: '内部システムのみ (お客様には見えない)',
          icon: '⚙️',
          url: '#system',
          kind: 'system',
        },
      ];

    case 'other':
    default:
      return [
        {
          label: 'admin → 商品検索 (タグ絞り込み)',
          icon: '🔍',
          url: `/admin?tab=products&q=tag:${encodeURIComponent(tag)}`,
          kind: 'system',
        },
      ];
  }
}

/**
 * 複数タグを受け取って配線先を集約 (重複除去)
 * 「複数タグを同じ商品に付けるとどこに出るか」を一覧表示する用。
 */
export function aggregateStorefrontTargets(tags: string[]): StorefrontTarget[] {
  const seen = new Set<string>();
  const result: StorefrontTarget[] = [];
  for (const t of tags) {
    const targets = getTagStorefrontPipeline(t);
    for (const target of targets) {
      const key = `${target.kind}:${target.url}:${target.label}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(target);
      }
    }
  }
  return result;
}
