# Astromeda EC — 手術チェックポイント
# このファイルを読めば、中断した箇所から正確に再開できます

## 最終更新: 2026-04-05T20:00
## 全体ステータス: Phase 11 ✅完了 → Phase M（Dropbox移行）準備完了

---

## Phase M: Dropbox→ローカル移行（次の作業）

### 問題の根本原因
- プロジェクトパス `PC (2)` の括弧がShopify CLIのglob処理を壊す
- Dropbox同期がvite.config.tsなどのファイルを書き込み中に破損させる
- node_modulesへのパッチが`npm install`で消える

### 移行先
- 旧: `C:\Users\Mining-Base\mngb Dropbox\武正貴昭\PC (2)\Desktop\astromeda-ec`
- 新: `C:\Projects\astromeda-ec`

### 修正必要ファイル（3ファイル4箇所のみ）
- [x] ガントチャートv18作成済み（20タスクの詳細移行計画）
- [x] 移行バッチスクリプト作成済み（`Dropbox移行スクリプト.bat`）
- [ ] `Astromeda起動.bat` L16: cd /dのパス変更
- [ ] `CLAUDE.md` L16, L101: プロジェクトパスとcdコマンド変更
- [ ] `PROGRESS.md` L73: cdコマンド変更

### 移行手順（`Dropbox移行スクリプト.bat`で自動化済み）
1. git commit（変更保全）
2. .envバックアップ
3. robocopyで全ファイルコピー（node_modules除外）
4. 3ファイルのパス書き換え
5. npm ci
6. shopify hydrogen link
7. npm run build
8. Worker file存在確認
9. ステージングデプロイ
10. 全ページ表示確認

---

## Phase 11: P0修正 — ✅全完了

### Phase 11-A: 神経系（AgentBus）✅
- 優先度ソート + ターゲットフィルタ実装
- 6/6テスト合格

### Phase 11-B: 免疫系（XSS/Pipeline/vite.config）✅
- sanitize-html.ts新規作成
- PipelineEngine初期化追加
- vite.config.ts Dropbox破損から復旧

### Phase 11-C: 循環系（localStorage永続化）✅
- WishlistProvider + RecentlyViewedProvider
- 画像・価格・タイトル付き閲覧履歴

### Phase 11-D: 感覚系（API/GA4/OGP）✅
- CartUpsell → Shopify productRecommendations API
- GA4 + Clarity 環境変数化
- og:image + twitter:image 動的生成

### Phase 11-E: 皮膚系（モバイルUI）✅
- セール価格flex-wrap
- MobileStickyCartBar追加

---

## v18ガントチャート統計
- 全タスク: 178（v17の158 + 移行20）
- 完了: 92/178 = 52%（v17の70→92: Phase 11完了分22タスク反映）
- 残り: 86タスク（移行20 + EC残46 + Phase2 AI 20）
