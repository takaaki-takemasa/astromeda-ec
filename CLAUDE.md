# Astromeda EC サイト — プロジェクトガイド

## プロジェクト概要
マイニングベース社のゲーミングPCブランド「Astromeda」のECサイト。
Shopify Hydrogen + Oxygen で構築中。React Router 7 + Vite + Tailwind CSS。

## オーナー
武正貴昭（CEO・非エンジニア）。日本語で対応すること。
技術的な説明は不要。「何をしてほしいか」だけ聞くこと。
判断が必要な場合のみ質問し、それ以外は全て自律的に実行すること。

## 実行環境
**OSはWindows。** 以下のルールを厳守：
- bashスクリプト（.sh）ではなく、PowerShellまたはnpmスクリプトで実行
- Unix固有コマンド（chmod, sed, grep等）は使わず、Node.js/npmまたはPowerShellで代替
- プロジェクトパス: `C:\Users\Mining-Base\mngb Dropbox\武正貴昭\PC (2)\Desktop\astromeda-ec`

## 重要ルール
- **本番切り替え禁止**: 完全にデバッグ・構成確認が終わるまで、現行サイトからの切り替えは絶対にしない。バグだらけの状態で切り替えると売上が下がる。
- **未完了のまま進めない**: 作業を中途半端に残して次に進まない。各ステップを完了してから次へ。
- エラーが発生したら自分で修正すること。
- **全画像はShopify API経由で取得。ローカル保存はしない。**

## 技術スタック
- Shopify Hydrogen 2026.1.1
- React Router 7.12.0
- Vite + Tailwind CSS v4
- TypeScript
- Shopify Storefront API (GraphQL)

## Shopifyストア情報
- **本番ストア**: `production-mining-base`
- **ステージング**: `staging-mining-base`
- **ドメイン**: shop.mining-base.co.jp
- **Storefront ID**: 1000122846
- **SHOP_ID**: 74104078628
- デプロイ先は Oxygen（Shopify）。ステージングで検証してから本番へ。

## 主要ファイル
- `app/routes/_index.tsx` — トップページ（HeroSlider, CollabGrid, PCShowcase）
- `app/components/astro/CollabGrid.tsx` — IPコラボグリッド（Shopifyコレクション画像表示）
- `app/components/astro/HeroSlider.tsx` — ヒーローバナースライダー
- `app/components/astro/PCShowcase.tsx` — PC商品ショーケース
- `app/lib/astromeda-data.ts` — IP COLLABS データ（26タイトル）、テーマ定数、カラーパレット
- `server.ts` — Oxygen worker エントリポイント
- `vite.config.ts` — Vite設定（hydrogen, oxygen, reactRouter プラグイン）

## IPコラボレーション（COLLABS）
26タイトルのIPコラボ。`astromeda-data.ts`の`COLLABS`配列で管理。
各エントリの`shop`フィールドはShopifyコレクションのハンドルに対応。
2026/04/02時点で全ハンドルをShopify実データと照合済み。

### 確認済みShopifyコレクションハンドル（親IP・全てバナー画像あり）
| IP名 | Shopifyハンドル |
|---|---|
| ONE PIECE バウンティラッシュ | `one-piece-bountyrush-collaboration` |
| NARUTO-ナルト- 疾風伝 | `naruto-shippuden` |
| 僕のヒーローアカデミア | `heroaca-collaboration` |
| ストリートファイター6 | `streetfighter-collaboration` |
| サンリオキャラクターズ | `sanrio-characters-collaboration` |
| ソニック | `sega-sonic-astromeda-collaboration` |
| 呪術廻戦 | `jujutsukaisen-collaboration` |
| チェンソーマン レゼ篇 | `chainsawman-movie-reze` |
| ぼっち・ざ・ろっく！ | `bocchi-rocks-collaboration` |
| hololive English | `hololive-english-collaboration` |
| BLEACH Rebirth of Souls | `bleach-rebirth-of-souls-collaboration` |
| BLEACH 千年血戦篇 | `bleach-anime-astromeda-collaboration` |
| コードギアス | `geass-collaboration` |
| 東京喰種 | `tokyoghoul-collaboration` |
| ラブライブ！虹ヶ咲 | `lovelive-nijigasaki-collaboration` |
| SAO | `swordart-online-collaboration` |
| ゆるキャン△ | `yurucamp-collaboration` |
| パックマス | `pacmas-astromeda-collaboration` |
| すみっコぐらし | `sumikko` |
| ガールズ＆パンツァー | `girls-und-panzer-collaboration` |

### 親コレクション未作成（画像なしまたはコレクション不在）
- リラックマ → `goods-rilakkuma`（サブコレクション代用）
- 新兎わい → `pc-nitowai`（画像なし）
- Palworld → `astromeda-palworld-collaboration-pc`（画像なし）
- アイマス ミリオンライブ → `imas-millionlive-collaboration`（コレクション不在）
- ミリプロ → `milpr-pc`（サブコレクション代用）
- 黒い砂漠 → `black-desert-collaboration`（画像なし）

## Shopify Smart Collection 条件
- ガジェット: タイトル contains（マウスパッド, PCケース, キーボード, パネル）→ 343商品
- グッズ: タイトル contains（アクリル, Tシャツ, パーカー）→ 88商品
- 各IPの親コレクション: タグベースの条件

## 画像システム
全画像はShopify API経由で取得（ローカル保存禁止）：
- 商品画像: Storefront API `product.images`
- ヒーローバナー: コレクション画像 or メタフィールド
- IPコラボ画像: `collection.image` （Storefront API collections クエリで250件一括取得）
- Shopify CDNで自動WebP変換（`?width=600&format=webp`）
- Hydrogenの `<Image>` コンポーネントを活用
- フォールバック: 画像未登録時はグラデーション背景を表示

## ビルド & デプロイ
```powershell
cd "C:\Users\Mining-Base\mngb Dropbox\武正貴昭\PC (2)\Desktop\astromeda-ec"
npm run build
npx shopify hydrogen deploy --build-command "npm run build" --force --entry server
```

### デプロイ済みURL（Preview環境）
- **v135 Preview**: https://01knv7zcf6tbepygf1n46g1gx0-48a1974bca92d5b3444d.myshopify.dev （2026/04/10 **ガジェット/グッズ商品分類修正**。Storefront API `title:` プレフィックス検索が日本語で0件になる根本バグを発見→ベア検索+キーワード別並列検索に全面書き換え。修正4ファイル: collections.$handle.tsx（補完検索ロジック全面改修+着せ替え追加）、products.$handle.tsx（パンくず/メタ/FAQ分類にケースファン/缶バッジ/メタルカード/トートバッグ/モバイルバッテリー追加）、ShippingEstimate.tsx（着せ替え/ケースファン/モバイルバッテリー追加）。**動的検証合格**: ガジェット173商品+キーボードタブ21商品（修正前0件→21件）、グッズ69商品+缶バッジ10商品+モバイルバッテリー11商品、全8タブ正常表示。コンソールエラーゼロ。）
- **v134 Preview**: https://01knv486ff8retrrw9exvd14ep-48a1974bca92d5b3444d.myshopify.dev （2026/04/10 **全フェーズ完了・Go-Live準備完了**。useOptimisticCart修正(CartUpsell.tsx selectedVariant追加)+J-SEO-01 Organization/WebSite JSON-LD+L-phase 301リダイレクト3件(/pages/gaming-pc→/collections/gaming-pc, /pages/gadget→/collections/gadgets, /pages/goods→/collections/goods)。**動的検証全6ルート合格**: トップページ/呪術廻戦コレクション/商品詳細(キーボード宿儺)/FAQ/robots.txt/api-health(23/23 agents ready)。**コンソールエラー完全ゼロ**（v133のuseOptimisticCart警告6件も解消）。649テスト合格+クリーンビルド成功。）
- **v133 Preview**: https://01knv1qsbapej76ezszj1fwgpp-48a1974bca92d5b3444d.myshopify.dev （2026/04/10 M8骨格+D-phase+I-phase全完了。**E-phase カート・チェックアウト動的検証合格**: 呪術廻戦コレクション→商品(キーボード宿儺¥34,980)→カート追加→数量変更(1→2=¥69,960)→削除→チェックアウトリダイレクト(shop.mining-base.co.jp/checkouts/ 商品・価格・決済手段正常)→全ページコンソールエラーゼロ。**F-phase レスポンシブ監査合格**: Header=ハンバーガーメニュー(768px)対応済、HeroSlider=モバイル240px/タブレット500px、CollabGrid=2列/3列、PCShowcase=2/3/4列+ティアカードH-scroll、Footer=1/2列。CRITICALなレイアウト崩れゼロ。既知中程度: useOptimisticCart警告6件(Hydrogen SDK)。649テスト合格+クリーンビルド成功。）
- **v132 Preview**: https://01kntxnztz1h6w946yr6m8ypkt-48a1974bca92d5b3444d.myshopify.dev （2026/04/10 医療成熟監査v6=M7外科手術。**React #418/#425/#423 hydration エラー完全解消**。M7-NEURAL-01: 全27ファイル29箇所の `<style>{...}</style>` パターンを `<style dangerouslySetInnerHTML={{__html: ...}} />` に一括変換。React 18 が `<style>` 内テキストノードを hydration 時に比較→ブラウザの空白正規化で SSR/CSR 不一致が発生していた根本原因を除去。M7-TEST-01: 静的ガードテスト追加（将来の再発防止）+ componentStack 3000char 検証。649テスト合格 + clean build 成功。動的検証: トップページ/呪術廻戦コレクション/商品詳細の3ページでコンソールエラーゼロ・`/api/error` リクエストゼロ・localStorage キャプチャゼロを確認。v131 では毎回発生していた React #418 が完全消失。詳細は `市場調査/医療成熟監査v6_2026-04-10.md` 参照）
- **v131 Preview**: https://01kntj7ak42w3w14a97pphwtm0-48a1974bca92d5b3444d.myshopify.dev （2026/04/10 医療成熟監査v5=M6サイクル。M6-NEURAL-01 `entry.client.tsx` onRecoverableError → reportError 経由 `/api/errors` 送信（本番対応）を実装。componentStack を marker=M6-NEURAL-01 付きで送信し、本番の React #418 真犯人を逆探知するための**診断装置**。v132 で #418 の真犯人（`<style>` children パターン）を特定・修正する根拠データを提供。）
- **v130 Preview**: https://01kntgn658g2kxajebn8f573dm-48a1974bca92d5b3444d.myshopify.dev （2026/04/10 医療成熟監査v4適用・部分成功。M5-NEURAL-01 ReviewStars Math.random→React.useId() 置換デプロイ済み。動的確認で linearGradient id が `:r7:` （useId の決定論的フォーマット）になっていることを確認済み。トップページ（108コラボ+50画像+hero正常）と products 詳細（BLACKBOX Ryzen5 10星SVG描画）は正常表示。テスト642合格、clean build 成功。**⚠️ ただし React #418 はトップ・products 両方で依然発生中**。ReviewStars はトップページで使われていないのに top でも #418 が出るため、#418 の真の発生源は別コンポーネント。M5-NEURAL-01 は潜在バグの除去として有効（半端な星評価での linearGradient ID 不一致を予防）だが、トップページ #418 の原因ではなかった。M6 で真の発生源を特定する。候補：Hydrogen Analytics.Provider / RecentlyViewedProvider（localStorage）/ PredictiveSearch / 未監査の Hydrogen 内蔵コンポーネント。詳細は `市場調査/医療成熟監査v4_2026-04-10.md` 参照）
- v129 Preview: https://01kntf74w3h39t19zcjbrxwrcp-48a1974bca92d5b3444d.myshopify.dev （2026/04/10 医療成熟監査v3適用。M4-NEURAL-01（AppSession.init に recovered フラグ＝破損Cookie再形成で記憶喪失ループ解消）+ M4-CARDIAC-03（error-reporter fetch response.ok 検証＝5xx再キュー/4xx破棄）+ M4-CARDIAC-06（flush() MAX_ITERATIONS=20＋進捗なし検出＝beforeunload凍結防止）の3点修正。error-reporter.test.ts に5ケース追加。ビルド成功+29ファイル/639テスト合格（634→639）。動的検証：`/api/health` 全セキュリティヘッダー回帰なし（nosniff/HSTS/Referrer/Permissions/Cache-Control/Content-Type）、23/23エージェント ready、呪術廻戦コレクション19商品リンク表示、503モック+beforeunload で1.4秒で制御返却（凍結なし）。既知事項：React minified error #418（hydration mismatch）は v128 でも同一スタックで発生する既存事項、M5候補。詳細は `市場調査/医療成熟監査v3_2026-04-10.md` 参照）
- v128 Preview: https://01kntdtcxt2aat6qdafqawm110-48a1974bca92d5b3444d.myshopify.dev （2026/04/10 医療成熟監査v2適用。server.ts に M3-IMMUNE-01（handleHealthCheck応答に applySecurityHeaders 追加＝バイタルサイン測定部位の皮膚バリア欠損修復）+ M3-IMMUNE-02（catch 500応答に applySecurityHeaders + Cache-Control 追加＝ショック状態患者の全身被覆）の2点修正。ビルド成功+621テスト合格+ブラウザ検証全合格：`/api/health` で X-Content-Type-Options=nosniff / HSTS=max-age=31536000 / Referrer-Policy=strict-origin-when-cross-origin / Permissions-Policy=camera/mic/geo=() / Cache-Control=no-store / Content-Type=application/json 全付与確認済み。呪術廻戦コレクション20商品+JSON-LD+CSP正常。詳細は `市場調査/医療成熟監査v2_2026-04-10.md` 参照）
- v127 Preview: https://01kntcza9jpag1kbyvt5b76jym-48a1974bca92d5b3444d.myshopify.dev （2026/04/10 医療成熟監査v1適用。entry.client.tsx に M2-NEONATAL-01（initErrorReporter try/catch堅牢化＝新生児呼吸神経の保護）+ M2-NEONATAL-02（nonce抽出全script走査化＝中枢神経ミエリン剥離防止）の2点修正。ビルド成功・Preview デプロイ完了。トップページ/呪術廻戦コレクション20商品/構造化データ検証合格。詳細は `市場調査/医療成熟監査v1_2026-04-10.md` 参照）
- v126 Preview: https://01kntbrsgkx1fkqdpkd3erm07g-48a1974bca92d5b3444d.myshopify.dev （2026/04/10 プロフィール保存緊急修正。CustomerUpdateInputにmetafieldsフィールドが存在しない問題を、customerUpdate→metafieldsSet 2段階ミューテーションに分割して根本解決。E2Eテスト合格：「クロードさん、ようこそ」表示+「プロフィールを更新しました」成功バナー+チェックアウトガード警告消失確認済み）
- v125 Preview: https://01knt9gmjnrafbdrkqnbfpv7jj-48a1974bca92d5b3444d.myshopify.dev （2026/04/10 医療監査手術完了。vite plugin順序/Agent warmUp冪等化/Set-Cookie append/Provider ErrorBoundary/CLAUDE.md補強の5箇所を修正。ビルド成功+621テスト合格+5ルート（robots.txt/sitemap.xml/トップ/呪術廻戦コレクション/カート）ブラウザ検証全合格）
- v102 Production: https://astromeda-ec-273085cdf98d80a57b73.o2.myshopify.dev （2026/04/09 本番デプロイ復旧。A-06/A-07完了。worker.mjs module shim検証済み、現行コード含めて本番配信中）
- v102 Preview: https://01knrqhfdkvyrd7n7hdkg2q9k2-273085cdf98d80a57b73.myshopify.dev （2026/04/09 Production環境デプロイ）
- v101: https://01knrq5xjsk4bdmmqqk0fs5wjn-48a1974bca92d5b3444d.myshopify.dev （2026/04/09 /pages/faq→/faq リダイレクト検証済み）
- v100: https://01knr9sc8t7r4tm7j551cdvhzg-48a1974bca92d5b3444d.myshopify.dev （2026/04/09 robots.txtからGraphQLクエリ完全除去→フリーズ根本解決。sitemap.xml/コレクションN+1修正検証済み。全3テスト合格）
- v97: https://01knr3j97f3tpdg0hh03gg1x7t-48a1974bca92d5b3444d.myshopify.dev （2026/04/09 会員登録必須化+プロフィール機能。メタフィールド定義3件作成済み、チェックアウトガード実装）
- v96: https://01knr08xpgyrv2s8jgy1eb3kyb-48a1974bca92d5b3444d.myshopify.dev （2026/04/09 カスタマイズバリアントがカート合計に反映。entry.client.tsxのsubmitインターセプターで実現）
- v93: https://01knph47ypt8dre4m8tg7y7f7t-48a1974bca92d5b3444d.myshopify.dev （2026/04/08 カスタマイズ価格表示、CSP修正、UI修正多数）
- v80: https://01knnn7fja0waeypaxj089zwpj-48a1974bca92d5b3444d.myshopify.dev （2026/04/08 視覚テスト済み）

### Cart Transform拡張（カスタマイズ価格をカート合計に反映）
`extensions/cart-customization-pricing/` に Shopify Function を実装済み。
カート属性 `_customization_surcharge` の数値を読み取り、本体価格＋追加金額に価格を変更する。

**デプロイ手順（Claude Codeから）:**
1. `shopify app dev` を実行 → 初回はアプリ登録・リンクが自動で行われる
2. 動作確認後、`shopify app deploy` で本番デプロイ
3. Shopify管理画面 → 設定 → アプリ → Cart Transform を有効化

**注意:**
- `update`オペレーション（価格変更）は Shopify Plus or 開発ストアのみ
- 通常プランの場合は `expand`オペレーションに変更が必要
- `shopify.app.toml` の `client_id` はアプリ登録後に自動設定される

### 既知の問題（解決済み・再発注意）
- **デプロイ時「Worker file not found」エラー**: 根本原因はプロジェクトパス `PC (2)` の括弧`()`がShopify CLIのglob処理でエスケープされず、ワーカーファイルが0件でOxygen APIに送信されていた。CLIの`getUploadFiles`関数のglobパターンをパッチして解決。**node_modulesを再インストールするとパッチが消えるため、再度パッチ適用が必要。**
- 長期的にはプロジェクトを括弧・スペースのないパス（例: `C:\Projects\astromeda-ec`）に移動することを推奨。
- 親コレクション未作成の6件のIPは、Shopify管理画面で親コレクションを作成しバナー画像を設定する必要あり。

## UIプロトタイプ
元のデザイン参照: `test-v10-step6.jsx`（市場調査フォルダ内、191KB）
GUI設計書: `Astromeda_GUI設計書_完全版.xlsx`（市場調査フォルダ内）

## 設計書（市場調査フォルダ内・v12世代最新版）
- エージェント設計書v7（47体）
- エージェントマップv9（6チーム構成）
- システムアーキテクチャ設計書v5（7層構造）
- ガントチャートv12（304タスク）
- パイプライン設計書v4（16フロー）
- ディレクトリ構造v6
- クロスリファレンス再監査v6（全設計書整合性確認済み）

## Phase構成
- **Phase 1**: ECサイト構築（現在進行中 — デプロイ・IPバナー表示まで到達）
- **Phase 2**: 47体AIエージェントシステム構築（EC完成後に着手）

## 作業復帰ポイント（2026/04/17 最新）
**v166 auto-deploy 配管完成 + CMS API ラウンドトリップ全合格**:
- **GitHub Actions 自動デプロイ稼働**: commit fbed988 (run #70) で main push → npm ci → build → `npx shopify hydrogen deploy --force --entry server --no-lockfile-check --token "$SHOPIFY_HYDROGEN_DEPLOYMENT_TOKEN"` の配管完成。ci.yml の `if: false` ガード解除、`scripts/patch-hydrogen-vendor.js` 追加で npm install 後も Hydrogen vendor COMPAT_DATE パッチ永続化。
- **Fix B (RBAC 解消, commit 6549c48, run #74)**: `api.admin.cms.ts` line 97 の `requirePermission(..., 'content.edit')` を `'products.edit'` に変更。`content.edit` は rbac.ts 未定義だったため全ロールで 403 → owner/admin/editor が CMS API を使えるように。Run #74: Test 182s + Deploy 55s で success。
- **13 Metaobject definition 作成完了**: `SETUP-METAOBJECTS.mjs` で POST /api/admin/metaobject-setup 実行。既存7 (article_content/ip_banner/hero_banner/seo_article/custom_option/campaign/category_card) + 新規6 (site_config/pc_color/pc_tier/ugc_review/marquee_item/legal_info) = 13種を Shopify 本番ストアに配備。errors=0。
- **CMS API E2E 合格**: `VERIFY-CMS-API-V7.mjs` で GET /admin/login → POST /admin/login (_csrf込) → GET /api/admin/cms (新版 `{success,type,items,total}` 200) → POST create (200, id発行) → POST delete (200) の全 5 Step 合格。Production URL: `https://astromeda-ec-273085cdf98d80a57b73.o2.myshopify.dev`。
- **次**: Dependabot PR (#71-73 で失敗検知の eslint/react/typescript 更新) のトリアージ、および Gantt v50 S5 テストフェーズ着手。

### Lighthouse計測結果（v133 Preview・モバイル）
- **パフォーマンス: 99** ✅（目標90+を大幅超過）
- **おすすめの方法: 96** ✅
- **ユーザー補助: 88** ⚠️（Shopifyリダイレクトページのmeta refresh減点。実サイトは問題なし）
- **SEO: 80** ⚠️（同リダイレクトのmeta description/HTTP status code減点。実サイトは全ルートにmeta description設定済み）
- **Core Web Vitals（CrUX実測・合格）**: LCP=2秒(緑) / INP=126ms(緑) / CLS=0(緑) / FCP=2秒(黄) / TTFB=1.1秒(黄)
- ※ PSIがOxygen PreviewのShopify認証リダイレクトを分析したため、SEO/アクセシビリティの減点はリダイレクトページ固有。本番ドメインでの再計測を推奨。

### 完了済みフェーズ
- **M2-M7** (v127-v132): React hydration 完全治療サイクル完了。38修正+12テスト追加。
- **M8** (v133): コード品質・骨格強化。products型安全化+collections重複排除+root空catch修正+aria-label全件OK。
- **D-phase** (v133): 現行サイト機能パリティ全完了。D-10 ランキング、D-11 CPUフィルタ、D-12 GPUフィルタ、D-13 価格帯フィルタ、D-14 LINE/Xリンク、D-15 Blog確認済、D-16 FAQ確認済、D-17 PC診断ウィジェット。
- **I-phase** (v133): パフォーマンス最適化完了。I-06〜I-14全完了 + Lighthouse Performance 99達成。
- **E-phase** (v133): カート・チェックアウト動的検証全合格。コンソールエラーゼロ。
- **F-phase** (v133): レスポンシブ監査合格。CRITICALレイアウト崩れゼロ。全コンポーネント768pxブレークポイント対応確認済み。
- **useOptimisticCart修正** (v134): CartUpsell.tsx に selectedVariant 追加。
- **J-phase SEO** (v134): J-SEO-01 Organization+WebSite JSON-LD（Knowledge Graph対応）。BreadcrumbList 3階層（products/collections）、Product+FAQPage JSON-LD、全ルートmeta description — 全て実装済み確認。301リダイレクトマッピングはL-phase Go-Live時に実施（同一ドメインのため）。649テスト合格+クリーンビルド成功。
- **K-phase ステージング** (v134): スモークテスト全6ルート合格（トップ/コレクション/商品詳細/FAQ/robots.txt/api-health）。コンソールエラー完全ゼロ（useOptimisticCart警告も解消）。23/23エージェントready。
- **L-phase 301リダイレクト** (v134): /pages/gaming-pc→/collections/gaming-pc, /pages/gadget→/collections/gadgets, /pages/goods→/collections/goods の3件追加。v134 Previewで動的検証全合格。
- **次**: L-phase Go-Live（本番ドメイン切り替え準備＋最終Go/No-Go判定）
- **Admin P0 ハードコード除去** (2026/04/13): 管理画面の全モック/ハードコードデータを0値+フォールバックに置換。10ファイル修正（revenue 4期間, funnel 0値化, SEO volume 0値化, GEO sessions 0値化, content Shopify CRUD, andon GET loader, status logs）。TypeScript 0エラー・ハードコード監査全10項目合格。Windowsビルド+デプロイ待ち。
- **Admin P1 新規API 4本 + 改修2本** (2026/04/13): 在庫アラート(inventory-alerts)、商品ランキング(product-ranking)、カート離脱率(cart-abandonment)、顧客LTV(customer-ltv)の4本を新規作成。全てShopify Admin API直接取得、ハードコード値ゼロ、Auth/RBAC/RateLimit/AuditLog完備。キャンペーンAPI discountRateを0+source:template化。PSI APIは既に正しい設計で変更不要確認。TypeScript 0エラー・セキュリティ監査全4項目合格。

### 販売停止IP（タスクから除外済み）
- アイドルマスター ミリオンライブ
- ミリプロ
- 黒い砂漠
※ ストリーマーPC/クリエイターPCも新サイトでは販売しない

## ガントチャート（最新: v47）
市場調査フォルダ内: `Astromeda_Phase1_ガントチャート_v47_I-phase完了版.xlsx`

## 今後のタスク（Phase 1 残り — ガントチャートv14準拠）
1. ~~デプロイエラー解消（Worker file not found）~~ ✅ 解決済み
2. ~~トップページのIPバナー表示検証~~ ✅ 視覚テストv80で確認済み
3. ~~CSP nonce不一致によるReact hydration完全停止~~ ✅ v92で解決
4. ~~カスタマイズ価格のフロントエンド表示~~ ✅ v93で実装・視覚確認済み
5. ~~カスタマイズ価格のカート合計反映~~ ✅ v96で解決
6. ~~会員登録必須化+プロフィール機能~~ ✅ v97で実装
7. ~~robots.txt/sitemap.xmlタイムアウト~~ ✅ v100で根本解決（GraphQLクエリ除去+Promise.race）
8. ~~コレクションページN+1クエリ問題~~ ✅ v100で修正検証済み（OR統合クエリ+pageBy48）
9. ~~本番デプロイ失敗の調査・修復（A-06/A-07）~~ ✅ v102で解決（module shim検証済み、Production環境で正常稼働）
10. ~~FAQリダイレクト検証（/pages/faq → /faq）~~ ✅ v101で検証済み
11. **プロフィール機能のE2Eテスト**: メール認証コード必要
12. **Shopifyデータ修正**: NARUTO商品名、8色カラー画像、未作成IP3件（リラックマ/新兎わい/Palworld）
12. **現行サイト機能パリティ**: ページ移行（法人問合せ等、ストリーマーPC/クリエイターPCは対象外）
13. **決済・カートフロー完全検証**: E2Eチェックアウトテスト
14. **UI/UX仕上げ**: モバイル/タブレット/レスポンシブ
15. **コード品質**: TypeScript any型35箇所修正、アクセシビリティ12箇所修正
16. **セキュリティ**: APIトークンスキャン、admin認証確認、入力バリデーション
17. **パフォーマンス**: Lighthouse計測→Core Web Vitals改善
18. **SEO**: メタタグ/構造化データ/リダイレクトマッピング
19. ステージングでの全体テスト
20. 本番切り替え準備 & Go-Live
