# olbrain-python-sdk — reference for coding assistants

This file ships inside the installed package (`site-packages/olbrain/AGENTS.md`).
It is the complete, offline reference for the public API. Everything here is
taken from the source. If it disagrees with the web docs, this file is right.

Find it from Python with:
`python -c "import olbrain, os; print(os.path.join(os.path.dirname(olbrain.__file__), 'AGENTS.md'))"`

The Python SDK covers **conversational agents** only (`AgentClient`). Workflow
runs, approvals and research agents are available only in the JavaScript SDK
(`@olbrain/js-sdk`, class `Olbrain`).

## Install and import

```bash
pip install olbrain-python-sdk   # import name: olbrain. Requires Python 3.7+ and requests.
```

```python
from olbrain import AgentClient, ChatResponse, OlbrainError
```

## Quick start

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

The client is synchronous and uses `requests`.

## `AgentClient(agent_id, api_key, agent_url=None)`

- `agent_id`: required. An empty value raises `ValueError`.
- `api_key`: must start with `sk_live_`, `org_live_`, `sk_` or `org_`, or the
  constructor raises `ValueError`. `ak_` keys are **not** accepted here.
- `agent_url`: optional. Defaults to `https://olbrain-agent-cloud-768934887465.us-central1.run.app`.

Every call is a `POST {agent_url}/api/agent/webhook` with headers
`Authorization: Bearer <api_key>` and `X-Agent-ID: <agent_id>`. The client is a
context manager, and `__exit__` calls `close()`.

### Methods

| Method | Returns | Notes |
|---|---|---|
| `create_session(on_message=None, title=None, user_id=None, metadata=None, mode="production", description=None)` | `str` session id | Sends `title` (default `"New Session"`) to the agent **as the first message**. `mode` must be `"development"`, `"testing"` or `"production"`, otherwise `ValueError`. `description` is stored as `metadata["session_description"]`. If you pass `on_message`, it also calls `listen()`. Timeout 30 s. |
| `send_and_wait(session_id, message, user_id=None, metadata=None, model=None, timeout=120)` | `ChatResponse` | Waits for the reply. `timeout` is in **seconds**. `model` overrides the agent's model. Empty or whitespace-only messages raise `ValueError`. |
| `send(session_id, message, user_id=None, metadata=None, model=None, mode="production")` | `dict` (raw JSON) | Same request, but returns the raw response dict (`response`, `token_usage`, `success`, …). It still blocks, with a 120 s timeout. |
| `listen(session_id, on_message)` | `None` | Starts a background daemon thread that reads SSE from `GET {agent_url}/sessions/{id}/stream`. It reconnects with backoff from 5 s up to 60 s. Calling it again for the same session does nothing. |
| `run()` | `None` | Blocks until Ctrl+C, then calls `close()`. Use it to keep a script alive for `listen` callbacks. |
| `close()` | `None` | Stops all streams. |
| `get_session(session_id)` | `SessionInfo` | Needs backend support (webhook `action: get_session_info`). |
| `update_session(session_id, title=None, metadata=None, status=None)` | `SessionInfo` | `status` must be `"active"` or `"archived"`. |
| `delete_session(session_id)` | `dict` | Also stops that session's stream. |
| `get_session_stats(session_id)` | `dict` | |
| `get_messages(session_id, limit=20, offset=0)` | `dict` | The messages list and pagination info, as the backend returns them. |

The five session-management methods (`get_session` through `get_messages`)
depend on webhook `action`s that not every backend implements. They raise if
the backend refuses. Only `create_session`, `send_and_wait` and `send` are
guaranteed to work.

### Streaming callback

`on_message` gets the **raw dict** from each SSE frame that has a `content`
key. Frames whose `type` is `ping` or `connected` are skipped. The callback
runs on the stream thread, so keep it fast and don't raise from it.

```python
def on_message(msg: dict):
    print(f"{msg.get('role')}: {msg['content']}")

client = AgentClient(agent_id="…", api_key="sk_live_…")
sid = client.create_session(on_message=on_message, title="Streaming chat")
client.send(sid, "Tell me a story")
client.run()  # blocks; Ctrl+C to stop
```

## Data classes (`olbrain.session`, re-exported from `olbrain`)

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
returns them, and `Session.get_stats()` always falls back to local data.

## Errors (`olbrain.exceptions`)

All of them subclass `OlbrainError`, which has `.message`, `.error_code` and
`.details`.

| Condition | Raised |
|---|---|
| Bad constructor args, empty message, bad `mode`/`status` | `ValueError` (**not** `ValidationError`) |
| HTTP 401 | `AuthenticationError` |
| HTTP 404 whose detail mentions "session" | `SessionNotFoundError` (a subclass of `SessionError`) |
| Other HTTP 404 | `OlbrainError` ("Endpoint not found (404) …") |
| HTTP 429 | `RateLimitError` (`.retry_after` from `detail.retry_after`, may be `None`) |
| Any other non-200 (403, 5xx…) | `OlbrainError("Failed to <operation>: <status> - <detail>")` |
| Connection error or timeout | `NetworkError` |

```python
from olbrain import AgentClient, AuthenticationError, RateLimitError, NetworkError, OlbrainError
import time

def ask(client, sid, text, tries=3):
    for i in range(tries):
        try:
            return client.send_and_wait(sid, text)
        except RateLimitError as e:
            time.sleep(e.retry_after or 2 ** i)
        except NetworkError:
            time.sleep(2 ** i)
    raise OlbrainError("gave up")
```

`ValidationError` and `StreamingError` are exported, but the client never
raises them.

## Logging

The SDK logs through `logging.getLogger("olbrain")`. Turn on
`logging.basicConfig(level=logging.DEBUG)` to see requests and stream events.
