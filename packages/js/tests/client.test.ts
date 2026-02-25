/**
 * Tests for AgentClient
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentClient } from '../src/core/client';
import {
  AuthenticationError,
  ValidationError,
  SessionNotFoundError,
  RateLimitError,
} from '../src/core/exceptions';

// Mock fetch
global.fetch = vi.fn();

describe('AgentClient', () => {
  let client: AgentClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new AgentClient({
      agentId: 'test-agent',
      apiKey: 'sk_live_test_key',
    });
  });

  describe('initialization', () => {
    it('should initialize with valid config', () => {
      expect(client).toBeDefined();
    });

    it('should throw on missing API key', () => {
      expect(() => {
        new AgentClient({
          agentId: 'test',
          apiKey: '',
        });
      }).toThrow(ValidationError);
    });

    it('should throw on invalid API key format', () => {
      expect(() => {
        new AgentClient({
          agentId: 'test',
          apiKey: 'invalid_key',
        });
      }).toThrow(ValidationError);
    });

    it('should throw on missing agent ID', () => {
      expect(() => {
        new AgentClient({
          agentId: '',
          apiKey: 'sk_live_test',
        });
      }).toThrow(ValidationError);
    });
  });

  describe('createSession', () => {
    it('should create a session', async () => {
      const mockResponse = { session_id: 'session-123' };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const sessionId = await client.createSession({
        title: 'Test Session',
      });

      expect(sessionId).toBe('session-123');
    });

    it('should throw error if no session_id returned', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await expect(client.createSession()).rejects.toThrow();
    });

    it('should handle 401 auth errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      await expect(client.createSession()).rejects.toThrow(AuthenticationError);
    });

    it('should handle 429 rate limit errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Map([['Retry-After', '60']]),
        json: async () => ({ error: 'Rate limited' }),
      });

      try {
        await client.createSession();
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        if (error instanceof RateLimitError) {
          expect(error.retryAfter).toBe(60);
        }
      }
    });
  });

  describe('getSession', () => {
    it('should get session info', async () => {
      const mockResponse = {
        session_id: 'session-123',
        title: 'Test',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        message_count: 5,
        metadata: {},
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const session = await client.getSession('session-123');

      expect(session.sessionId).toBe('session-123');
      expect(session.title).toBe('Test');
      expect(session.messageCount).toBe(5);
    });

    it('should handle 404 session not found', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      });

      await expect(client.getSession('nonexistent')).rejects.toThrow(
        SessionNotFoundError
      );
    });
  });

  describe('sendAndWait', () => {
    it('should send message and return response', async () => {
      const mockResponse = {
        text: 'Hello user!',
        session_id: 'session-123',
        success: true,
        token_usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
        response_time_ms: 100,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const response = await client.sendAndWait('session-123', 'Hi there');

      expect(response.text).toBe('Hello user!');
      expect(response.success).toBe(true);
      expect(response.tokenUsage?.totalTokens).toBe(15);
      expect(response.responseTimeMs).toBe(100);
    });

    it('should throw error for empty message', async () => {
      await expect(client.sendAndWait('session-123', '')).rejects.toThrow(
        ValidationError
      );
    });

    it('should respect custom timeout', async () => {
      (global.fetch as any).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ text: 'Ok', success: true }),
                }),
              100
            );
          })
      );

      const response = await client.sendAndWait('session-123', 'Hi', {
        timeout: 5000,
      });

      expect(response).toBeDefined();
    });
  });

  describe('send', () => {
    it('should send message without waiting', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await expect(client.send('session-123', 'Hello')).resolves.toBeUndefined();
    });

    it('should throw error for empty message', async () => {
      await expect(client.send('session-123', '')).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('deleteSession', () => {
    it('should delete session', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await expect(client.deleteSession('session-123')).resolves.toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle network timeout', async () => {
      (global.fetch as any).mockImplementationOnce(() => {
        const error = new TypeError('Failed to fetch');
        error.message = 'aborted';
        throw error;
      });

      await expect(client.createSession()).rejects.toThrow();
    });

    it('should include headers in requests', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: 'test' }),
      });

      await client.createSession();

      const callArgs = (global.fetch as any).mock.calls[0];
      const headers = callArgs[1].headers;

      expect(headers['Authorization']).toContain('Bearer sk_live_test_key');
      expect(headers['X-Agent-ID']).toBe('test-agent');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });
});
