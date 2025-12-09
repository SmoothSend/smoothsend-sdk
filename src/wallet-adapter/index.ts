/**
 * Wallet Adapter Integration
 * 
 * This module provides seamless integration with the Aptos Wallet Adapter,
 * enabling gasless transactions with just a few lines of code.
 * 
 * @example
 * ```typescript
 * import { SmoothSendTransactionSubmitter } from '@smoothsend/sdk';
 * 
 * const submitter = new SmoothSendTransactionSubmitter({
 *   apiKey: 'pk_nogas_your_key_here',
 *   network: 'testnet'
 * });
 * 
 * // Use in AptosWalletAdapterProvider's dappConfig.transactionSubmitter
 * ```
 */

export { 
  SmoothSendTransactionSubmitter, 
  createSmoothSendSubmitter,
  type SmoothSendTransactionSubmitterConfig,
  type TransactionSubmitter,
  type AptosConfig,
  type PendingTransactionResponse,
  type AnyRawTransaction,
  type AccountAuthenticator,
} from './SmoothSendTransactionSubmitter';
