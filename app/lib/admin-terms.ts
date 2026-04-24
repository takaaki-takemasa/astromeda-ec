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
 * | メタオブジェクト | 初期設定 / 登録データ | 「メタオブジェクト定義」→「初期設定」 |
 * | バリアント / Variant | 種類（色・サイズなど） | 「同じ商品の中の種類違い」 |
 * | GID | ID | 内部の一意識別子 |
 * | GraphQL (ユーザ向け文脈) | 非表示 | 技術用語のため UI に出さない |
 *
 * ## 用語統一ポリシー
 *
 * - 「コレクション」は Shopify 公式用語として残置・admin タブ名/見出しで一貫使用。
 *   patch 0151 (2026-04-24): admin サブタブ「ジャンル」を「コレクション」に統一。
 *   理由: 「商品ジャンル」(productType の 5 分類) との混同を排除。
 * - 「商品ジャンル」は productType (PC/ガジェット/グッズ/着せ替え/その他) を指す別概念。
 * - 「製品ジャンル」はコレクション内のサブ分類 (マウスパッド/キーボード等) を指す別概念。
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

  /** バリアント (Shopify 用語) — 色違い・サイズ違いなど「同じ商品の種類違い」 */
  variant: {
    label: '種類（色・サイズなど）',
    placeholder: '例: ホワイト / Lサイズ',
    hint: '同じ商品の中の「色違い」「サイズ違い」など、種類のことです。',
  } as AdminTerm,

  /**
   * patch 0109 (CEO P0): ベンダー (Shopify 用語) — 中学生にはピンとこない
   * 「ブランド名（メーカー）」に統一。ほぼ常に "Astromeda" のままで OK。
   */
  vendor: {
    label: 'ブランド名（メーカー）',
    placeholder: '例: Astromeda',
    hint: '通常は「Astromeda」のままで OK。商品ページに小さく表示されます。',
  } as AdminTerm,

  /**
   * patch 0109 (CEO P0): 商品タイプ (Shopify productType) → 「商品ジャンル」
   * 検索・並び替えに使われる大ざっぱな分類。datalist でよく使う候補を提示する。
   */
  productType: {
    label: '商品ジャンル',
    placeholder: '例: ゲーミングPC',
    hint: '商品の大ざっぱな分類です。入力欄をクリックすると候補が出ます。検索や並び替えに使われます。',
  } as AdminTerm,

  /**
   * patch 0109 (CEO P0): ステータス (ACTIVE/DRAFT/ARCHIVED) を「公開ステータス」に
   * 統一。生 ENUM ではなく「🟢 公開中 / 📝 下書き / 🗄️ アーカイブ」を表示。
   */
  productStatus: {
    label: '公開ステータス',
    placeholder: '',
    hint: '「下書き」で保存すれば、お客様には見えません。準備が整ったら「公開中」に変えましょう。',
  } as AdminTerm,

  /**
   * patch 0109 (CEO P0): プルダウン（カスタマイズ選択肢）の接続説明。
   * 中学生でも「どうやって自分の商品にプルダウンを付けるか」がわかるよう、
   * 自動判定ルールを明文化する。
   */
  customizationDropdown: {
    label: 'プルダウン（カスタマイズ選択肢）',
    placeholder: '',
    hint: 'プルダウンは商品名とタグから自動で判定されます。例: 「ゲーミングPC」を含む商品 → CPU/SSD などが自動表示。',
  } as AdminTerm,
} as const;

/**
 * 単語単位の置換辞書（短い文字列の機械的な置換に使う）。
 * UI に出てしまう技術用語を中学生向けの自然日本語に直す。
 */
export const ADMIN_WORD_REPLACEMENTS = {
  バリアント: '種類',
  Variant: '種類',
  variant: '種類',
  メタオブジェクト: '初期設定',
  Metaobject: '初期設定',
  ハンドル: 'URL 末尾',
  Handle: 'URL 末尾',
  GID: 'ID',
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
