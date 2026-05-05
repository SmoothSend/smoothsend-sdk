import { useCallback, useState } from 'react';
import { encodeFunctionData, type Address, type Hex, type PublicClient } from 'viem';
import { useSmoothSendAvax } from './useSmoothSendAvax';
import { createPrivyUserOpSigner, type PrivyMessageSigner } from './privySigner';
import type { AvaxSponsorshipMode, PaymasterSignRequestAvax } from './types';

export interface UseSmoothSendPrivyWriteParams {
  publicClient: PublicClient | null | undefined;
  ownerAddress: Address;
  signMessage: PrivyMessageSigner;
  apiKey?: string;
  network?: 'testnet' | 'mainnet';
  smartAccountAddress?: Address;
  accountFactory?: Address;
  accountSalt?: bigint;
}

/**
 * Privy-first wrapper for one-line AVAX sponsored writes.
 *
 * Privy provides auth + signing UX, SmoothSend handles UserOp sponsorship/submission.
 */
export function useSmoothSendPrivyWrite(params: UseSmoothSendPrivyWriteParams) {
  const [hash, setHash] = useState<Hex | undefined>();

  const { submitCall, isPending } = useSmoothSendAvax({
    apiKey: params.apiKey,
    network: params.network,
    smartAccountAddress: params.smartAccountAddress,
    accountFactory: params.accountFactory,
    accountSalt: params.accountSalt,
    ownerAddress: params.ownerAddress,
    publicClient: params.publicClient,
    walletClient: undefined,
    signUserOpHash: createPrivyUserOpSigner(params.signMessage),
  });

  const writeContract = useCallback(
    async (args: {
      address: Address;
      abi: any;
      functionName: string;
      args?: any[];
      value?: bigint;
      mode?: AvaxSponsorshipMode;
      paymaster?: Omit<PaymasterSignRequestAvax, 'mode' | 'userOp'>;
      waitForReceipt?: boolean;
    }) => {
      const data = encodeFunctionData({
        abi: args.abi,
        functionName: args.functionName,
        args: args.args as any[],
      });

      const result = await submitCall({
        to: args.address,
        data,
        value: args.value ?? 0n,
        mode: args.mode ?? 'developer-sponsored',
        paymaster: args.paymaster,
        waitForReceipt: args.waitForReceipt,
      });

      if (result.userOpHash) {
        setHash(result.userOpHash as Hex);
      }

      return result.userOpHash;
    },
    [submitCall]
  );

  return {
    writeContract,
    data: hash,
    isPending,
    isIdle: !isPending && !hash,
    status: isPending ? 'pending' : hash ? 'success' : 'idle',
  };
}

