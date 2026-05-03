/**
 * Copy into a Vite/Next app with wagmi v2 + TanStack Query already configured.
 * In real apps import from `@smoothsend/sdk` instead of `../../src/avax`.
 *
 * Wrap tree:
 *   WagmiProvider → QueryClientProvider → SmoothSendAvaxProvider
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  SmoothSendAvaxProvider,
  useSmoothSendAvax,
} from '../../src/avax/index.ts';
import { WagmiProvider } from 'wagmi';
import { usePublicClient, useWalletClient } from 'wagmi';

const queryClient = new QueryClient();

/** Replace with your wagmi config import */
import type { Config } from 'wagmi';

export function SmoothSendAvaxRoot(props: {
  config: Config;
  apiKey: string;
  smartAccountAddress: `0x${string}`;
  children: ReactNode;
}) {
  return (
    <WagmiProvider config={props.config}>
      <QueryClientProvider client={queryClient}>
        <SmoothSendAvaxProvider
          apiKey={props.apiKey}
          network="testnet"
          smartAccountAddress={props.smartAccountAddress}
        >
          {props.children}
        </SmoothSendAvaxProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

/** Minimal usage component */
export function SponsoredTransferButton(props: { to: `0x${string}`; data: `0x${string}` }) {
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
          mode: 'developer-sponsored',
        })
      }
    >
      Submit sponsored call
    </button>
  );
}
