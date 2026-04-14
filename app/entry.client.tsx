import {HydratedRouter} from 'react-router/dom';
import {startTransition, StrictMode} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {NonceProvider} from '@shopify/hydrogen';
import {initErrorReporter, reportError} from '~/lib/error-reporter';

/**
 * 予防医学: グローバルエラーキャッチャー
 * 1. Error Reporter初期化 — 未処理エラー/Promiseをサーバーにログ
 * 2. Promiseの未処理rejectをキャッチしサイレントクラッシュを防止
 *
 * M2-NEONATAL-01 (2026-04-10): initErrorReporter自身の失敗で
 * 後続のhydrateRoot/カートインターセプターが死なないようtry/catchで隔離。
 * 「呼吸を担う神経が呼吸開始時に壊れて誰も助けに来ない」障害を防止。
 */
if (typeof window !== 'undefined') {
  try {
    initErrorReporter();
  } catch (err) {
    // sendBeacon等の初期化失敗を最小限ログして続行
    try {
      window.localStorage?.setItem(
        '__astromeda_init_error__',
        String((err as Error)?.message || err),
      );
    } catch {
      /* localStorageも壊れている環境では諦める */
    }
    if (process.env.NODE_ENV === 'development') {
      console.error('[Astromeda] initErrorReporter failed (continuing):', err);
    }
  }

  window.addEventListener('unhandledrejection', (event) => {
    process.env.NODE_ENV === 'development' && console.error('[Astromeda] Unhandled promise rejection:', event.reason);
  });
}

/**
 * カスタマイズバリアント カートフォーム インターセプター
 * React hydration error #418 により CartForm の hidden input が更新されないため、
 * ネイティブフォーム送信をキャプチャフェーズで傍受し、
 * 現在のカスタマイズ選択からlines配列を再構築する。
 */
/**
 * I-09: INP最適化 — カスタマイズバリアント カートフォーム インターセプター
 *
 * DOM走査・JSON解析をキャッシュ化し、submit時の同期処理を最小化。
 * SKUマップは初回アクセス時にキャッシュし、以後の submit では
 * メモリ上のオブジェクトを参照するだけにすることで INP を改善。
 */
if (typeof window !== 'undefined') {
  // I-09: SKUマップをキャッシュ（DOM解析は初回1回のみ）
  let _cachedSkuMap: Record<string, Record<string, string>> | null = null;
  function getSkuMap(): Record<string, Record<string, string>> {
    if (_cachedSkuMap) return _cachedSkuMap;
    try {
      _cachedSkuMap = JSON.parse(
        document.querySelector('#customization-sku-map-data')?.textContent || '{}'
      );
    } catch {
      _cachedSkuMap = {};
    }
    return _cachedSkuMap!;
  }

  /**
   * HT-07: submit listener を名前付き関数として定義し、
   * SPA遷移時にremoveEventListenerでクリーンアップ可能にする。
   * 無名関数だとGCされずメモリリークの原因になる。
   */
  function handleCartSubmit(e: Event) {
    const form = e.target as HTMLFormElement;
    if (!form || !form.querySelector) return;
    const cartInput = form.querySelector('input[name="cartFormInput"]') as HTMLInputElement;
    const skuMapEl = form.querySelector('#sku-variant-map') as HTMLInputElement;
    const variantEl = form.querySelector('#selected-variant-id') as HTMLInputElement;
    const handleEl = form.querySelector('#product-handle') as HTMLInputElement;
    if (!cartInput || !skuMapEl || !variantEl) return;

    try {
      const skuToVariantId = JSON.parse(skuMapEl.value || '{}');
      const CUSTOMIZATION_SKU_MAP = getSkuMap();
      const variantId = variantEl.value;
      const productHandle = handleEl ? handleEl.value : '';
      if (!variantId || Object.keys(skuToVariantId).length === 0) return;

      const selects = document.querySelectorAll('select[data-field-name]');
      const attrs: {key: string; value: string}[] = [];
      let surcharge = 0;
      interface CartLineInput {
        merchandiseId: string;
        quantity: number;
        attributes?: {key: string; value: string}[];
      }
      const customLines: CartLineInput[] = [];

      selects.forEach((sel: Element) => {
        const select = sel as HTMLSelectElement;
        if (!select.value || select.value === '') return;
        const fieldName = select.getAttribute('data-field-name') || '';
        const selectedOpt = select.options[select.selectedIndex];
        const label = selectedOpt ? selectedOpt.text : '';
        const priceMatch = label.match(/\+.*?([0-9][0-9,]+)/);
        if (priceMatch) {
          surcharge += parseInt(priceMatch[1].replace(/,/g, ''), 10);
        }
        attrs.push({key: fieldName, value: select.value});

        // SKUマップからバリアントIDを検索
        const fieldMap = CUSTOMIZATION_SKU_MAP[fieldName];
        const sku = fieldMap ? fieldMap[select.value] : null;
        if (sku && skuToVariantId[sku]) {
          customLines.push({
            merchandiseId: skuToVariantId[sku],
            quantity: 1,
            attributes: [
              {key: '_parent_product', value: productHandle},
              {key: '_customization_for', value: fieldName},
            ],
          });
        }
      });

      // メインラインを構築
      const mainLine: CartLineInput = {merchandiseId: variantId, quantity: 1};
      if (attrs.length > 0) {
        mainLine.attributes = [...attrs];
        if (surcharge > 0) {
          mainLine.attributes.push({key: '_customization_surcharge', value: String(surcharge)});
          mainLine.attributes.push({key: '_カスタマイズ追加金額', value: `¥${surcharge.toLocaleString()}`});
        }
      }

      const lines = [mainLine, ...customLines];
      cartInput.value = JSON.stringify({action: 'LinesAdd', inputs: {lines}});
      if (process.env.NODE_ENV === 'development') {
        console.log('[CartFix] Updated lines:', lines.length, 'custom:', customLines.length, 'surcharge:', surcharge);
      }
    } catch(err) {
      // HT-08: エラー時にCustomEvent dispatch（他コンポーネントが検知可能に）
      try {
        window.dispatchEvent(new CustomEvent('astromeda:cart-error', {
          detail: {error: err instanceof Error ? err.message : String(err), timestamp: Date.now()},
        }));
      } catch { /* CustomEvent未対応環境では無視 */ }
      if (process.env.NODE_ENV === 'development') {
        console.error('[CartFix] Error:', err);
      }
    }
  }

  // HT-07: 名前付き関数でリスナー登録（removeEventListener可能に）
  document.addEventListener('submit', handleCartSubmit, true); // capture phase

  // HT-07: SPA画面遷移時のクリーンアップ登録
  // React Router 7のナビゲーションでDOMが入れ替わる際、
  // 古いリスナーが残らないようにする（将来のcleanup用hook point）
  window.__astromedaCleanupCartListener = () => {
    document.removeEventListener('submit', handleCartSubmit, true);
    _cachedSkuMap = null; // キャッシュもクリア
  };
}

/**
 * HT-09: Service Worker基盤登録（オフライン検出の土台）
 * 初期段階では空のSWを登録するだけ。FE-01 PWAフェーズで
 * キャッシュ戦略・プッシュ通知を追加する。
 * 生命医学: 予防接種の「プライミング」— まず免疫系に存在を認識させ、
 * 後から本格的な免疫応答（キャッシュ戦略）を構築する。
 */
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  // 初回レンダリング後に遅延登録（FCP/LCPブロック回避）
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW登録失敗は致命的ではない（オフライン機能が使えないだけ）
    });
  }, {once: true});
}

// TypeScript: グローバルwindow拡張宣言
declare global {
  interface Window {
    __astromedaCleanupCartListener?: () => void;
  }
}

if (!window.location.origin.includes('webcache.googleusercontent.com')) {
  startTransition(() => {
    // M2-NEONATAL-02 (2026-04-10): 全script走査で最初の有効なnonceを採用。
    // querySelector('script[nonce]')だけだと先頭にサードパーティscriptが
    // 挿入された場合に nonce が undefined になり、後続inline scriptが
    // CSPで全弾され「中枢神経のミエリン剥離」状態になる。
    let existingNonce: string | undefined;
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
      const n = scripts[i].nonce;
      if (n) {
        existingNonce = n;
        break;
      }
    }

    hydrateRoot(
      document,
      <StrictMode>
        <NonceProvider value={existingNonce}>
          <HydratedRouter />
        </NonceProvider>
      </StrictMode>,
      {
        // M6-NEURAL-01 (2026-04-10): Hydration mismatch の component stack を
        // 本番でも error-reporter 経由で捕捉する。React #418 は production では
        // "Minified React error #418" としか出ないため、開発限定ログでは原因
        // 特定できない。reportError 経由で /api/errors に送信し、サーバー側の
        // ログから真の発生源（コンポーネント名・propsチェーン）を逆探知する。
        // 臨床例え：指紋が一致しない患者が救急室に運ばれて来るが、カルテ
        // （スタックトレース）を発行しなければ担当医（M7 Claude）は手術できない。
        onRecoverableError: (error: unknown, errorInfo?: {componentStack?: string}) => {
          try {
            const normalized =
              error instanceof Error
                ? error
                : new Error(String((error as {message?: string})?.message ?? error));
            // componentStack は React 19 の hydrateRoot から第二引数で提供される。
            // 未提供の環境（React 18 pre-19）では空文字で無害化。
            const componentStack = errorInfo?.componentStack ?? '';
            reportError(normalized, {
              source: 'hydration',
              marker: 'M6-NEURAL-01',
              componentStack: componentStack.substring(0, 3000),
            });
          } catch (reportFailure) {
            // reporter 自身の失敗でも hydration 復旧は続行する。
            if (process.env.NODE_ENV === 'development') {
              console.warn('[Astromeda] reportError failed:', reportFailure);
            }
          }
          if (process.env.NODE_ENV === 'development') {
            console.warn('[Astromeda] Hydration mismatch:', error);
          }
        },
      },
    );
  });
}
