/**
 * Statistical Engine — Phase 7, G-035
 *
 * Pure TypeScript statistical functions (no external libraries)
 * Used for convergence analysis and data validation
 */

/**
 * Student's t-test (two-sample, independent)
 * Tests if means of two groups are significantly different
 *
 * @param a First sample
 * @param b Second sample
 * @returns t-statistic, p-value, degrees of freedom
 */
export function tTest(a: number[], b: number[]): {
  tStatistic: number;
  pValue: number;
  degreesOfFreedom: number;
} {
  if (a.length === 0 || b.length === 0) {
    throw new Error('Both samples must have at least one value');
  }

  // Calculate means
  const meanA = a.reduce((sum, val) => sum + val, 0) / a.length;
  const meanB = b.reduce((sum, val) => sum + val, 0) / b.length;

  // Calculate variances
  const varA =
    a.reduce((sum, val) => sum + Math.pow(val - meanA, 2), 0) / (a.length - 1 || 1);
  const varB =
    b.reduce((sum, val) => sum + Math.pow(val - meanB, 2), 0) / (b.length - 1 || 1);

  // Pooled standard error
  const se = Math.sqrt(varA / a.length + varB / b.length);
  if (se === 0) {
    return {
      tStatistic: 0,
      pValue: 1,
      degreesOfFreedom: a.length + b.length - 2,
    };
  }

  // t-statistic
  const tStatistic = (meanA - meanB) / se;

  // Degrees of freedom (Welch-Satterthwaite)
  const dfNum = Math.pow(varA / a.length + varB / b.length, 2);
  const dfDen =
    Math.pow(varA / a.length, 2) / (a.length - 1) +
    Math.pow(varB / b.length, 2) / (b.length - 1);
  const df = dfDen === 0 ? a.length + b.length - 2 : dfNum / dfDen;

  // Approximate p-value using normal distribution (for large df)
  const pValue = 2 * (1 - normCDF(Math.abs(tStatistic)));

  return {
    tStatistic,
    pValue,
    degreesOfFreedom: Math.round(df),
  };
}

/**
 * Cohen's d — effect size measure
 * Measures the standardized difference between two means
 * d = 0.2 (small), 0.5 (medium), 0.8 (large)
 *
 * @param a First sample
 * @param b Second sample
 * @returns Cohen's d effect size
 */
export function cohenD(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const meanA = a.reduce((sum, val) => sum + val, 0) / a.length;
  const meanB = b.reduce((sum, val) => sum + val, 0) / b.length;

  const varA =
    a.reduce((sum, val) => sum + Math.pow(val - meanA, 2), 0) / (a.length - 1 || 1);
  const varB =
    b.reduce((sum, val) => sum + Math.pow(val - meanB, 2), 0) / (b.length - 1 || 1);

  const pooledStdDev = Math.sqrt((varA + varB) / 2);

  if (pooledStdDev === 0) {
    return 0;
  }

  return (meanA - meanB) / pooledStdDev;
}

/**
 * Confidence interval for mean
 * @param data Sample data
 * @param alpha Significance level (default 0.05 = 95% CI)
 * @returns { lower, mean, upper }
 */
export function confidenceInterval(
  data: number[],
  alpha: number = 0.05,
): { lower: number; mean: number; upper: number } {
  if (data.length === 0) {
    return { lower: 0, mean: 0, upper: 0 };
  }

  const mean = data.reduce((sum, val) => sum + val, 0) / data.length;

  if (data.length === 1) {
    return { lower: mean, mean, upper: mean };
  }

  const variance =
    data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (data.length - 1);
  const stdDev = Math.sqrt(variance);
  const stdError = stdDev / Math.sqrt(data.length);

  // t-critical value (approximate for common alpha values)
  const tCritical = getTCritical(data.length - 1, alpha);

  const margin = tCritical * stdError;

  return {
    lower: mean - margin,
    mean,
    upper: mean + margin,
  };
}

/**
 * Coefficient of Variation — measures relative variability
 * CV = (stdDev / mean) * 100
 * Used for convergence: CV <= 15% is considered good convergence
 *
 * @param data Sample data
 * @returns CV as percentage
 */
export function coefficientOfVariation(data: number[]): number {
  if (data.length === 0 || data.length === 1) {
    return 0;
  }

  const mean = data.reduce((sum, val) => sum + val, 0) / data.length;

  if (Math.abs(mean) < 1e-10) {
    return 0;
  }

  const variance =
    data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (data.length - 1);
  const stdDev = Math.sqrt(variance);

  return (stdDev / Math.abs(mean)) * 100;
}

/**
 * CUSUM (Cumulative Sum Control Chart)
 * Detects shifts in process mean
 *
 * @param series Time series data
 * @returns { changePoints, trend }
 */
export function cusum(
  series: number[],
): {
  changePoints: number[];
  trend: 'up' | 'down' | 'stable';
} {
  if (series.length < 2) {
    return { changePoints: [], trend: 'stable' };
  }

  const mean = series.reduce((sum, val) => sum + val, 0) / series.length;
  const sigma = Math.sqrt(
    series.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / series.length,
  );

  if (sigma === 0) {
    return { changePoints: [], trend: 'stable' };
  }

  const threshold = 5 * sigma;
  let cusumPlus = 0;
  let cusumMinus = 0;
  const changePoints: number[] = [];

  for (let i = 0; i < series.length; i++) {
    const deviation = series[i] - mean;
    cusumPlus = Math.max(0, cusumPlus + deviation);
    cusumMinus = Math.min(0, cusumMinus + deviation);

    if (Math.abs(cusumPlus) > threshold || Math.abs(cusumMinus) > threshold) {
      changePoints.push(i);
      cusumPlus = 0;
      cusumMinus = 0;
    }
  }

  // Determine trend
  const lastHalf = series.slice(Math.floor(series.length / 2));
  const firstHalf = series.slice(0, Math.floor(series.length / 2));

  const lastMean = lastHalf.reduce((s, v) => s + v, 0) / lastHalf.length;
  const firstMean = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;

  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (lastMean > firstMean + sigma * 0.5) {
    trend = 'up';
  } else if (lastMean < firstMean - sigma * 0.5) {
    trend = 'down';
  }

  return { changePoints, trend };
}

/**
 * Normal distribution CDF
 * Uses approximation for reasonable accuracy
 */
function normCDF(z: number): number {
  // Approximation using error function
  const sign = z >= 0 ? 1 : -1;
  const abz = Math.abs(z);

  // Abramowitz and Stegun approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * abz);
  const y =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-abz * abz);

  return 0.5 * (1 + sign * y);
}

/**
 * t-critical value lookup (two-tailed)
 * Approximate for common alpha levels
 */
function getTCritical(df: number, alpha: number = 0.05): number {
  // Lookup table for common values
  const table: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
    8: 2.306, 9: 2.262, 10: 2.228, 15: 2.131, 20: 2.086, 25: 2.06, 30: 2.042,
    40: 2.021, 60: 2.0, 120: 1.98, 9999: 1.96,
  };

  // Find closest value
  const dfs = Object.keys(table).map(Number).sort((a, b) => a - b);
  for (const d of dfs) {
    if (d >= df) {
      return table[d] || 1.96;
    }
  }

  return 1.96; // Default for very large df
}

/**
 * Basic descriptive statistics
 */
export function descriptiveStats(data: number[]): {
  count: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
} {
  if (data.length === 0) {
    return {
      count: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      q1: 0,
      q3: 0,
    };
  }

  const sorted = [...data].sort((a, b) => a - b);
  const mean = data.reduce((s, v) => s + v, 0) / data.length;
  const variance =
    data.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / Math.max(data.length - 1, 1);

  return {
    count: data.length,
    mean,
    median: sorted[Math.floor(sorted.length / 2)],
    stdDev: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    q1: sorted[Math.floor(sorted.length / 4)],
    q3: sorted[Math.floor((sorted.length * 3) / 4)],
  };
}
