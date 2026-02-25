# Migration Guide: v0.2.x to v0.3.0

## Overview

Version 0.3.0 introduces breaking changes to align the SDK with the webhook-only agent API architecture. The agent API no longer supports REST-style endpoints for session management or SSE streaming.

## Breaking Changes

### 1. SSE Streaming Removed

**What Changed:**
- SSE (Server-Sent Events) streaming is no longer supported
- The agent API does not provide streaming endpoints
- Methods `listen()` and `run()` now raise `NotImplementedError`

**v0.2.x (Old):**
```python
def on_message(msg):
    print(msg['content'])

session_id = client.create_session(on_message=on_message)
client.send(session_id, "Hello!")
client.run()  # Blocked and received messages via callback
```

**v0.3.0 (New):**
```python
# Use synchronous send() instead
session_id = client.create_session()
response_data = client.send(session_id, "Hello!")
response = ChatResponse.from_dict(response_data, session_id)
print(response.text)

# Or use async webhook pattern
client.send_async(
    session_id,
    "Hello!",
    webhook_url="https://your-app.com/webhook"
)
```

### 2. Session Management Removed

**What Changed:**
- Session CRUD operations are no longer supported
- Methods `get_session()`, `update_session()`, `delete_session()` raise `NotImplementedError`
- Session statistics and message history retrieval removed

**v0.2.x (Old):**
```python
# Get session info
info = client.get_session(session_id)
print(f"Messages: {info.message_count}")

# Update session
client.update_session(session_id, title="New Title")

# Get stats
stats = client.get_session_stats(session_id)

# Get history
messages = client.get_messages(session_id, limit=20)

# Delete session
client.delete_session(session_id)
```

**v0.3.0 (New):**
```python
# Only create_session() and send() are supported
session_id = client.create_session(title="My Chat")
response_data = client.send(session_id, "Hello!")

# You must maintain conversation history in your own application
# Sessions are managed automatically by the agent
```

### 3. Response Schema Changed

**What Changed:**
- Field `model_used` renamed to `model`
- Field `response_time_ms` renamed to `processing_time_ms`
- New field `cost` added (top-level cost in USD)
- New field `mode` added (values: "sync" or "session_created")

**v0.2.x (Old):**
```python
response = client.send_and_wait(session_id, "Hello")
print(response.model_used)  # Old field name
print(response.response_time_ms)  # Old field name
```

**v0.3.0 (New):**
```python
response_data = client.send(session_id, "Hello")
response = ChatResponse.from_dict(response_data, session_id)
print(response.model)  # New field name
print(response.processing_time_ms)  # New field name
print(response.cost)  # New field - cost in USD
print(response.mode)  # New field - "sync" or "session_created"
```

### 4. send_and_wait() Deprecated

**What Changed:**
- `send_and_wait()` is deprecated (but still works with deprecation warning)
- It now calls `send()` internally
- Use `send()` directly instead

**v0.2.x (Old):**
```python
response = client.send_and_wait(session_id, "Hello")
print(response.text)
```

**v0.3.0 (New):**
```python
# Preferred: Use send() directly
response_data = client.send(session_id, "Hello")
response = ChatResponse.from_dict(response_data, session_id)
print(response.text)

# Still works but shows deprecation warning:
# response = client.send_and_wait(session_id, "Hello")
```

## New Features in v0.3.0

### 1. Async Webhook Pattern

Send messages for async processing with webhook delivery:

```python
result = client.send_async(
    session_id="existing-session",
    message="Process this in background",
    webhook_url="https://your-app.com/webhook"
)
print(f"Queued: {result['success']}")
```

### 2. Enhanced send() Method

The `send()` method now supports additional parameters:

```python
response_data = client.send(
    session_id,
    "Hello",
    user_id="user-123",
    metadata={"source": "web"},
    model="gpt-4o",
    mode="production",
    attachments=[...],  # File attachments
    response_mode="sync",  # or "async"
    webhook_url="https://..."  # For async mode
)
```

## Migration Checklist

- [ ] Replace `send_and_wait()` calls with `send()` + `ChatResponse.from_dict()`
- [ ] Remove streaming code (`listen()`, `run()`, `on_message` callbacks)
- [ ] Remove session management code (`get_session()`, `update_session()`, `delete_session()`)
- [ ] Remove message history retrieval (`get_messages()`, `get_session_stats()`)
- [ ] Update field references: `model_used` → `model`, `response_time_ms` → `processing_time_ms`
- [ ] Add handling for new fields: `cost`, `mode`
- [ ] Implement your own conversation history tracking if needed
- [ ] Consider using `send_async()` for long-running operations

## Code Examples

### Before (v0.2.x)

```python
from olbrain import AgentClient

client = AgentClient(agent_id="...", api_key="...")

# Create session with streaming
def on_message(msg):
    print(f"{msg['role']}: {msg['content']}")

session_id = client.create_session(on_message=on_message)

# Send messages
client.send(session_id, "Hello!")
client.send(session_id, "How are you?")

# Get session info
info = client.get_session(session_id)
print(f"Messages: {info.message_count}")

# Get history
messages = client.get_messages(session_id)

# Block and process messages
client.run()
```

### After (v0.3.0)

```python
from olbrain import AgentClient, ChatResponse

client = AgentClient(agent_id="...", api_key="...")

# Create session (no streaming)
session_id = client.create_session()

# Send messages and get responses
response1 = client.send(session_id, "Hello!")
chat1 = ChatResponse.from_dict(response1, session_id)
print(f"Agent: {chat1.text}")
print(f"Cost: ${chat1.cost:.6f}")

response2 = client.send(session_id, "How are you?")
chat2 = ChatResponse.from_dict(response2, session_id)
print(f"Agent: {chat2.text}")

# Track conversation history yourself if needed
conversation_history = [
    {"role": "user", "content": "Hello!", "response": chat1.text},
    {"role": "user", "content": "How are you?", "response": chat2.text}
]

client.close()
```

## Deprecated Features

These features are deprecated and will be removed in v0.4.0:

| Feature | Status | Alternative |
|---------|--------|-------------|
| `send_and_wait()` | Deprecated | Use `send()` |
| `listen()` | Removed | Use `send()` for sync |
| `run()` | Removed | Use `send()` for sync |
| `get_session()` | Removed | Not available |
| `update_session()` | Removed | Not available |
| `delete_session()` | Removed | Not available |
| `get_messages()` | Removed | Track history locally |
| `get_session_stats()` | Removed | Track costs locally |
| `on_message` callback | Removed | Use `send()` for sync |
| `streaming.MessageStream` | Deprecated | Use `send()` |

## Support

If you encounter issues during migration:

1. Check the [examples/](examples/) directory for updated code examples
2. Review the updated [README.md](README.md) for current API usage
3. Open an issue on [GitHub](https://github.com/Olbrain/olbrain-python-sdk/issues)

## Timeline

- **v0.3.0** (Current): Deprecated features show warnings
- **v0.4.0** (Future): Deprecated features removed entirely
