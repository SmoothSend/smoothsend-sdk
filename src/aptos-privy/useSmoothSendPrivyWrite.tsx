/**
 * useSmoothSendPrivyWrite — Aptos gasless hook for Privy embedded wallets.
 *
 * Builds the transaction with `withFeePayer: true`, asks Privy to sign the
 * sender portion (Ed25519), then submits the serialized tx + authenticator
 * to the SmoothSend gateway/relayer which adds the fee-payer signature
 * and broadcasts to the Aptos network.
 *
 * No backend changes needed — reuses the existing Aptos relayer.
 */

import { useCallback, useState } from 'react';
import {
  Aptos,
  AptosConfig,
  Network,
  AccountAddress,
  AccountAuthenticatorEd25519,
  Ed25519PublicKey,
  Ed25519Signature,
  generateSigningMessageForTransaction,
} from '@aptos-labs/ts-sdk';

import { useSmoothSendAptosContext } from './SmoothSendAptosProvider';
import type {
  UseSmoothSendAptosPrivyWriteParams,
  UseSmoothSendAptosPrivyWriteResult,
  AptosTransactionInput,
  AptosTransactionResult,
} from './types';

const DEFAULT_GATEWAY = 'https://proxy.smoothsend.xyz';

export function useSmoothSendPrivyWrite(
  params: UseSmoothSendAptosPrivyWriteParams,
): UseSmoothSendAptosPrivyWriteResult {
  const ctx = useSmoothSendAptosContext();
  const apiKey = params.apiKey ?? ctx?.apiKey;
  const network = params.network ?? ctx?.network ?? 'testnet';
  const gatewayUrl = params.gatewayUrl ?? ctx?.gatewayUrl ?? DEFAULT_GATEWAY;
  const debug = params.debug ?? ctx?.debug ?? false;

  if (!apiKey) {
    throw new Error(
      '[SmoothSend Aptos] apiKey required — pass it to useSmoothSendPrivyWrite or wrap with SmoothSendAptosProvider',
    );
  }

  const [isPending, setIsPending] = useState(false);
  const [data, setData] = useState<AptosTransactionResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsPending(false);
  }, []);

  const submitTransaction = useCallback(
    async (input: AptosTransactionInput): Promise<AptosTransactionResult> => {
      setIsPending(true);
      setError(null);

      try {
        const aptosNetwork = network === 'mainnet' ? Network.MAINNET : Network.TESTNET;
        const aptos = new Aptos(new AptosConfig({ network: aptosNetwork }));
        const senderAddress = AccountAddress.from(params.address);

        if (debug) {
          console.log('[SmoothSend Aptos Privy] Building transaction:', {
            sender: params.address,
            function: input.function,
            network,
          });
        }

        // 1. Build the transaction with fee-payer placeholder
        const transaction = await aptos.transaction.build.simple({
          sender: senderAddress,
          data: {
            function: input.function,
            typeArguments: input.typeArguments ?? [],
            functionArguments: input.functionArguments ?? [],
          },
          withFeePayer: true,
        });

        // 2. Generate the signing message for the sender
        const signingMessage = generateSigningMessageForTransaction(transaction);

        if (debug) {
          console.log('[SmoothSend Aptos Privy] Requesting Privy signature...');
        }

        // 3. Get Privy to sign the raw bytes
        const signatureHex = await params.signTransaction({
          message: signingMessage,
        });

        if (!signatureHex || typeof signatureHex !== 'string') {
          throw new Error('[SmoothSend Aptos Privy] Privy signer returned empty signature');
        }

        // Aptos Ed25519 signatures are 64 bytes (128 hex chars, without 0x).
        // If Privy returns an Ethereum personal_sign signature (65 bytes / 130 hex),
        // the relayer submission will fail on-chain with invalid sender auth.
        const normalizedSignature = signatureHex.startsWith('0x')
          ? signatureHex.slice(2)
          : signatureHex;
        if (normalizedSignature.length !== 128) {
          throw new Error(
            `[SmoothSend Aptos Privy] Expected Ed25519 signature (64 bytes), got ${normalizedSignature.length / 2} bytes. ` +
              'This usually means your app is calling Ethereum personal_sign instead of Aptos raw signing.',
          );
        }

        // 4. Build the AccountAuthenticator from Ed25519 public key + signature
        const cleanPubKey = params.publicKey.startsWith('0x')
          ? params.publicKey.slice(2)
          : params.publicKey;
        const cleanSig = normalizedSignature;

        const senderAuthenticator = new AccountAuthenticatorEd25519(
          new Ed25519PublicKey(cleanPubKey),
          new Ed25519Signature(cleanSig),
        );

        // 5. Serialize and send to SmoothSend gateway (same endpoint the existing SDK uses)
        const transactionBytes = Array.from(transaction.bcsToBytes());
        const authenticatorBytes = Array.from(senderAuthenticator.bcsToBytes());

        const payload = {
          transactionBytes,
          authenticatorBytes,
          network,
          functionName: input.function,
        };

        if (debug) {
          console.log('[SmoothSend Aptos Privy] Submitting to gateway:', {
            endpoint: '/api/v1/relayer/gasless-transaction',
            txBytesLen: transactionBytes.length,
            authBytesLen: authenticatorBytes.length,
          });
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          'X-Chain': `aptos-${network}`,
        };

        if (apiKey.startsWith('pk_nogas_') && typeof window !== 'undefined') {
          headers['Origin'] = window.location.origin;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);

        const response = await fetch(`${gatewayUrl}/api/v1/relayer/gasless-transaction`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            (errorData as any).error || (errorData as any).message || `HTTP ${response.status}`,
          );
        }

        const result = await response.json() as any;

        if (!result.success || !result.txnHash) {
          throw new Error(result.error || result.details || 'Transaction submission failed');
        }

        if (debug) {
          console.log('[SmoothSend Aptos Privy] Transaction successful:', {
            hash: result.txnHash,
            gasUsed: result.gasUsed,
          });
        }

        const txResult: AptosTransactionResult = {
          hash: result.txnHash,
          sender: params.address,
          success: true,
        };

        setData(txResult);
        return txResult;
      } catch (err: any) {
        const wrapped = err instanceof Error ? err : new Error(String(err));
        setError(wrapped);
        throw wrapped;
      } finally {
        setIsPending(false);
      }
    },
    [apiKey, network, gatewayUrl, debug, params.address, params.publicKey, params.signTransaction],
  );

  return { submitTransaction, isPending, data, error, reset };
}
