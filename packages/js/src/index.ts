/**
 * Olbrain JavaScript SDK
 * Main entry point for core API exports
 */

// Export client
export { AgentClient } from './core/client';

export { Olbrain } from './core/olbrain';
export type { OlbrainConfig, Run, RunSummary, Approval, ResolveInput, ResolveResult } from './core/olbrain';
export type { StreamMessageInput } from './core/research';
export type { LiveSubscription } from './core/researchLive';

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
  ApiError,
  NotFoundError,
  BillingError,
} from './core/exceptions';

// Version
export const VERSION = '1.2.0';
