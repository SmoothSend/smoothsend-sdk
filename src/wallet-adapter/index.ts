/**
 * Wallet Adapter Integration
 *
 * This module provides seamless integration with the Aptos Wallet Adapter,
 * enabling gasless transactions with just a few lines of code.
 *
 * @example — Simple setup with automatic gasless/fallback routing
 * ```tsx
 * import { SmoothSendTransactionSubmitter, useSmoothSend } from '@smoothsend/sdk';
 *
 * // 1. Create once at module scope
 * const submitter = new SmoothSendTransactionSubmitter({ apiKey: 'pk_nogas_...', network: 'mainnet' });
 *
 * // 2. WalletProvider — no transactionSubmitter needed in dappConfig
 * <AptosWalletAdapterProvider dappConfig={{ network: Network.MAINNET }}>
 *   {children}
 * </AptosWalletAdapterProvider>
 *
 * // 3. In components — swap useWallet() → useSmoothSend()
 * const { signAndSubmitTransaction } = useSmoothSend(submitter);
 * await signAndSubmitTransaction({ data: { function: '0x123::module::fn', functionArguments: [] } });
 * // Sponsored functions → gasless. Others → user pays. Automatic.
 * ```
 *
 * @example — Legacy setup (still works, all functions must be sponsored)
 * ```tsx
 * const submitter = new SmoothSendTransactionSubmitter({ apiKey: 'pk_nogas_...', network: 'mainnet' });
 * <AptosWalletAdapterProvider dappConfig={{ network, transactionSubmitter: submitter }}>
 * const { signAndSubmitTransaction } = useWallet(); // every call goes gasless
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

export {
  useSmoothSend,
  type UseSmoothSendResult,
} from './useSmoothSend';
