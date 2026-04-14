/**
 * ReviewStars regression test
 *
 * M5-NEURAL-01 (2026-04-10): Star ID generation must be SSR-deterministic.
 * Math.random() in render path causes React hydration error #418.
 * The fix uses React.useId() which produces stable IDs across SSR/CSR.
 *
 * This is a static-source guard. We don't render the component (jsdom-free
 * convention in this repo); we verify the source file no longer contains
 * the hazardous pattern, so a future edit re-introducing it fails CI.
 */
import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(__dirname, 'ReviewStars.tsx'), 'utf8');

describe('ReviewStars M5-NEURAL-01 (hydration-safe id generation)', () => {
  it('does not call Math.random() in render path', () => {
    // Permit Math.random in comments only — strip block + line comments first.
    const stripped = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(
      /\/\/.*$/gm,
      '',
    );
    expect(stripped).not.toMatch(/Math\.random/);
  });

  it('imports useId from react', () => {
    expect(SOURCE).toMatch(/from ['"]react['"]/);
    expect(SOURCE).toMatch(/useId/);
  });

  it('calls useId() inside the Star component', () => {
    // Ensure the hook lives in the Star function, not a stray top-level call.
    const starFn = SOURCE.match(/function Star\([^)]*\)\s*\{[\s\S]*?\n\}/);
    expect(starFn).not.toBeNull();
    expect(starFn![0]).toMatch(/useId\(\)/);
  });
});
