# Admin UX 監査レポート — Stripe/Apple CEO 目線
## 2026-04-21 Cowork/Opus 4.7 実施

---

## 採点ルール（中学生基準 8 項目）

1. **3 秒ルール**: 画面を開いて 3 秒で「何の画面か」分かる
2. **動詞ラベル**: ボタンが「保存」ではなく「公開する」「戻す」等、動作名
3. **読まずに使える**: 説明文を読まずクリックだけで進む
4. **Undo**: 間違い操作が取り消せる
5. **保存の可視化**: 保存完了がアニメ／バッジで即伝わる
6. **数字優先**: 数字・アイコンが先、テキストは補足
7. **リアルタイム**: 変更がプレビューに即反映
8. **人間語のエラー**: 技術用語なしで「何がダメでどう直すか」

合格 = 8/8。6 未満は P0、6-7 は P1。

---

## タブ別判定

| タブ | 判定 | 主な問題 | 優先度 |
|---|---|---|---|
| 🚀 出品ガイド (onboarding) | **2/8** | 684 行の長文説明。Progressive disclosure でも本質は「読ませる」設計 | **P0** |
| 🗺️ サイトマップ (siteMap) | 6/8 | ビジュアル編集 CTA あり。現状悪くない | P1 |
| 📊 経営サマリー (summary) | 5/8 | KPI 多数。意味解説テキスト長め | P1 |
| 📄 記事・CMS (content) | 6/8 | CRUD フォーム OK。右ペインプレビューなし | P1 |
| 📦 商品管理 (products) | 7/8 | 商品作成 Wizard 済。画像編集は別画面遷移 | P1 |
| 📚 コレクション (collections) | 6/8 | 自動ルール編集が文字 UI | P1 |
| 🏷️ タグ一括編集 (bulkTags) | **8/8** | Undo あり、短文、即反映。合格 | — |
| 🔀 リダイレクト (redirects) | 6/8 | URL ピッカーあり | P1 |
| 📁 ファイル (files) | 6/8 | 一括削除あり | P1 |
| 🧬 CMS 定義 (metaobjectDefs) | 4/8 | 「Metaobject」「field type」等の技術語露出 | P0 |
| 🎟️ 割引コード (discounts) | 6/8 | 金額/%/送料の Zod 分岐は理解可能 | P1 |
| 🧭 メニュー (menus) | 5/8 | 階層 3 入れ子で迷子 | P1 |
| 🎨 カスタマイズ (customization) | **3/8** | choices_json 記法を手入力要求。中学生不可 | **P0** |
| 🏠 ホームページ (homepage) | 6/8 | 4 サブタブ、プレビューあり | P1 |
| ✏️ ページ編集 (pageEditor) | 6/8 | 15 サブタブで迷子。ビジュアル編集は良い | P1 |
| ⚙️ サイト設定 (siteConfig) | 6/8 | 6 サブタブ、各々 CRUD | P1 |
| 📣 マーケティング (marketing) | 5/8 | キャンペーン/カスタムオプション分離で関係性不明 | P1 |
| 📈 データ分析 (analytics) | 5/8 | 数字羅列、解釈が CEO 丸投げ | P1 |
| 🤖 AI 運用 (agents) | 4/8 | 「エージェント」「パイプライン」の語そのまま | P1 |
| ⚡ 自動化 (pipelines) | 4/8 | 中学生が触る想定外。ロック推奨 | P2 |
| 🚨 緊急対応 (control) | 6/8 | andon ボタンは明快 | P2 |
| 🔧 設定 (update) | 5/8 | メタ設定画面 | P2 |

---

## P0（即修正）

### 1. 🚀 出品ガイド → ビジュアルダッシュボード化
- 長文 6 ステップを畳み、admin ホームは数字カード + クイックアクション + 直近変更 + storefront iframe に置換
- 旧ガイドは「📘 詳しい順番を見る」折り畳みの中に退避
- **patch 0092 で実装**

### 2. 🎨 カスタマイズ choices_json 手入力 → ビジュアル行エディタ
- 「{\"value\":\"16GB\",\"label\":\"16GB (+¥0)\"}」の JSON 手打ちを廃止
- 代わりに選択肢を「値 / 表示名 / 追加金額」の 3 カラム行エディタで視覚編集
- 追加金額は数値 input、表記は裏で `+¥xx,xxx` 自動整形
- **patch 0092 で実装**

### 3. 🧬 CMS 定義 の用語置換
- 「Metaobject 定義」→「データ設計」
- 「field type」→「入力欄の種類」
- 「handle」→「URL 末尾」
- **patch 0092 で実装**

---

## P1（後続パッチ）

### 4. 各 CRUD タブに「右ペイン live preview」を統一追加
- content, collections, redirects, files, discounts, menus, homepage, siteConfig, marketing, analytics
- 既に homepage/pageEditor にはある → 他タブへも展開

### 5. ⚡ pipelines, 🚨 control に「CEO 専用」バッジ
- 中学生操作者が押すと壊れる系のタブを視覚的に分離

### 6. 数字だけでなく「意味」を添える
- analytics に「今日の注目ポイント」AI 要約カード 1 枚
- summary に「昨日比 ▲3 件 (要確認)」等の差分ラベル

---

## P2（Phase 2）

### 7. Onboarding tour モード
- 各タブで「この画面で何するか」コーチマーク（Shepherd.js 風）
- 動画 30 秒チュートリアル埋め込み

---

## 今回パッチ 0092 でやること（確定）

1. AdminOnboarding を Dashboard に書き換え
2. AdminCustomization の choices_json を行エディタに書き換え
3. AdminMetaobjectDefinitions の日本語用語置換
4. デプロイ後 Chrome MCP で admin 全 22 サブタブを踏破、全ボタン・全入力を手動検証

---
