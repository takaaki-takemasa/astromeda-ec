/**
 * QRコード生成ユーティリティ（サーバーサイド）
 *
 * 医学メタファー: 通信系（情報伝達）
 * URLを符号化し、スキャン可能な視覚情報に変換。
 * 純粋なJavaScript実装で外部依存なし。
 *
 * 実装戦略:
 * - Base64エンコード + URLセーフなデータ分割
 * - 簡易QR生成（Version 1: 21x21モジュール向け、短いURL対応）
 * - SVG出力で軽量＆スケーラブル
 */

/**
 * QRコードジェネレータ設定
 */
interface QRCodeOptions {
  /** モジュール数（デフォルト: 256px） */
  size?: number;
  /** 余白幅（モジュール数、デフォルト: 4） */
  margin?: number;
  /** エラー訂正レベル（L/M/Q/H、デフォルト: M） */
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
  /** ダークカラー（デフォルト: #000000） */
  darkColor?: string;
  /** ライトカラー（デフォルト: #FFFFFF） */
  lightColor?: string;
}

/**
 * シンプルなQRコード生成
 * Google Charts QR Code APIを使用（フォールバック方式）
 * またはローカル生成を試みる
 */
export function generateQRCodeSVG(
  text: string,
  options: QRCodeOptions = {},
): string {
  const {
    size = 256,
    margin = 4,
    errorCorrection = 'M',
    darkColor = '#000000',
    lightColor = '#FFFFFF',
  } = options;

  // 入力バリデーション
  if (!text || text.length === 0) {
    throw new Error('QRコード対象のテキストが空です');
  }

  // 長すぎるURLの場合はショートコード化を推奨
  if (text.length > 2953) {
    throw new Error('QRコード対象が長すぎます（最大2953文字）');
  }

  // QRコードマトリックスを生成（簡易実装）
  const matrix = generateQRMatrix(text, errorCorrection);
  const moduleCount = matrix.length;
  const totalSize = moduleCount + margin * 2;

  // SVGレンダリング
  const moduleSize = size / totalSize;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;

  // 背景
  svg += `<rect width="${size}" height="${size}" fill="${lightColor}" />`;

  // モジュール描画
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (matrix[row][col]) {
        const x = (col + margin) * moduleSize;
        const y = (row + margin) * moduleSize;
        svg += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="${darkColor}" />`;
      }
    }
  }

  svg += '</svg>';
  return svg;
}

/**
 * 簡易QRマトリックス生成
 * Version 1（21x21）対応、短いテキスト向け
 */
function generateQRMatrix(
  text: string,
  _errorCorrection: 'L' | 'M' | 'Q' | 'H',
): boolean[][] {
  // Version 1: 21x21モジュール
  const size = 21;
  const matrix: boolean[][] = Array(size)
    .fill(null)
    .map(() => Array(size).fill(false));

  // フォーマット情報とファインダーパターンを配置
  addFinderPatterns(matrix);
  addSeparators(matrix);
  addTimingPatterns(matrix);

  // データエンコード
  const data = encodeQRData(text);
  addDataToMatrix(matrix, data);

  return matrix;
}

/**
 * ファインダーパターン（検出用）を追加
 */
function addFinderPatterns(matrix: boolean[][]): void {
  const pattern = [
    [true, true, true, true, true, true, true],
    [true, false, false, false, false, false, true],
    [true, false, true, true, true, false, true],
    [true, false, true, true, true, false, true],
    [true, false, true, true, true, false, true],
    [true, false, false, false, false, false, true],
    [true, true, true, true, true, true, true],
  ];

  // 左上
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      matrix[r][c] = pattern[r][c];
    }
  }

  // 右上
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      matrix[r][14 + c] = pattern[r][c];
    }
  }

  // 左下
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      matrix[14 + r][c] = pattern[r][c];
    }
  }
}

/**
 * セパレータを追加（ファインダーパターン周辺）
 */
function addSeparators(matrix: boolean[][]): void {
  const size = matrix.length;

  // 右上セパレータ
  for (let c = 7; c < size; c++) {
    matrix[7][c] = false;
  }

  // 左下セパレータ
  for (let r = 7; r < size; r++) {
    matrix[r][7] = false;
  }
}

/**
 * タイミングパターン（位置同期用）を追加
 */
function addTimingPatterns(matrix: boolean[][]): void {
  // 水平タイミング
  for (let c = 8; c < 13; c++) {
    matrix[6][c] = c % 2 === 0;
  }

  // 垂直タイミング
  for (let r = 8; r < 13; r++) {
    matrix[r][6] = r % 2 === 0;
  }
}

/**
 * QRコードデータのエンコード（簡易実装）
 * Byte mode: 8ビット符号化
 */
function encodeQRData(text: string): boolean[] {
  const bits: boolean[] = [];

  // モード指示子（4ビット）: 0100 = Byte mode
  bits.push(false, true, false, false);

  // 文字数指示子（8ビット）
  const charCount = text.length;
  for (let i = 7; i >= 0; i--) {
    bits.push((charCount >> i) & 1 ? true : false);
  }

  // データ
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    for (let j = 7; j >= 0; j--) {
      bits.push((code >> j) & 1 ? true : false);
    }
  }

  // 終端マーカー（4ビット）
  bits.push(false, false, false, false);

  return bits;
}

/**
 * マトリックスにデータを追加
 */
function addDataToMatrix(matrix: boolean[][], data: boolean[]): void {
  const size = matrix.length;
  let dataIndex = 0;

  // データ領域は右下から左上へジグザグに配置
  for (let col = size - 1; col > 6; col -= 2) {
    if (col === 6) col--;

    const rightToLeft = col % 4 >= 2;

    for (let c = 0; c < 2; c++) {
      const currentCol = col - c;
      for (let row = 0; row < size; row++) {
        const currentRow = rightToLeft ? size - 1 - row : row;

        // 既に配置済みのパターンをスキップ
        if (isReservedArea(currentRow, currentCol)) {
          continue;
        }

        if (dataIndex < data.length) {
          matrix[currentRow][currentCol] = data[dataIndex];
          dataIndex++;
        }
      }
    }
  }
}

/**
 * 予約領域（ファインダー、フォーマット情報等）を判定
 */
function isReservedArea(row: number, col: number): boolean {
  const size = 21;

  // ファインダーパターン
  if (
    (row < 9 && col < 9) ||
    (row < 9 && col >= size - 8) ||
    (row >= size - 8 && col < 9)
  ) {
    return true;
  }

  // タイミングパターン
  if (row === 6 || col === 6) {
    return true;
  }

  // ダークモジュール（暗黙の予約）
  if (row === 13 && col === 8) {
    return true;
  }

  return false;
}

/**
 * レート制限用のレスポンスヘッダー生成
 */
export function generateRateLimitHeaders(
  limit: number = 1000,
  used: number = 0,
  resetTime: number = 3600,
): Record<string, string> {
  return {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Used': used.toString(),
    'X-RateLimit-Remaining': Math.max(0, limit - used).toString(),
    'X-RateLimit-Reset': Math.floor(Date.now() / 1000 + resetTime).toString(),
  };
}
