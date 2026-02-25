"""
Session management for Olbrain agent conversations.
"""

import logging
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime

from .exceptions import SessionError

logger = logging.getLogger(__name__)


@dataclass
class TokenUsage:
    """Token usage and cost information for a response."""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost: float = 0.0

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TokenUsage':
        """Create TokenUsage from API response dict."""
        if not data:
            return cls()
        return cls(
            prompt_tokens=data.get('prompt_tokens', data.get('prompt', 0)),
            completion_tokens=data.get('completion_tokens', data.get('completion', 0)),
            total_tokens=data.get('total_tokens', data.get('total', 0)),
            cost=data.get('cost', 0.0)
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'prompt_tokens': self.prompt_tokens,
            'completion_tokens': self.completion_tokens,
            'total_tokens': self.total_tokens,
            'cost': self.cost
        }


@dataclass
class SessionInfo:
    """Information about a session."""
    session_id: str
    title: str = ""
    status: str = "active"  # active, archived
    created_at: str = ""
    updated_at: str = ""
    message_count: int = 0
    user_id: Optional[str] = None
    channel: str = "api"
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SessionInfo':
        """Create SessionInfo from API response dict."""
        return cls(
            session_id=data.get('session_id', ''),
            title=data.get('title', ''),
            status=data.get('status', 'active'),
            created_at=data.get('created_at', ''),
            updated_at=data.get('updated_at', ''),
            message_count=data.get('message_count', 0),
            user_id=data.get('user_id'),
            channel=data.get('channel', 'api'),
            metadata=data.get('metadata') or {}
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'session_id': self.session_id,
            'title': self.title,
            'status': self.status,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'message_count': self.message_count,
            'user_id': self.user_id,
            'channel': self.channel,
            'metadata': self.metadata
        }


@dataclass
class Message:
    """Represents a single message in a conversation."""
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: datetime
    metadata: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert message to dictionary."""
        return {
            'role': self.role,
            'content': self.content,
            'timestamp': self.timestamp.isoformat(),
            'metadata': self.metadata or {}
        }


@dataclass
class ChatResponse:
    """Response from agent chat interaction."""
    text: str
    session_id: str
    success: bool = True
    token_usage: Optional[TokenUsage] = None
    model_used: Optional[str] = None
    response_time_ms: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any], session_id: str = "") -> 'ChatResponse':
        """Create ChatResponse from API response dict."""
        token_usage = None
        if data.get('token_usage'):
            token_usage = TokenUsage.from_dict(data['token_usage'])

        return cls(
            text=data.get('response', data.get('text', '')),
            session_id=data.get('session_id', data.get('conversation_id', session_id)),
            success=data.get('success', True),
            token_usage=token_usage,
            model_used=data.get('model_used'),
            response_time_ms=data.get('response_time_ms'),
            metadata=data.get('metadata'),
            error=data.get('error')
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert response to dictionary."""
        return {
            'text': self.text,
            'session_id': self.session_id,
            'success': self.success,
            'token_usage': self.token_usage.to_dict() if self.token_usage else None,
            'model_used': self.model_used,
            'response_time_ms': self.response_time_ms,
            'metadata': self.metadata or {},
            'error': self.error
        }


class Session:
    """
    Represents a conversation session with an Olbrain agent.

    Sessions provide persistent conversation context and history management.
    Each session maintains its own conversation thread with the agent.

    Args:
        session_id: Unique identifier for this session
        agent: Reference to the parent Agent instance
        user_id: Optional user identifier
        metadata: Optional session metadata
    """
    
    def __init__(
        self,
        session_id: str,
        agent_client: 'AgentClient',  # Forward reference to AgentClient
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.session_id = session_id
        self.agent_client = agent_client
        self.user_id = user_id or "sdk_user"
        self.metadata = metadata or {}
        self.created_at = datetime.now()
        self.last_activity = datetime.now()
        
        logger.debug(f"Created session {session_id} for agent {agent_client.agent_id}")
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics for this session.
        
        Returns:
            Dictionary containing session statistics
        """
        try:
            # Try to get stats from agent service
            return self.agent_client._get_session_stats(self.session_id)
        except Exception as e:
            logger.error(f"Failed to get session stats: {str(e)}")
            # Return basic session info if service stats fail
            return {
                'session_id': self.session_id,
                'created_at': self.created_at.isoformat(),
                'last_activity': self.last_activity.isoformat(),
                'user_id': self.user_id,
                'metadata': self.metadata
            }
    
    def __repr__(self) -> str:
        return f"Session(id={self.session_id}, agent={self.agent_client.agent_id}, user={self.user_id})"