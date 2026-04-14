/**
 * Error Reporter regression tests
 *
 * M4-CARDIAC-03: fetch fallback must check response.ok
 *   - 5xx → re-queue (treated as throw)
 *   - 4xx → drop batch (no re-queue)
 *   - 2xx → success
 *
 * M4-CARDIAC-06: flush() must not spin forever under persistent failure.
 *   - Max iterations bound
 *   - Break on no-progress
 */
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {reportError, flush, reset, getState} from './error-reporter';

// jsdom-free test: stub the minimal window/navigator surface we touch.
function installBrowserGlobals(options: {sendBeacon?: boolean} = {}) {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const win: Record<string, unknown> = {
    location: {href: 'https://test.local/'},
    setInterval: (() => 0) as unknown,
    clearInterval: (() => undefined) as unknown,
    addEventListener: (name: string, fn: (e: unknown) => void) => {
      const arr = listeners.get(name) ?? [];
      arr.push(fn);
      listeners.set(name, arr);
    },
    removeEventListener: () => undefined,
  };
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', {
    userAgent: 'test-agent',
    onLine: true,
    sendBeacon: options.sendBeacon ? () => true : undefined,
  });
  return {listeners};
}

function clearBrowserGlobals() {
  // vi.unstubAllGlobals in afterEach handles cleanup
}

describe('error-reporter M4-CARDIAC-03 (response.ok handling)', () => {
  beforeEach(() => {
    installBrowserGlobals({sendBeacon: false});
    reset();
  });
  afterEach(() => {
    reset();
    clearBrowserGlobals();
    vi.unstubAllGlobals();
  });

  it('re-queues the batch when fetch returns 500', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('down', {status: 500}),
    );
    vi.stubGlobal('fetch', fetchMock);

    reportError(new Error('boom'));
    // Force flush one cycle by invoking flush() once — queue should come back.
    // We use a manual single pass via reportError+flushErrors path through flush().
    await flush();

    // After a persistent 500, flush breaks on no-progress but the error stays queued.
    expect(fetchMock).toHaveBeenCalled();
    expect(getState().queueLength).toBeGreaterThanOrEqual(1);
  });

  it('drops the batch on 4xx (no re-queue)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('bad', {status: 400}),
    );
    vi.stubGlobal('fetch', fetchMock);

    reportError(new Error('bad-payload'));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getState().queueLength).toBe(0);
  });

  it('clears queue on 2xx success', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('ok', {status: 200}),
    );
    vi.stubGlobal('fetch', fetchMock);

    reportError(new Error('one-off'));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getState().queueLength).toBe(0);
  });
});

describe('error-reporter M4-CARDIAC-06 (flush loop bound)', () => {
  beforeEach(() => {
    installBrowserGlobals({sendBeacon: false});
    reset();
  });
  afterEach(() => {
    reset();
    clearBrowserGlobals();
    vi.unstubAllGlobals();
  });

  it('returns within finite iterations when fetch always throws', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    reportError(new Error('err-a'));
    reportError(new Error('err-b'));

    const start = Date.now();
    await flush();
    const elapsed = Date.now() - start;

    // Without the break-on-no-progress guard this would spin forever.
    // We expect at most a handful of iterations (not 20) because no progress → break.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(5);
    expect(elapsed).toBeLessThan(2000);
    // Errors stay in queue for next cycle (not lost)
    expect(getState().queueLength).toBeGreaterThanOrEqual(1);
  });

  it('returns immediately when queue is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
