/**
 * useSmoothSend — React hook for automatic gasless / user-pays-gas routing
 *
 * Drop-in replacement for useWallet()'s signAndSubmitTransaction.
 * Fetches the project's sponsored-functions list from the gateway on mount
 * and routes each transaction automatically:
 *   - Function in allowlist → fee-payer gasless path via SmoothSend
 *   - Function not in allowlist → regular wallet submission (user pays gas)
 *
 * Requires: react >=17, @aptos-labs/wallet-adapter-react >=3, @aptos-labs/ts-sdk >=1
 *
 * @example
 * ```tsx
 * // Replace useWallet() with useSmoothSend() where you submit transactions.
 * // No other changes needed.
 *
 * const { signAndSubmitTransaction } = useSmoothSend(submitter);
 * await signAndSubmitTransaction({ data: { function: '0x1::coin::transfer', functionArguments: [to, amount] } });
 * ```
 */

import { useCallback, useEffect } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import type { SmoothSendTransactionSubmitter } from './SmoothSendTransactionSubmitter';

export interface UseSmoothSendResult {
  /**
   * Smart signAndSubmitTransaction — same signature as the wallet adapter's version.
   * Sponsored functions go gasless via SmoothSend; others fall back to user-pays-gas.
   */
  signAndSubmitTransaction: (input: { data: any; options?: any }) => Promise<any>;
}

/**
 * useSmoothSend
 *
 * @param submitter - A SmoothSendTransactionSubmitter instance (created once, e.g. at module scope)
 */
export function useSmoothSend(submitter: SmoothSendTransactionSubmitter): UseSmoothSendResult {
  const {
    account,
    signTransaction,
    signAndSubmitTransaction: walletSignAndSubmit,
  } = useWallet();

  // Prefetch the sponsored-functions list on mount so the first transaction
  // benefits from an already-populated cache with no added latency.
  useEffect(() => {
    submitter.getSponsoredFunctions().catch(() => {
      // Fail-open: getSponsoredFunctions already handles errors internally
    });
  }, [submitter]);

  const signAndSubmitTransaction = useCallback(
    async (input: { data: any; options?: any }) => {
      if (!account?.address) {
        throw new Error('[SmoothSend] Wallet not connected');
      }

      const functionName: string = input?.data?.function ?? '';

      // signTransaction (sign-only) must be available for the gasless path.
      // Most modern wallets (Petra, Nightly) support it. If absent, fall through.
      const canGoGasless = typeof signTransaction === 'function';

      const sponsored = canGoGasless && (await submitter.isSponsored(functionName));

      if (sponsored && signTransaction) {
        try {
          const config = submitter.getConfig();
          const network = config.network === 'mainnet' ? Network.MAINNET : Network.TESTNET;
          const aptos = new Aptos(new AptosConfig({ network }));

          // Build transaction with fee-payer placeholder (AccountAddress.ZERO)
          const transaction = await aptos.transaction.build.simple({
            sender: account.address.toString(),
            data: input.data,
            options: input.options,
            withFeePayer: true,
          });

          // Wallet signs sender portion only (no gas required from user)
          // Cast to any: wallet-adapter-react ships its own bundled @aptos-labs/ts-sdk,
          // so its signTransaction type is structurally incompatible with ours at compile time.
          const senderAuthenticator = await signTransaction(transaction as any);

          // Relayer signs as fee payer and submits
          return await submitter.submitTransaction({
            aptosConfig: aptos.config as any,
            transaction: transaction as any,
            senderAuthenticator: senderAuthenticator as any,
          });
        } catch (err: any) {
          // If the relayer rejects (e.g. function not in allowlist after a config change),
          // fall through to user-pays-gas path rather than surfacing a hard error.
          if (
            err?.message?.includes('SPONSORSHIP') ||
            err?.message?.includes('not allowed') ||
            err?.message?.includes('403') ||
            err?.message?.includes('gasless')
          ) {
            console.warn('[SmoothSend] Sponsorship rejected, falling back to user-pays-gas:', err.message);
            return walletSignAndSubmit(input);
          }
          throw err;
        }
      }

      // Not sponsored or signTransaction unavailable → regular wallet submission
      return walletSignAndSubmit(input);
    },
    [account, signTransaction, walletSignAndSubmit, submitter],
  );

  return { signAndSubmitTransaction };
}
