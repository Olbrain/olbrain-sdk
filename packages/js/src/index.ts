/**
 * Olbrain JavaScript SDK
 * Main entry point for core API exports
 */

// Export clients
export { AgentClient } from './core/client';
export { OrgClient } from './core/org_client';

// Export types
export type {
  AgentConfig,
  OrgClientConfig,
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
  ProjectInfo,
  AgentInfo,
  DeploymentInfo,
  CreateProjectOptions,
  CreateAgentOptions,
  UpdateAgentOptions,
  ListAgentsOptions,
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
