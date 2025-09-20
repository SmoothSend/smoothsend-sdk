import { ChainConfig, SupportedChain } from '../types';

export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  avalanche: {
    name: 'Avalanche Fuji',
    chainId: 43113,
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    relayerUrl: 'https://avax-testnet.smoothsend.xyz',
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
    relayerUrl: 'https://testnet.smoothsend.xyz',
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

