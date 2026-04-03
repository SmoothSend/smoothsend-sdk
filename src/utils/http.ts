import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { 
  ApiResponse, 
  UsageMetadata,
  createErrorFromResponse,
  createNetworkError
} from '../types';
import { USAGE_HEADERS } from '../shared-constants';

/**
 * Configuration for HTTP client
 */
export interface HttpClientConfig {
  apiKey: string;
  network?: 'testnet' | 'mainnet';
  timeout?: number;
  retries?: number;
  customHeaders?: Record<string, string>;
  includeOrigin?: boolean;
}

/**
 * HTTP Client for proxy worker integration
 * Handles authentication, rate limiting, usage tracking, and retry logic
 */
export class HttpClient {
  private client: AxiosInstance;
  private apiKey?: string;
  private network: 'testnet' | 'mainnet';
  private maxRetries: number;
  private baseURL: string;
  private isProxyMode: boolean;
  private includeOrigin: boolean;

  /**
   * Constructor supports both old (baseURL, timeout) and new (config object) patterns
   * for backward compatibility during migration
   */
  constructor(configOrBaseURL: HttpClientConfig | string, timeout?: number) {
    // Determine if using new config object or old baseURL pattern
    if (typeof configOrBaseURL === 'string') {
      // Old pattern: constructor(baseURL, timeout)
      this.baseURL = configOrBaseURL;
      this.network = 'testnet';
      this.maxRetries = 3;
      this.isProxyMode = false;
      this.includeOrigin = false;
      
      this.client = axios.create({
        baseURL: this.baseURL,
        timeout: timeout || 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } else {
      // New pattern: constructor(config)
      const config = configOrBaseURL;
      this.apiKey = config.apiKey;
      this.network = config.network || 'testnet';
      this.maxRetries = config.retries || 3;
      this.baseURL = 'https://proxy.smoothsend.xyz';
      this.isProxyMode = true;
      this.includeOrigin = config.includeOrigin || false;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Network': this.network,
        ...config.customHeaders,
      };

      // Browsers forbid setting the `Origin` header manually ("unsafe header").
      // The browser will set it automatically on cross-origin requests.
      // If callers need the origin explicitly, they can pass a custom header (e.g. `X-Origin`).

      this.client = axios.create({
        baseURL: this.baseURL,
        timeout: config.timeout || 30000,
        headers,
      });
    }

    // Request interceptor - add timestamp to prevent caching
    this.client.interceptors.request.use(
      (config) => {
        config.params = { ...config.params, _t: Date.now() };
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle errors but don't transform responses
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // Let the request methods handle errors for proper retry logic
        return Promise.reject(error);
      }
    );
  }

  /**
   * Extract usage metadata from response headers (proxy mode only)
   * Uses USAGE_HEADERS constants for consistency across systems
   */
  private extractMetadata(response: AxiosResponse): UsageMetadata | undefined {
    if (!this.isProxyMode) {
      return undefined;
    }

    // Convert header names to lowercase for case-insensitive lookup
    const headers = response.headers;
    
    return {
      rateLimit: {
        limit: headers[USAGE_HEADERS.RATE_LIMIT.toLowerCase()] || '0',
        remaining: headers[USAGE_HEADERS.RATE_REMAINING.toLowerCase()] || '0',
        reset: headers[USAGE_HEADERS.RATE_RESET.toLowerCase()] || '',
      },
      monthly: {
        limit: headers[USAGE_HEADERS.MONTHLY_LIMIT.toLowerCase()] || '0',
        usage: headers[USAGE_HEADERS.MONTHLY_USAGE.toLowerCase()] || '0',
        remaining: headers[USAGE_HEADERS.MONTHLY_REMAINING.toLowerCase()] || '0',
      },
      requestId: headers[USAGE_HEADERS.REQUEST_ID.toLowerCase()] || '',
    };
  }

  /**
   * Determine if an error should be retried
   */
  private shouldRetry(error: any, attempt: number): boolean {
    // Don't retry if we've exceeded max retries
    if (attempt >= this.maxRetries) {
      return false;
    }

    // Only retry in proxy mode (legacy mode doesn't have retry logic)
    if (!this.isProxyMode) {
      return false;
    }

    // Network errors - retry
    if (!error.response) {
      return true;
    }

    const status = error.response.status;

    // 5xx server errors - retry
    if (status >= 500 && status < 600) {
      return true;
    }

    // 4xx client errors - don't retry (including 429 rate limit)
    if (status >= 400 && status < 500) {
      return false;
    }

    return false;
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoff(attempt: number): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 10000; // 10 seconds
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const delay = Math.min(exponentialDelay, maxDelay);
    
    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    return Math.floor(delay + jitter);
  }

  /**
   * Execute request with retry logic (proxy mode) or single attempt (legacy mode)
   */
  private async executeWithRetry<T>(
    operation: () => Promise<AxiosResponse<T>>
  ): Promise<ApiResponse<T>> {
    let lastError: any;

    const maxAttempts = this.isProxyMode ? this.maxRetries : 0;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      try {
        const response = await operation();
        
        // Success - extract metadata (if proxy mode) and return
        const result: ApiResponse<T> = {
          success: true,
          data: response.data,
        };

        const metadata = this.extractMetadata(response);
        if (metadata) {
          result.metadata = metadata;
        }

        return result;
      } catch (error: any) {
        lastError = error;

        // Check if we should retry
        if (!this.shouldRetry(error, attempt)) {
          break;
        }

        // Wait before retrying (except on last attempt)
        if (attempt < maxAttempts) {
          const delay = this.calculateBackoff(attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed - handle error
    return this.handleError(lastError);
  }

  /**
   * Handle errors and create appropriate error responses
   */
  private handleError(error: any): ApiResponse {
    if (this.isProxyMode) {
      // Proxy mode: use typed errors
      if (error.response) {
        // Server responded with error status
        const { status, data } = error.response;
        const sdkError = createErrorFromResponse(status, data);
        throw sdkError;
      } else if (error.request) {
        // Network error - no response received
        const networkError = createNetworkError(error);
        throw networkError;
      } else {
        // Other error (request setup, etc.)
        const networkError = createNetworkError(error);
        throw networkError;
      }
    } else {
      // Legacy mode: return error response without throwing
      if (error.response) {
        const { status, data } = error.response;
        return {
          success: false,
          error: data?.error || `HTTP Error ${status}`,
          details: data?.details,
          errorCode: data?.errorCode || `HTTP_${status}`,
        };
      } else if (error.request) {
        return {
          success: false,
          error: 'Network error - unable to connect to server',
          errorCode: 'NETWORK_ERROR',
        };
      } else {
        return {
          success: false,
          error: error.message || 'Unknown error occurred',
          errorCode: 'UNKNOWN_ERROR',
        };
      }
    }
  }

  /**
   * GET request
   */
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.executeWithRetry(() => this.client.get<T>(url, config));
  }

  /**
   * POST request
   */
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.executeWithRetry(() => this.client.post<T>(url, data, config));
  }

  /**
   * PUT request
   */
  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.executeWithRetry(() => this.client.put<T>(url, data, config));
  }

  /**
   * DELETE request
   */
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.executeWithRetry(() => this.client.delete<T>(url, config));
  }

  /**
   * Update network parameter for subsequent requests
   */
  setNetwork(network: 'testnet' | 'mainnet'): void {
    this.network = network;
    this.client.defaults.headers['X-Network'] = network;
  }

  /**
   * Get current network
   */
  getNetwork(): 'testnet' | 'mainnet' {
    return this.network;
  }
}

