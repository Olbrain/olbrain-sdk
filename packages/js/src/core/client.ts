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

// The Olbrain API. The old run.app host this SDK defaulted to no longer exists.
const DEFAULT_BASE_URL = 'https://webhook.olbrain.com';
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
      baseUrl: (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, ''),
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
    };

    if (options?.userId) {
      payload.user_id = options.userId;
    }
    if (options?.metadata) {
      payload.metadata = options.metadata;
    }

    const response = await this._request('POST', this._chatPath(), payload);

    if (!response.session_id) {
      throw new OlbrainError('Failed to create session: no session_id returned');
    }

    return response.session_id;
  }

  /**
   * Get session information
   */
  async getSession(sessionId: string): Promise<SessionInfo> {
    return this._parseSessionInfo(await this._request('GET', this._sessionPath(sessionId)));
  }

  /**
   * The Olbrain API has no endpoint to change a session.
   */
  async updateSession(_sessionId: string, _updates: SessionUpdates): Promise<SessionInfo> {
    throw new OlbrainError('updateSession is not supported: the Olbrain API has no endpoint to change a session');
  }

  /**
   * The Olbrain API has no endpoint to delete a session.
   */
  async deleteSession(_sessionId: string): Promise<void> {
    throw new OlbrainError('deleteSession is not supported: the Olbrain API has no endpoint to delete a session');
  }

  /**
   * Get messages from a session, oldest first (at most 200)
   */
  async getMessages(sessionId: string, limit?: number): Promise<Message[]> {
    const response = await this._request('GET', `${this._sessionPath(sessionId)}/messages?limit=${limit || 100}`);
    return (response.messages || []).map((msg: any) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.created_at,
      metadata: msg.metadata,
    }));
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId: string): Promise<SessionStats> {
    const response = await this._request('GET', this._sessionPath(sessionId));
    return {
      sessionId: response.session_id,
      messageCount: response.message_count,
      totalTokens: response.token_usage?.total_tokens,
      createdAt: response.created_at,
      lastMessageAt: response.last_message_at,
    };
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

    const response = await this._request('POST', this._chatPath(), payload, timeout);

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

    await this._request('POST', this._chatPath(), {
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

  private _chatPath(): string {
    return `/api/agents/webhook/${encodeURIComponent(this.config.agentId)}`;
  }

  private _sessionPath(sessionId: string): string {
    return `/api/agents/${encodeURIComponent(this.config.agentId)}/sessions/${encodeURIComponent(sessionId)}`;
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
        // The Olbrain API answers {error: {code, message}}.
        const errorMessage = errorData.error?.message || errorData.error || errorData.message || response.statusText;

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
