import {
  SupportedChain,
  ChainEcosystem,
  CHAIN_ECOSYSTEM_MAP,
  TransferRequest,
  SignedTransferData,
  TransferResult,
  SmoothSendConfig,
  SmoothSendError,
  TransferEvent,
  EventListener,
  IChainAdapter,
  HealthResponse,
  FeeEstimate,
  UsageMetadata
} from '../types';
import { AptosAdapter } from '../adapters/aptos';

export class SmoothSendSDK {
  private adapters: Map<SupportedChain, IChainAdapter> = new Map();
  private eventListeners: EventListener[] = [];
  private config: SmoothSendConfig;

  constructor(config: SmoothSendConfig) {
    // Validate API key is provided
    if (!config.apiKey) {
      throw new SmoothSendError(
        'API key is required. Get your API key from dashboard.smoothsend.xyz',
        'MISSING_API_KEY'
      );
    }

    // Validate API key format (must start with no_gas_)
    if (!config.apiKey.startsWith('no_gas_')) {
      throw new SmoothSendError(
        'Invalid API key format. API key must start with "no_gas_"',
        'INVALID_API_KEY_FORMAT'
      );
    }

    // Validate network parameter if provided
    if (config.network && config.network !== 'testnet' && config.network !== 'mainnet') {
      throw new SmoothSendError(
        'Invalid network parameter. Must be "testnet" or "mainnet"',
        'INVALID_NETWORK'
      );
    }

    // Set configuration with defaults
    this.config = {
      apiKey: config.apiKey,
      network: config.network || 'testnet', // Default to testnet
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      customHeaders: config.customHeaders || {}
    };
  }

  /**
   * Get or create adapter for a specific chain on-demand
   */
  private getOrCreateAdapter(chain: SupportedChain): IChainAdapter {
    // Check if adapter already exists
    let adapter = this.adapters.get(chain);
    
    if (!adapter) {
      // Create adapter on-demand
      const ecosystem = CHAIN_ECOSYSTEM_MAP[chain];
      
      if (ecosystem === 'aptos') {
        // Create minimal config for adapter (proxy handles actual configuration)
        const minimalConfig = {
          name: chain,
          displayName: chain,
          chainId: 0,
          rpcUrl: '',
          relayerUrl: 'https://proxy.smoothsend.xyz',
          explorerUrl: '',
          tokens: [],
          nativeCurrency: {
            name: 'APT',
            symbol: 'APT',
            decimals: 8
          }
        };
        
        adapter = new AptosAdapter(
          chain,
          minimalConfig,
          this.config.apiKey,
          this.config.network || 'testnet'
        );
      } else if (ecosystem === 'evm') {
        // EVM adapter will be implemented in future phase
        throw new SmoothSendError(
          `EVM chains not yet supported in v2. Chain: ${chain}`,
          'UNSUPPORTED_CHAIN'
        );
      } else {
        throw new SmoothSendError(
          `Unsupported ecosystem: ${ecosystem}`,
          'UNSUPPORTED_ECOSYSTEM'
        );
      }
      
      // Cache the adapter for future use
      this.adapters.set(chain, adapter);
    }
    
    return adapter;
  }

  // Event handling
  public addEventListener(listener: EventListener): void {
    this.eventListeners.push(listener);
  }

  public removeEventListener(listener: EventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  private emitEvent(event: TransferEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    });
  }

  // Core transfer methods
  public async estimateFee(request: TransferRequest): Promise<FeeEstimate & { metadata?: UsageMetadata }> {
    const adapter = this.getOrCreateAdapter(request.chain);

    this.emitEvent({
      type: 'transfer_initiated',
      data: { request },
      timestamp: Date.now(),
      chain: request.chain
    });

    try {
      const feeEstimate = await adapter.estimateFee(request);
      // Metadata is already attached by the adapter from HTTP response headers
      return feeEstimate as FeeEstimate & { metadata?: UsageMetadata };
    } catch (error) {
      this.emitEvent({
        type: 'transfer_failed',
        data: { error: error instanceof Error ? error.message : String(error), step: 'estimate_fee' },
        timestamp: Date.now(),
        chain: request.chain
      });
      throw error;
    }
  }

  public async executeGaslessTransfer(signedData: SignedTransferData): Promise<TransferResult> {
    const adapter = this.getOrCreateAdapter(signedData.chain);

    this.emitEvent({
      type: 'transfer_submitted',
      data: { signedData },
      timestamp: Date.now(),
      chain: signedData.chain
    });

    try {
      const result = await adapter.executeGaslessTransfer(signedData);

      this.emitEvent({
        type: 'transfer_confirmed',
        data: { result },
        timestamp: Date.now(),
        chain: signedData.chain
      });

      return result;
    } catch (error) {
      this.emitEvent({
        type: 'transfer_failed',
        data: { error: error instanceof Error ? error.message : String(error), step: 'execute' },
        timestamp: Date.now(),
        chain: signedData.chain
      });
      throw error;
    }
  }

  /**
   * Convenience method for complete transfer flow
   * Combines estimateFee and executeGaslessTransfer into a single call
   * 
   * @param request Transfer request with from, to, token, amount, chain
   * @param wallet Wallet instance that can build and sign transactions
   * @returns Transfer result with transaction hash and usage metadata
   * 
   * Note: The wallet parameter should have methods:
   * - buildTransaction(params): Build transaction from parameters
   * - signTransaction(transaction): Sign and serialize transaction
   * 
   * The wallet's signTransaction should return an object with:
   * - transactionBytes: number[] - Serialized transaction
   * - authenticatorBytes: number[] - Serialized authenticator
   */
  async transfer(
    request: TransferRequest,
    wallet: {
      buildTransaction: (params: any) => Promise<any>;
      signTransaction: (transaction: any) => Promise<{
        transactionBytes: number[];
        authenticatorBytes: number[];
      }>;
    }
  ): Promise<TransferResult> {
    this.emitEvent({
      type: 'transfer_initiated',
      data: { request },
      timestamp: Date.now(),
      chain: request.chain
    });

    try {
      // Step 1: Get fee estimate
      const feeEstimate = await this.estimateFee(request);

      // Step 2: Build transaction with wallet
      const transaction = await wallet.buildTransaction({
        sender: request.from,
        recipient: request.to,
        amount: request.amount,
        coinType: feeEstimate.coinType,
        relayerFee: feeEstimate.relayerFee
      });

      this.emitEvent({
        type: 'transfer_signed',
        data: { transaction },
        timestamp: Date.now(),
        chain: request.chain
      });

      // Step 3: Sign and serialize transaction with wallet
      const signedTx = await wallet.signTransaction(transaction);

      // Step 4: Execute gasless transfer
      const result = await this.executeGaslessTransfer({
        transactionBytes: signedTx.transactionBytes,
        authenticatorBytes: signedTx.authenticatorBytes,
        chain: request.chain,
        network: this.config.network
      });

      return result;
    } catch (error) {
      this.emitEvent({
        type: 'transfer_failed',
        data: { 
          error: error instanceof Error ? error.message : String(error),
          step: 'transfer'
        },
        timestamp: Date.now(),
        chain: request.chain
      });
      throw error;
    }
  }

  // Note: Batch transfer support will be implemented in a future phase

  // Utility methods
  
  /**
   * Get transaction status for a specific transaction
   * Routes through proxy to chain-specific status endpoint
   * 
   * @param chain Chain where the transaction was executed
   * @param txHash Transaction hash to query
   * @returns Transaction status information
   * @throws SmoothSendError if chain is not supported or status check fails
   * 
   * @example
   * ```typescript
   * const status = await sdk.getTransactionStatus('aptos-testnet', '0x123...');
   * console.log('Transaction status:', status);
   * ```
   */
  public async getTransactionStatus(chain: SupportedChain, txHash: string): Promise<any> {
    if (!this.isChainSupported(chain)) {
      throw new SmoothSendError(
        `Chain ${chain} is not supported`,
        'UNSUPPORTED_CHAIN',
        400,
        { chain, supportedChains: this.getSupportedChains() }
      );
    }

    if (!txHash || txHash.trim() === '') {
      throw new SmoothSendError(
        'Transaction hash is required',
        'MISSING_TX_HASH',
        400
      );
    }

    const adapter = this.getOrCreateAdapter(chain);
    return await adapter.getTransactionStatus(txHash);
  }

  public validateAddress(chain: SupportedChain, address: string): boolean {
    const adapter = this.getOrCreateAdapter(chain);
    return adapter.validateAddress(address);
  }

  public validateAmount(chain: SupportedChain, amount: string): boolean {
    const adapter = this.getOrCreateAdapter(chain);
    return adapter.validateAmount(amount);
  }

  /**
   * Check proxy worker health status
   * Routes directly to proxy's /health endpoint (not chain-specific)
   * 
   * @returns Health response with status, version, and timestamp
   * @throws NetworkError if proxy is unavailable
   * @throws SmoothSendError for other errors
   * 
   * @example
   * ```typescript
   * try {
   *   const health = await sdk.getHealth();
   *   console.log('Proxy status:', health.status);
   *   console.log('Version:', health.version);
   * } catch (error) {
   *   if (error instanceof NetworkError) {
   *     console.error('Proxy unavailable. Please retry later.');
   *   }
   * }
   * ```
   */
  public async getHealth(): Promise<HealthResponse> {
    // Import HttpClient for direct proxy health check
    const { HttpClient } = await import('../utils/http');
    
    // Create HTTP client for direct proxy communication
    const httpClient = new HttpClient({
      apiKey: this.config.apiKey,
      network: this.config.network || 'testnet',
      timeout: this.config.timeout,
      retries: this.config.retries
    });

    try {
      // Check proxy's general health endpoint (not chain-specific)
      const response = await httpClient.get('/health');

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
        `Failed to check proxy health: ${error instanceof Error ? error.message : String(error)}. Please check your connection and retry.`,
        'HEALTH_CHECK_ERROR',
        500
      );
    }
  }

  /**
   * Get list of supported chains (static list)
   * For dynamic list from proxy, use getSupportedChainsFromProxy()
   * 
   * @returns Array of supported chain identifiers
   * 
   * @example
   * ```typescript
   * const chains = sdk.getSupportedChains();
   * console.log('Supported chains:', chains);
   * // Output: ['aptos-testnet', 'aptos-mainnet']
   * ```
   */
  public getSupportedChains(): SupportedChain[] {
    // Return statically supported chains for v2
    return ['aptos-testnet', 'aptos-mainnet'];
  }

  /**
   * Get list of supported chains from proxy worker (dynamic)
   * Queries the proxy for the current list of supported chains
   * 
   * @returns Promise with array of chain information including status
   * @throws SmoothSendError if unable to fetch chains from proxy
   * 
   * @example
   * ```typescript
   * const chains = await sdk.getSupportedChainsFromProxy();
   * chains.forEach(chain => {
   *   console.log(`${chain.name} (${chain.id}): ${chain.status}`);
   * });
   * ```
   */
  public async getSupportedChainsFromProxy(): Promise<Array<{
    id: string;
    name: string;
    ecosystem: string;
    network: string;
    status: string;
  }>> {
    const { HttpClient } = await import('../utils/http');
    
    const httpClient = new HttpClient({
      apiKey: this.config.apiKey,
      network: this.config.network || 'testnet',
      timeout: this.config.timeout,
      retries: this.config.retries
    });

    try {
      const response = await httpClient.get('/api/v1/chains');
      
      if (!response.data.chains) {
        throw new Error('Invalid response format from proxy');
      }

      return response.data.chains;
    } catch (error) {
      if (error instanceof SmoothSendError) {
        throw error;
      }
      throw new SmoothSendError(
        `Failed to fetch supported chains from proxy: ${error instanceof Error ? error.message : String(error)}`,
        'CHAINS_FETCH_ERROR',
        500
      );
    }
  }

  /**
   * Check if a specific chain is currently supported
   * 
   * @param chain Chain identifier to check
   * @returns true if chain is supported, false otherwise
   * 
   * @example
   * ```typescript
   * if (sdk.isChainSupported('aptos-testnet')) {
   *   console.log('Aptos testnet is supported');
   * } else {
   *   console.log('Chain not supported');
   * }
   * ```
   */
  public isChainSupported(chain: string): boolean {
    const supportedChains = this.getSupportedChains();
    return supportedChains.includes(chain as SupportedChain);
  }

  /**
   * Check health status of a specific chain's relayer
   * Routes through proxy to chain-specific health endpoint
   * 
   * @param chain Chain identifier to check
   * @returns Health response for the specific chain
   * @throws SmoothSendError if chain is not supported or health check fails
   * 
   * @example
   * ```typescript
   * try {
   *   const health = await sdk.getChainHealth('aptos-testnet');
   *   console.log('Aptos testnet status:', health.status);
   * } catch (error) {
   *   console.error('Chain health check failed:', error.message);
   * }
   * ```
   */
  public async getChainHealth(chain: SupportedChain): Promise<HealthResponse> {
    if (!this.isChainSupported(chain)) {
      throw new SmoothSendError(
        `Chain ${chain} is not supported`,
        'UNSUPPORTED_CHAIN',
        400,
        { chain, supportedChains: this.getSupportedChains() }
      );
    }

    const adapter = this.getOrCreateAdapter(chain);
    return await adapter.getHealth();
  }

  /**
   * Get current usage statistics without making a transfer
   * Makes a lightweight health check request to retrieve usage metadata
   * 
   * @returns Usage metadata with rate limit and monthly usage information
   * @throws Error if unable to retrieve usage stats
   * 
   * @example
   * ```typescript
   * const usage = await sdk.getUsageStats();
   * console.log('Rate limit:', usage.rateLimit);
   * console.log('Monthly usage:', usage.monthly);
   * console.log('Request ID:', usage.requestId);
   * 
   * // Check if approaching limits
   * if (parseInt(usage.rateLimit.remaining) < 2) {
   *   console.warn('Approaching rate limit!');
   * }
   * ```
   */
  async getUsageStats(): Promise<UsageMetadata> {
    try {
      // Make a health check request to get usage metadata from headers
      const health = await this.getHealth();
      
      // The health response includes metadata from the HTTP client
      const healthWithMetadata = health as HealthResponse & { metadata?: UsageMetadata };
      
      if (!healthWithMetadata.metadata) {
        throw new SmoothSendError(
          'Usage metadata not available. This may occur if not using proxy mode.',
          'METADATA_NOT_AVAILABLE'
        );
      }
      
      return healthWithMetadata.metadata;
    } catch (error) {
      // If health check fails, we can't get usage stats
      if (error instanceof SmoothSendError) {
        throw error;
      }
      throw new SmoothSendError(
        `Failed to retrieve usage statistics: ${error instanceof Error ? error.message : String(error)}`,
        'USAGE_STATS_ERROR'
      );
    }
  }

  /**
   * Extract request ID from a transfer result for debugging and support
   * 
   * @param result Transfer result from executeGaslessTransfer or transfer
   * @returns Request ID if available, undefined otherwise
   * 
   * @example
   * ```typescript
   * const result = await sdk.executeGaslessTransfer(signedData);
   * const requestId = sdk.getRequestId(result);
   * if (requestId) {
   *   console.log('Request ID for support:', requestId);
   * }
   * ```
   */
  getRequestId(result: TransferResult): string | undefined {
    return result.metadata?.requestId;
  }

  /**
   * Check if approaching rate limit based on transfer result metadata
   * 
   * @param result Transfer result with metadata
   * @param threshold Percentage threshold (0-100) to consider as "approaching" (default: 20)
   * @returns true if remaining requests are below threshold percentage
   * 
   * @example
   * ```typescript
   * const result = await sdk.transfer(request, wallet);
   * if (sdk.isApproachingRateLimit(result)) {
   *   console.warn('Approaching rate limit, consider slowing down requests');
   * }
   * ```
   */
  isApproachingRateLimit(result: TransferResult, threshold: number = 20): boolean {
    if (!result.metadata?.rateLimit) {
      return false;
    }

    const limit = parseInt(result.metadata.rateLimit.limit);
    const remaining = parseInt(result.metadata.rateLimit.remaining);

    if (isNaN(limit) || isNaN(remaining) || limit === 0) {
      return false;
    }

    const percentageRemaining = (remaining / limit) * 100;
    return percentageRemaining <= threshold;
  }

  /**
   * Check if approaching monthly usage limit based on transfer result metadata
   * 
   * @param result Transfer result with metadata
   * @param threshold Percentage threshold (0-100) to consider as "approaching" (default: 90)
   * @returns true if monthly usage is above threshold percentage
   * 
   * @example
   * ```typescript
   * const result = await sdk.transfer(request, wallet);
   * if (sdk.isApproachingMonthlyLimit(result)) {
   *   console.warn('Approaching monthly limit, consider upgrading plan');
   * }
   * ```
   */
  isApproachingMonthlyLimit(result: TransferResult, threshold: number = 90): boolean {
    if (!result.metadata?.monthly) {
      return false;
    }

    const limit = parseInt(result.metadata.monthly.limit);
    const usage = parseInt(result.metadata.monthly.usage);

    if (isNaN(limit) || isNaN(usage) || limit === 0) {
      return false;
    }

    const percentageUsed = (usage / limit) * 100;
    return percentageUsed >= threshold;
  }

  // Ecosystem-specific methods for advanced usage

  /**
   * Check if a chain belongs to a specific ecosystem
   */
  public getChainEcosystem(chain: SupportedChain): ChainEcosystem {
    return CHAIN_ECOSYSTEM_MAP[chain];
  }

  // Static utility methods
  
  /**
   * Get list of supported chains (static method)
   * Can be called without instantiating the SDK
   * 
   * @returns Array of supported chain identifiers
   * 
   * @example
   * ```typescript
   * const chains = SmoothSendSDK.getSupportedChains();
   * console.log('Supported chains:', chains);
   * ```
   */
  public static getSupportedChains(): SupportedChain[] {
    return ['aptos-testnet', 'aptos-mainnet'];
  }
}

