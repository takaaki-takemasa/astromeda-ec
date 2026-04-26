# 07. GitHub 倉庫の安全設定 (CEO・5 分・1 度だけ)

このシステムの設計図は **GitHub** という倉庫に入っています。
メンバーを招待する **前に** CEO がこの倉庫に「事故防止の鍵」を 5 分だけ取り付けます。

---

## なぜこの設定が必要か

**例え話**:
- 倉庫 = 銀行の金庫
- 設計図 = 中の現金
- メンバー = 金庫を開ける鍵を持つ社員
- この設定 = 「金庫を爆破して中身を消すボタン」を社員から取り上げる

社員は普通に出し入れ (= 通常の編集) はできますが、**過去の履歴を消したり倉庫を破壊することはできなくなります**。
事故を起こしても CEO が「直前に戻して」と Cowork に頼めば数分で復旧します。

---

## やる前のチェック

- [ ] CEO は GitHub にログイン済 (https://github.com)
- [ ] CEO のアカウントは `takaaki-takemasa`
- [ ] 倉庫 `astromeda-ec` の所有者になっている (URL: https://github.com/takaaki-takemasa/astromeda-ec)

これらが OK なら下に進んでください。

---

## 設定 1: 倉庫の履歴を「消せない」設定にする (3 分・必須)

これが一番大事な設定です。

### 手順 (画面の通りに)

1. ブラウザで開く: https://github.com/takaaki-takemasa/astromeda-ec/settings/branches
2. 「**Add branch ruleset**」または「**Add classic branch protection rule**」(緑のボタン)
3. 出てきたフォームで:
   - 一番上の入力欄 (Branch name pattern) に `main` と打つ
   - 下の方のチェック項目で **以下を全てチェック ✓** :
     - `Require a pull request before merging` → これは **チェックしなくて OK** (今は直 push 運用なので)
     - `Restrict deletions` → ✓ チェック (倉庫の枝が消されないように)
     - `Block force pushes` → ✓ チェック (履歴を消す操作を禁止)
   - 「**Do not allow bypassing the above settings**」 → ✓ チェック (オーナーでも上記を抜け道できないように)
4. 一番下の「**Create**」または「**Save changes**」(緑のボタン)

### この設定の効果

- 「履歴を消す操作」がメンバー・CEO 両方に対して禁止される
- 倉庫の `main` 枝そのものを削除する操作も禁止される
- Cowork は通常の作業 (新しい変更を追加する) は今まで通りできる

### 確認
ページに戻って、`main` というルールが表示されていれば OK です。

---

## 設定 2: 不正パッケージの自動警告を ON (1 分・推奨)

### 手順

1. ブラウザで開く: https://github.com/takaaki-takemasa/astromeda-ec/settings/security_analysis
2. 以下 3 つの項目それぞれの右の「**Enable**」ボタンを押す:
   - **Dependabot alerts** (古いパッケージを警告)
   - **Dependabot security updates** (古いパッケージを自動アップデート提案)
   - **Secret scanning** (パスワードなどを誤って公開してないか自動チェック)

すでに「Enabled」と書いてあれば押す必要はありません。

### この設定の効果

- 倉庫の中で使っているパッケージに脆弱性が見つかると、自動で警告が CEO 宛に来る
- 誰かがパスワード等を誤って push してしまった場合、自動で CEO 宛に警告が来る
- どちらも CEO は警告を見るだけ。対応は Cowork に「直して」と頼めば OK

---

## 設定 3: メンバーに 2 段階認証を必須にする (1 分・推奨)

これは GitHub の管理画面側ではなく、**メンバーへの招待メール** に書きます (今すぐの設定はなし)。

### CEO が将来メンバーを招待する時の文面 (テンプレート)

```
こんにちは [メンバー名] さん、

Astromeda EC システムの GitHub 倉庫に招待しました。
招待を受ける前に、必ず以下を済ませてください:

1. GitHub にログイン → 右上アイコン → Settings → Password and authentication
2. Two-factor authentication → Enable
3. スマホの認証アプリで設定完了

完了したらこの LINE で「2FA OK」と返信してください。
返信を見てから倉庫の招待を承認します。

(2FA を ON にしないと、メンバーのアカウントが乗っ取られた時に
倉庫が壊される可能性があるためです)
```

---

## 完了チェックリスト

設定を全て終えたらここにチェックを入れてください:

- [ ] 設定 1: `main` の branch ruleset を作成 (Block force pushes + Restrict deletions + Do not allow bypassing)
- [ ] 設定 2: Dependabot alerts ✓
- [ ] 設定 2: Dependabot security updates ✓
- [ ] 設定 2: Secret scanning ✓
- [ ] 設定 3: メンバー招待テンプレートを LINE 等に保存

5/5 ✓ なら倉庫は事故防止された状態です。

---

## 退職メンバーが出たら (運用ルール)

退職者が出たら **48 時間以内に** 以下を実行:

1. **GitHub からメンバーを外す**
   - https://github.com/takaaki-takemasa/astromeda-ec/settings/access
   - 退職者の名前を見つける → 「Remove」 (赤いボタン)

2. **管理画面でユーザーを無効化**
   - 管理画面 → 上級者設定 → 👥 メンバー
   - 退職者の行 → 「無効化」ボタン
   - これだけで以後そのユーザーはログイン不可

3. **Shopify 管理画面のパスワード変更は基本不要**
   - patch 0156 で個別ユーザーになったので、退職者のパスワードを変えるだけで OK
   - 全員にパスワード再配布は不要

---

## 「これって難しそう」と感じたら

設定 1 だけでも今すぐやってください。これが最も重要です。
設定 2・3 は後でも OK です。

または、Cowork に「07 文書の設定 1 を一緒にやって」とお願いすれば、画面共有方式で 1 ステップずつ伴走します。

---

## ここでよくある質問

### Q: 設定したら今までの作業に影響あるか?
A: 普通の編集・push・デプロイには **何の影響もありません**。「履歴消す」「倉庫消す」という操作だけが封じられます。

### Q: 設定を後で変えたい
A: いつでも可能。同じ Settings → Branches ページで Edit / Delete できます。

### Q: 緑のボタンを押したのに保存されない
A: ページを再読み込み (F5) してから設定をやり直し。ブラウザのキャッシュが原因のことが多いです。

### Q: 「Bypass list」という欄が出る
A: 空欄のままにしてください。この欄に名前を入れると、その人だけ抜け道できる設定です (= 危険)。

---

## 連絡

- **設定で詰まった**: Cowork に「07 の設定 [番号] が分かりません」
- **設定が完了した**: 何もしなくて OK (システムが自動で守ります)
