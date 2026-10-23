// @vitest-environment node
import { describe, expect, it, vi, afterEach } from 'vitest';
import { MessageStream } from '../src/core/streaming';

const page = (...messages: object[]) => new Response(JSON.stringify({ messages }), { headers: { 'Content-Type': 'application/json' } });
const config = { sessionId: 's1', apiKey: 'ak_x', agentId: 'a1', baseUrl: 'https://h' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('MessageStream', () => {
  it('polls the session messages and delivers only the ones that arrive after it starts', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(page({ message_id: 'm1', role: 'user', content: 'old', created_at: 't1' }))
      .mockResolvedValueOnce(page({ message_id: 'm2', role: 'assistant', content: 'hi', created_at: 't2' }))
      .mockResolvedValue(page());
    vi.stubGlobal('fetch', fetchMock);
    const got: unknown[] = [];
    const stream = new MessageStream(config, (m) => got.push(m));

    await stream.start();
    await vi.advanceTimersByTimeAsync(2_000);
    stream.stop();

    expect(got).toEqual([{ role: 'assistant', content: 'hi', timestamp: 't2', metadata: undefined }]);
    expect(fetchMock.mock.calls[0][0]).toBe('https://h/api/agents/a1/sessions/s1/messages?offset=0&limit=200');
    expect(fetchMock.mock.calls[1][0]).toBe('https://h/api/agents/a1/sessions/s1/messages?offset=1&limit=200');
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer ak_x' });
  });

  it('never delivers a message twice', async () => {
    vi.useFakeTimers();
    const m2 = { message_id: 'm2', role: 'assistant', content: 'hi', created_at: 't2' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(page()).mockResolvedValueOnce(page(m2)).mockResolvedValue(page(m2)));
    const got: unknown[] = [];
    const stream = new MessageStream(config, (m) => got.push(m));

    await stream.start();
    await vi.advanceTimersByTimeAsync(6_000);
    stream.stop();

    expect(got).toHaveLength(1);
  });

  it('reports a refused read and stops polling once stopped', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response('no', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const errors: Error[] = [];
    const stream = new MessageStream(config, () => {}, (e) => errors.push(e));

    await stream.start();
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0].message).toMatch(/HTTP 401/);
    stream.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
