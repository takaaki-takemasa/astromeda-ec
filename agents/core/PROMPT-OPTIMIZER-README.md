# G-041: Prompt Auto-Optimization Engine (シナプス可塑性)

## Overview

The **Prompt Auto-Optimization Engine** is a sophisticated system for automatically improving AI prompts based on real-world performance data and feedback. It embodies the medical metaphor of **Synaptic Plasticity** — the ability of neural connections to strengthen and adapt based on usage patterns.

Just as repeated neural stimulation strengthens synaptic connections, this engine enables prompts to evolve and improve through:
- **Performance tracking** (success rate, latency, quality)
- **Statistical analysis** (t-tests, effect size measurement)
- **A/B testing** (comparing prompt variants)
- **Automated optimization** (generating improved variants)
- **Version control** (optimization history, rollback capability)

## Architecture

### Core Components

#### 1. **PromptPerformanceMetrics**
Tracks execution results for a single prompt invocation:
```typescript
{
  promptId: string;           // Unique prompt identifier
  timestamp: number;          // When recorded
  successRate: number;        // 0-1, percentage of successful outputs
  avgLatencyMs: number;       // Average response time
  qualityScore: number;       // 0-1, subjective quality rating
  tokenUsage: number;         // Input + output tokens
  sampleSize: number;         // Number of evaluations
}
```

#### 2. **PromptVariant**
A generated improvement to an existing prompt:
```typescript
{
  id: string;                 // Unique variant ID with timestamp
  parentPromptId: string;     // Original prompt being improved
  content: string;            // The optimized prompt text
  strategy: Strategy;         // How it was generated
  createdAt: number;          // Timestamp
  performance?: Metrics;      // Optional: test results
}
```

**Strategies:**
- `conciseness` — Reduce token count while preserving meaning
- `specificity` — Add detailed constraints and examples
- `chain_of_thought` — Explicitly request step-by-step reasoning
- `few_shot` — Add concrete examples to guide output
- `hybrid` — Combine multiple strategies

#### 3. **ABTestResult**
Statistical comparison between two prompt variants:
```typescript
{
  promptIdA: string;
  promptIdB: string;
  winner: string;             // Which prompt variant performed better
  confidence: number;         // 1 - p-value (higher = more significant)
  effectSize: number;         // Cohen's d (0.2=small, 0.5=medium, 0.8=large)
  sampleSizeA: number;
  sampleSizeB: number;
  meanA: number;
  meanB: number;
  statistic: 'tTest' | 'ratio';
  timestamp: number;
}
```

#### 4. **OptimizationRecord**
History entry when an improvement is applied:
```typescript
{
  promptId: string;
  timestamp: number;
  variantApplied: string;     // Which variant was chosen
  oldContent: string;         // Previous prompt
  newContent: string;         // New prompt
  reason: string;             // Why this optimization was applied
  performanceDeltaPercent: number; // % improvement
}
```

## API Reference

### PromptOptimizer Class

#### `trackPerformance(promptId, metrics)`
Record execution results for a prompt.

```typescript
optimizer.trackPerformance('prompt-product-descriptions', {
  successRate: 0.92,
  avgLatencyMs: 1200,
  qualityScore: 0.88,
  tokenUsage: 250,
  sampleSize: 50,
});
```

#### `analyzePerformance(promptId)`
Generate statistical analysis with recommendations.

```typescript
const analysis = optimizer.analyzePerformance('prompt-product-descriptions');
// Returns:
// {
//   totalExecutions: 50,
//   successRate: 0.92,
//   avgLatencyMs: 1200,
//   avgQualityScore: 0.88,
//   convergence: {
//     isConverged: true,
//     coefficientOfVariation: 8.5  // < 15% = good convergence
//   },
//   recommendations: [
//     'パフォーマンスが安定しているため、さらなる最適化は不要です'
//   ]
// }
```

**Recommendations generated:**
- Low success rate (< 70%) → Suggest `specificity` strategy
- High latency (> 2000ms) → Suggest `conciseness` strategy
- Low quality score (< 0.6) → Suggest `chain_of_thought` strategy
- High quality variance (CV > 25%) → Suggest `few_shot` strategy

#### `generateVariant(promptId, parentContent, strategy)`
Create an optimized version of a prompt.

```typescript
// Reduce token count
const conciseVariant = await optimizer.generateVariant(
  'prompt-product-descriptions',
  basePrompt,
  'conciseness'
);

// Add reasoning steps
const reasoningVariant = await optimizer.generateVariant(
  'prompt-product-descriptions',
  basePrompt,
  'chain_of_thought'
);

// Combine multiple strategies
const hybridVariant = await optimizer.generateVariant(
  'prompt-product-descriptions',
  basePrompt,
  'hybrid'
);
```

#### `runABTest(promptIdA, promptIdB, sampleSize)`
Statistically compare two prompts. Requires at least `sampleSize/2` executions for each.

```typescript
const result = await optimizer.runABTest(
  'variant-a',
  'variant-b',
  50  // Analyze last 25 samples from each
);

// Returns:
// {
//   winner: 'variant-a',
//   confidence: 0.98,        // 98% confidence in result
//   effectSize: 0.65,        // Medium effect
//   meanA: 0.89,
//   meanB: 0.75,
//   ...
// }
```

**Statistical Method:** Welch's t-test
- **Significant difference** (p < 0.05): Winner with highest mean
- **No significant difference**: Winner by mean value

#### `applyOptimization(promptId, variantId, currentContent)`
Apply a winning variant to production.

```typescript
const optimization = optimizer.applyOptimization(
  'prompt-product-descriptions',
  'variant-a_conciseness_xyz',
  oldPromptContent
);

// Stores in history:
// {
//   promptId: 'prompt-product-descriptions',
//   variantApplied: 'variant-a_conciseness_xyz',
//   oldContent: '...old prompt...',
//   newContent: '...new prompt...',
//   reason: 'A/B test winner (strategy: conciseness, delta: +8.5%)',
//   performanceDeltaPercent: 8.5
// }
```

#### `getOptimizationHistory(promptId)`
Retrieve all optimizations applied to a prompt.

```typescript
const history = optimizer.getOptimizationHistory('prompt-product-descriptions');
// Returns immutable array of OptimizationRecord[]
// Can track improvements over time
```

#### `rollback(promptId)`
Revert to the previous version if optimization caused regression.

```typescript
const rollback = optimizer.rollback('prompt-product-descriptions');
// Requires at least 2 optimizations in history
// Creates a new OptimizationRecord with reason: 'Manual rollback'
```

#### `getVariants(promptId)`
Retrieve all variants generated for a prompt.

```typescript
const variants = optimizer.getVariants('prompt-product-descriptions');
// Returns array of PromptVariant[]
// Includes all strategies, even if not yet tested
```

#### `getABTestResults(promptIdA?, promptIdB?)`
Retrieve A/B test history.

```typescript
// All tests
const allTests = optimizer.getABTestResults();

// Tests involving promptIdA
const testsA = optimizer.getABTestResults('variant-a');

// Tests between specific pair
const specific = optimizer.getABTestResults('variant-a', 'variant-b');
```

## Optimization Strategies Explained

### conciseness
Reduces token count by:
- Removing redundant phrases ("以下の通りです。", "以下の内容です。")
- Shortening lengthy descriptions
- Eliminating unnecessary modifiers ("非常に", "とても")

**When to use:** Latency is high (> 2000ms)

### specificity
Adds constraints and examples by:
- Explicitly listing error cases and edge conditions
- Requiring JSON output format
- Adding decision criteria

**When to use:** Success rate is low (< 70%)

### chain_of_thought
Enables step-by-step reasoning by:
- Requesting explicit reasoning steps
- Breaking complex decisions into stages
- Adding explicit evaluation criteria

**When to use:** Quality score is low (< 0.6)

### few_shot
Adds concrete examples by:
- Including good/bad example pairs
- Demonstrating expected output format
- Showing borderline cases

**When to use:** Quality variance is high (CV > 25%)

### hybrid
Combines multiple strategies intelligently:
1. Apply `conciseness` first
2. Add `specificity` constraints
3. Insert `chain_of_thought` steps
4. (Optional) Include `few_shot` examples

**When to use:** Multiple issues detected simultaneously

## Statistical Analysis

### Convergence Detection
Uses **Coefficient of Variation (CV)** to detect stability:
```
CV = (Standard Deviation / Mean) * 100

CV ≤ 15% → Converged (stable, ready for optimization)
CV > 15% → Not converged (collect more data)
```

### A/B Test Significance
Uses **Welch's t-test** for robust comparison:
- Assumes unequal variances
- Works with different sample sizes
- Returns p-value for significance judgment

**Interpretation:**
- p < 0.05 → Statistically significant difference
- p ≥ 0.05 → No significant difference (choose by mean)

### Effect Size
Uses **Cohen's d** to measure practical significance:
- d = 0.2 → Small effect
- d = 0.5 → Medium effect
- d = 0.8 → Large effect

Large effect size indicates the improvement is practical, not just statistically significant.

## Usage Examples

### Complete Optimization Workflow

```typescript
import { getPromptOptimizer } from './agents/core/prompt-optimizer.js';

const optimizer = getPromptOptimizer();
const promptId = 'product-description-generator';
const basePrompt = '...';

// Step 1: Collect performance data (in production)
for (let i = 0; i < 50; i++) {
  const result = await generateProductDescription(basePrompt);
  optimizer.trackPerformance(promptId, {
    successRate: result.isValid ? 1 : 0,
    avgLatencyMs: result.latency,
    qualityScore: result.quality, // 0-1 rating
    tokenUsage: result.tokens,
    sampleSize: 1,
  });
}

// Step 2: Analyze current performance
const analysis = optimizer.analyzePerformance(promptId);
console.log(`Success Rate: ${(analysis.successRate * 100).toFixed(1)}%`);
console.log(`Avg Latency: ${analysis.avgLatencyMs.toFixed(0)}ms`);
console.log(`Quality Score: ${analysis.avgQualityScore.toFixed(2)}`);
console.log(`Converged: ${analysis.convergence.isConverged}`);

if (!analysis.convergence.isConverged) {
  console.log('More data needed - CV is high');
  continue;
}

// Step 3: Generate variants based on recommendations
const variants = [];
for (const strategy of ['conciseness', 'specificity', 'chain_of_thought']) {
  const variant = await optimizer.generateVariant(promptId, basePrompt, strategy);
  variants.push(variant);
}

// Step 4: Test variants in parallel
const testResults = [];
for (const variant of variants) {
  for (let i = 0; i < 25; i++) {
    const result = await generateProductDescription(variant.content);
    optimizer.trackPerformance(variant.id, {
      successRate: result.isValid ? 1 : 0,
      avgLatencyMs: result.latency,
      qualityScore: result.quality,
      tokenUsage: result.tokens,
      sampleSize: 1,
    });
  }
}

// Step 5: Run A/B tests
const winner = variants[0];
for (let i = 1; i < variants.length; i++) {
  const result = await optimizer.runABTest(
    winner.id,
    variants[i].id,
    25
  );
  
  if (result && result.winner !== winner.id) {
    winner = variants[i];
  }
}

// Step 6: Apply winning variant
const optimization = optimizer.applyOptimization(
  promptId,
  winner.id,
  basePrompt
);

console.log(`
Applied optimization:
- Strategy: ${winner.strategy}
- Performance delta: ${optimization.performanceDeltaPercent.toFixed(1)}%
- New prompt: ${optimization.newContent.slice(0, 100)}...
`);

// Step 7: Monitor new performance
// Continue tracking to ensure improvement holds
```

### Monitoring for Regression

```typescript
// Track new performance after optimization
for (let i = 0; i < 50; i++) {
  const result = await generateProductDescription(newPrompt);
  optimizer.trackPerformance(promptId, {
    successRate: result.isValid ? 1 : 0,
    avgLatencyMs: result.latency,
    qualityScore: result.quality,
    tokenUsage: result.tokens,
    sampleSize: 1,
  });
}

const newAnalysis = optimizer.analyzePerformance(promptId);

if (newAnalysis.avgQualityScore < analysis.avgQualityScore - 0.1) {
  // Regression detected - rollback
  const rollback = optimizer.rollback(promptId);
  console.log(`Regression detected. Rolled back to: ${rollback.oldContent}`);
}
```

## Integration with AI Brain

The optimizer integrates with the **AI Brain** module for AI-assisted prompt generation (future enhancement):

```typescript
// When ANTHROPIC_API_KEY is configured, hybrid strategy can use Claude
const aiVariant = await optimizer.generateVariant(
  promptId,
  basePrompt,
  'hybrid',
  { useAI: true }  // Future: leverage AI brain for generation
);
```

## Singleton Pattern

The `PromptOptimizer` uses a singleton pattern for application-wide access:

```typescript
// First call creates instance
const optimizer1 = getPromptOptimizer();

// Subsequent calls return same instance
const optimizer2 = getPromptOptimizer();
console.log(optimizer1 === optimizer2); // true

// Reset if needed (typically for testing)
resetPromptOptimizer();
const optimizer3 = getPromptOptimizer();
console.log(optimizer1 === optimizer3); // false (new instance)
```

## Testing

Comprehensive test suite with **35 tests** covering:
- Performance tracking and accumulation
- Statistical analysis and recommendations
- Variant generation for all 5 strategies
- A/B test statistical significance
- Optimization application and history
- Rollback functionality
- Immutability of returned data
- Singleton pattern

Run tests:
```bash
npm test -- agents/core/__tests__/prompt-optimizer.test.ts
```

## Design Decisions

### 1. **Medical Metaphor**
The "Synaptic Plasticity" metaphor emphasizes that prompts, like neural connections, strengthen through use and feedback. This aligns with the Astromeda Agent System's medical framing.

### 2. **Pure TypeScript Implementation**
No external statistical libraries. Uses built-in functions from `statistical-engine` for:
- `coefficientOfVariation()` — Convergence detection
- `tTest()` — A/B test significance
- `cohenD()` — Effect size measurement

### 3. **Immutability**
All returned data is deep-copied to prevent accidental mutations affecting internal state.

### 4. **Stateless Strategy Functions**
Optimization strategies are pure functions that transform content. No side effects, easy to test and compose.

### 5. **Historical Audit Trail**
Every optimization is recorded with old/new content, reason, and performance delta. Enables:
- Rollback at any point
- Learning from past optimizations
- Compliance/audit trails

## Performance Characteristics

- **Memory:** O(n) where n = total executions tracked
- **Analysis:** O(n) statistical computation per prompt
- **A/B Test:** O(s) where s = sample size (typically 25-50)
- **Variant Generation:** O(length) text processing

All operations are synchronous except `generateVariant()` (async for AI integration).

## Future Enhancements

1. **AI-Powered Generation** — Use Claude API for intelligent variant creation
2. **Gradient-Based Optimization** — Backprop-like approach to identify prompt components
3. **Multi-Armed Bandit** — Thompson Sampling for faster winner detection
4. **Prompt Compression** — Automatic token reduction while preserving semantics
5. **Feedback Loop** — Learn from user satisfaction ratings
6. **A/B Test Sequencing** — Run tests in priority order based on potential impact

## References

- Statistical Engine: `agents/lib/validation/statistical-engine.ts`
- Prompt Templates: `agents/core/prompt-templates.ts`
- AI Brain: `agents/core/ai-brain.ts`
- Approval Queue: `agents/core/approval-queue.ts`
