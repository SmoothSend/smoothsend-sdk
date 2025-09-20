// Main SDK export
export { SmoothSendSDK } from './core/SmoothSendSDK';

// Chain adapters
export { AvalancheAdapter } from './adapters/avalanche';
// Additional adapters will be exported here as they are added

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
export const VERSION = '1.0.0-beta.4';

// Default export
export { SmoothSendSDK as default } from './core/SmoothSendSDK';

