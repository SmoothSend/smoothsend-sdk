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
 * Aptos:
 * ```typescript
 * const sdk = new SmoothSendSDK({ apiKey: 'pk_nogas_xxx', network: 'testnet' });
 * const result = await sdk.transfer({ from, to, token: 'USDC', amount: '1000000', chain: 'aptos-testnet' }, aptosWallet);
 * ```
 *
 * @example
 * Stellar (same API):
 * ```typescript
 * const sdk = new SmoothSendSDK({ apiKey: 'pk_nogas_xxx', network: 'testnet' });
 * const result = await sdk.transfer({ from, to, token: 'XLM', amount: '100', chain: 'stellar-testnet' }, stellarWallet);
 * ```
 */

// Main SDK export
export { SmoothSendSDK } from './core/SmoothSendSDK';

// Wallet Adapter Integration (EASIEST WAY TO INTEGRATE!)
// Use this for: testnet (free), mainnet with paid tier, ANY transaction type
export { 
  SmoothSendTransactionSubmitter, 
  createSmoothSendSubmitter,
  type SmoothSendTransactionSubmitterConfig,
  type TransactionSubmitter,
} from './wallet-adapter';

// Script Composer Integration (For fee-in-token transfers)
// Use this for: mainnet with free tier, token transfers with fee deducted from token
export {
  ScriptComposerClient,
  createScriptComposerClient,
  type ScriptComposerConfig,
  type BuildTransferParams,
  type BuildTransferResult,
  type SubmitSignedTransactionParams,
  type SubmitTransactionResult,
  type FeeEstimateResult,
} from './script-composer';

// Chain adapters
export { AptosAdapter } from './adapters/aptos';
export { StellarAdapter } from './adapters/stellar';

// Types - Export all types from types/index.ts
export * from './types';

// Utilities
export { HttpClient } from './utils/http';

/**
 * SDK version
 * @public
 */
export const VERSION = '1.1.0'; // Multi-chain: Aptos + Stellar

// Default export
export { SmoothSendSDK as default } from './core/SmoothSendSDK';

