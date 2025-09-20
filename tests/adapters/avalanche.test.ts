import { AvalancheAdapter } from '../../src/adapters/avalanche';
import { HttpClient } from '../../src/utils/http';
import { ChainConfig, TransferRequest, SmoothSendError } from '../../src/types';
import { ethers } from 'ethers';

// Mock dependencies
jest.mock('../../src/utils/http');
jest.mock('ethers');

describe('AvalancheAdapter', () => {
  let adapter: AvalancheAdapter;
  let mockHttpClient: jest.Mocked<HttpClient>;
  let mockConfig: ChainConfig;

  beforeEach(() => {
    mockConfig = {
      name: 'Avalanche Fuji',
      chainId: 43113,
      rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
      relayerUrl: 'https://avax-testnet.smoothsend.xyz',
      explorerUrl: 'https://testnet.snowtrace.io',
      nativeCurrency: {
        name: 'Avalanche',
        symbol: 'AVAX',
        decimals: 18
      }
    };

    // Mock HttpClient
    mockHttpClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      retry: jest.fn()
    } as any;

    (HttpClient as jest.MockedClass<typeof HttpClient>).mockImplementation(() => mockHttpClient);

    adapter = new AvalancheAdapter(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct config', () => {
      expect(adapter.chain).toBe('avalanche');
      expect(adapter.config).toEqual(mockConfig);
      expect(HttpClient).toHaveBeenCalledWith(mockConfig.relayerUrl);
    });
  });

  describe('getQuote', () => {
    const mockRequest: TransferRequest = {
      from: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2',
      to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
      token: 'USDC',
      amount: '1000000',
      chain: 'avalanche'
    };

    it('should get quote successfully', async () => {
      const mockResponse = {
        success: true,
        data: {
          amount: '1000000',
          relayerFee: '10000',
          total: '1010000',
          feePercentage: 1.0
        }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await adapter.getQuote(mockRequest);

      expect(result).toEqual({
        amount: '1000000',
        relayerFee: '10000',
        total: '1010000',
        feePercentage: 1.0
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith('/quote', {
        chainName: 'fuji',
        token: 'USDC',
        amount: '1000000'
      });
    });

    it('should throw error on failed quote', async () => {
      const mockResponse = {
        success: false,
        error: 'Quote failed',
        details: { reason: 'Invalid token' }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      await expect(adapter.getQuote(mockRequest)).rejects.toThrow(
        expect.objectContaining({
          message: 'Quote failed',
          code: 'QUOTE_ERROR',
          chain: 'avalanche'
        })
      );
    });

    it('should throw error when response data is missing', async () => {
      const mockResponse = {
        success: true,
        data: null
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      await expect(adapter.getQuote(mockRequest)).rejects.toThrow(
        expect.objectContaining({
          message: 'Failed to get quote',
          code: 'QUOTE_ERROR'
        })
      );
    });
  });

  describe('prepareTransfer', () => {
    const mockRequest: TransferRequest = {
      from: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2',
      to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
      token: 'USDC',
      amount: '1000000',
      chain: 'avalanche'
    };

    const mockQuote = {
      amount: '1000000',
      relayerFee: '10000',
      total: '1010000',
      feePercentage: 1.0
    };

    it('should prepare transfer successfully', async () => {
      const mockNonceResponse = {
        success: true,
        data: { nonce: '5' }
      };

      const mockSignatureResponse = {
        success: true,
        data: {
          domain: { name: 'SmoothSend' },
          types: { Transfer: [] },
          message: { from: mockRequest.from },
          primaryType: 'Transfer'
        }
      };

      mockHttpClient.get.mockResolvedValue(mockNonceResponse);
      mockHttpClient.post.mockResolvedValue(mockSignatureResponse);

      const result = await adapter.prepareTransfer(mockRequest, mockQuote);

      expect(result).toEqual({
        domain: { name: 'SmoothSend' },
        types: { Transfer: [] },
        message: { from: mockRequest.from },
        primaryType: 'Transfer'
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/nonce', {
        params: {
          chainName: 'fuji',
          userAddress: mockRequest.from
        }
      });
    });

    it('should throw error when nonce request fails', async () => {
      const mockNonceResponse = {
        success: false,
        error: 'Nonce request failed'
      };

      mockHttpClient.get.mockResolvedValue(mockNonceResponse);

      await expect(adapter.prepareTransfer(mockRequest, mockQuote)).rejects.toThrow(
        expect.objectContaining({
          message: 'Failed to get user nonce',
          code: 'NONCE_ERROR'
        })
      );
    });
  });

  describe('executeTransfer', () => {
    const mockSignedData = {
      transferData: {
        from: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2',
        to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
        signature: '0x123...'
      },
      signature: '0x123...',
      signatureType: 'EIP712' as const
    };

    it('should execute transfer successfully', async () => {
      const mockResponse = {
        success: true,
        data: {
          txHash: '0xabc123...',
          blockNumber: '12345',
          gasUsed: '21000',
          transferId: 'transfer_123'
        }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await adapter.executeTransfer(mockSignedData);

      expect(result).toEqual({
        success: true,
        txHash: '0xabc123...',
        blockNumber: '12345',
        gasUsed: '21000',
        transferId: 'transfer_123',
        explorerUrl: `${mockConfig.explorerUrl}/tx/0xabc123...`
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith('/relay-transfer', mockSignedData.transferData);
    });

    it('should throw error on execution failure', async () => {
      const mockResponse = {
        success: false,
        error: 'Execution failed',
        details: { reason: 'Insufficient balance' }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      await expect(adapter.executeTransfer(mockSignedData)).rejects.toThrow(
        expect.objectContaining({
          message: 'Execution failed',
          code: 'EXECUTION_ERROR',
          chain: 'avalanche'
        })
      );
    });
  });

  describe('getBalance', () => {
    const testAddress = '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2';

    it('should get all balances', async () => {
      // Mock validateAddress to return true
      (ethers.isAddress as unknown as jest.Mock).mockReturnValue(true);
      
      const mockChainsResponse = {
        success: true,
        data: {
          chains: [
            { tokens: ['USDC', 'USDT'] }
          ]
        }
      };

      mockHttpClient.get.mockResolvedValue(mockChainsResponse);

      const result = await adapter.getBalance(testAddress);

      expect(result).toEqual([
        expect.objectContaining({ token: 'USDC', symbol: 'USDC' }),
        expect.objectContaining({ token: 'USDT', symbol: 'USDT' })
      ]);
    });

    it('should get specific token balance', async () => {
      // Mock validateAddress to return true
      (ethers.isAddress as unknown as jest.Mock).mockReturnValue(true);
      
      const result = await adapter.getBalance(testAddress, 'USDC');

      expect(result).toEqual([
        expect.objectContaining({
          token: 'USDC',
          symbol: 'USDC',
          balance: '0',
          decimals: 18
        })
      ]);
    });

    it('should throw error for invalid address', async () => {
      // Mock ethers.isAddress to return false
      (ethers.isAddress as unknown as jest.Mock).mockReturnValue(false);

      await expect(adapter.getBalance('invalid-address')).rejects.toThrow(
        expect.objectContaining({
          message: 'Invalid address format',
          code: 'INVALID_ADDRESS',
          chain: 'avalanche'
        })
      );
    });
  });

  describe('validateAddress', () => {
    it('should validate correct address', () => {
      (ethers.isAddress as unknown as jest.Mock).mockReturnValue(true);

      const result = adapter.validateAddress('0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2');

      expect(result).toBe(true);
      expect(ethers.isAddress).toHaveBeenCalledWith('0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2');
    });

    it('should invalidate incorrect address', () => {
      (ethers.isAddress as unknown as jest.Mock).mockReturnValue(false);

      const result = adapter.validateAddress('invalid-address');

      expect(result).toBe(false);
    });

    it('should handle ethers.isAddress throwing error', () => {
      (ethers.isAddress as unknown as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid address');
      });

      const result = adapter.validateAddress('invalid-address');

      expect(result).toBe(false);
    });
  });

  describe('validateAmount', () => {
    it('should validate positive amount', async () => {
      const result = await adapter.validateAmount('1000000', 'USDC');
      expect(result).toBe(true);
    });

    it('should invalidate zero amount', async () => {
      const result = await adapter.validateAmount('0', 'USDC');
      expect(result).toBe(false);
    });

    it('should invalidate negative amount', async () => {
      const result = await adapter.validateAmount('-1000', 'USDC');
      expect(result).toBe(false);
    });

    it('should invalidate invalid amount format', async () => {
      const result = await adapter.validateAmount('not-a-number', 'USDC');
      expect(result).toBe(false);
    });
  });

  describe('getNonce', () => {
    it('should get nonce successfully', async () => {
      const mockResponse = {
        success: true,
        data: { nonce: '7' }
      };

      mockHttpClient.get.mockResolvedValue(mockResponse);

      const result = await adapter.getNonce('0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2');

      expect(result).toBe('7');
      expect(mockHttpClient.get).toHaveBeenCalledWith('/nonce', {
        params: {
          chainName: 'fuji',
          userAddress: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2'
        }
      });
    });

    it('should throw error when nonce request fails', async () => {
      const mockResponse = {
        success: false,
        error: 'Nonce request failed'
      };

      mockHttpClient.get.mockResolvedValue(mockResponse);

      await expect(adapter.getNonce('0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2')).rejects.toThrow(
        expect.objectContaining({
          message: 'Failed to get nonce',
          code: 'NONCE_ERROR',
          chain: 'avalanche'
        })
      );
    });
  });

  describe('getTransactionStatus', () => {
    const txHash = '0xabc123...';

    it('should get transaction status successfully', async () => {
      const mockResponse = {
        success: true,
        data: {
          executed: true,
          blockNumber: '12345'
        }
      };

      mockHttpClient.get.mockResolvedValue(mockResponse);

      const result = await adapter.getTransactionStatus(txHash);

      expect(result).toEqual({
        executed: true,
        blockNumber: '12345'
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/transfer-status', {
        params: {
          chainName: 'fuji',
          transferHash: txHash
        }
      });
    });

    it('should throw error when status request fails', async () => {
      const mockResponse = {
        success: false,
        error: 'Status request failed'
      };

      mockHttpClient.get.mockResolvedValue(mockResponse);

      await expect(adapter.getTransactionStatus(txHash)).rejects.toThrow(
        expect.objectContaining({
          message: 'Failed to get transaction status',
          code: 'STATUS_ERROR',
          chain: 'avalanche'
        })
      );
    });
  });
});
