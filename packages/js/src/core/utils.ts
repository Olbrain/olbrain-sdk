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

  const validPrefixes = ['ak_', 'sk_live_', 'org_live_', 'sk_', 'org_'];
  if (!validPrefixes.some(prefix => apiKey.startsWith(prefix))) {
    throw new ValidationError(
      'Invalid API key format. Must start with ak_, sk_, org_, sk_live_, or org_live_'
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
