import { SmoothSendSDK } from '../../src/core/SmoothSendSDK';
import { TransferRequest, SmoothSendError } from '../../src/types';

// Mock the adapters and their dependencies
jest.mock('../../src/adapters/avalanche');
jest.mock('../../src/adapters/aptos');
jest.mock('../../src/utils/http');

describe('Integration: Complete Transfer Flow', () => {
  let sdk: SmoothSendSDK;

  beforeEach(() => {
    sdk = new SmoothSendSDK({
      timeout: 5000,
      retries: 1
    });
  });

  describe('Avalanche Transfer Flow', () => {
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

    const mockSignatureData = {
      domain: {
        name: 'SmoothSend',
        version: '1',
        chainId: 43113,
        verifyingContract: '0x123...'
      },
      types: {
        Transfer: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' }
        ]
      },
      message: {
        from: mockRequest.from,
        to: mockRequest.to,
        amount: mockRequest.amount,
        nonce: '5',
        deadline: Math.floor(Date.now() / 1000) + 3600
      },
      primaryType: 'Transfer'
    };

    const mockSigner = {
      signTypedData: jest.fn().mockResolvedValue('0xsignature123...')
    };

    it('should complete full transfer flow successfully', async () => {
      // Mock adapter methods
      const mockAvalancheAdapter = require('../../src/adapters/avalanche').AvalancheAdapter.mock.instances[0];
      mockAvalancheAdapter.getQuote.mockResolvedValue(mockQuote);
      mockAvalancheAdapter.prepareTransfer.mockResolvedValue(mockSignatureData);
      mockAvalancheAdapter.executeTransfer.mockResolvedValue({
        success: true,
        txHash: '0xabc123...',
        blockNumber: '12345',
        gasUsed: '21000',
        explorerUrl: 'https://testnet.snowtrace.io/tx/0xabc123...'
      });

      // Execute complete transfer
      const result = await sdk.transfer(mockRequest, mockSigner);

      // Verify the flow
      expect(mockAvalancheAdapter.getQuote).toHaveBeenCalledWith(mockRequest);
      expect(mockAvalancheAdapter.prepareTransfer).toHaveBeenCalledWith(mockRequest, mockQuote);
      expect(mockSigner.signTypedData).toHaveBeenCalledWith(
        mockSignatureData.domain,
        mockSignatureData.types,
        mockSignatureData.message
      );
      expect(mockAvalancheAdapter.executeTransfer).toHaveBeenCalledWith({
        transferData: {
          ...mockSignatureData.message,
          signature: '0xsignature123...'
        },
        signature: '0xsignature123...',
        signatureType: 'EIP712'
      });

      expect(result).toEqual({
        success: true,
        txHash: '0xabc123...',
        blockNumber: '12345',
        gasUsed: '21000',
        explorerUrl: 'https://testnet.snowtrace.io/tx/0xabc123...'
      });
    });

    it('should emit events during transfer flow', async () => {
      const eventListener = jest.fn();
      sdk.addEventListener(eventListener);

      const mockAvalancheAdapter = require('../../src/adapters/avalanche').AvalancheAdapter.mock.instances[0];
      mockAvalancheAdapter.getQuote.mockResolvedValue(mockQuote);
      mockAvalancheAdapter.prepareTransfer.mockResolvedValue(mockSignatureData);
      mockAvalancheAdapter.executeTransfer.mockResolvedValue({
        success: true,
        txHash: '0xabc123...'
      });

      await sdk.transfer(mockRequest, mockSigner);

      // Check that events were emitted
      expect(eventListener).toHaveBeenCalledTimes(4);
      
      // Check event types
      const eventTypes = eventListener.mock.calls.map(call => call[0].type);
      expect(eventTypes).toContain('transfer_initiated');
      expect(eventTypes).toContain('transfer_signed');
      expect(eventTypes).toContain('transfer_submitted');
      expect(eventTypes).toContain('transfer_confirmed');
    });

    it('should handle quote failure', async () => {
      const mockAvalancheAdapter = require('../../src/adapters/avalanche').AvalancheAdapter.mock.instances[0];
      mockAvalancheAdapter.getQuote.mockRejectedValue(
        new SmoothSendError('Insufficient balance', 'INSUFFICIENT_BALANCE', 'avalanche')
      );

      const eventListener = jest.fn();
      sdk.addEventListener(eventListener);

      await expect(sdk.transfer(mockRequest, mockSigner)).rejects.toThrow('Insufficient balance');

      // Should emit initiated and failed events
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'transfer_initiated' })
      );
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({ 
          type: 'transfer_failed',
          data: expect.objectContaining({ step: 'quote' })
        })
      );
    });

    it('should handle signature preparation failure', async () => {
      const mockAvalancheAdapter = require('../../src/adapters/avalanche').AvalancheAdapter.mock.instances[0];
      mockAvalancheAdapter.getQuote.mockResolvedValue(mockQuote);
      mockAvalancheAdapter.prepareTransfer.mockRejectedValue(
        new SmoothSendError('Nonce error', 'NONCE_ERROR', 'avalanche')
      );

      const eventListener = jest.fn();
      sdk.addEventListener(eventListener);

      await expect(sdk.transfer(mockRequest, mockSigner)).rejects.toThrow('Nonce error');

      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({ 
          type: 'transfer_failed',
          data: expect.objectContaining({ step: 'prepare' })
        })
      );
    });

    it('should handle execution failure', async () => {
      const mockAvalancheAdapter = require('../../src/adapters/avalanche').AvalancheAdapter.mock.instances[0];
      mockAvalancheAdapter.getQuote.mockResolvedValue(mockQuote);
      mockAvalancheAdapter.prepareTransfer.mockResolvedValue(mockSignatureData);
      mockAvalancheAdapter.executeTransfer.mockRejectedValue(
        new SmoothSendError('Transaction failed', 'EXECUTION_ERROR', 'avalanche')
      );

      const eventListener = jest.fn();
      sdk.addEventListener(eventListener);

      await expect(sdk.transfer(mockRequest, mockSigner)).rejects.toThrow('Transaction failed');

      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'transfer_signed' })
      );
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'transfer_submitted' })
      );
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({ 
          type: 'transfer_failed',
          data: expect.objectContaining({ step: 'execute' })
        })
      );
    });
  });

  describe('Aptos Transfer Flow', () => {
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

    const mockSignatureData = {
      domain: null,
      types: null,
      message: {
        fromAddress: mockRequest.from,
        toAddress: mockRequest.to,
        amount: mockRequest.amount,
        coinType: '0x1::aptos_coin::AptosCoin',
        maxGasAmount: '2000',
        gasUnitPrice: '100',
        expirationTimestamp: '1234567890'
      },
      primaryType: 'AptosTransfer'
    };

    const mockSigner = {
      // Mock Aptos private key
      toString: () => '0xprivatekey...'
    };

    it('should complete full Aptos transfer flow successfully', async () => {
      const mockAptosAdapter = require('../../src/adapters/aptos').AptosAdapter.mock.instances[0];
      mockAptosAdapter.getQuote.mockResolvedValue(mockQuote);
      mockAptosAdapter.prepareTransfer.mockResolvedValue(mockSignatureData);
      mockAptosAdapter.signTransaction.mockResolvedValue('0xaptossignature123...');
      mockAptosAdapter.executeTransfer.mockResolvedValue({
        success: true,
        txHash: '0xdef456...',
        blockNumber: '67890',
        gasUsed: '1500',
        explorerUrl: 'https://explorer.aptoslabs.com/?network=testnet/txn/0xdef456...'
      });

      const result = await sdk.transfer(mockRequest, mockSigner);

      expect(mockAptosAdapter.getQuote).toHaveBeenCalledWith(mockRequest);
      expect(mockAptosAdapter.prepareTransfer).toHaveBeenCalledWith(mockRequest, mockQuote);
      expect(mockAptosAdapter.signTransaction).toHaveBeenCalledWith(mockSigner, mockSignatureData.message);
      expect(mockAptosAdapter.executeTransfer).toHaveBeenCalledWith({
        transferData: {
          ...mockSignatureData.message,
          signature: '0xaptossignature123...'
        },
        signature: '0xaptossignature123...',
        signatureType: 'APTOS'
      });

      expect(result).toEqual({
        success: true,
        txHash: '0xdef456...',
        blockNumber: '67890',
        gasUsed: '1500',
        explorerUrl: 'https://explorer.aptoslabs.com/?network=testnet/txn/0xdef456...'
      });
    });

    it('should emit events during Aptos transfer flow', async () => {
      const eventListener = jest.fn();
      sdk.addEventListener(eventListener);

      const mockAptosAdapter = require('../../src/adapters/aptos').AptosAdapter.mock.instances[0];
      mockAptosAdapter.getQuote.mockResolvedValue(mockQuote);
      mockAptosAdapter.prepareTransfer.mockResolvedValue(mockSignatureData);
      mockAptosAdapter.signTransaction.mockResolvedValue('0xaptossignature123...');
      mockAptosAdapter.executeTransfer.mockResolvedValue({
        success: true,
        txHash: '0xdef456...'
      });

      await sdk.transfer(mockRequest, mockSigner);

      expect(eventListener).toHaveBeenCalledTimes(4);
      
      const eventTypes = eventListener.mock.calls.map(call => call[0].type);
      expect(eventTypes).toContain('transfer_initiated');
      expect(eventTypes).toContain('transfer_signed');
      expect(eventTypes).toContain('transfer_submitted');
      expect(eventTypes).toContain('transfer_confirmed');

      // Check that events have correct chain
      eventListener.mock.calls.forEach(call => {
        expect(call[0].chain).toBe('aptos');
      });
    });
  });

  describe('Batch Transfer Flow', () => {
    const mockBatchRequest = {
      transfers: [
        {
          from: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2',
          to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
          token: 'USDC',
          amount: '1000000',
          chain: 'avalanche' as const
        },
        {
          from: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2',
          to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d4',
          token: 'USDT',
          amount: '2000000',
          chain: 'avalanche' as const
        }
      ],
      chain: 'avalanche' as const
    };

    const mockSigner = {
      signTypedData: jest.fn().mockResolvedValue('0xsignature123...')
    };

    it('should execute batch transfers successfully', async () => {
      const mockAvalancheAdapter = require('../../src/adapters/avalanche').AvalancheAdapter.mock.instances[0];
      
      // Mock responses for each transfer
      mockAvalancheAdapter.getQuote
        .mockResolvedValueOnce({ amount: '1000000', relayerFee: '10000', total: '1010000', feePercentage: 1.0 })
        .mockResolvedValueOnce({ amount: '2000000', relayerFee: '20000', total: '2020000', feePercentage: 1.0 });
      
      mockAvalancheAdapter.prepareTransfer
        .mockResolvedValueOnce({
          domain: { name: 'SmoothSend' },
          types: { Transfer: [] },
          message: { from: mockBatchRequest.transfers[0].from, nonce: '1' },
          primaryType: 'Transfer'
        })
        .mockResolvedValueOnce({
          domain: { name: 'SmoothSend' },
          types: { Transfer: [] },
          message: { from: mockBatchRequest.transfers[1].from, nonce: '2' },
          primaryType: 'Transfer'
        });

      mockAvalancheAdapter.executeTransfer
        .mockResolvedValueOnce({ success: true, txHash: '0xabc123...' })
        .mockResolvedValueOnce({ success: true, txHash: '0xdef456...' });

      const results = await sdk.batchTransfer(mockBatchRequest, mockSigner);

      expect(results).toHaveLength(2);
      expect(results[0].txHash).toBe('0xabc123...');
      expect(results[1].txHash).toBe('0xdef456...');
      expect(mockAvalancheAdapter.getQuote).toHaveBeenCalledTimes(2);
      expect(mockAvalancheAdapter.executeTransfer).toHaveBeenCalledTimes(2);
    });

    it('should reject batch transfers for unsupported chains', async () => {
      const aptosRequest = {
        ...mockBatchRequest,
        chain: 'aptos' as const
      };

      await expect(sdk.batchTransfer(aptosRequest, mockSigner)).rejects.toThrow(
        'Batch transfers currently only supported on Avalanche'
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unsupported chain', async () => {
      const invalidRequest = {
        from: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2',
        to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
        token: 'ETH',
        amount: '1000000',
        chain: 'ethereum' as any
      };

      const mockSigner = { signTypedData: jest.fn() };

      await expect(sdk.transfer(invalidRequest, mockSigner)).rejects.toThrow(
        "Unsupported chain: ethereum"
      );
    });

    it('should handle signer errors gracefully', async () => {
      const mockRequest: TransferRequest = {
        from: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2',
        to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
        token: 'USDC',
        amount: '1000000',
        chain: 'avalanche'
      };

      const mockSigner = {
        signTypedData: jest.fn().mockRejectedValue(new Error('User rejected signature'))
      };

      const mockAvalancheAdapter = require('../../src/adapters/avalanche').AvalancheAdapter.mock.instances[0];
      mockAvalancheAdapter.getQuote.mockResolvedValue({ amount: '1000000', relayerFee: '10000', total: '1010000', feePercentage: 1.0 });
      mockAvalancheAdapter.prepareTransfer.mockResolvedValue({
        domain: { name: 'SmoothSend' },
        types: { Transfer: [] },
        message: { from: mockRequest.from },
        primaryType: 'Transfer'
      });

      await expect(sdk.transfer(mockRequest, mockSigner)).rejects.toThrow('User rejected signature');
    });
  });
});
