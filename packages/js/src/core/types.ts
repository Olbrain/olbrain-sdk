/**
 * Core Types for Olbrain JavaScript SDK
 * Matches Python SDK data models for consistency
 */

/**
 * Configuration for AgentClient
 */
export interface AgentConfig {
  agentId: string;
  apiKey: string;
  baseUrl?: string;
}

/**
 * Options for creating a new session
 */
export interface CreateSessionOptions {
  title?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

/**
 * Options for updating a session
 */
export interface SessionUpdates {
  title?: string;
  metadata?: Record<string, any>;
  status?: 'active' | 'archived';
}

/**
 * Options for sending messages
 */
export interface SendOptions {
  metadata?: Record<string, any>;
  timeout?: number;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
}

/**
 * Session information
 */
export interface SessionInfo {
  sessionId: string;
  title: string;
  status: 'active' | 'archived';
  createdAt: string;
  messageCount: number;
  userId?: string;
  metadata: Record<string, any>;
}

/**
 * Session statistics
 */
export interface SessionStats {
  sessionId: string;
  messageCount: number;
  totalTokens: number;
  createdAt: string;
  lastMessageAt?: string;
}

/**
 * Chat response from the agent
 */
export interface ChatResponse {
  text: string;
  sessionId: string;
  success: boolean;
  tokenUsage?: TokenUsage;
  modelUsed?: string;
  responseTimeMs?: number;
  error?: string;
}

/**
 * Message in a conversation
 */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

/**
 * Callback for message events
 */
export type MessageCallback = (message: Message) => void;

/**
 * Callback for error events
 */
export type ErrorCallback = (error: Error) => void;

/**
 * Configuration for streaming
 */
export interface StreamConfig {
  sessionId: string;
  apiKey: string;
  agentId: string;
  baseUrl: string;
}

/**
 * Widget configuration
 */
export interface WidgetConfig {
  agentId: string;
  apiKey: string;

  // UI Options
  position?: 'bottom-right' | 'bottom-left' | 'custom';
  theme?: 'light' | 'dark' | 'auto';
  primaryColor?: string;
  title?: string;
  greeting?: string;
  placeholder?: string;

  // Behavior
  autoOpen?: boolean;
  persistSession?: boolean;

  // Advanced
  target?: string | HTMLElement;
  onMessage?: MessageCallback;
  baseUrl?: string;
}
