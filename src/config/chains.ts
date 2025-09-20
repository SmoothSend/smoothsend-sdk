import { ChainConfig, SupportedChain } from '../types';

// Minimal static configs - most data will be fetched dynamically from relayers
export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  avalanche: {
    name: 'Avalanche Fuji Testnet',
    chainId: 43113,
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    relayerUrl: 'https://smoothsendevm.onrender.com',
    explorerUrl: 'https://testnet.snowtrace.io',
    nativeCurrency: {
      name: 'Avalanche',
      symbol: 'AVAX',
      decimals: 18
    }
  },
  aptos: {
    name: 'Aptos Testnet',
    chainId: '2',
    rpcUrl: 'https://fullnode.testnet.aptoslabs.com/v1',
    relayerUrl: 'https://app.smoothsend.xyz/api/v1/relayer',
    explorerUrl: 'https://explorer.aptoslabs.com/?network=testnet',
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
  'USDT': 6,
  'APT': 8,
  'AVAX': 18
};

export function getTokenDecimals(token: string): number {
  return TOKEN_DECIMALS[token] || 18;
}

