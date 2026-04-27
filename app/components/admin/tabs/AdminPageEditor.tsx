/**
 * Admin Page Editor — Sprint 2 Part 4-B
 *
 * Metaobject 5種 (color_model / category_card / product_shelf / about_section / footer_config)
 * を管理画面から完全編集できる統合タブ。
 *
 * セキュリティ: 既存 admin._index.tsx の authGuard 継承、各 API が RateLimit→AdminAuth→RBAC→CSRF→Zod。
 */

import React, {useEffect, useState} from 'react';
import {useSearchParams} from 'react-router';
import {T, al} from '~/lib/astromeda-data';

// patch 0047 Phase C 第1段: 共有プリミティブを shared.tsx へ外出し。
// patch 0058 Phase C 第4段: VisualEditSection 抽出に伴い本ファイルは pure orchestrator 化。
// 以下の import は AdminPageEditor 本体 (tabs 配列 + subTab switch + <ConfirmDialog />) の
// ためだけに残している。
import {
  type SubTab,
  useToasts,
  useConfirmDialog,
  ConfirmDialog,
  ToastContainer,
} from './pageEditor/shared';
// patch 0047 Phase C 第1段: UgcReviewsSection は独立ファイルへ
import {UgcReviewsSection} from './pageEditor/UgcReviewsSection';
// patch 0049 Phase C 第2段: ColorModelsSection + ColorModelForm は独立ファイルへ
import {ColorModelsSection} from './pageEditor/ColorModelsSection';
// patch 0050 Phase C 第2段: CategoryCardsSection + CategoryCardForm は独立ファイルへ
import {CategoryCardsSection} from './pageEditor/CategoryCardsSection';
// patch 0051 Phase C 第2段: ProductShelvesSection + ProductShelfForm は独立ファイルへ
import {ProductShelvesSection} from './pageEditor/ProductShelvesSection';
// patch 0052 Phase C 第2段: AboutSectionsSection + AboutSectionForm は独立ファイルへ
import {AboutSectionsSection} from './pageEditor/AboutSectionsSection';
// patch 0053 Phase C 第2段: FooterConfigsSection + FooterConfigForm は独立ファイルへ
import {FooterConfigsSection} from './pageEditor/FooterConfigsSection';
// patch 0054 Phase C 第2段: IpBannersSection + IpBannerForm は独立ファイルへ
import {IpBannersSection} from './pageEditor/IpBannersSection';
// patch 0055 Phase C 第2段: HeroBannersSection + HeroBannerForm は独立ファイルへ
import {HeroBannersSection} from './pageEditor/HeroBannersSection';
// patch 0056 Phase C 第2段: CustomizationMatrixSection は独立ファイルへ
import {CustomizationMatrixSection} from './pageEditor/CustomizationMatrixSection';
// patch 0056 Phase C 第2段: Gaming 系 5 Section は独立ファイルへ
import {
  GamingFeatureCardsSection,
  GamingPartsCardsSection,
  GamingPriceRangesSection,
  GamingHeroSlidesSection,
  GamingContactSection,
} from './pageEditor/GamingSections';
// patch 0058 Phase C 第4段: VisualEditSection + PageKey/SectionKey/SectionDef/HOME_SECTIONS/
// GAMING_PC_SECTIONS/PAGE_DEFS/VisualEditSectionProps は ./pageEditor/VisualEditSection.tsx へ切り出し済み。
// 戻し方: Git 履歴の `13fd803` 時点 L191-818 を参照。
import {VisualEditSection} from './pageEditor/VisualEditSection';
import { TabHeaderHint } from '~/components/admin/ds/TabHeaderHint';

// patch 0047 Phase C 第1段: 型/スタイル/ヘルパー/UI は ./pageEditor/shared.tsx へ集約済み。
// patch 0058 Phase C 第4段: VisualEditSection も ./pageEditor/VisualEditSection.tsx に分離した。
// ここでは AdminPageEditor 本体 (orchestrator) と 14 Section の switch 配線だけ残している。

// ══════════════════════════════════════════════════════════
// メインコンポーネント
// ══════════════════════════════════════════════════════════

const VALID_SUB_TABS: SubTab[] = ['visual', 'color_models', 'category_cards', 'product_shelves', 'about_sections', 'footer_configs', 'ip_banners', 'hero_banners', 'customization_matrix', 'gaming_feature_cards', 'gaming_parts_cards', 'gaming_price_ranges', 'gaming_hero', 'gaming_contact', 'ugc_reviews'];

export default function AdminPageEditor() {
  const [searchParams] = useSearchParams();
  const subParam = searchParams.get('sub');
  const initialSubTab: SubTab =
    subParam && (VALID_SUB_TABS as string[]).includes(subParam) ? (subParam as SubTab) : 'visual';
  const [subTab, setSubTab] = useState<SubTab>(initialSubTab);

  // URL の sub パラメータ変化に追従（Site Map からの遷移対応）
  useEffect(() => {
    if (subParam && (VALID_SUB_TABS as string[]).includes(subParam)) {
      setSubTab(subParam as SubTab);
    }
  }, [subParam]);

  const {toasts, push} = useToasts();
  // patch 0057 Phase C 第3段: useConfirmDialog は canonical (~/hooks/useConfirmDialog) へ統一。
  // confirm(message: string) は SectionProps の契約維持のため wrapper で吸収済み。
  const {confirm, dialogProps: confirmDialogProps} = useConfirmDialog();

  // patch 0027: CEO 要望「現在のサイトUIを表示し、クリックしたところの修正画面に行けるようにして」
  // → 先頭に「ビジュアル編集」タブを配置し、live site を iframe 表示＋各セクションへのショートカット。
  const tabs: Array<{key: SubTab; label: string}> = [
    {key: 'visual', label: '🖼 ビジュアル編集'},
    {key: 'ip_banners', label: 'IPコラボ'},
    {key: 'hero_banners', label: 'ヒーローバナー'},
    {key: 'color_models', label: 'カラーモデル'},
    {key: 'category_cards', label: 'カテゴリカード'},
    {key: 'product_shelves', label: '商品棚'},
    {key: 'about_sections', label: 'ABOUT'},
    {key: 'footer_configs', label: 'フッター'},
    {key: 'customization_matrix', label: 'カスタマイズマトリックス'},
    {key: 'gaming_hero', label: '🎮 ヒーロー (Gaming)'},
    {key: 'gaming_feature_cards', label: '🎮 特集カード (Gaming)'},
    {key: 'gaming_parts_cards', label: '🎮 パーツカード (Gaming)'},
    {key: 'gaming_price_ranges', label: '🎮 価格帯 (Gaming)'},
    {key: 'gaming_contact', label: '🎮 お問い合わせ (Gaming)'},
    {key: 'ugc_reviews', label: '⭐ レビュー (UGC)'},
  ];

  return (
    <div style={{padding: 20, color: T.tx}}>
    {/* patch 0119 (Apple CEO ライフサイクル監査): 高校生向け 1 行説明 */}
    <TabHeaderHint
      title="お店の見た目を変える"
      description="トップページの宣伝バナー、特集カード、商品シェルフなど、お客さまが最初に見る画面を編集します。"
      relatedTabs={[{label: '写真・動画の保管箱', tab: 'files'}, {label: 'お店の基本情報', tab: 'siteConfig'}]}
    />
      <div style={{marginBottom: 16}}>
        <h2 style={{fontSize: 18, fontWeight: 900, margin: 0, color: T.tx}}>ページ編集</h2>
        <div style={{fontSize: 11, color: T.t4, marginTop: 4}}>
          トップページ構成要素を Metaobject で編集します。管理画面の変更は保存後すぐ本番に反映されます。
        </div>
      </div>

      {/* patch 0163: タブ strip を sticky 化 — 長いセクションの中からでも他タブに移れる
          CEO 指摘「各タブ内をクリックすると、ひとつ前のタブセクションに戻ることができない」 */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 16,
        borderBottom: `1px solid ${al(T.tx, 0.1)}`,
        flexWrap: 'wrap',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: T.bg,
        padding: '6px 0 0',
        boxShadow: `0 4px 12px -8px ${al(T.tx, 0.2)}`,
      }}>
        {/* 「ページ編集の最初に戻る」= visual タブへのショートカット */}
        {subTab !== 'visual' && (
          <button
            type="button"
            onClick={() => {
              setSubTab('visual');
              window.scrollTo({top: 0, behavior: 'smooth'});
            }}
            title="ページ編集のトップ (ビジュアル編集) に戻る"
            aria-label="ページ編集のトップに戻る"
            style={{
              padding: '10px 14px',
              background: al(T.c, 0.1),
              border: `1px solid ${al(T.c, 0.3)}`,
              borderRadius: 6,
              color: T.c,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              marginRight: 6,
            }}
          >
            ← ページ編集トップ
          </button>
        )}
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setSubTab(t.key);
              window.scrollTo({top: 0, behavior: 'smooth'});
            }}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${subTab === t.key ? T.c : 'transparent'}`,
              color: subTab === t.key ? T.tx : T.t4,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'visual' && <VisualEditSection onNavigate={setSubTab} pushToast={push} />}
      {subTab === 'ip_banners' && <IpBannersSection pushToast={push} confirm={confirm} />}
      {subTab === 'hero_banners' && <HeroBannersSection pushToast={push} confirm={confirm} />}
      {subTab === 'color_models' && <ColorModelsSection pushToast={push} confirm={confirm} />}
      {subTab === 'category_cards' && <CategoryCardsSection pushToast={push} confirm={confirm} />}
      {subTab === 'product_shelves' && <ProductShelvesSection pushToast={push} confirm={confirm} />}
      {subTab === 'about_sections' && <AboutSectionsSection pushToast={push} confirm={confirm} />}
      {subTab === 'footer_configs' && <FooterConfigsSection pushToast={push} confirm={confirm} />}
      {subTab === 'customization_matrix' && <CustomizationMatrixSection pushToast={push} confirm={confirm} />}
      {subTab === 'gaming_feature_cards' && <GamingFeatureCardsSection pushToast={push} confirm={confirm} />}
      {subTab === 'gaming_parts_cards' && <GamingPartsCardsSection pushToast={push} confirm={confirm} />}
      {subTab === 'gaming_price_ranges' && <GamingPriceRangesSection pushToast={push} confirm={confirm} />}
      {subTab === 'gaming_hero' && <GamingHeroSlidesSection pushToast={push} confirm={confirm} />}
      {subTab === 'gaming_contact' && <GamingContactSection pushToast={push} confirm={confirm} />}
      {subTab === 'ugc_reviews' && <UgcReviewsSection pushToast={push} confirm={confirm} />}

      <ToastContainer toasts={toasts} />
      {/* patch 0057 Phase C 第3段: ConfirmDialog は canonical ds/ConfirmDialog に一本化。dialogProps spread で渡す */}
      <ConfirmDialog {...confirmDialogProps} />
      <style dangerouslySetInnerHTML={{__html: `@keyframes aped-spin { to { transform: rotate(360deg); } }`}} />
    </div>
  );
}


// patch 0049 Phase C 第2段: ColorModelsSection + ColorModelForm は
// ./pageEditor/ColorModelsSection.tsx へ切り出し済み。戻し方: Git 履歴の `cbd3f6c` 時点 L799-1156 を参照。

// patch 0050 Phase C 第2段: CategoryCardsSection + CategoryCardForm は
// ./pageEditor/CategoryCardsSection.tsx へ切り出し済み。戻し方: Git 履歴の `a6fc170` 時点 L798-1132 を参照。

// patch 0051 Phase C 第2段: ProductShelvesSection + ProductShelfForm は
// ./pageEditor/ProductShelvesSection.tsx へ切り出し済み。戻し方: Git 履歴の `01713e6` 時点 L803-1169 を参照。

// patch 0052 Phase C 第2段: AboutSectionsSection + AboutSectionForm は
// ./pageEditor/AboutSectionsSection.tsx へ切り出し済み。戻し方: Git 履歴の `3689a0e` 時点 L809-1147 を参照。

// patch 0053 Phase C 第2段: FooterConfigsSection + FooterConfigForm は
// ./pageEditor/FooterConfigsSection.tsx へ切り出し済み。戻し方: Git 履歴の `cfbce7e` 時点 L815-1188 を参照。

// patch 0054 Phase C 第2段: IpBannersSection + IpBannerForm は
// ./pageEditor/IpBannersSection.tsx へ切り出し済み。戻し方: Git 履歴の `fcca0d3` 時点 L825-1213 を参照。

// patch 0055 Phase C 第2段: HeroBannersSection + HeroBannerForm は
// ./pageEditor/HeroBannersSection.tsx へ切り出し済み。戻し方: Git 履歴の `f19e245` 時点 L828-1192 を参照。

// patch 0056 Phase C 第2段: CustomizationMatrixSection + MatrixOption は
// ./pageEditor/CustomizationMatrixSection.tsx へ切り出し済み。戻し方: Git 履歴の `d153c3d` 時点 L834-1160 を参照。

// patch 0056 Phase C 第2段: GamingCrudSection + GamingFeatureCardsSection + GamingPartsCardsSection
// + GamingPriceRangesSection + GamingHeroSlidesSection + GamingContactSection + GamingCmsItem + GamingSectionConfig + cmsList は
// ./pageEditor/GamingSections.tsx へ切り出し済み。戻し方: Git 履歴の `d153c3d` 時点 L1162-1647 を参照。


// ══════════════════════════════════════════════════════════
// patch 0039: ユーザーレビュー (astromeda_ugc_review)
// patch 0047 Phase C 第1段: ./pageEditor/UgcReviewsSection.tsx へ切り出し済み。
// インライン定義は丸ごと削除した。実体は import 文 (ファイル冒頭) 経由で提供される。
// 戻し方: Git 履歴の `0837815` 時点 L4179-4801 を参照。
// ══════════════════════════════════════════════════════════
