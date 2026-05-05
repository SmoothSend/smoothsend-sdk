import { useCallback, useState } from 'react';
import { encodeFunctionData, type Address, type Hex, type PublicClient, type WalletClient } from 'viem';
import { useSmoothSendAvax } from './useSmoothSendAvax';
import type { AvaxSponsorshipMode, PaymasterSignRequestAvax, UserOpSignerAvax } from './types';

export interface UseSmoothSendWriteParams {
  apiKey?: string;
  network?: 'testnet' | 'mainnet';
  smartAccountAddress?: Address;
  accountFactory?: Address;
  accountSalt?: bigint;
  ownerAddress?: Address;
  publicClient?: PublicClient | null;
  walletClient?: WalletClient | null;
  signUserOpHash?: UserOpSignerAvax;
}

export function useSmoothSendWrite(params?: UseSmoothSendWriteParams) {
  const [hash, setHash] = useState<Hex | undefined>();

  const { submitCall, isPending } = useSmoothSendAvax({
    apiKey: params?.apiKey,
    network: params?.network,
    smartAccountAddress: params?.smartAccountAddress,
    accountFactory: params?.accountFactory,
    accountSalt: params?.accountSalt,
    ownerAddress: params?.ownerAddress,
    publicClient: params?.publicClient,
    walletClient: params?.walletClient,
    signUserOpHash: params?.signUserOpHash,
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
      try {
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
      } catch (error) {
        console.error('[SmoothSend] writeContract failed:', error);
        throw error;
      }
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
