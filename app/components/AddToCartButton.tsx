import {type FetcherWithComponents} from 'react-router';
import {CartForm, type OptimisticCartLineInput} from '@shopify/hydrogen';

export function AddToCartButton({
  analytics,
  children,
  disabled,
  lines,
  onClick,
}: {
  analytics?: unknown;
  children: React.ReactNode;
  disabled?: boolean;
  lines: Array<OptimisticCartLineInput>;
  onClick?: () => void;
}) {
  return (
    <CartForm route="/cart" inputs={{lines}} action={CartForm.ACTIONS.LinesAdd}>
      {(fetcher: FetcherWithComponents<unknown>) => (
        <>
          <input name="analytics" type="hidden" value={JSON.stringify(analytics)} />
          <button
            type="submit"
            onClick={onClick}
            disabled={disabled ?? fetcher.state !== 'idle'}
            style={{
              width: '100%',
              padding: '16px',
              background: disabled
                ? 'rgba(255,255,255,0.06)'
                : 'linear-gradient(135deg, #00F0FF, #00C4CC)',
              color: disabled ? 'rgba(255,255,255,0.3)' : '#000',
              border: 'none',
              borderRadius: 12,
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: 1,
              transition: 'all 0.2s',
              position: 'relative' as const,
              overflow: 'hidden',
            }}
          >
            {fetcher.state !== 'idle' ? '追加中...' : children}
          </button>
        </>
      )}
    </CartForm>
  );
}
