# Olbrain Python SDK

[![PyPI version](https://badge.fury.io/py/olbrain-python-sdk.svg)](https://pypi.org/project/olbrain-python-sdk/)
[![Python Support](https://img.shields.io/pypi/pyversions/olbrain-python-sdk.svg)](https://pypi.org/project/olbrain-python-sdk/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Official Python SDK for integrating Olbrain AI agents into your applications.

## Installation

```bash
pip install olbrain-python-sdk
```

### Development Installation

For local development and testing:

```bash
# Clone the repository
git clone https://github.com/Olbrain/olbrain-python-sdk.git
cd olbrain-python-sdk

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install in development mode
pip install -e .

# Run tests
pytest tests/
```

## Quick Start

Get your credentials from the Olbrain dashboard:
- **Agent ID**: Your unique agent identifier
- **API Key**: Starts with `sk_live_` (production) or `sk_` (test)

### Basic Example

```python
from olbrain import AgentClient

# Initialize client
client = AgentClient(
    agent_id="your-agent-id",
    api_key="sk_live_your_api_key"
)

# Create a session and send a message
session_id = client.create_session(title="My Chat")
response = client.send_and_wait(session_id, "Hello!")

print(f"Response: {response.text}")
print(f"Tokens used: {response.token_usage.total_tokens}")

client.close()
```

### Using Context Manager

```python
from olbrain import AgentClient

# Automatically closes client when done
with AgentClient(agent_id="your-agent-id", api_key="sk_live_your_key") as client:
    session_id = client.create_session(title="My Chat")
    response = client.send_and_wait(session_id, "What is machine learning?")
    print(response.text)
```

## Features

- **Simple API** - Just `agent_id` and `api_key` to get started
- **Session Management** - Create, update, archive sessions with metadata
- **Sync & Streaming** - Both request-response and real-time streaming
- **Token Tracking** - Monitor usage and costs per request
- **Model Override** - Switch models per-message
- **Error Handling** - Comprehensive exception hierarchy

## Usage

### 1. Synchronous Messaging (Request-Response)

Send a message and wait for the complete response:

```python
from olbrain import AgentClient

with AgentClient(agent_id="your-agent-id", api_key="sk_live_your_key") as client:
    # Create a new chat session
    session_id = client.create_session(title="My Chat")

    # Send message and wait for response
    response = client.send_and_wait(session_id, "What is Python?")

    # Access response data
    print(f"Agent: {response.text}")
    print(f"Tokens used: {response.token_usage.total_tokens}")
    print(f"Model: {response.model_used}")
```

### 2. Real-Time Streaming (Callback Pattern)

Receive messages in real-time as they arrive:

```python
from olbrain import AgentClient

client = AgentClient(agent_id="your-agent-id", api_key="sk_live_your_key")

# Define message handler
def on_message(msg):
    role = msg.get('role', 'unknown')  # 'user' or 'assistant'
    content = msg.get('content', '')
    tokens = msg.get('token_usage', {}).get('total', 0)

    print(f"[{role.upper()}]: {content}")
    if tokens > 0:
        print(f"  Tokens: {tokens}")

# Create session with streaming callback
session_id = client.create_session(
    title="Streaming Chat",
    on_message=on_message
)

# Send message - responses arrive via callback
client.send(session_id, "Tell me a story")

# Keep client running to receive messages
client.run()  # Blocks until Ctrl+C
```

### 3. Session Management

Create, retrieve, and manage chat sessions:

```python
from olbrain import AgentClient

with AgentClient(agent_id="your-agent-id", api_key="sk_live_your_key") as client:
    # Create session with metadata
    session = client.create_session(
        title="Support Chat",
        user_id="user-123",
        metadata={"source": "web", "priority": "high"},
        mode="production"
    )

    # Get session info
    session_info = client.get_session(session)
    print(f"Title: {session_info.title}")
    print(f"Message count: {session_info.message_count}")

    # Get message history
    messages = client.get_messages(session, limit=20)
    for msg in messages.get('messages', []):
        print(f"{msg['role']}: {msg['content']}")

    # Update session
    updated = client.update_session(session, title="Updated Chat Title")

    # Get session statistics
    stats = client.get_session_stats(session)
    print(f"Stats: {stats}")

    # Archive/delete session
    client.delete_session(session)
```

### 4. Model Override

Send messages using a specific model:

```python
from olbrain import AgentClient

with AgentClient(agent_id="your-agent-id", api_key="sk_live_your_key") as client:
    session_id = client.create_session()

    # Use specific model for this request
    response = client.send_and_wait(
        session_id,
        "Solve this complex problem...",
        model="gpt-4"  # Or any other available model
    )

    print(f"Model used: {response.model_used}")
```

### 5. Multiple Messages in Same Session

Maintain conversation context:

```python
from olbrain import AgentClient

with AgentClient(agent_id="your-agent-id", api_key="sk_live_your_key") as client:
    session_id = client.create_session(title="Q&A Session")

    # First message
    response1 = client.send_and_wait(session_id, "What is machine learning?")
    print(f"Response 1: {response1.text}\n")

    # Follow-up - agent remembers context
    response2 = client.send_and_wait(session_id, "Can you give me a practical example?")
    print(f"Response 2: {response2.text}\n")

    # Another follow-up
    response3 = client.send_and_wait(session_id, "What are the main algorithms?")
    print(f"Response 3: {response3.text}")
```

### 6. Error Handling

Handle different error scenarios gracefully:

```python
from olbrain import AgentClient
from olbrain.exceptions import (
    AuthenticationError,
    SessionNotFoundError,
    RateLimitError,
    NetworkError,
    OlbrainError
)

try:
    client = AgentClient(agent_id="your-agent-id", api_key="sk_live_your_key")
    session_id = client.create_session()
    response = client.send_and_wait(session_id, "Hello")

except AuthenticationError:
    print("❌ Authentication failed - check your API key")

except SessionNotFoundError:
    print("❌ Session not found - create a new session")

except RateLimitError as e:
    print(f"⏱️ Rate limited - retry after {e.retry_after} seconds")

except NetworkError as e:
    print(f"🌐 Network error - check your connection: {e}")

except OlbrainError as e:
    print(f"❌ SDK error: {e}")

finally:
    if 'client' in locals():
        client.close()
```

## Configuration

### API Key

The SDK validates API keys. Valid prefixes are:
- `sk_live_` - Production keys
- `org_live_` - Organization keys
- `sk_` - Test keys
- `org_` - Test organization keys

```python
# Valid API key
client = AgentClient(
    agent_id="your-agent-id",
    api_key="sk_live_your_api_key_here"
)
```

### Environment Variables

```bash
export OLBRAIN_API_KEY="sk_live_your_api_key"
export OLBRAIN_AGENT_ID="your-agent-id"
```

### Logging

Enable debug logging to troubleshoot issues:

```python
import logging

# Set SDK logging level
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Create client after setting up logging
client = AgentClient(agent_id="...", api_key="...")
```

## Troubleshooting

### Common Issues

**"Invalid API key" error**
- Ensure your API key starts with `sk_live_`, `org_live_`, `sk_`, or `org_`
- Check that you copied the key correctly (no extra spaces)

**"Stream connection failed" error**
- Check that your agent ID is correct
- Verify you have a stable internet connection
- Try restarting the client

**"Session not found" error**
- Verify the session ID is correct
- Check that the session hasn't expired
- Create a new session if needed

**Slow responses**
- Check network latency
- Increase the timeout parameter in methods
- Verify the agent is responsive via the dashboard

### Local Development Testing

Test the SDK locally with your credentials:

```bash
# Install in development mode
pip install -e .

# Run the test script
python test_agent.py

# Or run unit tests
pytest tests/ -v
```

The test will:
1. Initialize the SDK client
2. Create a chat session
3. Test real-time message streaming
4. Accept interactive input (type 'exit' to quit)

## API Reference

### AgentClient Methods

#### Session Management

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create_session()` | `title`, `user_id`, `metadata`, `on_message`, `mode`, `description` | `str` (session_id) | Create a new chat session |
| `get_session(session_id)` | `session_id` | `SessionInfo` | Get session details |
| `update_session(session_id, ...)` | `session_id`, `title`, `metadata`, `status` | `SessionInfo` | Update session properties |
| `delete_session(session_id)` | `session_id` | `Dict` | Archive/delete a session |
| `get_messages(session_id, ...)` | `session_id`, `limit`, `offset` | `Dict` | Get message history |
| `get_session_stats(session_id)` | `session_id` | `Dict` | Get session statistics |

#### Message Operations

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `send(session_id, message, ...)` | `session_id`, `message`, `user_id`, `metadata`, `model` | `Dict` | Send message (async with callback) |
| `send_and_wait(session_id, message, ...)` | `session_id`, `message`, `user_id`, `metadata`, `model`, `timeout` | `ChatResponse` | Send and wait for response |
| `listen(session_id, on_message)` | `session_id`, `on_message` | - | Start listening to session |
| `run()` | - | - | Block and process streaming messages |
| `close()` | - | - | Close client and cleanup resources |

### Response Objects

**ChatResponse**
```python
response = client.send_and_wait(session_id, "Hello")

# Access response data
response.text           # str - The agent's response
response.success        # bool - Whether request succeeded
response.token_usage    # TokenUsage - Token statistics
response.model_used     # str - Model that generated response
response.error          # str - Error message (if any)
```

**SessionInfo**
```python
session = client.get_session(session_id)

session.session_id      # str - Session identifier
session.title           # str - Session title
session.message_count   # int - Number of messages
session.metadata        # dict - Custom metadata
session.status          # str - 'active' or 'archived'
```

**TokenUsage**
```python
tokens = response.token_usage

tokens.prompt_tokens      # int - Input tokens
tokens.completion_tokens  # int - Output tokens
tokens.total_tokens       # int - Total tokens used
```

### Exceptions

| Exception | Description |
|-----------|-------------|
| `OlbrainError` | Base exception |
| `AuthenticationError` | Invalid API key |
| `SessionNotFoundError` | Session not found |
| `RateLimitError` | Rate limit exceeded |
| `NetworkError` | Connection issues |
| `ValidationError` | Invalid input |
| `StreamingError` | Streaming error |

## Examples

Complete examples are available in the [examples/](examples/) directory:

- **`basic_usage.py`** - Core SDK features and basic messaging
- **`session_management.py`** - Full session lifecycle (create, retrieve, update, delete)
- **`streaming_responses.py`** - Real-time message streaming with callbacks
- **`error_handling.py`** - Error handling patterns and best practices

Run any example:
```bash
python examples/basic_usage.py
```

## Best Practices

1. **Use Context Manager** - Always use `with` statements for automatic cleanup:
   ```python
   with AgentClient(agent_id="...", api_key="...") as client:
       # Your code here
   ```

2. **Handle Errors** - Always wrap API calls in try-except blocks
   ```python
   try:
       response = client.send_and_wait(session_id, message)
   except OlbrainError as e:
       # Handle error appropriately
   ```

3. **Reuse Sessions** - Keep session IDs to maintain conversation context
   ```python
   session_id = client.create_session(title="Customer Chat")
   # Reuse session_id for multiple messages
   response1 = client.send_and_wait(session_id, "First question")
   response2 = client.send_and_wait(session_id, "Follow-up question")
   ```

4. **Monitor Token Usage** - Track tokens for cost management
   ```python
   response = client.send_and_wait(session_id, message)
   print(f"Tokens: {response.token_usage.total_tokens}")
   ```

5. **Clean Up** - Always close client when done
   ```python
   client.close()
   ```

## Support

- **Issues**: [GitHub Issues](https://github.com/Olbrain/olbrain-python-sdk/issues)
- **Documentation**: See [examples/](examples/) directory
- **API Status**: Check [status page](https://olbrain.com/status)

## License

MIT License - see [LICENSE](LICENSE)

## Version

Current version: **0.2.0**

## Links

- [PyPI Package](https://pypi.org/project/olbrain-python-sdk/)
- [GitHub Repository](https://github.com/Olbrain/olbrain-python-sdk)
- [Report Issues](https://github.com/Olbrain/olbrain-python-sdk/issues)
- [Olbrain Website](https://olbrain.com)
