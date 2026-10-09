import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Olbrain } from '../src/core/olbrain';
import { ApiError, AuthenticationError, BillingError, NotFoundError, ValidationError } from '../src/core/exceptions';

const fetchMock = vi.fn();
global.fetch = fetchMock as any;
const reply = (status: number, body?: unknown, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300, status, statusText: 'x',
  json: async () => body, headers: { get: (k: string) => headers[k] ?? null },
});
const lastCall = () => fetchMock.mock.calls.at(-1)!;

beforeEach(() => { fetchMock.mockReset(); fetchMock.mockResolvedValue(reply(200, [])); });

describe('Olbrain', () => {
  it('needs exactly one credential, and keys must be ak_ keys', () => {
    expect(() => new Olbrain({} as any)).toThrow(ValidationError);
    expect(() => new Olbrain({ apiKey: 'ak_1', getIdToken: async () => 't' })).toThrow(ValidationError);
    expect(() => new Olbrain({ apiKey: 'sk_live_x' })).toThrow(ValidationError);
  });

  it('runs a workflow with a key against the dispatcher', async () => {
    fetchMock.mockResolvedValue(reply(202, { run_id: 'r-1', status: 'triggered' }));
    const out = await new Olbrain({ apiKey: 'ak_1' }).workflows.run('wf 1', { payload: { a: 1 }, variables: { v: 2 } });
    expect(out).toEqual({ runId: 'r-1', status: 'triggered' });
    const [url, init] = lastCall();
    expect(url).toBe('https://webhook.olbrain.com/api/workflows/wf%201/trigger');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer ak_1');
    expect(JSON.parse(init.body)).toEqual({ payload: { a: 1 }, variables: { v: 2 } });
  });

  it('asks for a fresh sign-in token on every request', async () => {
    const getIdToken = vi.fn().mockResolvedValueOnce('t1').mockResolvedValueOnce('t2');
    const olbrain = new Olbrain({ getIdToken, baseUrl: 'https://dispatcher.test/' });
    await olbrain.runs.list('wf', { status: 'needs_review', limit: 5 });
    expect(lastCall()[0]).toBe('https://dispatcher.test/api/agents/wf/runs?limit=5&status=needs_review');
    expect(lastCall()[1].headers.Authorization).toBe('Bearer t1');
    await olbrain.runs.get('wf', 'r/1');
    expect(lastCall()[0]).toBe('https://dispatcher.test/api/agents/wf/runs/r%2F1');
    expect(lastCall()[1].headers.Authorization).toBe('Bearer t2');
  });

  it('controls runs and handles approvals', async () => {
    const olbrain = new Olbrain({ apiKey: 'ak_1' });
    for (const verb of ['cancel', 'pause', 'retry', 'resume'] as const) {
      await olbrain.runs[verb]('wf', 'r1');
      expect(lastCall()[0]).toBe(`https://webhook.olbrain.com/api/agents/wf/runs/r1/${verb}`);
      expect(lastCall()[1].method).toBe('POST');
    }
    await olbrain.approvals.list('wf', 'r1');
    expect(lastCall()[0]).toBe('https://webhook.olbrain.com/api/agents/wf/runs/r1/approvals');
    await olbrain.approvals.resolve('wf', 'r1', { exceptionId: 'e1', resolution: 'approved' });
    expect(JSON.parse(lastCall()[1].body)).toEqual({ exception_id: 'e1', resolution: 'approved' });
    await olbrain.approvals.resolve('wf', 'r1', { exceptionId: 'e1', resolution: 'modified', modifiedData: { amount: 9 } });
    expect(JSON.parse(lastCall()[1].body)).toEqual({ exception_id: 'e1', resolution: 'modified', modified_data: { amount: 9 } });
  });

  it.each([
    [402, 'insufficient_funds', BillingError],
    [503, 'billing_unavailable', BillingError],
    [401, 'unauthorized', AuthenticationError],
    [404, 'agent_not_found', NotFoundError],
    [400, 'invalid_resolution', ApiError],
    [403, 'version_pin_refused', ApiError],
  ])('maps %i %s to the right error', async (status, code, Type) => {
    fetchMock.mockResolvedValue(reply(status, { error: { code, message: 'nope' } }));
    const err = await new Olbrain({ apiKey: 'ak_1' }).runs.list('wf').catch((e) => e);
    expect(err).toBeInstanceOf(Type);
    if (err instanceof ApiError) expect(err.code).toBe(code);
  });

  it('keeps the reason from a runtime {detail} body and survives an empty body', async () => {
    const olbrain = new Olbrain({ apiKey: 'ak_1' });
    fetchMock.mockResolvedValue(reply(400, { detail: 'Workflow must be active' }));
    let err = await olbrain.runs.list('wf').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('Workflow must be active');

    fetchMock.mockResolvedValue(reply(409, { detail: { code: 'x', message: 'y' } }));
    err = await olbrain.runs.list('wf').catch((e) => e);
    expect([err.status, err.code, err.message]).toEqual([409, 'x', 'y']);

    fetchMock.mockResolvedValue(reply(502, undefined));
    err = await olbrain.runs.list('wf').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('error');
  });
});

describe('Olbrain transport', () => {
  it('keeps the upstream detail on ApiError so structured 409s survive', async () => {
    const detail = { error: 'subject_invalid', message: 'Add a subject first', fields: ['subject'] };
    fetchMock.mockResolvedValue(reply(409, { detail }));
    const err = await new Olbrain({ apiKey: 'ak_1' }).runs.get('wf', 'r1').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toBe('Add a subject first');
    expect(err.detail).toEqual(detail);
  });
});
