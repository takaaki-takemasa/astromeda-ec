/**
 * CronParser — Cron式解析エンジン（松果体のリズム解析装置）
 *
 * 医学メタファー: 松果体はメラトニンを分泌し、体内時計（概日リズム）を制御する。
 * CronParserは "0 9 * * *" のようなCron式を解析し、次回実行時刻を計算する。
 *
 * Edge互換: Date APIのみ使用（node-cronやcron-parserライブラリに依存しない）
 *
 * サポートするCron式: 分 時 日 月 曜日
 * - 数値: 0-59, 0-23, 1-31, 1-12, 0-7 (0=日, 7=日)
 * - ワイルドカード: *
 * - ステップ: * /5 (5分ごと)
 * - 範囲: 1-5
 * - リスト: 1,3,5
 */

interface CronFields {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

/**
 * Cron式をパースして各フィールドの有効値リストに変換
 */
export function parseCronExpression(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: "${expression}" — expected 5 fields (min hour day month weekday)`);
  }

  return {
    minutes: parseField(parts[0], 0, 59),
    hours: parseField(parts[1], 0, 23),
    daysOfMonth: parseField(parts[2], 1, 31),
    months: parseField(parts[3], 1, 12),
    daysOfWeek: Array.from(new Set(parseField(parts[4], 0, 7).map(d => d === 7 ? 0 : d))).sort((a, b) => a - b), // 7→0 (日曜日), deduplicate
  };
}

function parseField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    if (part.includes('/')) {
      // ステップ: */5 or 1-10/2
      const [range, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) throw new Error(`Invalid step: ${part}`);

      let start = min;
      let end = max;
      if (range !== '*') {
        if (range.includes('-')) {
          [start, end] = range.split('-').map(Number);
        } else {
          start = parseInt(range, 10);
        }
      }
      for (let i = start; i <= end; i += step) {
        values.add(i);
      }
    } else if (part.includes('-')) {
      // 範囲: 1-5
      const [start, end] = part.split('-').map(Number);
      for (let i = start; i <= end; i++) {
        values.add(i);
      }
    } else if (part === '*') {
      // ワイルドカード
      for (let i = min; i <= max; i++) {
        values.add(i);
      }
    } else {
      // 単一値
      const val = parseInt(part, 10);
      if (isNaN(val) || val < min || val > max) {
        throw new Error(`Invalid value "${part}" for range ${min}-${max}`);
      }
      values.add(val);
    }
  }

  return Array.from(values).sort((a, b) => a - b);
}

/**
 * 次回実行時刻を計算
 * @param expression Cron式
 * @param from 起点時刻（デフォルト: 現在）
 * @param timezone タイムゾーン（デフォルト: Asia/Tokyo）
 * @returns 次回実行のDate
 */
export function getNextRunTime(
  expression: string,
  from: Date = new Date(),
  _timezone = 'Asia/Tokyo',
): Date {
  const fields = parseCronExpression(expression);

  // fromの1分後から探索開始（現在時刻ちょうどは含めない）
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  // 最大366日先まで探索（無限ループ防止）
  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    if (
      fields.months.includes(candidate.getMonth() + 1) &&
      fields.daysOfMonth.includes(candidate.getDate()) &&
      fields.daysOfWeek.includes(candidate.getDay()) &&
      fields.hours.includes(candidate.getHours()) &&
      fields.minutes.includes(candidate.getMinutes())
    ) {
      return candidate;
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  throw new Error(`No next run found within 366 days for cron: "${expression}"`);
}

/**
 * 次回実行までの秒数を計算
 */
export function getSecondsUntilNextRun(expression: string, from?: Date): number {
  const nextRun = getNextRunTime(expression, from);
  const now = from || new Date();
  return Math.max(0, Math.floor((nextRun.getTime() - now.getTime()) / 1000));
}

/**
 * Cron式のバリデーション
 * @returns null（有効）or エラーメッセージ
 */
export function validateCronExpression(expression: string): string | null {
  try {
    parseCronExpression(expression);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Cron式の人間可読な説明を生成
 */
export function describeCronExpression(expression: string): string {
  try {
    const fields = parseCronExpression(expression);
    const parts: string[] = [];

    // 分
    if (fields.minutes.length === 60) {
      parts.push('毎分');
    } else if (fields.minutes.length === 1) {
      parts.push(`${fields.minutes[0]}分`);
    } else {
      parts.push(`${fields.minutes.join(',')}分`);
    }

    // 時
    if (fields.hours.length === 24) {
      parts.push('毎時');
    } else if (fields.hours.length === 1) {
      parts.push(`${fields.hours[0]}時`);
    } else {
      parts.push(`${fields.hours.join(',')}時`);
    }

    // 日
    if (fields.daysOfMonth.length < 31) {
      parts.push(`${fields.daysOfMonth.join(',')}日`);
    }

    // 月
    if (fields.months.length < 12) {
      parts.push(`${fields.months.join(',')}月`);
    }

    // 曜日
    const weekDayNames = ['日', '月', '火', '水', '木', '金', '土'];
    if (fields.daysOfWeek.length < 7) {
      const names = fields.daysOfWeek.map(d => weekDayNames[d]);
      parts.push(`(${names.join(',')})`);
    }

    return parts.join(' ');
  } catch {
    return expression;
  }
}
