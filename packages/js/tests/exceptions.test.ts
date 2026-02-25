/**
 * Tests for error classes
 */

import { describe, it, expect } from 'vitest';
import {
  OlbrainError,
  AuthenticationError,
  SessionNotFoundError,
  RateLimitError,
  NetworkError,
  ValidationError,
  StreamingError,
} from '../src/core/exceptions';

describe('Error Classes', () => {
  describe('OlbrainError', () => {
    it('should create error with message', () => {
      const error = new OlbrainError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('OlbrainError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('AuthenticationError', () => {
    it('should create with default message', () => {
      const error = new AuthenticationError();
      expect(error.message).toBe('Authentication failed');
    });

    it('should create with custom message', () => {
      const error = new AuthenticationError('Invalid token');
      expect(error.message).toBe('Invalid token');
      expect(error).toBeInstanceOf(OlbrainError);
    });
  });

  describe('SessionNotFoundError', () => {
    it('should include session ID', () => {
      const error = new SessionNotFoundError('session-123');
      expect(error.message).toContain('session-123');
      expect(error.sessionId).toBe('session-123');
      expect(error).toBeInstanceOf(OlbrainError);
    });
  });

  describe('RateLimitError', () => {
    it('should include retry-after', () => {
      const error = new RateLimitError('Too many requests', 60);
      expect(error.retryAfter).toBe(60);
      expect(error).toBeInstanceOf(OlbrainError);
    });

    it('should work without retry-after', () => {
      const error = new RateLimitError();
      expect(error.retryAfter).toBeUndefined();
    });
  });

  describe('NetworkError', () => {
    it('should include status code', () => {
      const error = new NetworkError('Connection failed', 500);
      expect(error.statusCode).toBe(500);
      expect(error).toBeInstanceOf(OlbrainError);
    });
  });

  describe('ValidationError', () => {
    it('should create with message', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error).toBeInstanceOf(OlbrainError);
    });
  });

  describe('StreamingError', () => {
    it('should create with message', () => {
      const error = new StreamingError('Connection lost');
      expect(error.message).toBe('Connection lost');
      expect(error).toBeInstanceOf(OlbrainError);
    });
  });

  describe('Error hierarchy', () => {
    it('all errors should extend OlbrainError', () => {
      expect(new AuthenticationError()).toBeInstanceOf(OlbrainError);
      expect(new SessionNotFoundError('test')).toBeInstanceOf(OlbrainError);
      expect(new RateLimitError()).toBeInstanceOf(OlbrainError);
      expect(new NetworkError()).toBeInstanceOf(OlbrainError);
      expect(new ValidationError()).toBeInstanceOf(OlbrainError);
      expect(new StreamingError()).toBeInstanceOf(OlbrainError);
    });
  });
});
