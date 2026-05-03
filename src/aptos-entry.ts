/**
 * @smoothsend/sdk/aptos
 * 
 * Aptos-only entry point for smaller bundle sizes.
 * Only includes Aptos functionality and @aptos-labs dependencies.
 * 
 * @example
 * ```typescript
 * import { SmoothSendTransactionSubmitter, useSmoothSend } from '@smoothsend/sdk/aptos';
 * 
 * const submitter = new SmoothSendTransactionSubmitter({ 
 *   apiKey: 'pk_nogas_xxx', 
 *   network: 'mainnet' 
 * });
 * 
 * // In components
 * const { signAndSubmitTransaction } = useSmoothSend(submitter);
 * await signAndSubmitTransaction({ 
 *   data: { 
 *     function: '0x123::module::fn', 
 *     functionArguments: [] 
 *   } 
 * });
 * ```
 */

// Main SDK export (supports all chains, but primarily used for Aptos)
export { SmoothSendSDK } from './core/SmoothSendSDK';

// Wallet Adapter Integration (EASIEST WAY TO INTEGRATE!)
// Use this for: testnet (free), mainnet with paid tier, ANY transaction type
export {
  SmoothSendTransactionSubmitter,
  createSmoothSendSubmitter,
  type SmoothSendTransactionSubmitterConfig,
  type TransactionSubmitter,
  useSmoothSend,
  type UseSmoothSendResult,
} from './wallet-adapter';

// Session Keys — invisible web3 (no wallet popup after setup)
// Uses Aptos AIP-103 Permissioned Signers, enforced on-chain, no custom contract needed
export {
  SmoothSendSession,
  type CreateSessionOptions,
  type SessionInfo,
  type SubmitResult,
} from './session';

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

// True Gasless Integration (For strict backend server environments)
// Use this for: Node.js backends executing 100% sponsored transactions using a generic Payload
export {
  TrueGaslessClient,
  createTrueGaslessClient,
  type TrueGaslessConfig,
  type ExecuteGaslessParams,
  type ExecuteGaslessResult,
} from './true-gasless';

// Aptos chain adapter
export { AptosAdapter } from './adapters/aptos';

// Types - Export all types from types/index.ts
export * from './types';

// Utilities
export { HttpClient } from './utils/http';

// Version
export { VERSION } from './version';

// Default export
export { SmoothSendSDK as default } from './core/SmoothSendSDK';
