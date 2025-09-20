import {
  SupportedChain,
  ChainConfig,
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
  IChainAdapter
} from '../types';
import { getChainConfig, getAllChainConfigs } from '../config/chains';
import { chainConfigService, DynamicChainConfig } from '../services/chainConfigService';
import { AvalancheAdapter } from '../adapters/avalanche';
// Additional adapters will be imported here as they are added

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
    const staticConfigs = getAllChainConfigs(); // Fallback configs
    
    try {
      // Fetch dynamic configurations
      const dynamicConfigs = await chainConfigService.getAllChainConfigs(staticConfigs);
      
      // Initialize adapters with dynamic configs
      for (const [chainKey, dynamicConfig] of Object.entries(dynamicConfigs)) {
        const chain = chainKey as SupportedChain;
        const finalConfig = {
          ...dynamicConfig,
          ...this.config.customChainConfigs?.[chain]
        };

        this.createAdapter(chain, finalConfig);
      }

      // Ensure we have at least the core supported chains
      this.ensureCoreChains(staticConfigs);
    } catch (error) {
      console.error('Failed to initialize dynamic adapters:', error);
      throw error;
    }
  }

  private initializeStaticAdapters(): void {
    const chainConfigs = getAllChainConfigs();
    
    // Initialize Avalanche adapter
    const avalancheConfig = {
      ...chainConfigs.avalanche,
      ...this.config.customChainConfigs?.avalanche
    };
    this.createAdapter('avalanche', avalancheConfig);

    // Additional adapters will be initialized here as they are added
  }

  private createAdapter(chain: SupportedChain, config: ChainConfig | DynamicChainConfig): void {
    switch (chain) {
      case 'avalanche':
        this.adapters.set(chain, new AvalancheAdapter(config));
        break;
      default:
        console.warn(`Unknown chain type: ${chain}`);
    }
  }

  private ensureCoreChains(staticConfigs: Record<SupportedChain, ChainConfig>): void {
    const coreChains: SupportedChain[] = ['avalanche'];
    
    for (const chain of coreChains) {
      if (!this.adapters.has(chain)) {
        console.warn(`Missing dynamic config for ${chain}, using static fallback`);
        const config = {
          ...staticConfigs[chain],
          ...this.config.customChainConfigs?.[chain]
        };
        this.createAdapter(chain, config);
      }
    }
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

    if (request.chain === 'avalanche') {
      // EIP-712 signing for Avalanche
      signature = await signer.signTypedData(
        signatureData.domain,
        signatureData.types,
        signatureData.message
      );
      
      transferData = {
        chainName: 'avalanche-fuji',
        from: request.from,
        to: request.to,
        tokenSymbol: request.token,
        amount: request.amount,
        relayerFee: quote.relayerFee,
        nonce: signatureData.message.nonce,
        deadline: signatureData.message.deadline,
        // Note: permitData would be added here if implementing ERC-2612 permit signatures
      };
    } else {
      throw new SmoothSendError(
        `Unsupported chain: ${request.chain}`,
        'UNSUPPORTED_CHAIN'
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
      signatureType: 'EIP712' // Currently only EIP712 supported
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
        
        // Sign the data
        let signature: string;
        let transferData: any;

        if (transfer.chain === 'avalanche') {
          // EIP-712 signing for Avalanche
          signature = await signer.signTypedData(
            signatureData.domain,
            signatureData.types,
            signatureData.message
          );
          
          transferData = {
            chainName: 'avalanche-fuji',
            from: transfer.from,
            to: transfer.to,
            tokenSymbol: transfer.token,
            amount: transfer.amount,
            relayerFee: quote.relayerFee,
            nonce: signatureData.message.nonce,
            deadline: signatureData.message.deadline,
            // Note: permitData would be added here if implementing ERC-2612 permit signatures
          };
        } else {
          throw new SmoothSendError(
            `Unsupported chain: ${transfer.chain}`,
            'UNSUPPORTED_CHAIN'
          );
        }

        signedTransfers.push({
          transferData,
          signature,
          signatureType: 'EIP712' // Currently only EIP712 supported
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
    return ['avalanche']; // Multi-chain architecture maintained for future expansion
  }

  public static getChainConfig(chain: SupportedChain): ChainConfig {
    return getChainConfig(chain);
  }

  public static getAllChainConfigs(): Record<SupportedChain, ChainConfig> {
    return getAllChainConfigs();
  }
}

