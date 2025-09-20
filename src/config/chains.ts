import { ChainConfig, SupportedChain } from '../types';

export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  avalanche: {
    name: 'Avalanche Fuji',
    chainId: 43113,
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    relayerUrl: 'https://smoothsendevm.onrender.com/',
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
    relayerUrl: 'https://app.smoothsend.xyz',
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

// Token utilities
export const TOKEN_DECIMALS: Record<string, number> = {
  'USDC': 6,
  'USDT': 6,
  'APT': 8,
  'AVAX': 18
};

export const SUPPORTED_TOKENS_BY_CHAIN: Record<SupportedChain, string[]> = {
  avalanche: ['USDC', 'USDT', 'AVAX'],
  aptos: ['APT', 'USDC']
};

export function getTokenDecimals(token: string): number {
  return TOKEN_DECIMALS[token] || 18;
}

export function getSupportedTokens(chain: SupportedChain): string[] {
  return SUPPORTED_TOKENS_BY_CHAIN[chain] || [];
}

