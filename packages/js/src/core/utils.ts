/**
 * Utility functions for the Olbrain SDK
 */

import { ValidationError } from './exceptions';

/**
 * Validates API key format
 */
export function validateApiKey(apiKey: string): void {
  if (!apiKey) {
    throw new ValidationError('API key is required');
  }

  const validPrefixes = ['sk_live_', 'org_live_', 'sk_', 'org_'];
  if (!validPrefixes.some(prefix => apiKey.startsWith(prefix))) {
    throw new ValidationError(
      'Invalid API key format. Must start with sk_, org_, sk_live_, or org_live_'
    );
  }
}

/**
 * Validates agent ID format
 */
export function validateAgentId(agentId: string): void {
  if (!agentId) {
    throw new ValidationError('Agent ID is required');
  }
}

/**
 * Formats authorization header value
 */
export function formatAuthHeader(apiKey: string): string {
  return `Bearer ${apiKey}`;
}

/**
 * Generates session storage key
 */
export function getSessionStorageKey(sessionId: string): string {
  return `olbrain_session_${sessionId}`;
}

/**
 * Delay utility for testing and retries
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Exponential backoff calculator
 */
export function getExponentialBackoffDelay(
  attempt: number,
  baseDelay: number = 5000,
  maxDelay: number = 60000
): number {
  const delay = baseDelay * Math.pow(2, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Check if running in browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Check if running in Node.js environment
 */
export function isNode(): boolean {
  return typeof process !== 'undefined' && process.versions && process.versions.node;
}

/**
 * Get appropriate EventSource implementation
 */
export async function getEventSourceImpl(): Promise<typeof EventSource> {
  if (isBrowser()) {
    return EventSource;
  }

  if (isNode()) {
    try {
      // Try to import the eventsource package for Node.js
      const { EventSource: NodeEventSource } = await import('eventsource');
      return NodeEventSource as any;
    } catch {
      throw new Error(
        'EventSource not available in Node.js. Install "eventsource" package: npm install eventsource'
      );
    }
  }

  throw new Error('EventSource not available in this environment');
}
