import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import { toHex } from 'viem';
import { SmoothSendAvaxSubmitter, type SmoothSendAvaxSubmitterConfig } from './SmoothSendAvaxSubmitter';
import type {
  AvaxFeePreview,
  AvaxSponsorshipMode,
  PaymasterSignRequestAvax
} from './types';
import {
  encodeAvaxExecuteBatchCalldata,
  encodeAvaxExecuteCalldata,
  hashUserOperationAvax,
  readAvaxSenderNonce
} from './viemHelpers';
import {
  encodeCreateAccountFactoryData,
  predictSimpleAccountAddress
} from './simpleAccountFactory';

export interface SmoothSendAvaxClientConfig {
  apiKey: string;
  network?: 'testnet' | 'mainnet';
  gatewayUrl?: string;
  timeout?: number;
  chain?: string;
  corsOrigin?: string;
  publicClient: PublicClient;
  walletClient: WalletClient;
  smartAccountAddress?: Address;
  accountFactory?: Address;
  accountSalt?: bigint;
}

export interface SimpleCallInput {
  to: Address;
  data?: Hex;
  value?: bigint;
}

export class SmoothSendAvaxClient {
  readonly submitter: SmoothSendAvaxSubmitter;
  readonly config: SmoothSendAvaxClientConfig;

  constructor(config: SmoothSendAvaxClientConfig) {
    this.config = config;
    this.submitter = new SmoothSendAvaxSubmitter({
      apiKey: config.apiKey,
      network: config.network,
      gatewayUrl: config.gatewayUrl,
      timeout: config.timeout,
      chain: config.chain,
      corsOrigin: config.corsOrigin
    } satisfies SmoothSendAvaxSubmitterConfig);
  }

  async submitCall(args: {
    call: SimpleCallInput;
    mode?: AvaxSponsorshipMode;
    paymaster?: Omit<PaymasterSignRequestAvax, 'mode' | 'userOp'>;
    waitForReceipt?: boolean;
  }) {
    return this.submitCalls({
      calls: [args.call],
      mode: args.mode,
      paymaster: args.paymaster,
      waitForReceipt: args.waitForReceipt
    });
  }

  async submitCalls(args: {
    calls: SimpleCallInput[];
    mode?: AvaxSponsorshipMode;
    paymaster?: Omit<PaymasterSignRequestAvax, 'mode' | 'userOp'>;
    waitForReceipt?: boolean;
  }) {
    if (args.calls.length === 0) {
      throw new Error('[SmoothSend AVAX] No calls provided');
    }
    const built = await this.buildDraft(args.calls);
    const result = await this.submitter.submitSponsoredUserOperation({
      userOp: built.userOp,
      mode: args.mode ?? 'developer-sponsored',
      paymaster: args.paymaster,
      waitForReceipt: args.waitForReceipt,
      signUserOp: async (op) => {
        const hash = hashUserOperationAvax({
          chainId: built.chainId,
          entryPointAddress: built.entryPoint,
          userOperation: op
        });
        return this.signUserOpHash(hash);
      }
    });

    return {
      userOpHash: result.userOpHash,
      transactionHash: result.receipt?.receipt?.transactionHash,
      receipt: result.receipt
    };
  }

  async estimateUserPaysFee(args: {
    calls: SimpleCallInput[];
    paymaster?: Omit<PaymasterSignRequestAvax, 'mode' | 'userOp'>;
  }): Promise<{
    feePreview?: AvaxFeePreview;
    exchangeRate?: string;
    entryPoint: string;
  }> {
    if (args.calls.length === 0) {
      throw new Error('[SmoothSend AVAX] No calls provided');
    }
    const built = await this.buildDraft(args.calls);
    const estimate = await this.submitter.estimateUserPaysFee({
      userOp: built.userOp,
      entryPoint: built.entryPoint,
      paymaster: args.paymaster
    });
    return {
      feePreview: estimate.feePreview,
      exchangeRate: estimate.exchangeRate,
      entryPoint: estimate.entryPoint
    };
  }

  private async buildDraft(calls: SimpleCallInput[]): Promise<{
    userOp: {
      sender: string;
      nonce: string;
      callData: string;
      maxFeePerGas: string;
      maxPriorityFeePerGas: string;
      factory?: string;
      factoryData?: string;
    };
    chainId: number;
    entryPoint: Address;
  }> {
    const { publicClient, walletClient } = this.config;
    const account = walletClient.account;
    if (!account) {
      throw new Error('[SmoothSend AVAX] walletClient.account missing');
    }
    const ownerAddress = account.address as Address;

    const defaults = await this.submitter.getPublicAaDefaults().catch(() => null);
    const accountFactory =
      this.config.accountFactory ??
      ((this.config.network ?? 'testnet') === 'mainnet'
        ? defaults?.simpleAccountFactoryMainnet
        : defaults?.simpleAccountFactoryFuji) ??
      undefined;

    const chainId = Number(publicClient.chain?.id ?? (await publicClient.getChainId()));
    const entryPoint = (await this.submitter.getSupportedEntryPoints())[0] as Address;

    let sender: Address;
    if (accountFactory) {
      const predicted = await predictSimpleAccountAddress({
        publicClient,
        factory: accountFactory,
        owner: ownerAddress,
        salt: this.config.accountSalt ?? 0n
      });
      if (
        this.config.smartAccountAddress &&
        predicted.toLowerCase() !== this.config.smartAccountAddress.toLowerCase()
      ) {
        throw new Error(
          `[SmoothSend AVAX] smartAccountAddress ${this.config.smartAccountAddress} does not match factory prediction ${predicted}`
        );
      }
      sender = predicted;
    } else if (this.config.smartAccountAddress) {
      sender = this.config.smartAccountAddress;
    } else {
      throw new Error(
        '[SmoothSend AVAX] Provide smartAccountAddress or accountFactory (or use gateway public defaults).'
      );
    }

    const code = await publicClient.getBytecode({ address: sender });
    const deployed = typeof code === 'string' && code !== '0x' && code.length > 2;

    let nonce: bigint;
    let factory: Address | undefined;
    let factoryData: Hex | undefined;
    if (!deployed) {
      if (!accountFactory) {
        throw new Error(
          '[SmoothSend AVAX] Sender is not deployed and no accountFactory available'
        );
      }
      nonce = 0n;
      factory = accountFactory;
      factoryData = encodeCreateAccountFactoryData(ownerAddress, this.config.accountSalt ?? 0n);
    } else {
      nonce = await readAvaxSenderNonce({
        publicClient,
        entryPointAddress: entryPoint,
        sender
      });
    }

    let maxFeePerGas = 50n * 10n ** 9n;
    let maxPriorityFeePerGas = 2n * 10n ** 9n;
    try {
      const est = await publicClient.estimateFeesPerGas();
      if (est.maxFeePerGas) maxFeePerGas = est.maxFeePerGas;
      if (est.maxPriorityFeePerGas) maxPriorityFeePerGas = est.maxPriorityFeePerGas;
    } catch {
      // ignore and use fallbacks
    }

    const callData = calls.length === 1
      ? encodeAvaxExecuteCalldata(
          calls[0].to,
          calls[0].value ?? 0n,
          calls[0].data ?? '0x'
        )
      : encodeAvaxExecuteBatchCalldata(
          calls.map((c) => c.to),
          calls.map((c) => c.value ?? 0n),
          calls.map((c) => c.data ?? '0x')
        );

    return {
      userOp: {
        sender,
        nonce: toHex(nonce),
        callData,
        maxFeePerGas: toHex(maxFeePerGas),
        maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
        ...(factory && factoryData ? { factory, factoryData } : {})
      },
      chainId,
      entryPoint
    };
  }

  private async signUserOpHash(hash: Hex): Promise<string> {
    const account = this.config.walletClient.account;
    if (!account) throw new Error('[SmoothSend AVAX] walletClient.account missing');
    return this.config.walletClient.signMessage({
      account,
      message: { raw: hash }
    });
  }
}

export function createSmoothSendAvaxClient(config: SmoothSendAvaxClientConfig) {
  return new SmoothSendAvaxClient(config);
}

