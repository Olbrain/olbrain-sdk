/**
 * Advanced TypeScript example with full type safety
 *
 * Demonstrates:
 * - Type-safe API usage
 * - Error handling with custom error types
 * - Session management
 * - Streaming with callbacks
 * - Message history
 */

import {
  AgentClient,
  AgentConfig,
  ChatResponse,
  Message,
  SessionInfo,
  AuthenticationError,
  RateLimitError,
  OlbrainError,
} from '@olbrain/js-sdk';

class ChatApplication {
  private client: AgentClient;
  private sessionId: string | null = null;
  private messageHistory: Message[] = [];

  constructor(config: AgentConfig) {
    this.client = new AgentClient(config);
  }

  /**
   * Initialize or load session
   */
  async initializeSession(title: string): Promise<void> {
    try {
      this.sessionId = await this.client.createSession({
        title,
        metadata: {
          version: '1.0',
          type: 'typescript_example',
        },
      });

      console.log(`✓ Session initialized: ${this.sessionId}`);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw new Error(`Authentication failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Send message with full type safety
   */
  async sendMessage(userMessage: string): Promise<ChatResponse> {
    if (!this.sessionId) {
      throw new Error('Session not initialized');
    }

    try {
      console.log(`\n📤 Sending: ${userMessage}`);

      const response = await this.client.sendAndWait(
        this.sessionId,
        userMessage,
        {
          timeout: 30000,
          metadata: {
            source: 'typescript_app',
            timestamp: new Date().toISOString(),
          },
        }
      );

      // Store message in history
      this.messageHistory.push({
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString(),
      });

      if (response.success && response.text) {
        this.messageHistory.push({
          role: 'assistant',
          content: response.text,
          timestamp: new Date().toISOString(),
        });

        console.log(`\n📥 Response: ${response.text}`);
      }

      return response;
    } catch (error) {
      if (error instanceof RateLimitError) {
        const retryAfter = error.retryAfter || 60;
        throw new Error(
          `Rate limited. Retry after ${retryAfter} seconds`
        );
      } else if (error instanceof OlbrainError) {
        throw new Error(`API Error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Stream messages in real-time
   */
  async startStreaming(callback?: (msg: Message) => void): Promise<void> {
    if (!this.sessionId) {
      throw new Error('Session not initialized');
    }

    await this.client.listen(
      this.sessionId,
      (message: Message) => {
        this.messageHistory.push(message);
        if (callback) {
          callback(message);
        }
      },
      (error: Error) => {
        console.error('Streaming error:', error.message);
      }
    );
  }

  /**
   * Get session information with type safety
   */
  async getSessionInfo(): Promise<SessionInfo> {
    if (!this.sessionId) {
      throw new Error('Session not initialized');
    }

    return this.client.getSession(this.sessionId);
  }

  /**
   * Get message history
   */
  getMessageHistory(): Message[] {
    return [...this.messageHistory];
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.sessionId) {
      this.client.stopListening(this.sessionId);
    }
    this.client.close();
  }
}

/**
 * Main example
 */
async function main(): Promise<void> {
  const app = new ChatApplication({
    agentId: process.env.OLBRAIN_AGENT_ID || 'demo-agent',
    apiKey: process.env.OLBRAIN_API_KEY || 'sk_live_demo',
  });

  try {
    console.log('🤖 Advanced TypeScript Example\n');

    // Initialize session
    await app.initializeSession('TypeScript Advanced Example');

    // Send messages
    const response1 = await app.sendMessage(
      'What is TypeScript and why should I use it?'
    );
    console.log(`- Token usage: ${response1.tokenUsage?.totalTokens || 0} tokens`);
    console.log(`- Response time: ${response1.responseTimeMs || 0}ms`);

    // Send another message
    const response2 = await app.sendMessage(
      'Can you give me a practical example?'
    );
    console.log(`- Token usage: ${response2.tokenUsage?.totalTokens || 0} tokens`);

    // Get session info
    console.log('\n📋 Session Information:');
    const sessionInfo = await app.getSessionInfo();
    console.log(`- Title: ${sessionInfo.title}`);
    console.log(`- Status: ${sessionInfo.status}`);
    console.log(`- Messages: ${sessionInfo.messageCount}`);
    console.log(`- Created: ${new Date(sessionInfo.createdAt).toLocaleString()}`);

    // Show message history
    console.log('\n💬 Message History:');
    const history = app.getMessageHistory();
    history.forEach((msg) => {
      const role = msg.role === 'user' ? '👤' : '🤖';
      const content = msg.content.substring(0, 60);
      const suffix = msg.content.length > 60 ? '...' : '';
      console.log(`${role} ${content}${suffix}`);
    });

    console.log('\n✅ Example completed successfully!');
  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
    process.exit(1);
  } finally {
    app.cleanup();
  }
}

// Run the example
main();
