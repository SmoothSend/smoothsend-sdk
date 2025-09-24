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
   */
  private getApiPath(endpoint: string): string {
    return `/${this.chain}${endpoint}`;
  }

  async getQuote(request: TransferRequest): Promise<TransferQuote> {
    try {
      const response = await this.httpClient.post(this.getApiPath('/quote'), {
        from: request.from,
        to: request.to,
        tokenSymbol: request.token,
        amount: request.amount
      });

      return {
        amount: request.amount,
        relayerFee: response.data.relayerFee,
        total: (BigInt(request.amount) + BigInt(response.data.relayerFee)).toString(),
        feePercentage: response.data.feePercentage || 0,
        contractAddress: response.data.contractAddress || this.config.relayerUrl
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

      const response = await this.httpClient.post(this.getApiPath('/prepare-signature'), {
        from: request.from,
        to: request.to,
        tokenSymbol: request.token,
        amount: request.amount,
        relayerFee: quote.relayerFee,
        nonce,
        deadline
      });

      return {
        domain: response.data.typedData.domain,
        types: response.data.typedData.types,
        message: response.data.typedData.message,
        primaryType: response.data.typedData.primaryType
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
      const response = await this.httpClient.post(this.getApiPath('/transfer'), signedData.transferData);

      return {
        success: response.data.success || true,
        txHash: response.data.txHash,
        blockNumber: response.data.blockNumber,
        gasUsed: response.data.gasUsed,
        transferId: response.data.transferId,
        explorerUrl: response.data.explorerUrl,
        fee: response.data.fee,
        executionTime: response.data.executionTime
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
      const response = await this.httpClient.post(this.getApiPath('/batch-transfer'), {
        transfers: signedTransfers.map(transfer => transfer.transferData)
      });

      return response.data.results || [];
    } catch (error) {
      throw new SmoothSendError(
        `Failed to execute EVM batch transfer: ${error instanceof Error ? error.message : String(error)}`,
        'EVM_BATCH_ERROR',
        this.chain
      );
    }
  }

  async getBalance(address: string, token?: string): Promise<TokenBalance[]> {
    try {
      const response = await this.httpClient.get(this.getApiPath(`/balance/${address}`));
      
      return [{
        token: token || 'USDC',
        balance: response.data.balance?.toString() || '0',
        decimals: response.data.decimals || 6,
        symbol: response.data.symbol || token || 'USDC',
        name: response.data.name
      }];
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get EVM balance: ${error instanceof Error ? error.message : String(error)}`,
        'EVM_BALANCE_ERROR',
        this.chain
      );
    }
  }

  async getTokenInfo(token: string): Promise<TokenInfo> {
    try {
      const response = await this.httpClient.get(this.getApiPath('/tokens'));
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
      return response.data.supportsPermit || false;
    } catch (error) {
      // If endpoint doesn't exist, assume no permit support
      return false;
    }
  }
}
