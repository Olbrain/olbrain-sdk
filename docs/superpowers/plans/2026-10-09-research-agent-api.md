# Research Agents on the Agent API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in Olbrain user can drive the full research console (sessions, streamed turns, plans, live runs, report, review, sharing) through `@olbrain/js-sdk@1.3.0` against webhook.olbrain.com, with no Firestore client in the front end.

**Architecture:** `olbrain-webhook-service` gains one route family, `/api/agents/:agentId/research/*`. It admits Olbrain sign-ins only, checks that every session/run/plan id in the path belongs to the agent, then (a) forwards 29 allowlisted calls to research-design or research-runtime with the user's token in `X-User-Authorization`, (b) serves six polled `{etag, data}` Firestore snapshots, and (c) streams run steps over SSE with a resumable cursor. `@olbrain/js-sdk` gains an `olbrain.research` namespace that mirrors noesis's `src/services/research/*` names, polls the snapshots, and follows the steps stream.

**Tech Stack:** webhook-service: TypeScript, Hono 4.6 (`hono/cors`, `hono/streaming`), `@google-cloud/firestore` 7, vitest 4, Terraform. SDK: TypeScript, tsup, vitest (jsdom).

**Spec:** `olbrain-sdk/docs/superpowers/specs/2026-10-09-research-agent-api-design.md` — read it before Task 1.

## Global Constraints

- Two repos, both branched from **origin/main** (local checkouts run stale — never port from a local tree): `olbrain-webhook-service` branch `feat/research-agent-api`; `olbrain-sdk` branch `feat/research-agent-api` (renamed from `docs/research-agent-api-spec`, which holds the spec and this plan).
- Research routes are **sign-in only**. An `ak_` token, no token, or `SCREENS_SIGNIN_ENABLED=false` → 404 `agent_not_found`.
- Every session/run/plan id in a research path is checked (`template_id == :agentId`) **before** any upstream call or Firestore read of its data. A miss is the same 404 `agent_not_found`.
- The forward allowlist is exactly the spec's 29 rows. Anything else → 404 without authenticating.
- Upstream 4xx bodies pass through verbatim; upstream 5xx → 502 `upstream_error`; transport timeout → 502 `upstream_timeout`.
- Kill switch `RESEARCH_AGENT_API_ENABLED`, default `false` (routes not mounted). When `true`, `RESEARCH_DESIGN_URL` and `RESEARCH_RUNTIME_URL` must be set or the service refuses to boot.
- `STEPS_STREAM_MAX_SECONDS` default `25`.
- Long calls (review run/apply and the three SSE forwards) use a 600 000 ms forward timeout in webhook-service and a 600 000 ms request timeout in the SDK.
- SDK polling: 2 000 ms while active, 10 000 ms idle, paused while `document.hidden`.
- SDK release is `1.3.0` and purely additive: no existing export changes behaviour.
- Never log a token (existing `signIn.ts` rule).

## Review Focus

1. **Encoded or traversal ids** (`sessions/a%2Fb`, `sessions/..`) → 404 before authentication, never forwarded. Test added in Task 3.
2. **A run already finished when the steps stream opens** → the full backlog arrives, then `end`; nothing dropped and no early `end`. Test added in Task 5.
3. **A turn completes while a `live.messages` poll is in flight** → the SDK re-reads right after that poll, not 2 s later. Test added in Task 9.
4. **The user stops a turn mid-stream** → the caller's `AbortSignal` aborts the underlying fetch. Test added in Task 8.
5. **The sign-in token expires mid-session** (a poll gets 401) → the subscriber gets its fallback value once, polling continues, and the next good read restores data even if unchanged. Test added in Task 9.

---

## File Structure

**olbrain-webhook-service**
- Modify `src/lookup.ts:7-8` — `research` becomes a valid `RuntimeKind`.
- Modify `src/auth.ts` (`authenticateKeyOrUser`) — `kind: "workflow" | "research"`.
- Modify `src/config.ts` — four research settings.
- Create `src/researchStore.ts` — every Firestore read the research routes make, plus the ownership check, timestamp serialisation, etags and step cursors.
- Create `src/research.ts` — the route family: allowlist, CORS, admission, guard, forward, live snapshots, steps SSE.
- Modify `src/server.ts` — mount it.
- Modify `terraform/variables.tf`, `terraform/dispatcher.tf`, `terraform/terraform.tfvars.example` — env and `run.invoker` grants.
- Tests: `tests/auth.signin.test.ts` (append), `tests/lookup.test.ts` (append), `tests/researchStore.test.ts`, `tests/research.test.ts`.

**olbrain-sdk/packages/js**
- Modify `src/core/exceptions.ts` — `ApiError.detail`.
- Create `src/core/sse.ts` — `readSse`, the one SSE frame reader.
- Modify `src/core/olbrain.ts` — `send()` transport (all methods, FormData, streams, per-call timeout) and the `research` namespace.
- Create `src/core/research.ts` — `createResearch(transport)`: forwarded calls and streams.
- Create `src/core/researchLive.ts` — `poll()` and `watchSteps()`.
- Modify `src/index.ts`, `package.json`, `README.md`.
- Tests: `tests/sse.test.ts`, `tests/research.test.ts`, `tests/researchLive.test.ts`, `tests/olbrain.test.ts` (append).

---

### Task 0: Branches and baselines

**Files:** none changed.

- [ ] **Step 1: Branch webhook-service from origin/main**

```bash
cd ~/Desktop/Olbrain-Labs/olbrain-webhook-service
git fetch origin
git status --short   # must be empty; if not, stop and ask
git checkout -b feat/research-agent-api origin/main
npm ci
```

- [ ] **Step 2: Record the webhook-service baseline**

Run: `npm run typecheck && npx vitest run 2>&1 | tail -5`
Expected: typecheck clean; note the pass/fail counts. Any failure here is pre-existing — write it down so later tasks don't chase it.

- [ ] **Step 3: Rename the SDK branch and record its baseline**

```bash
cd ~/Desktop/Olbrain-Labs/olbrain-sdk
git fetch origin
git checkout docs/research-agent-api-spec
git branch -m feat/research-agent-api
git rebase origin/main
cd packages/js && npm ci
npm run typecheck && npx vitest run 2>&1 | tail -5
```
Expected: typecheck clean; note the counts.

---

### Task 1: `research` runtime kind and sign-in admission

**Files:**
- Modify: `olbrain-webhook-service/src/lookup.ts:7-8`
- Modify: `olbrain-webhook-service/src/auth.ts` (the `authenticateKeyOrUser` function and its doc comment, ~lines 298-345)
- Test: `olbrain-webhook-service/tests/auth.signin.test.ts` (append), `tests/lookup.test.ts` (append)

**Interfaces:**
- Produces: `authenticateKeyOrUser(c, agentId, opts?: { mutating?: boolean; kind?: "workflow" | "research" }): Promise<AuthOutcome>`. With `kind: "research"`, success returns `auth` with `runtimeKind: "research"`, `keyId: null`, `actorUid: uid`, and **no** `workflowId`. `RuntimeKind` now includes `"research"`.

Side effect to expect: a research agent called with an `ak_` key on an existing route (conversational trigger, runs, uploads) now gets 400 `runtime_not_applicable` from the `allowedKinds` gate instead of 404. That's correct and needs no change.

- [ ] **Step 1: Write the failing tests**

Append to `tests/auth.signin.test.ts` (it already mocks `lookup.js`, `signIn.js`, `screensAccess.js` and defines `ctx`, `agent`, `code`, `cfg`):

```ts
describe("authenticateKeyOrUser — kind research", () => {
  const research = (over: Record<string, unknown> = {}) =>
    vi.mocked(lookupAgent).mockResolvedValue(agent({ runtimeKind: "research", ...over }) as never);

  it("admits a signed-in screens user for a bound published research agent, with no workflowId", async () => {
    research();
    const out = await authenticateKeyOrUser(await ctx("Bearer eyJ.a.b"), "ra-1", { kind: "research" });
    expect("auth" in out && out.auth).toMatchObject({
      agentId: "ra-1", organizationId: "org-A", runtimeKind: "research", keyId: null, actorUid: "u1",
    });
    expect("auth" in out && "workflowId" in out.auth).toBe(false);
    expect(isScreenAgent).toHaveBeenCalledWith("org-A", "ra-1");
  });

  it.each([
    ["an ak_ key", "Bearer ak_live_1"],
    ["no credential", undefined],
  ])("%s is 404 and never takes the key path", async (_name, authorization) => {
    research();
    const out = await authenticateKeyOrUser(await ctx(authorization), "ra-1", { kind: "research" });
    expect(out.response?.status).toBe(404);
    expect(await code(out)).toBe("agent_not_found");
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("with the switch off, a sign-in is 404 too", async () => {
    research();
    cfg.screensSigninEnabled = false;
    const out = await authenticateKeyOrUser(await ctx("Bearer eyJ.a.b"), "ra-1", { kind: "research" });
    expect(out.response?.status).toBe(404);
    expect(verifyFirebaseIdToken).not.toHaveBeenCalled();
  });

  it("a workflow agent is 404 on a research route", async () => {
    const out = await authenticateKeyOrUser(await ctx("Bearer eyJ.a.b"), "wf-1", { kind: "research" });
    expect(out.response?.status).toBe(404);
  });

  it("a research agent is 404 on the workflow sign-in path", async () => {
    research();
    const out = await authenticateKeyOrUser(await ctx("Bearer eyJ.a.b"), "ra-1");
    expect(out.response?.status).toBe(404);
  });

  it("the owner's lock refuses someone else's mutating research call", async () => {
    research({ accessLocked: true, ownerId: "owner-9" });
    const out = await authenticateKeyOrUser(await ctx("Bearer eyJ.a.b"), "ra-1", { kind: "research", mutating: true });
    expect(out.response?.status).toBe(403);
    expect(await code(out)).toBe("agent_locked");
  });
});
```

Append to `tests/lookup.test.ts` (it defines `setKeyDoc`, `setAgentDoc`, imports `authenticate`, and clears caches in `beforeEach`):

```ts
describe("authenticate — research agents", () => {
  it("resolves an agent whose basic_info.runtime is research", async () => {
    setKeyDoc({ organization_id: "org-1", status: "active" });
    setAgentDoc({ organization_id: "org-1", basic_info: { runtime: "research" } });
    expect(await authenticate("ak_test", "agent-1")).toMatchObject({ runtimeKind: "research" });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/auth.signin.test.ts tests/lookup.test.ts`
Expected: the new research cases FAIL (the admission one gets 404 because `runtimeKind === "workflow"` is hard-coded; the lookup one gets `"agent_not_found"`).

- [ ] **Step 3: Accept the runtime kind**

In `src/lookup.ts` replace lines 7-8:

```ts
export type RuntimeKind = "conversational" | "workflow" | "superagent" | "research";
const VALID_RUNTIMES = new Set<RuntimeKind>(["conversational", "workflow", "superagent", "research"]);
```

- [ ] **Step 4: Give the sign-in admission a kind**

In `src/auth.ts`, replace the doc comment and the whole `authenticateKeyOrUser` function with:

```ts
/**
 * The Agent API's two credentials (Screens spec, 'Sign-in as a second
 * credential'): an ak_ key, exactly as authenticateAgent, or — while
 * SCREENS_SIGNIN_ENABLED — an Olbrain sign-in. A sign-in runs as the agent's
 * own org (never a client-chosen one) and only for a published agent of the
 * route's kind bound to a screen installed in that org, used by someone who
 * can use that org's screens. Token failures are 401; every access failure is
 * the same 404, so nothing tells an existing agent from a missing one.
 *
 * kind "research" is sign-in only (olbrain-sdk spec 2026-10-09): an ak_ key or
 * no credential is that same 404 — there is no key path to fall back to.
 */
export async function authenticateKeyOrUser(
  c: Context,
  agentId: string,
  opts: { mutating?: boolean; kind?: "workflow" | "research" } = {},
): Promise<AuthOutcome> {
  const kind = opts.kind ?? "workflow";
  const header = c.req.header("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!config.screensSigninEnabled || !token || token.startsWith("ak_")) {
    if (kind === "research") return { response: errorResponse(c, 404, "agent_not_found") };
    return authenticateAgent(c, agentId, { allowedKinds: ["workflow"] });
  }
  const uid = await verifyFirebaseIdToken(token);
  if (!uid) return { response: errorResponse(c, 401, "unauthorized") };
  const agent = await lookupAgent(agentId);
  const admitted = agent !== null
    && agent.runtimeKind === kind
    && agent.agentStatus === "PUBLISHED"
    && (await canUseScreens(uid, agent.organizationId))
    && (await isScreenAgent(agent.organizationId, agentId));
  if (!admitted || !agent) return { response: errorResponse(c, 404, "agent_not_found") };
  // The owner's emergency lock (studio-backend is_agent_locked_for): a locked
  // agent refuses everyone but its owner on mutating calls; reads stay open.
  if (opts.mutating && agent.accessLocked && agent.ownerId !== uid) {
    return { response: errorResponse(c, 403, "agent_locked") };
  }
  const auth: AuthorizedRequest = {
    agentId,
    organizationId: agent.organizationId,
    runtimeKind: kind,
    superagentChatEnabled: agent.superagentChatEnabled,
    agentStatus: agent.agentStatus,
    ...(kind === "workflow" ? { workflowId: agentId } : {}),
    keyId: null,
    agentName: agent.agentName,
    actorUid: uid,
  };
  recordUsage(auth);
  return { auth };
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run tests/auth.signin.test.ts tests/lookup.test.ts tests/auth.test.ts tests/runs.signin.test.ts && npm run typecheck`
Expected: all PASS, including every pre-existing workflow sign-in case; typecheck clean. If typecheck flags a `switch`/`Record<RuntimeKind, …>` elsewhere, handle `"research"` there by refusing it, never by routing it to a runtime.

- [ ] **Step 6: Commit**

```bash
git add src/lookup.ts src/auth.ts tests/auth.signin.test.ts tests/lookup.test.ts
git commit -m "feat(auth): research agents admit Olbrain sign-ins only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Research config and Firestore store

**Files:**
- Modify: `olbrain-webhook-service/src/config.ts` (after the `screensSigninEnabled` line)
- Create: `olbrain-webhook-service/src/researchStore.ts`
- Test: `olbrain-webhook-service/tests/researchStore.test.ts`

**Interfaces:**
- Produces (config): `researchAgentApiEnabled: boolean`, `researchDesignUrl: string`, `researchRuntimeUrl: string`, `stepsStreamMaxSeconds: number`.
- Produces (researchStore):
  - `COLLECTIONS`, `type OwnedKind = "session" | "run" | "plan"`
  - `readOwned(kind: OwnedKind, id: string, agentId: string, d?): Promise<Record<string, unknown> | null>`
  - `toWire(v: unknown): unknown` — Timestamps become ISO strings, recursively
  - `etagOf(data: unknown): string`
  - `MESSAGE_WINDOW = 100`; `readMessages(sessionId, before?: string, d?): Promise<unknown[]>`
  - `readReportVersions(runId, d?): Promise<unknown[]>`; `readTemplateRuns(agentId, d?): Promise<unknown[]>`
  - `TERMINAL_RUN_STATUSES: Set<string>`; `stepCursor(ts: Timestamp): string`; `parseStepCursor(s: string): Timestamp | null`
  - `type StepFrame = { step: unknown; cursor: string }`
  - `watchSteps(runId, after: Timestamp | null, onSteps: (f: StepFrame[]) => void, onError: (e: Error) => void, d?): () => void`
  - `readStepsAfter(runId, after: Timestamp | null, d?): Promise<StepFrame[]>`
  - `watchRunStatus(runId, onStatus: (s: string | null) => void, onError: (e: Error) => void, d?): () => void`

- [ ] **Step 1: Write the failing tests**

Create `tests/researchStore.test.ts`:

```ts
import { Timestamp } from "@google-cloud/firestore";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config.js", () => ({ config: { gcpProjectId: "test-proj" } }));

import { etagOf, parseStepCursor, readOwned, stepCursor, toWire } from "../src/researchStore.js";
import { fakeFirestore } from "./helpers/fakeFirestore.js";

describe("readOwned — the access rule for research ids", () => {
  const db = fakeFirestore({
    "research_runs/r1": { template_id: "agent-A", status: "running" },
    "research_chat_sessions/s1": { template_id: "agent-A", started_by: "u1" },
    "research_plans/p1": { template_id: "agent-B" },
    "research_runs/r2": { status: "running" },
  }) as never;

  it("returns the doc when it belongs to the agent", async () => {
    expect(await readOwned("run", "r1", "agent-A", db)).toMatchObject({ status: "running" });
    expect(await readOwned("session", "s1", "agent-A", db)).toMatchObject({ started_by: "u1" });
    expect(await readOwned("plan", "p1", "agent-B", db)).not.toBeNull();
  });

  it("is null for another agent's doc, a missing doc, and a doc with no template_id", async () => {
    expect(await readOwned("run", "r1", "agent-B", db)).toBeNull();
    expect(await readOwned("plan", "p1", "agent-A", db)).toBeNull();
    expect(await readOwned("run", "nope", "agent-A", db)).toBeNull();
    expect(await readOwned("run", "r2", "agent-A", db)).toBeNull();
  });
});

describe("toWire", () => {
  it("turns Timestamps into ISO strings at any depth and leaves the rest alone", () => {
    const ts = new Timestamp(1_760_000_000, 0);
    const iso = ts.toDate().toISOString();
    expect(toWire({ a: ts, b: [{ c: ts }], d: "x", e: null, f: 3 })).toEqual({ a: iso, b: [{ c: iso }], d: "x", e: null, f: 3 });
  });
});

describe("etagOf", () => {
  it("is stable for equal data and changes with it", () => {
    expect(etagOf({ a: 1 })).toBe(etagOf({ a: 1 }));
    expect(etagOf({ a: 1 })).not.toBe(etagOf({ a: 2 }));
  });
});

describe("step cursors", () => {
  it("encode seconds and 9-digit nanos exactly, and round-trip", () => {
    expect(stepCursor(new Timestamp(12, 5))).toBe("12.000000005");
    expect(parseStepCursor("12.000000005")?.isEqual(new Timestamp(12, 5))).toBe(true);
  });

  it.each(["", "12", "12.5", "x.000000001", "1.0000000001", "-1.000000000"])("rejects %j", (s) => {
    expect(parseStepCursor(s)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/researchStore.test.ts`
Expected: FAIL — `Cannot find module '../src/researchStore.js'`.

- [ ] **Step 3: Add the config**

In `src/config.ts`, directly after the line
`  screensSigninEnabled: (process.env.SCREENS_SIGNIN_ENABLED ?? "false").toLowerCase() === "true",`
insert:

```ts
  // Research agents on the Agent API (olbrain-sdk spec 2026-10-09): sign-ins
  // only. Off → the /api/agents/:id/research/* routes aren't mounted (404).
  researchAgentApiEnabled: (process.env.RESEARCH_AGENT_API_ENABLED ?? "false").toLowerCase() === "true",
  // Base URLs, no trailing path — forward target AND OIDC audience, like the
  // shared runtimes. Required only while the switch is on (research.ts checks).
  researchDesignUrl: process.env.RESEARCH_DESIGN_URL ?? "",
  researchRuntimeUrl: process.env.RESEARCH_RUNTIME_URL ?? "",
  // A run-steps SSE ends itself with a reconnect frame after this long; the
  // SDK reopens from its cursor. 25 keeps under the LB's timeout_sec = 30
  // until that is shown not to apply to this serverless NEG; then 840.
  stepsStreamMaxSeconds: Number(process.env.STEPS_STREAM_MAX_SECONDS ?? 25),
```

- [ ] **Step 4: Write the store**

Create `src/researchStore.ts`:

```ts
/**
 * Firestore reads behind the research routes (olbrain-sdk spec
 * 2026-10-09-research-agent-api-design). These are admin reads, so
 * firestore.rules don't apply: research.ts runs readOwned() on every
 * session/run/plan id in a path before anything else. That check IS the
 * access rule for screen users.
 */
import { createHash } from "node:crypto";
import { Firestore, Timestamp } from "@google-cloud/firestore";
import type { QueryDocumentSnapshot } from "@google-cloud/firestore";

import { config } from "./config.js";

let defaultDb: Firestore | null = null;
const db = (): Firestore => (defaultDb ??= new Firestore({ projectId: config.gcpProjectId }));

export const COLLECTIONS = {
  session: "research_chat_sessions",
  run: "research_runs",
  plan: "research_plans",
} as const;
export type OwnedKind = keyof typeof COLLECTIONS;
type Data = Record<string, unknown>;

/** The doc when it exists AND belongs to this research agent (template id == agent id), else null. */
export async function readOwned(kind: OwnedKind, id: string, agentId: string, d: Firestore = db()): Promise<Data | null> {
  const data = (await d.collection(COLLECTIONS[kind]).doc(id).get()).data();
  return data && typeof data.template_id === "string" && data.template_id === agentId ? data : null;
}

/** Firestore Timestamps → ISO strings, recursively; everything else as-is. */
export function toWire(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(toWire);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toWire(x)]));
  return v;
}

export const etagOf = (data: unknown): string => createHash("sha1").update(JSON.stringify(data)).digest("hex");

export const MESSAGE_WINDOW = 100;

/** The newest MESSAGE_WINDOW messages — or the page older than `before` — in reading order (noesis subscribeMessages / loadOlderMessages). */
export async function readMessages(sessionId: string, before?: string, d: Firestore = db()): Promise<unknown[]> {
  let q = d.collection(COLLECTIONS.session).doc(sessionId).collection("messages").orderBy("ts", "desc");
  if (before) q = q.startAfter(before);
  const snap = await q.limit(MESSAGE_WINDOW).get();
  return snap.docs.map((m) => toWire({ id: m.id, ...m.data() })).reverse();
}

export async function readReportVersions(runId: string, d: Firestore = db()): Promise<unknown[]> {
  const snap = await d.collection(COLLECTIONS.run).doc(runId).collection("report_versions").orderBy("version", "desc").get();
  return snap.docs.map((v) => toWire(v.data()));
}

/** Every run of this agent, newest first. ponytail: unbounded, as noesis's subscribeRunsForTemplate is — no (template_id, triggered_at) index exists; add one + limit when run counts demand it. */
export async function readTemplateRuns(agentId: string, d: Firestore = db()): Promise<unknown[]> {
  const snap = await d.collection(COLLECTIONS.run).where("template_id", "==", agentId).get();
  const runs = snap.docs.map((r) => toWire({ id: r.id, ...r.data() }) as Data);
  return runs.sort((a, b) => String(b.triggered_at ?? "").localeCompare(String(a.triggered_at ?? "")));
}

// awaiting_review is NOT terminal: the claim-review gate parks a run there and resumes it.
export const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "canceled"]);

/** `<seconds>.<9-digit nanos>` — exact, so a resumed stream neither skips nor repeats a step. */
export const stepCursor = (ts: Timestamp): string => `${ts.seconds}.${String(ts.nanoseconds).padStart(9, "0")}`;

export function parseStepCursor(s: string): Timestamp | null {
  const m = /^(\d{1,12})\.(\d{9})$/.exec(s);
  return m ? new Timestamp(Number(m[1]), Number(m[2])) : null;
}

export type StepFrame = { step: unknown; cursor: string };

function stepsQuery(runId: string, after: Timestamp | null, d: Firestore) {
  const q = d.collection(COLLECTIONS.run).doc(runId).collection("steps").orderBy("ts");
  return after ? q.startAfter(after) : q;
}

const toFrame = (doc: QueryDocumentSnapshot): StepFrame => ({
  step: toWire({ id: doc.id, ...doc.data() }),
  cursor: stepCursor(doc.data().ts as Timestamp),
});

/** Live steps after the cursor. onSteps gets each snapshot's added steps in ts order; its first call is the backlog (possibly empty). */
export function watchSteps(
  runId: string,
  after: Timestamp | null,
  onSteps: (frames: StepFrame[]) => void,
  onError: (e: Error) => void,
  d: Firestore = db(),
): () => void {
  return stepsQuery(runId, after, d).onSnapshot(
    (snap) => onSteps(snap.docChanges().filter((ch) => ch.type === "added").map((ch) => toFrame(ch.doc))),
    onError,
  );
}

/** One-shot read of the steps after the cursor — the final flush before `end`. */
export async function readStepsAfter(runId: string, after: Timestamp | null, d: Firestore = db()): Promise<StepFrame[]> {
  return (await stepsQuery(runId, after, d).get()).docs.map(toFrame);
}

export function watchRunStatus(
  runId: string,
  onStatus: (status: string | null) => void,
  onError: (e: Error) => void,
  d: Firestore = db(),
): () => void {
  return d.collection(COLLECTIONS.run).doc(runId).onSnapshot(
    (s) => onStatus((s.data()?.status as string | undefined) ?? null),
    onError,
  );
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run tests/researchStore.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/researchStore.ts tests/researchStore.test.ts
git commit -m "feat(research): Firestore store with the ownership check and step cursors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Forward routes (allowlist, guard, CORS, kill switch)

**Files:**
- Create: `olbrain-webhook-service/src/research.ts`
- Modify: `olbrain-webhook-service/src/server.ts`
- Test: `olbrain-webhook-service/tests/research.test.ts`

**Interfaces:**
- Consumes: `authenticateKeyOrUser(c, agentId, { kind: "research", mutating })` (Task 1); `readOwned`, `OwnedKind` (Task 2); `forward(ForwardInput)` from `src/forward.ts` (existing: `{ targetUrl, oidcAudience, method, inboundHeaders, streamingBody?, timeoutMs?, trusted }` → `{ status, headers, body }`); `errorResponse(c, status, code)` from `src/auth.ts`; `getRequestId(c)` from `src/errors.ts`.
- Produces: `mountResearchRoutes(app: Hono): void`; `FORWARD_ROUTES` (29 entries); in-module helpers `re`, `SEG`, `match`, `owned`, `notFound` that Tasks 4 and 5 reuse.

- [ ] **Step 1: Write the failing tests**

Create `tests/research.test.ts`:

```ts
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cfg } = vi.hoisted(() => ({
  cfg: {
    researchAgentApiEnabled: true,
    researchDesignUrl: "https://design.test",
    researchRuntimeUrl: "https://runtime.test/",
    agentApiAllowedOrigins: ["https://screens.olbrain.com"],
    stepsStreamMaxSeconds: 25,
    screensSigninEnabled: true,
  },
}));
vi.mock("../src/config.js", () => ({ config: cfg }));
vi.mock("../src/lookup.js", () => ({ authenticate: vi.fn(), resolveKeyOrganizationId: vi.fn(), lookupAgent: vi.fn() }));
vi.mock("../src/usage.js", () => ({ recordUsage: vi.fn() }));
vi.mock("../src/dailySignals.js", () => ({ recordFirstOfDay: vi.fn(), currentDateString: vi.fn(() => "2026-10-09") }));
vi.mock("../src/burstDetection.js", () => ({ maybeCheckBurst: vi.fn() }));
vi.mock("../src/notificationEmitter.js", () => ({ emitV2Activity: vi.fn(), SYSTEM_ACTOR_ID: "system_olbrain-webhook-service" }));
vi.mock("../src/signIn.js", () => ({ verifyFirebaseIdToken: vi.fn() }));
vi.mock("../src/screensAccess.js", () => ({ canUseScreens: vi.fn(), isScreenAgent: vi.fn() }));
vi.mock("../src/auth.js", async (orig) => ({
  ...(await orig<typeof import("../src/auth.js")>()),
  authenticateKeyOrUser: vi.fn(),
}));
vi.mock("../src/forward.js", () => ({ forward: vi.fn() }));
vi.mock("../src/researchStore.js", async (orig) => ({
  ...(await orig<typeof import("../src/researchStore.js")>()),
  readOwned: vi.fn(),
  readMessages: vi.fn(),
  readReportVersions: vi.fn(),
  readTemplateRuns: vi.fn(),
  watchSteps: vi.fn(),
  watchRunStatus: vi.fn(),
  readStepsAfter: vi.fn(),
}));

import { authenticateKeyOrUser } from "../src/auth.js";
import { forward } from "../src/forward.js";
import { mountResearchRoutes } from "../src/research.js";
import { readOwned } from "../src/researchStore.js";

const AUTH = { agentId: "ra-1", organizationId: "org-A", runtimeKind: "research", keyId: null, actorUid: "u1" };
function app() {
  const a = new Hono();
  mountResearchRoutes(a);
  return a;
}
const call = (path: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) =>
  app().request(`/api/agents/ra-1/research/${path}`, {
    method: init.method ?? "GET",
    body: init.body,
    headers: { authorization: "Bearer eyJ.user", ...(init.headers ?? {}) },
  });
const upstream = (status: number, body: string, contentType = "application/json") => ({
  status, headers: new Headers({ "content-type": contentType }), body: new Response(body).body,
});

beforeEach(() => {
  vi.mocked(authenticateKeyOrUser).mockResolvedValue({ auth: AUTH } as never);
  vi.mocked(readOwned).mockImplementation(async (_kind, id) => (id.endsWith("9") ? null : { template_id: "ra-1" }));
  vi.mocked(forward).mockImplementation(async () => upstream(200, '{"ok":true}'));
});
afterEach(() => {
  vi.clearAllMocks();
  cfg.researchAgentApiEnabled = true;
  cfg.researchDesignUrl = "https://design.test";
  cfg.stepsStreamMaxSeconds = 25;
});

const D = "https://design.test";
const R = "https://runtime.test";
// The spec's allowlist, written out independently of src/research.ts so a typo in either shows up here.
const ROWS: [string, string, string, string][] = [
  ["POST", "sessions", R, "/api/templates/ra-1/sessions"],
  ["GET", "sessions?archived=true", R, "/api/templates/ra-1/sessions?archived=true"],
  ["GET", "sessions/s1", R, "/api/templates/ra-1/sessions/s1"],
  ["PATCH", "sessions/s1", R, "/api/templates/ra-1/sessions/s1"],
  ["DELETE", "sessions/s1", R, "/api/templates/ra-1/sessions/s1"],
  ["GET", "sessions/s1/models", R, "/api/templates/ra-1/sessions/s1/models"],
  ["PUT", "sessions/s1/model", R, "/api/templates/ra-1/sessions/s1/model"],
  ["PUT", "sessions/s1/review-model", R, "/api/templates/ra-1/sessions/s1/review-model"],
  ["POST", "sessions/s1/messages/stream", R, "/api/templates/ra-1/sessions/s1/messages/stream"],
  ["POST", "sessions/s1/messages/m1/approve-plan", R, "/api/templates/ra-1/sessions/s1/messages/m1/approve-plan"],
  ["POST", "sessions/s1/plans/p1/approve", R, "/api/templates/ra-1/sessions/s1/plans/p1/approve"],
  ["POST", "sessions/s1/attachments", R, "/api/templates/ra-1/sessions/s1/attachments"],
  ["POST", "sessions/s1/attachment-url", R, "/api/templates/ra-1/sessions/s1/attachment-url"],
  ["POST", "runs/r1/cancel", D, "/api/runs/r1/cancel"],
  ["POST", "runs/r1/retry", R, "/api/runs/r1/retry"],
  ["GET", "runs/r1/active-job", R, "/api/runs/r1/active-job"],
  ["POST", "runs/r1/claims/resolve", D, "/api/runs/r1/claims/resolve"],
  ["GET", "reports/r1?version=3", D, "/api/reports/r1?version=3"],
  ["GET", "reports/r1/artifacts/deck_main/pdf", D, "/api/reports/r1/artifacts/deck_main/pdf"],
  ["GET", "reports/r1/evidence", D, "/api/reports/r1/evidence"],
  ["GET", "reports/r1/share", D, "/api/reports/r1/share"],
  ["PUT", "reports/r1/share", D, "/api/reports/r1/share"],
  ["POST", "reports/r1/share/revoke", D, "/api/reports/r1/share/revoke"],
  ["GET", "reports/r1/review", D, "/api/reports/r1/review"],
  ["POST", "runs/r1/review", R, "/api/runs/r1/review"],
  ["POST", "runs/r1/review/apply", R, "/api/runs/r1/review/apply"],
  ["POST", "runs/r1/review/stream", R, "/api/runs/r1/review/stream"],
  ["POST", "runs/r1/review/apply/stream", R, "/api/runs/r1/review/apply/stream"],
  ["GET", "versions", D, "/api/templates/ra-1/versions"],
];
const LONG = new Set(["runs/r1/review", "runs/r1/review/apply", "runs/r1/review/stream", "runs/r1/review/apply/stream", "sessions/s1/messages/stream"]);

describe("research forward routes", () => {
  it("lists exactly the spec's 29 rows", () => expect(ROWS).toHaveLength(29));

  it.each(ROWS)("%s %s is forwarded as the user", async (method, path, base, target) => {
    const hasBody = method !== "GET" && method !== "DELETE";
    const res = await call(path, { method, ...(hasBody ? { body: "{}", headers: { "content-type": "application/json" } } : {}) });
    expect(res.status).toBe(200);
    expect(authenticateKeyOrUser).toHaveBeenCalledWith(expect.anything(), "ra-1", { kind: "research", mutating: method !== "GET" });
    const input = vi.mocked(forward).mock.calls[0][0];
    expect(input.targetUrl).toBe(`${base}${target}`);
    expect(input.oidcAudience).toBe(base);
    expect(input.method).toBe(method);
    expect(input.inboundHeaders.get("x-user-authorization")).toBe("Bearer eyJ.user");
    expect(input.timeoutMs).toBe(LONG.has(path) ? 600_000 : undefined);
    expect(input.trusted).toMatchObject({ organizationId: "org-A", runtimeKind: "research", agentId: "ra-1", signin: true });
  });

  it("replaces a client-sent X-User-Authorization with the verified bearer", async () => {
    await call("sessions/s1", { headers: { "x-user-authorization": "Bearer someone-else" } });
    expect(vi.mocked(forward).mock.calls[0][0].inboundHeaders.get("x-user-authorization")).toBe("Bearer eyJ.user");
  });

  it.each([
    ["GET", "nope"],
    ["POST", "v1/runs"],
    ["POST", "pubsub/run-events"],
    ["GET", "internal/anything"],
    ["DELETE", "runs/r1/cancel"],
    ["GET", "sessions/a%2Fb"],
    ["GET", "sessions/../../internal"],
    ["GET", "sessions/s1/"],
  ])("%s %s is 404 before authentication and never forwarded", async (method, path) => {
    const res = await call(path, { method });
    expect(res.status).toBe(404);
    expect(authenticateKeyOrUser).not.toHaveBeenCalled();
    expect(forward).not.toHaveBeenCalled();
  });

  it("returns the admission's own refusal", async () => {
    vi.mocked(authenticateKeyOrUser).mockResolvedValue({ response: new Response(null, { status: 401 }) } as never);
    expect((await call("sessions/s1")).status).toBe(401);
    expect(forward).not.toHaveBeenCalled();
  });

  it.each([
    ["sessions/s9", "session", "s9"],
    ["runs/r9/cancel", "run", "r9"],
    ["reports/r9/evidence", "run", "r9"],
    ["sessions/s1/plans/p9/approve", "plan", "p9"],
  ])("%s: another agent's %s is 404 and never forwarded", async (path, kind, id) => {
    const res = await call(path, { method: path.endsWith("approve") || path.endsWith("cancel") ? "POST" : "GET" });
    expect(res.status).toBe(404);
    expect(readOwned).toHaveBeenCalledWith(kind, id, "ra-1");
    expect(forward).not.toHaveBeenCalled();
  });

  it("checks the session, not the message id, on approve-plan", async () => {
    await call("sessions/s1/messages/m9/approve-plan", { method: "POST", body: "{}" });
    expect(vi.mocked(readOwned).mock.calls).toEqual([["session", "s1", "ra-1"]]);
    expect(forward).toHaveBeenCalled();
  });

  it("passes an upstream 4xx body through verbatim", async () => {
    const detail = '{"detail":{"error":"subject_invalid","message":"Add a subject first","fields":["subject"]}}';
    vi.mocked(forward).mockResolvedValue(upstream(409, detail) as never);
    const res = await call("sessions/s1/plans/p1/approve", { method: "POST", body: "{}" });
    expect(res.status).toBe(409);
    expect(await res.text()).toBe(detail);
  });

  it("collapses an upstream 5xx to upstream_error", async () => {
    vi.mocked(forward).mockResolvedValue(upstream(500, "Traceback ...", "text/plain") as never);
    const res = await call("sessions/s1");
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("upstream_error");
  });

  it("maps a forward timeout to upstream_timeout", async () => {
    vi.mocked(forward).mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const res = await call("sessions/s1");
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("upstream_timeout");
  });

  it("answers a CORS preflight for an allowed origin, PATCH included", async () => {
    const res = await app().request("/api/agents/ra-1/research/sessions/s1", {
      method: "OPTIONS",
      headers: { origin: "https://screens.olbrain.com", "access-control-request-method": "PATCH" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("https://screens.olbrain.com");
    expect(res.headers.get("access-control-allow-methods")).toContain("PATCH");
    const other = await app().request("/api/agents/ra-1/research/sessions/s1", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "PATCH" },
    });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("is not mounted when the switch is off", async () => {
    cfg.researchAgentApiEnabled = false;
    expect((await call("sessions/s1")).status).toBe(404);
    expect(authenticateKeyOrUser).not.toHaveBeenCalled();
  });

  it("refuses to boot with the switch on and a URL missing", () => {
    cfg.researchDesignUrl = "";
    expect(() => app()).toThrow(/RESEARCH_DESIGN_URL/);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/research.test.ts`
Expected: FAIL — `Cannot find module '../src/research.js'`.

- [ ] **Step 3: Write the route module**

Create `src/research.ts`:

```ts
/**
 * Research agents on the Agent API (olbrain-sdk spec
 * 2026-10-09-research-agent-api-design). Sign-ins only. Every request:
 * match the allowlist → admit (kind "research") → check that every
 * session/run/plan id in the path belongs to this agent → forward.
 *
 * The allowlist is load-bearing: research-design/-runtime are IAM-only, and
 * this service's identity holds run.invoker on them — research-runtime's
 * Pub/Sub push routes trust that alone. Nothing outside FORWARD_ROUTES may
 * ever be reachable.
 */
import type { Context, Hono } from "hono";
import { cors } from "hono/cors";

import { authenticateKeyOrUser, errorResponse } from "./auth.js";
import { config } from "./config.js";
import { getRequestId } from "./errors.js";
import { forward } from "./forward.js";
import type { AuthorizedRequest } from "./lookup.js";
import * as store from "./researchStore.js";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type IdKind = store.OwnedKind | "other";

// One path segment: no "/", no "%", no "." — so no traversal and no encoded slashes.
const SEG = "([A-Za-z0-9_-]{1,128})";
const re = (s: string) => new RegExp(`^${s}$`);
const T = (agentId: string) => `/api/templates/${encodeURIComponent(agentId)}`;
// research's own LONG_LLM_CALL_MS headroom: a review pass or a streamed turn runs for minutes.
const LONG_MS = 600_000;

type ForwardRoute = {
  method: Method;
  /** Matched against the path after /research/. */
  path: RegExp;
  /** What each capture group is. session/run/plan are ownership-checked; "other" passes through. */
  ids: IdKind[];
  svc: "design" | "runtime";
  upstream: (agentId: string, g: string[]) => string;
  long?: boolean;
};

export const FORWARD_ROUTES: ForwardRoute[] = [
  { method: "POST", path: re("sessions"), ids: [], svc: "runtime", upstream: (t) => `${T(t)}/sessions` },
  { method: "GET", path: re("sessions"), ids: [], svc: "runtime", upstream: (t) => `${T(t)}/sessions` },
  { method: "GET", path: re(`sessions/${SEG}`), ids: ["session"], svc: "runtime", upstream: (t, [s]) => `${T(t)}/sessions/${s}` },
  { method: "PATCH", path: re(`sessions/${SEG}`), ids: ["session"], svc: "runtime", upstream: (t, [s]) => `${T(t)}/sessions/${s}` },
  { method: "DELETE", path: re(`sessions/${SEG}`), ids: ["session"], svc: "runtime", upstream: (t, [s]) => `${T(t)}/sessions/${s}` },
  { method: "GET", path: re(`sessions/${SEG}/models`), ids: ["session"], svc: "runtime", upstream: (t, [s]) => `${T(t)}/sessions/${s}/models` },
  { method: "PUT", path: re(`sessions/${SEG}/model`), ids: ["session"], svc: "runtime", upstream: (t, [s]) => `${T(t)}/sessions/${s}/model` },
  { method: "PUT", path: re(`sessions/${SEG}/review-model`), ids: ["session"], svc: "runtime", upstream: (t, [s]) => `${T(t)}/sessions/${s}/review-model` },
  { method: "POST", path: re(`sessions/${SEG}/messages/stream`), ids: ["session"], svc: "runtime", upstream: (t, [s]) => `${T(t)}/sessions/${s}/messages/stream`, long: true },
  { method: "POST", path: re(`sessions/${SEG}/messages/${SEG}/approve-plan`), ids: ["session", "other"], svc: "runtime", upstream: (t, [s, m]) => `${T(t)}/sessions/${s}/messages/${m}/approve-plan` },
  { method: "POST", path: re(`sessions/${SEG}/plans/${SEG}/approve`), ids: ["session", "plan"], svc: "runtime", upstream: (t, [s, p]) => `${T(t)}/sessions/${s}/plans/${p}/approve` },
  { method: "POST", path: re(`sessions/${SEG}/attachments`), ids: ["session"], svc: "runtime", upstream: (t, [s]) => `${T(t)}/sessions/${s}/attachments` },
  { method: "POST", path: re(`sessions/${SEG}/attachment-url`), ids: ["session"], svc: "runtime", upstream: (t, [s]) => `${T(t)}/sessions/${s}/attachment-url` },
  { method: "POST", path: re(`runs/${SEG}/cancel`), ids: ["run"], svc: "design", upstream: (_t, [r]) => `/api/runs/${r}/cancel` },
  { method: "POST", path: re(`runs/${SEG}/retry`), ids: ["run"], svc: "runtime", upstream: (_t, [r]) => `/api/runs/${r}/retry` },
  { method: "GET", path: re(`runs/${SEG}/active-job`), ids: ["run"], svc: "runtime", upstream: (_t, [r]) => `/api/runs/${r}/active-job` },
  { method: "POST", path: re(`runs/${SEG}/claims/resolve`), ids: ["run"], svc: "design", upstream: (_t, [r]) => `/api/runs/${r}/claims/resolve` },
  { method: "GET", path: re(`reports/${SEG}`), ids: ["run"], svc: "design", upstream: (_t, [r]) => `/api/reports/${r}` },
  { method: "GET", path: re(`reports/${SEG}/artifacts/${SEG}/${SEG}`), ids: ["run", "other", "other"], svc: "design", upstream: (_t, [r, p, f]) => `/api/reports/${r}/artifacts/${p}/${f}` },
  { method: "GET", path: re(`reports/${SEG}/evidence`), ids: ["run"], svc: "design", upstream: (_t, [r]) => `/api/reports/${r}/evidence` },
  { method: "GET", path: re(`reports/${SEG}/share`), ids: ["run"], svc: "design", upstream: (_t, [r]) => `/api/reports/${r}/share` },
  { method: "PUT", path: re(`reports/${SEG}/share`), ids: ["run"], svc: "design", upstream: (_t, [r]) => `/api/reports/${r}/share` },
  { method: "POST", path: re(`reports/${SEG}/share/revoke`), ids: ["run"], svc: "design", upstream: (_t, [r]) => `/api/reports/${r}/share/revoke` },
  { method: "GET", path: re(`reports/${SEG}/review`), ids: ["run"], svc: "design", upstream: (_t, [r]) => `/api/reports/${r}/review` },
  { method: "POST", path: re(`runs/${SEG}/review`), ids: ["run"], svc: "runtime", upstream: (_t, [r]) => `/api/runs/${r}/review`, long: true },
  { method: "POST", path: re(`runs/${SEG}/review/apply`), ids: ["run"], svc: "runtime", upstream: (_t, [r]) => `/api/runs/${r}/review/apply`, long: true },
  { method: "POST", path: re(`runs/${SEG}/review/stream`), ids: ["run"], svc: "runtime", upstream: (_t, [r]) => `/api/runs/${r}/review/stream`, long: true },
  { method: "POST", path: re(`runs/${SEG}/review/apply/stream`), ids: ["run"], svc: "runtime", upstream: (_t, [r]) => `/api/runs/${r}/review/apply/stream`, long: true },
  { method: "GET", path: re("versions"), ids: [], svc: "design", upstream: (t) => `${T(t)}/versions` },
];

function match<R extends { path: RegExp }>(routes: R[], rest: string): { route: R; groups: string[] } | null {
  for (const route of routes) {
    const m = route.path.exec(rest);
    if (m) return { route, groups: m.slice(1) };
  }
  return null;
}

/** The owned docs (session/run/plan ids, in order), or null when any id isn't this agent's. */
async function owned(ids: IdKind[], groups: string[], agentId: string): Promise<Record<string, unknown>[] | null> {
  const docs: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i++) {
    const kind = ids[i];
    if (kind === "other") continue;
    const doc = await store.readOwned(kind, groups[i], agentId);
    if (!doc) return null;
    docs.push(doc);
  }
  return docs;
}

// Every access failure is the same 404 as an unknown agent (auth.ts's rule).
const notFound = (c: Context) => errorResponse(c, 404, "agent_not_found");

const baseUrl = (svc: ForwardRoute["svc"]) =>
  (svc === "design" ? config.researchDesignUrl : config.researchRuntimeUrl).replace(/\/$/, "");

async function forwardResearch(c: Context, auth: AuthorizedRequest, route: ForwardRoute, groups: string[]): Promise<Response> {
  const base = baseUrl(route.svc);
  const headers = new Headers(c.req.raw.headers);
  // research-design/-runtime read the user from X-User-Authorization; our OIDC
  // token takes Authorization. Set it from the bearer just verified — never
  // trust a copy the client sent.
  headers.set("x-user-authorization", c.req.header("authorization") ?? "");
  try {
    const res = await forward({
      targetUrl: `${base}${route.upstream(auth.agentId, groups)}${new URL(c.req.url).search}`,
      oidcAudience: base,
      method: route.method,
      inboundHeaders: headers,
      streamingBody: route.method === "GET" || route.method === "DELETE" ? null : c.req.raw.body,
      timeoutMs: route.long ? LONG_MS : undefined,
      trusted: {
        organizationId: auth.organizationId,
        runtimeKind: "research",
        agentId: auth.agentId,
        requestId: getRequestId(c),
        signin: true,
      },
    });
    // Research 4xx bodies are written for people (approve-plan's
    // {error, message, fields}, retry's precondition wording) and noesis shows
    // them as-is, so they pass through. The phrase-book rule exists for
    // external customers; these routes have none. 5xx never leaks.
    if (res.status >= 500) return errorResponse(c, 502, "upstream_error");
    return new Response(res.body, { status: res.status, headers: res.headers });
  } catch (err) {
    const aborted = (err as Error).name === "AbortError";
    console.error("research_forward_failed", {
      requestId: getRequestId(c), agentId: auth.agentId, svc: route.svc, method: route.method, aborted, err: (err as Error).message,
    });
    return errorResponse(c, 502, aborted ? "upstream_timeout" : "upstream_error");
  }
}

async function handle(c: Context): Promise<Response> {
  const agentId = c.req.param("agentId");
  const rest = /^\/api\/agents\/[^/]+\/research\/(.*)$/.exec(c.req.path)?.[1] ?? "";
  const method = c.req.method.toUpperCase();
  const fwd = match(FORWARD_ROUTES.filter((r) => r.method === method), rest);
  if (!fwd) return notFound(c);
  const admitted = await authenticateKeyOrUser(c, agentId, { kind: "research", mutating: method !== "GET" });
  if ("response" in admitted) return admitted.response;
  if (!(await owned(fwd.route.ids, fwd.groups, agentId))) return notFound(c);
  return forwardResearch(c, admitted.auth, fwd.route, fwd.groups);
}

export function mountResearchRoutes(app: Hono): void {
  if (!config.researchAgentApiEnabled) return;
  if (!config.researchDesignUrl || !config.researchRuntimeUrl) {
    throw new Error("RESEARCH_AGENT_API_ENABLED is on but RESEARCH_DESIGN_URL / RESEARCH_RUNTIME_URL is unset");
  }
  // Own CORS (agentApiCors.ts allows only GET/POST): same origin allowlist,
  // plus the PUT/PATCH/DELETE the session and share routes need.
  app.use("/api/agents/:agentId/research/*", cors({
    origin: (origin) => (config.agentApiAllowedOrigins.includes(origin) ? origin : null),
    allowHeaders: ["authorization", "content-type", "accept"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 600,
  }));
  app.all("/api/agents/:agentId/research/*", handle);
}
```

- [ ] **Step 4: Mount it**

In `src/server.ts` add the import beside the others:

```ts
import { mountResearchRoutes } from "./research.js";
```

and directly after `mountSessionsRoutes(app);` add:

```ts
// Research agents (sign-ins only, behind RESEARCH_AGENT_API_ENABLED). Mounts
// its own CORS before its routes. See research.ts.
mountResearchRoutes(app);
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run tests/research.test.ts && npm run typecheck`
Expected: PASS. If `sessions/a%2Fb` returns 200, `c.req.path` is decoding `%2F`; switch `rest` to `new URL(c.req.url).pathname` and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/research.ts src/server.ts tests/research.test.ts
git commit -m "feat(research): forward the 29 allowlisted research calls as the signed-in user

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Live snapshot routes

**Files:**
- Modify: `olbrain-webhook-service/src/research.ts`
- Test: `olbrain-webhook-service/tests/research.test.ts` (append)

**Interfaces:**
- Consumes: `owned`, `match`, `re`, `SEG`, `notFound` (Task 3); `toWire`, `etagOf`, `readMessages`, `readReportVersions`, `readTemplateRuns` (Task 2).
- Produces: `GET …/research/live/{sessions/:s | sessions/:s/messages[?before=] | plans/:p | runs/:r | runs/:r/report-versions | runs}` → `200 { etag: string, data }` with `Cache-Control: no-store`. `LIVE_ROUTES` export.

- [ ] **Step 1: Write the failing tests**

Add to the import block at the top of `tests/research.test.ts` (below the `vi.mock` calls, beside the other imports):

```ts
import { Timestamp } from "@google-cloud/firestore";
import { readMessages, readReportVersions, readTemplateRuns } from "../src/researchStore.js";
```

Then append:

```ts
describe("research live snapshots", () => {
  it("serves the session doc with an etag, timestamps as ISO, no-store", async () => {
    const created = new Timestamp(1_760_000_000, 0);
    vi.mocked(readOwned).mockResolvedValue({ template_id: "ra-1", started_by: "u1", created_at: created });
    const res = await call("live/sessions/s1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.data).toEqual({ session_id: "s1", template_id: "ra-1", started_by: "u1", created_at: created.toDate().toISOString() });
    expect(typeof body.etag).toBe("string");
    expect(authenticateKeyOrUser).toHaveBeenCalledWith(expect.anything(), "ra-1", { kind: "research", mutating: false });
  });

  it("keeps the etag for unchanged data and changes it when data changes", async () => {
    vi.mocked(readOwned).mockResolvedValue({ template_id: "ra-1", status: "running" });
    const a = (await (await call("live/runs/r1")).json()).etag;
    const b = (await (await call("live/runs/r1")).json()).etag;
    vi.mocked(readOwned).mockResolvedValue({ template_id: "ra-1", status: "completed" });
    const c = (await (await call("live/runs/r1")).json()).etag;
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it("serves the plan and run docs keyed by their ids", async () => {
    vi.mocked(readOwned).mockResolvedValue({ template_id: "ra-1", status: "proposed" });
    expect((await (await call("live/plans/p1")).json()).data).toMatchObject({ plan_id: "p1", status: "proposed" });
    expect((await (await call("live/runs/r1")).json()).data).toMatchObject({ id: "r1", status: "proposed" });
  });

  it("pages messages with ?before=", async () => {
    vi.mocked(readMessages).mockResolvedValue([{ id: "m1" }]);
    expect((await (await call("live/sessions/s1/messages")).json()).data).toEqual([{ id: "m1" }]);
    expect(readMessages).toHaveBeenLastCalledWith("s1", undefined);
    await call("live/sessions/s1/messages?before=2026-10-09T10%3A00%3A00Z");
    expect(readMessages).toHaveBeenLastCalledWith("s1", "2026-10-09T10:00:00Z");
  });

  it("serves report versions and the agent's runs", async () => {
    vi.mocked(readReportVersions).mockResolvedValue([{ version: 2 }]);
    vi.mocked(readTemplateRuns).mockResolvedValue([{ id: "r1" }]);
    expect((await (await call("live/runs/r1/report-versions")).json()).data).toEqual([{ version: 2 }]);
    expect(readReportVersions).toHaveBeenCalledWith("r1");
    expect((await (await call("live/runs")).json()).data).toEqual([{ id: "r1" }]);
    expect(readTemplateRuns).toHaveBeenCalledWith("ra-1");
  });

  it("another agent's run is 404 and its versions are never read", async () => {
    const res = await call("live/runs/r9/report-versions");
    expect(res.status).toBe(404);
    expect(readReportVersions).not.toHaveBeenCalled();
  });

  it("live paths are GET-only", async () => {
    expect((await call("live/runs/r1", { method: "POST" })).status).toBe(404);
    expect(authenticateKeyOrUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/research.test.ts -t "live snapshots"`
Expected: FAIL — every live path is 404 (no route yet).

- [ ] **Step 3: Add the live routes**

In `src/research.ts`, after `FORWARD_ROUTES` add:

```ts
type LiveRoute = {
  path: RegExp;
  ids: store.OwnedKind[];
  /** docs: the owned docs, in `ids` order, already read by the guard — single-doc reads reuse them. */
  read: (agentId: string, g: string[], q: URLSearchParams, docs: Record<string, unknown>[]) => unknown;
};

// The six Firestore listeners noesis holds, as polled snapshots (the SDK polls them).
export const LIVE_ROUTES: LiveRoute[] = [
  { path: re(`live/sessions/${SEG}`), ids: ["session"], read: (_t, [s], _q, [doc]) => store.toWire({ session_id: s, ...doc }) },
  { path: re(`live/sessions/${SEG}/messages`), ids: ["session"], read: (_t, [s], q) => store.readMessages(s, q.get("before") ?? undefined) },
  { path: re(`live/plans/${SEG}`), ids: ["plan"], read: (_t, [p], _q, [doc]) => store.toWire({ plan_id: p, ...doc }) },
  { path: re(`live/runs/${SEG}`), ids: ["run"], read: (_t, [r], _q, [doc]) => store.toWire({ id: r, ...doc }) },
  { path: re(`live/runs/${SEG}/report-versions`), ids: ["run"], read: (_t, [r]) => store.readReportVersions(r) },
  { path: re("live/runs"), ids: [], read: (t) => store.readTemplateRuns(t) },
];
```

Replace `handle` with:

```ts
async function handle(c: Context): Promise<Response> {
  const agentId = c.req.param("agentId");
  const rest = /^\/api\/agents\/[^/]+\/research\/(.*)$/.exec(c.req.path)?.[1] ?? "";
  const method = c.req.method.toUpperCase();
  const live = method === "GET" ? match(LIVE_ROUTES, rest) : null;
  const fwd = live ? null : match(FORWARD_ROUTES.filter((r) => r.method === method), rest);
  if (!live && !fwd) return notFound(c);
  const admitted = await authenticateKeyOrUser(c, agentId, { kind: "research", mutating: method !== "GET" });
  if ("response" in admitted) return admitted.response;
  if (live) {
    const docs = await owned(live.route.ids, live.groups, agentId);
    if (!docs) return notFound(c);
    const data = await live.route.read(agentId, live.groups, new URL(c.req.url).searchParams, docs);
    c.header("Cache-Control", "no-store");
    return c.json({ etag: store.etagOf(data), data });
  }
  if (!(await owned(fwd!.route.ids, fwd!.groups, agentId))) return notFound(c);
  return forwardResearch(c, admitted.auth, fwd!.route, fwd!.groups);
}
```

- [ ] **Step 4: Run the whole research suite and typecheck**

Run: `npx vitest run tests/research.test.ts && npm run typecheck`
Expected: PASS (forward cases still green).

- [ ] **Step 5: Commit**

```bash
git add src/research.ts tests/research.test.ts
git commit -m "feat(research): polled live snapshots with etags in place of Firestore listeners

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Run-steps SSE

**Files:**
- Modify: `olbrain-webhook-service/src/research.ts`
- Test: `olbrain-webhook-service/tests/research.test.ts` (append)

**Interfaces:**
- Consumes: `watchSteps`, `watchRunStatus`, `readStepsAfter`, `parseStepCursor`, `TERMINAL_RUN_STATUSES`, `StepFrame` (Task 2); `config.stepsStreamMaxSeconds`.
- Produces: `GET …/research/runs/:r/steps/stream[?after=<cursor>]` → `text/event-stream`. Each frame is one `data:` line of JSON: `{"type":"step","step":{…},"cursor":"s.nnnnnnnnn"}`, then exactly one of `{"type":"end","cursor":…}` or `{"type":"reconnect","cursor":…}`. `cursor` is `null` when no step has been seen. Bad `after` → 400 `bad_request`.

- [ ] **Step 1: Write the failing tests**

Add to the import block at the top of `tests/research.test.ts`:

```ts
import { readStepsAfter, watchRunStatus, watchSteps } from "../src/researchStore.js";
import type { StepFrame } from "../src/researchStore.js";
```

Then append:

```ts
describe("research run-steps stream", () => {
  let stepsCb: (f: StepFrame[]) => void;
  let stepsErr: (e: Error) => void;
  let statusCb: (s: string | null) => void;
  const unsubSteps = vi.fn();
  const unsubRun = vi.fn();
  const frames = (text: string) =>
    text.split("\n\n").filter((f) => f.startsWith("data:")).map((f) => JSON.parse(f.slice(5)));
  const step = (id: string, cursor: string): StepFrame => ({ step: { id }, cursor });
  // Returns the response unread: the abort test must cancel a body nothing has locked.
  const openRaw = async (query = "") => {
    const res = await call(`runs/r1/steps/stream${query}`);
    await vi.waitFor(() => expect(watchRunStatus).toHaveBeenCalled());
    return res;
  };
  const open = async (query = "") => {
    const res = await openRaw(query);
    return { res, text: res.text() };
  };

  beforeEach(() => {
    vi.mocked(watchSteps).mockImplementation((_r, _a, onSteps, onError) => { stepsCb = onSteps; stepsErr = onError; return unsubSteps; });
    vi.mocked(watchRunStatus).mockImplementation((_r, onStatus) => { statusCb = onStatus; return unsubRun; });
    vi.mocked(readStepsAfter).mockResolvedValue([]);
  });

  it("streams the backlog, live steps, a final flush, then end", async () => {
    const { res, text } = await open();
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    stepsCb([step("a", "1.000000000"), step("b", "2.000000000")]);
    statusCb("running");
    stepsCb([step("c", "3.000000000")]);
    vi.mocked(readStepsAfter).mockResolvedValue([step("d", "4.000000000")]);
    statusCb("completed");
    const out = frames(await text);
    expect(out.map((f) => f.type)).toEqual(["step", "step", "step", "step", "end"]);
    expect(out[0]).toEqual({ type: "step", step: { id: "a" }, cursor: "1.000000000" });
    expect(out.at(-1)).toEqual({ type: "end", cursor: "4.000000000" });
    expect(vi.mocked(readStepsAfter).mock.calls[0][1]?.isEqual(new Timestamp(3, 0))).toBe(true);
    expect(unsubSteps).toHaveBeenCalled();
    expect(unsubRun).toHaveBeenCalled();
  });

  it("a run already finished when the stream opens still gets its whole backlog before end", async () => {
    const { text } = await open();
    statusCb("completed");
    await new Promise((r) => setTimeout(r, 20));
    expect(readStepsAfter).not.toHaveBeenCalled();
    stepsCb([step("a", "1.000000000"), step("b", "2.000000000")]);
    const out = frames(await text);
    expect(out.map((f) => f.type)).toEqual(["step", "step", "end"]);
  });

  it("awaiting_review is not terminal; the cap sends reconnect with the cursor", async () => {
    cfg.stepsStreamMaxSeconds = 0.05;
    const { text } = await open("?after=5.000000000");
    expect(vi.mocked(watchSteps).mock.calls[0][1]?.isEqual(new Timestamp(5, 0))).toBe(true);
    stepsCb([step("f", "6.000000000")]);
    statusCb("awaiting_review");
    const out = frames(await text);
    expect(out.at(-1)).toEqual({ type: "reconnect", cursor: "6.000000000" });
    expect(readStepsAfter).not.toHaveBeenCalled();
  });

  it("a listener error asks the SDK to reconnect", async () => {
    const { text } = await open("?after=5.000000000");
    stepsErr(new Error("unavailable"));
    expect(frames(await text)).toEqual([{ type: "reconnect", cursor: "5.000000000" }]);
  });

  it("detaches both listeners when the client goes away", async () => {
    const res = await openRaw();
    await res.body!.cancel();
    await vi.waitFor(() => expect(unsubSteps).toHaveBeenCalled());
    expect(unsubRun).toHaveBeenCalled();
  });

  it("a malformed cursor is 400 and opens nothing", async () => {
    const res = await call("runs/r1/steps/stream?after=yesterday");
    expect(res.status).toBe(400);
    expect(watchSteps).not.toHaveBeenCalled();
  });

  it("another agent's run is 404 and opens nothing", async () => {
    const res = await call("runs/r9/steps/stream");
    expect(res.status).toBe(404);
    expect(watchSteps).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/research.test.ts -t "run-steps stream"`
Expected: FAIL — the steps path is 404.

- [ ] **Step 3: Add the stream**

In `src/research.ts` add the import beside `cors`:

```ts
import { streamSSE } from "hono/streaming";
```

After `LIVE_ROUTES` add:

```ts
const STEPS = re(`runs/${SEG}/steps/stream`);

function streamSteps(c: Context, runId: string): Response {
  const after = c.req.query("after") ?? null;
  const start = after === null ? null : store.parseStepCursor(after);
  if (after !== null && !start) return errorResponse(c, 400, "bad_request");
  return streamSSE(c, async (stream) => {
    let cursor = after;
    // A write after the client left rejects; the SDK resumes from its cursor, so drop it.
    const send = (frame: Record<string, unknown>) => stream.writeSSE({ data: JSON.stringify(frame) }).catch(() => {});
    const sendSteps = (frames: store.StepFrame[]) => {
      for (const f of frames) {
        cursor = f.cursor;
        void send({ type: "step", ...f });
      }
    };
    await new Promise<void>((resolve) => {
      let closed = false;
      let stepsReady = false;
      let terminal = false;
      let unsubSteps = () => {};
      let unsubRun = () => {};
      const stop = async (final?: "end" | "reconnect") => {
        if (closed) return;
        closed = true;
        unsubSteps();
        unsubRun();
        clearInterval(heartbeat);
        clearTimeout(cap);
        // Steps written just before the status flip may not have reached the
        // listener yet; one read after the cursor makes sure end loses nothing.
        if (final === "end") {
          try {
            sendSteps(await store.readStepsAfter(runId, cursor === null ? null : store.parseStepCursor(cursor)));
          } catch {
            final = "reconnect";
          }
        }
        if (final) await send({ type: final, cursor });
        resolve();
      };
      // end needs both: a terminal run AND the backlog delivered, or an
      // already-finished run would end before its steps were sent.
      const maybeEnd = () => { if (terminal && stepsReady) void stop("end"); };
      const heartbeat = setInterval(() => void stream.write(": hb\n\n").catch(() => {}), 15_000);
      const cap = setTimeout(() => void stop("reconnect"), config.stepsStreamMaxSeconds * 1000);
      stream.onAbort(() => void stop());
      unsubSteps = store.watchSteps(runId, start, (frames) => {
        if (closed) return;
        sendSteps(frames);
        stepsReady = true;
        maybeEnd();
      }, () => void stop("reconnect"));
      unsubRun = store.watchRunStatus(runId, (status) => {
        terminal = status !== null && store.TERMINAL_RUN_STATUSES.has(status);
        maybeEnd();
      }, () => void stop("reconnect"));
      // A stop that landed while subscribing ran the placeholder unsubscribes.
      if (closed) { unsubSteps(); unsubRun(); }
    });
  });
}
```

Replace `handle` with its final form:

```ts
async function handle(c: Context): Promise<Response> {
  const agentId = c.req.param("agentId");
  const rest = /^\/api\/agents\/[^/]+\/research\/(.*)$/.exec(c.req.path)?.[1] ?? "";
  const method = c.req.method.toUpperCase();
  const steps = method === "GET" ? STEPS.exec(rest) : null;
  const live = method === "GET" && !steps ? match(LIVE_ROUTES, rest) : null;
  const fwd = steps || live ? null : match(FORWARD_ROUTES.filter((r) => r.method === method), rest);
  if (!steps && !live && !fwd) return notFound(c);
  const admitted = await authenticateKeyOrUser(c, agentId, { kind: "research", mutating: method !== "GET" });
  if ("response" in admitted) return admitted.response;
  if (steps) {
    if (!(await owned(["run"], [steps[1]], agentId))) return notFound(c);
    return streamSteps(c, steps[1]);
  }
  if (live) {
    const docs = await owned(live.route.ids, live.groups, agentId);
    if (!docs) return notFound(c);
    const data = await live.route.read(agentId, live.groups, new URL(c.req.url).searchParams, docs);
    c.header("Cache-Control", "no-store");
    return c.json({ etag: store.etagOf(data), data });
  }
  if (!(await owned(fwd!.route.ids, fwd!.groups, agentId))) return notFound(c);
  return forwardResearch(c, admitted.auth, fwd!.route, fwd!.groups);
}
```

- [ ] **Step 4: Run the full webhook suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: every new test PASSES and the pre-existing counts match the Task 0 baseline.

- [ ] **Step 5: Commit**

```bash
git add src/research.ts tests/research.test.ts
git commit -m "feat(research): run steps over SSE with a resumable cursor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Terraform — env, kill switch, invoker grants

**Files:**
- Modify: `olbrain-webhook-service/terraform/variables.tf` (append)
- Modify: `olbrain-webhook-service/terraform/dispatcher.tf` (env after `SCREENS_SIGNIN_ENABLED`; IAM resource after `dispatcher_public`)
- Modify: `olbrain-webhook-service/terraform/terraform.tfvars.example` (append)

**Interfaces:**
- Produces: env `RESEARCH_AGENT_API_ENABLED`, `RESEARCH_DESIGN_URL`, `RESEARCH_RUNTIME_URL`, `STEPS_STREAM_MAX_SECONDS` on the dispatcher; `roles/run.invoker` for the dispatcher SA on `olbrain-research-design` and `olbrain-research-runtime`.

- [ ] **Step 1: Variables**

Append to `terraform/variables.tf`:

```hcl
variable "research_agent_api_enabled" {
  description = "Research agents on the Agent API (sign-ins only; olbrain-sdk spec 2026-10-09). Off: /api/agents/:id/research/* isn't mounted (404)."
  type        = bool
  default     = false
}

variable "research_design_url" {
  description = "Base URL of olbrain-research-design (no trailing path). Forward target and OIDC audience. Required while research_agent_api_enabled is true — the service refuses to boot without it."
  type        = string
  default     = ""
}

variable "research_runtime_url" {
  description = "Base URL of olbrain-research-runtime (no trailing path). Forward target and OIDC audience. Required while research_agent_api_enabled is true."
  type        = string
  default     = ""
}

variable "steps_stream_max_seconds" {
  description = "How long one run-steps SSE stays open before it asks the SDK to reconnect. 25 while the LB's timeout_sec = 30 is unproven for this serverless NEG; 840 once it is shown not to apply."
  type        = number
  default     = 25
}
```

- [ ] **Step 2: Env blocks**

In `terraform/dispatcher.tf`, directly after

```hcl
      env {
        name  = "SCREENS_SIGNIN_ENABLED"
        value = tostring(var.screens_signin_enabled)
      }
```

insert:

```hcl
      env {
        name  = "RESEARCH_AGENT_API_ENABLED"
        value = tostring(var.research_agent_api_enabled)
      }
      env {
        name  = "RESEARCH_DESIGN_URL"
        value = var.research_design_url
      }
      env {
        name  = "RESEARCH_RUNTIME_URL"
        value = var.research_runtime_url
      }
      env {
        name  = "STEPS_STREAM_MAX_SECONDS"
        value = tostring(var.steps_stream_max_seconds)
      }
```

- [ ] **Step 3: Invoker grants**

In `terraform/dispatcher.tf`, after the `google_cloud_run_v2_service_iam_member "dispatcher_public"` resource, add:

```hcl
# The research routes call olbrain-research-design / -runtime (both
# --no-allow-unauthenticated) with the dispatcher's own OIDC token; the user's
# Firebase token rides in X-User-Authorization. iam_member is additive — it
# adds one binding and never rewrites those services' policies.
resource "google_cloud_run_v2_service_iam_member" "dispatcher_invokes_research" {
  for_each = toset(["olbrain-research-design", "olbrain-research-runtime"])
  project  = var.project_id
  location = var.region
  name     = each.key
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.dispatcher.email}"
}
```

- [ ] **Step 4: Example values**

Append to `terraform/terraform.tfvars.example`:

```hcl
research_agent_api_enabled = false
research_design_url        = "https://olbrain-research-design-<hash>-el.a.run.app"
research_runtime_url       = "https://olbrain-research-runtime-<hash>-el.a.run.app"
steps_stream_max_seconds   = 25
```

- [ ] **Step 5: Validate**

Run: `cd terraform && terraform fmt -check && terraform init -backend=false -input=false >/dev/null && terraform validate`
Expected: `Success! The configuration is valid.` (`fmt -check` prints nothing.) Do NOT run `plan`/`apply` here — that's Task 11, with prod credentials and the user present.

- [ ] **Step 6: Commit**

```bash
git add terraform/variables.tf terraform/dispatcher.tf terraform/terraform.tfvars.example
git commit -m "infra(research): env, kill switch and run.invoker on the research services

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: SDK transport — every method, FormData, streams, `ApiError.detail`, `readSse`

**Files:**
- Modify: `olbrain-sdk/packages/js/src/core/exceptions.ts` (`ApiError`)
- Create: `olbrain-sdk/packages/js/src/core/sse.ts`
- Modify: `olbrain-sdk/packages/js/src/core/olbrain.ts` (`request` → `send` + `request` + `toError`)
- Test: `olbrain-sdk/packages/js/tests/sse.test.ts`, `tests/olbrain.test.ts` (append)

**Interfaces:**
- Produces:
  - `new ApiError(status, code, message, detail?)` with `.detail: unknown`.
  - `readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown>` — yields each frame's `data:` payload parsed as JSON; skips comments and non-JSON.
  - Private on `Olbrain`: `send(method: Method, path, body?, opts?: { signal?: AbortSignal; stream?: boolean; timeoutMs?: number }): Promise<Response>` (throws mapped errors; timeout covers headers only; caller's signal aborts the whole exchange); `request<T>(method, path, body?, opts?: { timeoutMs?: number }): Promise<T>`.
  - `type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'` exported from `src/core/research.ts` in Task 8. Until then, declare it in `olbrain.ts`; Task 8 moves it.

All commands in this and later SDK tasks run from `olbrain-sdk/packages/js`.

- [ ] **Step 1: Write the failing tests**

Create `tests/sse.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readSse } from '../src/core/sse';

const body = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const e = new TextEncoder();
      chunks.forEach((x) => c.enqueue(e.encode(x)));
      c.close();
    },
  });
const all = async (b: ReadableStream<Uint8Array>) => {
  const out: unknown[] = [];
  for await (const f of readSse(b)) out.push(f);
  return out;
};

describe('readSse', () => {
  it('reassembles a frame cut mid-JSON across chunks', async () => {
    expect(await all(body('data: {"type":"text_de', 'lta","text":"hi"}\n', '\n'))).toEqual([{ type: 'text_delta', text: 'hi' }]);
  });

  it('joins multi-line data and skips comments, empty frames and non-JSON', async () => {
    expect(await all(body(': hb\n\n', 'data: {"a":\ndata: 1}\n\n', 'data: not json\n\n', 'event: x\n\n', 'data: {"b":2}\n\n'))).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('drops a trailing partial frame', async () => {
    expect(await all(body('data: {"a":1}\n\ndata: {"b"'))).toEqual([{ a: 1 }]);
  });
});
```

Append to `tests/olbrain.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/sse.test.ts tests/olbrain.test.ts`
Expected: FAIL — `../src/core/sse` missing; `err.detail` undefined.

- [ ] **Step 3: `ApiError.detail`**

In `src/core/exceptions.ts` replace the `ApiError` class with:

```ts
export class ApiError extends OlbrainError {
  status: number;
  code: string;
  /** The upstream's parsed `detail`, when it sent one (e.g. a 409's `{error, message, fields}`). */
  detail?: unknown;
  constructor(status: number, code: string, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
```

- [ ] **Step 4: `readSse`**

Create `src/core/sse.ts`:

```ts
/**
 * The one SSE reader. Real traffic splits frames across network chunks, so
 * bytes accumulate and split on the blank line between frames — never one
 * chunk as one frame. Yields each frame's `data:` payload parsed as JSON;
 * comments (heartbeats), data-less frames and non-JSON payloads are skipped,
 * as noesis's research stream reader does.
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buf += decoder.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
        if (!data) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        yield parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

- [ ] **Step 5: The `send` transport**

In `src/core/olbrain.ts`, add near the other module constants:

```ts
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
```

Replace the private `request` method with these three:

```ts
  /**
   * One authenticated call. The timeout covers getting the response headers
   * only — a stream's body may run for minutes. The caller's signal aborts the
   * whole exchange, body included.
   */
  private async send(
    method: Method,
    path: string,
    body?: unknown,
    opts: { signal?: AbortSignal; stream?: boolean; timeoutMs?: number } = {},
  ): Promise<Response> {
    const token = this.config.apiKey ?? (await this.config.getIdToken!());
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (opts.stream) headers.Accept = 'text/event-stream';
    const controller = new AbortController();
    if (opts.signal?.aborted) controller.abort();
    opts.signal?.addEventListener('abort', () => controller.abort());
    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const e = err as Error;
      if (e?.name !== 'AbortError') throw new NetworkError(e?.message || 'Network error');
      throw new NetworkError(opts.signal?.aborted ? 'Request aborted' : `Request timed out after ${timeoutMs}ms`);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw await this.toError(res);
    return res;
  }

  private async request<T>(method: Method, path: string, body?: unknown, opts: { timeoutMs?: number } = {}): Promise<T> {
    const res = await this.send(method, path, body, opts);
    return (await res.json().catch(() => undefined)) as T;
  }

  private async toError(res: Response): Promise<Error> {
    const data: any = await res.json().catch(() => undefined);
    // Our API: {error:{code,message}}. Runtime errors pass through as FastAPI {detail: string | {code,message} | [...]}.
    const detail = data?.detail;
    const pick = (k: 'code' | 'message'): string | undefined =>
      [data?.error?.[k], typeof detail === 'object' && !Array.isArray(detail) ? detail?.[k] : undefined, data?.[k]]
        .find((v) => typeof v === 'string' && v);
    const code: string = pick('code') ?? 'error';
    const message: string = data?.error?.message
      ?? (typeof detail === 'string' && detail ? detail : undefined)
      ?? pick('message')
      ?? (res.statusText || 'Request failed');
    if (BILLING_CODES.has(code)) return new BillingError(res.status, code, message);
    if (res.status === 401) return new AuthenticationError(message);
    if (res.status === 404) return new NotFoundError(code, message);
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      return new RateLimitError(message, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
    }
    return new ApiError(res.status, code, message, detail);
  }
```

The existing `workflows`, `runs`, `approvals` and `control` call `this.request('GET' | 'POST', …)` unchanged.

- [ ] **Step 6: Run the whole SDK suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS, including every pre-existing `olbrain.test.ts` case (error mapping, token per request, timeouts).

- [ ] **Step 7: Commit**

```bash
git add src/core/exceptions.ts src/core/sse.ts src/core/olbrain.ts tests/sse.test.ts tests/olbrain.test.ts
git commit -m "feat(js): transport for every method, FormData and streams; ApiError.detail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: SDK `research` namespace — forwarded calls and streams

**Files:**
- Create: `olbrain-sdk/packages/js/src/core/research.ts`
- Modify: `olbrain-sdk/packages/js/src/core/olbrain.ts` (move `Method` import; add `research`)
- Test: `olbrain-sdk/packages/js/tests/research.test.ts`

**Interfaces:**
- Consumes: `send`/`request` (Task 7), `readSse` (Task 7).
- Produces: `createResearch(t: ResearchTransport)`; `ResearchTransport { request<T>(method, path, body?, opts?: { timeoutMs?: number }): Promise<T>; stream(method, path, body: unknown, signal?: AbortSignal): Promise<Response> }`; `type Method`; `interface StreamMessageInput`; `olbrain.research.{sessions, plans, attachments, runs, reports, review, templates}` as listed in the spec. Every method takes `agentId` first. Streams return `AsyncGenerator<any>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/research.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/research.test.ts`
Expected: FAIL — `olbrain().research` is undefined.

- [ ] **Step 3: Write the namespace**

Create `src/core/research.ts`:

```ts
/**
 * olbrain.research — the research console over the Agent API
 * (olbrain-sdk spec 2026-10-09). Names mirror olbrain-noesis-os
 * src/services/research/*, so a screen ported from Noesis swaps imports, not
 * logic. Every call takes the research agent's id first (== its template id).
 */
import { readSse } from './sse';

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

  async function* frames(res: Promise<Response>): AsyncGenerator<Json> {
    const r = await res;
    if (r.body) yield* readSse(r.body);
  }

  async function* streamTurn(agentId: string, sessionId: string, input: StreamMessageInput, signal?: AbortSignal): AsyncGenerator<Json> {
    yield* frames(t.stream('POST', `${session(agentId, sessionId)}/messages/stream`, input, signal));
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
  };
}
```

- [ ] **Step 4: Wire it into `Olbrain`**

In `src/core/olbrain.ts`: delete the `type Method = …` line added in Task 7 and add at the top with the other imports:

```ts
import { createResearch } from './research';
import type { Method } from './research';
```

and add beside `readonly approvals = { … };`:

```ts
  /** The research console: sessions, streamed turns, plans, runs, reports, review. Sign-ins only. */
  readonly research = createResearch({
    request: (method, path, body, opts) => this.request(method, path, body, opts),
    stream: (method, path, body, signal) => this.send(method, path, body, { signal, stream: true }),
  });
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/research.ts src/core/olbrain.ts tests/research.test.ts
git commit -m "feat(js): olbrain.research forwarded calls and streams

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: SDK live reads — polling and the steps stream

**Files:**
- Create: `olbrain-sdk/packages/js/src/core/researchLive.ts`
- Modify: `olbrain-sdk/packages/js/src/core/research.ts` (add `live`, `messages.older`; refresh messages on `complete`)
- Test: `olbrain-sdk/packages/js/tests/researchLive.test.ts`, `tests/research.test.ts` (append)

**Interfaces:**
- Consumes: `ResearchTransport` (Task 8), `readSse` (Task 7).
- Produces:
  - `type LiveSubscription = (() => void) & { setActive(active: boolean): void; refresh(): void }`
  - `KEEP: unique symbol`; `ACTIVE_MS = 2000`; `IDLE_MS = 10000`
  - `poll<T>(read: () => Promise<{ etag: string; data: T }>, cb: (data: T) => void, onErrorValue: T | typeof KEEP, active?: boolean): LiveSubscription`
  - `watchSteps(open: (after: string | null, signal: AbortSignal) => Promise<Response>, cb: (steps: unknown[]) => void): () => void`
  - `olbrain.research.live.{session, messages, plan, run, reportVersions, templateRuns}(agentId, …ids, cb, opts?: { active?: boolean }) => LiveSubscription`; `live.runSteps(agentId, runId, cb) => () => void`; `messages.older(agentId, sessionId, beforeTs) => Promise<any[]>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/researchLive.test.ts`:

```ts
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
```

Append to `tests/research.test.ts`:

```ts
describe('olbrain.research live', () => {
  it('live.run polls the snapshot route and hands back data', async () => {
    fetchMock.mockResolvedValue(reply(200, { etag: 'e1', data: { id: 'r1', status: 'running' } }));
    const cb = vi.fn();
    const sub = olbrain().research.live.run('ra 1', 'r1', cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledWith({ id: 'r1', status: 'running' }));
    expect(lastCall()[0]).toBe(`${B}/live/runs/r1`);
    sub();
  });

  it('live.run degrades to null and live.reportVersions to [] on a refused read', async () => {
    fetchMock.mockResolvedValue(reply(404, { error: { code: 'agent_not_found', message: 'x' } }));
    const run = vi.fn();
    const versions = vi.fn();
    const a = olbrain().research.live.run('ra 1', 'r1', run);
    const b = olbrain().research.live.reportVersions('ra 1', 'r1', versions);
    await vi.waitFor(() => { expect(run).toHaveBeenCalledWith(null); expect(versions).toHaveBeenCalledWith([]); });
    a(); b();
  });

  it('a completed turn makes live.messages re-read at once', async () => {
    const research = olbrain().research;
    fetchMock.mockResolvedValue(reply(200, { etag: 'm-1', data: [{ id: 'u1' }] }));
    const cb = vi.fn();
    const sub = research.live.messages('ra 1', 's1', cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));
    fetchMock.mockResolvedValueOnce(sse({ type: 'complete', message_id: 'm2' }));
    fetchMock.mockResolvedValue(reply(200, { etag: 'm-2', data: [{ id: 'u1' }, { id: 'm2' }] }));
    for await (const _ of research.sessions.streamMessage('ra 1', 's1', { content: 'go' })) { /* drain */ }
    await vi.waitFor(() => expect(cb).toHaveBeenLastCalledWith([{ id: 'u1' }, { id: 'm2' }]), { timeout: 500 });
    sub();
  });

  it('messages.older reads the page before a timestamp', async () => {
    fetchMock.mockResolvedValue(reply(200, { etag: 'x', data: [{ id: 'm0' }] }));
    expect(await olbrain().research.messages.older('ra 1', 's1', '2026-10-09T10:00:00Z')).toEqual([{ id: 'm0' }]);
    expect(lastCall()[0]).toBe(`${B}/live/sessions/s1/messages?before=2026-10-09T10%3A00%3A00Z`);
  });

  it('live.runSteps opens the steps stream with the cursor', async () => {
    fetchMock.mockResolvedValue(sse({ type: 'step', step: { id: 'a' }, cursor: '1.000000000' }, { type: 'end', cursor: '1.000000000' }));
    const cb = vi.fn();
    olbrain().research.live.runSteps('ra 1', 'r1', cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledWith([{ id: 'a' }]));
    expect(lastCall()[0]).toBe(`${B}/runs/r1/steps/stream`);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/researchLive.test.ts tests/research.test.ts`
Expected: FAIL — `../src/core/researchLive` missing; `research.live` undefined.

- [ ] **Step 3: Write `researchLive.ts`**

Create `src/core/researchLive.ts`:

```ts
/**
 * Live reads for olbrain.research, in place of the Firestore listeners Noesis
 * holds. Six reads are polled {etag, data} snapshots; run steps follow an SSE
 * stream that resumes from its cursor. Callbacks get the same shapes Noesis's
 * subscribe* callbacks get.
 */
import { readSse } from './sse';

export type LiveSubscription = (() => void) & { setActive(active: boolean): void; refresh(): void };

/** onErrorValue that means "keep showing the last value" (noesis listeners with no error callback). */
export const KEEP = Symbol('keep');
export const ACTIVE_MS = 2000;
export const IDLE_MS = 10000;
const ERRORED = '\u0000errored';

export function poll<T>(
  read: () => Promise<{ etag: string; data: T }>,
  cb: (data: T) => void,
  onErrorValue: T | typeof KEEP,
  active = true,
): LiveSubscription {
  let etag: string | undefined;
  let stopped = false;
  let inFlight = false;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hidden = () => typeof document !== 'undefined' && document.hidden;
  const schedule = () => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(tick, active ? ACTIVE_MS : IDLE_MS);
  };
  async function tick(): Promise<void> {
    if (stopped) return;
    if (inFlight) {
      again = true;
      return;
    }
    if (hidden()) return schedule();
    inFlight = true;
    try {
      const out = await read();
      if (!stopped && out.etag !== etag) {
        etag = out.etag;
        cb(out.data);
      }
    } catch {
      // Degrade like noesis's onSnapshot error callbacks — once per failure streak.
      if (!stopped && etag !== ERRORED) {
        etag = ERRORED;
        if (onErrorValue !== KEEP) cb(onErrorValue as T);
      }
    } finally {
      inFlight = false;
      if (again) {
        again = false;
        void tick();
      } else {
        schedule();
      }
    }
  }
  void tick();
  const sub = (() => {
    stopped = true;
    clearTimeout(timer);
  }) as LiveSubscription;
  sub.setActive = (a) => { active = a; };
  sub.refresh = () => { void tick(); };
  return sub;
}

/** Follows a run's steps stream; cb gets the accumulated, ts-ordered steps. */
export function watchSteps(
  open: (after: string | null, signal: AbortSignal) => Promise<Response>,
  cb: (steps: unknown[]) => void,
): () => void {
  const steps: unknown[] = [];
  let cursor: string | null = null;
  let stopped = false;
  let reported = false;
  let backoff = 1000;
  let ctrl: AbortController | undefined;
  const report = () => {
    reported = true;
    cb([...steps]);
  };
  void (async () => {
    while (!stopped) {
      ctrl = new AbortController();
      let next: 'end' | 'reconnect' | 'failed' = 'failed';
      try {
        const res = await open(cursor, ctrl.signal);
        for await (const frame of readSse(res.body!)) {
          const f = frame as { type?: string; step?: unknown; cursor?: string | null };
          if (f.type === 'step') {
            steps.push(f.step);
            cursor = f.cursor ?? cursor;
            backoff = 1000;
            if (!stopped) report();
          } else if (f.type === 'end' || f.type === 'reconnect') {
            next = f.type;
            break;
          }
        }
      } catch {
        // refused, dropped or aborted — handled below
      }
      ctrl.abort();
      if (stopped) return;
      // Nothing delivered yet: say "no steps", as noesis's error callback does.
      if (!reported) report();
      if (next === 'end') return;
      if (next === 'failed') {
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 30_000);
      }
    }
  })();
  return () => {
    stopped = true;
    ctrl?.abort();
  };
}
```

- [ ] **Step 4: Wire `live` and `messages.older` into the namespace**

In `src/core/research.ts` add the import:

```ts
import { KEEP, poll, watchSteps } from './researchLive';
import type { LiveSubscription } from './researchLive';
```

Inside `createResearch`, after the `report` helper, add:

```ts
  type Snapshot<T> = { etag: string; data: T };
  const snapshot = <T>(path: string) => () => t.request<Snapshot<T>>('GET', path);
  // live.messages subscriptions per session, so a completed turn can refresh them at once.
  const messageSubs = new Map<string, Set<LiveSubscription>>();
```

Replace `streamTurn` with:

```ts
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
```

Add these two entries to the returned object, after `templates`:

```ts
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
```

- [ ] **Step 5: Run the whole SDK suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/researchLive.ts src/core/research.ts tests/researchLive.test.ts tests/research.test.ts
git commit -m "feat(js): research live reads — etag polling and a resumable steps stream

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: SDK release prep — exports, version, README

**Files:**
- Modify: `olbrain-sdk/packages/js/src/index.ts`, `package.json`, `README.md`
- Test: `olbrain-sdk/packages/js/tests/package-exports.test.ts` (append)

**Interfaces:**
- Produces: public type exports `LiveSubscription`, `StreamMessageInput`; `version: "1.3.0"`.

- [ ] **Step 1: Write the failing test**

Append to `tests/package-exports.test.ts`:

```ts
import { readFileSync } from 'node:fs';

describe('1.3.0', () => {
  it('ships the research namespace on Olbrain', async () => {
    const { Olbrain } = await import('../src/index');
    expect(new Olbrain({ getIdToken: async () => 't' }).research.live.runSteps).toBeTypeOf('function');
    expect(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version).toBe('1.3.0');
  });
});
```

(If the file doesn't already import `describe`/`it`/`expect` from vitest, add that import.)

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/package-exports.test.ts`
Expected: FAIL on the version (`1.2.1`).

- [ ] **Step 3: Exports, version, docs**

In `src/index.ts`, after the `Olbrain` type export line add:

```ts
export type { StreamMessageInput } from './core/research';
export type { LiveSubscription } from './core/researchLive';
```

In `package.json` set `"version": "1.3.0"`.

In `README.md`, after the "Workflow runs and approvals" section, add:

````markdown
## Research agents

Sign-ins only (`getIdToken`); the agent must be bound to a screen in its org.

```js
const olbrain = new Olbrain({ getIdToken: () => user.getIdToken() });
const r = olbrain.research;

const { session_id } = await r.sessions.create(agentId);
for await (const ev of r.sessions.streamMessage(agentId, session_id, { content: 'Size the Indian EV charger market' })) {
  if (ev.type === 'text_delta') render(ev.text);
}

// Live reads return an unsubscribe function (with .setActive / .refresh).
const stopMessages = r.live.messages(agentId, session_id, (messages) => draw(messages));
const stopRun = r.live.run(agentId, runId, (run) => drawRun(run));        // null if unreadable
const stopSteps = r.live.runSteps(agentId, runId, (steps) => drawSteps(steps));
```

Every method takes the research agent's id first; names mirror Noesis's research services.
````

- [ ] **Step 4: Full suite, typecheck, build**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS; `dist/` builds.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts package.json README.md tests/package-exports.test.ts
git commit -m "chore(js): 1.3.0 — research agents

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Rollout (every step needs the user — prod credentials, merges, money)

**Files:** none in the repos. The smoke script lives in the session scratchpad.

Do these **in order**, and stop on any surprise.

- [ ] **Step 1: The 30 s question** (read-only, user runs)

```bash
gcloud logging read 'resource.type="http_load_balancer" AND httpRequest.requestUrl:"webhook.olbrain.com" AND httpRequest.latency>"30s" AND httpRequest.status<400' \
  --project=olbrain-india-prod --freshness=14d --limit=5 \
  --format='value(timestamp,httpRequest.latency,httpRequest.status,httpRequest.requestUrl)'
```
Any row means the LB lets long requests through → plan `steps_stream_max_seconds = 840` in Step 4. No rows → time one long streamed conversational turn; if it's cut at 30 s, raise `timeout_sec` in `terraform/backends.tf` to 3600 in the webhook PR **before** going further.

- [ ] **Step 2: Open both PRs**

```bash
cd ~/Desktop/Olbrain-Labs/olbrain-webhook-service && git push -u origin feat/research-agent-api
gh pr create --title "Research agents on the Agent API (sign-ins only, behind RESEARCH_AGENT_API_ENABLED)" --body-file <(printf '%s\n' "Spec: Olbrain/olbrain-sdk docs/superpowers/specs/2026-10-09-research-agent-api-design.md" "" "Ships dark: routes unmounted until RESEARCH_AGENT_API_ENABLED=true." "" "🤖 Generated with [Claude Code](https://claude.com/claude-code)")
cd ~/Desktop/Olbrain-Labs/olbrain-sdk && git push -u origin feat/research-agent-api
gh pr create --title "@olbrain/js-sdk 1.3.0: research agents" --body-file <(printf '%s\n' "Spec and plan included." "" "🤖 Generated with [Claude Code](https://claude.com/claude-code)")
```
Before each push, check the CLAUDE.md rule: `gh pr view --json state` must not show MERGED for this branch.

- [ ] **Step 3: Merge the webhook PR** (user). Merging deploys; the switch is off, so nothing changes. Confirm `curl -s -o /dev/null -w '%{http_code}' https://webhook.olbrain.com/api/agents/x/research/sessions` → `404`.

- [ ] **Step 4: Terraform** (user, prod). Set `research_design_url` / `research_runtime_url` in the real `terraform.tfvars` to the same values Noesis's BFF uses (`MUMBAI_RESEARCH_DESIGN_URL` / `MUMBAI_RESEARCH_RUNTIME_URL`), keep `research_agent_api_enabled = false`, then `terraform plan`. Expected: four env additions and two `dispatcher_invokes_research` IAM members — and **no image change**. If the plan touches the image or anything else, stop. Then `terraform apply`.

- [ ] **Step 5: Publish the SDK** (user). Merge the SDK PR, then `git tag js-v1.3.0 && git push origin js-v1.3.0`. Confirm `npm view @olbrain/js-sdk version` → `1.3.0`.

- [ ] **Step 6: Bind one test research agent** (user). Create `organizations/{org}/screen_agents/{researchAgentId}` the way a screen install does (copy the shape of an existing workflow binding in the same collection). Without it every call 404s by design.

- [ ] **Step 7: Flip the switch** (user). `research_agent_api_enabled = true` → `terraform apply`.

- [ ] **Step 8: Live smoke** — the spec's success criterion. Approving a plan starts a **paid** run: use effort `low` and a narrow question. Get a Firebase ID token from a signed-in Screens tab (`await firebase.auth().currentUser.getIdToken()` in devtools), then:

```js
// scratchpad/smoke-research.mjs — run: TOKEN=… AGENT=… node smoke-research.mjs
import { Olbrain } from '@olbrain/js-sdk';
const r = new Olbrain({ getIdToken: async () => process.env.TOKEN }).research;
const A = process.env.AGENT;
const { session_id: s } = await r.sessions.create(A);
console.log('session', s, (await r.sessions.list(A)).length, 'sessions');
for await (const ev of r.sessions.streamMessage(A, s, { content: 'One-paragraph brief: size of the Indian e-bike market, 2025', effort: 'low' })) {
  if (ev.type !== 'text_delta') console.log('frame', ev.type);
}
const stop = r.live.messages(A, s, (m) => console.log('messages', m.length));
await new Promise((x) => setTimeout(x, 3000)); stop();
```
Then approve the proposed plan (`plans.approveById` with the plan id from the session), follow `live.runSteps` until it stops, open `reports.get`, and run one `review.stream`. Record each result. Anything other than success: switch the flag back off (`terraform apply`) and debug from the webhook logs (`research_forward_failed`, keyed by request id).

---

## Self-Review Notes

- Spec coverage: admission (T1), ownership guard (T3/T4/T5), allowlist 29 rows (T3), 4xx passthrough (T3), CORS (T3), kill switch + boot guard (T3/T6), live snapshots (T4), steps SSE incl. final flush and terminal rule (T5), env + IAM (T6), SDK transport + detail (T7), forwarded calls + streams + long timeouts (T8), polling + steps + refresh-on-complete (T9), 1.3.0 (T10), probe + rollout + smoke (T11).
- Known limitation carried from the spec, not fixed: research-runtime takes the org from token claims; a user whose claims carry another org gets upstream 404s.
- Pre-existing, unrelated: `api/proxy.js` in olbrain-screens is not touched; Screens' research app is a separate spec.
