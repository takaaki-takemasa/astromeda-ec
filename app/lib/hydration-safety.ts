/**
 * ============================================================
 * Hydration Safety Helpers — 新生児呼吸保護ユニット
 *
 * 医学メタファー: 新生児蘇生バッグとパルスオキシメーター
 * entry.client.tsx の初期化コードが単一のエラーで全停止するのを防ぐ、
 * 純粋関数として切り出した防御ロジック。
 *
 * M3-TEST-01 (2026-04-10): M2-NEONATAL-01/02 のリグレッション防止。
 * entry.client.tsx はモジュールロード時副作用のため直接テストしづらいので、
 * ロジックを純粋関数として切り出して vitest で網羅的に検証する。
 *
 * entry.client.tsx からこれらの関数を import するようリファクタする際は、
 * 本ファイルのテストが全てグリーンであることを確認してから行うこと。
 * ============================================================
 */

/**
 * initErrorReporter を try/catch で包み、失敗時は診断情報を保管する。
 * どんな例外が出ても呼び出し元に漏らさないことを契約する。
 *
 * @param init エラー報告器の初期化関数（例外を投げる可能性あり）
 * @param diagnostics 失敗時の診断情報を記録するシンク（localStorage等）
 * @param logger 開発時のみ呼ばれるオプショナルロガー
 */
export function safeInitErrorReporter(
  init: () => void,
  diagnostics: {setItem(key: string, value: string): void} | null | undefined,
  logger?: (message: string, err: unknown) => void,
): {ok: boolean; error?: Error} {
  try {
    init();
    return {ok: true};
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    // 診断情報を保管（localStorageが壊れていても飲み込む）
    if (diagnostics) {
      try {
        diagnostics.setItem('__astromeda_init_error__', error.message);
      } catch {
        // localStorage は壊れている環境では診断も諦める
      }
    }
    if (logger) {
      try {
        logger('[Astromeda] initErrorReporter failed (continuing):', error);
      } catch {
        // logger が壊れていても呼び出し元に漏らさない
      }
    }
    return {ok: false, error};
  }
}

/**
 * document 内の全 script タグを走査し、最初に見つかった nonce を返す。
 * querySelector('script[nonce]') と異なり、先頭にサードパーティ script が
 * 挿入された場合でも正しく Hydrogen 生成分の nonce を拾える。
 *
 * @param scripts HTMLCollection（または配列）の script 要素群
 * @returns 最初の非空 nonce、無ければ undefined
 */
export function extractFirstNonce(
  scripts: ArrayLike<{nonce?: string}>,
): string | undefined {
  for (let i = 0; i < scripts.length; i++) {
    const n = scripts[i]?.nonce;
    if (n) {
      return n;
    }
  }
  return undefined;
}
