import { HttpClient } from '../../src/utils/http';
import { SmoothSendError } from '../../src/types';
import axios, { AxiosError } from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HttpClient', () => {
  let httpClient: HttpClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    httpClient = new HttpClient('https://api.example.com', 5000);
  });

  describe('Initialization', () => {
    it('should create axios instance with correct config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.example.com',
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    });

    it('should use default timeout', () => {
      new HttpClient('https://api.example.com');
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000
        })
      );
    });

    it('should setup interceptors', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('GET requests', () => {
    it('should make successful GET request', async () => {
      const mockResponse = { data: { success: true, data: 'test' } };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await httpClient.get('/test');

      expect(result).toEqual({
        success: true,
        data: { success: true, data: 'test' }
      });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test', undefined);
    });

    it('should handle GET request with config', async () => {
      const mockResponse = { data: { success: true } };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const config = { params: { page: 1 } };
      await httpClient.get('/test', config);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test', config);
    });

    it('should handle GET request errors', async () => {
      const error = new Error('Network error');
      mockAxiosInstance.get.mockRejectedValue(error);

      const result = await httpClient.get('/test');

      expect(result).toEqual({
        success: false,
        error: 'Network error',
        details: error
      });
    });
  });

  describe('POST requests', () => {
    it('should make successful POST request', async () => {
      const mockResponse = { data: { success: true, id: 123 } };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const postData = { name: 'test' };
      const result = await httpClient.post('/create', postData);

      expect(result).toEqual({
        success: true,
        data: { success: true, id: 123 }
      });
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/create', postData, undefined);
    });

    it('should handle POST request with config', async () => {
      const mockResponse = { data: { success: true } };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const postData = { name: 'test' };
      const config = { headers: { 'Custom-Header': 'value' } };
      await httpClient.post('/create', postData, config);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/create', postData, config);
    });
  });

  describe('PUT requests', () => {
    it('should make successful PUT request', async () => {
      const mockResponse = { data: { success: true, updated: true } };
      mockAxiosInstance.put.mockResolvedValue(mockResponse);

      const putData = { name: 'updated' };
      const result = await httpClient.put('/update/123', putData);

      expect(result).toEqual({
        success: true,
        data: { success: true, updated: true }
      });
      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/update/123', putData, undefined);
    });
  });

  describe('DELETE requests', () => {
    it('should make successful DELETE request', async () => {
      const mockResponse = { data: { success: true, deleted: true } };
      mockAxiosInstance.delete.mockResolvedValue(mockResponse);

      const result = await httpClient.delete('/delete/123');

      expect(result).toEqual({
        success: true,
        data: { success: true, deleted: true }
      });
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/delete/123', undefined);
    });
  });

  describe('Error Handling', () => {
    it('should handle SmoothSendError', async () => {
      const smoothSendError = new SmoothSendError('Custom error', 'CUSTOM_ERROR', 'avalanche', { detail: 'test' });
      mockAxiosInstance.get.mockRejectedValue(smoothSendError);

      const result = await httpClient.get('/test');

      expect(result).toEqual({
        success: false,
        error: 'Custom error',
        details: { detail: 'test' }
      });
    });

    it('should handle generic errors', async () => {
      const genericError = new Error('Generic error');
      mockAxiosInstance.get.mockRejectedValue(genericError);

      const result = await httpClient.get('/test');

      expect(result).toEqual({
        success: false,
        error: 'Generic error',
        details: genericError
      });
    });

    it('should handle errors with no message', async () => {
      const errorWithoutMessage = { someProperty: 'value' };
      mockAxiosInstance.get.mockRejectedValue(errorWithoutMessage);

      const result = await httpClient.get('/test');

      expect(result).toEqual({
        success: false,
        error: 'Unknown error occurred',
        details: errorWithoutMessage
      });
    });
  });

  describe('Retry functionality', () => {
    it('should retry and succeed on second attempt', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce({ success: true, data: 'success' });

      const result = await httpClient.retry(operation, 2, 100);

      expect(result).toEqual({ success: true, data: 'success' });
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Always fails'));

      const result = await httpClient.retry(operation, 2, 50);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Operation failed after 3 attempts');
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should return first successful result', async () => {
      const operation = jest.fn().mockResolvedValue({ success: true, data: 'immediate success' });

      const result = await httpClient.retry(operation, 3, 100);

      expect(result).toEqual({ success: true, data: 'immediate success' });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle failed results (success: false)', async () => {
      const operation = jest.fn()
        .mockResolvedValueOnce({ success: false, error: 'First failure' })
        .mockResolvedValueOnce({ success: true, data: 'eventual success' });

      const result = await httpClient.retry(operation, 2, 50);

      expect(result).toEqual({ success: true, data: 'eventual success' });
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });
});
