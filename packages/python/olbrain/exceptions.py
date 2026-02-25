"""
Custom exceptions for the Olbrain Python SDK.
"""


class OlbrainError(Exception):
    """Base exception class for Olbrain SDK errors."""

    def __init__(self, message, error_code=None, details=None):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.details = details or {}

    def __str__(self):
        if self.error_code:
            return f"[{self.error_code}] {self.message}"
        return self.message


class AuthenticationError(OlbrainError):
    """Raised when authentication fails or API key is invalid."""
    pass


class AgentNotFoundError(OlbrainError):
    """Raised when the specified agent ID cannot be found or accessed."""
    pass


class SessionError(OlbrainError):
    """Raised when session operations fail."""
    pass


class SessionNotFoundError(SessionError):
    """Raised when the specified session cannot be found."""
    pass


class RateLimitError(OlbrainError):
    """Raised when rate limits are exceeded."""

    def __init__(self, message, retry_after=None, **kwargs):
        super().__init__(message, **kwargs)
        self.retry_after = retry_after


class NetworkError(OlbrainError):
    """Raised when network requests fail."""

    def __init__(self, message, status_code=None, **kwargs):
        super().__init__(message, **kwargs)
        self.status_code = status_code


class ValidationError(OlbrainError):
    """Raised when input validation fails."""
    pass


class StreamingError(OlbrainError):
    """Raised when streaming response encounters an error."""
    pass
