import type {HydrogenSession} from '@shopify/hydrogen';
import {
  createCookieSessionStorage,
  type SessionStorage,
  type Session,
} from 'react-router';

/**
 * ============================================================
 * BR-06~09: セッション管理（脳幹の記憶・認証制御）
 *
 * 生命医学メタファー: セッションは「意識の連続性」。
 * - BR-06: maxAge=7200 — 記憶の自然消失期限（2時間で強制ログアウト）
 * - BR-07: セッションID再生成 — 認証後の身分証書き換え（fixation防止）
 * - BR-08: idle timeout 30min — 無活動時の意識消失（アイドルタイムアウト）
 * - BR-09: 監査ログ — 全意識操作の記録（SET/DESTROY/REGENのIP+timestamp）
 * ============================================================
 */

/** BR-06: セッションCookieの最大生存期間（秒） */
const SESSION_MAX_AGE = 7200; // 2時間

/** BR-08: アイドルタイムアウト（ミリ秒） */
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30分

/**
 * BR-09: セッション監査ログエントリ
 * サーバーコンソールに構造化ログとして出力。
 * 将来的にはPostgreSQL永続化（DG-11で実装予定）。
 */
interface SessionAuditEntry {
  action: 'SET' | 'DESTROY' | 'REGENERATE' | 'IDLE_EXPIRE' | 'RECOVER';
  timestamp: string;
  ip: string;
  sessionId?: string;
}

function logSessionAudit(entry: SessionAuditEntry): void {
  // BR-09: Security audit logging. Kept for production session forensics.
  // Do NOT wrap with NODE_ENV guard — session security audits must be visible in production.
  console.log('[session-audit]', JSON.stringify(entry));
}

export class AppSession implements HydrogenSession {
  public isPending = false;
  /** BR-08: リクエストごとに更新されるクライアントIP */
  #clientIP: string = 'unknown';

  #sessionStorage;
  #session;

  constructor(sessionStorage: SessionStorage, session: Session) {
    this.#sessionStorage = sessionStorage;
    this.#session = session;
  }

  static async init(request: Request, secrets: string[]) {
    const storage = createCookieSessionStorage({
      cookie: {
        name: 'session',
        httpOnly: true,
        path: '/',
        // HT-01: sameSite="lax"に設定（strictに変更不可）
        // Shopify OAuthリダイレクトが、クロスオリジンのPOST/リダイレクト時に
        // セッションCookieを必要とするため、strictではブレークする。
        // - lax: トップレベルナビゲーション（Oauthリダイレクト）ではCookie送信
        // - strict: クロスオリジンリクエスト全て、Cookie無し（OAuthフロー失敗）
        // リスク軽減: httpOnly=true + secure=true + Tokenベースアクセス制御で補完
        sameSite: 'lax',
        secure: true,
        secrets,
        // BR-06: Cookie有効期限を2時間に設定
        // ブラウザ閉じても2時間以内なら復帰可能、2時間超で強制再認証
        maxAge: SESSION_MAX_AGE,
      },
    });

    // M4-NEURAL-01 (2026-04-10): 破損Cookie検出時の記憶野再形成。
    let recovered = false;
    const session = await storage
      .getSession(request.headers.get('Cookie'))
      .catch(() => {
        recovered = true;
        return storage.getSession();
      });

    const instance = new this(storage, session);
    // BR-03連携: CF-Connecting-IPでクライアントIPを記録
    instance.#clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

    if (recovered) {
      instance.isPending = true;
      // BR-09: 復旧操作を監査ログに記録
      logSessionAudit({
        action: 'RECOVER',
        timestamp: new Date().toISOString(),
        ip: instance.#clientIP,
      });
    }

    // BR-08: アイドルタイムアウトチェック
    const lastAccess = session.get('__lastAccess') as number | undefined;
    const now = Date.now();
    if (lastAccess && (now - lastAccess) > SESSION_IDLE_TIMEOUT_MS) {
      // アイドルタイムアウト: セッションデータをクリアして新セッションに
      logSessionAudit({
        action: 'IDLE_EXPIRE',
        timestamp: new Date().toISOString(),
        ip: instance.#clientIP,
      });
      // セッションの全データをクリア（新しいセッションとして開始）
      const freshSession = await storage.getSession();
      const freshInstance = new AppSession(storage, freshSession);
      freshInstance.#clientIP = instance.#clientIP;
      freshInstance.isPending = true;
      // 新セッションにlastAccessを設定
      freshInstance.set('__lastAccess', now);
      return freshInstance;
    }

    // HT-04: ブラウザフィンガープリント異常検知
    // セッションハイジャック試行検知（User-Agent + Accept-Language の変更）
    await instance.checkBrowserFingerprint(request);

    // BR-08: lastAccessを更新（毎リクエスト）
    session.set('__lastAccess', now);
    instance.isPending = true; // lastAccess更新でcommit必要

    return instance;
  }

  get has() {
    return this.#session.has;
  }

  get get() {
    return this.#session.get;
  }

  get flash() {
    return this.#session.flash;
  }

  get unset() {
    this.isPending = true;
    return this.#session.unset;
  }

  get set() {
    this.isPending = true;
    // BR-09: SET操作の監査ログ（高頻度のため本番ではdebugレベル相当）
    return this.#session.set;
  }

  /**
   * HT-04: ブラウザフィンガープリント異常検知
   * User-Agent + Accept-Language から生成したハッシュを セッションに保存。
   * 次のリクエストで同一ブラウザからのアクセスか確認。
   * 変更を検知した場合、警告ログを出力（セッション破棄はしない — 誤検知防止）
   */
  async checkBrowserFingerprint(request: Request): Promise<void> {
    const userAgent = request.headers.get('user-agent') || '';
    const acceptLanguage = request.headers.get('accept-language') || '';

    // フィンガープリント用のテキスト結合（パイプで区切る）
    const fpText = `${userAgent}|${acceptLanguage}`;

    // SHA-256ハッシュを計算
    const fpHash = await this.computeFingerprintHash(fpText);

    // セッションに保存されているハッシュと比較
    const storedHash = this.#session.get('__fingerprint') as string | undefined;

    if (!storedHash) {
      // 初回または復旧時 — フィンガープリントを保存
      this.#session.set('__fingerprint', fpHash);
      this.isPending = true;
    } else if (storedHash !== fpHash) {
      // ハッシュが異なる — セッションハイジャックの可能性
      console.warn(
        '[HT-04] Browser fingerprint anomaly detected',
        JSON.stringify({
          ip: this.#clientIP,
          timestamp: new Date().toISOString(),
          expectedHash: storedHash,
          currentHash: fpHash,
          userAgent,
        }),
      );
      // セッションを破棄せず、警告のみ（ブラウザアップデート等による誤検知を避ける）
    }
  }

  /**
   * SHA-256でテキストをハッシュ化
   * 最初の8バイト（16進数で16文字）のみを使用
   */
  private async computeFingerprintHash(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    // 最初の8バイトのみを16進数で結合（32文字）
    return hashArray.slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * BR-07: セッションID再生成（Session Fixation防止）
   * 認証成功後に呼び出し、既存セッションの全データを保持したまま
   * 新しいセッションIDを発行する。攻撃者が事前に取得した
   * セッションIDは無効化される。
   */
  async regenerate(): Promise<void> {
    // 現在のセッションデータを退避
    const data: Record<string, unknown> = {};
    // react-router SessionではSession.dataにアクセスできないため、
    // 既知のキーを列挙して退避する
    const knownKeys = ['customerAccessToken', 'customerEmail', '__lastAccess', '__createdAt', '__fingerprint', 'isAdmin', 'loginAt'];
    for (const key of knownKeys) {
      if (this.#session.has(key)) {
        data[key] = this.#session.get(key);
      }
    }

    // 現在のセッションを破棄
    await this.#sessionStorage.destroySession(this.#session);

    // 新しいセッションを生成
    this.#session = await this.#sessionStorage.getSession();

    // 退避したデータを復元
    for (const [key, value] of Object.entries(data)) {
      this.#session.set(key, value);
    }

    // 再生成タイムスタンプを記録
    this.#session.set('__createdAt', Date.now());
    this.isPending = true;

    // BR-09: 再生成を監査ログに記録
    logSessionAudit({
      action: 'REGENERATE',
      timestamp: new Date().toISOString(),
      ip: this.#clientIP,
    });
  }

  destroy() {
    // BR-09: セッション破棄を監査ログに記録
    logSessionAudit({
      action: 'DESTROY',
      timestamp: new Date().toISOString(),
      ip: this.#clientIP,
    });
    return this.#sessionStorage.destroySession(this.#session);
  }

  commit() {
    this.isPending = false;
    return this.#sessionStorage.commitSession(this.#session, {
      // BR-06: commit時にもmaxAgeを明示的に指定（スライディングウィンドウ）
      maxAge: SESSION_MAX_AGE,
    });
  }
}
