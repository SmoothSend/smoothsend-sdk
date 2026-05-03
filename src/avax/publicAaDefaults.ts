/**
 * Public gateway defaults for Avalanche AA (no API key).
 */

/** Canonical ERC-4337 EntryPoint v0.7 on Fuji / Avalanche C-Chain */
export const ENTRY_POINT_V07_ADDRESS =
  '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const;

export type AvaxAaPublicDefaults = {
  success?: boolean;
  simpleAccountFactoryFuji: `0x${string}` | null;
  entryPointV07: typeof ENTRY_POINT_V07_ADDRESS;
};

/**
 * Fetch SimpleAccount factory hint from SmoothSend gateway (GET; no auth).
 * Ops configure {@link https://proxy.smoothsend.xyz} `AVAX_FUJI_SIMPLE_ACCOUNT_FACTORY`; until then this returns null.
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
    entryPointV07?: string;
  };

  let factory: `0x${string}` | null = null;
  const fac = j.simpleAccountFactoryFuji?.trim();
  if (fac && fac.startsWith('0x') && /^0x[a-fA-F0-9]{40}$/.test(fac)) {
    factory = fac as `0x${string}`;
  }

  return {
    success: j.success,
    simpleAccountFactoryFuji: factory,
    entryPointV07:
      j.entryPointV07?.startsWith('0x') && /^0x[a-fA-F0-9]{40}$/.test(j.entryPointV07)
        ? (j.entryPointV07 as typeof ENTRY_POINT_V07_ADDRESS)
        : ENTRY_POINT_V07_ADDRESS,
  };
}
