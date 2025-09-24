// Main SDK export
export { SmoothSendSDK } from './core/SmoothSendSDK';

// Chain adapters
export { AvalancheAdapter } from './adapters/avalanche'; // Legacy - maintained for backward compatibility
export { EVMAdapter } from './adapters/evm'; // Multi-chain EVM adapter
export { AptosAdapter } from './adapters/aptos'; // Multi-chain Aptos adapter

// Types
export * from './types';

// Configuration
export { 
  getChainConfig, 
  getAllChainConfigs, 
  CHAIN_CONFIGS,
  TOKEN_DECIMALS,
  getTokenDecimals
} from './config/chains';

// Services
export { chainConfigService, ChainConfigService, DynamicChainConfig } from './services/chainConfigService';

// Utilities
export { HttpClient } from './utils/http';

// Version
export const VERSION = '2.0.0-beta.1';

// Default export
export { SmoothSendSDK as default } from './core/SmoothSendSDK';

