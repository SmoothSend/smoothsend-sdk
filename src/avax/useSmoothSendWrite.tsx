import { useCallback, useState } from 'react';
import { encodeFunctionData, type Address, type Hex } from 'viem';
import { useSmoothSendAvax } from './useSmoothSendAvax';
import type { AvaxSponsorshipMode, PaymasterSignRequestAvax } from './types';

export interface UseSmoothSendWriteParams {
  publicClient?: any;
  walletClient?: any;
}

export function useSmoothSendWrite(params?: UseSmoothSendWriteParams) {
  const [hash, setHash] = useState<Hex | undefined>();

  const { submitCall, isPending } = useSmoothSendAvax({
    publicClient: params?.publicClient,
    walletClient: params?.walletClient,
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
