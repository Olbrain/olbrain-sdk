# @olbrain/js-sdk — reference for coding assistants

This file ships inside the npm package (`node_modules/@olbrain/js-sdk/AGENTS.md`).
It is the complete, offline reference for the public API. Everything here is
taken from the source. If it disagrees with the web docs, this file is right.
The type definitions are in `dist/index.d.ts`.

## Pick the right client

| You want to… | Use | Auth |
|---|---|---|
| Chat with a conversational agent (send a message, get a reply) | `AgentClient` | `apiKey` starting `sk_live_`, `org_live_`, `sk_`, `org_` or `ak_` |
| Drop a chat bubble on a web page | `ChatWidget` (from the widget bundle) | same as `AgentClient` |
| Trigger workflow agents, read/control runs, resolve approvals | `Olbrain` | `apiKey: 'ak_…'` **or** `getIdToken` (Olbrain sign-in) |
| Drive a research agent (sessions, streamed turns, plans, reports) | `Olbrain#research` | `getIdToken` only. An `ak_` key gets `NotFoundError` (`agent_not_found`) |

These are two separate HTTP clients with different base URLs and error rules.
Don't mix their options.

## Install and import

```bash
npm install @olbrain/js-sdk
```

```ts
// ESM / TypeScript
import { AgentClient, Olbrain, OlbrainError } from '@olbrain/js-sdk';
// CommonJS
const { AgentClient, Olbrain } = require('@olbrain/js-sdk');
```

```html
<!-- Browser, core only: global `Olbrain` (so the class is `Olbrain.Olbrain`) -->
<script src="https://unpkg.com/@olbrain/js-sdk@1.3.2/dist/index.global.js"></script>
<!-- Browser, core + ChatWidget: global `OlbrainWidget` -->
<script src="https://unpkg.com/@olbrain/js-sdk@1.3.2/dist/widget.widget.global.js"></script>
```

`ChatWidget` is **not** exported from the main entry. Get it from the widget
bundle (`OlbrainWidget.ChatWidget`). Runtime requirements: global `fetch`,
`AbortController`, `TextDecoder`, `FormData` (Node 18+ or any modern browser).

---

## 1. `AgentClient` — conversational agents

```ts
const client = new AgentClient({
  agentId: 'your-agent-id',          // required, non-empty
  apiKey: process.env.OLBRAIN_API_KEY!, // required, see prefixes above
  baseUrl: undefined,                // default https://olbrain-agent-cloud-768934887465.us-central1.run.app
});

const sessionId = await client.createSession({ title: 'Support chat', userId: 'u_42' });
const reply = await client.sendAndWait(sessionId, 'Hello!');
console.log(reply.text, reply.tokenUsage?.totalTokens);
client.close();
```

The constructor throws `ValidationError` if `apiKey` is missing or has the
wrong prefix, or if `agentId` is empty. Every call is a `POST {baseUrl}/api/agent/webhook`
with headers `Authorization: Bearer <apiKey>` and `X-Agent-ID: <agentId>`.

### Methods

| Method | Returns | Notes |
|---|---|---|
| `createSession(opts?: { title?, userId?, metadata? })` | `Promise<string>` (session id) | Sends `title` (default `'Chat Session'`) to the agent **as the first message**, so the agent sees it. Throws `OlbrainError` if no `session_id` comes back. |
| `sendAndWait(sessionId, message, opts?: { metadata?, timeout? })` | `Promise<ChatResponse>` | Waits for the agent's reply. `timeout` is in ms (default 30000). The message is trimmed. An empty string throws `ValidationError`. |
| `send(sessionId, message)` | `Promise<void>` | Same request as `sendAndWait`. It still waits for the server, then discards the reply. |
| `getSession(sessionId)` | `Promise<SessionInfo>` | Best effort. On **any** error it logs a warning and returns a placeholder (`title: 'Session'`, `messageCount: 0`). It never throws. |
| `updateSession(sessionId, { title?, metadata?, status?: 'active' \| 'archived' })` | `Promise<SessionInfo>` | Throws on error. Not every backend supports it. |
| `deleteSession(sessionId)` | `Promise<void>` | Throws on error. Not every backend supports it. |
| `getMessages(sessionId, limit = 100)` | `Promise<Message[]>` | Best effort. Returns `[]` on any error. |
| `getSessionStats(sessionId)` | `Promise<SessionStats>` | Best effort. Returns zeros on any error. |
| `listen(sessionId, onMessage, onError?)` | `Promise<void>` | SSE on `GET {baseUrl}/sessions/{id}/stream`. Reconnects with backoff (5 s doubling to 60 s), and each reconnect calls `onError(StreamingError)`. Frames without `role` and `content` (the `connected` and `ping` frames) are dropped. Uses `fetch`, so it sends the auth headers in both browsers and Node. A refused stream (e.g. HTTP 401) is reported through `onError` and retried. |
| `stopListening(sessionId)` | `void` | |
| `close()` | `void` | Stops every stream. |

### Types

```ts
interface ChatResponse {
  text: string; sessionId: string; success: boolean;
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number; cost?: number };
  modelUsed?: string; responseTimeMs?: number; error?: string;
}
interface Message { role: 'user' | 'assistant'; content: string; timestamp: string; metadata?: Record<string, any> }
interface SessionInfo { sessionId: string; title: string; status: 'active' | 'archived'; createdAt: string; messageCount: number; userId?: string; metadata: Record<string, any> }
interface SessionStats { sessionId: string; messageCount: number; totalTokens: number; createdAt: string; lastMessageAt?: string }
```

Check `success` as well as catching exceptions. A 200 response can still carry
`success: false` and an `error` string.

### Errors (`AgentClient`)

| HTTP | Thrown |
|---|---|
| 401, 403 | `AuthenticationError` |
| 404 | `SessionNotFoundError` (`.sessionId`) |
| 429 | `RateLimitError` (`.retryAfter` in seconds, if the server sent `Retry-After`) |
| other non-2xx | `NetworkError` (`.statusCode`) |
| fetch failure | `NetworkError` |
| timeout | The runtime's `AbortError` (a `DOMException`, **not** an `OlbrainError`) |

---

## 2. `ChatWidget` — embeddable chat UI (browser only)

```html
<script src="https://unpkg.com/@olbrain/js-sdk@1.3.2/dist/widget.widget.global.js"></script>
<script>
  const widget = new OlbrainWidget.ChatWidget({ agentId: '…', apiKey: 'sk_live_…' });
  widget.mount(); // or widget.mount('#chat') / widget.mount(element)
</script>
```

| Option | Default | |
|---|---|---|
| `agentId`, `apiKey` | — | required |
| `position` | `'bottom-right'` | `'bottom-left'`, `'custom'` |
| `theme` | `'auto'` | `'light'`, `'dark'` |
| `primaryColor` | `'#4f46e5'` | |
| `title` | `'Chat with us'` | |
| `greeting` | `'Hi! How can I help you today?'` | |
| `placeholder` | `'Type your message...'` | |
| `autoOpen` | `false` | |
| `persistSession` | `true` | Keeps the session id in `localStorage['olbrain_widget_session_id']` |
| `target` | `document.body` | |
| `onMessage(msg: Message)` | no-op | Called for every user **and** assistant message added to the UI |
| `baseUrl` | AgentClient default | |

Methods: `mount(target?) → Promise<void>`, `unmount()`, `open()`, `close()`,
`sendMessage(text) → Promise<void>`. `sendMessage` is ignored while a reply is
pending. The API key is visible to anyone who loads the page, so use a key you
are willing to expose.

---

## 3. `Olbrain` — workflow agents, runs, approvals

```ts
const olbrain = new Olbrain({ apiKey: 'ak_…' });                         // server / script
// const olbrain = new Olbrain({ getIdToken: () => user.getIdToken() }); // signed-in Olbrain user (Firebase)
```

`OlbrainConfig`: `apiKey?` (must start `ak_`), `getIdToken?: () => Promise<string>`
(called before **every** request), `baseUrl?` (default `https://webhook.olbrain.com`),
and `timeoutMs?` (default 30000). Give **exactly one** of `apiKey` or
`getIdToken`, or the constructor throws `ValidationError`.

Every method takes the agent id first. Responses are the API's JSON with
snake_case keys. The one exception is `workflows.run`, which returns camelCase.

| Method | HTTP | Returns |
|---|---|---|
| `workflows.run(agentId, { payload?, variables? } = {})` | `POST /api/workflows/{agentId}/trigger` | `{ runId, status }` |
| `runs.list(agentId, { status?, limit? } = {})` | `GET /api/agents/{agentId}/runs` | `Run[]` |
| `runs.get(agentId, runId)` | `GET …/runs/{runId}` | `Run` |
| `runs.cancel / pause / retry / resume(agentId, runId)` | `POST …/runs/{runId}/{verb}` | `Record<string, unknown>` |
| `approvals.list(agentId, runId)` | `GET …/runs/{runId}/approvals` | `Approval[]` |
| `approvals.resolve(agentId, runId, { exceptionId, resolution, modifiedData? })` | `POST …/approvals/resolve` | `ResolveResult` |

```ts
interface Run { run_id: string; status: string; progress_percent?: number; started_at?: string | null;
  completed_at?: string | null; duration_seconds?: number | null; error?: string | null;
  summary?: { total_processed: number; successful: number; failed: number; exceptions: number; skipped: number } | null;
  [key: string]: unknown }
interface Approval { exception_id: string; step_id: string; item_id?: string | null; data?: Record<string, unknown> | null;
  error: string; requires_human_review: boolean; blocking: boolean }
// resolution: 'approved' | 'rejected' | 'modified'. Send modifiedData only with 'modified'.
interface ResolveResult { exception_id: string; resolution: string; all_resolved: boolean; resumed: boolean }
```

There is no SDK helper for waiting on a run, so poll `runs.get` yourself:

```ts
const { runId } = await olbrain.workflows.run(agentId, { payload: { url } });
let run = await olbrain.runs.get(agentId, runId);
const DONE = new Set(['completed', 'failed', 'canceled', 'cancelled']);
while (!DONE.has(run.status)) {
  const pending = await olbrain.approvals.list(agentId, runId);
  for (const a of pending) await olbrain.approvals.resolve(agentId, runId, { exceptionId: a.exception_id, resolution: 'approved' });
  await new Promise((r) => setTimeout(r, 3000));
  run = await olbrain.runs.get(agentId, runId);
}
```

The terminal status strings in that loop are an assumption. The SDK types
`status` as `string`, so check the values your agent actually returns.

### Errors (`Olbrain`, including `research`)

The error code and message come from the response body: `{error:{code,message}}`
or FastAPI's `{detail}`.

| Condition | Thrown |
|---|---|
| code is `insufficient_funds`, `credit_limit_exceeded`, `subscription_suspended`, `subscription_inactive` or `billing_unavailable` (any status) | `BillingError` (`.status`, `.code`) |
| 401 | `AuthenticationError` |
| 404 | `NotFoundError` (`.status = 404`, `.code`, e.g. `agent_not_found`) |
| 429 | `RateLimitError` (`.retryAfter` seconds) |
| any other non-2xx (403, 409, 422, 5xx…) | `ApiError` (`.status`, `.code`, `.message`, `.detail` = raw `detail`) |
| fetch failure, timeout, or your `AbortSignal` | `NetworkError` (`'Request timed out after Nms'`, `'Request aborted'`) |

`BillingError` and `NotFoundError` extend `ApiError`, and every error class
extends `OlbrainError`, so put the narrower `instanceof` checks first.

---

## 4. `olbrain.research` — research agents (sign-ins only)

```ts
const olbrain = new Olbrain({ getIdToken: () => auth.currentUser!.getIdToken() });
const r = olbrain.research;
```

All paths sit under `/api/agents/{agentId}/research`. The agent must be a
research agent that is bound to a screen in the user's org. Payloads are
passed through untyped (`any`) because their shape belongs to the
research-runtime service.

### Sessions and streamed turns

| Method | Returns |
|---|---|
| `sessions.create(agentId)` | session object (has `session_id`) |
| `sessions.list(agentId, { includeArchived? })` | sessions |
| `sessions.get / delete(agentId, sessionId)` | |
| `sessions.patch(agentId, sessionId, patch)` | partial session fields, passed through to research-runtime |
| `sessions.models(agentId, sessionId)` | available models |
| `sessions.setModel / setReviewModel(agentId, sessionId, model \| null)` | `null` resets to the default |
| `sessions.streamMessage(agentId, sessionId, input, { signal? })` | `AsyncGenerator` of frames |

`StreamMessageInput`: `{ content: string; attachments?; effort?; escalates_run_id?; command?; target_run_id? }`.

Stream frames come straight from research-runtime, unchanged: `{type:'text_delta', text}`,
`{type:'tool_use_start', …}`, `{type:'complete', …}` and `{type:'error', …}`.
A stream can wait up to 600 s for its first byte while the agent searches.
To cancel it, abort the `signal`.

```ts
const ac = new AbortController();
for await (const ev of r.sessions.streamMessage(agentId, sid, { content: 'Size the Indian EV charger market' }, { signal: ac.signal })) {
  if (ev.type === 'text_delta') process.stdout.write(ev.text);
  if (ev.type === 'error') throw new Error(ev.message ?? 'research error');
}
```

### Plans, attachments, runs, reports, review

| Method | |
|---|---|
| `plans.approve(agentId, sessionId, messageId, body = {})` | approve the plan proposed in a message |
| `plans.approveById(agentId, sessionId, planId, body = {})` | |
| `attachments.add(agentId, sessionId, files: Blob[])` | multipart upload; returns attachment refs to pass as `attachments` in `streamMessage` |
| `attachments.uploadUrl(agentId, sessionId, storagePath)` | `{ url }` |
| `runs.cancel / retry(agentId, runId)` | |
| `runs.activeJob(agentId, runId)` | active job, or `null` |
| `runs.resolveClaims(agentId, runId, resolutions)` | |
| `reports.get(agentId, runId, { version? })` | latest report, or the given version |
| `reports.artifactUrl(agentId, runId, profileId, format)` | |
| `reports.evidence(agentId, runId)` | |
| `reports.share.get / revoke(agentId, runId)`, `reports.share.set(agentId, runId, visibility)` | |
| `review.get(agentId, runId)` | |
| `review.run(agentId, runId)`, `review.apply(agentId, runId, findingIds)` | blocking, with a 600 s timeout |
| `review.stream(agentId, runId, { signal? })`, `review.streamApply(agentId, runId, findingIds, { signal? })` | streamed versions (AsyncGenerator of frames) |
| `templates.versions(agentId)` | |
| `messages.older(agentId, sessionId, beforeTs)` | one page of older messages, oldest first |

### Live reads (polling subscriptions)

These replace Firestore listeners. Each one returns an unsubscribe function,
and you **must** call it when you're done.

| Method | Callback gets | On read error |
|---|---|---|
| `live.session(agentId, sessionId, cb, { active? })` | session or `null` | `cb(null)` once |
| `live.messages(agentId, sessionId, cb, { active? })` | `Message[]` | keeps the last value (no call) |
| `live.plan(agentId, planId, cb, { active? })` | plan or `null` | `cb(null)` once |
| `live.run(agentId, runId, cb, { active? })` | run or `null` | `cb(null)` once |
| `live.reportVersions(agentId, runId, cb, { active? })` | versions array | `cb([])` once |
| `live.templateRuns(agentId, cb, { active? })` | runs array | keeps the last value |
| `live.runSteps(agentId, runId, cb)` | **all** steps so far, ordered by ts | `cb([])` if nothing has arrived yet |

How the polling subscriptions behave:

- They poll every 2 s while active and every 10 s once you call `sub.setActive(false)` (or pass `{ active: false }`).
- They skip polls while the browser tab is hidden.
- The callback fires only when the server's etag changes, so you won't get duplicate calls.
- `sub.refresh()` forces an immediate poll. When a `streamMessage` turn emits `complete`, the SDK refreshes that session's `live.messages` subscriptions for you.

`runSteps` follows an SSE stream instead of polling. It resumes from its
cursor after a reconnect and retries with backoff from 1 s to 30 s. It stops
on its own when the run ends. Its unsubscribe function has no
`setActive`/`refresh`.

```ts
const stop = r.live.run(agentId, runId, (run) => { if (run) render(run); });
// later
stop();
```

---

## Gotchas

- `AgentClient` and `Olbrain` talk to different hosts and parse errors differently, as described above.
- Never ship an `ak_` key or a server secret to a browser. Front ends should use `getIdToken`.
- `getSession`, `getMessages` and `getSessionStats` hide failures behind placeholder values, so a missing session looks like an empty one.
