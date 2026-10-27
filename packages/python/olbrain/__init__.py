"""
Olbrain Python SDK
AgentClient for conversational agents; Olbrain for workflow runs, approvals and research agents

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
from .olbrain import Olbrain
from .session import ChatResponse, SessionInfo, TokenUsage, Message, Session
from .exceptions import (
    OlbrainError,
    AuthenticationError,
    NetworkError,
    SessionError,
    SessionNotFoundError,
    RateLimitError,
    ValidationError,
    StreamingError,
    ApiError,
    NotFoundError,
    BillingError,
)

__version__ = "0.5.1"
__author__ = "Olbrain Team"
__email__ = "support@olbrain.com"

__all__ = [
    # Main client
    'AgentClient',
    'Olbrain',
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
    'StreamingError',
    'ApiError',
    'NotFoundError',
    'BillingError',
]
