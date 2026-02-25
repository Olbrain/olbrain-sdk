"""
Olbrain Python SDK - Fixed Client (OPTION B)
Clean API for agent interaction with real-time message streaming

FIXES:
- Uses webhook endpoint for all operations (no fake /sessions/* endpoints)
- Backend manages sessions internally via webhook
- Preserves all original functionality (streaming, session management, etc.)
- send_and_wait() now works correctly
"""

import requests
import logging
import time
from typing import Callable, Optional, Dict, Any, List

logger = logging.getLogger(__name__)

# Import SDK components with proper fallback handling
try:
    from .streaming import MessageStream
    from .session import ChatResponse, SessionInfo, TokenUsage
    from .exceptions import (
        OlbrainError,
        AuthenticationError,
        NetworkError,
        SessionNotFoundError,
        RateLimitError
    )
except ImportError as import_error:
    # Only catch missing module errors, not syntax errors or other issues
    if 'cannot import' in str(import_error) or 'No module named' in str(import_error):
        logger.warning(f'SDK modules not available, using fallback classes: {import_error}')
        
        # Fallback exception classes
        class OlbrainError(Exception): 
            """Base exception for Olbrain SDK"""
            pass
        
        class AuthenticationError(OlbrainError): 
            """Authentication failed"""
            pass
        
        class NetworkError(OlbrainError): 
            """Network request failed"""
            pass
        
        class SessionNotFoundError(OlbrainError): 
            """Session not found"""
            pass
        
        class RateLimitError(OlbrainError):
            """Rate limit exceeded"""
            def __init__(self, message, retry_after=None):
                super().__init__(message)
                self.retry_after = retry_after
        
        # Fallback data classes
        class TokenUsage:
            """Token usage statistics"""
            def __init__(self, prompt_tokens=0, completion_tokens=0, total_tokens=0):
                self.prompt_tokens = prompt_tokens
                self.completion_tokens = completion_tokens
                self.total_tokens = total_tokens
        
        class ChatResponse:
            """Agent chat response"""
            def __init__(self, text, session_id, token_usage=None, model_used=None):
                self.text = text
                self.session_id = session_id
                self.token_usage = token_usage or TokenUsage()
                self.model_used = model_used
            
            @classmethod
            def from_dict(cls, data, session_id):
                return cls(
                    text=data.get('response', ''),
                    session_id=session_id,
                    token_usage=TokenUsage(
                        prompt_tokens=data.get('token_usage', {}).get('prompt_tokens', 0),
                        completion_tokens=data.get('token_usage', {}).get('completion_tokens', 0),
                        total_tokens=data.get('token_usage', {}).get('total_tokens', 0)
                    ),
                    model_used=data.get('model_used')
                )
        
        class SessionInfo:
            """Session information"""
            def __init__(self, session_id, title=None, message_count=0, metadata=None):
                self.session_id = session_id
                self.title = title
                self.message_count = message_count
                self.metadata = metadata or {}
            
            @classmethod
            def from_dict(cls, data):
                return cls(
                    session_id=data.get('session_id'),
                    title=data.get('title'),
                    message_count=data.get('message_count', 0),
                    metadata=data.get('metadata', {})
                )
        
        class MessageStream:
            """Placeholder - streaming not available without full SDK"""
            def __init__(self, agent_url, api_key, session_id, on_message):
                self.session_id = session_id
                logger.warning('Streaming requires full SDK installation')
            
            def start(self): 
                raise NotImplementedError('Streaming requires full SDK installation')
            
            def stop(self): 
                pass
    else:
        # Re-raise if it's a different kind of import error (syntax error, etc.)
        raise


class AgentClient:
    """
    Fixed client for interacting with Olbrain agents

    CRITICAL FIX: All operations now use the webhook endpoint correctly.
    The backend manages sessions internally - we just pass session_id as metadata.

    Example:
        >>> from olbrain import AgentClient
        >>>
        >>> client = AgentClient(agent_id="agent-123", api_key="sk_live_...")
        >>>
        >>> # Create session - backend creates it via webhook
        >>> session = client.create_session(title="My Chat")
        >>>
        >>> # Send message - uses same webhook endpoint
        >>> response = client.send_and_wait(session, "Hello!")
        >>> print(response.text)
    """

    def __init__(
        self,
        agent_id: str,
        api_key: str,
        agent_url: Optional[str] = None
    ):
        """
        Initialize Olbrain client

        Args:
            agent_id: Agent identifier
            api_key: API key (must start with 'sk_live_', 'org_live_', 'sk_', or 'org_')
            agent_url: Optional agent URL (auto-constructed if not provided)

        Raises:
            ValueError: If agent_id or api_key is invalid
        """
        if not agent_id:
            raise ValueError("agent_id is required")

        valid_prefixes = ('sk_live_', 'org_live_', 'sk_', 'org_')
        if not api_key or not api_key.startswith(valid_prefixes):
            raise ValueError(
                "Invalid API key - must start with 'sk_live_', 'org_live_', 'sk_', or 'org_'"
            )

        self.agent_id = agent_id
        self.api_key = api_key

        # Auto-construct agent URL if not provided
        if agent_url:
            self.agent_url = agent_url.rstrip('/')
        else:
            # Use Olbrain shared agent URL
            self.agent_url = "https://olbrain-agent-cloud-768934887465.us-central1.run.app"

        self._streams = {}  # session_id -> MessageStream
        self._running = False

        logger.info(f"AgentClient initialized for {agent_id}")

    def create_session(
        self,
        on_message: Callable = None,
        title: str = None,
        user_id: str = None,
        metadata: Dict[str, Any] = None,
        mode: str = "production",
        description: str = None
    ) -> str:
        """
        Create new session via webhook endpoint.

        FIXED: Now uses webhook endpoint correctly. Backend creates the session
        and returns session_id in response.

        Args:
            on_message: Optional callback function(message_dict) for real-time messages
            title: Optional title for the session
            user_id: Optional user identifier for tracking
            metadata: Optional metadata dict
            mode: Session mode - 'development', 'testing', or 'production' (default)
            description: Optional session description

        Returns:
            session_id (string)

        Raises:
            OlbrainError: If session creation fails
            AuthenticationError: If API key is invalid
        """
        if mode not in ['development', 'testing', 'production']:
            raise ValueError("mode must be 'development', 'testing', or 'production'")

        try:
            # Build request payload
            request_metadata = metadata.copy() if metadata else {}
            if description:
                request_metadata['session_description'] = description

            payload = {
                'message': title or "New Session",
                'response_mode': 'sync',
                'mode': mode
            }
            if user_id:
                payload['user_id'] = user_id
            if request_metadata:
                payload['metadata'] = request_metadata

            # Create session via webhook endpoint
            response = requests.post(
                f"{self.agent_url}/api/agent/webhook",
                headers={
                    'Authorization': f'Bearer {self.api_key}',
                    'Content-Type': 'application/json',
                    **({'X-Agent-ID': self.agent_id} if self.agent_id else {})
                },
                json=payload,
                timeout=30
            )

            self._handle_response_errors(response, "create session")

            data = response.json()
            session_id = data.get('session_id')

            if not session_id:
                raise OlbrainError("No session_id in response")

            logger.info(f"Created session {session_id}")

            # Start listening for messages if callback provided
            if on_message:
                self.listen(session_id, on_message)

            return session_id

        except requests.exceptions.RequestException as e:
            raise NetworkError(f"Network error creating session: {e}")

    def send(
        self,
        session_id: str,
        message: str,
        user_id: str = None,
        metadata: Dict[str, Any] = None,
        model: str = None,
        mode: str = "production"
    ) -> Dict[str, Any]:
        """
        Send message to agent via webhook.

        FIXED: Uses webhook endpoint with session_id instead of fake /sessions/* endpoint.

        Args:
            session_id: Session identifier
            message: Message text to send
            user_id: Optional user identifier
            metadata: Optional message metadata
            model: Optional model override (e.g., 'gpt-4', 'claude-3-opus')
            mode: Session mode - 'development', 'testing', or 'production'

        Returns:
            Response dict with success, response, token_usage, etc.

        Raises:
            ValueError: If message is empty
            OlbrainError: If send fails
        """
        if not message or not message.strip():
            raise ValueError("Message cannot be empty")

        try:
            payload = {
                'session_id': session_id,
                'message': message.strip(),
                'response_mode': 'sync',
                'mode': mode
            }
            if user_id:
                payload['user_id'] = user_id
            if metadata:
                payload['metadata'] = metadata
            if model:
                payload['model'] = model

            response = requests.post(
                f"{self.agent_url}/api/agent/webhook",
                headers={
                    'Authorization': f'Bearer {self.api_key}',
                    'Content-Type': 'application/json',
                    **({'X-Agent-ID': self.agent_id} if self.agent_id else {})
                },
                json=payload,
                timeout=120
            )

            # Check for errors before attempting to parse
            self._handle_response_errors(response, "send message")
            
            # Only parse if response was successful
            if response.status_code == 200:
                data = response.json()
            else:
                # This shouldn't happen if _handle_response_errors works correctly
                raise OlbrainError(f"Unexpected status code {response.status_code}")
            
            logger.debug(f"Sent message to session {session_id}")
            return data

        except requests.exceptions.RequestException as e:
            raise NetworkError(f"Network error sending message: {e}")

    def send_and_wait(
        self,
        session_id: str,
        message: str,
        user_id: str = None,
        metadata: Dict[str, Any] = None,
        model: str = None,
        timeout: int = 120
    ) -> ChatResponse:
        """
        Send message and wait for response (synchronous).

        FIXED: Now uses webhook endpoint instead of non-existent /sessions/{id}/messages

        Args:
            session_id: Session identifier
            message: Message text to send
            user_id: Optional user identifier
            metadata: Optional message metadata
            model: Optional model override
            timeout: Request timeout in seconds (default: 120)

        Returns:
            ChatResponse with text, token_usage, model_used, etc.

        Raises:
            ValueError: If message is empty
            OlbrainError: If send fails
        """
        if not message or not message.strip():
            raise ValueError("Message cannot be empty")

        try:
            # CRITICAL FIX: Use webhook endpoint, not /sessions/{id}/messages
            payload = {
                'session_id': session_id,
                'message': message.strip(),
                'response_mode': 'sync'
            }
            if user_id:
                payload['user_id'] = user_id
            if metadata:
                payload['metadata'] = metadata
            if model:
                payload['model'] = model

            response = requests.post(
                f"{self.agent_url}/api/agent/webhook",  # FIXED: was /sessions/{id}/messages
                headers={
                    'Authorization': f'Bearer {self.api_key}',
                    'Content-Type': 'application/json',
                    **({'X-Agent-ID': self.agent_id} if self.agent_id else {})
                },
                json=payload,
                timeout=timeout
            )

            # Check for errors before attempting to parse
            self._handle_response_errors(response, "send message")
            
            # Only parse if response was successful
            if response.status_code == 200:
                data = response.json()
                logger.debug(f"Received response for session {session_id}")
                return ChatResponse.from_dict(data, session_id)
            else:
                # This shouldn't happen if _handle_response_errors works correctly
                raise OlbrainError(f"Unexpected status code {response.status_code}")

        except requests.exceptions.RequestException as e:
            raise NetworkError(f"Network error sending message: {e}")

    def listen(self, session_id: str, on_message: Callable):
        """
        Start listening for messages on existing session

        Args:
            session_id: Session to listen to
            on_message: Callback function(message_dict) for messages
        """
        if session_id in self._streams:
            logger.warning(f"Already listening to session {session_id}")
            return

        stream = MessageStream(
            agent_url=self.agent_url,
            api_key=self.api_key,
            session_id=session_id,
            on_message=on_message,
            agent_id=self.agent_id
        )
        stream.start()
        self._streams[session_id] = stream

        logger.info(f"Started listening to session {session_id}")

    def run(self):
        """
        Block forever and process message callbacks

        Call this to keep your program running and receive messages.
        Press Ctrl+C to exit gracefully.
        """
        self._running = True
        logger.info("Client running - press Ctrl+C to exit")

        try:
            while self._running:
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("Received interrupt signal, shutting down...")
            self.close()

    def close(self):
        """
        Stop all streams and cleanup resources
        """
        logger.info("Closing client...")
        self._running = False

        for session_id, stream in list(self._streams.items()):
            stream.stop()

        self._streams.clear()
        logger.info("Client closed")

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()

    def __repr__(self) -> str:
        return f"AgentClient(agent_id={self.agent_id})"

    # -------------------------------------------------------------------------
    # Session Management Methods - FIXED to use webhook
    # 
    # IMPORTANT: These methods use webhook 'action' parameters to interact with sessions.
    # 
    # Required backend actions:
    #   - 'get_session_info': Retrieve session details
    #   - 'update_session': Modify session metadata/title
    #   - 'delete_session': Archive/remove session
    #   - 'get_stats': Get token usage and statistics
    #   - 'get_messages': Retrieve message history
    #
    # If your backend does not support these actions, these methods may return errors
    # or unexpected results. Verify backend implementation supports these actions before use.
    # For basic messaging, use create_session() and send_and_wait() which always work.
    # -------------------------------------------------------------------------

    def get_session(self, session_id: str) -> SessionInfo:
        """
        Get session details.

        FIXED: Uses webhook to query session info instead of /sessions/{id}

        Args:
            session_id: Session identifier

        Returns:
            SessionInfo with session details

        Raises:
            SessionNotFoundError: If session doesn't exist
            OlbrainError: If request fails
        """
        try:
            # Query session info via webhook
            response = requests.post(
                f"{self.agent_url}/api/agent/webhook",
                headers={
                    'Authorization': f'Bearer {self.api_key}',
                    'Content-Type': 'application/json',
                    **({'X-Agent-ID': self.agent_id} if self.agent_id else {})
                },
                json={
                    'session_id': session_id,
                    'action': 'get_session_info'
                },
                timeout=30
            )

            self._handle_response_errors(response, "get session")

            data = response.json()
            return SessionInfo.from_dict(data)

        except requests.exceptions.RequestException as e:
            raise NetworkError(f"Network error getting session: {e}")

    def update_session(
        self,
        session_id: str,
        title: str = None,
        metadata: Dict[str, Any] = None,
        status: str = None
    ) -> SessionInfo:
        """
        Update session details via webhook.

        Args:
            session_id: Session identifier
            title: New session title (optional)
            metadata: New metadata dict (optional)
            status: New status - 'active' or 'archived' (optional)

        Returns:
            Updated SessionInfo
        """
        try:
            update_data = {}
            if title is not None:
                update_data['title'] = title
            if metadata is not None:
                update_data['metadata'] = metadata
            if status is not None:
                if status not in ['active', 'archived']:
                    raise ValueError("status must be 'active' or 'archived'")
                update_data['status'] = status

            response = requests.post(
                f"{self.agent_url}/api/agent/webhook",
                headers={
                    'Authorization': f'Bearer {self.api_key}',
                    'Content-Type': 'application/json',
                    **({'X-Agent-ID': self.agent_id} if self.agent_id else {})
                },
                json={
                    'session_id': session_id,
                    'action': 'update_session',
                    **update_data
                },
                timeout=30
            )

            self._handle_response_errors(response, "update session")

            data = response.json()
            return SessionInfo.from_dict(data)

        except requests.exceptions.RequestException as e:
            raise NetworkError(f"Network error updating session: {e}")

    def delete_session(self, session_id: str) -> Dict[str, Any]:
        """
        Archive/delete a session via webhook.

        Args:
            session_id: Session identifier

        Returns:
            Dict with success status
        """
        try:
            # Stop listening if we have an active stream
            if session_id in self._streams:
                self._streams[session_id].stop()
                del self._streams[session_id]

            response = requests.post(
                f"{self.agent_url}/api/agent/webhook",
                headers={
                    'Authorization': f'Bearer {self.api_key}',
                    'Content-Type': 'application/json',
                    **({'X-Agent-ID': self.agent_id} if self.agent_id else {})
                },
                json={
                    'session_id': session_id,
                    'action': 'delete_session'
                },
                timeout=30
            )

            self._handle_response_errors(response, "delete session")

            return response.json()

        except requests.exceptions.RequestException as e:
            raise NetworkError(f"Network error deleting session: {e}")

    def get_session_stats(self, session_id: str) -> Dict[str, Any]:
        """
        Get session statistics via webhook.

        Args:
            session_id: Session identifier

        Returns:
            Dict with session statistics
        """
        try:
            response = requests.post(
                f"{self.agent_url}/api/agent/webhook",
                headers={
                    'Authorization': f'Bearer {self.api_key}',
                    'Content-Type': 'application/json',
                    **({'X-Agent-ID': self.agent_id} if self.agent_id else {})
                },
                json={
                    'session_id': session_id,
                    'action': 'get_stats'
                },
                timeout=30
            )

            self._handle_response_errors(response, "get session stats")

            return response.json()

        except requests.exceptions.RequestException as e:
            raise NetworkError(f"Network error getting session stats: {e}")

    def get_messages(
        self,
        session_id: str,
        limit: int = 20,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get message history via webhook.

        Args:
            session_id: Session identifier
            limit: Maximum messages to return (default: 20)
            offset: Number of messages to skip (default: 0)

        Returns:
            Dict with messages list and pagination info
        """
        try:
            response = requests.post(
                f"{self.agent_url}/api/agent/webhook",
                headers={
                    'Authorization': f'Bearer {self.api_key}',
                    'Content-Type': 'application/json',
                    **({'X-Agent-ID': self.agent_id} if self.agent_id else {})
                },
                json={
                    'session_id': session_id,
                    'action': 'get_messages',
                    'limit': limit,
                    'offset': offset
                },
                timeout=30
            )

            self._handle_response_errors(response, "get messages")

            return response.json()

        except requests.exceptions.RequestException as e:
            raise NetworkError(f"Network error getting messages: {e}")

    # -------------------------------------------------------------------------
    # Helper Methods
    # -------------------------------------------------------------------------

    def _handle_response_errors(self, response: requests.Response, operation: str):
        """Handle HTTP response errors and raise appropriate exceptions."""
        if response.status_code == 200:
            return

        if response.status_code == 401:
            raise AuthenticationError("Invalid API key")

        if response.status_code == 404:
            # Better error message with proper error handling
            try:
                error_detail = response.json().get('detail', response.text)
                if isinstance(error_detail, str) and 'session' in error_detail.lower():
                    raise SessionNotFoundError(f"Session not found: {error_detail}")
                else:
                    raise OlbrainError(f"Endpoint not found (404): {error_detail}")
            except (ValueError, KeyError):
                # JSON parsing failed - use raw text
                raise OlbrainError(f"Endpoint not found (404) during {operation}")
            except AttributeError as attr_err:
                # This indicates a logic error, not a parsing issue
                logger.error(f"Unexpected AttributeError in error handling: {attr_err}")
                raise OlbrainError(f"Endpoint not found (404) during {operation}")

        if response.status_code == 429:
            try:
                data = response.json()
                retry_after = data.get('detail', {}).get('retry_after')
                raise RateLimitError(
                    f"Rate limit exceeded",
                    retry_after=retry_after
                )
            except (ValueError, KeyError):
                raise RateLimitError("Rate limit exceeded")
            except AttributeError as attr_err:
                logger.error(f"Unexpected AttributeError in rate limit handling: {attr_err}")
                raise RateLimitError("Rate limit exceeded")

        # Generic error
        try:
            error_detail = response.json().get('detail', response.text)
        except ValueError:
            # JSON parsing failed
            error_detail = response.text
        except AttributeError as attr_err:
            # Logic error - log it
            logger.error(f"Unexpected AttributeError getting error detail: {attr_err}")
            error_detail = response.text

        raise OlbrainError(
            f"Failed to {operation}: {response.status_code} - {error_detail}"
        )