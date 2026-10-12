/**
 * Streaming support for real-time message delivery via Server-Sent Events (SSE)
 */

import { StreamConfig, Message, MessageCallback, ErrorCallback } from './types';
import { StreamingError } from './exceptions';
import { formatAuthHeader, getExponentialBackoffDelay } from './utils';
import { readSse } from './sse';

/**
 * Handles SSE streaming for a session. Reads the stream with fetch, not
 * EventSource: the endpoint authenticates by header only, and a browser's
 * EventSource can't send headers.
 */
export class MessageStream {
  private config: StreamConfig;
  private onMessage: MessageCallback;
  private onError?: ErrorCallback;
  private controller?: AbortController;
  private isRunning: boolean = false;
  private reconnectAttempt: number = 0;
  private reconnectTimeout?: ReturnType<typeof setTimeout>;

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
    void this._run();
  }

  /**
   * Stop the streaming connection
   */
  stop(): void {
    this.isRunning = false;
    this.controller?.abort();
    clearTimeout(this.reconnectTimeout);
  }

  /**
   * Read the stream until stopped, reconnecting with backoff whenever it ends or fails
   */
  private async _run(): Promise<void> {
    const url = `${this.config.baseUrl}/sessions/${encodeURIComponent(this.config.sessionId)}/stream`;
    while (this.isRunning) {
      this.controller = new AbortController();
      let reason = 'Connection lost';
      try {
        const res = await fetch(url, {
          headers: {
            'Authorization': formatAuthHeader(this.config.apiKey),
            'X-Agent-ID': this.config.agentId,
            'Accept': 'text/event-stream',
          },
          signal: this.controller.signal,
        });
        if (!res.ok || !res.body) {
          reason = `Stream refused (HTTP ${res.status})`;
        } else {
          this.reconnectAttempt = 0;
          for await (const data of readSse(res.body)) {
            this._handleMessage(data);
          }
        }
      } catch {
        // dropped or aborted — reconnect below unless stopped
      }
      if (!this.isRunning) {
        return;
      }

      const delay = getExponentialBackoffDelay(this.reconnectAttempt);
      this.reconnectAttempt++;
      this.onError?.(
        new StreamingError(`${reason}. Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`)
      );
      await new Promise((resolve) => {
        this.reconnectTimeout = setTimeout(resolve, delay);
      });
    }
  }

  /**
   * Deliver a parsed frame; connected/ping frames carry no role and are skipped
   */
  private _handleMessage(data: any): void {
    if (data?.role && data?.content) {
      const message: Message = {
        role: data.role,
        content: data.content,
        timestamp: data.timestamp || new Date().toISOString(),
        metadata: data.metadata,
      };
      this.onMessage(message);
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
