/**
 * entry.client.tsx regression guard
 *
 * M6-NEURAL-01 (2026-04-10): Hydration mismatch (React #418) must be reported
 * to /api/errors in BOTH development and production so that the real component
 * stack can be traced. The previous implementation only console.warn'd in
 * development, which is blind in the Oxygen production environment.
 *
 * This is a static-source guard (jsdom-free, matches ReviewStars.test.ts
 * convention). We don't actually hydrate anything — we assert that the source
 * file still wires onRecoverableError through reportError with the correct
 * M6-NEURAL-01 marker so a future edit removing it will fail CI.
 */
import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(__dirname, 'entry.client.tsx'), 'utf8');

describe('entry.client M6-NEURAL-01 (production hydration diagnostics)', () => {
  it('imports reportError from error-reporter', () => {
    expect(SOURCE).toMatch(
      /import\s*\{[^}]*\breportError\b[^}]*\}\s*from\s*['"]~\/lib\/error-reporter['"]/,
    );
  });

  it('calls reportError inside onRecoverableError', () => {
    // Extract the onRecoverableError block and verify reportError is invoked
    // within it (not just imported at the top of the file).
    const onRecoverable = SOURCE.match(
      /onRecoverableError\s*:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\s{6}\},/,
    );
    expect(onRecoverable).not.toBeNull();
    expect(onRecoverable![0]).toMatch(/reportError\s*\(/);
  });

  it('tags hydration reports with M6-NEURAL-01 marker', () => {
    // The marker must be in the context passed to reportError so server-side
    // log filtering can isolate hydration mismatches from other errors.
    expect(SOURCE).toMatch(/marker\s*:\s*['"]M6-NEURAL-01['"]/);
  });

  it('passes componentStack into the report context', () => {
    // React 19 provides errorInfo.componentStack on the second argument.
    // Even if it is empty on React 18, the key must be present so we know to
    // check for it once the platform upgrades.
    expect(SOURCE).toMatch(/componentStack/);
  });

  it('wraps the reporter call in try/catch to protect hydration recovery', () => {
    // If reportError itself throws (e.g. sendBeacon unavailable), it must not
    // bubble out of onRecoverableError and break React's client fallback.
    const onRecoverable = SOURCE.match(
      /onRecoverableError\s*:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\s{6}\},/,
    );
    expect(onRecoverable).not.toBeNull();
    expect(onRecoverable![0]).toMatch(/try\s*\{/);
    expect(onRecoverable![0]).toMatch(/catch\s*\(/);
  });
});
