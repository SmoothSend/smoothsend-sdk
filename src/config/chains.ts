import { ChainConfig, SupportedChain } from '../types';

// Minimal static configs - most data will be fetched dynamically from relayers
// Multi-chain architecture maintained for future expansion
export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  avalanche: {
    name: 'avalanche-fuji',
    displayName: 'Avalanche Fuji Testnet',
    chainId: 43113,
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    relayerUrl: 'https://smoothsendevm.onrender.com',
    explorerUrl: 'https://testnet.snowtrace.io',
    tokens: ['USDC'],
    nativeCurrency: {
      name: 'Avalanche',
      symbol: 'AVAX',
      decimals: 18
    }
  },
  'aptos-testnet': {
    name: 'aptos-testnet',
    displayName: 'Aptos Testnet',
    chainId: 2, // Aptos testnet chain ID
    rpcUrl: 'https://fullnode.testnet.aptoslabs.com/v1',
    relayerUrl: 'https://smoothsendrelayerworking.onrender.com/api/v1/relayer/',
    explorerUrl: 'https://explorer.aptoslabs.com',
    tokens: ['USDC', 'APT'],
    nativeCurrency: {
      name: 'Aptos',
      symbol: 'APT',
      decimals: 8
    }
  }
};

export function getChainConfig(chain: SupportedChain): ChainConfig {
  return CHAIN_CONFIGS[chain];
}

export function getAllChainConfigs(): Record<SupportedChain, ChainConfig> {
  return CHAIN_CONFIGS;
}

// These will be fetched dynamically from relayers
// Keep minimal fallbacks for offline scenarios
export const TOKEN_DECIMALS: Record<string, number> = {
  'USDC': 6,
  'AVAX': 18,
  'APT': 8
  // Additional token decimals will be added as new chains are supported
};

export function getTokenDecimals(token: string): number {
  return TOKEN_DECIMALS[token] || 18;
}

