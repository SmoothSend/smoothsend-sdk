import { ethers, isAddress } from 'ethers';
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
  private chainName = 'avalanche-fuji'; // Fixed testnet name

  constructor(public readonly config: ChainConfig) {
    this.httpClient = new HttpClient(config.relayerUrl);
  }

  async getQuote(request: TransferRequest): Promise<TransferQuote> {
    try {
      const response = await this.httpClient.post('/quote', {
        chainName: this.chainName,
        token: request.token, // Quote endpoint expects 'token' field
        amount: request.amount
      });

      if (!response.success || !response.data) {
        throw new SmoothSendError(
          response.error || 'Failed to get quote',
          'QUOTE_ERROR',
          this.chain
        );
      }

      const data = response.data;
      return {
        amount: data.amount,
        relayerFee: data.relayerFee, // Response uses 'relayerFee' field
        total: data.total,
        feePercentage: data.feePercentage || 0,
        estimatedGas: undefined, // Not provided by this relayer
        deadline: undefined,
        nonce: undefined
      };
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Quote request failed: ${error instanceof Error ? error.message : String(error)}`,
        'QUOTE_ERROR',
        this.chain
      );
    }
  }

  async prepareTransfer(request: TransferRequest, quote: TransferQuote): Promise<SignatureData> {
    try {
      // Get user nonce
      const nonceResponse = await this.httpClient.get('/nonce', {
        params: {
          chainName: this.chainName,
          userAddress: request.from
        }
      });

      if (!nonceResponse.success) {
        throw new SmoothSendError(
          nonceResponse.error || 'Failed to get user nonce',
          'NONCE_ERROR',
          this.chain
        );
      }

      const nonce = nonceResponse.data.nonce;
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      // Prepare signature data
      const signatureResponse = await this.httpClient.post('/prepare-signature', {
        chainName: this.chainName,
        from: request.from,
        to: request.to,
        tokenSymbol: request.token, // Relayer expects tokenSymbol for prepare-signature
        amount: request.amount,
        relayerFee: quote.relayerFee,
        nonce,
        deadline
      });

      if (!signatureResponse.success) {
        throw new SmoothSendError(
          signatureResponse.error || 'Failed to prepare signature data',
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
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Prepare transfer failed: ${error instanceof Error ? error.message : String(error)}`,
        'SIGNATURE_PREP_ERROR',
        this.chain
      );
    }
  }

  async executeTransfer(signedData: SignedTransferData): Promise<TransferResult> {
    try {
      // Structure payload according to relayer API specification
      const transferData = signedData.transferData as AvalancheTransferData;
      const payload = {
        chainName: transferData.chainName,
        from: transferData.from,
        to: transferData.to,
        tokenSymbol: transferData.tokenSymbol,
        amount: transferData.amount,
        relayerFee: transferData.relayerFee,
        nonce: transferData.nonce,
        deadline: transferData.deadline,
        signature: signedData.signature,
        ...(transferData.permitData && { permitData: transferData.permitData })
      };

      const response = await this.httpClient.post('/relay-transfer', payload);

      if (!response.success || !response.data) {
        throw new SmoothSendError(
          response.error || 'Transfer execution failed',
          'EXECUTION_ERROR',
          this.chain
        );
      }

      const data = response.data;
      const txHash = data.txHash || data.transactionHash;
      
      return {
        success: true,
        txHash,
        blockNumber: data.blockNumber,
        gasUsed: data.gasUsed,
        transferId: data.transferId || data.transactionId,
        explorerUrl: data.explorerUrl || `${this.config.explorerUrl}/tx/${txHash}`
      };
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Transfer execution failed: ${error instanceof Error ? error.message : String(error)}`,
        'EXECUTION_ERROR',
        this.chain
      );
    }
  }

  async getBalance(address: string, token?: string): Promise<TokenBalance[]> {
    if (!this.validateAddress(address)) {
      throw new SmoothSendError('Invalid address format', 'INVALID_ADDRESS', this.chain);
    }

    try {
      const balances: TokenBalance[] = [];
      
      // Use dynamic config tokens if available
      const dynamicConfig = this.config as any;
      const availableTokens = dynamicConfig.tokens || ['USDC'];
      const tokensToCheck = token ? [token] : availableTokens;
      
      for (const tokenSymbol of tokensToCheck) {
        // Note: Real balance queries would require token contract calls
        // This returns available tokens from dynamic config with placeholder balances
        balances.push({
          token: tokenSymbol,
          balance: '0',
          decimals: tokenSymbol === 'USDC' ? 6 : 18,
          symbol: tokenSymbol
        });
      }

      return balances;
    } catch (error) {
      throw new SmoothSendError(
        `Balance query failed: ${error instanceof Error ? error.message : String(error)}`,
        'BALANCE_ERROR',
        this.chain
      );
    }
  }

  async getTokenInfo(token: string): Promise<TokenInfo> {
    try {
      const chainsResponse = await this.httpClient.get('/chains');
      
      if (!chainsResponse.success) {
        throw new SmoothSendError('Failed to get token info', 'TOKEN_INFO_ERROR', this.chain);
      }

      // Get token decimals based on known tokens
      let decimals = 18; // Default
      let tokenAddress = token;
      
      if (token.toLowerCase() === 'usdc') {
        decimals = 6;
        tokenAddress = '0x5425890298aed601595a70AB815c96711a31Bc65'; // Fuji USDC
      } else if (token.toLowerCase() === 'avax') {
        decimals = 18;
        tokenAddress = '0x0000000000000000000000000000000000000000'; // Native AVAX
      }

      return {
        address: tokenAddress,
        symbol: token.toUpperCase(),
        name: token.toUpperCase(),
        decimals
      };
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Token info query failed: ${error instanceof Error ? error.message : String(error)}`,
        'TOKEN_INFO_ERROR',
        this.chain
      );
    }
  }

  async getNonce(address: string): Promise<string> {
    try {
      const response = await this.httpClient.get('/nonce', {
        params: {
          chainName: this.chainName,
          userAddress: address
        }
      });

      if (!response.success) {
        throw new SmoothSendError(
          response.error || 'Failed to get nonce',
          'NONCE_ERROR',
          this.chain
        );
      }

      return response.data.nonce;
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Nonce query failed: ${error instanceof Error ? error.message : String(error)}`,
        'NONCE_ERROR',
        this.chain
      );
    }
  }

  async getTransactionStatus(txHash: string): Promise<any> {
    try {
      const response = await this.httpClient.get('/transfer-status', {
        params: {
          chainName: this.chainName,
          transferHash: txHash
        }
      });

      if (!response.success) {
        throw new SmoothSendError(
          response.error || 'Failed to get transaction status',
          'STATUS_ERROR',
          this.chain
        );
      }

      return response.data;
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Status query failed: ${error instanceof Error ? error.message : String(error)}`,
        'STATUS_ERROR',
        this.chain
      );
    }
  }

  validateAddress(address: string): boolean {
    try {
      return isAddress(address);
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

  // Batch transfer support (Avalanche-specific feature)
  async executeBatchTransfer(signedTransfers: SignedTransferData[]): Promise<TransferResult[]> {
    try {
      const transfersPayload = signedTransfers.map(signedData => {
        const transferData = signedData.transferData as AvalancheTransferData;
        return {
          chainName: transferData.chainName,
          from: transferData.from,
          to: transferData.to,
          tokenSymbol: transferData.tokenSymbol,
          amount: transferData.amount,
          relayerFee: transferData.relayerFee,
          nonce: transferData.nonce,
          deadline: transferData.deadline,
          signature: signedData.signature,
          ...(transferData.permitData && { permitData: transferData.permitData })
        };
      });

      const response = await this.httpClient.post('/relay-batch-transfer', {
        chainName: this.chainName,
        transfers: transfersPayload
      });

      if (!response.success || !response.data) {
        throw new SmoothSendError(
          response.error || 'Batch transfer execution failed',
          'BATCH_EXECUTION_ERROR',
          this.chain
        );
      }

      const data = response.data;
      const results: TransferResult[] = [];

      // Handle both single result and array of results
      const transferResults = Array.isArray(data.results) ? data.results : 
                             Array.isArray(data) ? data : [data];
      
      for (const result of transferResults) {
        const txHash = result.txHash || result.transactionHash;
        results.push({
          success: true,
          txHash,
          blockNumber: result.blockNumber,
          gasUsed: result.gasUsed,
          transferId: result.transferId || result.transactionId,
          explorerUrl: result.explorerUrl || `${this.config.explorerUrl}/tx/${txHash}`
        });
      }

      return results;
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Batch transfer execution failed: ${error instanceof Error ? error.message : String(error)}`,
        'BATCH_EXECUTION_ERROR',
        this.chain
      );
    }
  }

  // Helper to get supported chains from relayer
  async getSupportedChains(): Promise<any[]> {
    try {
      const response = await this.httpClient.get('/chains');
      
      if (!response.success) {
        throw new SmoothSendError(
          response.error || 'Failed to get supported chains',
          'CHAINS_ERROR',
          this.chain
        );
      }

      return response.data?.chains || [];
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Chains query failed: ${error instanceof Error ? error.message : String(error)}`,
        'CHAINS_ERROR',
        this.chain
      );
    }
  }
}

