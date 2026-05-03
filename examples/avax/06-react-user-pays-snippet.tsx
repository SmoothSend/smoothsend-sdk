/**
 * Same as 05 but user pays protocol fee in ERC20 (bundler allowlist + VerifyingPaymaster).
 * Drop inside the same WagmiProvider → QueryClientProvider → SmoothSendAvaxProvider tree.
 */

import { usePublicClient, useWalletClient } from 'wagmi';

import { useSmoothSendAvax } from '../../src/avax/index.ts';

export function UserPaysUsdcButton(props: {
  to: `0x${string}`;
  data: `0x${string}`;
}) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { submitCall } = useSmoothSendAvax({
    publicClient,
    walletClient: walletClient ?? undefined,
  });

  return (
    <button
      type="button"
      onClick={() =>
        submitCall({
          to: props.to,
          data: props.data,
          mode: 'user-pays-erc20',
          paymaster: {
            precheckBalance: true,
            prepaymentRequired: true,
          },
        })
      }
    >
      Submit (user pays ERC20)
    </button>
  );
}
