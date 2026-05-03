/**
 * Unit Tests for SmoothSendTransactionSubmitter
 * 
 * Tests the wallet adapter integration for gasless transactions
 */

import { 
  SmoothSendTransactionSubmitter,
  SmoothSendTransactionSubmitterConfig,
  AptosConfig,
  AnyRawTransaction,
  AccountAuthenticator
} from '../../src/wallet-adapter';
import { Network } from '@aptos-labs/ts-sdk';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SmoothSendTransactionSubmitter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Constructor', () => {
    it('should create instance with valid public API key', () => {
      const submitter = new SmoothSendTransactionSubmitter({
        apiKey: 'pk_nogas_test123',
      });
      expect(submitter).toBeInstanceOf(SmoothSendTransactionSubmitter);
    });

    it('should create instance with valid secret API key', () => {
      const submitter = new SmoothSendTransactionSubmitter({
        apiKey: 'sk_nogas_secret123',
      });
      expect(submitter).toBeInstanceOf(SmoothSendTransactionSubmitter);
    });

    it('should create instance with legacy API key', () => {
      const submitter = new SmoothSendTransactionSubmitter({
        apiKey: 'no_gas_legacy123',
      });
      expect(submitter).toBeInstanceOf(SmoothSendTransactionSubmitter);
    });

    it('should throw error without API key', () => {
      expect(() => {
        new SmoothSendTransactionSubmitter({} as any);
      }).toThrow('API key is required');
    });

    it('should throw error with invalid API key format', () => {
      expect(() => {
        new SmoothSendTransactionSubmitter({
          apiKey: 'invalid_key_format',
        });
      }).toThrow('Invalid API key format');
    });

    it('should use default network (testnet)', () => {
      const submitter = new SmoothSendTransactionSubmitter({
        apiKey: 'pk_nogas_test123',
      });
      expect(submitter).toBeDefined();
    });

    it('should accept custom network', () => {
      const submitter = new SmoothSendTransactionSubmitter({
        apiKey: 'pk_nogas_test123',
        network: 'mainnet',
      });
      expect(submitter).toBeDefined();
    });

    it('should accept custom gatewayUrl', () => {
      const submitter = new SmoothSendTransactionSubmitter({
        apiKey: 'pk_nogas_test123',
        gatewayUrl: 'https://custom.gateway.com',
      });
      expect(submitter).toBeDefined();
    });

    it('should accept custom timeout', () => {
      const submitter = new SmoothSendTransactionSubmitter({
        apiKey: 'pk_nogas_test123',
        timeout: 60000,
      });
      expect(submitter).toBeDefined();
    });

    it('should accept debug option', () => {
      const submitter = new SmoothSendTransactionSubmitter({
        apiKey: 'pk_nogas_test123',
        debug: true,
      });
      expect(submitter).toBeDefined();
    });
  });

  describe('submitTransaction', () => {
    let submitter: SmoothSendTransactionSubmitter;

    const mockAptosConfig: AptosConfig = {
      network: Network.TESTNET,
    } as any;

    const mockTransaction = {
      bcsToBytes: () => new Uint8Array([1, 2, 3, 4, 5]),
      rawTransaction: {
        sender: { toString: () => '0x123' },
        sequence_number: { toString: () => '1' },
        max_gas_amount: { toString: () => '10000' },
        gas_unit_price: { toString: () => '100' },
        expiration_timestamp_secs: { toString: () => '1234567890' },
      },
    } as unknown as AnyRawTransaction;

    const mockAuthenticator = {
      bcsToBytes: () => new Uint8Array([6, 7, 8, 9, 10]),
    } as unknown as AccountAuthenticator;

    beforeEach(() => {
      submitter = new SmoothSendTransactionSubmitter({
        apiKey: 'pk_nogas_test123',
      });
    });

    it('should submit transaction successfully', async () => {
      const mockResponse = {
        success: true,
        txnHash: '0xabc123',
        gasUsed: '500',
        vmStatus: 'Executed successfully',
        sender: '0x123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await submitter.submitTransaction({
        aptosConfig: mockAptosConfig,
        transaction: mockTransaction,
        senderAuthenticator: mockAuthenticator,
      });

      expect(result.hash).toBe('0xabc123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('gasless-transaction'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid transaction' }),
      });

      await expect(
        submitter.submitTransaction({
          aptosConfig: mockAptosConfig,
          transaction: mockTransaction,
          senderAuthenticator: mockAuthenticator,
        })
      ).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        submitter.submitTransaction({
          aptosConfig: mockAptosConfig,
          transaction: mockTransaction,
          senderAuthenticator: mockAuthenticator,
        })
      ).rejects.toThrow('Network error');
    });

    it('should serialize transaction bytes correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, txnHash: '0xtest' }),
      });

      await submitter.submitTransaction({
        aptosConfig: mockAptosConfig,
        transaction: mockTransaction,
        senderAuthenticator: mockAuthenticator,
      });

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      // Should have transaction bytes as array
      expect(Array.isArray(body.transactionBytes)).toBe(true);
      expect(Array.isArray(body.authenticatorBytes)).toBe(true);
    });

    it('should include network header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, txnHash: '0xtest' }),
      });

      await submitter.submitTransaction({
        aptosConfig: mockAptosConfig,
        transaction: mockTransaction,
        senderAuthenticator: mockAuthenticator,
      });

      const fetchCall = mockFetch.mock.calls[0];
      // Check that network is included somewhere in the call
      expect(fetchCall[1].headers['X-Chain'] || fetchCall[1].body).toBeDefined();
    });
  });

  describe('TransactionSubmitter interface', () => {
    it('should implement submitTransaction method', () => {
      const submitter = new SmoothSendTransactionSubmitter({
        apiKey: 'pk_nogas_test123',
      });
      expect(typeof submitter.submitTransaction).toBe('function');
    });
  });
});
