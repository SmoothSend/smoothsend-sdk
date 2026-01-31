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
 * Rate Limits Configuration
 * 
 * BUSINESS MODEL (Updated Jan 2026):
 * - SmoothSend uses CREDIT-BASED billing
 * - Users purchase credit packs ($5, $10, $25, $50, $100, $500)
 * - Each transaction deducts credits: MAX(gas × 1.50, $0.01)
 * 
 * Rate limits below are for API protection only (prevent abuse):
 * - All users start with 'free' rate limit
 * - Higher rate limits available for high-volume customers
 * 
 * CRITICAL: Must match across worker, console, and SDK
 */
export const TIER_LIMITS = {
  free: { 
    rateLimit: 100,           // requests per minute (generous for most dApps)
    monthlyLimit: 999999999   // Unlimited - billing is credit-based
  },
  starter: { 
    rateLimit: 200,           // Higher rate limit for bigger dApps
    monthlyLimit: 999999999
  },
  pro: { 
    rateLimit: 500, 
    monthlyLimit: 999999999
  },
  enterprise: { 
    rateLimit: 2000,          // Custom high-volume rate limit
    monthlyLimit: 999999999
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
