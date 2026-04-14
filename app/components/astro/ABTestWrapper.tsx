/**
 * ABTestWrapper — React component for A/B testing
 *
 * 用途: A/Bテストバリアントをレンダリング
 * SSR-safe: サーバーサイドではコントロールバリアントを返す
 *
 * 使用例:
 * ```tsx
 * <ABTestWrapper
 *   testId="hero-cta"
 *   variants={['blue', 'green']}
 * >
 *   {(variant) => variant === 'blue' ? <BlueButton /> : <GreenButton />}
 * </ABTestWrapper>
 * ```
 */

import { useEffect, useState } from 'react';
import { getVariant, trackConversion, type ABTest } from '~/lib/ab-test';

interface ABTestWrapperProps {
  testId: string;
  variants: string[];
  weights?: number[];
  children: (variant: string) => React.ReactNode;
  onVariantChange?: (variant: string) => void;
}

/**
 * ABTestWrapper component
 *
 * サーバーサイドレンダリング時はコントロール（最初のバリアント）を返す。
 * クライアント側でハイドレーション後、実際のバリアント割り当てが適用される。
 */
export function ABTestWrapper({
  testId,
  variants,
  weights,
  children,
  onVariantChange,
}: ABTestWrapperProps) {
  const [variant, setVariant] = useState<string>(variants[0]); // SSR時のデフォルト
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // クライアント側でバリアント割り当てを実行
    const test: ABTest = { id: testId, variants, weights };
    const assignedVariant = getVariant(test);

    if (assignedVariant !== variant) {
      setVariant(assignedVariant);
      onVariantChange?.(assignedVariant);

      if (process.env.NODE_ENV === 'development') {
        console.debug(
          `[ABTestWrapper] Variant assigned: ${testId} -> ${assignedVariant}`,
        );
      }
    }

    setIsHydrated(true);
  }, [testId, variant, variants, weights, onVariantChange]);

  // SSR時とクライアント時の両方でレンダリング（フラッシュなし）
  return <>{children(variant)}</>;
}

/**
 * useABTest hook — Functional component用
 *
 * 使用例:
 * ```tsx
 * function MyComponent() {
 *   const variant = useABTest('hero-cta', ['blue', 'green']);
 *   return variant === 'blue' ? <BlueButton /> : <GreenButton />;
 * }
 * ```
 */
export function useABTest(
  testId: string,
  variants: string[],
  weights?: number[],
): string {
  const [variant, setVariant] = useState<string>(variants[0]);

  useEffect(() => {
    const test: ABTest = { id: testId, variants, weights };
    const assignedVariant = getVariant(test);
    setVariant(assignedVariant);
  }, [testId, variants, weights]);

  return variant;
}

/**
 * useABTestConversion hook — コンバージョン追跡
 *
 * 使用例:
 * ```tsx
 * function CheckoutButton() {
 *   const trackConversionClick = useABTestConversion('hero-cta');
 *
 *   return (
 *     <button onClick={() => {
 *       trackConversionClick();
 *       // ... proceed with checkout
 *     }}>
 *       Purchase
 *     </button>
 *   );
 * }
 * ```
 */
export function useABTestConversion(testId: string) {
  return (value?: number) => {
    trackConversion(testId, value);
  };
}
