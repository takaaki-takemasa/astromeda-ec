/**
 * AppError — 統一エラー型 (RFC 7807 Problem Details 準拠)
 *
 * 医学メタファー: 延髄（Medulla Oblongata）
 * 延髄は脳幹の一部で、全身からの感覚信号を統一フォーマットで上位脳に伝達する。
 * エラーも同じ — 発生源(API/UI/Agent/DB)を問わず、統一フォーマットで
 * エラーバウンダリ・ログ・レポーターに伝達する。
 *
 * RFC 7807 Problem Details for HTTP APIs:
 * - type: エラー種別のURI (例: /errors/not-found)
 * - title: 人間可読なエラー名
 * - status: HTTPステータスコード
 * - detail: このインスタンス固有の説明
 * - instance: エラー発生元のURI (リクエストパス等)
 *
 * 設計原則:
 * 1. 全エラーはAppErrorを通過する（血液が心臓を通過するように）
 * 2. 既存のthrow new Response / throw new Error と互換
 * 3. 予防医学: エラーの分類・追跡で再発パターンを検出可能に
 * 4. 成長対応: 新しいエラー種別を型安全に追加可能
 */

/**
 * エラーカテゴリ — 臓器別の障害分類
 * システムの成長に伴い、新カテゴリを追加可能
 */
export type ErrorCategory =
  | 'VALIDATION'      // 免疫系: 入力検証エラー
  | 'AUTHENTICATION'  // 心臓弁: 認証エラー
  | 'AUTHORIZATION'   // 心臓弁: 認可エラー
  | 'NOT_FOUND'       // 神経系: リソース未発見
  | 'CONFLICT'        // 循環器: データ競合
  | 'RATE_LIMIT'      // 内分泌: レート制限
  | 'EXTERNAL_API'    // 消化器: 外部API障害
  | 'INTERNAL'        // 脳幹: 内部エラー
  | 'TIMEOUT'         // 筋骨格: タイムアウト
  | 'CONFIGURATION';  // 脳幹: 設定エラー

/**
 * エラー重症度 — トリアージレベル
 * 医療のトリアージと同じ4段階
 */
export type ErrorSeverity =
  | 'critical'  // 赤: システム停止レベル（即座に対応）
  | 'error'     // 橙: 機能障害（速やかに対応）
  | 'warning'   // 黄: 部分的問題（計画的に対応）
  | 'info';     // 緑: 情報のみ（記録のみ）

/**
 * RFC 7807 Problem Details 型定義
 */
export interface ProblemDetails {
  /** エラー種別URI (例: /errors/validation) */
  type: string;
  /** 人間可読なエラー名 */
  title: string;
  /** HTTPステータスコード */
  status: number;
  /** このインスタンス固有の説明 */
  detail: string;
  /** エラー発生元URI */
  instance?: string;
  /** エラーカテゴリ (拡張フィールド) */
  category: ErrorCategory;
  /** トリアージレベル (拡張フィールド) */
  severity: ErrorSeverity;
  /** 追加コンテキスト (拡張フィールド) */
  context?: Record<string, unknown>;
  /** エラー発生タイムスタンプ */
  timestamp: string;
  /** トレースID (分散トレーシング用) */
  traceId?: string;
}

/**
 * AppError — 統一エラークラス
 *
 * 使用例:
 * ```ts
 * // API層: throw new Response の代替
 * throw AppError.notFound('商品が見つかりません', { productId: handle });
 *
 * // Loader/Action: 既存パターンとの互換
 * throw AppError.fromResponse(404, 'Not Found');
 *
 * // バリデーション: Zodエラーからの変換
 * throw AppError.fromZodError(zodResult.error);
 *
 * // ErrorBoundary: キャッチしたエラーの判定
 * if (AppError.isAppError(error)) { ... }
 * ```
 */
export class AppError extends Error {
  public readonly type: string;
  public readonly title: string;
  public readonly status: number;
  public readonly detail: string;
  public readonly instance?: string;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: string;
  public readonly traceId?: string;

  constructor(options: {
    type?: string;
    title: string;
    status: number;
    detail: string;
    instance?: string;
    category: ErrorCategory;
    severity?: ErrorSeverity;
    context?: Record<string, unknown>;
    cause?: unknown;
    traceId?: string;
  }) {
    super(options.detail);
    this.name = 'AppError';

    this.type = options.type ?? `/errors/${options.category.toLowerCase()}`;
    this.title = options.title;
    this.status = options.status;
    this.detail = options.detail;
    this.instance = options.instance;
    this.category = options.category;
    this.severity = options.severity ?? AppError.severityFromStatus(options.status);
    this.context = options.context;
    this.timestamp = new Date().toISOString();
    this.traceId = options.traceId;

    // エラーチェーン: 原因エラーを保持
    if (options.cause) {
      this.cause = options.cause;
    }
  }

  // ========== ファクトリーメソッド（頻出パターン） ==========

  /** 404 Not Found */
  static notFound(detail: string, context?: Record<string, unknown>): AppError {
    return new AppError({
      title: 'リソースが見つかりません',
      status: 404,
      detail,
      category: 'NOT_FOUND',
      context,
    });
  }

  /** 400 Bad Request / Validation Error */
  static validation(detail: string, context?: Record<string, unknown>): AppError {
    return new AppError({
      title: 'バリデーションエラー',
      status: 400,
      detail,
      category: 'VALIDATION',
      context,
    });
  }

  /** 401 Unauthorized */
  static unauthorized(detail: string = '認証が必要です'): AppError {
    return new AppError({
      title: '認証エラー',
      status: 401,
      detail,
      category: 'AUTHENTICATION',
    });
  }

  /** 403 Forbidden */
  static forbidden(detail: string = 'アクセス権限がありません'): AppError {
    return new AppError({
      title: '認可エラー',
      status: 403,
      detail,
      category: 'AUTHORIZATION',
    });
  }

  /** 409 Conflict */
  static conflict(detail: string, context?: Record<string, unknown>): AppError {
    return new AppError({
      title: 'データ競合',
      status: 409,
      detail,
      category: 'CONFLICT',
      context,
    });
  }

  /** 429 Too Many Requests */
  static rateLimit(detail: string = 'リクエスト回数の上限に達しました'): AppError {
    return new AppError({
      title: 'レート制限',
      status: 429,
      detail,
      category: 'RATE_LIMIT',
    });
  }

  /** 502 Bad Gateway / External API Error */
  static externalApi(detail: string, context?: Record<string, unknown>): AppError {
    return new AppError({
      title: '外部API障害',
      status: 502,
      detail,
      category: 'EXTERNAL_API',
      context,
    });
  }

  /** 500 Internal Server Error */
  static internal(detail: string, cause?: unknown): AppError {
    return new AppError({
      title: '内部エラー',
      status: 500,
      detail,
      category: 'INTERNAL',
      severity: 'error',
      cause,
    });
  }

  /** 504 Gateway Timeout */
  static timeout(detail: string = 'リクエストがタイムアウトしました'): AppError {
    return new AppError({
      title: 'タイムアウト',
      status: 504,
      detail,
      category: 'TIMEOUT',
    });
  }

  /** 500 Configuration Error */
  static configuration(detail: string): AppError {
    return new AppError({
      title: '設定エラー',
      status: 500,
      detail,
      category: 'CONFIGURATION',
      severity: 'critical',
    });
  }

  // ========== 変換メソッド（既存パターンとの橋渡し） ==========

  /**
   * throw new Response() の代替 — React Routerのloader/actionで使用
   * Response オブジェクトに変換して throw する
   */
  toResponse(): Response {
    return new Response(
      JSON.stringify(this.toProblemDetails()),
      {
        status: this.status,
        headers: {
          'Content-Type': 'application/problem+json',
        },
      },
    );
  }

  /**
   * RFC 7807 Problem Details JSON に変換
   */
  toProblemDetails(): ProblemDetails {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      instance: this.instance,
      category: this.category,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp,
      traceId: this.traceId,
    };
  }

  /**
   * error-reporter.ts 用のコンテキスト付きレポートデータ
   */
  toReportContext(): Record<string, string> {
    return {
      errorType: this.type,
      errorCategory: this.category,
      errorSeverity: this.severity,
      errorStatus: String(this.status),
      ...(this.traceId ? { traceId: this.traceId } : {}),
    };
  }

  /**
   * ログ出力用の構造化データ
   * 将来 pino/winston 導入時にそのまま使用可能
   */
  toLogEntry(): Record<string, unknown> {
    return {
      level: this.severity,
      msg: this.detail,
      type: this.type,
      status: this.status,
      category: this.category,
      instance: this.instance,
      context: this.context,
      timestamp: this.timestamp,
      traceId: this.traceId,
      stack: this.stack,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }

  // ========== 静的ヘルパー ==========

  /**
   * 既存の throw new Response(body, {status}) から AppError に変換
   * 段階的移行用 — 既存コードを壊さずにAppErrorに統一
   */
  static fromResponse(status: number, body?: string | null): AppError {
    const category = AppError.categoryFromStatus(status);
    return new AppError({
      title: AppError.titleFromStatus(status),
      status,
      detail: body ?? AppError.defaultDetailFromStatus(status),
      category,
    });
  }

  /**
   * Zodバリデーションエラーから AppError に変換
   */
  static fromZodError(error: { issues: Array<{ path: (string | number)[]; message: string }> }): AppError {
    const details = error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    return new AppError({
      title: 'バリデーションエラー',
      status: 400,
      detail: details.join('; '),
      category: 'VALIDATION',
      context: { fields: details },
    });
  }

  /**
   * 不明なエラーから AppError に変換（catch句で使用）
   *
   * 医学メタファー: トリアージ — 不明な患者をまず分類する
   */
  static from(error: unknown, fallbackDetail?: string): AppError {
    // 既にAppErrorならそのまま返す
    if (AppError.isAppError(error)) return error;

    // Responseオブジェクト（React Routerのloader/action由来）
    if (error instanceof Response) {
      return AppError.fromResponse(error.status);
    }

    // 標準Errorオブジェクト
    if (error instanceof Error) {
      return new AppError({
        title: '内部エラー',
        status: 500,
        detail: error.message || fallbackDetail || '不明なエラーが発生しました',
        category: 'INTERNAL',
        cause: error,
      });
    }

    // その他（文字列等）
    return new AppError({
      title: '内部エラー',
      status: 500,
      detail: typeof error === 'string' ? error : fallbackDetail ?? '不明なエラーが発生しました',
      category: 'INTERNAL',
    });
  }

  /**
   * 型ガード: AppErrorかどうか判定
   */
  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
  }

  // ========== プライベートヘルパー ==========

  private static severityFromStatus(status: number): ErrorSeverity {
    if (status >= 500) return 'error';
    if (status === 429) return 'warning';
    if (status >= 400) return 'warning';
    return 'info';
  }

  private static categoryFromStatus(status: number): ErrorCategory {
    switch (status) {
      case 400: return 'VALIDATION';
      case 401: return 'AUTHENTICATION';
      case 403: return 'AUTHORIZATION';
      case 404: return 'NOT_FOUND';
      case 409: return 'CONFLICT';
      case 429: return 'RATE_LIMIT';
      case 502: return 'EXTERNAL_API';
      case 504: return 'TIMEOUT';
      default: return status >= 500 ? 'INTERNAL' : 'VALIDATION';
    }
  }

  private static titleFromStatus(status: number): string {
    const titles: Record<number, string> = {
      400: 'バリデーションエラー',
      401: '認証エラー',
      403: '認可エラー',
      404: 'リソースが見つかりません',
      409: 'データ競合',
      429: 'レート制限',
      500: '内部エラー',
      502: '外部API障害',
      504: 'タイムアウト',
    };
    return titles[status] ?? (status >= 500 ? 'サーバーエラー' : 'クライアントエラー');
  }

  private static defaultDetailFromStatus(status: number): string {
    const details: Record<number, string> = {
      400: 'リクエストが不正です',
      401: '認証が必要です',
      403: 'アクセス権限がありません',
      404: 'リソースが見つかりません',
      409: 'データの競合が発生しました',
      429: 'リクエスト回数の上限に達しました',
      500: '内部エラーが発生しました',
      502: '外部サービスからの応答が不正です',
      504: 'リクエストがタイムアウトしました',
    };
    return details[status] ?? '予期しないエラーが発生しました';
  }
}
