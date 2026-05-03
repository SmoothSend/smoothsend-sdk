/**
 * @smoothsend/sdk/stellar
 * 
 * Stellar-only entry point for smaller bundle sizes.
 * Only includes Stellar functionality (classic and Soroban C-Address).
 * 
 * @example
 * ```typescript
 * import { SmoothSendSDK } from '@smoothsend/sdk/stellar';
 * 
 * const sdk = new SmoothSendSDK({ 
 *   apiKey: 'pk_nogas_xxx', 
 *   network: 'testnet' 
 * });
 * 
 * // Classic Stellar gasless transfer
 * const result = await sdk.transfer({ 
 *   from, 
 *   to, 
 *   token: 'XLM', 
 *   amount: '100', 
 *   chain: 'stellar-testnet' 
 * }, stellarWallet);
 * 
 * // C-Address (Soroban Smart Account) operations
 * const { cAddress } = await sdk.stellar.cAddress.create('GABCD...');
 * const { balances } = await sdk.stellar.cAddress.getBalances(cAddress);
 * ```
 */

// Main SDK export (supports all chains, but primarily used for Stellar)
export { SmoothSendSDK } from './core/SmoothSendSDK';

// Stellar chain adapter
export { StellarAdapter } from './adapters/stellar';

// C-Address (Soroban Smart Account) adapter & types
export {
  StellarCAddressAdapter,
  type CAddressCreateResult,
  type CAddressLookupResult,
  type CAddressBalance,
  type CAddressBalanceResult,
  type CAddressBuildTransferResult,
  type CAddressSubmitResult,
  type CAddressTransaction,
  type CAddressHistoryResult,
  type CAddressHealthResult,
} from './adapters/stellar-c-address';

// Types - Export all types from types/index.ts
export * from './types';

// Utilities
export { HttpClient } from './utils/http';

// Version
export { VERSION } from './version';

// Default export
export { SmoothSendSDK as default } from './core/SmoothSendSDK';
