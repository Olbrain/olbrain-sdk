# Research agents on the Agent API — design

Date: 2026-10-09 · Status: approved in chat, awaiting written-spec review

## Goal

A front end on screens.olbrain.com can run the full research console — chat,
plans, live runs, report, review, claims, sources, sharing — using only
`@olbrain/js-sdk` against webhook.olbrain.com. No Firestore client in the
screen, no new Screens proxy targets.

Success: from a scratch page using `@olbrain/js-sdk@1.3.0` and an Olbrain
sign-in, a user lists sessions, sends a streamed turn, approves a plan, watches
the run's steps arrive live to completion, opens the report, and runs one
review pass.

## Decisions (made in brainstorming)

| Question | Decision |
|---|---|
| Who calls it | Olbrain sign-ins only (`getIdToken`). No `ak_` access keys. |
| Scope | Full console parity (inventory below). |
| Live updates | Hybrid: six reads are **polled** REST snapshots; run **steps** stream over SSE. |
| Where the screen lives | Out of scope — the Screens research app is a separate spec built on this SDK. |

## Facts this design rests on (verified on origin/main, 2026-10-09)

- studio-backend stamps research agents `basic_info.runtime = "research"`
  (`services/agent_runtime.py:19`). webhook-service's `lookup.ts` has no
  `research` in `VALID_RUNTIMES`, so every research agent is refused today.
- A research agent's id **is** its template id (noesis
  `ResearchChatSection.js:43` passes `agentId` as `templateId`).
- research-runtime verifies a Firebase ID token from `X-User-Authorization`
  (falling back to `Authorization`) and takes the org from token claims
  (`app/middleware/firebase_auth.py`). research-design mirrors it.
- webhook-service already admits Olbrain sign-ins on the Agent API via
  `authenticateKeyOrUser` (`src/auth.ts:307`) — workflow agents only — gated by
  `canUseScreens` + `isScreenAgent` (`src/screensAccess.ts`) and
  `SCREENS_SIGNIN_ENABLED`.
- webhook-service already relays SSE (`src/sse.ts`, `splitSseFrames`) and
  forwards with a minted OIDC token (`src/forward.ts`).
- The LB backend service sets `timeout_sec = 30` (`terraform/backends.tf:28`);
  the Cloud Run request timeout is 3600 s (`terraform/dispatcher.tf:61`).
  `variables.tf:56` records conversational turns over 60 s reaching the
  dispatcher through this LB, which strongly suggests the 30 s does not cut a
  serverless NEG — still **unverified**, see Prerequisite.
- research-design and research-runtime are `--no-allow-unauthenticated`
  (IAM `run.invoker` only, no caller allowlist). research-runtime's Pub/Sub
  push routes trust `run.invoker` alone (`app/routers/pubsub_push.py:27`), so
  the forward allowlist is the only thing keeping a signed-in user off them.
- A step's `ts` is a Firestore server Timestamp (`app/lifecycle/step_emitter.py`),
  microsecond precision; message `ts` is an ISO string.

## Architecture

```
Screen
   │  agents().research.*                 @olbrain/js-sdk 1.3.0
   ▼
webhook.olbrain.com   /api/agents/:agentId/research/*
   │  1. sign-in admission (existing, extended to kind "research")
   │  2. ownership guard: any session/run/plan id in the path belongs to :agentId
   ├── forward (allowlist) ──► research-design | research-runtime
   │        OIDC token + X-User-Authorization: Bearer <user's Firebase token>
   ├── live snapshot GETs (Firestore admin)    ──► polled by the SDK
   └── steps SSE (Firestore listener, cursor)  ──► streamed by the SDK
```

### webhook-service

One new module, `src/research.ts`, registered from `server.ts` behind
`RESEARCH_AGENT_API_ENABLED` (default off; routes 404 when off).

`lookup.ts` adds `"research"` to `RuntimeKind`/`VALID_RUNTIMES`. The existing
conversational/workflow/superagent routes keep their `allowedKinds`, so a
research agent is still refused there.

`authenticateKeyOrUser` gains `kind: "workflow" | "research"` (default
`"workflow"`, so existing callers are unchanged). For `"research"`:
- an `ak_` token, or no token, → 404 `agent_not_found` (sign-ins only);
- otherwise the existing checks verbatim: PUBLISHED, `canUseScreens`,
  `isScreenAgent`, owner access lock on mutating calls.

Consequence: a research agent works on Screens only once it is bound in
`organizations/{org}/screen_agents`, exactly as workflow agents are today.

#### Ownership guard

Every route whose path carries a `sessionId`, `runId` or `planId` loads that
document (`research_chat_sessions`, `research_runs`, `research_plans`) and
requires `template_id == :agentId`. A miss — absent doc or different template —
is the same 404 as an unknown agent. It runs **before** any forward or read:
it is what replaces the Firestore rules for screen users (agent X's user must
never read agent Y's run by guessing its id).

#### Forward allowlist

Upstream base: **D** = research-design, **R** = research-runtime. `{t}` is
always `:agentId`. Anything not listed → 404. `/api/internal/*`, `/v1/*` and
`/api/public/*` are never forwardable.

| SDK | Method | Upstream path | Svc |
|---|---|---|---|
| sessions.create | POST | /api/templates/{t}/sessions | R |
| sessions.list | GET | /api/templates/{t}/sessions?archived= | R |
| sessions.get | GET | /api/templates/{t}/sessions/{s} | R |
| sessions.patch | PATCH | /api/templates/{t}/sessions/{s} | R |
| sessions.delete | DELETE | /api/templates/{t}/sessions/{s} | R |
| sessions.models | GET | /api/templates/{t}/sessions/{s}/models | R |
| sessions.setModel | PUT | /api/templates/{t}/sessions/{s}/model | R |
| sessions.setReviewModel | PUT | /api/templates/{t}/sessions/{s}/review-model | R |
| sessions.streamMessage | POST (SSE) | /api/templates/{t}/sessions/{s}/messages/stream | R |
| plans.approve | POST | /api/templates/{t}/sessions/{s}/messages/{m}/approve-plan | R |
| plans.approveById | POST | /api/templates/{t}/sessions/{s}/plans/{p}/approve | R |
| attachments.add | POST | /api/templates/{t}/sessions/{s}/attachments | R |
| attachments.uploadUrl | POST | /api/templates/{t}/sessions/{s}/attachment-url | R |
| runs.cancel | POST | /api/runs/{r}/cancel | D |
| runs.retry | POST | /api/runs/{r}/retry | R |
| runs.activeJob | GET | /api/runs/{r}/active-job | R |
| runs.resolveClaims | POST | /api/runs/{r}/claims/resolve | D |
| reports.get | GET | /api/reports/{r}?version= | D |
| reports.artifactUrl | GET | /api/reports/{r}/artifacts/{profile}/{format} | D |
| reports.evidence | GET | /api/reports/{r}/evidence | D |
| reports.share.get | GET | /api/reports/{r}/share | D |
| reports.share.set | PUT | /api/reports/{r}/share | D |
| reports.share.revoke | POST | /api/reports/{r}/share/revoke | D |
| review.get | GET | /api/reports/{r}/review | D |
| review.run | POST | /api/runs/{r}/review | R |
| review.apply | POST | /api/runs/{r}/review/apply | R |
| review.stream | POST (SSE) | /api/runs/{r}/review/stream | R |
| review.streamApply | POST (SSE) | /api/runs/{r}/review/apply/stream | R |
| templates.versions | GET | /api/templates/{t}/versions | D |

Webhook-side path: `/api/agents/:agentId/research/<the upstream path minus
/api, with /templates/{t} dropped>` — e.g. `…/research/sessions/:s/models`,
`…/research/runs/:r/review`. The table is the single source; tests iterate it.

Mutating = any non-GET. SSE and the long POSTs (`review.run`, `review.apply`)
use a per-route forward timeout of 600 s (the upstream's own
`LONG_LLM_CALL_MS` headroom); the rest use `config.forwardTimeoutMs`.
Request bodies (JSON and the multipart attachment upload) are streamed
through unbuffered.

Upstream **4xx bodies pass through verbatim** — research's 4xx details are
written for people (approve-plan's `{error, message, fields}`, retry's
precondition wording) and noesis shows them as-is. This is a deliberate
exception to errors.ts's phrase-book rule, which exists for external
customers; research routes have none (sign-ins only). 5xx and transport
failures still collapse to `upstream_error` / `upstream_timeout`.

CORS: the research routes get their own `cors()` (same origin allowlist,
`AGENT_API_ALLOWED_ORIGINS`) with methods GET, POST, PUT, PATCH, DELETE.

#### Live snapshot reads (polled)

All `GET /api/agents/:agentId/research/live/...`, Firestore admin reads,
Timestamps serialised as ISO strings, response `{ etag, data }` where `etag`
is a hash of `data`.

| SDK | Path | Firestore read | `data` |
|---|---|---|---|
| live.session | live/sessions/:s | doc `research_chat_sessions/{s}` | `{session_id, ...}` or `null` |
| live.messages | live/sessions/:s/messages[?before=ts] | `messages` ordered `ts` desc, limit 100, reversed | array, reading order |
| live.plan | live/plans/:p | doc `research_plans/{p}` | `{plan_id, ...}` or `null` |
| live.run | live/runs/:r | doc `research_runs/{r}` | raw doc `{id, ...}` or `null` |
| live.reportVersions | live/runs/:r/report-versions | `report_versions` ordered `version` desc | array |
| live.templateRuns | live/runs | `research_runs` where `template_id == t` | array, sorted `meta.triggered_at` desc |

`messages?before=` is also the one-shot `messages.older` page (limit 100).
`live.templateRuns` is unbounded, as noesis's `subscribeRunsForTemplate` is.

#### Steps stream (SSE)

`GET /api/agents/:agentId/research/runs/:r/steps/stream?after=<cursor>`

The cursor is `<seconds>.<9-digit nanos>` of the last step's `ts` — opaque to
the SDK, exact to the microsecond so a reconnect neither skips nor repeats.
Every frame is a single `data:` line of JSON, the same framing
research-runtime's own streams use:

1. One Firestore listener on `steps` ordered by `ts`, `startAfter(cursor)`,
   no limit. Its first snapshot is the backlog; each later added step is
   one `{"type":"step","step":{…},"cursor":"…"}` frame. A heartbeat comment
   every 15 s.
2. A second listener on the run doc. Once the status is terminal
   (`completed`, `failed`, `canceled` — not `awaiting_review`) **and** the
   steps listener has delivered its first snapshot, the server detaches both,
   does one final `get()` of steps after the cursor (so nothing written
   before the status flip is lost), writes them, then `{"type":"end"}`.
3. At `STEPS_STREAM_MAX_SECONDS` (default 25; raise to 840 once the probe
   shows the LB allows it) it writes `{"type":"reconnect","cursor":"…"}`.
4. On client abort or stream end both listeners are detached (tested).
5. A malformed `after` → 400 `bad_request`.

### SDK (`packages/js`, 1.2.1 → 1.3.0)

`Olbrain.research`, added beside `workflows` / `runs` / `approvals`; nothing
existing changes. Every method takes `agentId` first. Names mirror noesis's
`src/services/research/*` so the screen port is an import swap.

- **Forwarded calls**: one method per allowlist row; return the parsed JSON.
- **Streams** (`sessions.streamMessage`, `review.stream`,
  `review.streamApply`): `AsyncIterable<{event, data}>`, accepting
  `{ signal }`. Frames are reassembled across chunks (split on `\n\n`, the
  `splitSseFrames` contract). research-runtime's frames are passed through
  unchanged.
- **Polled live reads** (`live.session|messages|plan|run|reportVersions|templateRuns`):
  `(…ids, cb, opts?) => unsubscribe`. Poll 2 s while active, 10 s otherwise
  (`opts.active` or the caller toggles via the returned handle's `setActive`);
  paused while `document.hidden`; `cb` fires only when `etag` changes.
  After a `streamMessage` yields `complete`, any `live.messages` subscription
  for that session polls immediately.
- **Steps**: `live.runSteps(agentId, runId, cb) => unsubscribe`. `cb` receives
  the accumulated, `ts`-ordered array (noesis's `subscribeRunSteps` shape).
  On `reconnect` or a dropped connection it reopens with `after=<last ts>`
  (backoff 1 s → 30 s on repeated failure); on `end` it stops.
- **Errors**: forwarded failures use the existing `request()` mapping
  (`ApiError`, `NotFoundError`, `AuthenticationError`…). `ApiError` gains an
  optional `detail` carrying the upstream's parsed `detail` (so a 409's
  `fields` survive). Live reads degrade
  like noesis: `runSteps` and `reportVersions` hand `cb([])`, `session`,
  `plan`, `run` hand `cb(null)`, on a failed read — and keep polling.

The SDK is a transport. Run-doc reshaping (noesis `_reshapeRunDoc`) and any
Timestamp handling belong to the screen port.

## Prerequisite: the 30 s question

Before any deploy: find out whether the LB lets a request through
webhook.olbrain.com run past 30 s — from the LB request logs (any
`httpRequest.latency` over 30 s on the webhook backend with a 2xx), or, if
there are none, by timing one long streamed conversational turn.

- If it survives: set `STEPS_STREAM_MAX_SECONDS=840`.
- If it is cut at 30 s: raising `timeout_sec` in `terraform/backends.tf`
  (to 3600, matching Cloud Run) and applying it is a **blocker** — research
  turns, the review streams and `review.run`/`review.apply` all routinely
  exceed 30 s. The steps stream alone would survive via 25 s reconnects.

## Known limitation (recorded, not fixed)

research-runtime/design resolve the org from the token's claims, not from the
agent. A user whose claims carry a different org than the agent's gets a 404
from upstream — the same as in Noesis today. webhook-service does not mask it.

## Security summary

- Sign-ins only; `ak_` refused on every research route.
- **Org members only** (creator, active membership, or active members
  subdoc — `isOrgMember`), not Screens' `screen_users` grants. The live reads
  use admin credentials, so they must admit no one the research services and
  firestore.rules would refuse. (Final-review ruling, 2026-10-09.)
- **Private reports**: the steps stream and `live/runs/:r/report-versions`
  carry report text, so they apply research-design's `may_read`
  (`research_report_shares/{runId}`: absent / organization / public → allow;
  private → only `visibility_set_by`). The run doc itself stays
  member-readable, as under firestore.rules.
- Polls and streams don't call `recordUsage`; only forwarded calls count as
  requests processed.
- Ownership guard before every forward and read that names an id.
- Exact allowlist; internal, `/v1/*` and public routes unreachable.
- The user's token is sent only as `X-User-Authorization`; never logged
  (existing `signIn.ts` rule).
- No webhook billing gate: research-runtime meters its own work, as it does
  for Noesis's direct calls.

## Failure modes

- Long requests: see Prerequisite.
- Instance pressure: each watching screen holds one SSE connection and one
  Firestore listener for at most `STEPS_STREAM_MAX_SECONDS`; concurrency ×
  max-instances in `deploy-prod.yml` is the ceiling. Listeners detach on
  disconnect.
- Poll cost: bounded by 10 s idle polling and paused hidden tabs.

## Testing

webhook-service (vitest):
- every allowlist row forwards to the right service and path, with
  `X-User-Authorization` set and the OIDC audience of that service;
- an unlisted path, `/api/internal/*`, `/v1/runs` → 404;
- for each id-bearing route: agent X's user asking for agent Y's
  session/run/plan → 404, before any upstream call;
- `ak_` token → 404; a workflow agent on research routes → 404; a research
  agent on the conversational trigger → refused as today;
- flag off → 404;
- steps stream: backlog → live frames → `end` on terminal status; `reconnect`
  at the cap; listener detached on abort;
- snapshot `etag` is stable for unchanged data.

SDK (vitest):
- poller fires only on etag change, switches 2 s/10 s, pauses while hidden,
  polls `messages` immediately after a `complete` frame;
- `runSteps` reconnects with the last `ts`, stops on `end`, backs off on errors;
- split-frame reassembly (frames cut mid-JSON across chunks);
- every forwarded method hits the documented path and method.

Live smoke (after deploy + flag flip): the success criterion above, from a
scratch page.

## Rollout

1. Timeout probe; terraform change if needed (Prerequisite).
2. webhook-service PR behind `RESEARCH_AGENT_API_ENABLED=false`; merge deploys.
3. SDK 1.3.0 PR; merge publishes via trusted publishing.
4. Bind a test research agent in `screen_agents`; flip the flag; live smoke.
5. Separate spec: the Screens research app on this SDK.

## Out of scope

Access-key callers; developer test threads (`is_test`, draft templates);
public share-link report pages (`/api/public/reports/*`); org-wide analytics
(`subscribeRunsForOrg`); configure/skills/sources editing; the Screens app.
