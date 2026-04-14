import {describe, it, expect, vi} from 'vitest';
import {safeInitErrorReporter, extractFirstNonce} from './hydration-safety';

describe('safeInitErrorReporter (M2-NEONATAL-01 regression guard)', () => {
  it('returns ok=true when init succeeds', () => {
    const init = vi.fn();
    const result = safeInitErrorReporter(init, null);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(init).toHaveBeenCalledOnce();
  });

  it('catches thrown Error and records to diagnostics', () => {
    const err = new Error('sendBeacon is not a function');
    const init = vi.fn(() => {
      throw err;
    });
    const setItem = vi.fn();
    const result = safeInitErrorReporter(init, {setItem});
    expect(result.ok).toBe(false);
    expect(result.error).toBe(err);
    expect(setItem).toHaveBeenCalledWith(
      '__astromeda_init_error__',
      'sendBeacon is not a function',
    );
  });

  it('coerces non-Error throws into Error', () => {
    const init = vi.fn(() => {
      // 文字列を throw する異常ケース
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'string crash';
    });
    const setItem = vi.fn();
    const result = safeInitErrorReporter(init, {setItem});
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('string crash');
    expect(setItem).toHaveBeenCalledWith(
      '__astromeda_init_error__',
      'string crash',
    );
  });

  it('swallows diagnostics.setItem failure without bubbling up', () => {
    const init = vi.fn(() => {
      throw new Error('primary failure');
    });
    const brokenDiagnostics = {
      setItem: vi.fn(() => {
        throw new Error('localStorage quota exceeded');
      }),
    };
    // 二次障害が起きても呼び出し元には漏らさない
    expect(() =>
      safeInitErrorReporter(init, brokenDiagnostics),
    ).not.toThrow();
  });

  it('works when diagnostics is null or undefined', () => {
    const init = vi.fn(() => {
      throw new Error('boom');
    });
    expect(() => safeInitErrorReporter(init, null)).not.toThrow();
    expect(() => safeInitErrorReporter(init, undefined)).not.toThrow();
  });

  it('calls logger on failure when provided', () => {
    const logger = vi.fn();
    const err = new Error('log me');
    safeInitErrorReporter(() => {
      throw err;
    }, null, logger);
    expect(logger).toHaveBeenCalledOnce();
    expect(logger).toHaveBeenCalledWith(expect.any(String), err);
  });

  it('swallows logger failure without bubbling up', () => {
    const brokenLogger = vi.fn(() => {
      throw new Error('console is broken');
    });
    expect(() =>
      safeInitErrorReporter(
        () => {
          throw new Error('primary');
        },
        null,
        brokenLogger,
      ),
    ).not.toThrow();
  });
});

describe('extractFirstNonce (M2-NEONATAL-02 regression guard)', () => {
  it('returns nonce of first script when single element', () => {
    const scripts = [{nonce: 'abc123'}];
    expect(extractFirstNonce(scripts)).toBe('abc123');
  });

  it('skips scripts without nonce and finds the first one with nonce', () => {
    const scripts = [
      {nonce: ''}, // empty string = falsy, skip
      {}, // no nonce property
      {nonce: undefined},
      {nonce: 'hydrogen-nonce-xyz'},
      {nonce: 'later-nonce-should-not-win'},
    ];
    expect(extractFirstNonce(scripts)).toBe('hydrogen-nonce-xyz');
  });

  it('returns undefined when no scripts', () => {
    expect(extractFirstNonce([])).toBeUndefined();
  });

  it('returns undefined when no script has a nonce', () => {
    const scripts = [{}, {nonce: ''}, {nonce: undefined}];
    expect(extractFirstNonce(scripts)).toBeUndefined();
  });

  it('tolerates HTMLCollection-like object (length + index access)', () => {
    // 実際の document.getElementsByTagName が返す HTMLCollection を模倣
    const htmlCollectionLike: ArrayLike<{nonce?: string}> = {
      length: 3,
      0: {nonce: ''},
      1: {nonce: 'third-party-no-nonce'},
      2: {nonce: 'target-nonce'},
    };
    // 先頭にサードパーティが挿入されても正しく nonce を拾えること
    expect(extractFirstNonce(htmlCollectionLike)).toBe('third-party-no-nonce');
  });

  it('handles sparse array-like without crashing', () => {
    const scripts: ArrayLike<{nonce?: string}> = {
      length: 2,
      0: undefined as unknown as {nonce?: string},
      1: {nonce: 'only-valid'},
    };
    expect(extractFirstNonce(scripts)).toBe('only-valid');
  });
});
