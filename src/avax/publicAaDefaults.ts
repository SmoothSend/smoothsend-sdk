/**
 * Public gateway defaults for Avalanche AA (no API key).
 */

import type { Address, PublicClient } from 'viem';
import { predictSimpleAccountAddress } from './simpleAccountFactory';

/** Canonical ERC-4337 EntryPoint v0.7 on Fuji / Avalanche C-Chain */
export const ENTRY_POINT_V07_ADDRESS =
  '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const;

export type AvaxAaPublicDefaults = {
  success?: boolean;
  simpleAccountFactoryFuji: `0x${string}` | null;
  simpleAccountFactoryMainnet: `0x${string}` | null;
  entryPointV07: typeof ENTRY_POINT_V07_ADDRESS;
  paymasterFuji: `0x${string}` | null;
  paymasterMainnet: `0x${string}` | null;
};

/**
 * Fetch SimpleAccount factory and Paymaster hints from SmoothSend gateway (GET; no auth).
 */
export async function fetchAvaxAaPublicDefaults(
  gatewayUrl = 'https://proxy.smoothsend.xyz'
): Promise<AvaxAaPublicDefaults> {
  const base = gatewayUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/v1/public/avax-aa-defaults`);
  if (!res.ok) {
    throw new Error(`fetchAvaxAaPublicDefaults failed: HTTP ${res.status}`);
  }
  const j = (await res.json()) as {
    success?: boolean;
    simpleAccountFactoryFuji?: string | null;
    simpleAccountFactoryMainnet?: string | null;
    entryPointV07?: string;
    paymasterFuji?: string | null;
    paymasterMainnet?: string | null;
  };

  const parseAddress = (addr: string | null | undefined): `0x${string}` | null => {
    const clean = addr?.trim();
    if (clean && clean.startsWith('0x') && /^0x[a-fA-F0-9]{40}$/.test(clean)) {
      return clean as `0x${string}`;
    }
    return null;
  };

  return {
    success: j.success,
    simpleAccountFactoryFuji: parseAddress(j.simpleAccountFactoryFuji),
    simpleAccountFactoryMainnet: parseAddress(j.simpleAccountFactoryMainnet),
    entryPointV07:
      j.entryPointV07?.startsWith('0x') && /^0x[a-fA-F0-9]{40}$/.test(j.entryPointV07)
        ? (j.entryPointV07 as typeof ENTRY_POINT_V07_ADDRESS)
        : ENTRY_POINT_V07_ADDRESS,
    paymasterFuji: parseAddress(j.paymasterFuji),
    paymasterMainnet: parseAddress(j.paymasterMainnet),
  };
}

/**
 * Recommended easy helper: get the user's Smart Contract Wallet (SCW) address.
 *
 * This is the simplest way for dApps to show the user their gasless address.
 * It automatically fetches the correct factory from the gateway and predicts the address.
 *
 * @example
 * const scw = await getSmartAccountAddress({
 *   publicClient,
 *   owner: eoaAddress,
 *   network: 'mainnet'
 * });
 *
 * // Show this to the user: "Send USDC here so you can do gasless transactions"
 * console.log(scw);
 */
export async function getSmartAccountAddress(params: {
  publicClient: PublicClient;
  owner: Address;
  network?: 'testnet' | 'mainnet';
  gatewayUrl?: string;
  salt?: bigint;
  /** Pass your own factory if you're using a custom account implementation */
  factory?: Address;
}): Promise<Address> {
  const network = params.network ?? 'testnet';
  const salt = params.salt ?? 0n;

  let factory: Address | undefined = params.factory;

  if (!factory) {
    const defaults = await fetchAvaxAaPublicDefaults(params.gatewayUrl);
    factory =
      (network === 'mainnet'
        ? defaults.simpleAccountFactoryMainnet
        : defaults.simpleAccountFactoryFuji) ?? undefined;
  }

  if (!factory) {
    throw new Error(
      `[SmoothSend AVAX] Could not determine SimpleAccountFactory for network ${network}. ` +
      `Pass \`factory\` explicitly if you are using a custom account.`
    );
  }

  return predictSimpleAccountAddress({
    publicClient: params.publicClient,
    factory,
    owner: params.owner,
    salt,
  });
}
