# Admin Apple CEO ライフサイクル監査 — 2026-04-22

## CEO 指令（2026-04-22 夜）

「あっぷるのCEOとしてこのディレクトリ構造の順番は正しいのか。
ユーザーが来てくれたところから発送完了まで高校生まですべて簡潔に
わかるようになっているのか。すべて確認し、高校生でも理解しやすい
構造にしてください。修正が完了したらappleのCEOの視点で改めて高校
でも運営ができるレベルの管理画面およびすべてのタブ構造、レイヤー
の最末端への修正作業の確認を行い、ユーザー画面まで繁栄されている
ことをクロードクロームを使ってすべて確認してください。やっていま
せんでしたはなしです。」

→ patch 0118（SimpleHome 6 カード化）の上に被せる「ライフサイクル順序」修正。

---

## 1. お客さま到着→発送完了 のオペレータ業務フロー

EC ストアオーナー（高校生でも回せる必要あり）の自然な業務フロー：

| # | フェーズ | 業務（オペレータ視点） | 該当 admin タブ |
|---|---|---|---|
| 1 | 店舗準備 | お店の名前・連絡先を決める | siteConfig |
| 2 | 商品準備 | 売り物（商品）を並べる | products / customization / collections / bulkTags |
| 3 | 値付け | 価格・セール・割引 | discounts |
| 4 | 集客 | バナー・キャンペーン・SNS | pageEditor / marketing / files / menus |
| 5 | URL整備 | 旧URL→新URL転送 | redirects |
| 6 | **受注** | お客さまから注文が入る | **❌ 欠落（Shopify Orders 直行）** |
| 7 | **出荷** | 商品を発送する | **❌ 欠落（Shopify Fulfillment 直行）** |
| 8 | 接客 | 説明ページ・FAQ・お問合せ | content / pageEditor |
| 9 | 経営確認 | 売上・客数を見る | summary / analytics / siteMap |
| 10 | 緊急対応 | AI 異常時の停止 | control |
| 11 | 上級者 | データ設計図・更新 | metaobjectDefs / update / agents / pipelines |

**P0 ギャップ**: 受注（#6）・出荷（#7）が現状の admin に独立タブとして存在しない。
高校生に「お客さまが来てから発送するまで」を全部見せるには、せめて
Shopify Orders / Fulfillment への deep link が必要。

---

## 2. 現状（patch 0118 後）の構造

### Sidebar 5 セクション
1. 🏠 ホーム
2. 🛒 お店の運営（commerce — 15 サブタブ／3 グループ）
3. 🤖 AI スタッフ
4. 🚨 困ったとき
5. ⚙️ 上級者設定

### Commerce 3 グループ（Stripe Dashboard 基準で patch 0071 に整理済）
- 🛍️ 商品・販売: products / collections / bulkTags / customization / discounts
- 📝 コンテンツ・ページ: content / pageEditor / homepage / siteConfig / files
- 🧭 ナビ・マーケ・分析: menus / redirects / metaobjectDefs / marketing / analytics

### SimpleHome 6 カード（patch 0118）
1. 🛒 商品を売る
2. 🎨 お店の見た目を変える
3. 📊 売上・お客様を見る
4. 🤖 AI スタッフに任せる
5. 🚨 困ったときの緊急対応
6. ⚙️ 上級者モード

---

## 3. Apple CEO 視点での「順序」判定

| 項目 | 現状 | Apple CEO 採点 | 理由 |
|---|---|---|---|
| Sidebar 5 セクション | ホーム→お店→AI→困った→上級 | △ | 「お店の運営」が広すぎる。受注/出荷が無い |
| SimpleHome 6 カード順 | 商品→見た目→売上→AI→困った→上級 | × | ライフサイクル順ではない（売上を AI/困った の前に置いているのは違和感） |
| 6 カードの「お客様到着→発送」網羅 | なし | × | **受注・出荷カードが完全欠落**（最重要ギャップ） |
| commerce 3 グループ内タブ順 | products→collections→bulkTags→customization→discounts | △ | customization は商品の選択肢なので products の直後に置きたい |
| TabHeaderHint 22 タブ展開 | プリミティブのみ・配備 0/22 | × | 「このタブで何ができるか」が末端で説明されていない |
| 高校生基準語彙 | 業務語化済（patch 0118 で 22 タブ全ラベル翻訳） | ○ | この点はクリア |

→ **構造的不合格**。順序の修正と注文・発送カード追加が必須。

---

## 4. 提案する新構造（patch 0119）

### 新 SimpleHome 7 カード（ライフサイクル順）

1. 🚀 **今日やる事を見る**（朝のエントリ）
   - 出品ガイド / 売上ダッシュボード / サイトマップ
2. 🛍️ **商品を準備する**（商品準備フェーズ）
   - 新商品追加 / 既存商品編集 / 選択肢（色・配列）/ ジャンル分け / 一括タグ
3. 📣 **お客さまを呼び込む**（集客・宣伝フェーズ）
   - トップ宣伝バナー / 写真・動画 / メニュー / URL転送 / セール価格 / キャンペーン
4. 📦 **注文を受ける・発送する**（受注・出荷フェーズ）★NEW
   - Shopify 注文一覧（外部リンク）
   - Shopify 配送・発送（外部リンク）
   - Shopify お客さま管理（外部リンク）
5. 🎨 **お店の見た目と説明を整える**（接客フェーズ）
   - お店の見た目を変える / 説明ページを直す / お店の基本情報
6. 📊 **売上を分析・改善する**（経営フェーズ）
   - 詳しいデータ分析 / キャンペーン効果 / サイトマップ
7. 🛠️ **AI・困った時・上級者**（運用補助）
   - AIスタッフ / 自動化 / 🚨 緊急停止 / データ設計図 / バージョン更新

### Commerce 3 グループ内タブ並び替え

- 🛍️ 商品・販売: products **→ customization** → collections → bulkTags → discounts
  （商品とその選択肢を隣接させる：高校生は「商品を作る→色を選べるようにする」と一直線で理解できる）
- 📝 コンテンツ・ページ: **pageEditor →** content → siteConfig → files → homepage
  （見た目編集を一番上に：「お店の見た目を変える」の主要タブが先頭）
- 🧭 ナビ・マーケ・分析: **marketing →** menus → redirects → analytics → metaobjectDefs
  （集客手段（マーケ）が先頭、上級者向け（metaobjectDefs）が末尾）

### Sidebar は変更しない

5 セクション構造は維持。注文・発送は SimpleHome カード 4 として外部リンク提供（admin 内部に独立タブを持つほどの実装は別フェーズ）。

### TabHeaderHint 高校生向け 1 行説明を 22 タブに展開

各タブの先頭に「💡 このタブで何ができるか」を 1 行で示す。例：

```tsx
<TabHeaderHint
  title="商品を作る・直す"
  description="お店で売っている商品（PC・グッズ）の追加・編集を行います。"
  relatedTabs={[
    {label: '色や配列の選択肢', tab: 'customization'},
    {label: 'ジャンル分け', tab: 'collections'},
  ]}
  onNavigateTab={onNavigateTab}
/>
```

---

## 5. patch 0119 実装範囲

### 含める
1. `SimpleHome.tsx` 全面書換え：7 カード化＋ライフサイクル順＋注文発送カード（外部リンク対応）
2. `admin._index.tsx` の `COMMERCE_GROUPS` 内タブ順序を上記提案順に並び替え
3. `市場調査/admin_apple_ceo_lifecycle_audit_2026-04-22.md`（本ドキュメント）

### 含めない（次パッチ以降）
- TabHeaderHint を 22 タブ全部に差し込む（patch 0120 で全数配備）
- Shopify Orders/Fulfillment の admin 内 iframe 表示（要 OAuth scope 拡張）
- 統計ダッシュボード（summary）と onboarding の真の統合

---

## 6. 動的検証チェックリスト（Phase 6-7）

### admin（Chrome MCP）
- [ ] /admin が SimpleHome 7 カードで開く
- [ ] カード順がライフサイクル順（今日→準備→集客→受注→見た目→分析→上級）
- [ ] 「📦 注文・発送」カードが新規表示される
- [ ] 「Shopify 注文一覧」リンクが新規タブで Shopify Admin Orders を開く
- [ ] commerce → 商品・販売タブ列が products → customization → collections → bulkTags → discounts の順
- [ ] commerce → コンテンツ・ページタブ列が pageEditor → content → siteConfig → files → homepage
- [ ] commerce → ナビ・マーケ・分析タブ列が marketing → menus → redirects → analytics → metaobjectDefs
- [ ] 22 タブ全部が以前と同じく描画される（破壊なし）

### storefront（Chrome MCP）
- [ ] / トップページがエラーゼロで表示
- [ ] /collections/jujutsukaisen-collaboration（呪術廻戦）コレクションが商品列を表示
- [ ] 商品詳細でカート追加→/cart→/checkout 遷移（お客様到着→注文 完走）
- [ ] コンソールエラーゼロ

---

## 7. 高校生でも運営できるレベルの判定基準

Apple CEO の OK 基準：

1. **入り口が一つ**: ログイン直後に「今日やる事」が見える ✅（SimpleHome カード 1）
2. **業務語で書かれている**: 「Metaobject」「カスタマイズ」等のジャーゴンが先頭画面に出ない ✅（patch 0118）
3. **ライフサイクルに沿った順序**: 商品→集客→受注→出荷→分析 が左から右／上から下へ ❌→patch 0119 で達成
4. **末端タブの目的が一目でわかる**: TabHeaderHint で「このタブで何ができるか」明示 ❌→patch 0120
5. **受注・出荷の入り口がある**: お客さまから来た注文をどこで処理するか明確 ❌→patch 0119 のカード 4
6. **エスケープハッチがある**: 上級者モードから既存 22 タブ全部に行ける ✅（patch 0118）

→ patch 0119 で項目 3・5 を解消、patch 0120 で項目 4 を解消すれば 6/6 達成。
