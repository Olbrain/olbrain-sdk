/**
 * olbrain.research — the research console over the Agent API
 * (olbrain-sdk spec 2026-10-09). Names mirror olbrain-noesis-os
 * src/services/research/*, so a screen ported from Noesis swaps imports, not
 * logic. Every call takes the research agent's id first (== its template id).
 */
import { readSse } from './sse';
import { KEEP, poll, watchSteps } from './researchLive';
import type { LiveSubscription } from './researchLive';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ResearchTransport {
  request<T>(method: Method, path: string, body?: unknown, opts?: { timeoutMs?: number }): Promise<T>;
  stream(method: Method, path: string, body: unknown, signal?: AbortSignal): Promise<Response>;
}

export interface StreamMessageInput {
  content: string;
  attachments?: unknown[];
  effort?: string;
  escalates_run_id?: string;
  command?: string;
  target_run_id?: string;
}

// ponytail: research payloads are typed upstream (pydantic) and change often;
// the SDK passes them through rather than re-declaring them.
type Json = any;

// A review pass or apply runs for minutes before it answers.
const LONG_MS = 600_000;
const enc = encodeURIComponent;

export function createResearch(t: ResearchTransport) {
  const root = (agentId: string) => `/api/agents/${enc(agentId)}/research`;
  const session = (agentId: string, sessionId: string) => `${root(agentId)}/sessions/${enc(sessionId)}`;
  const run = (agentId: string, runId: string) => `${root(agentId)}/runs/${enc(runId)}`;
  const report = (agentId: string, runId: string) => `${root(agentId)}/reports/${enc(runId)}`;
  type Snapshot<T> = { etag: string; data: T };
  const snapshot = <T>(path: string) => () => t.request<Snapshot<T>>('GET', path);
  // live.messages subscriptions per session, so a completed turn can refresh them at once.
  const messageSubs = new Map<string, Set<LiveSubscription>>();

  async function* frames(res: Promise<Response>): AsyncGenerator<Json> {
    const r = await res;
    if (r.body) yield* readSse(r.body);
  }

  async function* streamTurn(agentId: string, sessionId: string, input: StreamMessageInput, signal?: AbortSignal): AsyncGenerator<Json> {
    for await (const ev of frames(t.stream('POST', `${session(agentId, sessionId)}/messages/stream`, input, signal))) {
      yield ev;
      // The finished message is persisted server-side and read through
      // live.messages — re-read it now instead of on the next 2 s tick.
      if ((ev as { type?: string } | null)?.type === 'complete') {
        messageSubs.get(`${agentId}/${sessionId}`)?.forEach((sub) => sub.refresh());
      }
    }
  }

  return {
    sessions: {
      create: (agentId: string) => t.request<Json>('POST', `${root(agentId)}/sessions`),
      list: (agentId: string, opts: { includeArchived?: boolean } = {}) =>
        t.request<Json>('GET', `${root(agentId)}/sessions?archived=${opts.includeArchived ? 'true' : 'false'}`),
      get: (agentId: string, sessionId: string) => t.request<Json>('GET', session(agentId, sessionId)),
      patch: (agentId: string, sessionId: string, patch: Record<string, unknown>) => t.request<Json>('PATCH', session(agentId, sessionId), patch),
      delete: (agentId: string, sessionId: string) => t.request<void>('DELETE', session(agentId, sessionId)),
      models: (agentId: string, sessionId: string) => t.request<Json>('GET', `${session(agentId, sessionId)}/models`),
      setModel: (agentId: string, sessionId: string, model: string | null) =>
        t.request<Json>('PUT', `${session(agentId, sessionId)}/model`, { model }),
      setReviewModel: (agentId: string, sessionId: string, model: string | null) =>
        t.request<Json>('PUT', `${session(agentId, sessionId)}/review-model`, { model }),
      /** Yields research-runtime's frames unchanged: text_delta, tool_use_start, complete, error. */
      streamMessage: (agentId: string, sessionId: string, input: StreamMessageInput, opts: { signal?: AbortSignal } = {}) =>
        streamTurn(agentId, sessionId, input, opts.signal),
    },
    plans: {
      approve: (agentId: string, sessionId: string, messageId: string, body: Record<string, unknown> = {}) =>
        t.request<Json>('POST', `${session(agentId, sessionId)}/messages/${enc(messageId)}/approve-plan`, body),
      approveById: (agentId: string, sessionId: string, planId: string, body: Record<string, unknown> = {}) =>
        t.request<Json>('POST', `${session(agentId, sessionId)}/plans/${enc(planId)}/approve`, body),
    },
    attachments: {
      /** Uploads files to the session; returns the Attachment refs to send with a turn. */
      add: async (agentId: string, sessionId: string, files: Blob[]) => {
        const form = new FormData();
        files.forEach((f) => form.append('files', f));
        return (await t.request<{ attachments: Json[] }>('POST', `${session(agentId, sessionId)}/attachments`, form)).attachments;
      },
      uploadUrl: (agentId: string, sessionId: string, storagePath: string) =>
        t.request<{ url: string }>('POST', `${session(agentId, sessionId)}/attachment-url`, { storage_path: storagePath }),
    },
    runs: {
      cancel: (agentId: string, runId: string) => t.request<Json>('POST', `${run(agentId, runId)}/cancel`),
      retry: (agentId: string, runId: string) => t.request<Json>('POST', `${run(agentId, runId)}/retry`),
      activeJob: async (agentId: string, runId: string) =>
        (await t.request<{ active?: Json }>('GET', `${run(agentId, runId)}/active-job`))?.active ?? null,
      resolveClaims: (agentId: string, runId: string, resolutions: unknown) =>
        t.request<Json>('POST', `${run(agentId, runId)}/claims/resolve`, { resolutions }),
    },
    reports: {
      get: (agentId: string, runId: string, opts: { version?: number } = {}) =>
        t.request<Json>('GET', `${report(agentId, runId)}${opts.version ? `?version=${opts.version}` : ''}`),
      artifactUrl: (agentId: string, runId: string, profileId: string, format: string) =>
        t.request<Json>('GET', `${report(agentId, runId)}/artifacts/${enc(profileId)}/${enc(format)}`),
      evidence: (agentId: string, runId: string) => t.request<Json>('GET', `${report(agentId, runId)}/evidence`),
      share: {
        get: (agentId: string, runId: string) => t.request<Json>('GET', `${report(agentId, runId)}/share`),
        set: (agentId: string, runId: string, visibility: string) => t.request<Json>('PUT', `${report(agentId, runId)}/share`, { visibility }),
        revoke: (agentId: string, runId: string) => t.request<Json>('POST', `${report(agentId, runId)}/share/revoke`),
      },
    },
    review: {
      get: (agentId: string, runId: string) => t.request<Json>('GET', `${report(agentId, runId)}/review`),
      run: (agentId: string, runId: string) => t.request<Json>('POST', `${run(agentId, runId)}/review`, undefined, { timeoutMs: LONG_MS }),
      apply: (agentId: string, runId: string, findingIds: string[]) =>
        t.request<Json>('POST', `${run(agentId, runId)}/review/apply`, { finding_ids: findingIds }, { timeoutMs: LONG_MS }),
      stream: (agentId: string, runId: string, opts: { signal?: AbortSignal } = {}) =>
        frames(t.stream('POST', `${run(agentId, runId)}/review/stream`, undefined, opts.signal)),
      streamApply: (agentId: string, runId: string, findingIds: string[], opts: { signal?: AbortSignal } = {}) =>
        frames(t.stream('POST', `${run(agentId, runId)}/review/apply/stream`, { finding_ids: findingIds }, opts.signal)),
    },
    templates: {
      versions: (agentId: string) => t.request<Json>('GET', `${root(agentId)}/versions`),
    },
    messages: {
      /** One page of messages older than `beforeTs`, in reading order (noesis loadOlderMessages). */
      older: async (agentId: string, sessionId: string, beforeTs: string) =>
        (await t.request<Snapshot<Json[]>>('GET', `${root(agentId)}/live/sessions/${enc(sessionId)}/messages?before=${enc(beforeTs)}`)).data,
    },
    live: {
      session: (agentId: string, sessionId: string, cb: (s: Json | null) => void, opts: { active?: boolean } = {}) =>
        poll(snapshot<Json>(`${root(agentId)}/live/sessions/${enc(sessionId)}`), cb, null, opts.active),
      messages: (agentId: string, sessionId: string, cb: (m: Json[]) => void, opts: { active?: boolean } = {}) => {
        const key = `${agentId}/${sessionId}`;
        const sub = poll(snapshot<Json[]>(`${root(agentId)}/live/sessions/${enc(sessionId)}/messages`), cb, KEEP, opts.active);
        const set = messageSubs.get(key) ?? new Set<LiveSubscription>();
        set.add(sub);
        messageSubs.set(key, set);
        const unsub = (() => {
          sub();
          set.delete(sub);
          if (!set.size) messageSubs.delete(key);
        }) as LiveSubscription;
        unsub.setActive = sub.setActive;
        unsub.refresh = sub.refresh;
        return unsub;
      },
      plan: (agentId: string, planId: string, cb: (p: Json | null) => void, opts: { active?: boolean } = {}) =>
        poll(snapshot<Json>(`${root(agentId)}/live/plans/${enc(planId)}`), cb, null, opts.active),
      run: (agentId: string, runId: string, cb: (r: Json | null) => void, opts: { active?: boolean } = {}) =>
        poll(snapshot<Json>(`${root(agentId)}/live/runs/${enc(runId)}`), cb, null, opts.active),
      reportVersions: (agentId: string, runId: string, cb: (v: Json[]) => void, opts: { active?: boolean } = {}) =>
        poll(snapshot<Json[]>(`${root(agentId)}/live/runs/${enc(runId)}/report-versions`), cb, [], opts.active),
      templateRuns: (agentId: string, cb: (runs: Json[]) => void, opts: { active?: boolean } = {}) =>
        poll(snapshot<Json[]>(`${root(agentId)}/live/runs`), cb, KEEP, opts.active),
      runSteps: (agentId: string, runId: string, cb: (steps: Json[]) => void) =>
        watchSteps(
          (after, signal) => t.stream('GET', `${run(agentId, runId)}/steps/stream${after ? `?after=${enc(after)}` : ''}`, undefined, signal),
          cb,
        ),
    },
  };
}
