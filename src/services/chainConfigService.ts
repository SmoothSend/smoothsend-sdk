import { ChainConfig, SupportedChain, ApiResponse } from '../types';
import { HttpClient } from '../utils/http';

export interface DynamicChainConfig extends ChainConfig {
  tokens: string[];
  contractAddress?: string;
  feeSettings?: {
    baseFeeBps: number;
    minFeeWei: string;
    maxFeeBps: number;
  };
}

export interface RelayerChainInfo {
  name: string;
  displayName: string;
  chainId: string | number;
  explorerUrl: string;
  tokens: string[];
  contractAddress?: string;
  rpcUrl?: string;
}

export class ChainConfigService {
  private configCache: Map<string, DynamicChainConfig> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Fetch chain configuration from relayer's API endpoints
   */
  async fetchChainConfig(relayerUrl: string, chainName?: string): Promise<DynamicChainConfig[]> {
    const cacheKey = `${relayerUrl}:${chainName || 'all'}`;
    const now = Date.now();

    // Check cache first
    if (this.configCache.has(cacheKey) && this.cacheExpiry.get(cacheKey)! > now) {
      const cached = this.configCache.get(cacheKey);
      return cached ? [cached] : [];
    }

    try {
      const httpClient = new HttpClient(relayerUrl);
      const response = await httpClient.get('/chains');

      if (!response.success || !response.data?.chains) {
        throw new Error(`Failed to fetch chains from ${relayerUrl}: ${response.error || 'No data'}`);
      }

      const chains: RelayerChainInfo[] = response.data.chains;
      const configs: DynamicChainConfig[] = [];

      for (const chain of chains) {
        const config = this.mapRelayerChainToConfig(chain, relayerUrl);
        configs.push(config);

        // Cache individual chain configs
        const chainCacheKey = `${relayerUrl}:${chain.name}`;
        this.configCache.set(chainCacheKey, config);
        this.cacheExpiry.set(chainCacheKey, now + this.CACHE_TTL);
      }

      // Cache all chains response
      this.cacheExpiry.set(cacheKey, now + this.CACHE_TTL);

      return chainName ? configs.filter(c => this.matchesChainName(c, chainName)) : configs;
    } catch (error) {
      console.warn(`Failed to fetch chain config from ${relayerUrl}:`, error);
      throw error;
    }
  }

  /**
   * Get configuration for a specific supported chain
   */
  async getChainConfig(
    chain: SupportedChain, 
    fallbackConfig?: ChainConfig
  ): Promise<DynamicChainConfig> {
    const relayerUrl = this.getRelayerUrlForChain(chain, fallbackConfig);
    
    try {
      const configs = await this.fetchChainConfig(relayerUrl);
      const config = configs.find(c => this.matchesChain(c, chain));
      
      if (config) {
        return config;
      }
    } catch (error) {
      console.warn(`Failed to fetch dynamic config for ${chain}, using fallback:`, error);
    }

    // Fallback to static config if dynamic fetch fails
    if (fallbackConfig) {
      return {
        ...fallbackConfig,
        tokens: this.getDefaultTokensForChain(chain),
      };
    }

    throw new Error(`No configuration available for chain: ${chain}`);
  }

  /**
   * Get all available chain configurations
   */
  async getAllChainConfigs(fallbackConfigs?: Record<SupportedChain, ChainConfig>): Promise<Record<string, DynamicChainConfig>> {
    const configs: Record<string, DynamicChainConfig> = {};
    
    // Try to fetch from each known relayer - prioritize Avalanche relayer as requested
    const relayerUrls = [
      'https://smoothsendevm.onrender.com',      // Avalanche relayer (priority)
      'https://app.smoothsend.xyz/api/v1/relayer' // Aptos relayer
    ];

    for (const relayerUrl of relayerUrls) {
      try {
        const chainConfigs = await this.fetchChainConfig(relayerUrl);
        for (const config of chainConfigs) {
          const chainKey = this.getChainKey(config);
          if (chainKey) {
            // Don't override existing configs (first relayer wins - Avalanche priority)
            if (!configs[chainKey]) {
              configs[chainKey] = config;
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch from ${relayerUrl}:`, error);
      }
    }

    // Add fallback configs for any missing chains
    if (fallbackConfigs) {
      for (const [chain, fallback] of Object.entries(fallbackConfigs)) {
        if (!configs[chain]) {
          configs[chain] = {
            ...fallback,
            tokens: this.getDefaultTokensForChain(chain as SupportedChain),
          };
        }
      }
    }

    return configs;
  }

  /**
   * Clear the configuration cache
   */
  clearCache(): void {
    this.configCache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Set custom cache TTL
   */
  setCacheTtl(ttlMs: number): void {
    // Update the cache TTL for future requests
    Object.defineProperty(this, 'CACHE_TTL', { value: ttlMs });
  }

  private mapRelayerChainToConfig(chain: RelayerChainInfo, relayerUrl: string): DynamicChainConfig {
    return {
      name: chain.displayName || chain.name,
      chainId: chain.chainId,
      rpcUrl: chain.rpcUrl || this.getDefaultRpcUrl(chain.name),
      relayerUrl: relayerUrl,
      explorerUrl: chain.explorerUrl,
      nativeCurrency: this.getNativeCurrencyForChain(chain.name),
      tokens: chain.tokens || [],
      contractAddress: chain.contractAddress,
    };
  }

  private getRelayerUrlForChain(chain: SupportedChain, fallbackConfig?: ChainConfig): string {
    if (fallbackConfig?.relayerUrl) {
      return fallbackConfig.relayerUrl;
    }

    // Default relayer URLs - prioritize Avalanche as requested
    switch (chain) {
      case 'avalanche':
        return 'https://smoothsendevm.onrender.com';
      case 'aptos':
        return 'https://app.smoothsend.xyz/api/v1/relayer';
      default:
        // For unknown chains, try Avalanche relayer first (EVM-compatible)
        console.warn(`Unknown chain ${chain}, defaulting to Avalanche relayer`);
        return 'https://smoothsendevm.onrender.com';
    }
  }

  private matchesChain(config: DynamicChainConfig, chain: SupportedChain): boolean {
    const chainName = config.name.toLowerCase();
    
    switch (chain) {
      case 'avalanche':
        return chainName.includes('avalanche') || chainName.includes('fuji') || chainName.includes('avax');
      case 'aptos':
        return chainName.includes('aptos');
      default:
        return false;
    }
  }

  private matchesChainName(config: DynamicChainConfig, chainName: string): boolean {
    return config.name.toLowerCase().includes(chainName.toLowerCase());
  }

  private getChainKey(config: DynamicChainConfig): SupportedChain | null {
    const name = config.name.toLowerCase();
    
    if (name.includes('avalanche') || name.includes('fuji') || name.includes('avax')) {
      return 'avalanche';
    }
    if (name.includes('aptos')) {
      return 'aptos';
    }
    
    return null;
  }

  private getDefaultRpcUrl(chainName: string): string {
    const name = chainName.toLowerCase();
    
    if (name.includes('avalanche') || name.includes('fuji')) {
      return 'https://api.avax-test.network/ext/bc/C/rpc';
    }
    if (name.includes('aptos')) {
      return 'https://fullnode.testnet.aptoslabs.com/v1';
    }
    
    return '';
  }

  private getNativeCurrencyForChain(chainName: string): { name: string; symbol: string; decimals: number } {
    const name = chainName.toLowerCase();
    
    if (name.includes('avalanche') || name.includes('fuji')) {
      return {
        name: 'Avalanche',
        symbol: 'AVAX',
        decimals: 18
      };
    }
    if (name.includes('aptos')) {
      return {
        name: 'Aptos',
        symbol: 'APT',
        decimals: 8
      };
    }
    
    return {
      name: 'Unknown',
      symbol: 'UNK',
      decimals: 18
    };
  }

  private getDefaultTokensForChain(chain: SupportedChain): string[] {
    switch (chain) {
      case 'avalanche':
        return ['USDC'];
      case 'aptos':
        return ['APT', 'USDC'];
      default:
        return [];
    }
  }
}

// Export singleton instance
export const chainConfigService = new ChainConfigService();