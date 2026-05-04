/**
 * Public gateway defaults for Avalanche AA (no API key).
 */

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
