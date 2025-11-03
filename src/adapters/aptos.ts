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
  FeeEstimate,
  HealthResponse,
  SmoothSendError,
  CHAIN_ECOSYSTEM_MAP,
  APTOS_ERROR_CODES,
  UsageMetadata
} from '../types';
import { HttpClient } from '../utils/http';

/**
 * Aptos Multi-Chain Adapter - v2 Proxy Architecture
 * Handles all Aptos chains (aptos-testnet, aptos-mainnet)
 * Routes all requests through proxy.smoothsend.xyz with API key authentication
 * Supports Aptos-specific features like gasless transactions and Move-based contracts
 */
export class AptosAdapter implements IChainAdapter {
  public readonly chain: SupportedChain;
  public readonly config: ChainConfig;
  private httpClient: HttpClient;
  private apiKey: string;
  private network: 'testnet' | 'mainnet';

  constructor(
    chain: SupportedChain,
    config: ChainConfig,
    apiKey: string,
    network: 'testnet' | 'mainnet' = 'testnet'
  ) {
    // Validate this is an Aptos chain
    if (CHAIN_ECOSYSTEM_MAP[chain] !== 'aptos') {
      throw new SmoothSendError(
        `AptosAdapter can only handle Aptos chains, got: ${chain}`,
        'INVALID_CHAIN_FOR_ADAPTER',
        400,
        { chain }
      );
    }

    this.chain = chain;
    this.config = config;
    this.apiKey = apiKey;
    this.network = network;

    // Initialize HTTP client with proxy configuration
    this.httpClient = new HttpClient({
      apiKey: this.apiKey,
      network: this.network,
      timeout: 30000,
      retries: 3
    });
  }

  /**
   * Build API path for proxy worker routing to Aptos relayer
   * All requests route through /api/v1/relayer/aptos/* endpoints
   */
  private getApiPath(endpoint: string): string {
    return `/api/v1/relayer/aptos${endpoint}`;
  }

  /**
   * Update network parameter for subsequent requests
   * Network is passed via X-Network header to proxy worker
   */
  setNetwork(network: 'testnet' | 'mainnet'): void {
    this.network = network;
    this.httpClient.setNetwork(network);
  }

  /**
   * Get current network
   */
  getNetwork(): 'testnet' | 'mainnet' {
    return this.network;
  }

  /**
   * Estimate fee for a transfer (v2 interface method)
   * Routes through proxy: POST /api/v1/relayer/aptos/quote
   */
  async estimateFee(request: TransferRequest): Promise<FeeEstimate> {
    try {
      const response = await this.httpClient.post(this.getApiPath('/quote'), {
        fromAddress: request.from,
        toAddress: request.to,
        amount: request.amount,
        coinType: this.getAptosTokenAddress(request.token)
      });

      const responseData = response.data;
      const quote = responseData.quote;

      const feeEstimate: FeeEstimate & { metadata?: UsageMetadata } = {
        relayerFee: quote.relayerFee,
        feeInUSD: quote.feeInUSD || '0',
        coinType: this.getAptosTokenAddress(request.token),
        estimatedGas: quote.estimatedGas || '0',
        network: this.network
      };

      // Attach usage metadata from proxy response headers
      if (response.metadata) {
        (feeEstimate as any).metadata = response.metadata;
      }

      return feeEstimate;
    } catch (error) {
      if (error instanceof SmoothSendError) {
        throw error;
      }
      throw new SmoothSendError(
        `Failed to estimate Aptos fee: ${error instanceof Error ? error.message : String(error)}`,
        APTOS_ERROR_CODES.QUOTE_ERROR,
        500,
        { chain: this.chain }
      );
    }
  }

  /**
   * Execute gasless transfer (v2 interface method)
   * Routes through proxy: POST /api/v1/relayer/aptos/execute
   */
  async executeGaslessTransfer(signedData: SignedTransferData): Promise<TransferResult> {
    return this.executeTransfer(signedData);
  }

  /**
   * Get quote for a transfer (legacy method, kept for backward compatibility)
   * Routes through proxy: POST /api/v1/relayer/aptos/quote
   */
  async getQuote(request: TransferRequest): Promise<TransferQuote> {
    try {
      // Route through proxy: POST /api/v1/relayer/aptos/quote
      const response = await this.httpClient.post(this.getApiPath('/quote'), {
        fromAddress: request.from,
        toAddress: request.to,
        amount: request.amount,
        coinType: this.getAptosTokenAddress(request.token)
      });

      // In proxy mode, errors are thrown by HttpClient, so we only handle success
      const responseData = response.data;
      const quote = responseData.quote;

      return {
        amount: request.amount,
        relayerFee: quote.relayerFee,
        total: (BigInt(request.amount) + BigInt(quote.relayerFee)).toString(),
        feePercentage: 0, // Aptos uses different fee structure
        contractAddress: responseData.transactionData.function.split('::')[0],
        // Store Aptos-specific data for later use
        aptosTransactionData: responseData.transactionData
      };
    } catch (error) {
      // Re-throw typed errors from HttpClient, wrap others
      if (error instanceof SmoothSendError) {
        throw error;
      }
      throw new SmoothSendError(
        `Failed to get Aptos quote: ${error instanceof Error ? error.message : String(error)}`,
        APTOS_ERROR_CODES.QUOTE_ERROR,
        500,
        { chain: this.chain }
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
        APTOS_ERROR_CODES.MISSING_TRANSACTION_DATA,
        400,
        { chain: this.chain }
      );
    }

    // Return the transaction data that needs to be signed
    // NOTE: After signing, you must serialize the transaction and authenticator
    // using the Aptos SDK and provide them as transactionBytes and authenticatorBytes
    return {
      domain: null, // Aptos doesn't use domain separation like EVM
      types: null,
      message: aptosQuote.aptosTransactionData,
      primaryType: 'AptosTransaction',
      // Add metadata to help with serialization - using any type for flexibility
      metadata: {
        requiresSerialization: true,
        serializationInstructions: 'After signing, serialize the SimpleTransaction and AccountAuthenticator using Aptos SDK',
        expectedFormat: 'transactionBytes and authenticatorBytes as number arrays'
      } as any
    };
  }

  async executeTransfer(signedData: SignedTransferData): Promise<TransferResult> {
    try {
      // Validate that we have the required serialized transaction data
      this.validateSerializedTransactionData(signedData);

      // Route through proxy: POST /api/v1/relayer/aptos/execute
      const response = await this.httpClient.post(this.getApiPath('/execute'), {
        transactionBytes: signedData.transactionBytes,
        authenticatorBytes: signedData.authenticatorBytes
      });

      // In proxy mode, errors are thrown by HttpClient, so we only handle success
      const transferData = response.data;

      const result: TransferResult = {
        success: transferData.success || true,
        // Use standardized field names (txHash, transferId)
        txHash: transferData.txHash || transferData.hash, // Support both formats
        transferId: transferData.transferId || transferData.transactionId, // Support both formats
        explorerUrl: this.buildAptosExplorerUrl(transferData.txHash || transferData.hash),
        // Standard fields
        gasUsed: transferData.gasUsed,
        // Aptos-specific fields from enhanced response format
        gasFeePaidBy: transferData.gasFeePaidBy || 'relayer',
        userPaidAPT: transferData.userPaidAPT || false,
        vmStatus: transferData.vmStatus,
        sender: transferData.sender,
        chain: transferData.chain,
        relayerFee: transferData.relayerFee,
        message: transferData.message
      };

      // Attach usage metadata from proxy response headers
      if (response.metadata) {
        result.metadata = response.metadata;
      }

      return result;
    } catch (error) {
      // Re-throw typed errors from HttpClient, wrap others
      if (error instanceof SmoothSendError) {
        throw error;
      }
      throw new SmoothSendError(
        `Failed to execute Aptos transfer: ${error instanceof Error ? error.message : String(error)}`,
        APTOS_ERROR_CODES.EXECUTE_ERROR,
        500,
        { chain: this.chain }
      );
    }
  }

  async getBalance(address: string, token?: string): Promise<TokenBalance[]> {
    try {
      // Route through proxy: GET /api/v1/relayer/aptos/balance/:address
      const response = await this.httpClient.get(this.getApiPath(`/balance/${address}`));

      // In proxy mode, errors are thrown by HttpClient, so we only handle success
      const balanceData = response.data;

      return [{
        token: balanceData?.symbol || token || 'USDC',
        balance: balanceData?.balance?.toString() || '0',
        decimals: balanceData?.decimals || 6,
        symbol: balanceData?.symbol || token || 'USDC',
        name: balanceData?.name || 'USD Coin (Testnet)'
      }];
    } catch (error) {
      // Re-throw typed errors from HttpClient, wrap others
      if (error instanceof SmoothSendError) {
        throw error;
      }
      throw new SmoothSendError(
        `Failed to get Aptos balance: ${error instanceof Error ? error.message : String(error)}`,
        APTOS_ERROR_CODES.BALANCE_ERROR,
        500,
        { chain: this.chain }
      );
    }
  }

  async getTokenInfo(token: string): Promise<TokenInfo> {
    try {
      // Route through proxy: GET /api/v1/relayer/aptos/tokens
      const response = await this.httpClient.get(this.getApiPath('/tokens'));

      // In proxy mode, errors are thrown by HttpClient, so we only handle success
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
      // Re-throw typed errors from HttpClient, wrap others
      if (error instanceof SmoothSendError) {
        throw error;
      }
      throw new SmoothSendError(
        `Failed to get Aptos token info: ${error instanceof Error ? error.message : String(error)}`,
        APTOS_ERROR_CODES.TOKEN_INFO_ERROR,
        500,
        { chain: this.chain }
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
      // Route through proxy: GET /api/v1/relayer/aptos/status/:txHash
      const response = await this.httpClient.get(this.getApiPath(`/status/${txHash}`));

      // In proxy mode, errors are thrown by HttpClient, so we only handle success
      return response.data;
    } catch (error) {
      // Re-throw typed errors from HttpClient, wrap others
      if (error instanceof SmoothSendError) {
        throw error;
      }
      throw new SmoothSendError(
        `Failed to get Aptos transaction status: ${error instanceof Error ? error.message : String(error)}`,
        APTOS_ERROR_CODES.STATUS_ERROR,
        500,
        { chain: this.chain }
      );
    }
  }

  /**
   * Get health status of Aptos relayer through proxy
   * Routes through proxy: GET /api/v1/relayer/aptos/health
   */
  async getHealth(): Promise<HealthResponse> {
    try {
      const response = await this.httpClient.get(this.getApiPath('/health'));

      const healthResponse: HealthResponse & { metadata?: UsageMetadata } = {
        success: true,
        status: response.data.status || 'healthy',
        timestamp: response.data.timestamp || new Date().toISOString(),
        version: response.data.version || '2.0'
      };

      // Attach usage metadata from proxy response headers
      if (response.metadata) {
        healthResponse.metadata = response.metadata;
      }

      return healthResponse;
    } catch (error) {
      if (error instanceof SmoothSendError) {
        throw error;
      }
      throw new SmoothSendError(
        `Failed to get Aptos health status: ${error instanceof Error ? error.message : String(error)}`,
        'HEALTH_CHECK_ERROR',
        500,
        { chain: this.chain }
      );
    }
  }

  validateAddress(address: string): boolean {
    // Aptos address validation (0x prefix, up to 64 hex characters)
    // Aptos addresses can be shorter and are automatically padded
    return /^0x[a-fA-F0-9]{1,64}$/.test(address);
  }

  validateAmount(amount: string): boolean {
    try {
      const amountBN = BigInt(amount);
      return amountBN > 0n;
    } catch {
      return false;
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
      APTOS_ERROR_CODES.UNSUPPORTED_TOKEN,
      400,
      { chain: this.chain, token: tokenSymbol }
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
   * Validate serialized transaction data for proxy worker
   * @param signedData The signed transfer data to validate
   */
  private validateSerializedTransactionData(signedData: SignedTransferData): void {
    if (!signedData.transactionBytes) {
      throw new SmoothSendError(
        'Serialized transaction bytes are required for Aptos transactions',
        APTOS_ERROR_CODES.MISSING_TRANSACTION_DATA,
        400,
        { chain: this.chain }
      );
    }

    if (!signedData.authenticatorBytes) {
      throw new SmoothSendError(
        'Serialized authenticator bytes are required for Aptos transactions',
        APTOS_ERROR_CODES.MISSING_SIGNATURE,
        400,
        { chain: this.chain }
      );
    }

    // Validate that transaction bytes is an array of numbers (0-255)
    if (!Array.isArray(signedData.transactionBytes) ||
      !signedData.transactionBytes.every((b: any) => typeof b === 'number' && b >= 0 && b <= 255)) {
      throw new SmoothSendError(
        'Invalid transaction bytes format. Expected array of numbers 0-255.',
        APTOS_ERROR_CODES.INVALID_SIGNATURE_FORMAT,
        400,
        { chain: this.chain }
      );
    }

    // Validate that authenticator bytes is an array of numbers (0-255)
    if (!Array.isArray(signedData.authenticatorBytes) ||
      !signedData.authenticatorBytes.every((b: any) => typeof b === 'number' && b >= 0 && b <= 255)) {
      throw new SmoothSendError(
        'Invalid authenticator bytes format. Expected array of numbers 0-255.',
        APTOS_ERROR_CODES.INVALID_PUBLIC_KEY_FORMAT,
        400,
        { chain: this.chain }
      );
    }
  }

  /**
   * Enhanced address validation with detailed error messages
   * @param address The address to validate
   * @returns true if valid, throws error if invalid
   */
  validateAddressStrict(address: string): boolean {
    if (!address) {
      throw new SmoothSendError(
        'Address cannot be empty',
        APTOS_ERROR_CODES.EMPTY_ADDRESS,
        400,
        { chain: this.chain }
      );
    }

    // Aptos address validation (0x prefix, up to 64 hex characters)
    if (!/^0x[a-fA-F0-9]{1,64}$/.test(address)) {
      throw new SmoothSendError(
        'Invalid Aptos address format. Must start with 0x and contain 1-64 hex characters.',
        APTOS_ERROR_CODES.INVALID_ADDRESS_FORMAT,
        400,
        { chain: this.chain }
      );
    }

    return true;
  }

  /**
   * Verify that a public key corresponds to an expected address
   * This mirrors the enhanced verification in the relayer
   * @param publicKey The public key to verify
   * @param expectedAddress The expected address
   * @returns true if they match
   */
  async verifyPublicKeyAddress(publicKey: string, expectedAddress: string): Promise<boolean> {
    try {
      // This would typically use the Aptos SDK to derive address from public key
      // For now, we'll do basic validation and let the relayer handle the actual verification
      this.validateAddressStrict(expectedAddress);

      if (!publicKey || !publicKey.startsWith('0x')) {
        return false;
      }

      // The actual verification is done by the relayer using the Aptos SDK
      // This is just a preliminary check
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Enhanced transaction preparation with better signature data structure
   * @param request Transfer request
   * @param quote Transfer quote
   * @returns Signature data with enhanced structure
   */
  async prepareTransferEnhanced(request: TransferRequest, quote: TransferQuote): Promise<SignatureData & { metadata: any }> {
    const baseSignatureData = await this.prepareTransfer(request, quote);

    return {
      ...baseSignatureData,
      metadata: {
        chain: this.chain,
        fromAddress: request.from,
        toAddress: request.to,
        amount: request.amount,
        token: request.token,
        relayerFee: quote.relayerFee,
        signatureVersion: '2.0', // Version for tracking signature format changes
        requiresPublicKey: true, // Indicates this chain requires public key for verification
        verificationMethod: 'ed25519_with_address_derivation' // Indicates verification method used
      }
    };
  }

  /**
   * Aptos-specific Move contract interaction
   */
  async callMoveFunction(functionName: string, args: any[]): Promise<any> {
    try {
      // Route through proxy: POST /api/v1/relayer/aptos/move/call
      const response = await this.httpClient.post(this.getApiPath('/move/call'), {
        function: functionName,
        arguments: args
      });

      // In proxy mode, errors are thrown by HttpClient, so we only handle success
      return response.data;
    } catch (error) {
      // Re-throw typed errors from HttpClient, wrap others
      if (error instanceof SmoothSendError) {
        throw error;
      }
      throw new SmoothSendError(
        `Failed to call Move function: ${error instanceof Error ? error.message : String(error)}`,
        APTOS_ERROR_CODES.MOVE_CALL_ERROR,
        500,
        { chain: this.chain }
      );
    }
  }
}
