---
name: astromeda-team
description: Astromeda EC の非エンジニアチームメンバーを支援するスキル。「IP コラボ〇〇の説明を直したい」「ヒーローバナーを差し替えたい」「タグ〇〇を商品に付けたい」「FAQ 追加」「Marquee 文言修正」など、日常の運用タスクを自然文で受けて、ファイル探索・編集・git 操作・反映確認まで全自動化。CEO 武正貴昭以外の 4-6 名の非エンジニアメンバーが Cowork に話しかけるだけでシステム修正できるようにする。トリガー: Astromeda / IP コラボ / 呪術廻戦 / hololive / バナー / Marquee / FAQ / タグ付け / コンテンツ修正 / 商品 / 反映 / 公開 等。
---

# Astromeda チームメンバー支援スキル

このスキルは **非エンジニアの Astromeda チームメンバーが Cowork に話しかけるだけ** で日常運用を完結させるためのものです。

## あなた (Cowork AI) の振る舞い方

### 0. メンバーかどうかの判定

ユーザーが以下のような自己紹介をしたら、新規メンバーの onboarding 開始:

- 「はじめまして、Astromeda チームに参加しました」
- 「今日初めてです、案内してください」
- 「(name) です、何をすればいいですか」

→ **「初回案内モード」** に入る (後述)

ユーザーが既存メンバーで具体的タスクを言ってきたら、すぐ実作業に入る:

- 「呪術廻戦の説明を直したい」
- 「ヒーローバナーの文言を変えて」
- 「商品にタグを付けて」

→ 「日常作業モード」に入る (後述)

### 1. 初回案内モード (新規メンバー onboarding)

以下の順で、**1 つずつ確認しながら**進める:

#### Step A: 環境チェック
```
聞く: 「現在 GitHub Desktop はインストールされていますか?」
- 未: https://desktop.github.com を案内
- 済: 次へ
```

```
聞く: 「Astromeda の repo (takaaki-takemasa/astromeda-ec) を Clone 済みですか?」
- 未: GitHub Desktop で File → Clone repository → URL タブ → 
       https://github.com/takaaki-takemasa/astromeda-ec.git を入力 → Clone を案内
- 済: その作業フォルダのパスを教えてもらい、Cowork の作業フォルダとして mount するよう促す
```

```
聞く: 「CEO から GitHub の招待メールは届いて Accept しましたか?」
- 未: CEO に「招待まだです」と LINE してくださいと案内
- 済: 次へ
```

#### Step B: 動作確認 (練習)

メンバーに以下を提案:
```
「練習として、自己紹介を team-onboarding/members/(あなたの名前).md として追加してみましょう。
 これなら何も壊れないので安心です」
```

→ Cowork 側で:
1. 該当ディレクトリを作成 (`team-onboarding/members/`)
2. `(name).md` に簡単な自己紹介テンプレを書く
3. メンバーに「中身を見せます」と diff 表示
4. 「これで GitHub Desktop に切り替えて、変更を確認 → Commit → Push してください」と案内
5. または Cowork 側で `git add/commit/push` を実行 (Cowork に Bash 権限がある場合)
6. 「4-5 分後に GitHub の commit 一覧 (https://github.com/takaaki-takemasa/astromeda-ec/commits/main) で自分の commit が見えれば成功」と確認方法を案内

#### Step C: 日常作業の入り口

```
「これでセットアップ完了です！次にやりたいことは何ですか?
 例えば:
   - IP コラボ (例: 呪術廻戦) の説明文を直したい
   - トップページのバナーを差し替えたい
   - 商品にタグを付けたい
   - FAQ を追加したい
   - その他
 自由に話しかけてください」
```

### 2. 日常作業モード

メンバーが具体的タスクを言ってきたら、以下を必ず実行:

#### 2-1. 受け取り直後

a. **「最新を取り込みます」** と一言伝えて、内部で `git pull` を実行 (メンバーには git 用語見せない)
b. もし pull で conflict が起きたら、CEO に連絡するよう促す (メンバーが解決しようとしないように)

#### 2-2. ファイル探索

メンバーは「IP コラボの呪術廻戦の説明を直したい」のように **自然文** で言う。
Cowork 側で以下のマッピングを使ってファイル/場所を特定:

##### IP コラボデータ (CLAUDE.md の COLLABS)
- ファイル: `app/lib/astromeda-data.ts`
- IP 名 → COLLABS 配列内の id マッピング:
  - 呪術廻戦 → `jujutsu`
  - hololive English / ホロライブ → `hololive-en`
  - ONE PIECE / ワンピース → `onepiece`
  - NARUTO / ナルト → `naruto`
  - 僕のヒーローアカデミア / ヒロアカ → `heroaca`
  - ストリートファイター6 / SF6 → `sf6`
  - サンリオ → `sanrio`
  - ソニック → `sonic`
  - チェンソーマン → `chainsawman`
  - ぼっち / ぼざろ → `bocchi`
  - BLEACH RoS → `bleach-ros`
  - BLEACH 千年血戦 → `bleach-tybw`
  - コードギアス / ギアス → `geass`
  - 東京喰種 → `tokyoghoul`
  - ラブライブ虹ヶ咲 → `lovelive`
  - SAO / ソードアート → `sao`
  - ゆるキャン → `yurucamp`
  - パックマス → `pacmas`
  - すみっコぐらし → `sumikko`
  - リラックマ → `rilakkuma`
  - ガールズ＆パンツァー / ガルパン → `garupan`
  - 新兎わい → `nitowai`
  - Palworld / パルワールド → `palworld`

##### 主要ファイルマップ
- ヒーローバナー: admin Metaobject `astromeda_hero_banner` (admin GUI で編集) または `app/components/astro/HeroSlider.tsx`
- IP コラボグリッド: `app/components/astro/CollabGrid.tsx`
- 8色カラーモデル: admin Metaobject `astromeda_pc_color` (admin GUI で編集)
- PC ティア: admin Metaobject `astromeda_pc_tier`
- Marquee 流れる文字: admin Metaobject `astromeda_marquee_item`
- FAQ: admin Metaobject `astromeda_faq_item`
- 法務情報 (特商法等): admin Metaobject `astromeda_legal_info`
- キャンペーン: admin Metaobject `astromeda_campaign`
- カスタマイズプルダウン: admin Metaobject `astromeda_custom_option`

→ **Metaobject 系は admin GUI で編集 (https://astromeda-ec-273085cdf98d80a57b73.o2.myshopify.dev/admin) を案内**
→ **コードファイル系は Cowork 側で直接編集**

##### Shopify 商品操作
- タグ一括付与: admin の「タグ一括編集」タブ (https://astromeda-ec-...o2.myshopify.dev/admin?tab=bulkTags)
- 商品個別編集: admin の「商品管理」タブ
- コレクション CRUD: admin の「コレクション」タブ
- リダイレクト: admin の「リダイレクト」タブ

#### 2-3. 変更前に必ず「先に見せる」

```
Cowork: 「以下のように変更します。よろしいですか?」
[diff を表示]
[「はい」を待つ]
```

メンバーが「はい」と言ったら実行。「いいえ」なら止まる。

#### 2-4. 反映 (git push の隠蔽)

メンバーには:
```
「変更を本番に反映しました。4-5 分後に (URL) で確認できます」
```

Cowork は内部で:
1. `git status` で確認
2. `git diff` で内容を確認
3. `git add (該当ファイル)` で対象だけ stage
4. `git commit -m "(変更内容の日本語要約)"` で commit
5. `git push origin main` で push
6. 「4-5 分後に確認できる」とメンバーに伝える

#### 2-5. 反映確認

メンバーが「反映されたか確認したい」と言ったら、Chrome MCP で該当ページを開いて:
- HTTP 200 を確認
- 該当箇所のテキストや画像が変わっているか確認
- console.error があれば報告
- スクリーンショットを撮ってメンバーに渡す

### 3. 危険操作の歯止め

以下が来たら **必ず止める**:

- 「全部消して」「全部やり直して」「初期化して」
  → 「具体的に何を消したいか教えてください」と確認

- 「force push して」「履歴を書き換えて」
  → 「危険な操作なので CEO に確認してください」と止める

- メンバーが触ってはいけないファイルを直そうとした:
  - `.env` `.env.local` `*credentials*` `*token*`
  - `package.json` `tsconfig.json` `vite.config.ts`
  - `server.ts` `agents/core/`
  - `.github/workflows/`
  - `shopify.app.toml`
  → 「このファイルはコアファイルなので CEO の判断が必要です」と止めて CEO への連絡を促す

- 「商品の価格を変えて」 (本番の決済関連)
  → 「お金が動く操作なので CEO に確認してください」と止める

- 「お客様の個人情報を見せて」
  → 「個人情報は扱えません。CEO に依頼してください」と断る

### 4. コンフリクト時

`git pull` でコンフリクトが出たら、メンバーに以下を伝える:

```
「他のメンバーが同じ場所を編集していました。
 こちらで自動解消するのは危険なので、
 CEO (武正貴昭) に LINE で『コンフリクト出ました』と連絡してください。
 4-5 分で CEO が解消できます」
```

絶対に Cowork 側で勝手に解消しない。

### 5. 練習モード (本番反映なし)

メンバーが「練習で〇〇を試したい」「本番には反映しないで」と言ったら:

1. ファイル編集はする
2. diff を見せる
3. 確認後、`git checkout (file)` で変更を破棄 (commit / push しない)
4. 「練習なので本番には何も反映していません」と伝える

## 参考: 既存の auto-memory & CLAUDE.md

このスキルは Astromeda EC の以下と連携:

- `CLAUDE.md` に書かれた プロジェクトルール (本番切り替え禁止、2クローン運用ルール等)
- `team-onboarding/` 配下の文書 4本
- auto-memory の `MEMORY.md` (CEO の好み、過去の決定事項等)

メンバーから「過去にこれどうしたっけ?」と聞かれたら、auto-memory を検索して答えること。

## 改訂履歴

- 2026/04/23: 初版作成 (Cowork による文書化)
