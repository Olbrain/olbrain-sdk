# olbrain-python-sdk — reference for coding assistants

This file ships inside the installed package (`site-packages/olbrain/AGENTS.md`).
It is the complete, offline reference for the public API. Everything here is
taken from the source. If it disagrees with the web docs, this file is right.

Find it from Python with:
`python -c "import olbrain, os; print(os.path.join(os.path.dirname(olbrain.__file__), 'AGENTS.md'))"`

## Pick the right client

| You want to… | Use | Auth |
|---|---|---|
| Chat with a conversational agent (send a message, get a reply) | `AgentClient` | `api_key="ak_…"` (the only kind issued today; `sk_live_`, `org_live_`, `sk_` and `org_` still pass validation) |
| Trigger workflow agents, read/control runs, resolve approvals | `Olbrain` | `api_key="ak_…"` **or** `get_id_token` (Olbrain sign-in) |
| Drive a research agent (sessions, streamed turns, plans, reports) | `Olbrain.research` | `get_id_token` only. An `ak_` key gets `NotFoundError` (`agent_not_found`) |

These are two separate HTTP clients with different error rules. Both default
to `https://webhook.olbrain.com`. The JavaScript SDK (`@olbrain/js-sdk`) has
the same two clients plus a browser `ChatWidget`.

Keep the `ak_` key on your server (an environment variable such as
`OLBRAIN_API_KEY`). Never send it to a browser.

## Install and import

```bash
pip install olbrain-python-sdk   # import name: olbrain. Requires Python 3.7+ and requests.
```

```python
from olbrain import AgentClient, Olbrain, OlbrainError
```

Both clients are synchronous and use `requests`.

---

## 1. `AgentClient` — conversational agents

```python
import os
from olbrain import AgentClient

with AgentClient(agent_id="your-agent-id", api_key=os.environ["OLBRAIN_API_KEY"]) as client:
    session_id = client.create_session(title="Support chat", user_id="u_42")
    reply = client.send_and_wait(session_id, "Hello!")
    if reply.success:
        print(reply.text)
    else:
        print("agent error:", reply.error)
```

### `AgentClient(agent_id, api_key, agent_url=None)`

- `agent_id`: required. An empty value raises `ValueError`.
- `api_key`: must start with `ak_`, `sk_live_`, `org_live_`, `sk_` or `org_`,
  or the constructor raises `ValueError`.
- `agent_url`: optional. Defaults to the `OLBRAIN_AGENT_URL` environment
  variable if set, otherwise `https://webhook.olbrain.com`.

Chat calls are `POST {agent_url}/api/agents/webhook/{agent_id}` with
`Authorization: Bearer <api_key>`. Session reads are
`GET {agent_url}/api/agents/{agent_id}/sessions/{session_id}[/messages]`. The
client is a context manager, and `__exit__` calls `close()`.

### Methods

| Method | Returns | Notes |
|---|---|---|
| `create_session(on_message=None, title=None, user_id=None, metadata=None, mode="production", description=None)` | `str` session id | Sends `title` (default `"New Session"`) to the agent **as the first message**. `mode` must be `"development"`, `"testing"` or `"production"`, otherwise `ValueError`, but it is not sent: the API always serves the published agent. `description` is stored as `metadata["session_description"]`. If you pass `on_message`, it also calls `listen()`. Timeout 30 s. |
| `send_and_wait(session_id, message, user_id=None, metadata=None, model=None, timeout=120)` | `ChatResponse` | Waits for the reply. `timeout` is in **seconds**. `model` overrides the agent's model. Empty or whitespace-only messages raise `ValueError`. |
| `send(session_id, message, user_id=None, metadata=None, model=None, mode="production")` | `dict` (raw JSON) | Same request, but returns the raw response dict (`response`, `token_usage`, `success`, …). It still blocks, with a 120 s timeout. |
| `listen(session_id, on_message)` | `None` | Starts a background daemon thread that polls the session's messages every 2 s and calls `on_message` once per **new** message (messages already there are skipped). Calling it again for the same session does nothing. |
| `run()` | `None` | Blocks until Ctrl+C, then calls `close()`. Use it to keep a script alive for `listen` callbacks. |
| `close()` | `None` | Stops all listeners. |
| `get_session(session_id)` | `SessionInfo` | `SessionNotFoundError` if it doesn't exist (or belongs to another agent). |
| `get_session_stats(session_id)` | `dict` | `message_count`, `token_usage`, `cost`, `created_at`, `last_message_at`. |
| `get_messages(session_id, limit=20, offset=0)` | `dict` | `{"messages": [...], "limit", "offset"}`, oldest first; `limit` at most 200. |
| `update_session(...)`, `delete_session(...)` | — | Always raise `OlbrainError`: the API has no endpoint for them. |

`on_message` gets each message as a raw dict (`role`, `content`, …). It runs
on the listener thread, so keep it fast and don't raise from it.

### Data classes (`olbrain.session`, re-exported from `olbrain`)

```python
@dataclass
class ChatResponse:
    text: str
    session_id: str
    success: bool = True
    token_usage: Optional[TokenUsage] = None   # None if the server sent none
    model_used: Optional[str] = None
    response_time_ms: Optional[int] = None
    metadata: Optional[dict] = None
    error: Optional[str] = None
    # ChatResponse.from_dict(data, session_id=""), .to_dict()

@dataclass
class TokenUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost: float = 0.0

@dataclass
class SessionInfo:
    session_id: str
    title: str = ""
    status: str = "active"        # "active" | "archived"
    created_at: str = ""
    updated_at: str = ""
    message_count: int = 0
    user_id: Optional[str] = None
    channel: str = "api"
    metadata: dict = {}
```

`token_usage` can be `None`, so guard before reading it:
`reply.token_usage.total_tokens if reply.token_usage else 0`. Always check
`reply.success` too. A 200 response can carry `success=False` and an `error`.

Avoid the exported `Message` and `Session` classes. Nothing in the client
returns them.

### Errors (`AgentClient`)

| Condition | Raised |
|---|---|
| Bad constructor args, empty message, bad `mode`/`status` | `ValueError` (**not** `ValidationError`) |
| HTTP 401 | `AuthenticationError` |
| HTTP 404 whose detail mentions "session" | `SessionNotFoundError` (a subclass of `SessionError`) |
| Other HTTP 404 | `OlbrainError` ("Endpoint not found (404) …") |
| HTTP 429 | `RateLimitError` (`.retry_after` from `detail.retry_after`, may be `None`) |
| Any other non-200 (403, 5xx…) | `OlbrainError("Failed to <operation>: <status> - <detail>")` |
| Connection error or timeout | `NetworkError` |

---

## 2. `Olbrain` — workflow agents, runs, approvals

```python
olbrain = Olbrain(api_key=os.environ["OLBRAIN_API_KEY"])           # server / script
# olbrain = Olbrain(get_id_token=lambda: current_user_id_token())   # signed-in Olbrain user (Firebase ID token)
```

`Olbrain(api_key=None, get_id_token=None, base_url=None, timeout=30)`:
`api_key` must start `ak_`; `get_id_token` is a callable returning the
token and is called before **every** request; `base_url` defaults to the
`OLBRAIN_AGENT_URL` environment variable if set, otherwise
`https://webhook.olbrain.com`; `timeout` is in seconds. Give **exactly one** of
`api_key` or `get_id_token`, or the constructor raises `ValidationError`.

Every method takes the agent id first and returns the API's JSON (snake_case
dicts and lists).

| Method | HTTP | Returns |
|---|---|---|
| `workflows.run(agent_id, payload=None, variables=None)` | `POST /api/workflows/{agent_id}/trigger` | `{"run_id", "status"}` |
| `runs.list(agent_id, status=None, limit=None)` | `GET /api/agents/{agent_id}/runs` | list of runs |
| `runs.get(agent_id, run_id)` | `GET …/runs/{run_id}` | run |
| `runs.cancel / pause / retry / resume(agent_id, run_id)` | `POST …/runs/{run_id}/{verb}` | dict |
| `approvals.list(agent_id, run_id)` | `GET …/runs/{run_id}/approvals` | list of approvals |
| `approvals.resolve(agent_id, run_id, exception_id, resolution, modified_data=None)` | `POST …/approvals/resolve` | `{"exception_id", "resolution", "all_resolved", "resumed"}` |

A run has `run_id`, `status`, and optionally `progress_percent`, `started_at`,
`completed_at`, `duration_seconds`, `error` and `summary`
(`total_processed`, `successful`, `failed`, `exceptions`, `skipped`). An
approval has `exception_id`, `step_id`, `item_id`, `data`, `error`,
`requires_human_review` and `blocking`. `resolution` is `"approved"`,
`"rejected"` or `"modified"`; send `modified_data` only with `"modified"`.

There is no SDK helper for waiting on a run, so poll `runs.get` yourself:

```python
import os, time
from olbrain import Olbrain

olbrain = Olbrain(api_key=os.environ["OLBRAIN_API_KEY"])
run_id = olbrain.workflows.run(agent_id, payload={"url": url})["run_id"]
DONE = {"completed", "failed", "canceled", "cancelled"}
run = olbrain.runs.get(agent_id, run_id)
while run["status"] not in DONE:
    for a in olbrain.approvals.list(agent_id, run_id):
        olbrain.approvals.resolve(agent_id, run_id, a["exception_id"], "approved")
    time.sleep(3)
    run = olbrain.runs.get(agent_id, run_id)
```

The terminal status strings in that loop are an assumption. Check the values
your agent actually returns.

### Errors (`Olbrain`, including `research`)

The error code and message come from the response body: `{error:{code,message}}`
or FastAPI's `{detail}`.

| Condition | Raised |
|---|---|
| code is `insufficient_funds`, `credit_limit_exceeded`, `subscription_suspended`, `subscription_inactive` or `billing_unavailable` (any status) | `BillingError` (`.status`, `.code`) |
| 401 | `AuthenticationError` |
| 404 | `NotFoundError` (`.status = 404`, `.code`, e.g. `agent_not_found`) |
| 429 | `RateLimitError` (`.retry_after` seconds from the `Retry-After` header, or `None`) |
| any other non-2xx (403, 409, 422, 5xx…) | `ApiError` (`.status`, `.code`, `.message`, `.detail` = raw `detail`) |
| connection failure, timeout, or a dropped stream | `NetworkError` |

`BillingError` and `NotFoundError` subclass `ApiError`, and every error class
subclasses `OlbrainError`, so put the narrower `except` clauses first.

---

## 3. `Olbrain.research` — research agents (sign-ins only)

```python
olbrain = Olbrain(get_id_token=lambda: user_id_token)
r = olbrain.research
```

All paths sit under `/api/agents/{agent_id}/research`. The agent must be a
research agent that is bound to a screen in the user's org. Payloads are
returned untyped (dicts and lists) because their shape belongs to the
research-runtime service.

| Method | |
|---|---|
| `sessions.create(agent_id)` | session (has `session_id`) |
| `sessions.list(agent_id, include_archived=False)`, `sessions.get / delete(agent_id, session_id)` | |
| `sessions.patch(agent_id, session_id, patch)` | partial session fields, passed through |
| `sessions.models(agent_id, session_id)` | available models |
| `sessions.set_model / set_review_model(agent_id, session_id, model)` | `None` resets to the default |
| `sessions.stream_message(agent_id, session_id, content, attachments=None, effort=None, escalates_run_id=None, command=None, target_run_id=None)` | generator of frames |
| `plans.approve(agent_id, session_id, message_id, body=None)`, `plans.approve_by_id(agent_id, session_id, plan_id, body=None)` | |
| `attachments.add(agent_id, session_id, files)` | multipart upload of `(filename, file or bytes[, content_type])` tuples; returns refs to pass as `attachments` |
| `attachments.upload_url(agent_id, session_id, storage_path)` | `{"url"}` |
| `runs.cancel / retry(agent_id, run_id)`, `runs.active_job(agent_id, run_id)` (or `None`), `runs.resolve_claims(agent_id, run_id, resolutions)` | |
| `reports.get(agent_id, run_id, version=None)`, `reports.artifact_url(agent_id, run_id, profile_id, fmt)`, `reports.evidence(agent_id, run_id)` | |
| `reports.share.get / revoke(agent_id, run_id)`, `reports.share.set(agent_id, run_id, visibility)` | |
| `review.get(agent_id, run_id)`; `review.run(agent_id, run_id)`, `review.apply(agent_id, run_id, finding_ids)` | the last two block, up to 600 s |
| `review.stream(agent_id, run_id)`, `review.stream_apply(agent_id, run_id, finding_ids)` | generators of frames |
| `templates.versions(agent_id)` | |
| `messages.older(agent_id, session_id, before_ts)` | one page of older messages, oldest first |

Stream frames come straight from research-runtime, unchanged: `{"type": "text_delta", "text"}`,
`{"type": "tool_use_start", …}`, `{"type": "complete", …}` and `{"type": "error", …}`.
The request is sent when you start iterating, and it can wait up to 600 s for
its first frame while the agent searches. To cancel, stop iterating (`break`,
or `.close()` the generator); the connection is closed.

```python
for ev in r.sessions.stream_message(agent_id, sid, "Size the Indian EV charger market"):
    if ev.get("type") == "text_delta":
        print(ev["text"], end="", flush=True)
    elif ev.get("type") == "error":
        raise RuntimeError(ev.get("message", "research error"))
```

The JavaScript SDK's `live.*` polling subscriptions are not in Python. Poll
`sessions.get` / `reports.get` yourself.

---

## Logging

`AgentClient` logs through `logging.getLogger("olbrain")`. Turn on
`logging.basicConfig(level=logging.DEBUG)` to see requests and listener events.
