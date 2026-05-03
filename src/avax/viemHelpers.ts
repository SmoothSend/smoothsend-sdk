/**
 * Viem helpers for ERC-4337 v0.7 + common smart-account `execute` encoding.
 * Peer dependency: `viem` (optional install).
 */

import type { Address, Hex, PublicClient } from 'viem';
import {
  encodeFunctionData,
  hexToBigInt,
  slice,
  size,
} from 'viem';
import type { UserOperation } from 'viem/account-abstraction';
import {
  entryPoint07Abi,
  getUserOperationHash,
} from 'viem/account-abstraction';
import { readContract } from 'viem/actions';

import type { UserOperationAvax } from './types';

/** Typical SimpleAccount-style `execute(dest,value,func)`. */
export const avaxExecuteAbi = [
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'dest', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'func', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'executeBatch',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'dest', type: 'address[]' },
      { name: 'value', type: 'uint256[]' },
      { name: 'func', type: 'bytes[]' },
    ],
    outputs: [],
  },
] as const;

export function encodeAvaxExecuteCalldata(
  to: Address,
  value: bigint,
  data: Hex = '0x'
): Hex {
  return encodeFunctionData({
    abi: avaxExecuteAbi,
    functionName: 'execute',
    args: [to, value, data],
  });
}

export function encodeAvaxExecuteBatchCalldata(
  dest: Address[],
  value: bigint[],
  func: Hex[]
): Hex {
  return encodeFunctionData({
    abi: avaxExecuteAbi,
    functionName: 'executeBatch',
    args: [dest, value, func],
  });
}

function parseUint(name: string, v: string | undefined): bigint {
  if (v === undefined || v === '') {
    throw new Error(`[SmoothSend AVAX] UserOp missing ${name}`);
  }
  return BigInt(v);
}

/** Convert API UserOp → viem shape for {@link getUserOperationHash}. */
export function userOperationAvaxToViem(
  u: UserOperationAvax
): UserOperation<'0.7'> {
  const base = {
    sender: u.sender as Address,
    nonce: parseUint('nonce', u.nonce),
    callData: (u.callData ?? '0x') as Hex,
    callGasLimit: parseUint('callGasLimit', u.callGasLimit),
    verificationGasLimit: parseUint('verificationGasLimit', u.verificationGasLimit),
    preVerificationGas: parseUint('preVerificationGas', u.preVerificationGas),
    maxFeePerGas: parseUint('maxFeePerGas', u.maxFeePerGas),
    maxPriorityFeePerGas: parseUint(
      'maxPriorityFeePerGas',
      u.maxPriorityFeePerGas
    ),
    signature: (u.signature ?? '0x') as Hex,
  };

  let out: UserOperation<'0.7'> = { ...base };

  if (u.factory && u.factoryData) {
    out = {
      ...out,
      factory: u.factory as Address,
      factoryData: u.factoryData as Hex,
    };
  } else if (u.initCode && u.initCode !== '0x') {
    const ic = u.initCode as Hex;
    out = {
      ...out,
      factory: slice(ic, 0, 20),
      factoryData: slice(ic, 20),
    };
  }

  if (u.paymasterAndData && u.paymasterAndData !== '0x') {
    const pm = u.paymasterAndData as Hex;
    if (size(pm) < 52) {
      throw new Error('[SmoothSend AVAX] paymasterAndData too short');
    }
    out = {
      ...out,
      paymaster: slice(pm, 0, 20),
      paymasterVerificationGasLimit: hexToBigInt(slice(pm, 20, 36)),
      paymasterPostOpGasLimit: hexToBigInt(slice(pm, 36, 52)),
      paymasterData: size(pm) > 52 ? slice(pm, 52) : '0x',
    };
  } else if (u.paymaster) {
    out = {
      ...out,
      paymaster: u.paymaster as Address,
      paymasterVerificationGasLimit: u.paymasterVerificationGasLimit
        ? BigInt(u.paymasterVerificationGasLimit)
        : 0n,
      paymasterPostOpGasLimit: u.paymasterPostOpGasLimit
        ? BigInt(u.paymasterPostOpGasLimit)
        : 0n,
      paymasterData: (u.paymasterData ?? '0x') as Hex,
    };
  }

  return out;
}

export function hashUserOperationAvax(params: {
  chainId: number;
  entryPointAddress: Address;
  userOperation: UserOperationAvax;
}): Hex {
  return getUserOperationHash({
    chainId: params.chainId,
    entryPointAddress: params.entryPointAddress,
    entryPointVersion: '0.7',
    userOperation: userOperationAvaxToViem(params.userOperation),
  });
}

/** EntryPoint v0.7 `getNonce(sender, key)` with key `0`. */
export async function readAvaxSenderNonce(params: {
  publicClient: PublicClient;
  entryPointAddress: Address;
  sender: Address;
  key?: bigint;
}): Promise<bigint> {
  return readContract(params.publicClient, {
    address: params.entryPointAddress,
    abi: entryPoint07Abi,
    functionName: 'getNonce',
    args: [params.sender, params.key ?? 0n],
  });
}
