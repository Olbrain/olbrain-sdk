import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_MS, IDLE_MS, KEEP, poll, watchSteps } from '../src/core/researchLive';

const setHidden = (hidden: boolean) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });

describe('poll', () => {
  beforeEach(() => { vi.useFakeTimers(); setHidden(false); });
  afterEach(() => { vi.useRealTimers(); setHidden(false); });

  it('reads at once, then calls back only when the etag changes', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce({ etag: 'a', data: 1 })
      .mockResolvedValueOnce({ etag: 'a', data: 1 })
      .mockResolvedValue({ etag: 'b', data: 2 });
    const cb = vi.fn();
    const stop = poll(read, cb, null);
    await vi.advanceTimersByTimeAsync(0);
    expect(cb.mock.calls).toEqual([[1]]);
    await vi.advanceTimersByTimeAsync(ACTIVE_MS);
    expect(cb).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(ACTIVE_MS);
    expect(cb.mock.calls).toEqual([[1], [2]]);
    stop();
  });

  it('polls every 2 s while active and every 10 s when idle', async () => {
    const read = vi.fn().mockResolvedValue({ etag: 'a', data: 1 });
    const sub = poll(read, vi.fn(), null);
    await vi.advanceTimersByTimeAsync(ACTIVE_MS * 2);
    expect(read).toHaveBeenCalledTimes(3);
    sub.setActive(false);
    await vi.advanceTimersByTimeAsync(ACTIVE_MS);   // the timer already set at 2 s fires once more
    const n = read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1);
    expect(read).toHaveBeenCalledTimes(n);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(n + 1);
    sub();
  });

  it('does not read while the tab is hidden', async () => {
    setHidden(true);
    const read = vi.fn().mockResolvedValue({ etag: 'a', data: 1 });
    const sub = poll(read, vi.fn(), null);
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(read).not.toHaveBeenCalled();
    setHidden(false);
    await vi.advanceTimersByTimeAsync(ACTIVE_MS);
    expect(read).toHaveBeenCalled();
    sub();
  });

  it('an expired token degrades once, keeps polling, and recovers even to unchanged data', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce({ etag: 'a', data: 'doc' })
      .mockRejectedValueOnce(new Error('401'))
      .mockRejectedValueOnce(new Error('401'))
      .mockResolvedValue({ etag: 'a', data: 'doc' });
    const cb = vi.fn();
    const sub = poll(read, cb, null);
    await vi.advanceTimersByTimeAsync(ACTIVE_MS * 3);
    expect(cb.mock.calls).toEqual([['doc'], [null], ['doc']]);
    sub();
  });

  it('KEEP holds the last value on error', async () => {
    const read = vi.fn().mockResolvedValueOnce({ etag: 'a', data: [1] }).mockRejectedValue(new Error('x'));
    const cb = vi.fn();
    const sub = poll(read, cb, KEEP);
    await vi.advanceTimersByTimeAsync(ACTIVE_MS * 2);
    expect(cb.mock.calls).toEqual([[[1]]]);
    sub();
  });

  it('a refresh during an in-flight read re-reads right after it, not 2 s later', async () => {
    let release!: (v: { etag: string; data: number }) => void;
    const read = vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { release = r; }))
      .mockResolvedValue({ etag: 'b', data: 2 });
    const cb = vi.fn();
    const sub = poll(read, cb, null);
    await vi.advanceTimersByTimeAsync(0);
    sub.refresh();
    release({ etag: 'a', data: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls).toEqual([[1], [2]]);
    sub();
  });

  it('stops reading after unsubscribe', async () => {
    const read = vi.fn().mockResolvedValue({ etag: 'a', data: 1 });
    const sub = poll(read, vi.fn(), null);
    await vi.advanceTimersByTimeAsync(0);
    sub();
    await vi.advanceTimersByTimeAsync(IDLE_MS * 2);
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('watchSteps', () => {
  const stream = (...frames: unknown[]) => ({
    body: new ReadableStream<Uint8Array>({
      start(c) {
        const e = new TextEncoder();
        frames.forEach((f) => c.enqueue(e.encode(`data: ${JSON.stringify(f)}\n\n`)));
        c.close();
      },
    }),
  }) as unknown as Response;

  it('accumulates steps, reconnects from the cursor, and stops at end', async () => {
    const open = vi.fn()
      .mockResolvedValueOnce(stream({ type: 'step', step: { id: 'a' }, cursor: '1.000000000' }, { type: 'step', step: { id: 'b' }, cursor: '2.000000000' }, { type: 'reconnect', cursor: '2.000000000' }))
      .mockResolvedValueOnce(stream({ type: 'step', step: { id: 'c' }, cursor: '3.000000000' }, { type: 'end', cursor: '3.000000000' }));
    const cb = vi.fn();
    watchSteps(open, cb);
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(cb).toHaveBeenLastCalledWith([{ id: 'a' }, { id: 'b' }, { id: 'c' }]));
    expect(open.mock.calls.map((c) => c[0])).toEqual([null, '2.000000000']);
    await new Promise((r) => setTimeout(r, 20));
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('reports no steps once, then retries with backoff after a refusal', async () => {
    vi.useFakeTimers();
    const open = vi.fn().mockRejectedValueOnce(new Error('404')).mockResolvedValue(stream({ type: 'end', cursor: null }));
    const cb = vi.fn();
    watchSteps(open, cb);
    await vi.advanceTimersByTimeAsync(0);
    expect(cb.mock.calls).toEqual([[[]]]);
    expect(open).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(open).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('unsubscribing aborts the open stream', async () => {
    let signal!: AbortSignal;
    const open = vi.fn((_after: string | null, s: AbortSignal) => { signal = s; return new Promise<Response>(() => {}); });
    const stop = watchSteps(open, vi.fn());
    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    stop();
    expect(signal.aborted).toBe(true);
  });
});
