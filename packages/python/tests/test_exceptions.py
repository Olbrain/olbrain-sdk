"""
Basic tests for custom exceptions
"""
import pytest
from olbrain.exceptions import (
    OlbrainError,
    AuthenticationError,
    AgentNotFoundError,
    SessionError,
    RateLimitError,
    NetworkError
)


class TestExceptions:
    def test_olbrain_error_base(self):
        """Test base OlbrainError exception."""
        error = OlbrainError("Test error message")
        assert str(error) == "Test error message"
        assert isinstance(error, Exception)

    def test_authentication_error(self):
        """Test AuthenticationError exception."""
        error = AuthenticationError("Invalid API key")
        assert str(error) == "Invalid API key"
        assert isinstance(error, OlbrainError)

    def test_agent_not_found_error(self):
        """Test AgentNotFoundError exception."""
        error = AgentNotFoundError("Agent not found")
        assert str(error) == "Agent not found"
        assert isinstance(error, OlbrainError)

    def test_session_error(self):
        """Test SessionError exception."""
        error = SessionError("Session expired")
        assert str(error) == "Session expired"
        assert isinstance(error, OlbrainError)

    def test_rate_limit_error(self):
        """Test RateLimitError exception."""
        error = RateLimitError("Rate limit exceeded")
        assert str(error) == "Rate limit exceeded"
        assert isinstance(error, OlbrainError)

    def test_network_error(self):
        """Test NetworkError exception."""
        error = NetworkError("Connection timeout")
        assert str(error) == "Connection timeout"
        assert isinstance(error, OlbrainError)
