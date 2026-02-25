/**
 * Main AgentClient class for communicating with Olbrain agents
 */

import {
  AgentConfig,
  CreateSessionOptions,
  SessionUpdates,
  SendOptions,
  ChatResponse,
  Message,
  MessageCallback,
  SessionInfo,
  SessionStats,
  ErrorCallback,
} from './types';
import {
  OlbrainError,
  AuthenticationError,
  SessionNotFoundError,
  RateLimitError,
  NetworkError,
  ValidationError,
} from './exceptions';
import { validateApiKey, validateAgentId, formatAuthHeader } from './utils';
import { StreamManager } from './streaming';

const DEFAULT_BASE_URL = 'https://olbrain-agent-cloud-768934887465.us-central1.run.app';
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Main API client for interacting with Olbrain agents
 */
export class AgentClient {
  private config: Required<AgentConfig>;
  private streamManager: StreamManager;

  constructor(config: AgentConfig) {
    validateApiKey(config.apiKey);
    validateAgentId(config.agentId);

    this.config = {
      agentId: config.agentId,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
    };

    this.streamManager = new StreamManager();
  }

  /**
   * Create a new session
   */
  async createSession(options?: CreateSessionOptions): Promise<string> {
    const payload: Record<string, any> = {
      message: options?.title || 'Chat Session',
      response_mode: 'sync',
      mode: 'production',
    };

    if (options?.userId) {
      payload.user_id = options.userId;
    }
    if (options?.metadata) {
      payload.metadata = options.metadata;
    }

    const response = await this._request('POST', '/api/agent/webhook', payload);

    if (!response.session_id) {
      throw new OlbrainError('Failed to create session: no session_id returned');
    }

    return response.session_id;
  }

  /**
   * Get session information
   * @note May not be implemented on all backends
   */
  async getSession(sessionId: string): Promise<SessionInfo> {
    try {
      const response = await this._request('POST', '/api/agent/webhook', {
        session_id: sessionId,
        action: 'get_session_info',
      });

      return this._parseSessionInfo(response);
    } catch (error) {
      // Fallback: return basic session info
      console.warn('get_session_info not available, returning basic info');
      return {
        sessionId,
        title: 'Session',
        status: 'active',
        createdAt: new Date().toISOString(),
        messageCount: 0,
        metadata: {},
      };
    }
  }

  /**
   * Update session information
   * @note May not be implemented on all backends
   */
  async updateSession(sessionId: string, updates: SessionUpdates): Promise<SessionInfo> {
    try {
      const payload: Record<string, any> = {
        session_id: sessionId,
        action: 'update_session',
      };

      if (updates.title !== undefined) payload.title = updates.title;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.metadata !== undefined) payload.metadata = updates.metadata;

      const response = await this._request('POST', '/api/agent/webhook', payload);

      return this._parseSessionInfo(response);
    } catch (error) {
      console.warn('update_session not available');
      throw error;
    }
  }

  /**
   * Delete a session
   * @note May not be implemented on all backends
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this._request('POST', '/api/agent/webhook', {
        session_id: sessionId,
        action: 'delete_session',
      });
    } catch (error) {
      console.warn('delete_session not available');
      throw error;
    }
  }

  /**
   * Get messages from a session
   * @note May not be implemented on all backends
   */
  async getMessages(sessionId: string, limit?: number): Promise<Message[]> {
    try {
      const response = await this._request('POST', '/api/agent/webhook', {
        session_id: sessionId,
        action: 'get_messages',
        limit: limit || 100,
      });

      return (response.messages || []).map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        metadata: msg.metadata,
      }));
    } catch (error) {
      console.warn('get_messages not available');
      return [];
    }
  }

  /**
   * Get session statistics
   * @note May not be implemented on all backends
   */
  async getSessionStats(sessionId: string): Promise<SessionStats> {
    try {
      const response = await this._request('POST', '/api/agent/webhook', {
        session_id: sessionId,
        action: 'get_stats',
      });

      return {
        sessionId: response.session_id,
        messageCount: response.message_count,
        totalTokens: response.total_tokens,
        createdAt: response.created_at,
        lastMessageAt: response.last_message_at,
      };
    } catch (error) {
      console.warn('get_stats not available');
      return {
        sessionId,
        messageCount: 0,
        totalTokens: 0,
        createdAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Send a message and wait for response
   */
  async sendAndWait(
    sessionId: string,
    message: string,
    options?: SendOptions
  ): Promise<ChatResponse> {
    if (!message) {
      throw new ValidationError('Message cannot be empty');
    }

    const payload: Record<string, any> = {
      session_id: sessionId,
      message: message.trim(),
      response_mode: 'sync',
    };

    if (options?.metadata) {
      payload.metadata = options.metadata;
    }

    const timeout = options?.timeout || DEFAULT_TIMEOUT_MS;

    const response = await this._request(
      'POST',
      '/api/agent/webhook',
      payload,
      timeout
    );

    return {
      text: response.response || response.text || '',
      sessionId: response.session_id,
      success: response.success !== false,
      tokenUsage: response.token_usage ? {
        promptTokens: response.token_usage.prompt_tokens,
        completionTokens: response.token_usage.completion_tokens,
        totalTokens: response.token_usage.total_tokens,
        cost: response.token_usage.cost,
      } : undefined,
      modelUsed: response.model_used,
      responseTimeMs: response.response_time_ms,
      error: response.error,
    };
  }

  /**
   * Send a message (fire and forget)
   */
  async send(sessionId: string, message: string): Promise<void> {
    if (!message) {
      throw new ValidationError('Message cannot be empty');
    }

    await this._request('POST', '/api/agent/webhook', {
      session_id: sessionId,
      message: message.trim(),
      response_mode: 'sync',
    });
  }

  /**
   * Start listening for messages via SSE streaming
   */
  async listen(
    sessionId: string,
    onMessage: MessageCallback,
    onError?: ErrorCallback
  ): Promise<void> {
    await this.streamManager.startStream(
      sessionId,
      {
        sessionId,
        apiKey: this.config.apiKey,
        agentId: this.config.agentId,
        baseUrl: this.config.baseUrl,
      },
      onMessage,
      onError
    );
  }

  /**
   * Stop listening for messages
   */
  stopListening(sessionId: string): void {
    this.streamManager.stopStream(sessionId);
  }

  /**
   * Close client and clean up resources
   */
  close(): void {
    this.streamManager.stopAllStreams();
  }

  /**
   * Helper method to make HTTP requests
   */
  private async _request(
    method: string,
    path: string,
    payload?: any,
    timeout: number = DEFAULT_TIMEOUT_MS
  ): Promise<any> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': formatAuthHeader(this.config.apiKey),
      'X-Agent-ID': this.config.agentId,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: payload ? JSON.stringify(payload) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle HTTP errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.message || response.statusText;

        if (response.status === 401 || response.status === 403) {
          throw new AuthenticationError(errorMessage);
        } else if (response.status === 404) {
          throw new SessionNotFoundError(payload?.session_id || 'unknown');
        } else if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          throw new RateLimitError(errorMessage, retryAfter ? parseInt(retryAfter) : undefined);
        } else if (response.status >= 500) {
          throw new NetworkError(errorMessage, response.status);
        } else {
          throw new NetworkError(errorMessage, response.status);
        }
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof OlbrainError) {
        throw error;
      }

      if (error instanceof TypeError) {
        if (error.message.includes('aborted')) {
          throw new OlbrainError(`Request timeout after ${timeout}ms`);
        }
        throw new NetworkError(error.message);
      }

      throw error;
    }
  }

  /**
   * Helper to parse session info from response
   */
  private _parseSessionInfo(data: any): SessionInfo {
    return {
      sessionId: data.session_id,
      title: data.title,
      status: data.status || 'active',
      createdAt: data.created_at,
      messageCount: data.message_count || 0,
      userId: data.user_id,
      metadata: data.metadata || {},
    };
  }
}
