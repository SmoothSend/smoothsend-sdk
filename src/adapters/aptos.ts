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
 * Aptos Multi-Chain Adapter
 * Handles all Aptos chains (aptos-testnet, aptos-mainnet)
 * Routes requests to the appropriate chain endpoint on the Aptos relayer
 * Supports Aptos-specific features like gasless transactions and Move-based contracts
 */
export class AptosAdapter implements IChainAdapter {
  public readonly chain: SupportedChain;
  public readonly config: ChainConfig;
  private httpClient: HttpClient;

  constructor(chain: SupportedChain, config: ChainConfig, relayerUrl: string) {
    // Validate this is an Aptos chain
    if (CHAIN_ECOSYSTEM_MAP[chain] !== 'aptos') {
      throw new SmoothSendError(
        `AptosAdapter can only handle Aptos chains, got: ${chain}`,
        'INVALID_CHAIN_FOR_ADAPTER',
        chain
      );
    }

    this.chain = chain;
    this.config = config;
    this.httpClient = new HttpClient(relayerUrl, 30000);
  }

  /**
   * Build API path with chain name for Aptos relayer
   */
  private getApiPath(endpoint: string): string {
    return `/${this.chain}${endpoint}`;
  }

  async getQuote(request: TransferRequest): Promise<TransferQuote> {
    try {
      const response = await this.httpClient.post(this.getApiPath('/gasless/quote'), {
        fromAddress: request.from,
        toAddress: request.to,
        amount: request.amount,
        coinType: this.getAptosTokenAddress(request.token)
      });

      const quote = response.data.quote;
      return {
        amount: request.amount,
        relayerFee: quote.relayerFee,
        total: (BigInt(request.amount) + BigInt(quote.relayerFee)).toString(),
        feePercentage: 0, // Aptos uses different fee structure
        contractAddress: response.data.transactionData.function.split('::')[0],
        // Store Aptos-specific data for later use
        aptosTransactionData: response.data.transactionData
      };
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get Aptos quote: ${error instanceof Error ? error.message : String(error)}`,
        'APTOS_QUOTE_ERROR',
        this.chain
      );
    }
  }

  async prepareTransfer(request: TransferRequest, quote: TransferQuote): Promise<SignatureData> {
    // For Aptos, the transaction data is provided in the quote response
    // The user will sign this transaction directly in their wallet
    const aptosQuote = quote as any;
    
    if (!aptosQuote.aptosTransactionData) {
      throw new SmoothSendError(
        'Missing Aptos transaction data from quote',
        'APTOS_MISSING_TRANSACTION_DATA',
        this.chain
      );
    }

    // Return the transaction data that needs to be signed
    // This is different from EVM's EIP-712 typed data
    return {
      domain: null, // Aptos doesn't use domain separation like EVM
      types: null,
      message: aptosQuote.aptosTransactionData,
      primaryType: 'AptosTransaction'
    };
  }

  async executeTransfer(signedData: SignedTransferData): Promise<TransferResult> {
    try {
      const response = await this.httpClient.post(this.getApiPath('/gasless/submit'), {
        transaction: signedData.transferData.transaction,
        userSignature: {
          signature: signedData.signature,
          publicKey: signedData.transferData.publicKey
        },
        fromAddress: signedData.transferData.fromAddress,
        toAddress: signedData.transferData.toAddress,
        amount: signedData.transferData.amount,
        coinType: signedData.transferData.coinType,
        relayerFee: signedData.transferData.relayerFee
      });

      return {
        success: response.data.success || true,
        txHash: response.data.hash,
        transferId: response.data.transactionId,
        explorerUrl: this.buildAptosExplorerUrl(response.data.hash),
        // Aptos-specific fields
        gasFeePaidBy: 'relayer',
        userPaidAPT: false
      };
    } catch (error) {
      throw new SmoothSendError(
        `Failed to execute Aptos transfer: ${error instanceof Error ? error.message : String(error)}`,
        'APTOS_EXECUTE_ERROR',
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
        `Failed to get Aptos balance: ${error instanceof Error ? error.message : String(error)}`,
        'APTOS_BALANCE_ERROR',
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
        `Failed to get Aptos token info: ${error instanceof Error ? error.message : String(error)}`,
        'APTOS_TOKEN_INFO_ERROR',
        this.chain
      );
    }
  }

  async getNonce(address: string): Promise<string> {
    // Aptos uses sequence numbers instead of nonces
    // For compatibility, we return a timestamp-based value
    // The actual sequence number is managed by the Aptos blockchain
    return Date.now().toString();
  }

  async getTransactionStatus(txHash: string): Promise<any> {
    try {
      const response = await this.httpClient.get(this.getApiPath(`/status/${txHash}`));
      return response.data;
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get Aptos transaction status: ${error instanceof Error ? error.message : String(error)}`,
        'APTOS_STATUS_ERROR',
        this.chain
      );
    }
  }

  validateAddress(address: string): boolean {
    // Aptos address validation (0x prefix, up to 64 hex characters)
    return /^0x[a-fA-F0-9]{1,64}$/.test(address);
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
   * Aptos-specific gasless transaction with wallet integration
   * This method provides full transparency to the user about what they're signing
   */
  async executeGaslessWithWallet(signedData: SignedTransferData): Promise<TransferResult> {
    try {
      const response = await this.httpClient.post(this.getApiPath('/gasless-with-wallet'), {
        userSignature: {
          signature: signedData.signature,
          publicKey: signedData.transferData.publicKey
        },
        fromAddress: signedData.transferData.fromAddress,
        toAddress: signedData.transferData.toAddress,
        amount: signedData.transferData.amount,
        coinType: signedData.transferData.coinType,
        relayerFee: signedData.transferData.relayerFee
      });

      return {
        success: response.data.success || true,
        txHash: response.data.hash,
        transferId: response.data.transactionId,
        explorerUrl: this.buildAptosExplorerUrl(response.data.hash),
        gasFeePaidBy: 'relayer',
        userPaidAPT: false,
        transparency: 'User saw full transaction details in wallet'
      };
    } catch (error) {
      throw new SmoothSendError(
        `Failed to execute gasless wallet transaction: ${error instanceof Error ? error.message : String(error)}`,
        'APTOS_GASLESS_WALLET_ERROR',
        this.chain
      );
    }
  }

  /**
   * Get Aptos safety statistics (beta limits)
   */
  async getSafetyStats(): Promise<any> {
    try {
      const response = await this.httpClient.get(this.getApiPath('/safety-stats'));
      return response.data;
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get safety stats: ${error instanceof Error ? error.message : String(error)}`,
        'APTOS_SAFETY_STATS_ERROR',
        this.chain
      );
    }
  }

  /**
   * Get Aptos token address from symbol
   */
  private getAptosTokenAddress(tokenSymbol: string): string {
    // This would typically come from the chain configuration
    if (tokenSymbol.toUpperCase() === 'USDC') {
      if (this.chain === 'aptos-testnet') {
        return '0x3c27315fb69ba6e4b960f1507d1cefcc9a4247869f26a8d59d6b7869d23782c::test_coins::USDC';
      }
    }
    
    throw new SmoothSendError(
      `Unsupported token: ${tokenSymbol} on ${this.chain}`,
      'APTOS_UNSUPPORTED_TOKEN',
      this.chain
    );
  }

  /**
   * Build Aptos explorer URL for transaction
   */
  private buildAptosExplorerUrl(txHash: string): string {
    if (this.chain === 'aptos-testnet') {
      return `https://explorer.aptoslabs.com/txn/${txHash}?network=testnet`;
    }
    
    return `https://explorer.aptoslabs.com/txn/${txHash}`;
  }

  /**
   * Aptos-specific Move contract interaction
   */
  async callMoveFunction(functionName: string, args: any[]): Promise<any> {
    try {
      const response = await this.httpClient.post(this.getApiPath('/move/call'), {
        function: functionName,
        arguments: args
      });
      return response.data;
    } catch (error) {
      throw new SmoothSendError(
        `Failed to call Move function: ${error instanceof Error ? error.message : String(error)}`,
        'APTOS_MOVE_CALL_ERROR',
        this.chain
      );
    }
  }
}
