import { AptosAdapter } from '../../src/adapters/aptos';
import { HttpClient } from '../../src/utils/http';
import { ChainConfig, TransferRequest, SmoothSendError } from '../../src/types';
import { Aptos, AptosConfig, Network, AccountAddress } from '@aptos-labs/ts-sdk';

// Mock dependencies
jest.mock('../../src/utils/http');
jest.mock('@aptos-labs/ts-sdk');

describe('AptosAdapter', () => {
  let adapter: AptosAdapter;
  let mockHttpClient: jest.Mocked<HttpClient>;
  let mockAptosClient: jest.Mocked<Aptos>;
  let mockConfig: ChainConfig;

  beforeEach(() => {
    mockConfig = {
      name: 'Aptos Testnet',
      chainId: '2',
      rpcUrl: 'https://fullnode.testnet.aptoslabs.com/v1',
      relayerUrl: 'https://testnet.smoothsend.xyz',
      explorerUrl: 'https://explorer.aptoslabs.com/?network=testnet',
      nativeCurrency: {
        name: 'Aptos',
        symbol: 'APT',
        decimals: 8
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

    // Mock Aptos client
    mockAptosClient = {
      getAccountCoinAmount: jest.fn(),
      getAccountResources: jest.fn(),
      getAccountInfo: jest.fn(),
      getTransactionByHash: jest.fn(),
      signTransaction: jest.fn()
    } as any;

    (Aptos as jest.MockedClass<typeof Aptos>).mockImplementation(() => mockAptosClient);

    adapter = new AptosAdapter(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct config', () => {
      expect(adapter.chain).toBe('aptos');
      expect(adapter.config).toEqual(mockConfig);
      expect(HttpClient).toHaveBeenCalledWith(mockConfig.relayerUrl + '/api/v1/relayer');
    });

    it('should initialize Aptos client with mainnet config', () => {
      const mainnetConfig = { ...mockConfig, chainId: '1' };
      new AptosAdapter(mainnetConfig);

      expect(AptosConfig).toHaveBeenCalledWith({ network: Network.MAINNET });
    });

    it('should initialize Aptos client with testnet config', () => {
      expect(AptosConfig).toHaveBeenCalledWith({ network: Network.TESTNET });
    });
  });

  describe('getQuote', () => {
    const mockRequest: TransferRequest = {
      from: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2',
      to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
      token: 'APT',
      amount: '100000000',
      chain: 'aptos'
    };

    it('should get quote successfully', async () => {
      const mockResponse = {
        success: true,
        data: {
          transferAmount: '100000000',
          relayerFeeUSDC: '1000000',
          totalUSDCRequired: '101000000',
          estimatedGasFee: '2000'
        }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await adapter.getQuote(mockRequest);

      expect(result).toEqual({
        amount: '100000000',
        relayerFee: '1000000',
        total: '101000000',
        feePercentage: 0,
        estimatedGas: '2000'
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith('/gasless/quote', {
        fromAddress: mockRequest.from,
        toAddress: mockRequest.to,
        amount: mockRequest.amount,
        coinType: '0x1::aptos_coin::AptosCoin'
      });
    });

    it('should throw error on failed quote', async () => {
      const mockResponse = {
        success: false,
        error: 'Insufficient balance',
        details: { reason: 'Not enough APT' }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      await expect(adapter.getQuote(mockRequest)).rejects.toThrow(
        expect.objectContaining({
          message: 'Insufficient balance',
          code: 'QUOTE_ERROR',
          chain: 'aptos'
        })
      );
    });
  });

  describe('prepareTransfer', () => {
    const mockRequest: TransferRequest = {
      from: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2',
      to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
      token: 'APT',
      amount: '100000000',
      chain: 'aptos'
    };

    const mockQuote = {
      amount: '100000000',
      relayerFee: '1000000',
      total: '101000000',
      feePercentage: 0,
      estimatedGas: '2000'
    };

    it('should prepare transfer successfully', async () => {
      const result = await adapter.prepareTransfer(mockRequest, mockQuote);

      expect(result).toEqual({
        domain: null,
        types: null,
        message: {
          fromAddress: mockRequest.from,
          toAddress: mockRequest.to,
          amount: mockRequest.amount,
          coinType: '0x1::aptos_coin::AptosCoin',
          maxGasAmount: '2000',
          gasUnitPrice: '100',
          expirationTimestamp: expect.any(String)
        },
        primaryType: 'AptosTransfer'
      });
    });
  });

  describe('executeTransfer', () => {
    const mockSignedData = {
      transferData: {
        fromAddress: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2',
        toAddress: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
        amount: '100000000',
        coinType: '0x1::aptos_coin::AptosCoin'
      },
      signature: '0x123...',
      signatureType: 'APTOS' as const
    };

    it('should execute transfer successfully', async () => {
      const mockResponse = {
        success: true,
        data: {
          txnHash: '0xabc123...',
          version: '12345',
          gasUsed: '1500',
          transferId: 'aptos_transfer_123'
        }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await adapter.executeTransfer(mockSignedData);

      expect(result).toEqual({
        success: true,
        txHash: '0xabc123...',
        blockNumber: '12345',
        gasUsed: '1500',
        transferId: 'aptos_transfer_123',
        explorerUrl: `${mockConfig.explorerUrl}/txn/0xabc123...`
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith('/gasless/submit', {
        ...mockSignedData.transferData,
        signature: mockSignedData.signature
      });
    });

    it('should handle response with hash field instead of txnHash', async () => {
      const mockResponse = {
        success: true,
        data: {
          hash: '0xdef456...',
          version: '12346',
          gasUsed: '1600'
        }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await adapter.executeTransfer(mockSignedData);

      expect(result.txHash).toBe('0xdef456...');
      expect(result.explorerUrl).toContain('0xdef456...');
    });
  });

  describe('getBalance', () => {
    const testAddress = '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2';

    beforeEach(() => {
      // Mock AccountAddress.from to not throw
      (AccountAddress.from as jest.Mock).mockReturnValue({});
    });

    it('should get specific token balance', async () => {
      mockAptosClient.getAccountCoinAmount.mockResolvedValue(100000000 as any);

      const result = await adapter.getBalance(testAddress, 'APT');

      expect(result).toEqual([{
        token: '0x1::aptos_coin::AptosCoin',
        balance: '100000000',
        decimals: 8,
        symbol: 'APT',
        name: 'APT'
      }]);

      expect(mockAptosClient.getAccountCoinAmount).toHaveBeenCalledWith({
        accountAddress: testAddress,
        coinType: '0x1::aptos_coin::AptosCoin'
      });
    });

    it('should get all coin balances', async () => {
      const mockResources = [
        {
          type: '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>' as any,
          data: {
            coin: { value: '100000000' }
          }
        },
        {
          type: '0x1::coin::CoinStore<0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC>' as any,
          data: {
            coin: { value: '50000000' }
          }
        }
      ];

      mockAptosClient.getAccountResources.mockResolvedValue(mockResources as any);

      const result = await adapter.getBalance(testAddress);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expect.objectContaining({
        token: '0x1::aptos_coin::AptosCoin',
        balance: '100000000',
        symbol: 'APT'
      }));
      expect(result[1]).toEqual(expect.objectContaining({
        balance: '50000000',
        symbol: 'USDC'
      }));
    });

    it('should throw error for invalid address', async () => {
      (AccountAddress.from as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid address');
      });

      await expect(adapter.getBalance('invalid-address')).rejects.toThrow(
        expect.objectContaining({
          message: 'Invalid address format',
          code: 'INVALID_ADDRESS',
          chain: 'aptos'
        })
      );
    });

    it('should handle balance query errors', async () => {
      mockAptosClient.getAccountCoinAmount.mockRejectedValue(new Error('Network error'));

      await expect(adapter.getBalance(testAddress, 'APT')).rejects.toThrow(
        expect.objectContaining({
          message: 'Failed to get balance',
          code: 'BALANCE_ERROR',
          chain: 'aptos'
        })
      );
    });
  });

  describe('validateAddress', () => {
    it('should validate correct address', () => {
      (AccountAddress.from as jest.Mock).mockReturnValue({});

      const result = adapter.validateAddress('0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2');

      expect(result).toBe(true);
      expect(AccountAddress.from).toHaveBeenCalledWith('0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2');
    });

    it('should invalidate incorrect address', () => {
      (AccountAddress.from as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid address');
      });

      const result = adapter.validateAddress('invalid-address');

      expect(result).toBe(false);
    });
  });

  describe('validateAmount', () => {
    it('should validate positive amount', async () => {
      const result = await adapter.validateAmount('100000000', 'APT');
      expect(result).toBe(true);
    });

    it('should invalidate zero amount', async () => {
      const result = await adapter.validateAmount('0', 'APT');
      expect(result).toBe(false);
    });

    it('should invalidate invalid amount format', async () => {
      const result = await adapter.validateAmount('not-a-number', 'APT');
      expect(result).toBe(false);
    });
  });

  describe('getNonce', () => {
    const testAddress = '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2';

    it('should get nonce (sequence number) successfully', async () => {
      const mockAccountInfo = {
        sequence_number: '42',
        authentication_key: '0x123...'
      };

      mockAptosClient.getAccountInfo.mockResolvedValue(mockAccountInfo as any);

      const result = await adapter.getNonce(testAddress);

      expect(result).toBe('42');
      expect(mockAptosClient.getAccountInfo).toHaveBeenCalledWith({
        accountAddress: testAddress
      });
    });

    it('should throw error when account info request fails', async () => {
      mockAptosClient.getAccountInfo.mockRejectedValue(new Error('Account not found'));

      await expect(adapter.getNonce(testAddress)).rejects.toThrow(
        expect.objectContaining({
          message: 'Failed to get account sequence number',
          code: 'NONCE_ERROR',
          chain: 'aptos'
        })
      );
    });
  });

  describe('getTransactionStatus', () => {
    const txHash = '0xabc123...';

    it('should get transaction status from relayer', async () => {
      const mockResponse = {
        success: true,
        data: {
          hash: txHash,
          success: true,
          version: '12345',
          gasUsed: '1500'
        }
      };

      mockHttpClient.get.mockResolvedValue(mockResponse);

      const result = await adapter.getTransactionStatus(txHash);

      expect(result).toEqual({
        hash: txHash,
        success: true,
        version: '12345',
        gasUsed: '1500'
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith(`/status/${txHash}`);
    });

    it('should fallback to Aptos client when relayer fails', async () => {
      const mockRelayerResponse = {
        success: false,
        error: 'Not found'
      };

      const mockTransaction = {
        success: true,
        version: '12345',
        gas_used: '1500',
        type: 'user_transaction' as any,
        hash: 'test',
        state_change_hash: 'test',
        event_root_hash: 'test',
        state_checkpoint_hash: 'test',
        gas_unit_price: '100',
        execution_success: true,
        vm_status: 'Executed successfully',
        accumulator_root_hash: 'test',
        changes: [],
        sender: 'test',
        sequence_number: '1',
        max_gas_amount: '2000',
        expiration_timestamp_secs: '1234567890',
        payload: {} as any,
        signature: {} as any,
        events: [],
        timestamp: '1234567890'
      };

      mockHttpClient.get.mockResolvedValue(mockRelayerResponse);
      mockAptosClient.getTransactionByHash.mockResolvedValue(mockTransaction as any);

      const result = await adapter.getTransactionStatus(txHash);

      expect(result).toEqual({
        hash: txHash,
        success: true,
        version: '12345',
        gasUsed: '1500'
      });

      expect(mockAptosClient.getTransactionByHash).toHaveBeenCalledWith({
        transactionHash: txHash
      });
    });

    it('should throw error when both relayer and Aptos client fail', async () => {
      const mockRelayerResponse = {
        success: false,
        error: 'Not found'
      };

      mockHttpClient.get.mockResolvedValue(mockRelayerResponse);
      mockAptosClient.getTransactionByHash.mockRejectedValue(new Error('Transaction not found'));

      await expect(adapter.getTransactionStatus(txHash)).rejects.toThrow(
        expect.objectContaining({
          message: 'Failed to get transaction status',
          code: 'STATUS_ERROR',
          chain: 'aptos'
        })
      );
    });
  });

  describe('Helper Methods', () => {
    describe('getCoinType', () => {
      it('should convert known token symbols to coin types', () => {
        // Access private method for testing
        const getCoinType = (adapter as any).getCoinType.bind(adapter);

        expect(getCoinType('APT')).toBe('0x1::aptos_coin::AptosCoin');
        expect(getCoinType('USDC')).toBe('0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC');
        expect(getCoinType('USDT')).toBe('0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT');
      });

      it('should return input for unknown tokens', () => {
        const getCoinType = (adapter as any).getCoinType.bind(adapter);
        expect(getCoinType('UNKNOWN')).toBe('UNKNOWN');
      });
    });

    describe('getTokenSymbol', () => {
      it('should extract symbols from coin types', () => {
        const getTokenSymbol = (adapter as any).getTokenSymbol.bind(adapter);

        expect(getTokenSymbol('0x1::aptos_coin::AptosCoin')).toBe('APT');
        expect(getTokenSymbol('0x123::asset::USDC')).toBe('USDC');
        expect(getTokenSymbol('0x456::token::MyToken')).toBe('MyToken');
      });
    });

    describe('getCoinDecimals', () => {
      it('should return correct decimals for known coins', async () => {
        const getCoinDecimals = (adapter as any).getCoinDecimals.bind(adapter);

        expect(await getCoinDecimals('0x1::aptos_coin::AptosCoin')).toBe(8);
        expect(await getCoinDecimals('0x123::asset::USDC')).toBe(6);
        expect(await getCoinDecimals('0x456::asset::USDT')).toBe(6);
        expect(await getCoinDecimals('0x789::unknown::Token')).toBe(8); // default
      });
    });
  });
});
