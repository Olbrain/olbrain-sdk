// @vitest-environment node
import { describe, expect, it, vi, afterEach } from 'vitest';
import { MessageStream } from '../src/core/streaming';

const sse = (...frames: object[]) =>
  new Response(frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });

afterEach(() => vi.unstubAllGlobals());

describe('MessageStream', () => {
  it('authenticates by header, delivers messages and skips control frames', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      sse({ type: 'connected', session_id: 's1' }, { type: 'ping' }, { role: 'assistant', content: 'hi', timestamp: 't1' }),
    ).mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const got: unknown[] = [];
    const stream = new MessageStream({ sessionId: 's1', apiKey: 'sk_x', agentId: 'a1', baseUrl: 'https://h' }, (m) => got.push(m));

    await stream.start();
    await vi.waitFor(() => expect(got).toHaveLength(1));
    stream.stop();

    expect(got[0]).toEqual({ role: 'assistant', content: 'hi', timestamp: 't1', metadata: undefined });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://h/sessions/s1/stream');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk_x', 'X-Agent-ID': 'a1' });
  });

  it('reports a refused stream and stops reconnecting once stopped', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response('no', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const errors: Error[] = [];
    const stream = new MessageStream({ sessionId: 's1', apiKey: 'sk_x', agentId: 'a1', baseUrl: 'https://h' }, () => {}, (e) => errors.push(e));

    await stream.start();
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0].message).toMatch(/HTTP 401/);
    stream.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
