/**
 * SmoothSend SDK v2.0
 * 
 * Multi-chain gasless transaction SDK for seamless dApp integration
 * 
 * @remarks
 * The SDK provides a simple interface for executing gasless token transfers
 * across multiple blockchain networks. All requests route through the proxy
 * worker at proxy.smoothsend.xyz with API key authentication.
 * 
 * @packageDocumentation
 * 
 * @example
 * Basic usage:
 * ```typescript
 * import { SmoothSendSDK } from '@smoothsend/sdk';
 * 
 * const sdk = new SmoothSendSDK({
 *   apiKey: 'no_gas_abc123...',
 *   network: 'testnet'
 * });
 * 
 * const result = await sdk.transfer({
 *   from: '0x123...',
 *   to: '0x456...',
 *   token: 'USDC',
 *   amount: '1000000',
 *   chain: 'aptos-testnet'
 * }, wallet);
 * 
 * console.log('Transaction:', result.txHash);
 * ```
 */

// Main SDK export
export { SmoothSendSDK } from './core/SmoothSendSDK';

// Wallet Adapter Integration (EASIEST WAY TO INTEGRATE!)
export { 
  SmoothSendTransactionSubmitter, 
  createSmoothSendSubmitter,
  type SmoothSendTransactionSubmitterConfig,
  type TransactionSubmitter,
} from './wallet-adapter';

// Chain adapters
export { AptosAdapter } from './adapters/aptos'; // Multi-chain Aptos adapter
// Note: EVM adapter will be implemented in future phase

// Types - Export all types from types/index.ts
export * from './types';

// Utilities
export { HttpClient } from './utils/http';

/**
 * SDK version
 * @public
 */
export const VERSION = '2.1.0'; // Updated for wallet adapter support

// Default export
export { SmoothSendSDK as default } from './core/SmoothSendSDK';

