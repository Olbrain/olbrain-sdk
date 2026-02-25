/**
 * Olbrain JavaScript SDK
 * Main entry point for core API exports
 */

// Export client
export { AgentClient } from './core/client';

// Export types
export type {
  AgentConfig,
  CreateSessionOptions,
  SessionUpdates,
  SendOptions,
  TokenUsage,
  SessionInfo,
  SessionStats,
  ChatResponse,
  Message,
  MessageCallback,
  ErrorCallback,
  StreamConfig,
  WidgetConfig,
} from './core/types';

// Export error classes
export {
  OlbrainError,
  AuthenticationError,
  SessionNotFoundError,
  RateLimitError,
  NetworkError,
  ValidationError,
  StreamingError,
} from './core/exceptions';

// Version
export const VERSION = '1.0.0';
