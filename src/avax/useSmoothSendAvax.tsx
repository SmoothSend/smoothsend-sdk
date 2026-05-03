/**
 * React: sponsored UserOps with minimal boilerplate.
 *
 * Works with wagmi — pass `usePublicClient()` / `useWalletClient()` results (wagmi v2: wrap app in
 * `WagmiProvider` + `@tanstack/react-query` `QueryClientProvider`; see repo `resources/wagmi/playgrounds/vite-react`
 * and `resources/permissionless.js/packages/wagmi-demo` for layout patterns).
 * Optional {@link SmoothSendAvaxProvider} supplies apiKey + network + smartAccountAddress.
 *
 * Smart account must validate owner signatures like OpenZeppelin Account:
 * `userOpHash` signed with Ethereum Signed Message prefix (`signMessage` + raw hash).
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { Address, Hex } from 'viem';
import { toHex } from 'viem';
import type { PublicClient, WalletClient } from 'viem';

import { SmoothSendAvaxSubmitter } from './SmoothSendAvaxSubmitter';
import type { AvaxSponsorshipMode, PaymasterSignRequestAvax } from './types';
import {
  encodeAvaxExecuteCalldata,
  encodeAvaxExecuteBatchCalldata,
  hashUserOperationAvax,
  readAvaxSenderNonce,
} from './viemHelpers';
import {
  encodeCreateAccountFactoryData,
  predictSimpleAccountAddress,
} from './simpleAccountFactory';

export type SmoothSendAvaxContextValue = {
  apiKey: string;
  network: 'testnet' | 'mainnet';
  /** Set when the SCW is already known. If you use `accountFactory`, you can omit this. */
  smartAccountAddress?: Address;
  /**
   * SimpleAccountFactory (v0.7). When set, the hook derives the counterfactual sender via
   * `getAddress(owner, salt)` and, if the account has no code, adds `factory` + `factoryData` so the
   * first sponsored UserOp deploys the SCW and runs `callData` in the same op.
   */
  accountFactory?: Address;
  accountSalt?: bigint;
};

const SmoothSendAvaxContext = createContext<SmoothSendAvaxContextValue | null>(
  null
);

export function SmoothSendAvaxProvider({
  apiKey,
  network = 'testnet',
  smartAccountAddress,
  accountFactory,
  accountSalt,
  children,
}: {
  apiKey: string;
  network?: 'testnet' | 'mainnet';
  smartAccountAddress?: Address;
  accountFactory?: Address;
  accountSalt?: bigint;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      apiKey,
      network,
      smartAccountAddress,
      accountFactory,
      accountSalt: accountSalt ?? 0n,
    }),
    [apiKey, network, smartAccountAddress, accountFactory, accountSalt]
  );
  return (
    <SmoothSendAvaxContext.Provider value={value}>
      {children}
    </SmoothSendAvaxContext.Provider>
  );
}

export function useSmoothSendAvaxContext(): SmoothSendAvaxContextValue | null {
  return useContext(SmoothSendAvaxContext);
}

export type UseSmoothSendAvaxParams = {
  apiKey?: string;
  network?: 'testnet' | 'mainnet';
  smartAccountAddress?: Address;
  accountFactory?: Address;
  /** @default 0n */
  accountSalt?: bigint;
  publicClient: PublicClient | null | undefined;
  walletClient: WalletClient | null | undefined;
};

export function useSmoothSendAvax(params: UseSmoothSendAvaxParams): {
  submitter: SmoothSendAvaxSubmitter;
  submitCall: (args: {
    to: Address;
    data?: Hex;
    value?: bigint;
    mode?: AvaxSponsorshipMode;
    paymaster?: Omit<PaymasterSignRequestAvax, 'mode' | 'userOp'>;
    waitForReceipt?: boolean;
  }) => ReturnType<SmoothSendAvaxSubmitter['submitSponsoredUserOperation']>;
  submitSponsoredUserOp: (args: {
    calls: Array<{
      to: Address;
      data?: Hex;
      value?: bigint;
    }>;
    sponsorshipMode?: AvaxSponsorshipMode;
    paymaster?: Omit<PaymasterSignRequestAvax, 'mode' | 'userOp'>;
    waitForReceipt?: boolean;
  }) => ReturnType<SmoothSendAvaxSubmitter['submitSponsoredUserOperation']>;
} {
  const ctx = useSmoothSendAvaxContext();
  const apiKey = params.apiKey ?? ctx?.apiKey;
  const network = params.network ?? ctx?.network ?? 'testnet';
  const smartAccountAddressProp =
    params.smartAccountAddress ?? ctx?.smartAccountAddress;
  const accountFactory = params.accountFactory ?? ctx?.accountFactory;
  const accountSalt = params.accountSalt ?? ctx?.accountSalt ?? 0n;

  if (!apiKey) {
    throw new Error(
      '[SmoothSend AVAX] apiKey required — pass useSmoothSendAvax({ apiKey }) or wrap SmoothSendAvaxProvider'
    );
  }
  const submitter = useMemo(
    () => new SmoothSendAvaxSubmitter({ apiKey, network }),
    [apiKey, network]
  );

  const { publicClient, walletClient } = params;

  const submitCall = useCallback(
    async (params: {
      to?: Address;
      data?: Hex;
      value?: bigint;
      call?: { to: Address; data?: Hex; value?: bigint };
      calls?: { to: Address; data?: Hex; value?: bigint }[];
      mode?: AvaxSponsorshipMode;
      paymaster?: Omit<PaymasterSignRequestAvax, 'mode' | 'userOp'>;
      waitForReceipt?: boolean;
    }) => {
      if (!publicClient) {
        throw new Error('[SmoothSend AVAX] publicClient missing (wagmi usePublicClient)');
      }
      if (!walletClient) {
        throw new Error('[SmoothSend AVAX] walletClient missing (wagmi useWalletClient)');
      }

      if (!smartAccountAddressProp && !accountFactory) {
        throw new Error(
          '[SmoothSend AVAX] No smartAccountAddress or accountFactory provided. Pass them to SmoothSendAvaxProvider or useSmoothSendAvax hook.'
        );
      }

      const account = walletClient.account;
      if (!account) {
        throw new Error(
          '[SmoothSend AVAX] walletClient.account missing — connect wallet (wagmi useWalletClient)'
        );
      }
      const ownerAddress = account.address as Address;

      const chainId = Number(
        publicClient.chain?.id ?? (await publicClient.getChainId())
      );
      const entryPoint = (await submitter.getSupportedEntryPoints())[0] as Address;

      let sender: Address;

      if (accountFactory) {
        const predicted = await predictSimpleAccountAddress({
          publicClient,
          factory: accountFactory,
          owner: ownerAddress,
          salt: accountSalt,
        });
        if (
          smartAccountAddressProp &&
          predicted.toLowerCase() !== smartAccountAddressProp.toLowerCase()
        ) {
          throw new Error(
            `[SmoothSend AVAX] smartAccountAddress ${smartAccountAddressProp} does not match factory prediction ${predicted}`
          );
        }
        sender = predicted;
      } else {
        sender = smartAccountAddressProp as Address;
      }

      const code = await publicClient.getBytecode({ address: sender });
      const deployed =
        typeof code === 'string' &&
        code !== '0x' &&
        code.length > 2;

      let nonce: bigint;
      let factory: Address | undefined;
      let factoryData: Hex | undefined;

      if (!deployed) {
        if (!accountFactory) {
          throw new Error(
            '[SmoothSend AVAX] No bytecode at sender — pass accountFactory so the paymaster can sponsor deploy + call in one UserOp'
          );
        }
        nonce = 0n;
        factory = accountFactory;
        factoryData = encodeCreateAccountFactoryData(ownerAddress, accountSalt);
      } else {
        nonce = await readAvaxSenderNonce({
          publicClient,
          entryPointAddress: entryPoint,
          sender,
        });
      }

      let maxFeePerGas = 50n * 10n ** 9n;
      let maxPriorityFeePerGas = 2n * 10n ** 9n;
      try {
        const est = await publicClient.estimateFeesPerGas();
        if (est.maxFeePerGas) maxFeePerGas = est.maxFeePerGas;
        if (est.maxPriorityFeePerGas) {
          maxPriorityFeePerGas = est.maxPriorityFeePerGas;
        }
      } catch {
        /* chain may not support EIP-1559 estimation */
      }

      let callData: Hex;
      if (params.calls && params.calls.length > 0) {
        callData = encodeAvaxExecuteBatchCalldata(
          params.calls.map(c => c.to),
          params.calls.map(c => c.value ?? 0n),
          params.calls.map(c => c.data ?? '0x')
        );
      } else {
        const target = params.call?.to ?? params.to;
        if (!target) throw new Error('[SmoothSend AVAX] No target address (to) provided');
        callData = encodeAvaxExecuteCalldata(
          target,
          params.call?.value ?? params.value ?? 0n,
          params.call?.data ?? params.data ?? '0x'
        );
      }

      return submitter.submitSponsoredUserOperation({
        userOp: {
          sender,
          nonce: toHex(nonce),
          callData,
          maxFeePerGas: toHex(maxFeePerGas),
          maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
          ...(factory && factoryData ? { factory, factoryData } : {}),
        },
        mode: params.mode ?? 'developer-sponsored',
        paymaster: params.paymaster,
        waitForReceipt: params.waitForReceipt,
        signUserOp: async (op) => {
          const hash = hashUserOperationAvax({
            chainId,
            entryPointAddress: entryPoint,
            userOperation: op,
          });
          return walletClient.signMessage({
            account,
            message: { raw: hash },
          });
        },
      });
    },
    [
      accountFactory,
      accountSalt,
      publicClient,
      smartAccountAddressProp,
      submitter,
      walletClient,
    ]
  );

  const submitSponsoredUserOp = useCallback(
    async (args: {
      calls: Array<{
        to: Address;
        data?: Hex;
        value?: bigint;
      }>;
      sponsorshipMode?: AvaxSponsorshipMode;
      paymaster?: Omit<PaymasterSignRequestAvax, 'mode' | 'userOp'>;
      waitForReceipt?: boolean;
    }) => {
      if (args.calls.length === 0) {
        throw new Error('[SmoothSend AVAX] No calls provided');
      }
      // For now, use the first call (single execution)
      const call = args.calls[0];
      return submitCall({
        to: call.to,
        data: call.data,
        value: call.value,
        mode: args.sponsorshipMode,
        paymaster: args.paymaster,
        waitForReceipt: args.waitForReceipt,
      });
    },
    [submitCall]
  );

  return { submitter, submitCall, submitSponsoredUserOp };
}
