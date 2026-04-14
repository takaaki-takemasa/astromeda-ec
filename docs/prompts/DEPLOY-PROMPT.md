# デプロイ指示

ファイル修復は全て完了済み。ビルドも成功済み。デプロイのみ実行すること。

## 手順

1. ビルド確認（すでに成功済みだが念のため）:
```powershell
npm run build
```

2. デプロイ実行:
```powershell
npx shopify hydrogen deploy --build-command "npm run build" --force --entry server
```

3. デプロイ後、表示されたプレビューURLを報告すること。

## 注意
- ファイルを一切編集しないこと。修復済みのファイルを壊さないこと。
- Writeツールは絶対に使わないこと。
- `node_modules`を再インストールしないこと（パッチが消える）。
