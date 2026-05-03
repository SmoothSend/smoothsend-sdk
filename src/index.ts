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
  useSmoothSend,
  type UseSmoothSendResult,
} from './wallet-adapter';

// Avalanche ERC-4337 via gateway (`SmoothSendAvaxSubmitter` — exported also as `AvaxSubmitter`)
export {
  AvaxSubmitter,
  SmoothSendAvaxSubmitter,
  createSmoothSendAvaxSubmitter,
  SmoothSendAvaxProvider,
  useSmoothSendAvax,
  useSmoothSendAvaxContext,
  encodeAvaxExecuteCalldata,
  hashUserOperationAvax,
  readAvaxSenderNonce,
  userOperationAvaxToViem,
  avaxExecuteAbi,
  SIMPLE_ACCOUNT_FACTORY_ABI,
  encodeCreateAccountFactoryData,
  predictSimpleAccountAddress,
  ENTRY_POINT_V07_ADDRESS,
  fetchAvaxAaPublicDefaults,
  type AvaxAaPublicDefaults,
  type SmoothSendAvaxSubmitterConfig,
  type SubmitSponsoredAvaxUserOpOptions,
  type SmoothSendAvaxContextValue,
  type UseSmoothSendAvaxParams,
  type AvaxSponsorshipMode,
  type GasEstimateAvax,
  type PaymasterSignRequestAvax,
  type PaymasterSignResponseAvax,
  type SponsoredUserOpDraftAvax,
  type UserOperationAvax,
  type UserOperationReceiptAvax,
} from './avax';

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

// Chain adapters
export { AptosAdapter } from './adapters/aptos';
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

/**
 * SDK version
 * @public
 */
export const VERSION = '2.2.1';

// Default export
export { SmoothSendSDK as default } from './core/SmoothSendSDK';

