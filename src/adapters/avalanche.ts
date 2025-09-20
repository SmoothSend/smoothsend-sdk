import { ethers } from 'ethers';
import {
  IChainAdapter,
  SupportedChain,
  ChainConfig,
  TransferRequest,
  TransferQuote,
  SignatureData,
  SignedTransferData,
  TransferResult,
  TokenBalance,
  TokenInfo,
  SmoothSendError,
  AvalancheTransferData
} from '../types';
import { HttpClient } from '../utils/http';

export class AvalancheAdapter implements IChainAdapter {
  public readonly chain: SupportedChain = 'avalanche';
  private httpClient: HttpClient;

  constructor(public readonly config: ChainConfig) {
    this.httpClient = new HttpClient(config.relayerUrl);
  }

  async getQuote(request: TransferRequest): Promise<TransferQuote> {
    const response = await this.httpClient.post('/quote', {
      chainName: 'fuji', // or 'avalanche' based on mainnet/testnet
      token: request.token,
      amount: request.amount
    });

    if (!response.success || !response.data) {
      throw new SmoothSendError(
        response.error || 'Failed to get quote',
        'QUOTE_ERROR',
        this.chain,
        response.details
      );
    }

    const data = response.data;
    return {
      amount: data.amount,
      relayerFee: data.relayerFee,
      total: data.total,
      feePercentage: data.feePercentage,
    };
  }

  async prepareTransfer(request: TransferRequest, quote: TransferQuote): Promise<SignatureData> {
    // Get user nonce
    const nonceResponse = await this.httpClient.get('/nonce', {
      params: {
        chainName: 'fuji',
        userAddress: request.from
      }
    });

    if (!nonceResponse.success) {
      throw new SmoothSendError(
        'Failed to get user nonce',
        'NONCE_ERROR',
        this.chain
      );
    }

    const nonce = nonceResponse.data.nonce;
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    // Prepare signature data
    const signatureResponse = await this.httpClient.post('/prepare-signature', {
      chainName: 'fuji',
      from: request.from,
      to: request.to,
      tokenSymbol: request.token,
      amount: request.amount,
      relayerFee: quote.relayerFee,
      nonce,
      deadline
    });

    if (!signatureResponse.success) {
      throw new SmoothSendError(
        'Failed to prepare signature data',
        'SIGNATURE_PREP_ERROR',
        this.chain
      );
    }

    return {
      domain: signatureResponse.data.domain,
      types: signatureResponse.data.types,
      message: signatureResponse.data.message,
      primaryType: signatureResponse.data.primaryType
    };
  }

  async executeTransfer(signedData: SignedTransferData): Promise<TransferResult> {
    const response = await this.httpClient.post('/relay-transfer', signedData.transferData);

    if (!response.success || !response.data) {
      throw new SmoothSendError(
        response.error || 'Transfer execution failed',
        'EXECUTION_ERROR',
        this.chain,
        response.details
      );
    }

    const data = response.data;
    return {
      success: true,
      txHash: data.txHash,
      blockNumber: data.blockNumber,
      gasUsed: data.gasUsed,
      transferId: data.transferId,
      explorerUrl: `${this.config.explorerUrl}/tx/${data.txHash}`
    };
  }

  async getBalance(address: string, token?: string): Promise<TokenBalance[]> {
    if (!this.validateAddress(address)) {
      throw new SmoothSendError('Invalid address format', 'INVALID_ADDRESS', this.chain);
    }

    // For Avalanche, we'll need to query token balances
    // This would typically involve calling the token contracts or using a service
    // For now, return a placeholder implementation
    const balances: TokenBalance[] = [];
    
    if (token) {
      // Get specific token balance
      // Implementation would depend on having token contract ABIs
      balances.push({
        token,
        balance: '0', // Placeholder
        decimals: 18,
        symbol: token
      });
    } else {
      // Get all token balances
      const chainsResponse = await this.httpClient.get('/chains');
      if (chainsResponse.success && chainsResponse.data?.chains) {
        for (const chain of chainsResponse.data.chains) {
          if (chain.tokens) {
            for (const tokenSymbol of chain.tokens) {
              balances.push({
                token: tokenSymbol,
                balance: '0', // Would need actual balance query
                decimals: 18, // Would need actual token info
                symbol: tokenSymbol
              });
            }
          }
        }
      }
    }

    return balances;
  }

  async getTokenInfo(token: string): Promise<TokenInfo> {
    const chainsResponse = await this.httpClient.get('/chains');
    
    if (!chainsResponse.success) {
      throw new SmoothSendError('Failed to get token info', 'TOKEN_INFO_ERROR', this.chain);
    }

    // Find token in supported tokens list
    // This is a simplified implementation - in practice you'd query token contracts
    return {
      address: token,
      symbol: token,
      name: token,
      decimals: 18 // Default, would need to query actual contract
    };
  }

  async getNonce(address: string): Promise<string> {
    const response = await this.httpClient.get('/nonce', {
      params: {
        chainName: 'fuji',
        userAddress: address
      }
    });

    if (!response.success) {
      throw new SmoothSendError('Failed to get nonce', 'NONCE_ERROR', this.chain);
    }

    return response.data.nonce;
  }

  async getTransactionStatus(txHash: string): Promise<any> {
    const response = await this.httpClient.get('/transfer-status', {
      params: {
        chainName: 'fuji',
        transferHash: txHash
      }
    });

    if (!response.success) {
      throw new SmoothSendError('Failed to get transaction status', 'STATUS_ERROR', this.chain);
    }

    return response.data;
  }

  validateAddress(address: string): boolean {
    try {
      return ethers.isAddress(address);
    } catch {
      return false;
    }
  }

  async validateAmount(amount: string, token: string): Promise<boolean> {
    try {
      const amountBN = BigInt(amount);
      return amountBN > 0n;
    } catch {
      return false;
    }
  }

  // Helper method to create EIP-712 signature
  async signEIP712(
    signer: ethers.Signer,
    domain: any,
    types: any,
    message: any
  ): Promise<string> {
    try {
      return await signer.signTypedData(domain, types, message);
    } catch (error) {
      throw new SmoothSendError(
        'Failed to sign EIP-712 message',
        'SIGNATURE_ERROR',
        this.chain,
        error
      );
    }
  }

  // Helper to get supported chains from relayer
  async getSupportedChains(): Promise<any[]> {
    const response = await this.httpClient.get('/chains');
    
    if (!response.success) {
      throw new SmoothSendError('Failed to get supported chains', 'CHAINS_ERROR', this.chain);
    }

    return response.data?.chains || [];
  }
}

