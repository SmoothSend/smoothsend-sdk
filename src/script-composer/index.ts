/**
 * Script Composer Module
 * 
 * For gasless token transfers with fee deducted from the token.
 * 
 * @remarks
 * Use ScriptComposerClient when:
 * - You're on mainnet with free tier (fee must be deducted from token)
 * - You want the fee paid in the same token being transferred
 * - You're building a token transfer focused application
 * 
 * Use SmoothSendTransactionSubmitter (wallet-adapter) when:
 * - You're on testnet (always free)
 * - You're on mainnet with paid tier (zero fees)
 * - You need to support ANY transaction (swaps, NFTs, contracts)
 * 
 * @example
 * ```typescript
 * import { ScriptComposerClient } from '@smoothsend/aptos-sdk';
 * 
 * const client = new ScriptComposerClient({
 *   apiKey: 'pk_nogas_xxx',
 *   network: 'mainnet'
 * });
 * 
 * // Build transfer with fee deduction
 * const { transactionBytes, fee } = await client.buildTransfer({
 *   sender: wallet.address,
 *   recipient: '0x123...',
 *   amount: '1000000',
 *   assetType: USDC_ADDRESS,
 *   decimals: 6,
 *   symbol: 'USDC'
 * });
 * 
 * // Sign and submit
 * const signed = await wallet.signTransaction(transactionBytes);
 * const result = await client.submitSignedTransaction(signed);
 * ```
 */

export {
  ScriptComposerClient,
  createScriptComposerClient,
  type ScriptComposerConfig,
  type BuildTransferParams,
  type BuildTransferResult,
  type SubmitSignedTransactionParams,
  type SubmitTransactionResult,
  type FeeEstimateResult,
} from './ScriptComposerClient';
