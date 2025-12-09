/**
 * Unit Tests for SmoothSendSDK Core
 * 
 * Tests the main SDK class functionality
 */

import { SmoothSendSDK } from '../../src/core/SmoothSendSDK';

// Mock axios at module level
jest.mock('axios', () => {
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    defaults: {
      headers: {},
    },
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };

  return {
    create: jest.fn(() => mockAxiosInstance),
    __mockInstance: mockAxiosInstance,
  };
});

describe('SmoothSendSDK', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with valid public API key', () => {
      const sdk = new SmoothSendSDK({
        apiKey: 'pk_nogas_test123',
        network: 'testnet',
      });
      expect(sdk).toBeInstanceOf(SmoothSendSDK);
    });

    it('should create instance with valid secret API key', () => {
      const sdk = new SmoothSendSDK({
        apiKey: 'sk_nogas_secret123',
        network: 'mainnet',
      });
      expect(sdk).toBeInstanceOf(SmoothSendSDK);
    });

    it('should create instance with legacy API key', () => {
      const sdk = new SmoothSendSDK({
        apiKey: 'no_gas_legacy123',
        network: 'testnet',
      });
      expect(sdk).toBeInstanceOf(SmoothSendSDK);
    });

    it('should throw error without API key', () => {
      expect(() => {
        new SmoothSendSDK({} as any);
      }).toThrow('API key is required');
    });

    it('should throw error with invalid API key format', () => {
      expect(() => {
        new SmoothSendSDK({
          apiKey: 'invalid_key_format',
          network: 'testnet',
        });
      }).toThrow('Invalid API key format');
    });

    it('should throw error with invalid network', () => {
      expect(() => {
        new SmoothSendSDK({
          apiKey: 'pk_nogas_test123',
          network: 'invalid' as any,
        });
      }).toThrow('Invalid network parameter');
    });

    it('should default to testnet', () => {
      const sdk = new SmoothSendSDK({
        apiKey: 'pk_nogas_test123',
      });
      expect(sdk).toBeInstanceOf(SmoothSendSDK);
    });

    it('should accept custom timeout', () => {
      const sdk = new SmoothSendSDK({
        apiKey: 'pk_nogas_test123',
        network: 'testnet',
        timeout: 60000,
      });
      expect(sdk).toBeInstanceOf(SmoothSendSDK);
    });

    it('should accept custom retries', () => {
      const sdk = new SmoothSendSDK({
        apiKey: 'pk_nogas_test123',
        network: 'testnet',
        retries: 5,
      });
      expect(sdk).toBeInstanceOf(SmoothSendSDK);
    });
  });

  describe('getSupportedChains', () => {
    it('should return supported chains', () => {
      const sdk = new SmoothSendSDK({
        apiKey: 'pk_nogas_test123',
        network: 'testnet',
      });
      const chains = sdk.getSupportedChains();
      expect(Array.isArray(chains)).toBe(true);
      expect(chains.length).toBeGreaterThan(0);
    });

    it('should include aptos chains', () => {
      const sdk = new SmoothSendSDK({
        apiKey: 'pk_nogas_test123',
        network: 'testnet',
      });
      const chains = sdk.getSupportedChains();
      expect(chains).toContain('aptos-testnet');
      expect(chains).toContain('aptos-mainnet');
    });
  });

  describe('isChainSupported', () => {
    let sdk: SmoothSendSDK;

    beforeEach(() => {
      sdk = new SmoothSendSDK({
        apiKey: 'pk_nogas_test123',
        network: 'testnet',
      });
    });

    it('should return true for aptos-testnet', () => {
      expect(sdk.isChainSupported('aptos-testnet')).toBe(true);
    });

    it('should return true for aptos-mainnet', () => {
      expect(sdk.isChainSupported('aptos-mainnet')).toBe(true);
    });

    it('should return false for unsupported chains', () => {
      expect(sdk.isChainSupported('ethereum' as any)).toBe(false);
      expect(sdk.isChainSupported('polygon' as any)).toBe(false);
    });
  });

  describe('validateAddress', () => {
    let sdk: SmoothSendSDK;

    beforeEach(() => {
      sdk = new SmoothSendSDK({
        apiKey: 'pk_nogas_test123',
        network: 'testnet',
      });
    });

    it('should validate correct Aptos address', () => {
      const validAddress = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      expect(sdk.validateAddress('aptos-testnet', validAddress)).toBe(true);
    });

    it('should validate short Aptos address', () => {
      const shortAddress = '0x1';
      expect(sdk.validateAddress('aptos-testnet', shortAddress)).toBe(true);
    });

    it('should reject invalid Aptos address', () => {
      const invalidAddress = 'not_a_valid_address';
      expect(sdk.validateAddress('aptos-testnet', invalidAddress)).toBe(false);
    });

    it('should reject address without 0x prefix', () => {
      const noPrefix = '1234567890abcdef';
      expect(sdk.validateAddress('aptos-testnet', noPrefix)).toBe(false);
    });
  });

  describe('validateAmount', () => {
    let sdk: SmoothSendSDK;

    beforeEach(() => {
      sdk = new SmoothSendSDK({
        apiKey: 'pk_nogas_test123',
        network: 'testnet',
      });
    });

    it('should validate positive amounts', () => {
      expect(sdk.validateAmount('aptos-testnet', '1000000')).toBe(true);
      expect(sdk.validateAmount('aptos-testnet', '1')).toBe(true);
    });

    it('should reject zero amount', () => {
      expect(sdk.validateAmount('aptos-testnet', '0')).toBe(false);
    });

    it('should reject negative amounts', () => {
      expect(sdk.validateAmount('aptos-testnet', '-100')).toBe(false);
    });

    it('should reject invalid amounts', () => {
      expect(sdk.validateAmount('aptos-testnet', 'abc')).toBe(false);
    });
  });

  describe('Event System', () => {
    let sdk: SmoothSendSDK;

    beforeEach(() => {
      sdk = new SmoothSendSDK({
        apiKey: 'pk_nogas_test123',
        network: 'testnet',
      });
    });

    it('should add event listener without error', () => {
      const listener = jest.fn();
      expect(() => sdk.addEventListener(listener)).not.toThrow();
    });

    it('should remove event listener without error', () => {
      const listener = jest.fn();
      sdk.addEventListener(listener);
      expect(() => sdk.removeEventListener(listener)).not.toThrow();
    });
  });

  describe('API Methods exist', () => {
    let sdk: SmoothSendSDK;

    beforeEach(() => {
      sdk = new SmoothSendSDK({
        apiKey: 'pk_nogas_test123',
        network: 'testnet',
      });
    });

    it('should have estimateFee method', () => {
      expect(typeof sdk.estimateFee).toBe('function');
    });

    it('should have executeGaslessTransfer method', () => {
      expect(typeof sdk.executeGaslessTransfer).toBe('function');
    });

    it('should have transfer method', () => {
      expect(typeof sdk.transfer).toBe('function');
    });

    it('should have getHealth method', () => {
      expect(typeof sdk.getHealth).toBe('function');
    });

    it('should have getTransactionStatus method', () => {
      expect(typeof sdk.getTransactionStatus).toBe('function');
    });
  });
});
