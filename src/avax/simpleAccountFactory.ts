/**
 * Standard SimpleAccountFactory (EntryPoint v0.7) helpers for counterfactual address + init calldata.
 */

import type { Address, Hex, PublicClient } from 'viem';
import { encodeFunctionData } from 'viem';
import { readContract } from 'viem/actions';

/** Minimal ABI for eth-infinitism–style SimpleAccountFactory. */
export const SIMPLE_ACCOUNT_FACTORY_ABI = [
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'salt', type: 'uint256' },
    ],
    name: 'createAccount',
    outputs: [{ name: 'account', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'salt', type: 'uint256' },
    ],
    name: 'getAddress',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function predictSimpleAccountAddress(params: {
  publicClient: PublicClient;
  factory: Address;
  owner: Address;
  salt?: bigint;
}): Promise<Address> {
  const salt = params.salt ?? 0n;
  const addr = await readContract(params.publicClient, {
    address: params.factory,
    abi: SIMPLE_ACCOUNT_FACTORY_ABI,
    functionName: 'getAddress',
    args: [params.owner, salt],
  });
  return addr as Address;
}

export function encodeCreateAccountFactoryData(
  owner: Address,
  salt: bigint
): Hex {
  return encodeFunctionData({
    abi: SIMPLE_ACCOUNT_FACTORY_ABI,
    functionName: 'createAccount',
    args: [owner, salt],
  });
}
