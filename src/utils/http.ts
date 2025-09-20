import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { SmoothSendError, ApiResponse } from '../types';

export class HttpClient {
  private client: AxiosInstance;

  constructor(baseURL: string, timeout: number = 30000) {
    this.client = axios.create({
      baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add timestamp to prevent caching
        config.params = { ...config.params, _t: Date.now() };
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          // Server responded with error status
          const { status, data } = error.response;
          throw new SmoothSendError(
            data?.error || `HTTP Error ${status}`,
            `HTTP_${status}`,
            undefined,
            data
          );
        } else if (error.request) {
          // Network error
          throw new SmoothSendError(
            'Network error - unable to connect to relayer',
            'NETWORK_ERROR',
            undefined,
            error.message
          );
        } else {
          // Other error
          throw new SmoothSendError(
            error.message || 'Unknown error',
            'UNKNOWN_ERROR',
            undefined,
            error
          );
        }
      }
    );
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await this.client.get(url, config);
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await this.client.post(url, data, config);
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await this.client.put(url, data, config);
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await this.client.delete(url, config);
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: any): ApiResponse {
    if (error instanceof SmoothSendError) {
      return {
        success: false,
        error: error.message,
        details: error.details,
      };
    }

    return {
      success: false,
      error: error.message || 'Unknown error occurred',
      details: error,
    };
  }

  // Utility method for retrying requests
  async retry<T>(
    operation: () => Promise<ApiResponse<T>>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<ApiResponse<T>> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        if (result.success) {
          return result;
        }
        lastError = new Error(result.error);
      } catch (error) {
        lastError = error;
      }

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
      }
    }

    return {
      success: false,
      error: `Operation failed after ${maxRetries + 1} attempts: ${lastError.message}`,
      details: lastError,
    };
  }
}

