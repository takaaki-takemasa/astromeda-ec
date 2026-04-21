# 管理画面 × パイプライン × ハードコード監査 2026-04-21

**CEO 指示**: 「ハードコードやパイプライン切断、プルダウン設定、バナーの変更など、アップルとストライプのCEO目線で最適な状態かを詳細に監査し、全部修正するつもりで監査して下さい。」
**前提**: patch 0092 (AdminOnboarding Dashboard + AdminMetaobjectDefinitions 日本語化) 本番反映済 (commit 52177f9 / Run #24722704407 ✅)
**監査者**: Claude (Opus 4.7) — Stripe/Apple CEO 目線 + 中学生可読基準

## 総合判定

- **Regulatory / 法務**: **不合格** — 特商法ページ (公開中) と内部正本が**矛盾**。
- **Admin ↔ Storefront パイプライン**: **部分合格** — 17 Metaobject 型 100% 配線済みだが、**ハードコード constants から直接 import しているコンポーネント・ページが複数残存**。管理画面から変更しても storefront に反映されないケースあり。
- **プルダウン/カスタマイズ**: **注意** — STANDARD_OPTIONS と admin 編集 customOptions が *full-replace merge* で、admin 側を 1 件作ると native 17 項目が消える設計バグあり。
- **バナー**: **合格** — IpBannersSection / HeroBannersSection が Metaobject 優先 + Shopify collection image fallback で二重の堅牢性。

## P0 — 規制/コンプライアンス (即修正必須)

### P0-1. 特商法ページのハードコード/住所・電話・メール矛盾
- 公開中 `app/routes/legal.tokushoho.tsx:31-45` は **〒162-0825 東京都新宿区神楽坂3-2-15 / 03-6265-3740 / support@mining-base.co.jp** をハードコード rows で表示。
- 正本 `app/lib/astromeda-data.ts:158-170 LEGAL.tokusho` は **〒174-0063 東京都板橋区前野町1-29-10 / 03-6903-5371 / customersupport@mng-base.com**。
- 同じ矛盾が `app/routes/legal.privacy.tsx:126-137` にも (privacy の連絡先)。
- Shopify Metaobject `astromeda_legal_info`(handle=`legal-main`) は seed で正本を投入する設計 (`api.admin.cms-seed.ts:321-334`)。
- **どれが真か未確定** — CEO 確認の上、`astromeda_legal_info` を正本にして legal ページ 2 本を loader 経由で駆動する (patch 0093)。

### P0-2. astromeda_site_config が root.tsx で未読
- 現状 `root.tsx` の Organization/WebSite JSON-LD に `STORE_NAME` / `COMPANY_NAME` 定数を直接埋め込み。
- `astromeda_site_config` は admin で編集できるが SEO/メタに反映されない。
- **patch 0094**: root loader で `astromeda_site_config` 取得 → meta + JSON-LD に overlay。

### P0-3. AdminOnboarding Dashboard の商品件数が truncated
- patch 0092 で導入した Dashboard の StatCard 「商品数」は `/api/admin/products?limit=50` の配列 length を表示 → **50 件を超えると頭打ち**。
- Shopify には **500+ 商品**が存在するため、CEO が「管理画面を見ても総件数が見えない」状態。
- **patch 0095**: `productsCount` GraphQL field 取得に切り替え。

## P1 — 管理画面↔UI パイプライン切断 (Go-Live 前修正推奨)

### P1-1. CrossSell.tsx が COLLABS 直 import
- `app/components/astro/CrossSell.tsx` は `COLLABS` / `FEATURED` を直接 import して cross-sell 表示。admin の `astromeda_ip_banner` 編集が反映されない。
- **patch 0096**: loader 経由で Metaobject overlay、fallback として COLLABS。

### P1-2. ProductCustomization merge が full-replace
- `app/components/astro/ProductCustomization.tsx:272` — `opts = customOptions && customOptions.length > 0 ? customOptions : STANDARD_OPTIONS`。
- admin で 1 個だけ customOption を作ると **STANDARD_OPTIONS 17 項目 (CPU/GPU/メモリ/SSD/ケース/電源/OS/etc.) が全消失**。
- **patch 0097**: key ベース overlay に変更。`[...STANDARD_OPTIONS, ...customOptions.filter(c => !STANDARD_OPTIONS.some(s => s.key === c.key))]` か同等の exclusive-OR merge。

### P1-3. BENCHMARKS / CREATIVE_BENCHMARKS に admin UI なし
- `astromeda-data.ts:212-331` の 150+ ベンチマーク値は admin 未配線 → 新 GPU/新ゲーム追加時にコード編集必要。
- **patch 0098** (optional): `astromeda_benchmark_score` Metaobject 新設。

### P1-4. guides/how-to-choose / guides/recommended-for-me-pc 直 import
- `guides/*.tsx` は PC_TIERS を直接 import (一部は pc_tier Metaobject overlay 済)。
- 未配線 guides も loader 経由にする (patch 0099)。

### P1-5. KEYBOARD_OPTIONS ハードコード
- patch 0060 で line_item_property 化は完了したが、配列種類 (JIS/US/US配列/etc.) 自体は `ProductCustomization.tsx:213-221` ハードコード。
- 管理画面からの追加不可 → custom_option Metaobject に種別タグ追加で吸収可能。

### P1-6. legal.privacy.tsx 本文がハードコード
- 9 Section × 数百文字が `.tsx` に埋没。`astromeda_legal_info.privacy_text` があるが 1 フィールドでは足りない。
- **patch 0099 延伸**: `astromeda_static_page` に `/legal/privacy` 登録、section ごとの markdown 化。

### P1-7. UGC セクション ハードコードラベル
- 「お客様の声」見出し/件数テキストが UGCCarousel.tsx に hard-coded。multilang 時に破綻リスク。

## P2 — 改善余地 (優先度中)

### P2-1. BENCHMARKS の計測日時なし
- データの鮮度が見えない → Stripe/Apple なら必ず「〜時点」を併記。

### P2-2. ハードコード Meta タグ重複
- 各 route で title/description を直書き → metaobject_seo_article と二重管理箇所あり。

### P2-3. admin 16 タブに `/` キーボードショートカット無し
- Apple/Stripe admin 水準では「/ で検索」が標準。

## 管理画面完結性チェック

| 操作 | admin 完結 | Shopify 迂回 | 備考 |
|---|---|---|---|
| 商品 CRUD | ✅ | — | patch 0064 以降 |
| コレクション CRUD | ✅ | — | patch 0064 |
| タグ一括 | ✅ | — | patch 0065 |
| URLリダイレクト | ✅ | — | patch 0066 |
| Files (画像) | ✅ | — | patch 0067 |
| Metaobject定義 | ✅ | — | patch 0068 |
| Discount | ✅ | — | patch 0069 |
| Menu (ナビ) | ✅ | — | patch 0070 |
| IPコラボ banner 画像 | ✅ | — | Metaobject fallback 有 |
| Hero banner 画像 | ✅ | — | Metaobject fallback 有 |
| PCカラー 8色画像 | ✅ | — | Metaobject 有 |
| 法務 (特商法/プライバシー) | ❌ | **.tsx 直書き** | P0-1 |
| ベンチマーク数値 | ❌ | **.ts 直書き** | P1-3 |
| guides (how-to-choose/recommended-for-me-pc) | 部分 | 一部 .tsx 直書き | P1-4 |
| keyboard 配列追加 | ❌ | **.tsx 直書き** | P1-5 |
| privacy policy 本文 | ❌ | **.tsx 直書き** | P1-6 |

## 実装ロードマップ

| patch | scope | 優先度 | 見積 |
|---|---|---|---|
| 0093 | legal pages (tokushoho + privacy) Metaobject 駆動化 | P0 | 1 cycle |
| 0094 | root.tsx site_config 配線 | P0 | 0.5 cycle |
| 0095 | Dashboard productsCount 実総件数 | P0 | 0.5 cycle |
| 0096 | CrossSell Metaobject overlay | P1 | 0.5 cycle |
| 0097 | ProductCustomization exclusive-OR merge | P1 | 0.5 cycle |
| 0098 | BENCHMARKS Metaobject 化 | P1 | 1 cycle |
| 0099 | guides + /about + keyboard layout Metaobject | P1 | 1 cycle |

## 次のアクション

patch 0093 から着手。`astromeda_legal_info` を loader 経由で取得し、`legal.tokushoho.tsx` と `legal.privacy.tsx` の冒頭 connect 情報を Metaobject overlay → フォールバックで hardcode。admin → UI ラウンドトリップを本番 Chrome MCP で検証。
