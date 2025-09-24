import {
  SupportedChain,
  ChainConfig,
  ChainEcosystem,
  CHAIN_ECOSYSTEM_MAP,
  TransferRequest,
  TransferQuote,
  SignatureData,
  SignedTransferData,
  TransferResult,
  TokenBalance,
  TokenInfo,
  BatchTransferRequest,
  SmoothSendConfig,
  SmoothSendError,
  TransferEvent,
  EventListener,
  IChainAdapter,
  ChainInfo,
  HealthResponse,
  GasEstimateResponse,
  DomainSeparatorResponse,
  TransferStatusResponse
} from '../types';
import { getChainConfig, getAllChainConfigs } from '../config/chains';
import { chainConfigService, DynamicChainConfig } from '../services/chainConfigService';
import { EVMAdapter } from '../adapters/evm';
import { AptosAdapter } from '../adapters/aptos';
import { HttpClient } from '../utils/http';

export class SmoothSendSDK {
  private adapters: Map<SupportedChain, IChainAdapter> = new Map();
  private eventListeners: EventListener[] = [];
  private config: SmoothSendConfig;
  private initialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: SmoothSendConfig = {}) {
    this.config = {
      timeout: 30000,
      retries: 3,
      useDynamicConfig: true, // Enable dynamic config by default
      configCacheTtl: 5 * 60 * 1000, // 5 minutes
      relayerUrls: {
        evm: 'https://smoothsendevm.onrender.com',
        aptos: 'https://smoothsendrelayerworking.onrender.com/api/v1/relayer'
      },
      ...config
    };

    // Set custom cache TTL if provided
    if (this.config.configCacheTtl) {
      chainConfigService.setCacheTtl(this.config.configCacheTtl);
    }

    // Don't initialize immediately, wait for first method call to avoid blocking constructor
  }

  /**
   * Initialize adapters with dynamic or static configuration
   */
  private async initializeAdapters(): Promise<void> {
    if (this.initialized) return;
    
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    this.initializationPromise = this._doInitialize();
    await this.initializationPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      if (this.config.useDynamicConfig) {
        await this.initializeDynamicAdapters();
      } else {
        this.initializeStaticAdapters();
      }
      this.initialized = true;
    } catch (error) {
      console.warn('Dynamic configuration failed, falling back to static:', error);
      this.initializeStaticAdapters();
      this.initialized = true;
    }
  }

  private async initializeDynamicAdapters(): Promise<void> {
    try {
      // Fetch dynamic configurations from both relayers
      const supportedChains = await this.fetchSupportedChains();
      
      // Initialize adapters for all supported chains
      for (const chain of supportedChains) {
        const chainConfig = await this.fetchChainConfig(chain);
        const finalConfig = {
          ...chainConfig,
          ...this.config.customChainConfigs?.[chain]
        };

        this.createAdapter(chain, finalConfig);
      }
    } catch (error) {
      console.error('Failed to initialize dynamic adapters:', error);
      throw error;
    }
  }

  private initializeStaticAdapters(): void {
    // Initialize all supported chains with static configuration
    const supportedChains: SupportedChain[] = [
      'avalanche', 'aptos-testnet'
    ];
    
    for (const chain of supportedChains) {
      try {
        const config = this.getDefaultChainConfig(chain);
        const finalConfig = {
          ...config,
          ...this.config.customChainConfigs?.[chain]
        };
        this.createAdapter(chain, finalConfig);
      } catch (error) {
        console.warn(`Failed to initialize ${chain}:`, error);
      }
    }
  }

  private createAdapter(chain: SupportedChain, config: ChainConfig | DynamicChainConfig): void {
    if (!this.config.relayerUrls) {
      throw new SmoothSendError(
        'Relayer URLs not configured',
        'MISSING_RELAYER_URLS'
      );
    }

    const ecosystem = CHAIN_ECOSYSTEM_MAP[chain];
    const relayerUrl = this.config.relayerUrls[ecosystem];

    if (!relayerUrl) {
      throw new SmoothSendError(
        `No relayer URL configured for ${ecosystem} ecosystem`,
        'MISSING_RELAYER_URL',
        chain
      );
    }

    // Route to the appropriate ecosystem-specific adapter
    if (ecosystem === 'evm') {
      this.adapters.set(chain, new EVMAdapter(chain, config as ChainConfig, relayerUrl));
    } else if (ecosystem === 'aptos') {
      this.adapters.set(chain, new AptosAdapter(chain, config as ChainConfig, relayerUrl));
    } else {
      throw new SmoothSendError(
        `Unsupported ecosystem: ${ecosystem}`,
        'UNSUPPORTED_ECOSYSTEM',
        chain
      );
    }
  }

  /**
   * Fetch supported chains from both relayers
   */
  private async fetchSupportedChains(): Promise<SupportedChain[]> {
    const chains: SupportedChain[] = [];
    
    try {
      // Fetch from EVM relayer
      if (this.config.relayerUrls?.evm) {
        const evmClient = new HttpClient(this.config.relayerUrls.evm);
        const response = await evmClient.get('/chains');
        // The EVM relayer returns chain names directly
        chains.push(...(response.data.chains || []) as SupportedChain[]);
      }
    } catch (error) {
      console.warn('Failed to fetch EVM chains:', error);
    }
    
    try {
      // Fetch from Aptos relayer
      if (this.config.relayerUrls?.aptos) {
        const aptosClient = new HttpClient(this.config.relayerUrls.aptos);
        const response = await aptosClient.get('/chains');
        // The Aptos relayer returns chain names directly
        chains.push(...(response.data.chains || []) as SupportedChain[]);
      }
    } catch (error) {
      console.warn('Failed to fetch Aptos chains:', error);
    }
    
    return chains;
  }

  /**
   * Fetch chain configuration from the appropriate relayer
   */
  private async fetchChainConfig(chain: SupportedChain): Promise<ChainConfig> {
    const ecosystem = CHAIN_ECOSYSTEM_MAP[chain];
    const relayerUrl = this.config.relayerUrls?.[ecosystem];
    
    if (!relayerUrl) {
      throw new Error(`No relayer URL for ${ecosystem} ecosystem`);
    }
    
    const client = new HttpClient(relayerUrl);
    const response = await client.get(`/${chain}/info`);
    
    const info = response.data.info;
    return {
      name: info.name,
      displayName: info.name,
      chainId: info.chainId,
      rpcUrl: info.rpcUrl,
      relayerUrl: relayerUrl,
      explorerUrl: info.explorerUrl,
      tokens: Object.keys(info.tokens || {}),
      nativeCurrency: {
        name: ecosystem === 'evm' ? 'Ether' : 'APT',
        symbol: ecosystem === 'evm' ? 'ETH' : 'APT',
        decimals: ecosystem === 'evm' ? 18 : 8
      }
    };
  }

  /**
   * Get default configuration for a chain (fallback when dynamic config fails)
   */
  private getDefaultChainConfig(chain: SupportedChain): ChainConfig {
    const ecosystem = CHAIN_ECOSYSTEM_MAP[chain];
    const relayerUrl = this.config.relayerUrls?.[ecosystem] || '';
    
    // Return minimal default configuration
    return {
      name: chain,
      displayName: chain,
      chainId: 0, // Will be updated dynamically
      rpcUrl: '',
      relayerUrl: relayerUrl,
      explorerUrl: '',
      tokens: ['USDC'],
      nativeCurrency: {
        name: ecosystem === 'evm' ? 'Ether' : 'APT',
        symbol: ecosystem === 'evm' ? 'ETH' : 'APT',
        decimals: ecosystem === 'evm' ? 18 : 8
      }
    };
  }

  /**
   * Refresh chain configurations from relayers
   */
  async refreshChainConfigs(): Promise<void> {
    chainConfigService.clearCache();
    this.adapters.clear();
    this.initialized = false;
    this.initializationPromise = null;
    await this.initializeAdapters();
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
  public async getQuote(request: TransferRequest): Promise<TransferQuote> {
    await this.initializeAdapters();
    const adapter = this.getAdapter(request.chain);
    
    this.emitEvent({
      type: 'transfer_initiated',
      data: { request },
      timestamp: Date.now(),
      chain: request.chain
    });

    try {
      const quote = await adapter.getQuote(request);
      return quote;
    } catch (error) {
      this.emitEvent({
        type: 'transfer_failed',
        data: { error: error instanceof Error ? error.message : String(error), step: 'quote' },
        timestamp: Date.now(),
        chain: request.chain
      });
      throw error;
    }
  }

  public async prepareTransfer(
    request: TransferRequest,
    quote: TransferQuote
  ): Promise<SignatureData> {
    await this.initializeAdapters();
    const adapter = this.getAdapter(request.chain);
    
    try {
      const signatureData = await adapter.prepareTransfer(request, quote);
      return signatureData;
    } catch (error) {
      this.emitEvent({
        type: 'transfer_failed',
        data: { error: error instanceof Error ? error.message : String(error), step: 'prepare' },
        timestamp: Date.now(),
        chain: request.chain
      });
      throw error;
    }
  }

  public async executeTransfer(
    signedData: SignedTransferData,
    chain: SupportedChain
  ): Promise<TransferResult> {
    await this.initializeAdapters();
    const adapter = this.getAdapter(chain);
    
    this.emitEvent({
      type: 'transfer_submitted',
      data: { signedData },
      timestamp: Date.now(),
      chain
    });

    try {
      const result = await adapter.executeTransfer(signedData);
      
      this.emitEvent({
        type: 'transfer_confirmed',
        data: { result },
        timestamp: Date.now(),
        chain
      });

      return result;
    } catch (error) {
      this.emitEvent({
        type: 'transfer_failed',
        data: { error: error instanceof Error ? error.message : String(error), step: 'execute' },
        timestamp: Date.now(),
        chain
      });
      throw error;
    }
  }

  // Convenience method for complete transfer flow
  public async transfer(
    request: TransferRequest,
    signer: any // Wallet signer (ethers.Signer for EVM, Aptos account for Aptos)
  ): Promise<TransferResult> {
    await this.initializeAdapters();
    
    // Step 1: Get quote
    const quote = await this.getQuote(request);
    
    // Step 2: Prepare signature data
    const signatureData = await this.prepareTransfer(request, quote);
    
    // Step 3: Sign the data
    let signature: string;
    let transferData: any;
    let signatureType: 'EIP712' | 'Ed25519';

    const ecosystem = CHAIN_ECOSYSTEM_MAP[request.chain];
    
    if (ecosystem === 'evm') {
      // EIP-712 signing for EVM chains (Avalanche)
      signature = await signer.signTypedData(
        signatureData.domain,
        signatureData.types,
        signatureData.message
      );
      
      transferData = {
        chainName: request.chain === 'avalanche' ? 'avalanche-fuji' : request.chain,
        from: request.from,
        to: request.to,
        tokenSymbol: request.token,
        amount: request.amount,
        relayerFee: quote.relayerFee,
        nonce: signatureData.message.nonce,
        deadline: signatureData.message.deadline,
      };
      signatureType = 'EIP712';
    } else if (ecosystem === 'aptos') {
      // Aptos signing - requires transaction serialization for secure relayer
      const signedTransaction = await signer.signTransaction(signatureData.message);
      
      // CRITICAL: Serialize the transaction and authenticator for the secure relayer endpoint
      // This matches the new secure relayer format that expects byte arrays
      if (!signedTransaction.transactionBytes || !signedTransaction.authenticatorBytes) {
        throw new SmoothSendError(
          'Aptos signer must return serialized transactionBytes and authenticatorBytes',
          'APTOS_SERIALIZATION_ERROR',
          request.chain
        );
      }
      
      transferData = {
        transactionBytes: signedTransaction.transactionBytes,
        authenticatorBytes: signedTransaction.authenticatorBytes,
        functionName: signedTransaction.functionName || 'smoothsend_transfer',
        // Metadata for compatibility
        fromAddress: request.from,
        toAddress: request.to,
        amount: request.amount,
        coinType: quote.contractAddress
      };
      signature = 'serialized'; // Signature is embedded in authenticatorBytes
      signatureType = 'Ed25519';
    } else {
      throw new SmoothSendError(
        `Unsupported chain ecosystem: ${ecosystem}`,
        'UNSUPPORTED_CHAIN_ECOSYSTEM',
        request.chain
      );
    }

    this.emitEvent({
      type: 'transfer_signed',
      data: { signature },
      timestamp: Date.now(),
      chain: request.chain
    });

    // Step 4: Execute transfer
    const signedTransferData: SignedTransferData = {
      transferData,
      signature,
      signatureType
    };

    return await this.executeTransfer(signedTransferData, request.chain);
  }

  // Batch transfer support
  public async batchTransfer(
    request: BatchTransferRequest,
    signer: any
  ): Promise<TransferResult[]> {
    await this.initializeAdapters();
    
    const adapter = this.getAdapter(request.chain);

    // Check if adapter supports native batch transfers
    if (adapter.executeBatchTransfer) {
      // Prepare all transfers for batch execution
      const signedTransfers: SignedTransferData[] = [];
      
      for (const transfer of request.transfers) {
        // Get quote
        const quote = await this.getQuote(transfer);
        
        // Prepare signature data
        const signatureData = await this.prepareTransfer(transfer, quote);
        
        // Sign the data using unified approach
        let signature: string;
        let transferData: any;
        let signatureType: 'EIP712' | 'Ed25519';

        const ecosystem = CHAIN_ECOSYSTEM_MAP[transfer.chain];
        
        if (ecosystem === 'evm') {
          // EIP-712 signing for EVM chains
          signature = await signer.signTypedData(
            signatureData.domain,
            signatureData.types,
            signatureData.message
          );
          
          transferData = {
            chainName: transfer.chain === 'avalanche' ? 'avalanche-fuji' : transfer.chain,
            from: transfer.from,
            to: transfer.to,
            tokenSymbol: transfer.token,
            amount: transfer.amount,
            relayerFee: quote.relayerFee,
            nonce: signatureData.message.nonce,
            deadline: signatureData.message.deadline,
          };
          signatureType = 'EIP712';
        } else if (ecosystem === 'aptos') {
          // Aptos signing
          signature = await signer.signTransaction(signatureData.message);
          
          transferData = {
            fromAddress: transfer.from,
            toAddress: transfer.to,
            amount: transfer.amount,
            coinType: quote.contractAddress,
            relayerFee: quote.relayerFee,
            publicKey: await signer.publicKey()
          };
          signatureType = 'Ed25519';
        } else {
          throw new SmoothSendError(
            `Unsupported chain ecosystem: ${ecosystem}`,
            'UNSUPPORTED_CHAIN_ECOSYSTEM',
            transfer.chain
          );
        }

        signedTransfers.push({
          transferData,
          signature,
          signatureType
        });
      }

      // Execute batch transfer
      return await adapter.executeBatchTransfer(signedTransfers);
    } else {
      // Fallback to sequential transfers for chains without native batch support
      const results: TransferResult[] = [];
      
      for (const transfer of request.transfers) {
        try {
          const result = await this.transfer(transfer, signer);
          results.push(result);
        } catch (error) {
          // Continue with other transfers even if one fails
          results.push({
            success: false,
            txHash: '',
            error: error instanceof Error ? error.message : String(error)
          } as TransferResult & { error: string });
        }
      }

      return results;
    }
  }

  // Utility methods
  public async getBalance(
    chain: SupportedChain,
    address: string,
    token?: string
  ): Promise<TokenBalance[]> {
    await this.initializeAdapters();
    const adapter = this.getAdapter(chain);
    
    if (!adapter.getBalance) {
      throw new SmoothSendError(
        `Balance functionality not available for chain: ${chain}`,
        'BALANCE_NOT_SUPPORTED',
        chain
      );
    }
    
    return await adapter.getBalance(address, token);
  }

  public async getTokenInfo(chain: SupportedChain, token: string): Promise<TokenInfo> {
    await this.initializeAdapters();
    const adapter = this.getAdapter(chain);
    return await adapter.getTokenInfo(token);
  }

  public async getNonce(chain: SupportedChain, address: string): Promise<string> {
    await this.initializeAdapters();
    const adapter = this.getAdapter(chain);
    return await adapter.getNonce(address);
  }

  public async getTransactionStatus(chain: SupportedChain, txHash: string): Promise<any> {
    await this.initializeAdapters();
    const adapter = this.getAdapter(chain);
    return await adapter.getTransactionStatus(txHash);
  }

  public async validateAddress(chain: SupportedChain, address: string): Promise<boolean> {
    await this.initializeAdapters();
    const adapter = this.getAdapter(chain);
    return adapter.validateAddress(address);
  }

  public async validateAmount(
    chain: SupportedChain,
    amount: string,
    token: string
  ): Promise<boolean> {
    await this.initializeAdapters();
    const adapter = this.getAdapter(chain);
    return await adapter.validateAmount(amount, token);
  }

  // Chain management
  public async getSupportedChains(): Promise<SupportedChain[]> {
    await this.initializeAdapters();
    return Array.from(this.adapters.keys());
  }

  public async getChainConfig(chain: SupportedChain): Promise<ChainConfig> {
    await this.initializeAdapters();
    const adapter = this.getAdapter(chain);
    return adapter.config;
  }

  public async isChainSupported(chain: string): Promise<boolean> {
    await this.initializeAdapters();
    return this.adapters.has(chain as SupportedChain);
  }

  /**
   * Get supported tokens for a specific chain (from dynamic config)
   */
  public async getSupportedTokens(chain: SupportedChain): Promise<string[]> {
    await this.initializeAdapters();
    const adapter = this.getAdapter(chain);
    const config = adapter.config as DynamicChainConfig;
    return config.tokens || [];
  }

  // OpenAPI-aligned endpoint methods
  /**
   * Health check endpoint
   */
  public async getHealth(): Promise<HealthResponse> {
    await this.initializeAdapters();
    const adapter = this.getAdapter('avalanche'); // Use first available adapter
    const httpClient = (adapter as any).httpClient;
    
    try {
      const response = await httpClient.get('/health');
      return response.data;
    } catch (error) {
      throw new SmoothSendError(
        `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        'HEALTH_CHECK_ERROR'
      );
    }
  }

  /**
   * Get supported blockchain networks
   */
  public async getSupportedChainsInfo(): Promise<ChainInfo[]> {
    await this.initializeAdapters();
    const adapter = this.getAdapter('avalanche'); // Use first available adapter
    const httpClient = (adapter as any).httpClient;
    
    try {
      const response = await httpClient.get('/chains');
      return response.data?.chains || [];
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get supported chains: ${error instanceof Error ? error.message : String(error)}`,
        'CHAINS_ERROR'
      );
    }
  }

  /**
   * Get supported tokens for a specific chain
   */
  public async getSupportedTokensForChain(chainName: string): Promise<TokenInfo[]> {
    await this.initializeAdapters();
    const adapter = this.getAdapter('avalanche'); // Use first available adapter
    const httpClient = (adapter as any).httpClient;
    
    try {
      const response = await httpClient.get(`/chains/${chainName}/tokens`);
      return response.data?.tokens || [];
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get supported tokens: ${error instanceof Error ? error.message : String(error)}`,
        'TOKENS_ERROR'
      );
    }
  }

  /**
   * Estimate gas cost for transfers
   */
  public async estimateGas(chainName: string, transfers: any[]): Promise<GasEstimateResponse> {
    await this.initializeAdapters();
    const adapter = this.getAdapter('avalanche'); // Use first available adapter
    const httpClient = (adapter as any).httpClient;
    
    try {
      const response = await httpClient.post('/estimate-gas', {
        chainName,
        transfers
      });
      return response.data;
    } catch (error) {
      throw new SmoothSendError(
        `Gas estimation failed: ${error instanceof Error ? error.message : String(error)}`,
        'GAS_ESTIMATION_ERROR'
      );
    }
  }

  /**
   * Get EIP-712 domain separator for a specific chain
   */
  public async getDomainSeparator(chainName: string): Promise<DomainSeparatorResponse> {
    await this.initializeAdapters();
    const adapter = this.getAdapter('avalanche'); // Use first available adapter
    const httpClient = (adapter as any).httpClient;
    
    try {
      const response = await httpClient.get(`/domain-separator/${chainName}`);
      return response.data;
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get domain separator: ${error instanceof Error ? error.message : String(error)}`,
        'DOMAIN_SEPARATOR_ERROR'
      );
    }
  }

  /**
   * Check transfer execution status
   */
  public async getTransferStatus(chainName: string, transferHash: string): Promise<TransferStatusResponse> {
    await this.initializeAdapters();
    const adapter = this.getAdapter('avalanche'); // Use first available adapter
    const httpClient = (adapter as any).httpClient;
    
    try {
      const response = await httpClient.get('/transfer-status', {
        params: {
          chainName,
          transferHash
        }
      });
      return response.data;
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get transfer status: ${error instanceof Error ? error.message : String(error)}`,
        'TRANSFER_STATUS_ERROR'
      );
    }
  }

  // Ecosystem-specific methods for advanced usage
  
  /**
   * Check if a chain belongs to a specific ecosystem
   */
  public getChainEcosystem(chain: SupportedChain): ChainEcosystem {
    return CHAIN_ECOSYSTEM_MAP[chain];
  }

  // Private helper methods
  private getAdapter(chain: SupportedChain): IChainAdapter {
    const adapter = this.adapters.get(chain);
    if (!adapter) {
      throw new SmoothSendError(
        `Chain '${chain}' is not supported`,
        'UNSUPPORTED_CHAIN',
        chain
      );
    }
    return adapter;
  }

  // Static utility methods (for static configs only)
  public static getSupportedChains(): SupportedChain[] {
    return ['avalanche', 'aptos-testnet'];
  }

  public static getChainConfig(chain: SupportedChain): ChainConfig {
    return getChainConfig(chain);
  }

  public static getAllChainConfigs(): Record<SupportedChain, ChainConfig> {
    return getAllChainConfigs();
  }
}

