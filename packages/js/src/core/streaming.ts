/**
 * Streaming support for real-time message delivery via Server-Sent Events (SSE)
 */

import { StreamConfig, Message, MessageCallback, ErrorCallback } from './types';
import { StreamingError } from './exceptions';
import {
  formatAuthHeader,
  delay,
  getExponentialBackoffDelay,
  getEventSourceImpl,
} from './utils';

/**
 * Handles SSE streaming for a session
 */
export class MessageStream {
  private config: StreamConfig;
  private onMessage: MessageCallback;
  private onError?: ErrorCallback;
  private eventSource?: EventSource;
  private isRunning: boolean = false;
  private reconnectAttempt: number = 0;
  private reconnectTimeout?: NodeJS.Timeout;

  constructor(config: StreamConfig, onMessage: MessageCallback, onError?: ErrorCallback) {
    this.config = config;
    this.onMessage = onMessage;
    this.onError = onError;
  }

  /**
   * Start the streaming connection
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.reconnectAttempt = 0;
    await this._connect();
  }

  /**
   * Stop the streaming connection
   */
  stop(): void {
    this.isRunning = false;
    this._cleanup();
  }

  /**
   * Establish SSE connection
   */
  private async _connect(): Promise<void> {
    try {
      const EventSourceImpl = await getEventSourceImpl();
      const url = `${this.config.baseUrl}/sessions/${this.config.sessionId}/stream`;
      const headers: Record<string, string> = {
        'Authorization': formatAuthHeader(this.config.apiKey),
        'X-Agent-ID': this.config.agentId,
      };

      // Create EventSource with headers
      this.eventSource = new EventSourceImpl(url, { headers });

      // Handle incoming messages
      this.eventSource.addEventListener('message', (event: any) => {
        this._handleMessage(event);
      });

      // Handle ping/keepalive
      this.eventSource.addEventListener('ping', () => {
        // Skip keepalive messages
      });

      // Handle errors
      this.eventSource.addEventListener('error', () => {
        this._handleConnectionError();
      });

      this.reconnectAttempt = 0;
    } catch (error) {
      this._handleConnectionError();
    }
  }

  /**
   * Handle incoming message event
   */
  private _handleMessage(event: any): void {
    if (!event.data) {
      return;
    }

    try {
      const data = JSON.parse(event.data);

      // Skip ping/keepalive messages
      if (data.type === 'ping' || data.type === 'keepalive') {
        return;
      }

      // Parse and deliver message
      if (data.role && data.content) {
        const message: Message = {
          role: data.role,
          content: data.content,
          timestamp: data.timestamp || new Date().toISOString(),
          metadata: data.metadata,
        };

        this.onMessage(message);
      }
    } catch (error) {
      if (this.onError) {
        this.onError(
          new StreamingError(`Failed to parse message: ${(error as Error).message}`)
        );
      }
    }
  }

  /**
   * Handle connection errors and attempt reconnection
   */
  private _handleConnectionError(): void {
    if (!this.isRunning) {
      return;
    }

    this._cleanup();

    // Calculate backoff delay
    const delay = getExponentialBackoffDelay(this.reconnectAttempt);

    if (this.onError) {
      this.onError(
        new StreamingError(
          `Connection lost. Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt + 1})`
        )
      );
    }

    this.reconnectAttempt++;

    // Schedule reconnection
    this.reconnectTimeout = setTimeout(async () => {
      if (this.isRunning) {
        await this._connect();
      }
    }, delay);
  }

  /**
   * Clean up resources
   */
  private _cleanup(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
  }
}

/**
 * Manages multiple message streams for different sessions
 */
export class StreamManager {
  private streams: Map<string, MessageStream> = new Map();

  /**
   * Start streaming for a session
   */
  async startStream(
    sessionId: string,
    config: StreamConfig,
    onMessage: MessageCallback,
    onError?: ErrorCallback
  ): Promise<void> {
    // Stop existing stream if any
    this.stopStream(sessionId);

    const stream = new MessageStream(config, onMessage, onError);
    this.streams.set(sessionId, stream);

    await stream.start();
  }

  /**
   * Stop streaming for a session
   */
  stopStream(sessionId: string): void {
    const stream = this.streams.get(sessionId);
    if (stream) {
      stream.stop();
      this.streams.delete(sessionId);
    }
  }

  /**
   * Stop all streams
   */
  stopAllStreams(): void {
    for (const stream of this.streams.values()) {
      stream.stop();
    }
    this.streams.clear();
  }

  /**
   * Check if a stream is running
   */
  isStreamRunning(sessionId: string): boolean {
    return this.streams.has(sessionId);
  }
}
