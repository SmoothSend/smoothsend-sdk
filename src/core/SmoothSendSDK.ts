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
import { AvalancheAdapter } from '../adapters/avalanche';
import { AptosAdapter } from '../adapters/aptos';

export class SmoothSendSDK {
  private adapters: Map<SupportedChain, IChainAdapter> = new Map();
  private eventListeners: EventListener[] = [];
  private config: SmoothSendConfig;

  constructor(config: SmoothSendConfig = {}) {
    this.config = {
      timeout: 30000,
      retries: 3,
      ...config
    };

    this.initializeAdapters();
  }

  private initializeAdapters(): void {
    const chainConfigs = getAllChainConfigs();
    
    // Initialize Avalanche adapter
    const avalancheConfig = {
      ...chainConfigs.avalanche,
      ...this.config.customChainConfigs?.avalanche
    };
    this.adapters.set('avalanche', new AvalancheAdapter(avalancheConfig));

    // Initialize Aptos adapter
    const aptosConfig = {
      ...chainConfigs.aptos,
      ...this.config.customChainConfigs?.aptos
    };
    this.adapters.set('aptos', new AptosAdapter(aptosConfig));
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
        ...signatureData.message,
        signature
      };
    } else if (request.chain === 'aptos') {
      // Aptos transaction signing
      const adapter = this.getAdapter(request.chain) as AptosAdapter;
      signature = await adapter.signTransaction(signer, signatureData.message);
      
      transferData = {
        ...signatureData.message,
        signature
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
      signatureType: request.chain === 'avalanche' ? 'EIP712' : 'APTOS'
    };

    return await this.executeTransfer(signedTransferData, request.chain);
  }

  // Batch transfer support
  public async batchTransfer(
    request: BatchTransferRequest,
    signer: any
  ): Promise<TransferResult[]> {
    if (request.chain !== 'avalanche') {
      throw new SmoothSendError(
        'Batch transfers currently only supported on Avalanche',
        'BATCH_NOT_SUPPORTED',
        request.chain
      );
    }

    const results: TransferResult[] = [];
    
    for (const transfer of request.transfers) {
      const result = await this.transfer(transfer, signer);
      results.push(result);
    }

    return results;
  }

  // Utility methods
  public async getBalance(
    chain: SupportedChain,
    address: string,
    token?: string
  ): Promise<TokenBalance[]> {
    const adapter = this.getAdapter(chain);
    return await adapter.getBalance(address, token);
  }

  public async getTokenInfo(chain: SupportedChain, token: string): Promise<TokenInfo> {
    const adapter = this.getAdapter(chain);
    return await adapter.getTokenInfo(token);
  }

  public async getNonce(chain: SupportedChain, address: string): Promise<string> {
    const adapter = this.getAdapter(chain);
    return await adapter.getNonce(address);
  }

  public async getTransactionStatus(chain: SupportedChain, txHash: string): Promise<any> {
    const adapter = this.getAdapter(chain);
    return await adapter.getTransactionStatus(txHash);
  }

  public validateAddress(chain: SupportedChain, address: string): boolean {
    const adapter = this.getAdapter(chain);
    return adapter.validateAddress(address);
  }

  public async validateAmount(
    chain: SupportedChain,
    amount: string,
    token: string
  ): Promise<boolean> {
    const adapter = this.getAdapter(chain);
    return await adapter.validateAmount(amount, token);
  }

  // Chain management
  public getSupportedChains(): SupportedChain[] {
    return Array.from(this.adapters.keys());
  }

  public getChainConfig(chain: SupportedChain): ChainConfig {
    const adapter = this.getAdapter(chain);
    return adapter.config;
  }

  public isChainSupported(chain: string): chain is SupportedChain {
    return this.adapters.has(chain as SupportedChain);
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

  // Static utility methods
  public static getSupportedChains(): SupportedChain[] {
    return ['avalanche', 'aptos'];
  }

  public static getChainConfig(chain: SupportedChain, testnet: boolean = false): ChainConfig {
    return getChainConfig(chain, testnet);
  }

  public static getAllChainConfigs(testnet: boolean = false): Record<SupportedChain, ChainConfig> {
    return getAllChainConfigs(testnet);
  }
}

