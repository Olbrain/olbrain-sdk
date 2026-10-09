import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Olbrain } from '../src/core/olbrain';
import { ApiError } from '../src/core/exceptions';

const fetchMock = vi.fn();
global.fetch = fetchMock as any;
const reply = (status: number, body?: unknown) => ({
  ok: status >= 200 && status < 300, status, statusText: 'x',
  json: async () => body, headers: { get: () => null }, body: null,
});
const sse = (...frames: unknown[]) => ({
  ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => undefined,
  body: new ReadableStream<Uint8Array>({
    start(c) {
      const e = new TextEncoder();
      frames.forEach((f) => c.enqueue(e.encode(`data: ${JSON.stringify(f)}\n\n`)));
      c.close();
    },
  }),
});
const lastCall = () => fetchMock.mock.calls.at(-1)!;
const olbrain = () => new Olbrain({ getIdToken: async () => 'tok', baseUrl: 'https://w.test' });
const B = 'https://w.test/api/agents/ra%201/research';

beforeEach(() => { fetchMock.mockReset(); fetchMock.mockResolvedValue(reply(200, {})); });

describe('olbrain.research forwarded calls', () => {
  const R = () => olbrain().research;
  it.each([
    ['sessions.create', () => R().sessions.create('ra 1'), 'POST', `${B}/sessions`, undefined],
    ['sessions.list', () => R().sessions.list('ra 1', { includeArchived: true }), 'GET', `${B}/sessions?archived=true`, undefined],
    ['sessions.get', () => R().sessions.get('ra 1', 's/1'), 'GET', `${B}/sessions/s%2F1`, undefined],
    ['sessions.patch', () => R().sessions.patch('ra 1', 's1', { title: 'T' }), 'PATCH', `${B}/sessions/s1`, { title: 'T' }],
    ['sessions.delete', () => R().sessions.delete('ra 1', 's1'), 'DELETE', `${B}/sessions/s1`, undefined],
    ['sessions.models', () => R().sessions.models('ra 1', 's1'), 'GET', `${B}/sessions/s1/models`, undefined],
    ['sessions.setModel', () => R().sessions.setModel('ra 1', 's1', null), 'PUT', `${B}/sessions/s1/model`, { model: null }],
    ['sessions.setReviewModel', () => R().sessions.setReviewModel('ra 1', 's1', 'm'), 'PUT', `${B}/sessions/s1/review-model`, { model: 'm' }],
    ['plans.approve', () => R().plans.approve('ra 1', 's1', 'm1'), 'POST', `${B}/sessions/s1/messages/m1/approve-plan`, {}],
    ['plans.approveById', () => R().plans.approveById('ra 1', 's1', 'p1', { sections: [] }), 'POST', `${B}/sessions/s1/plans/p1/approve`, { sections: [] }],
    ['attachments.uploadUrl', () => R().attachments.uploadUrl('ra 1', 's1', 'a/b.pdf'), 'POST', `${B}/sessions/s1/attachment-url`, { storage_path: 'a/b.pdf' }],
    ['runs.cancel', () => R().runs.cancel('ra 1', 'r1'), 'POST', `${B}/runs/r1/cancel`, undefined],
    ['runs.retry', () => R().runs.retry('ra 1', 'r1'), 'POST', `${B}/runs/r1/retry`, undefined],
    ['runs.resolveClaims', () => R().runs.resolveClaims('ra 1', 'r1', [{ id: 'c1' }]), 'POST', `${B}/runs/r1/claims/resolve`, { resolutions: [{ id: 'c1' }] }],
    ['reports.get', () => R().reports.get('ra 1', 'r1', { version: 3 }), 'GET', `${B}/reports/r1?version=3`, undefined],
    ['reports.artifactUrl', () => R().reports.artifactUrl('ra 1', 'r1', 'deck_main', 'pdf'), 'GET', `${B}/reports/r1/artifacts/deck_main/pdf`, undefined],
    ['reports.evidence', () => R().reports.evidence('ra 1', 'r1'), 'GET', `${B}/reports/r1/evidence`, undefined],
    ['reports.share.get', () => R().reports.share.get('ra 1', 'r1'), 'GET', `${B}/reports/r1/share`, undefined],
    ['reports.share.set', () => R().reports.share.set('ra 1', 'r1', 'org'), 'PUT', `${B}/reports/r1/share`, { visibility: 'org' }],
    ['reports.share.revoke', () => R().reports.share.revoke('ra 1', 'r1'), 'POST', `${B}/reports/r1/share/revoke`, undefined],
    ['review.get', () => R().review.get('ra 1', 'r1'), 'GET', `${B}/reports/r1/review`, undefined],
    ['review.run', () => R().review.run('ra 1', 'r1'), 'POST', `${B}/runs/r1/review`, undefined],
    ['review.apply', () => R().review.apply('ra 1', 'r1', ['f1']), 'POST', `${B}/runs/r1/review/apply`, { finding_ids: ['f1'] }],
    ['templates.versions', () => R().templates.versions('ra 1'), 'GET', `${B}/versions`, undefined],
  ])('%s', async (_name, run, method, url, body) => {
    await run();
    const [u, init] = lastCall();
    expect(u).toBe(url);
    expect(init.method).toBe(method);
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.body === undefined ? undefined : JSON.parse(init.body)).toEqual(body);
  });

  it('activeJob unwraps {active}', async () => {
    fetchMock.mockResolvedValue(reply(200, { active: { job: 'j1' } }));
    expect(await R().runs.activeJob('ra 1', 'r1')).toEqual({ job: 'j1' });
    fetchMock.mockResolvedValue(reply(200, {}));
    expect(await R().runs.activeJob('ra 1', 'r1')).toBeNull();
    expect(lastCall()[0]).toBe(`${B}/runs/r1/active-job`);
  });

  it('attachments.add posts multipart without a JSON content type and returns the refs', async () => {
    fetchMock.mockResolvedValue(reply(200, { attachments: [{ attachment_id: 'a1' }] }));
    const out = await R().attachments.add('ra 1', 's1', [new Blob(['x'], { type: 'text/plain' })]);
    expect(out).toEqual([{ attachment_id: 'a1' }]);
    const [, init] = lastCall();
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('review.run outlives the default 30 s timeout', async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    fetchMock.mockImplementation((_u: string, init: RequestInit) => {
      signal = init.signal!;
      return new Promise((res) => setTimeout(() => res(reply(200, { ok: 1 })), 60_000));
    });
    const p = R().review.run('ra 1', 'r1');
    await vi.advanceTimersByTimeAsync(31_000);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(p).resolves.toEqual({ ok: 1 });
    vi.useRealTimers();
  });
});

describe('olbrain.research streams', () => {
  it('streamMessage posts the turn and yields research-runtime frames as they are', async () => {
    fetchMock.mockResolvedValue(sse({ type: 'text_delta', text: 'Hi' }, { type: 'complete', message_id: 'm2' }));
    const got: unknown[] = [];
    for await (const ev of olbrain().research.sessions.streamMessage('ra 1', 's1', { content: 'go', effort: 'low' })) got.push(ev);
    expect(got).toEqual([{ type: 'text_delta', text: 'Hi' }, { type: 'complete', message_id: 'm2' }]);
    const [u, init] = lastCall();
    expect(u).toBe(`${B}/sessions/s1/messages/stream`);
    expect(init.headers.Accept).toBe('text/event-stream');
    expect(JSON.parse(init.body)).toEqual({ content: 'go', effort: 'low' });
  });

  it('review.stream and streamApply hit their stream routes', async () => {
    fetchMock.mockResolvedValue(sse({ type: 'complete' }));
    for await (const _ of olbrain().research.review.stream('ra 1', 'r1')) { /* drain */ }
    expect(lastCall()[0]).toBe(`${B}/runs/r1/review/stream`);
    fetchMock.mockResolvedValue(sse({ type: 'complete' }));
    for await (const _ of olbrain().research.review.streamApply('ra 1', 'r1', ['f1'])) { /* drain */ }
    expect(lastCall()[0]).toBe(`${B}/runs/r1/review/apply/stream`);
    expect(JSON.parse(lastCall()[1].body)).toEqual({ finding_ids: ['f1'] });
  });

  it('a refused stream throws the mapped error on first read', async () => {
    fetchMock.mockResolvedValue(reply(409, { detail: 'A run is already in progress' }));
    const first = olbrain().research.sessions.streamMessage('ra 1', 's1', { content: 'go' }).next();
    await expect(first).rejects.toBeInstanceOf(ApiError);
    await expect(first).rejects.toMatchObject({ status: 409, message: 'A run is already in progress' });
  });

  it("stopping a turn aborts the underlying fetch", async () => {
    let signal!: AbortSignal;
    fetchMock.mockImplementation((_u: string, init: RequestInit) => { signal = init.signal!; return Promise.resolve(sse({ type: 'text_delta', text: 'a' })); });
    const stop = new AbortController();
    const it = olbrain().research.sessions.streamMessage('ra 1', 's1', { content: 'go' }, { signal: stop.signal });
    await it.next();
    stop.abort();
    expect(signal.aborted).toBe(true);
  });
});
