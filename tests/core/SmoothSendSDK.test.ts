import { SmoothSendSDK } from '../../src/core/SmoothSendSDK';
import { 
  SupportedChain, 
  TransferRequest, 
  TransferQuote, 
  SmoothSendError,
  TransferEvent 
} from '../../src/types';
import { AvalancheAdapter } from '../../src/adapters/avalanche';

// Mock the adapters
jest.mock('../../src/adapters/avalanche');

describe('SmoothSendSDK', () => {
  let sdk: SmoothSendSDK;
  let mockAvalancheAdapter: jest.Mocked<AvalancheAdapter>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create SDK instance
    sdk = new SmoothSendSDK({
      timeout: 5000,
      retries: 2
    });

    // Get mocked adapters
    mockAvalancheAdapter = (AvalancheAdapter as jest.MockedClass<typeof AvalancheAdapter>).mock.instances[0] as jest.Mocked<AvalancheAdapter>;
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const defaultSdk = new SmoothSendSDK();
      expect(defaultSdk).toBeInstanceOf(SmoothSendSDK);
    });

    it('should initialize with custom config', () => {
      const customSdk = new SmoothSendSDK({
        timeout: 10000,
        retries: 5,
        customChainConfigs: {
          avalanche: {
            relayerUrl: 'https://custom-relayer.com'
          }
        }
      });
      expect(customSdk).toBeInstanceOf(SmoothSendSDK);
    });

    it('should initialize adapters for supported chains', () => {
      expect(AvalancheAdapter).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSupportedChains', () => {
    it('should return supported chains', () => {
      const chains = sdk.getSupportedChains();
      expect(chains).toEqual(['avalanche']);
    });

    it('should return supported chains from static method', () => {
      const chains = SmoothSendSDK.getSupportedChains();
      expect(chains).toEqual(['avalanche']);
    });
  });

  describe('isChainSupported', () => {
    it('should return true for supported chains', () => {
      expect(sdk.isChainSupported('avalanche')).toBe(true);
    });

    it('should return false for unsupported chains', () => {
      expect(sdk.isChainSupported('ethereum')).toBe(false);
      expect(sdk.isChainSupported('polygon')).toBe(false);
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

    const mockQuote: TransferQuote = {
      amount: '1000000',
      relayerFee: '10000',
      total: '1010000',
      feePercentage: 1.0
    };

    it('should get quote successfully', async () => {
      mockAvalancheAdapter.getQuote = jest.fn().mockResolvedValue(mockQuote);

      const result = await sdk.getQuote(mockRequest);

      expect(result).toEqual(mockQuote);
      expect(mockAvalancheAdapter.getQuote).toHaveBeenCalledWith(mockRequest);
    });

    it('should emit transfer_initiated event', async () => {
      mockAvalancheAdapter.getQuote = jest.fn().mockResolvedValue(mockQuote);
      const eventListener = jest.fn();
      sdk.addEventListener(eventListener);

      await sdk.getQuote(mockRequest);

      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transfer_initiated',
          chain: 'avalanche',
          data: { request: mockRequest }
        })
      );
    });

    it('should emit transfer_failed event on error', async () => {
      const error = new SmoothSendError('Quote failed', 'QUOTE_ERROR');
      mockAvalancheAdapter.getQuote = jest.fn().mockRejectedValue(error);
      const eventListener = jest.fn();
      sdk.addEventListener(eventListener);

      await expect(sdk.getQuote(mockRequest)).rejects.toThrow('Quote failed');

      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transfer_failed',
          chain: 'avalanche',
          data: { error: 'Quote failed', step: 'quote' }
        })
      );
    });

    it('should throw error for unsupported chain', async () => {
      const invalidRequest = { ...mockRequest, chain: 'ethereum' as SupportedChain };

      await expect(sdk.getQuote(invalidRequest)).rejects.toThrow(
        "Chain 'ethereum' is not supported"
      );
    });
  });

  describe('validateAddress', () => {
    it('should validate avalanche address', () => {
      mockAvalancheAdapter.validateAddress = jest.fn().mockReturnValue(true);

      const result = sdk.validateAddress('avalanche', '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2');

      expect(result).toBe(true);
      expect(mockAvalancheAdapter.validateAddress).toHaveBeenCalledWith('0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2');
    });

    // Aptos address validation test removed - will be re-added when Aptos is supported

    it('should return false for invalid address', () => {
      mockAvalancheAdapter.validateAddress = jest.fn().mockReturnValue(false);

      const result = sdk.validateAddress('avalanche', 'invalid-address');

      expect(result).toBe(false);
    });
  });

  describe('Event Handling', () => {
    it('should add event listener', () => {
      const listener = jest.fn();
      sdk.addEventListener(listener);

      // Trigger an event by calling getQuote
      const mockRequest: TransferRequest = {
        from: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2',
        to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
        token: 'USDC',
        amount: '1000000',
        chain: 'avalanche'
      };

      mockAvalancheAdapter.getQuote = jest.fn().mockResolvedValue({
        amount: '1000000',
        relayerFee: '10000',
        total: '1010000',
        feePercentage: 1.0
      });

      return sdk.getQuote(mockRequest).then(() => {
        expect(listener).toHaveBeenCalled();
      });
    });

    it('should remove event listener', () => {
      const listener = jest.fn();
      sdk.addEventListener(listener);
      sdk.removeEventListener(listener);

      // Trigger an event
      const mockRequest: TransferRequest = {
        from: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2',
        to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
        token: 'USDC',
        amount: '1000000',
        chain: 'avalanche'
      };

      mockAvalancheAdapter.getQuote = jest.fn().mockResolvedValue({
        amount: '1000000',
        relayerFee: '10000',
        total: '1010000',
        feePercentage: 1.0
      });

      return sdk.getQuote(mockRequest).then(() => {
        expect(listener).not.toHaveBeenCalled();
      });
    });

    it('should handle listener errors gracefully', async () => {
      const faultyListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();

      sdk.addEventListener(faultyListener);
      sdk.addEventListener(goodListener);

      const mockRequest: TransferRequest = {
        from: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2',
        to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
        token: 'USDC',
        amount: '1000000',
        chain: 'avalanche'
      };

      mockAvalancheAdapter.getQuote = jest.fn().mockResolvedValue({
        amount: '1000000',
        relayerFee: '10000',
        total: '1010000',
        feePercentage: 1.0
      });

      // Should not throw despite faulty listener
      await expect(sdk.getQuote(mockRequest)).resolves.not.toThrow();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('getBalance', () => {
    it('should get balance from correct adapter', async () => {
      const mockBalance = [{
        token: 'USDC',
        balance: '1000000',
        decimals: 6,
        symbol: 'USDC'
      }];

      mockAvalancheAdapter.getBalance = jest.fn().mockResolvedValue(mockBalance);

      const result = await sdk.getBalance('avalanche', '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2');

      expect(result).toEqual(mockBalance);
      expect(mockAvalancheAdapter.getBalance).toHaveBeenCalledWith('0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2', undefined);
    });

    // Aptos balance test removed - will be re-added when Aptos is supported
  });

  describe('Static Methods', () => {
    it('should get chain config', () => {
      const config = SmoothSendSDK.getChainConfig('avalanche');
      expect(config).toHaveProperty('name', 'Avalanche');
      expect(config).toHaveProperty('chainId', 43113);
    });

    it('should get testnet chain config', () => {
      const config = SmoothSendSDK.getChainConfig('avalanche');
      expect(config).toHaveProperty('name', 'Avalanche Fuji');
      expect(config).toHaveProperty('chainId', 43113);
    });

    it('should get all chain configs', () => {
      const configs = SmoothSendSDK.getAllChainConfigs();
      expect(configs).toHaveProperty('avalanche');
      // Additional chain properties will be tested as they are added
    });
  });
});
