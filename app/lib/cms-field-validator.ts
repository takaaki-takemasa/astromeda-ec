/**
 * CMS Field Validator — Metaobject フィールド検証ユーティリティ
 *
 * 管理画面から入力されたデータの整合性を検証。
 * Zod スキーマとは別に、ランタイムで軽量な検証を行うヘルパー群。
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateRequired(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return `${fieldName} は必須です`;
  }
  return null;
}

export function validateMaxLength(value: string, max: number, fieldName: string): string | null {
  if (value.length > max) {
    return `${fieldName} は ${max} 文字以内にしてください (現在: ${value.length})`;
  }
  return null;
}

export function validateHexColor(value: string, fieldName: string): string | null {
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
    return `${fieldName} は #RRGGBB 形式で指定してください`;
  }
  return null;
}

export function validateUrl(value: string, fieldName: string): string | null {
  if (!value) return null;
  try {
    new URL(value);
    return null;
  } catch {
    if (value.startsWith('/')) return null; // relative URL OK
    return `${fieldName} は有効な URL ではありません`;
  }
}

export function validateJsonArray(value: string, fieldName: string): string | null {
  if (!value || value.trim() === '') return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return `${fieldName} は JSON 配列形式で指定してください`;
    }
    return null;
  } catch {
    return `${fieldName} の JSON 形式が不正です`;
  }
}

export function validateJsonObject(value: string, fieldName: string): string | null {
  if (!value || value.trim() === '') return null;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return `${fieldName} は JSON オブジェクト形式で指定してください`;
    }
    return null;
  } catch {
    return `${fieldName} の JSON 形式が不正です`;
  }
}

export function validateIntRange(value: number, min: number, max: number, fieldName: string): string | null {
  if (!Number.isInteger(value) || value < min || value > max) {
    return `${fieldName} は ${min}〜${max} の整数で指定してください`;
  }
  return null;
}

export function validateNoScript(value: string, fieldName: string): string | null {
  if (/<script[\s\S]*?>/i.test(value)) {
    return `${fieldName} に <script> タグは使用できません`;
  }
  return null;
}

export function validateNoHtml(value: string, fieldName: string): string | null {
  if (/<[^>]*>/g.test(value)) {
    return `${fieldName} に HTML タグは使用できません`;
  }
  return null;
}

/**
 * 複数のバリデーション結果をまとめる
 */
export function combineValidation(...errors: (string | null)[]): ValidationResult {
  const filteredErrors = errors.filter((e): e is string => e !== null);
  return {
    valid: filteredErrors.length === 0,
    errors: filteredErrors,
  };
}

/**
 * Metaobject エントリの「完全性」を検証
 * （フロントエンド表示に切り替えるための最低条件を満たすか）
 */
export function validateMetaobjectCompleteness(
  fields: Record<string, string>,
  requiredKeys: string[],
): ValidationResult {
  const errors: string[] = [];
  for (const key of requiredKeys) {
    const val = fields[key];
    if (val === undefined || val === null || val.trim() === '') {
      errors.push(`フィールド '${key}' が未入力です`);
    }
  }
  return {valid: errors.length === 0, errors};
}
