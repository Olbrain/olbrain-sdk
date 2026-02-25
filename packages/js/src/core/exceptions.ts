/**
 * Error classes for Olbrain SDK
 */

/**
 * Base error class for all Olbrain errors
 */
export class OlbrainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OlbrainError';
    Object.setPrototypeOf(this, OlbrainError.prototype);
  }
}

/**
 * Raised when authentication fails (invalid API key, missing auth header, etc.)
 */
export class AuthenticationError extends OlbrainError {
  constructor(message: string = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Raised when a session is not found
 */
export class SessionNotFoundError extends OlbrainError {
  sessionId: string;

  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
    this.sessionId = sessionId;
    Object.setPrototypeOf(this, SessionNotFoundError.prototype);
  }
}

/**
 * Raised when rate limit is exceeded
 */
export class RateLimitError extends OlbrainError {
  retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Raised when a network error occurs
 */
export class NetworkError extends OlbrainError {
  statusCode?: number;

  constructor(message: string = 'Network error', statusCode?: number) {
    super(message);
    this.name = 'NetworkError';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Raised when input validation fails
 */
export class ValidationError extends OlbrainError {
  constructor(message: string = 'Validation error') {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Raised when streaming connection fails
 */
export class StreamingError extends OlbrainError {
  constructor(message: string = 'Streaming error') {
    super(message);
    this.name = 'StreamingError';
    Object.setPrototypeOf(this, StreamingError.prototype);
  }
}
