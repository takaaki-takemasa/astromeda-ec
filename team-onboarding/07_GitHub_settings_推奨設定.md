# GitHub settings 推奨設定ガイド (CEO 作業・5 分)

このドキュメントは CEO が GitHub の admin 画面で **一度だけ** やる推奨設定です。
メンバーを招待する前に済ませると、事故を未然に防げます。

---

## 1. main ブランチを保護する (必須・3 分)

メンバーが誤って main を force push / 削除するのを防ぎます。

### 手順

1. ブラウザで `https://github.com/takaaki-takemasa/astromeda-ec/settings/branches` を開く
2. 「Add branch protection rule」(or「Add rule」) をクリック
3. **Branch name pattern**: `main`
4. 以下を **全てチェック**:
   - [x] Require a pull request before merging ※ オプション (今は直 push 運用なので OFF でも OK)
   - [x] **Do not allow bypassing the above settings** ※ オーナーでも protection をバイパスしない
   - [x] **Allow force pushes** → **無効** (force push 禁止)
   - [x] **Allow deletions** → **無効** (main 削除禁止)
5. 「Create」または「Save changes」

→ これで「壊れた」時の rollback は `git revert` で履歴を残す形になります。force push で履歴が消えることはありません。

---

## 2. 全メンバーに 2FA を強制する (推奨・2 分)

パスワードだけでなく 2 段階認証を必須にすると、PAT が漏れてもアカウント乗っ取りを防げます。

### 手順 (Organization がある場合)

Astromeda の repo が Organization 配下の場合:

1. `https://github.com/organizations/<org-name>/settings/security`
2. 「Require two-factor authentication」→ **Enable**

### 手順 (個人 repo の場合)

Organization ではなく個人 repo `takaaki-takemasa/astromeda-ec` なので、repo 単位の 2FA 強制はできません。
代わりに **メンバー招待時に手順書で 2FA 設定を必須にする** 運用でカバー:

メンバー招待メール文に以下を追加:
```
**2FA 設定を必須にします**:
招待を受ける前に、GitHub の 2 段階認証を有効にしてください。
  Settings → Password and authentication → Two-factor authentication → Enable

有効でない場合、秘密情報漏洩リスクのため repo 参加を取り消します。
```

---

## 3. Dependabot security alerts を有効化 (推奨・30 秒)

npm パッケージの脆弱性が見つかった時に自動で PR が作成されます。

### 手順

1. `https://github.com/takaaki-takemasa/astromeda-ec/settings/security_analysis`
2. 「Dependabot alerts」→ **Enable**
3. 「Dependabot security updates」→ **Enable**

既に有効かもしれないのでその場合は何もせず OK。

---

## 4. Secret scanning を有効化 (推奨・30 秒)

コードに API token や password が誤って push されると警告が出ます。

### 手順

1. 同じ security_analysis ページ
2. 「Secret scanning」→ **Enable**
3. 「Push protection」→ **Enable**

既に patch 0102 で SHOPIFY_ADMIN_ACCESS_TOKEN 等のスキャンはコード側で通しているので、これは GitHub 側の二重チェックです。

---

## 5. メンバー除外のときの手順 (運用ルール・メモ)

退職者が出たとき、**48 時間以内に** 以下を実行:

1. `https://github.com/takaaki-takemasa/astromeda-ec/settings/access`
   退職者を find → Remove
2. Cowork の管理画面 → 👥 メンバー → 該当ユーザーを「無効化」or「削除」
3. Shopify admin パスワード (環境変数 `ADMIN_PASSWORD`) を変更
   → `admin.shopify.com/store/production-mining-base/hydrogen/1000122846/settings/environments`
   → Environment variables → ADMIN_PASSWORD を編集
4. 残メンバーに新パスワードを 1Password/LINE 個別チャットで再配布

patch 0156 で multi-user 化されているので **admin パスワード変更だけで退職者は締め出せます** (全員再配布は不要)。

---

## 完了チェックリスト

- [ ] main ブランチに branch protection rule を設定した
- [ ] 全メンバー招待時に 2FA 必須を明示している
- [ ] Dependabot alerts / security updates を Enable にした
- [ ] Secret scanning + Push protection を Enable にした
- [ ] 退職時の手順を理解した

すべて ✅ なら準備完了です。
