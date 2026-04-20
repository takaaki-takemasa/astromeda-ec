/**
 * Zod 日本語エラーマップ — 中学生が読める日本語に統一
 *
 * patch 0089 (2026-04-21) R2-P2-4:
 * Zod v3 の既定エラーは英語 ("Required", "Expected string, received number", ...)。
 * CEO・店舗運用者向けの admin 画面で英語が漏れるのを防ぐため、
 * z.setErrorMap() でグローバルに日本語化する。
 *
 * 一度 setErrorMap を呼ぶと、以後すべての z.XXX().safeParse() / .parse() の
 * 既定メッセージが日本語化される。スキーマ側で .refine(..., {message: '...'})
 * 等で明示的に与えたメッセージは上書きされない（優先順位: 明示 > errorMap）。
 *
 * 使い方:
 *   import './lib/zod-error-map';   // server.ts の先頭で side-effect import
 *
 * 参考: https://zod.dev/ERROR_HANDLING?id=customizing-errors-globally
 */
import {z, ZodIssueCode, type ZodErrorMap} from 'zod';

// ── 内部ヘルパー ───────────────────────────────────────

/** Zod 型名 → 日本語名 */
const TYPE_JA: Record<string, string> = {
  string: '文字列',
  number: '数値',
  integer: '整数',
  boolean: '真偽値 (はい/いいえ)',
  date: '日付',
  bigint: '大きな整数',
  array: '配列',
  object: 'オブジェクト',
  null: 'null',
  undefined: '未指定',
  symbol: 'シンボル',
  function: '関数',
  map: 'Map',
  set: 'Set',
  promise: 'Promise',
  unknown: '不明な値',
  nan: 'NaN',
  void: 'void',
  never: 'never',
};
function ja(type: string): string {
  return TYPE_JA[type] ?? type;
}

/** invalid_string の validation 種別 → 日本語 */
const STRING_VALIDATION_JA: Record<string, string> = {
  email: 'メールアドレス',
  url: 'URL',
  uuid: 'UUID',
  regex: '形式',
  cuid: 'CUID',
  cuid2: 'CUID2',
  ulid: 'ULID',
  datetime: '日時 (ISO 8601)',
  date: '日付',
  time: '時刻',
  ip: 'IPアドレス',
  emoji: '絵文字',
  nanoid: 'Nano ID',
  base64: 'Base64',
};

// ── 日本語エラーマップ ──────────────────────────────────

export const jaErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type: {
      if (issue.received === 'undefined') {
        return {message: '必須項目です'};
      }
      return {
        message: `${ja(issue.expected)}で入力してください (現在: ${ja(issue.received)})`,
      };
    }

    case ZodIssueCode.invalid_literal: {
      return {
        message: `「${JSON.stringify(issue.expected)}」を指定してください`,
      };
    }

    case ZodIssueCode.unrecognized_keys: {
      return {
        message: `不明な項目があります: ${issue.keys.map((k) => `「${k}」`).join('、')}`,
      };
    }

    case ZodIssueCode.invalid_union: {
      return {message: '入力値が許可されているいずれの形式とも一致しません'};
    }

    case ZodIssueCode.invalid_union_discriminator: {
      return {
        message: `種別には次のいずれかを指定してください: ${issue.options.map((o) => `「${String(o)}」`).join('、')}`,
      };
    }

    case ZodIssueCode.invalid_enum_value: {
      return {
        message: `次のいずれかを指定してください: ${issue.options.map((o) => `「${String(o)}」`).join('、')} (入力: 「${String(issue.received)}」)`,
      };
    }

    case ZodIssueCode.invalid_arguments: {
      return {message: '関数引数が不正です'};
    }

    case ZodIssueCode.invalid_return_type: {
      return {message: '関数戻り値が不正です'};
    }

    case ZodIssueCode.invalid_date: {
      return {message: '正しい日付を入力してください'};
    }

    case ZodIssueCode.invalid_string: {
      if (typeof issue.validation === 'object') {
        if ('startsWith' in issue.validation) {
          return {
            message: `「${issue.validation.startsWith}」で始まる文字列を入力してください`,
          };
        }
        if ('endsWith' in issue.validation) {
          return {
            message: `「${issue.validation.endsWith}」で終わる文字列を入力してください`,
          };
        }
        if ('includes' in issue.validation) {
          return {
            message: `「${issue.validation.includes}」を含む文字列を入力してください`,
          };
        }
      }
      const label = STRING_VALIDATION_JA[String(issue.validation)] ?? '形式';
      return {message: `正しい${label}を入力してください`};
    }

    case ZodIssueCode.too_small: {
      const type = issue.type; // 'string' | 'number' | 'array' | 'set' | 'date' | 'bigint'
      const min = issue.minimum;
      if (type === 'array') {
        return {
          message: issue.inclusive
            ? `${min} 件以上で指定してください`
            : `${min} 件より多く指定してください`,
        };
      }
      if (type === 'string') {
        if (min === 1) return {message: '必須項目です'};
        return {
          message: issue.inclusive
            ? `${min} 文字以上で入力してください`
            : `${min} 文字より多く入力してください`,
        };
      }
      if (type === 'number' || type === 'bigint') {
        return {
          message: issue.inclusive
            ? `${min} 以上で入力してください`
            : `${min} より大きい値を入力してください`,
        };
      }
      if (type === 'date') {
        const d = typeof min === 'number' ? new Date(min).toISOString() : String(min);
        return {message: `${d} 以降の日時を指定してください`};
      }
      return {message: `値が小さすぎます`};
    }

    case ZodIssueCode.too_big: {
      const type = issue.type;
      const max = issue.maximum;
      if (type === 'array') {
        return {
          message: issue.inclusive
            ? `${max} 件以下で指定してください`
            : `${max} 件未満で指定してください`,
        };
      }
      if (type === 'string') {
        return {
          message: issue.inclusive
            ? `${max} 文字以内で入力してください`
            : `${max} 文字未満で入力してください`,
        };
      }
      if (type === 'number' || type === 'bigint') {
        return {
          message: issue.inclusive
            ? `${max} 以下で入力してください`
            : `${max} より小さい値を入力してください`,
        };
      }
      if (type === 'date') {
        const d = typeof max === 'number' ? new Date(max).toISOString() : String(max);
        return {message: `${d} 以前の日時を指定してください`};
      }
      return {message: `値が大きすぎます`};
    }

    case ZodIssueCode.custom: {
      // refine() の明示メッセージがある場合は ctx.defaultError に入る
      return {message: ctx.defaultError ?? '入力値が不正です'};
    }

    case ZodIssueCode.invalid_intersection_types: {
      return {message: '複数の型条件が整合しません'};
    }

    case ZodIssueCode.not_multiple_of: {
      return {message: `${issue.multipleOf} の倍数で入力してください`};
    }

    case ZodIssueCode.not_finite: {
      return {message: '有限の数値を入力してください'};
    }

    default: {
      return {message: ctx.defaultError};
    }
  }
};

// ── グローバル登録 ─────────────────────────────────────
// side-effect import で一度だけ適用される。多重適用は Zod 側で冪等。
z.setErrorMap(jaErrorMap);

/** 明示的に呼びたい場面用（テスト等） */
export function installJaErrorMap(): void {
  z.setErrorMap(jaErrorMap);
}
