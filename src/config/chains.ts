import { ChainConfig, SupportedChain } from '../types';

export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  avalanche: {
    name: 'Avalanche',
    chainId: 43114,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    relayerUrl: 'https://avax.smoothsend.xyz',
    explorerUrl: 'https://snowtrace.io',
    nativeCurrency: {
      name: 'Avalanche',
      symbol: 'AVAX',
      decimals: 18
    }
  },
  aptos: {
    name: 'Aptos',
    chainId: '1',
    rpcUrl: 'https://fullnode.mainnet.aptoslabs.com/v1',
    relayerUrl: 'https://smoothsend.xyz',
    explorerUrl: 'https://explorer.aptoslabs.com',
    nativeCurrency: {
      name: 'Aptos',
      symbol: 'APT',
      decimals: 8
    }
  }
};

export const TESTNET_CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
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

export function getChainConfig(chain: SupportedChain, testnet: boolean = false): ChainConfig {
  const configs = testnet ? TESTNET_CHAIN_CONFIGS : CHAIN_CONFIGS;
  return configs[chain];
}

export function getAllChainConfigs(testnet: boolean = false): Record<SupportedChain, ChainConfig> {
  return testnet ? TESTNET_CHAIN_CONFIGS : CHAIN_CONFIGS;
}

