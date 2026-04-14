# G-041 Prompt Auto-Optimization Engine — Integration Guide

## Quick Start (5 minutes)

### 1. Import the Optimizer
```typescript
import { getPromptOptimizer } from './agents/core/prompt-optimizer.js';

const optimizer = getPromptOptimizer();
```

### 2. Track Performance
After executing a prompt, record the result:
```typescript
optimizer.trackPerformance('my-prompt-id', {
  successRate: 0.9,        // Did it succeed? (0-1)
  avgLatencyMs: 1200,      // How fast? (milliseconds)
  qualityScore: 0.85,      // How good? (0-1, your rating)
  tokenUsage: 250,         // Token cost
  sampleSize: 1,           // Usually 1 per execution
});
```

### 3. Analyze Performance
After collecting ~50 samples, check if it's ready for optimization:
```typescript
const analysis = optimizer.analyzePerformance('my-prompt-id');

console.log(`Success Rate: ${(analysis.successRate * 100).toFixed(0)}%`);
console.log(`Converged: ${analysis.convergence.isConverged}`);
console.log(`Recommendations: ${analysis.recommendations.join(', ')}`);
```

**Don't optimize until converged = true!**

### 4. Generate Variants
Create improved versions:
```typescript
// Based on analysis recommendations
const variant1 = await optimizer.generateVariant(
  'my-prompt-id',
  currentPromptContent,
  'conciseness'        // or: specificity, chain_of_thought, few_shot, hybrid
);

console.log(`Generated: ${variant1.id}`);
console.log(`New content: ${variant1.content}`);
```

### 5. Test Variants
Run each variant 25-30 times and track results:
```typescript
for (let i = 0; i < 25; i++) {
  const result = await executePrompt(variant1.content);
  optimizer.trackPerformance(variant1.id, {
    successRate: result.success ? 1 : 0,
    avgLatencyMs: result.latency,
    qualityScore: result.quality,
    tokenUsage: result.tokens,
    sampleSize: 1,
  });
}
```

### 6. Compare with A/B Test
Statistically determine which is better:
```typescript
const result = await optimizer.runABTest(
  'my-prompt-id',  // Original
  variant1.id,     // Variant to test
  25               // Sample size per variant
);

if (result) {
  console.log(`Winner: ${result.winner}`);
  console.log(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  console.log(`Effect size: ${result.effectSize.toFixed(2)}`);
}
```

### 7. Apply Winner
Deploy the winning variant:
```typescript
const optimization = optimizer.applyOptimization(
  'my-prompt-id',
  result.winner,       // variant ID
  currentPromptContent // old prompt
);

console.log(`Applied! Delta: ${optimization.performanceDeltaPercent.toFixed(1)}%`);
// Update your production prompt to: optimization.newContent
```

### 8. Monitor & Rollback if Needed
```typescript
// Continue tracking new prompt performance
// ...after 25-50 samples...

const newAnalysis = optimizer.analyzePerformance('my-prompt-id');

// If regression detected:
if (newAnalysis.avgQualityScore < oldQuality - 0.1) {
  optimizer.rollback('my-prompt-id');
  console.log('Rolled back to previous version');
}
```

## Integration Patterns

### Pattern 1: Automatic Optimization Loop (Per-Agent)

```typescript
// In your Agent class
private async runOptimizationCycle(): Promise<void> {
  const optimizer = getPromptOptimizer();
  const promptId = this.getPromptId();
  
  // Check if ready to optimize
  const analysis = optimizer.analyzePerformance(promptId);
  
  if (!analysis.convergence.isConverged) {
    this.log(`Waiting for convergence (CV=${analysis.convergence.coefficientOfVariation.toFixed(1)}%)`);
    return;
  }
  
  this.log(`Ready to optimize: ${analysis.recommendations.join(', ')}`);
  
  // Generate variants for recommended strategies
  const variants = [];
  for (const rec of analysis.recommendations) {
    const strategy = this.extractStrategy(rec); // 'conciseness', etc.
    if (strategy) {
      const variant = await optimizer.generateVariant(
        promptId,
        this.currentPrompt,
        strategy
      );
      variants.push(variant);
    }
  }
  
  // Test each variant
  for (const variant of variants) {
    for (let i = 0; i < 30; i++) {
      const result = await this.executePrompt(variant.content);
      optimizer.trackPerformance(variant.id, {
        successRate: result.success ? 1 : 0,
        avgLatencyMs: result.latency,
        qualityScore: await this.rateQuality(result),
        tokenUsage: result.tokens,
        sampleSize: 1,
      });
    }
  }
  
  // Find best variant
  let bestVariant = variants[0];
  for (let i = 1; i < variants.length; i++) {
    const result = await optimizer.runABTest(
      bestVariant.id,
      variants[i].id,
      30
    );
    if (result && result.winner === variants[i].id) {
      bestVariant = variants[i];
    }
  }
  
  // Apply best variant
  const opt = optimizer.applyOptimization(
    promptId,
    bestVariant.id,
    this.currentPrompt
  );
  
  this.log(`Optimization applied: ${opt.reason}`);
  this.currentPrompt = opt.newContent;
  
  // Request approval for significant improvements
  if (opt.performanceDeltaPercent > 5) {
    await this.requestApproval({
      title: 'Prompt Optimization Applied',
      description: `${bestVariant.strategy} strategy improved quality by ${opt.performanceDeltaPercent.toFixed(1)}%`,
      oldValue: opt.oldContent,
      newValue: opt.newContent,
    });
  }
}
```

### Pattern 2: Manual Optimization (Operations Dashboard)

```typescript
// In your admin API endpoint
app.post('/admin/agents/:agentId/optimize', async (req, res) => {
  const { agentId, strategy } = req.body; // strategy: 'conciseness', etc.
  const optimizer = getPromptOptimizer();
  const agent = await getAgent(agentId);
  
  // Generate variant
  const variant = await optimizer.generateVariant(
    `agent-${agentId}-prompt`,
    agent.currentPrompt,
    strategy
  );
  
  // Test it automatically
  const variants = [variant];
  for (let i = 0; i < 50; i++) {
    const result = await agent.executePrompt(variant.content);
    optimizer.trackPerformance(variant.id, {
      successRate: result.success ? 1 : 0,
      avgLatencyMs: result.latency,
      qualityScore: result.quality,
      tokenUsage: result.tokens,
      sampleSize: 1,
    });
  }
  
  const analysis = optimizer.analyzePerformance(variant.id);
  
  res.json({
    variantId: variant.id,
    strategy,
    performanceMetrics: {
      successRate: analysis.successRate,
      avgLatency: analysis.avgLatencyMs,
      quality: analysis.avgQualityScore,
    },
    recommendation: analysis.recommendations[0] || 'No further changes needed',
  });
});

// User can then approve: POST /admin/agents/:agentId/apply-optimization
app.post('/admin/agents/:agentId/apply-optimization', (req, res) => {
  const { variantId } = req.body;
  const optimizer = getPromptOptimizer();
  
  const opt = optimizer.applyOptimization(
    `agent-${agentId}-prompt`,
    variantId,
    agent.currentPrompt
  );
  
  if (opt) {
    agent.currentPrompt = opt.newContent;
    agent.save();
    res.json({ success: true, delta: opt.performanceDeltaPercent });
  }
});
```

### Pattern 3: Continuous Monitoring (Background Task)

```typescript
// Background job that runs hourly
setInterval(async () => {
  const optimizer = getPromptOptimizer();
  
  // Check all prompts in the system
  for (const promptId of getAllPromptIds()) {
    const analysis = optimizer.analyzePerformance(promptId);
    
    // Alert if regression detected
    if (analysis.avgQualityScore < 0.65) {
      await sendAlert({
        severity: 'warning',
        message: `${promptId} quality degraded to ${analysis.avgQualityScore.toFixed(2)}`,
        action: 'Review prompt or rollback recent optimization',
      });
    }
    
    // Log convergence status
    this.logger.info(`[${promptId}] CV=${analysis.convergence.coefficientOfVariation.toFixed(1)}%`);
    
    // Auto-optimize if converged and multiple issues
    if (analysis.convergence.isConverged && analysis.recommendations.length >= 2) {
      const variant = await optimizer.generateVariant(
        promptId,
        currentPrompts[promptId],
        'hybrid' // Use hybrid strategy
      );
      this.logger.info(`[${promptId}] Generated hybrid variant: ${variant.id}`);
    }
  }
}, 60 * 60 * 1000);
```

## Integration with Agent System Architecture

### Agent Lifecycle Integration

```
Agent Initialization
        ↓
[Phase 1] Collect baseline performance (50 samples)
        ↓
[Phase 2] Analyze convergence
        ↓
IF converged:
        ↓
[Phase 3] Generate variants (1-5 per strategy)
        ↓
[Phase 4] Test variants in parallel (25-30 each)
        ↓
[Phase 5] Run A/B tests
        ↓
[Phase 6] Apply best variant
        ↓
[Phase 7] Monitor for regression (ongoing)
        ↓
IF regression THEN rollback ELSE continue to Phase 1
```

### Data Flow

```
┌─ Production Prompt
│
├─ Execution Result
│  ├─ Success: boolean
│  ├─ Latency: ms
│  ├─ Quality: 0-1
│  └─ Tokens: number
│
├─ trackPerformance()
│  └─ PromptPerformanceMetrics[]
│
├─ analyzePerformance()
│  └─ PromptAnalysis
│
├─ Recommendations
│  └─ generateVariant() → Strategy
│
├─ Variant Testing
│  └─ trackPerformance(variant.id)
│
├─ runABTest()
│  └─ ABTestResult (winner)
│
└─ applyOptimization()
   └─ OptimizationRecord
      └─ Update production prompt
         └─ Continue monitoring
```

## Metrics to Track

### Per-Prompt Metrics
- `successRate` — Percentage of valid outputs (0-1)
- `avgLatencyMs` — P50 response time (milliseconds)
- `qualityScore` — Human/ML rating (0-1)
- `tokenUsage` — Sum of input + output tokens

### Quality Rating Examples
```typescript
// Subjective 0-1 scale:
0.0  = Completely invalid (syntax error, irrelevant response)
0.3  = Poor (low relevance, incomplete)
0.5  = Acceptable (meets minimum requirements)
0.7  = Good (clear, relevant, well-structured)
0.9  = Excellent (exceeds expectations, perfect)
1.0  = Perfect (exactly what was needed)

// Or based on objective criteria:
const quality = (
  (isRelevant ? 1 : 0) * 0.3 +
  (isComplete ? 1 : 0) * 0.3 +
  (isAccurate ? 1 : 0) * 0.4
);
```

## Convergence Criteria

**Ready to optimize when:**
- Sample size ≥ 50
- Coefficient of Variation (CV) ≤ 15%
- At least 3 consecutive samples with consistent trend

**Example:**
```
CV = 8.5% → Ready ✅
CV = 22% → Wait, collect more data ❌
```

## Common Pitfalls

### 1. ❌ Optimizing Too Early
```typescript
// WRONG: Only 10 samples
const analysis = optimizer.analyzePerformance('prompt-1');
if (analysis.totalExecutions === 10) {
  // Generate variants (too noisy!)
}

// RIGHT: Wait for convergence
if (analysis.convergence.isConverged) {
  // Generate variants (stable data)
}
```

### 2. ❌ Insufficient Test Samples
```typescript
// WRONG: Only 5 samples per variant
for (let i = 0; i < 5; i++) {
  optimizer.trackPerformance(variant.id, ...);
}
const result = await optimizer.runABTest(original, variant, 5);

// RIGHT: 25-30 samples per variant
for (let i = 0; i < 30; i++) {
  optimizer.trackPerformance(variant.id, ...);
}
const result = await optimizer.runABTest(original, variant, 30);
```

### 3. ❌ Not Monitoring After Optimization
```typescript
// WRONG: Set and forget
optimizer.applyOptimization(promptId, winnerVariantId, oldPrompt);
// ... stop tracking ...

// RIGHT: Continue monitoring
optimizer.applyOptimization(promptId, winnerVariantId, oldPrompt);
// ... keep tracking new variant ...
// ... check for regression after 25-50 samples ...
```

### 4. ❌ High Quality Variance Ignored
```typescript
// WRONG: Quality jumps 0.5-0.95 randomly
if (analysis.recommendations.length === 0) {
  // Consider it "good enough"
}

// RIGHT: Add examples (few_shot) to reduce variance
if (coefficientOfVariation(qualityScores) > 25) {
  const variant = await optimizer.generateVariant(
    promptId,
    currentPrompt,
    'few_shot' // Add concrete examples
  );
}
```

## Performance Expectations

| Operation | Time | Notes |
|-----------|------|-------|
| trackPerformance | O(1) | Constant time |
| analyzePerformance | O(n) | n = sample count (~50-100ms) |
| generateVariant | O(L) | L = prompt length (~10ms) |
| runABTest | O(s) | s = sample size (~50ms) |
| applyOptimization | O(1) | Constant time |
| rollback | O(1) | Constant time |

**Total optimization cycle:** ~5-10 seconds per variant (mostly network/execution overhead)

## Debugging

### Check Convergence Status
```typescript
const analysis = optimizer.analyzePerformance('my-prompt');
console.log(`
  Samples: ${analysis.totalExecutions}
  CV: ${analysis.convergence.coefficientOfVariation.toFixed(1)}%
  Converged: ${analysis.convergence.isConverged}
  Recommendations: ${analysis.recommendations}
`);
```

### Review Optimization History
```typescript
const history = optimizer.getOptimizationHistory('my-prompt');
for (const record of history) {
  console.log(`${new Date(record.timestamp).toISOString()} - ${record.strategy}`);
  console.log(`  Delta: ${record.performanceDeltaPercent.toFixed(1)}%`);
  console.log(`  Reason: ${record.reason}`);
}
```

### Inspect Variants
```typescript
const variants = optimizer.getVariants('my-prompt');
for (const variant of variants) {
  const metrics = optimizer.analyzePerformance(variant.id);
  console.log(`${variant.strategy}: quality=${metrics.avgQualityScore.toFixed(2)}`);
}
```

### View A/B Test Results
```typescript
const results = optimizer.getABTestResults();
for (const result of results) {
  console.log(`
    ${result.promptIdA} vs ${result.promptIdB}
    Winner: ${result.winner}
    Confidence: ${(result.confidence * 100).toFixed(0)}%
    Effect size: ${result.effectSize.toFixed(2)} (d)
  `);
}
```
