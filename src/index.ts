// Main SDK export
export { SmoothSendSDK } from './core/SmoothSendSDK';

// Chain adapters
export { AvalancheAdapter } from './adapters/avalanche';
export { AptosAdapter } from './adapters/aptos';

// Types
export * from './types';

// Configuration
export { 
  getChainConfig, 
  getAllChainConfigs, 
  CHAIN_CONFIGS,
  TOKEN_DECIMALS,
  SUPPORTED_TOKENS_BY_CHAIN,
  getTokenDecimals,
  getSupportedTokens
} from './config/chains';

// Utilities
export { HttpClient } from './utils/http';

// Version
export const VERSION = '1.0.0';

// Default export
export { SmoothSendSDK as default } from './core/SmoothSendSDK';

