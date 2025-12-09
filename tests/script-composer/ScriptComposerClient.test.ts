/**
 * Unit Tests for ScriptComposerClient
 * 
 * Tests the Script Composer integration for fee-in-token transfers
 */

import { ScriptComposerClient, createScriptComposerClient } from '../../src/script-composer';

// Mock axios at module level
jest.mock('axios', () => {
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    defaults: {
      headers: {
        'X-Network': 'testnet',
      },
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

import axios from 'axios';
const mockAxiosInstance = (axios as any).__mockInstance;

describe('ScriptComposerClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosInstance.post.mockReset();
    mockAxiosInstance.get.mockReset();
  });

  describe('Constructor', () => {
    it('should create instance with valid config', () => {
      const client = new ScriptComposerClient({
        apiKey: 'pk_nogas_test123',
        network: 'mainnet',
      });
      expect(client).toBeInstanceOf(ScriptComposerClient);
    });

    it('should throw error without API key', () => {
      expect(() => {
        new ScriptComposerClient({ network: 'mainnet' } as any);
      }).toThrow('API key is required');
    });

    it('should throw error without network', () => {
      expect(() => {
        new ScriptComposerClient({ apiKey: 'pk_nogas_test' } as any);
      }).toThrow('Network is required');
    });

    it('should accept testnet network', () => {
      const client = new ScriptComposerClient({
        apiKey: 'pk_nogas_test123',
        network: 'testnet',
      });
      expect(client.getNetwork()).toBe('testnet');
    });

    it('should accept mainnet network', () => {
      const client = new ScriptComposerClient({
        apiKey: 'pk_nogas_test123',
        network: 'mainnet',
      });
      expect(client.getNetwork()).toBe('mainnet');
    });

    it('should accept custom timeout', () => {
      const client = new ScriptComposerClient({
        apiKey: 'pk_nogas_test123',
        network: 'mainnet',
        timeout: 60000,
      });
      expect(client).toBeDefined();
    });

    it('should accept debug option', () => {
      const client = new ScriptComposerClient({
        apiKey: 'pk_nogas_test123',
        network: 'mainnet',
        debug: true,
      });
      expect(client).toBeDefined();
    });
  });

  describe('createScriptComposerClient factory', () => {
    it('should create instance using factory function', () => {
      const client = createScriptComposerClient({
        apiKey: 'pk_nogas_test123',
        network: 'mainnet',
      });
      expect(client).toBeInstanceOf(ScriptComposerClient);
    });
  });

  describe('getNetwork', () => {
    it('should return current network', () => {
      const client = new ScriptComposerClient({
        apiKey: 'pk_nogas_test123',
        network: 'testnet',
      });
      expect(client.getNetwork()).toBe('testnet');
    });
  });

  describe('buildTransfer validation', () => {
    let client: ScriptComposerClient;

    beforeEach(() => {
      client = new ScriptComposerClient({
        apiKey: 'pk_nogas_test123',
        network: 'mainnet',
      });
    });

    it('should validate required sender parameter', async () => {
      await expect(
        client.buildTransfer({
          sender: '',
          recipient: '0x456',
          amount: '1000000',
          assetType: '0xusdc',
          decimals: 6,
          symbol: 'USDC',
        })
      ).rejects.toThrow('Missing required parameters');
    });

    it('should validate required recipient parameter', async () => {
      await expect(
        client.buildTransfer({
          sender: '0x123',
          recipient: '',
          amount: '1000000',
          assetType: '0xusdc',
          decimals: 6,
          symbol: 'USDC',
        })
      ).rejects.toThrow('Missing required parameters');
    });

    it('should validate required amount parameter', async () => {
      await expect(
        client.buildTransfer({
          sender: '0x123',
          recipient: '0x456',
          amount: '',
          assetType: '0xusdc',
          decimals: 6,
          symbol: 'USDC',
        })
      ).rejects.toThrow('Missing required parameters');
    });

    it('should validate required assetType parameter', async () => {
      await expect(
        client.buildTransfer({
          sender: '0x123',
          recipient: '0x456',
          amount: '1000000',
          assetType: '',
          decimals: 6,
          symbol: 'USDC',
        })
      ).rejects.toThrow('Missing token parameters');
    });

    it('should validate required symbol parameter', async () => {
      await expect(
        client.buildTransfer({
          sender: '0x123',
          recipient: '0x456',
          amount: '1000000',
          assetType: '0xusdc',
          decimals: 6,
          symbol: '',
        })
      ).rejects.toThrow('Missing token parameters');
    });
  });

  describe('submitSignedTransaction validation', () => {
    let client: ScriptComposerClient;

    beforeEach(() => {
      client = new ScriptComposerClient({
        apiKey: 'pk_nogas_test123',
        network: 'mainnet',
      });
    });

    it('should reject when transactionBytes is missing', async () => {
      await expect(
        client.submitSignedTransaction({
          transactionBytes: null as any,
          authenticatorBytes: [4, 5, 6],
        })
      ).rejects.toThrow();
    });

    it('should reject when authenticatorBytes is missing', async () => {
      await expect(
        client.submitSignedTransaction({
          transactionBytes: [1, 2, 3],
          authenticatorBytes: null as any,
        })
      ).rejects.toThrow();
    });
  });

  describe('API Methods exist', () => {
    let client: ScriptComposerClient;

    beforeEach(() => {
      client = new ScriptComposerClient({
        apiKey: 'pk_nogas_test123',
        network: 'mainnet',
      });
    });

    it('should have estimateFee method', () => {
      expect(typeof client.estimateFee).toBe('function');
    });

    it('should have buildTransfer method', () => {
      expect(typeof client.buildTransfer).toBe('function');
    });

    it('should have submitSignedTransaction method', () => {
      expect(typeof client.submitSignedTransaction).toBe('function');
    });

    it('should have transfer method', () => {
      expect(typeof client.transfer).toBe('function');
    });

    it('should have getNetwork method', () => {
      expect(typeof client.getNetwork).toBe('function');
    });

    it('should have setNetwork method', () => {
      expect(typeof client.setNetwork).toBe('function');
    });
  });
});
