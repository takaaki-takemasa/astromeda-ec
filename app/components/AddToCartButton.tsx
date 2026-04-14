import {useEffect, useRef} from 'react';
import {type FetcherWithComponents} from 'react-router';
import {CartForm, type OptimisticCartLineInput} from '@shopify/hydrogen';
import {useToast} from '~/components/astro/ToastProvider';
import {trackAddToCart} from '~/lib/ga4-ecommerce';

export function AddToCartButton({
  analytics,
  children,
  disabled,
  lines,
  onClick,
  productName,
}: {
  analytics?: unknown;
  children: React.ReactNode;
  disabled?: boolean;
  lines: Array<OptimisticCartLineInput>;
  onClick?: () => void;
  productName?: string;
}) {
  return (
    <CartForm route="/cart" inputs={{lines}} action={CartForm.ACTIONS.LinesAdd}>
      {(fetcher: FetcherWithComponents<unknown>) => (
        <AddToCartInner
          fetcher={fetcher}
          analytics={analytics}
          disabled={disabled}
          onClick={onClick}
          productName={productName}
        >
          {children}
        </AddToCartInner>
      )}
    </CartForm>
  );
}

/** Inner component to use hooks inside CartForm render prop */
function AddToCartInner({
  fetcher,
  analytics,
  disabled,
  onClick,
  productName,
  children,
}: {
  fetcher: FetcherWithComponents<unknown>;
  analytics?: unknown;
  disabled?: boolean;
  onClick?: () => void;
  productName?: string;
  children: React.ReactNode;
}) {
  const {cartSuccess, cartError} = useToast();
  const prevState = useRef(fetcher.state);

  useEffect(() => {
    // Detect transition from loading/submitting → idle (action completed)
    if (prevState.current !== 'idle' && fetcher.state === 'idle') {
      if (fetcher.data?.errors?.length) {
        cartError();
      } else {
        cartSuccess(productName);
        // GA4 add_to_cart イベント（社会ネットワーク層 — カート追加行動の記録）
        if (productName) {
          trackAddToCart({
            id: productName,
            title: productName,
          });
        }
      }
    }
    prevState.current = fetcher.state;
  }, [fetcher.state, fetcher.data, cartSuccess, cartError, productName]);

  return (
    <>
      <input
        name="analytics"
        type="hidden"
        value={JSON.stringify(analytics)}
      />
      <button
        type="submit"
        onClick={onClick}
        disabled={disabled ?? fetcher.state !== 'idle'}
      >
        {children}
      </button>
    </>
  );
}
