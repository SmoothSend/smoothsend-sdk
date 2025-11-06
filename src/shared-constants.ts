/**
 * Shared Constants for SmoothSend Platform
 * 
 * IMPORTANT: This file must be kept in sync across all repositories:
 * - smoothsend-worker-proxy/src/shared-constants.ts
 * - smoothsend-dev-console/src/lib/shared-constants.ts
 * - smoothsend-sdk/src/shared-constants.ts
 * 
 * Any changes to these constants must be replicated to all three locations.
 */

/**
 * API Key Prefixes
 * Used to identify key types from their prefix
 */
export const KEY_PREFIXES = {
  PUBLIC: 'pk_nogas_',
  SECRET: 'sk_nogas_',
  LEGACY: 'no_gas_'
} as const;

/**
 * API Key Types
 * Categorizes keys based on their security model
 */
export const KEY_TYPES = {
  PUBLIC: 'public',
  SECRET: 'secret',
  LEGACY: 'legacy'
} as const;

/**
 * Tier Limits Configuration
 * Defines rate limits and monthly limits for each subscription tier
 * 
 * CRITICAL: Must match across worker, console, and SDK
 */
export const TIER_LIMITS = {
  free: { 
    rateLimit: 10,        // requests per minute
    monthlyLimit: 1000    // total requests per month
  },
  starter: { 
    rateLimit: 50, 
    monthlyLimit: 50000 
  },
  pro: { 
    rateLimit: 100, 
    monthlyLimit: 500000 
  },
  enterprise: { 
    rateLimit: 1000, 
    monthlyLimit: 999999999  // Effectively unlimited
  }
} as const;

/**
 * Authentication Error Codes
 * Standardized error codes for authentication failures
 */
export const AUTH_ERROR_CODES = {
  INVALID_KEY_FORMAT: 'INVALID_KEY_FORMAT',
  INVALID_PUBLIC_KEY: 'INVALID_PUBLIC_KEY',
  INVALID_SECRET_KEY: 'INVALID_SECRET_KEY',
  CORS_ORIGIN_MISMATCH: 'CORS_ORIGIN_MISMATCH',
  CORS_ORIGIN_REQUIRED: 'CORS_ORIGIN_REQUIRED',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  MONTHLY_LIMIT_EXCEEDED: 'MONTHLY_LIMIT_EXCEEDED',
  KEY_PAIR_NOT_FOUND: 'KEY_PAIR_NOT_FOUND',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND'
} as const;

/**
 * Usage Response Headers
 * Headers sent by worker and read by SDK/Console
 * 
 * IMPORTANT: Header names must match exactly
 */
export const USAGE_HEADERS = {
  RATE_LIMIT: 'X-Rate-Limit-Limit',
  RATE_REMAINING: 'X-Rate-Limit-Remaining',
  RATE_RESET: 'X-Rate-Limit-Reset',
  MONTHLY_LIMIT: 'X-Monthly-Limit',
  MONTHLY_USAGE: 'X-Monthly-Usage',
  MONTHLY_REMAINING: 'X-Monthly-Remaining',
  REQUEST_ID: 'X-Request-ID',
  ACCOUNT_TIER: 'X-Account-Tier',      // Changed from X-Developer-Tier
  KEY_TYPE: 'X-Key-Type',               // NEW: Indicates public/secret/legacy
  RESPONSE_TIME: 'X-Response-Time',
  API_WARN: 'X-API-Warn',               // Deprecation warnings
  DEPRECATION: 'Deprecation'            // Standard deprecation header
} as const;

/**
 * Detect key type from API key prefix
 * 
 * @param apiKey - The API key to check
 * @returns Key type: 'public', 'secret', or 'legacy'
 * @throws Error if key format is invalid
 */
export function detectKeyType(apiKey: string): 'public' | 'secret' | 'legacy' {
  if (apiKey.startsWith(KEY_PREFIXES.PUBLIC)) return KEY_TYPES.PUBLIC;
  if (apiKey.startsWith(KEY_PREFIXES.SECRET)) return KEY_TYPES.SECRET;
  if (apiKey.startsWith(KEY_PREFIXES.LEGACY)) return KEY_TYPES.LEGACY;
  throw new Error('Invalid API key format');
}

/**
 * Type definitions for TypeScript
 */
export type KeyType = typeof KEY_TYPES[keyof typeof KEY_TYPES];
export type TierName = keyof typeof TIER_LIMITS;
export type AuthErrorCode = typeof AUTH_ERROR_CODES[keyof typeof AUTH_ERROR_CODES];
