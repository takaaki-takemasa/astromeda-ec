/**
 * M7-TEST-01: Static guard — prevent <style>{`...`}</style> pattern
 *
 * React 18 compares text nodes during hydration. Browser whitespace
 * normalization inside <style> tags can produce SSR/CSR mismatches
 * (React #425 → #418 → #423 cascade). The safe pattern is:
 *   <style dangerouslySetInnerHTML={{__html: `...`}} />
 *
 * This test ensures no new <style>{...}</style> patterns are introduced.
 */
import {describe, it, expect} from 'vitest';
import {execSync} from 'child_process';

describe('M7-TEST-01: No <style> children pattern', () => {
  it('should have zero <style>{...}</style> in app/ .tsx files', () => {
    let stdout = '';
    try {
      stdout = execSync(
        'grep -rl "<style>{" app/ --include="*.tsx" 2>/dev/null || true',
        {cwd: process.cwd(), encoding: 'utf-8'},
      );
    } catch {
      stdout = '';
    }
    const files = stdout.trim().split('\n').filter(Boolean);
    expect(files).toEqual([]);
  });

  it('entry.client.tsx componentStack should capture 3000+ chars', () => {
    const fs = require('fs');
    const src = fs.readFileSync('app/entry.client.tsx', 'utf-8');
    expect(src).toContain('substring(0, 3000)');
    expect(src).not.toContain('substring(0, 800)');
  });
});
