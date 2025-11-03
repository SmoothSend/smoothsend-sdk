/**
 * Error handling system for SmoothSend SDK v2
 * Provides typed error classes for different failure scenarios
 * 
 * @remarks
 * All SDK errors extend SmoothSendError for consistent error handling
 * Use instanceof checks to handle specific error types
 * 
 * @example
 * ```typescript
 * try {
 *   await sdk.transfer(request, wallet);
 * } catch (error) {
 *   if (error instanceof AuthenticationError) {
 *     console.error('Invalid API key');
 *   } else if (error instanceof RateLimitError) {
 *     console.error('Rate limit exceeded');
 *   }
 * }
 * ```
 */

import { SupportedChain } from './index';

/**
 * Base error class for all SmoothSend SDK errors
 * 
 * @remarks
 * All SDK-specific errors extend this class
 * Contains error code, HTTP status code, and additional details
 * 
 * @example
 * ```typescript
 * throw new SmoothSendError(
 *   'Something went wrong',
 *   'CUSTOM_ERROR',
 *   500,
 *   { additionalInfo: 'details' }
 * );
 * ```
 */
export class SmoothSendError extends Error {
  /**
   * Creates a new SmoothSendError
   * 
   * @param message - Human-readable error message
   * @param code - Error code for programmatic handling
   * @param statusCode - HTTP status code (if applicable)
   * @param details - Additional error details
   */
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'SmoothSendError';
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Authentication error - thrown when API key is invalid, missing, or expired
 * 
 * @remarks
 * HTTP Status Code: 401
 * Indicates authentication failure with the proxy worker
 * 
 * @example
 * ```typescript
 * try {
 *   await sdk.transfer(request, wallet);
 * } catch (error) {
 *   if (error instanceof AuthenticationError) {
 *     console.error('Invalid API key:', error.message);
 *     console.log('Get a new key at:', error.details.suggestion);
 *   }
 * }
 * ```
 */
export class AuthenticationError extends SmoothSendError {
  /**
   * Creates a new AuthenticationError
   * 
   * @param message - Human-readable error message
   * @param details - Additional error details
   */
  constructor(message: string, details?: any) {
    super(
      message,
      'AUTHENTICATION_ERROR',
      401,
      {
        ...details,
        docs: 'https://docs.smoothsend.xyz/api-keys',
        suggestion: 'Check your API key at dashboard.smoothsend.xyz'
      }
    );
    this.name = 'AuthenticationError';
  }
}

/**
 * Rate limit error - thrown when request rate limit is exceeded
 * 
 * @remarks
 * HTTP Status Code: 429
 * Contains rate limit details including reset time
 * 
 * @example
 * ```typescript
 * try {
 *   await sdk.transfer(request, wallet);
 * } catch (error) {
 *   if (error instanceof RateLimitError) {
 *     console.error('Rate limit exceeded');
 *     console.log(`Limit: ${error.limit}`);
 *     console.log(`Remaining: ${error.remaining}`);
 *     console.log(`Resets at: ${error.resetTime}`);
 *   }
 * }
 * ```
 */
export class RateLimitError extends SmoothSendError {
  /**
   * Creates a new RateLimitError
   * 
   * @param message - Human-readable error message
   * @param limit - Maximum requests allowed per period
   * @param remaining - Remaining requests in current period
   * @param resetTime - When the rate limit resets (ISO 8601 timestamp)
   */
  constructor(
    message: string,
    public limit: number,
    public remaining: number,
    public resetTime: string
  ) {
    super(
      message,
      'RATE_LIMIT_EXCEEDED',
      429,
      {
        limit,
        remaining,
        resetTime,
        docs: 'https://docs.smoothsend.xyz/rate-limits',
        suggestion: 'Wait until rate limit resets or upgrade your tier'
      }
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Validation error - thrown when request parameters are invalid
 * 
 * @remarks
 * HTTP Status Code: 400
 * Contains field name that failed validation
 * 
 * @example
 * ```typescript
 * try {
 *   await sdk.transfer(request, wallet);
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     console.error(`Invalid ${error.field}:`, error.message);
 *   }
 * }
 * ```
 */
export class ValidationError extends SmoothSendError {
  /**
   * Creates a new ValidationError
   * 
   * @param message - Human-readable error message
   * @param field - Name of the field that failed validation
   * @param details - Additional error details
   */
  constructor(message: string, public field: string, details?: any) {
    super(
      message,
      'VALIDATION_ERROR',
      400,
      {
        field,
        ...details,
        suggestion: `Check the '${field}' parameter and try again`
      }
    );
    this.name = 'ValidationError';
  }
}

/**
 * Network error - thrown when network connectivity issues occur
 * 
 * @remarks
 * HTTP Status Code: 0 (no HTTP response)
 * Indicates network connectivity problems
 * 
 * @example
 * ```typescript
 * try {
 *   await sdk.transfer(request, wallet);
 * } catch (error) {
 *   if (error instanceof NetworkError) {
 *     console.error('Network error:', error.message);
 *     console.log('Original error:', error.originalError);
 *   }
 * }
 * ```
 */
export class NetworkError extends SmoothSendError {
  /**
   * Creates a new NetworkError
   * 
   * @param message - Human-readable error message
   * @param originalError - Original error that caused the network failure
   */
  constructor(message: string, public originalError?: Error) {
    super(
      message,
      'NETWORK_ERROR',
      0,
      {
        originalError: originalError?.message,
        suggestion: 'Check your internet connection and try again'
      }
    );
    this.name = 'NetworkError';
  }
}

/**
 * Helper function to create appropriate error from HTTP response
 * 
 * @remarks
 * Parses HTTP error response and creates typed error object
 * Used internally by HTTP client
 * 
 * @param statusCode - HTTP status code
 * @param errorData - Error response data from API
 * @param defaultMessage - Default message if none provided in response
 * @returns Typed error object
 * 
 * @example
 * ```typescript
 * const error = createErrorFromResponse(401, {
 *   error: 'Invalid API key',
 *   details: { field: 'apiKey' }
 * });
 * throw error;
 * ```
 */
export function createErrorFromResponse(
  statusCode: number,
  errorData: any,
  defaultMessage: string = 'An error occurred'
): SmoothSendError {
  const message = errorData?.error || errorData?.message || defaultMessage;
  const details = errorData?.details || {};
  
  switch (statusCode) {
    case 401:
      return new AuthenticationError(message, details);
      
    case 429:
      return new RateLimitError(
        message,
        parseInt(details.limit || '0'),
        parseInt(details.remaining || '0'),
        details.reset || details.resetTime || ''
      );
      
    case 400:
      return new ValidationError(
        message,
        details.field || 'unknown',
        details
      );
      
    default:
      return new SmoothSendError(message, errorData?.errorCode || 'UNKNOWN_ERROR', statusCode, details);
  }
}

/**
 * Helper function to create network error from exception
 * 
 * @remarks
 * Wraps generic exceptions in NetworkError for consistent error handling
 * Used internally by HTTP client
 * 
 * @param error - Original error or exception
 * @returns NetworkError instance
 * 
 * @example
 * ```typescript
 * try {
 *   await fetch(url);
 * } catch (error) {
 *   throw createNetworkError(error);
 * }
 * ```
 */
export function createNetworkError(error: any): NetworkError {
  const message = error?.message || 'Network request failed';
  return new NetworkError(message, error instanceof Error ? error : undefined);
}
