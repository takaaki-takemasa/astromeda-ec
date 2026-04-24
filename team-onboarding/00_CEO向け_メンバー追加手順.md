# CEO 向け メンバー追加手順 (Astromeda EC システム)

このドキュメントは **CEO (武正貴昭) が新メンバーをチームに追加するときの手順書** です。
所要時間: 1メンバーあたり 5分。

---

## 全体像

```
新メンバー → GitHub アカウント作成
         → claude.ai サブスク登録
         → CEO に GitHub ユーザー名を伝える
         → ★CEO が GitHub Collaborator として招待★ ← ここがCEOの作業
         → メンバーがメールで承諾
         → メンバーが Cowork で作業開始
```

---

## CEO がやること (1メンバーあたり 5分)

### Step 1: メンバーから GitHub ユーザー名をもらう

メンバーに以下を聞く:
- GitHub ユーザー名 (例: `tanaka-marketing`)
- メールアドレス (招待通知用)

GitHub 未登録の場合は `01_メンバー向け_セットアップ手順.md` を渡して登録してもらう。

### Step 2: GitHub Collaborator として招待

ブラウザで以下を開く:

```
https://github.com/takaaki-takemasa/astromeda-ec/settings/access
```

1. 緑色の「**Add people**」ボタンをクリック
2. メンバーの GitHub ユーザー名またはメールを入力
3. 権限選択: **Write** (push 可能・branch 削除不可) を推奨
   - `Admin` だと repo 設定変更も可能 → CEO 以外は Write で十分
4. 「Add [name] to this repository」をクリック

※ メンバーが repo を Clone すると、**Astromeda 専用 Cowork スキル** (`.claude/skills/astromeda-team/SKILL.md`) も自動的についてきます。メンバーは Cowork に「はじめまして、参加しました」と話しかけるだけで、スキルが自動的に onboarding を案内します。

→ メンバーにメール招待が届く。メンバーは 7日以内に承諾。

### Step 3: メンバーに Cowork セットアップ手順書を渡す

`01_メンバー向け_セットアップ手順.md` をメンバーに送る (メール/Slack/LINE 等)。

---

## 既存メンバー一覧の管理

GitHub Collaborators ページで一覧確認:
```
https://github.com/takaaki-takemasa/astromeda-ec/settings/access
```

メンバーを外すときは右側の「Remove」ボタン。

---

## 注意事項

### 全員が main ブランチに直接 push できる体制

CEO の判断により、メンバーは作業 → `git push origin main` で**即本番反映**します。
GitHub Actions が約 4-5 分後に Oxygen Production にデプロイ。

**メリット**: スピード最大化
**デメリット**: 1人のミスが即サイト反映

### 緊急時のロールバック (CEO 専用)

メンバーが間違った変更を push した場合、CEO がブラウザで以下:

```
https://github.com/takaaki-takemasa/astromeda-ec/commits/main
```

正常な commit を見つけて、以下のコマンドを Cowork で実行:

```bash
git revert <壊れたcommit-hash>
git push origin main
```

→ 4-5分後に元の状態に戻る。

### 危険操作のメンバー教育

メンバーには `02_危険操作リスト.md` を必ず読ませる。特に:
- `git push --force` 禁止
- `rm -rf` を AI に指示しない
- `.env` `*credentials*` ファイルを開かない

---

## 月額コスト (4-6人体制の見積もり)

| 項目 | 1人あたり | 4人 | 6人 |
|---|---|---|---|
| GitHub アカウント | ¥0 | ¥0 | ¥0 |
| claude.ai Pro (Cowork 利用) | ¥3,000 | ¥12,000 | ¥18,000 |
| **合計** | | **¥12,000/月** | **¥18,000/月** |

※ Pro でなく Max にすると ¥10,000/月相当 × 人数。Max は重い作業向け。
