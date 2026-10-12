"""
Olbrain Python SDK
Simple client for Olbrain AI agents with real-time message streaming

Full offline API reference: AGENTS.md next to this file.

Example:
    >>> from olbrain import AgentClient
    >>>
    >>> client = AgentClient(agent_id="agent-123", api_key="sk_live_...")
    >>>
    >>> # Create session and send messages
    >>> session_id = client.create_session(title="My Chat")
    >>> response = client.send_and_wait(session_id, "Hello!")
    >>> print(response.text)
    >>>
    >>> # Or with real-time streaming
    >>> def on_message(msg):
    ...     print(f"{msg['role']}: {msg['content']}")
    >>> session_id = client.create_session(on_message=on_message, title="Streaming Chat")
    >>> client.send(session_id, "Hello!")
    >>> client.run()  # Blocks, receives all messages
"""

from .client import AgentClient
from .session import ChatResponse, SessionInfo, TokenUsage, Message, Session
from .exceptions import (
    OlbrainError,
    AuthenticationError,
    NetworkError,
    SessionError,
    SessionNotFoundError,
    RateLimitError,
    ValidationError,
    StreamingError
)

__version__ = "0.3.2"
__author__ = "Olbrain Team"
__email__ = "support@olbrain.com"

__all__ = [
    # Main client
    'AgentClient',
    # Data classes
    'ChatResponse',
    'SessionInfo',
    'TokenUsage',
    'Message',
    'Session',
    # Exceptions
    'OlbrainError',
    'AuthenticationError',
    'NetworkError',
    'SessionError',
    'SessionNotFoundError',
    'RateLimitError',
    'ValidationError',
    'StreamingError'
]
