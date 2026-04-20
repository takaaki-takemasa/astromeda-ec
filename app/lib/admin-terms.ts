/**
 * admin-terms.ts
 *
 * patch 0085 (R1-P1-3) — 技術用語 → 自然日本語の辞書統一
 *
 * 管理画面のラベル/ヒント/エンプティ状態文言で使用される Shopify/開発者寄りの
 * 技術用語を、中学生が視覚的に理解できる自然日本語に置換するための正本辞書。
 *
 * Stripe/Apple 水準 admin UX を達成するには、バックエンドスキーマ用語の生出し
 * （「ハンドル」「スラッグ」「Metaobject」等）を UI から追い出す必要がある。
 *
 * 本ファイルは：
 *   1) 「何をどの日本語に統一すべきか」の合意文書
 *   2) 新規追加コードが辞書を参照するための helper 輸出
 * として機能する。既存コードは文字列リテラル直書きのままでも OK（段階移行）。
 *
 * ## 用語対応表
 *
 * | 技術用語（旧） | 自然日本語（新） | ヒント文の例 |
 * |---|---|---|
 * | ハンドル | URL 末尾 | URL の最後の部分です（英数字のみ） |
 * | スラッグ | URL 末尾（英数字） | URL や画像ファイル名に使う英単語（例: white） |
 * | Shopifyハンドル | Shopify URL 末尾 | Shopify コレクションの URL の末尾 |
 * | コレクションハンドル | 商品グループ URL | このカテゴリ／IP に紐づく Shopify コレクションの URL 末尾 |
 * | 商品ハンドル | 商品 URL 末尾 | 個別商品の URL の末尾 |
 * | Metaobject | カスタム項目 / 登録データ | （エンプティ状態で使う） |
 * | GID | ID | 内部の一意識別子 |
 * | GraphQL (ユーザ向け文脈) | 非表示 | 技術用語のため UI に出さない |
 *
 * ## 用語統一ポリシー
 *
 * - 「コレクション」は Shopify 公式用語として残置するが、フォームラベルでは
 *   「商品グループ」または「カテゴリ」に置き換える。
 * - 「ID」は UI にそのまま残す（中学生でも理解可能な普及語）。
 * - ACTIVE / DRAFT / ARCHIVED の日本語化は patch 0082 で完了済み
 *   （productStatusLabel / productStatusColor in admin-utils.ts）。
 *
 * ## 使い方
 *
 * ```tsx
 * import { ADMIN_TERMS } from '~/lib/admin-terms';
 *
 * <label>{ADMIN_TERMS.shopifyHandle.label} <RequiredMark /></label>
 * <input placeholder={ADMIN_TERMS.shopifyHandle.placeholder} />
 * <HintText>{ADMIN_TERMS.shopifyHandle.hint}</HintText>
 * ```
 */

export interface AdminTerm {
  /** ラベル表示 */
  label: string;
  /** 入力欄 placeholder（例示） */
  placeholder?: string;
  /** ヒント文（中学生向け自然日本語） */
  hint: string;
}

export const ADMIN_TERMS = {
  /** Shopify ハンドル（コレクション）。`jujutsukaisen-collaboration` の様な URL 末尾 */
  shopifyHandle: {
    label: 'Shopify URL 末尾',
    placeholder: 'jujutsukaisen-collaboration',
    hint: 'Shopify コレクションの URL の末尾です（例: jujutsukaisen-collaboration）。',
  } as AdminTerm,

  /** コレクションハンドル。フォールバック画像取得などに使うコレクション ID */
  collectionHandle: {
    label: '商品グループ URL',
    placeholder: 'jujutsukaisen-collaboration',
    hint: '画像が空のとき、このコレクションの画像を代わりに使います（Shopify コレクション URL の末尾）。',
  } as AdminTerm,

  /** 商品ハンドル。`shop/products/xxx` の末尾 */
  productHandle: {
    label: '商品 URL 末尾',
    placeholder: 'bleach-panel-ichigo',
    hint: '個別商品ページの URL の末尾です。空のままなら全商品が対象になります。',
  } as AdminTerm,

  /** URL スラッグ（英数字）— ページ・カラー・記事などの識別子 */
  slug: {
    label: 'URL 末尾（英数字）',
    placeholder: 'white',
    hint: 'URL や画像ファイル名に使う英単語です（例: white）。半角小文字のみ。',
  } as AdminTerm,

  /** HEX カラーコード */
  hexColor: {
    label: 'HEX カラー',
    placeholder: '#ffffff',
    hint: 'カラーコードです（例: #ffffff は真っ白）。左の □ を押すと色を選べます。',
  } as AdminTerm,
} as const;

/**
 * 空状態メッセージの正本辞書。
 * 「Metaobject は空です」のような開発者用語を「登録データがありません」に統一する。
 */
export const ADMIN_EMPTY_MESSAGES = {
  /** まだレコードが 1 件もない状態 */
  noRecords: 'まだ登録データがありません',
  /** まだデータが無く、フロントは既定値で動いている */
  noRecordsWithFallback: 'まだ登録データがありません — ページは既定値で表示中',
  /** まだデータが無く、ハードコード値で動いている */
  noRecordsHardcoded: 'まだ登録データがありません — ページはコード内の初期値を表示中',
} as const;
