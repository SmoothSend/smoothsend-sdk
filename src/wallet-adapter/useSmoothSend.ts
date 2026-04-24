/**
 * useSmoothSend — React hook for automatic gasless / user-pays-gas routing
 *
 * Drop-in replacement for useWallet()'s signAndSubmitTransaction.
 * Fetches the project's sponsored-functions list from the gateway on mount
 * and routes each transaction automatically:
 *   - Function in allowlist → fee-payer gasless path via SmoothSend
 *   - Function not in allowlist → regular wallet submission (user pays gas)
 *
 * When submitter has session: true, the first transaction triggers a one-time
 * wallet sign to register a session key on-chain. Every transaction after that
 * is signed silently — zero wallet popups.
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

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { Aptos, AptosConfig, Network, Account } from '@aptos-labs/ts-sdk';
import type { SmoothSendTransactionSubmitter } from './SmoothSendTransactionSubmitter';

export interface UseSmoothSendResult {
  /**
   * Smart signAndSubmitTransaction — same signature as the wallet adapter's version.
   * Sponsored functions go gasless via SmoothSend; others fall back to user-pays-gas.
   * With session: true, zero wallet popups after the first transaction.
   */
  signAndSubmitTransaction: (input: { data: any; options?: any }) => Promise<any>;
  /**
   * Whether a session key is currently active (only relevant when session: true).
   * Updates reactively when session is created or expires.
   */
  hasSession: boolean;
}

export function useSmoothSend(submitter: SmoothSendTransactionSubmitter): UseSmoothSendResult {
  const {
    account,
    signTransaction,
    signAndSubmitTransaction: walletSignAndSubmit,
  } = useWallet();

  // Track session state reactively so UI updates when session is created/expires
  const initialHasSession = submitter?.hasSession?.() ?? false;
  const [hasSessionState, setHasSessionState] = useState(initialHasSession);

  // Prefetch the sponsored-functions list on mount so the first transaction
  // benefits from an already-populated cache with no added latency.
  useEffect(() => {
    submitter.getSponsoredFunctions().catch(() => {
      // Fail-open: getSponsoredFunctions already handles errors internally
    });
  }, [submitter]);

  useEffect(() => {
    if (!submitter) return;

    const refresh = () => {
      const hasSession = submitter.hasSession?.() ?? false;
      setHasSessionState(hasSession);
    };

    refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [submitter]);

  const signAndSubmitTransaction = useCallback(
    async (input: { data: any; options?: any }) => {
      if (!account?.address) {
        throw new Error('[SmoothSend] Wallet not connected');
      }

      const functionName: string = input?.data?.function ?? '';
      console.log('[SmoothSend] signAndSubmitTransaction called:', {
        functionName,
        sessionEnabled: submitter.sessionEnabled,
        hasSession: submitter.hasSession(),
      });

      // ── Session key path ────────────────────────────────────────────────────
      // When session: true, bypass wallet signing entirely after first setup.
      // Still respects the per-function allowlist — non-sponsored functions
      // fall through to regular wallet submission (user pays gas).
      if (submitter.sessionEnabled) {
        console.log('[SmoothSend] Session mode enabled');
        // Check allowlist first — no point setting up a session for a non-sponsored function
        const canGoGasless = typeof signTransaction === 'function';
        const sponsored = canGoGasless && (await submitter.isSponsored(functionName));
        console.log('[SmoothSend] Sponsored check:', { sponsored, canGoGasless });

        if (sponsored) {
          // If no active session, do the one-time setup
          if (!submitter.hasSession()) {
            console.log('[SmoothSend] No session, creating one...');
            if (!signTransaction) {
              console.warn('[SmoothSend] session: true requires signTransaction support. Falling back to regular submission.');
            } else {
              try {
                // Adapter object only needs accountAddress + signTransactionWithAuthenticator.
                // The submitter handles both wallet-adapter and native signer shapes.
                const walletAccount = {
                  accountAddress: account.address as any,
                  signTransactionWithAuthenticator: async (tx: any) => {
                    const rawResult = await (signTransaction as any)({
                      transactionOrPayload: tx,
                      asFeePayer: false,
                    });
                    return rawResult?.authenticator ?? rawResult;
                  },
                } as unknown as Account;
                await submitter.createSession(walletAccount);
                console.log('[SmoothSend] Session created successfully');
                setHasSessionState(submitter.hasSession?.() ?? false);
              } catch (err: any) {
                console.warn('[SmoothSend] Session setup failed, falling back to regular gasless:', err.message);
                // Fall through to normal gasless path below
              }
            }
          }

          // If session is now active, submit silently — no wallet popup
          if (submitter.hasSession()) {
            console.log('[SmoothSend] Session is active, using submitWithSession');
            try {
              return await submitter.submitWithSession(
                functionName as `${string}::${string}::${string}`,
                input.data?.functionArguments ?? [],
                input.data?.typeArguments ?? [],
              );
            } catch (err: any) {
              // Session may have expired mid-flight — clear it and fall through
              console.warn('[SmoothSend] Session submit failed, will re-auth on next call:', err.message);
              setHasSessionState(false);
              // Fall through to regular gasless path for this call
            }
          }
        }
        // Non-sponsored function → fall through to walletSignAndSubmit below
      }

      // ── Regular gasless path (TransactionSubmitter) ─────────────────────────
      // signTransaction (sign-only) must be available for the gasless path.
      // Most modern wallets (Petra, Nightly) support it. If absent, fall through.
      const canGoGasless = typeof signTransaction === 'function';

      const sponsored = canGoGasless && (await submitter.isSponsored(functionName));

      if (sponsored && signTransaction) {
        try {
          const config = submitter.getConfig();
          const network = config.network === 'mainnet' ? Network.MAINNET : Network.TESTNET;
          const aptos = new Aptos(new AptosConfig({ network }));

          // Build transaction with fee-payer placeholder (AccountAddress.ZERO).
          // replayProtectionNonce (AIP-123): random nonce instead of sequence number
          // so concurrent gasless calls from many users never conflict.
          const transaction = await aptos.transaction.build.simple({
            sender: account.address.toString(),
            data: input.data,
            options: {
              ...input.options,
              replayProtectionNonce: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
            },
            withFeePayer: true,
          });

          // Wallet signs sender portion only (no gas required from user).
          // wallet-adapter v8 changed signTransaction to accept { transactionOrPayload, asFeePayer }
          // and returns { authenticator, rawTransaction }.
          // Cast to any to bridge the type mismatch between SDK devDep version and runtime v8.
          const rawResult = await (signTransaction as any)({
            transactionOrPayload: transaction as any,
            asFeePayer: false,
          });
          // Handle both old API (returns AccountAuthenticator directly) and
          // new v8 API (returns { authenticator, rawTransaction })
          const senderAuthenticator = rawResult?.authenticator ?? rawResult;

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

  return {
    signAndSubmitTransaction,
    hasSession: hasSessionState,
  };
}
