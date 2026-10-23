/**
 * Live messages for a session. The Olbrain API has no stream route for chat sessions, so this polls
 * the session's message list (oldest first, paged by offset) and delivers each new message once.
 */

import { StreamConfig, Message, MessageCallback, ErrorCallback } from './types';
import { StreamingError } from './exceptions';
import { formatAuthHeader, getExponentialBackoffDelay } from './utils';

const POLL_MS = 2000;
const PAGE = 200;

/**
 * Polls one session's messages. Messages already in the session when it starts are not delivered.
 */
export class MessageStream {
  private config: StreamConfig;
  private onMessage: MessageCallback;
  private onError?: ErrorCallback;
  private controller?: AbortController;
  private isRunning: boolean = false;
  private retryAttempt: number = 0;
  private waitTimeout?: ReturnType<typeof setTimeout>;
  private offset: number = 0;
  private seen: Set<string> = new Set();

  constructor(config: StreamConfig, onMessage: MessageCallback, onError?: ErrorCallback) {
    this.config = config;
    this.onMessage = onMessage;
    this.onError = onError;
  }

  /**
   * Start polling
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.retryAttempt = 0;
    void this._run();
  }

  /**
   * Stop polling
   */
  stop(): void {
    this.isRunning = false;
    this.controller?.abort();
    clearTimeout(this.waitTimeout);
  }

  private async _run(): Promise<void> {
    let primed = false; // the first full read only records what is already there
    while (this.isRunning) {
      let delay = POLL_MS;
      try {
        let page: any[];
        do {
          page = await this._page();
          for (const m of page) this._take(m, primed);
        } while (page.length === PAGE && this.isRunning);
        primed = true;
        this.retryAttempt = 0;
      } catch (error) {
        if (!this.isRunning) {
          return;
        }
        delay = getExponentialBackoffDelay(this.retryAttempt);
        this.retryAttempt++;
        const reason = error instanceof Error ? error.message : 'Connection lost';
        this.onError?.(new StreamingError(`${reason}. Retrying in ${delay}ms (attempt ${this.retryAttempt})`));
      }
      if (!this.isRunning) {
        return;
      }
      await new Promise((resolve) => {
        this.waitTimeout = setTimeout(resolve, delay);
      });
    }
  }

  private async _page(): Promise<any[]> {
    const { baseUrl, agentId, sessionId, apiKey } = this.config;
    const url = `${baseUrl}/api/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}`
      + `/messages?offset=${this.offset}&limit=${PAGE}`;
    this.controller = new AbortController();
    const res = await fetch(url, {
      headers: { 'Authorization': formatAuthHeader(apiKey), 'Accept': 'application/json' },
      signal: this.controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Messages refused (HTTP ${res.status})`);
    }
    const messages = (await res.json())?.messages || [];
    // ponytail: offset counts what came back; a soft-discarded message the API hides can make a page
    // overlap the last one, and `seen` drops the repeats.
    this.offset += messages.length;
    return messages;
  }

  private _take(data: any, deliver: boolean): void {
    const id = data?.message_id;
    if (id) {
      if (this.seen.has(id)) return;
      this.seen.add(id);
    }
    if (deliver && data?.role && data?.content) {
      const message: Message = {
        role: data.role,
        content: data.content,
        timestamp: data.created_at || new Date().toISOString(),
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
