import {
  SupportedChain,
  IChainAdapter,
  ChainConfig,
  TransferRequest,
  TransferQuote,
  SignatureData,
  SignedTransferData,
  TransferResult,
  TokenBalance,
  TokenInfo,
  SmoothSendError,
  CHAIN_ECOSYSTEM_MAP
} from '../types';
import { HttpClient } from '../utils/http';

/**
 * EVM Multi-Chain Adapter
 * Handles all EVM-compatible chains (Avalanche, Polygon, Ethereum, Arbitrum, Base)
 * Routes requests to the appropriate chain endpoint on the EVM relayer
 */
export class EVMAdapter implements IChainAdapter {
  public readonly chain: SupportedChain;
  public readonly config: ChainConfig;
  private httpClient: HttpClient;

  constructor(chain: SupportedChain, config: ChainConfig, relayerUrl: string) {
    // Validate this is an EVM chain
    if (CHAIN_ECOSYSTEM_MAP[chain] !== 'evm') {
      throw new SmoothSendError(
        `EVMAdapter can only handle EVM chains, got: ${chain}`,
        'INVALID_CHAIN_FOR_ADAPTER',
        chain
      );
    }

    this.chain = chain;
    this.config = config;
    this.httpClient = new HttpClient(relayerUrl, 30000);
  }

  /**
   * Build API path with chain name for EVM relayer
   * EVM relayer uses /chains/{chainName} prefix for most endpoints
   */
  private getApiPath(endpoint: string): string {
    // Some endpoints don't use chain prefix
    const noChainPrefixEndpoints = ['/nonce', '/health', '/chains'];
    if (noChainPrefixEndpoints.some(prefix => endpoint.startsWith(prefix))) {
      return endpoint;
    }
    return `/chains/${this.chain}${endpoint}`;
  }

  async getQuote(request: TransferRequest): Promise<TransferQuote> {
    try {
      const response = await this.httpClient.post('/quote', {
        chainName: this.chain === 'avalanche' ? 'avalanche-fuji' : this.chain,
        from: request.from,
        to: request.to,
        tokenSymbol: request.token,
        amount: request.amount
      });

      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }

      const quoteData = response.data;
      return {
        amount: request.amount,
        relayerFee: quoteData.relayerFee,
        total: (BigInt(request.amount) + BigInt(quoteData.relayerFee)).toString(),
        feePercentage: quoteData.feePercentage || 0,
        contractAddress: quoteData.contractAddress || this.config.relayerUrl
      };
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get EVM quote: ${error instanceof Error ? error.message : String(error)}`,
        'EVM_QUOTE_ERROR',
        this.chain
      );
    }
  }

  async prepareTransfer(request: TransferRequest, quote: TransferQuote): Promise<SignatureData> {
    try {
      // Get user nonce first
      const nonce = await this.getNonce(request.from);
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      const response = await this.httpClient.post('/prepare-signature', {
        chainName: this.chain === 'avalanche' ? 'avalanche-fuji' : this.chain,
        from: request.from,
        to: request.to,
        tokenSymbol: request.token,
        amount: request.amount,
        relayerFee: quote.relayerFee,
        nonce,
        deadline
      });

      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }

      const signatureData = response.data;
      return {
        domain: signatureData.typedData.domain,
        types: signatureData.typedData.types,
        message: signatureData.typedData.message,
        primaryType: signatureData.typedData.primaryType
      };
    } catch (error) {
      throw new SmoothSendError(
        `Failed to prepare EVM transfer: ${error instanceof Error ? error.message : String(error)}`,
        'EVM_PREPARE_ERROR',
        this.chain
      );
    }
  }

  async executeTransfer(signedData: SignedTransferData): Promise<TransferResult> {
    try {
      const response = await this.httpClient.post('/relay-transfer', signedData.transferData);

      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }

      const transferData = response.data;
      return {
        success: transferData.success || true,
        txHash: transferData.txHash,
        blockNumber: transferData.blockNumber,
        gasUsed: transferData.gasUsed,
        transferId: transferData.transferId,
        explorerUrl: transferData.explorerUrl,
        fee: transferData.fee,
        executionTime: transferData.executionTime
      };
    } catch (error) {
      throw new SmoothSendError(
        `Failed to execute EVM transfer: ${error instanceof Error ? error.message : String(error)}`,
        'EVM_EXECUTE_ERROR',
        this.chain
      );
    }
  }

  /**
   * EVM-specific batch transfer support
   * Takes advantage of the EVM relayer's native batch capabilities
   */
  async executeBatchTransfer?(signedTransfers: SignedTransferData[]): Promise<TransferResult[]> {
    try {
      const response = await this.httpClient.post('/relay-batch-transfer', {
        transfers: signedTransfers.map(transfer => transfer.transferData)
      });

      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }

      return response.data.results || [];
    } catch (error) {
      throw new SmoothSendError(
        `Failed to execute EVM batch transfer: ${error instanceof Error ? error.message : String(error)}`,
        'EVM_BATCH_ERROR',
        this.chain
      );
    }
  }


  async getTokenInfo(token: string): Promise<TokenInfo> {
    try {
      const response = await this.httpClient.get(this.getApiPath('/tokens'));
      
      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }

      const tokens = response.data.tokens || {};
      const tokenInfo = tokens[token.toUpperCase()];
      
      if (!tokenInfo) {
        throw new Error(`Token ${token} not supported on ${this.chain}`);
      }
      
      return {
        symbol: tokenInfo.symbol,
        address: tokenInfo.address,
        decimals: tokenInfo.decimals,
        name: tokenInfo.name
      };
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get EVM token info: ${error instanceof Error ? error.message : String(error)}`,
        'EVM_TOKEN_INFO_ERROR',
        this.chain
      );
    }
  }

  async getNonce(address: string): Promise<string> {
    try {
      const response = await this.httpClient.get('/nonce', {
        params: {
          chainName: this.chain,
          userAddress: address
        }
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }

      return response.data.nonce?.toString() || '0';
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get EVM nonce: ${error instanceof Error ? error.message : String(error)}`,
        'EVM_NONCE_ERROR',
        this.chain
      );
    }
  }

  async getTransactionStatus(txHash: string): Promise<any> {
    try {
      const response = await this.httpClient.get(this.getApiPath(`/status/${txHash}`));
      
      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }

      return response.data;
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get EVM transaction status: ${error instanceof Error ? error.message : String(error)}`,
        'EVM_STATUS_ERROR',
        this.chain
      );
    }
  }

  validateAddress(address: string): boolean {
    // EVM address validation (0x prefix, 40 hex characters)
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  async validateAmount(amount: string, token: string): Promise<boolean> {
    try {
      const amountBN = BigInt(amount);
      return amountBN > 0n;
    } catch {
      return false;
    }
  }

  /**
   * EVM-specific gas estimation
   */
  async estimateGas(transfers: any[]): Promise<any> {
    try {
      const response = await this.httpClient.post(this.getApiPath('/estimate-gas'), {
        transfers
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }

      return response.data;
    } catch (error) {
      throw new SmoothSendError(
        `Failed to estimate EVM gas: ${error instanceof Error ? error.message : String(error)}`,
        'EVM_GAS_ESTIMATE_ERROR',
        this.chain
      );
    }
  }

  /**
   * EVM-specific permit support check
   */
  async supportsPermit(tokenAddress: string): Promise<boolean> {
    try {
      const response = await this.httpClient.get(this.getApiPath(`/permit-support/${tokenAddress}`));
      
      if (!response.success) {
        return false; // If endpoint fails, assume no permit support
      }

      return response.data.supportsPermit || false;
    } catch (error) {
      // If endpoint doesn't exist, assume no permit support
      return false;
    }
  }
}
