/**
 * GraphQL userErrors 日本語化 — Shopify Admin API が英語で返す userError を日本語に置換
 *
 * patch 0089 (2026-04-21) R2-P2-4:
 * Shopify GraphQL の userErrors[].message は常に英語 ("can't be blank" 等)。
 * これを admin UI にそのまま表示すると CEO が読めない。本モジュールは
 * パターン辞書で日本語メッセージに置換する。未マッチは原文のまま返す
 * （文字化けや情報欠落を防ぐフェイルセーフ）。
 *
 * 使い方:
 *   import {translateUserErrors} from '~/lib/graphql-error-i18n';
 *   if (userErrors.length > 0) {
 *     throw new Error(`商品作成失敗: ${translateUserErrors(userErrors)}`);
 *   }
 *
 * 対応範囲:
 * - 汎用: can't be blank / is invalid / has already been taken / is too long / is too short
 * - Shopify 固有: Handle 重複 / 商品バリアント SKU 重複 / 画像未アップロード
 * - 数値系: must be greater than X / must be less than or equal to X
 */

export interface UserError {
  field?: string[] | null;
  message: string;
}

/**
 * フィールド名英語 → 日本語
 * Shopify userError の field は配列 ['input', 'title'] 形式なので末尾を採用
 */
const FIELD_JA: Record<string, string> = {
  title: 'タイトル',
  handle: 'ハンドル (URL末尾)',
  description: '説明',
  descriptionHtml: '説明',
  body_html: '本文',
  bodyHtml: '本文',
  price: '価格',
  compareAtPrice: '比較価格',
  sku: 'SKU',
  barcode: 'バーコード',
  inventory: '在庫',
  inventoryQuantity: '在庫数',
  tags: 'タグ',
  vendor: '販売元',
  productType: '商品種別',
  status: 'ステータス',
  imageSrc: '画像URL',
  alt: '代替テキスト',
  metafields: 'メタフィールド',
  fields: 'フィールド',
  redirect: 'リダイレクト',
  path: 'パス',
  target: '転送先',
  value: '値',
  key: 'キー',
  namespace: 'ネームスペース',
  type: '種別',
  email: 'メールアドレス',
  phone: '電話番号',
  firstName: '名',
  lastName: '姓',
  displayName: '表示名',
  code: 'コード',
  startsAt: '開始日時',
  endsAt: '終了日時',
  customerSelection: '対象顧客',
  percentage: '割引率',
  amount: '金額',
};

function localizeField(field: string[] | null | undefined): string | null {
  if (!field || field.length === 0) return null;
  // Shopify は ['input', 'title'] のように先頭に 'input' が付くことが多い
  const tail = field[field.length - 1];
  return FIELD_JA[tail] ?? tail;
}

/**
 * 英語メッセージ パターン → 日本語変換 (パターン辞書)
 * 配列の順序は長いパターン優先 (specific → generic)
 */
type Translator = (m: string, field: string | null) => string | null;
const PATTERNS: Array<[RegExp, Translator]> = [
  // ── Shopify 固有 ──────────────────────────────────
  [/^Handle has already been taken$/i, () => 'ハンドル (URL末尾) は既に使用されています。別の文字列を指定してください'],
  [/^Handle is invalid$/i, () => 'ハンドル (URL末尾) の形式が不正です。半角英数字とハイフンのみ使用できます'],
  [/^Path has already been taken$/i, () => '同じパスのリダイレクトが既に存在します'],
  [/^Target can't be the same as path$/i, () => '転送先はリダイレクト元と同じにできません'],
  [/^Sku has already been taken$/i, () => 'SKU は既に使用されています'],
  [/^Title has already been taken$/i, () => 'タイトルは既に使用されています'],
  [/^Code has already been taken$/i, () => '割引コードは既に使用されています'],
  [/^Email has already been taken$/i, () => 'メールアドレスは既に登録されています'],
  [/^Metafield value is invalid$/i, () => 'メタフィールドの値が不正です'],
  [/^Not Found$/i, () => 'データが見つかりません'],

  // ── 汎用 Rails/ActiveRecord スタイル ──────────────
  [/^can'?t be blank$/i, (_, f) => `${f ?? '入力値'} を入力してください`],
  [/^is invalid$/i, (_, f) => `${f ?? '入力値'} の形式が不正です`],
  [/^has already been taken$/i, (_, f) => `${f ?? '入力値'} は既に使用されています`],
  [/^is too long \(maximum is (\d+) characters?\)$/i, (_, f, ...rest) => {
    const n = (rest as unknown as RegExpMatchArray)[0];
    return `${f ?? '入力値'} は ${n} 文字以内で入力してください`;
  }],
  [/^is too short \(minimum is (\d+) characters?\)$/i, (_, f, ...rest) => {
    const n = (rest as unknown as RegExpMatchArray)[0];
    return `${f ?? '入力値'} は ${n} 文字以上で入力してください`;
  }],

  // ── 数値バリデーション ────────────────────────────
  [/^must be greater than (-?\d+(?:\.\d+)?)$/i, (m, f) => {
    const n = m.match(/-?\d+(?:\.\d+)?/)![0];
    return `${f ?? '値'} は ${n} より大きい値を指定してください`;
  }],
  [/^must be greater than or equal to (-?\d+(?:\.\d+)?)$/i, (m, f) => {
    const n = m.match(/-?\d+(?:\.\d+)?/)![0];
    return `${f ?? '値'} は ${n} 以上の値を指定してください`;
  }],
  [/^must be less than (-?\d+(?:\.\d+)?)$/i, (m, f) => {
    const n = m.match(/-?\d+(?:\.\d+)?/)![0];
    return `${f ?? '値'} は ${n} より小さい値を指定してください`;
  }],
  [/^must be less than or equal to (-?\d+(?:\.\d+)?)$/i, (m, f) => {
    const n = m.match(/-?\d+(?:\.\d+)?/)![0];
    return `${f ?? '値'} は ${n} 以下の値を指定してください`;
  }],
  [/^is not a number$/i, (_, f) => `${f ?? '値'} は数値で入力してください`],

  // ── 認可・権限 ────────────────────────────────────
  [/^access denied$/i, () => 'アクセス権限がありません'],
  [/^unauthorized$/i, () => '認証が必要です'],
  [/^throttled$/i, () => 'リクエスト回数の上限に達しました。しばらくお待ちください'],

  // ── 画像 / メディア ───────────────────────────────
  [/^Source could not be downloaded$/i, () => '画像URLからダウンロードできませんでした'],
  [/^Media is invalid$/i, () => '画像ファイルが不正です (形式・サイズをご確認ください)'],
  [/^must have exactly (\d+) media objects?$/i, (m) => {
    const n = m.match(/\d+/)![0];
    return `メディアは ${n} 件である必要があります`;
  }],
];

/**
 * 単一 userError.message を日本語化
 * field が与えられれば「タイトル を入力してください」のように接頭辞を組み立てる
 * マッチしなければ原文を返す (フェイルセーフ)
 */
export function translateUserErrorMessage(
  message: string,
  fieldPath?: string[] | null,
): string {
  const field = localizeField(fieldPath);
  for (const [pat, fn] of PATTERNS) {
    if (pat.test(message)) {
      const translated = fn(message, field);
      if (translated) return translated;
    }
  }
  // フェイルセーフ: 原文返却。field があれば接頭辞を追加
  if (field) return `${field}: ${message}`;
  return message;
}

/**
 * userErrors 配列を日本語文字列にまとめる
 * 各メッセージを「、」で連結。重複は除去。
 */
export function translateUserErrors(
  userErrors: UserError[] | null | undefined,
): string {
  if (!userErrors || userErrors.length === 0) return '';
  const seen = new Set<string>();
  const out: string[] = [];
  for (const err of userErrors) {
    const ja = translateUserErrorMessage(err.message, err.field);
    if (!seen.has(ja)) {
      seen.add(ja);
      out.push(ja);
    }
  }
  return out.join('、');
}
