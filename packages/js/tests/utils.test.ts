/**
 * Tests for utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  validateApiKey,
  validateAgentId,
  formatAuthHeader,
  getSessionStorageKey,
  getExponentialBackoffDelay,
} from '../src/core/utils';
import { ValidationError } from '../src/core/exceptions';

describe('Utility Functions', () => {
  describe('validateApiKey', () => {
    it('should accept sk_live_ prefix', () => {
      expect(() => validateApiKey('sk_live_abc123')).not.toThrow();
    });

    it('should accept org_live_ prefix', () => {
      expect(() => validateApiKey('org_live_abc123')).not.toThrow();
    });

    it('should accept sk_ prefix', () => {
      expect(() => validateApiKey('sk_abc123')).not.toThrow();
    });

    it('should accept org_ prefix', () => {
      expect(() => validateApiKey('org_abc123')).not.toThrow();
    });

    it('should reject empty key', () => {
      expect(() => validateApiKey('')).toThrow(ValidationError);
    });

    it('should reject invalid format', () => {
      expect(() => validateApiKey('invalid_key')).toThrow(ValidationError);
    });
  });

  describe('validateAgentId', () => {
    it('should accept valid agent ID', () => {
      expect(() => validateAgentId('my-agent')).not.toThrow();
    });

    it('should reject empty agent ID', () => {
      expect(() => validateAgentId('')).toThrow(ValidationError);
    });
  });

  describe('formatAuthHeader', () => {
    it('should format authorization header', () => {
      const header = formatAuthHeader('sk_live_test');
      expect(header).toBe('Bearer sk_live_test');
    });
  });

  describe('getSessionStorageKey', () => {
    it('should generate session storage key', () => {
      const key = getSessionStorageKey('session-123');
      expect(key).toBe('olbrain_session_session-123');
    });
  });

  describe('getExponentialBackoffDelay', () => {
    it('should calculate exponential backoff', () => {
      expect(getExponentialBackoffDelay(0)).toBe(5000); // 5s
      expect(getExponentialBackoffDelay(1)).toBe(10000); // 10s
      expect(getExponentialBackoffDelay(2)).toBe(20000); // 20s
      expect(getExponentialBackoffDelay(3)).toBe(40000); // 40s
    });

    it('should respect max delay', () => {
      const delay = getExponentialBackoffDelay(10); // 2^10 * 5000 = 5120000ms
      expect(delay).toBeLessThanOrEqual(60000); // Max 60s
    });

    it('should use custom base delay', () => {
      const delay = getExponentialBackoffDelay(1, 1000);
      expect(delay).toBe(2000); // 2^1 * 1000
    });

    it('should use custom max delay', () => {
      const delay = getExponentialBackoffDelay(5, 5000, 30000);
      const calculated = 5000 * Math.pow(2, 5); // 160000
      expect(delay).toBe(30000); // Capped at max
    });
  });
});
