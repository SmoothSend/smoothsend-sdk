/**
 * Avalanche ERC-4337 (EntryPoint v0.7) via SmoothSend gateway — same idea as Aptos submitter.
 *
 * Minimal dApp flow:
 * ```ts
 * const avax = new SmoothSendAvaxSubmitter({ apiKey, network: 'testnet' });
 * await avax.submitSponsoredUserOperation({ userOp: draft, signUserOp: wallet.sign });
 * ```
 */

import { HttpClient } from '../utils/http';
import type {
  AvaxFeePreview,
  AvaxSponsorshipMode,
  GasEstimateAvax,
  JsonRpcResponseAvax,
  PaymasterSignRequestAvax,
  PaymasterSignResponseAvax,
  SponsoredUserOpDraftAvax,
  UserOperationAvax,
  UserOperationReceiptAvax,
} from './types';

/** Options for {@link SmoothSendAvaxSubmitter.submitSponsoredUserOperation} */
export interface SubmitSponsoredAvaxUserOpOptions {
  /** Sender must match your smart account; nonce/callData/fees from your app */
  userOp: SponsoredUserOpDraftAvax;
  /** Wallet / viem / ethers signs the UserOp hash your stack expects */
  signUserOp: (userOp: UserOperationAvax) => Promise<string>;
  mode?: AvaxSponsorshipMode;
  /** Defaults to first entry point from `eth_supportedEntryPoints` */
  entryPoint?: string;
  /** Extra `paymaster/sign` fields (`token`, `receiver`, …) for user-pays-ERC20 */
  paymaster?: Omit<PaymasterSignRequestAvax, 'mode' | 'userOp'>;
  /** @default true */
  waitForReceipt?: boolean;
  receiptPoll?: { pollMs?: number; timeoutMs?: number };
}

export interface EstimateUserPaysFeeAvaxOptions {
  /** Draft UserOperation (same shape as submit flow before signing) */
  userOp: SponsoredUserOpDraftAvax;
  /** Optional entrypoint, defaults to eth_supportedEntryPoints()[0] */
  entryPoint?: string;
  /** Optional paymaster params such as token/receiver overrides */
  paymaster?: Omit<PaymasterSignRequestAvax, 'mode' | 'userOp'>;
}

export interface SmoothSendAvaxSubmitterConfig {
  apiKey: string;
  network?: 'testnet' | 'mainnet';
  gatewayUrl?: string;
  timeout?: number;
  /**
   * Gateway chain routing bucket. Default `avalanche` matches `core/gateway` routing.
   */
  chain?: string;
  /**
   * Public keys (`pk_nogas_*`) require an `Origin` header matching your project's allowed CORS origins.
   * Set this for Node/scripts (e.g. `http://localhost:5173`). Browsers send Origin automatically.
   */
  corsOrigin?: string;
}

const DEFAULT_GATEWAY = 'https://proxy.smoothsend.xyz';

/** Strip ethers@v6 UTF-8 decode noise from bundler JSON-RPC errors (viem shows as “internal error … Details”). */
function sanitizeAvaxBundlerRpcMessage(raw: string): string {
  if (
    raw.includes('invalid codepoint') ||
    raw.includes('INVALID_ARGUMENT') ||
    raw.includes('MISSING_CONTINUE')
  ) {
    return 'RPC reverted; revert payload could not be decoded as text (usually EntryPoint/account — trace tx on explorer or update bundler).';
  }
  return raw;
}

export class SmoothSendAvaxSubmitter {
  private readonly http: HttpClient;
  private rpcId = 1;

  constructor(private readonly config: SmoothSendAvaxSubmitterConfig) {
    if (!config?.apiKey) {
      throw new Error('[SmoothSendAvaxSubmitter] apiKey is required');
    }
    const headers: Record<string, string> = {
      'X-Chain': (config.chain ?? 'avalanche').toLowerCase(),
    };
    if (config.corsOrigin?.trim()) {
      headers.Origin = config.corsOrigin.trim();
    }
    this.http = new HttpClient({
      apiKey: config.apiKey,
      network: config.network ?? 'testnet',
      baseUrl: config.gatewayUrl ?? DEFAULT_GATEWAY,
      timeout: config.timeout ?? 45_000,
      customHeaders: headers,
    });
  }

  getConfig(): Readonly<SmoothSendAvaxSubmitterConfig> {
    return { ...this.config };
  }

  /** Merge gas estimate fields into a partial UserOp */
  static applyGasEstimate(
    userOp: UserOperationAvax,
    gas: GasEstimateAvax
  ): UserOperationAvax {
    return {
      ...userOp,
      preVerificationGas: gas.preVerificationGas,
      verificationGasLimit: gas.verificationGasLimit,
      callGasLimit: gas.callGasLimit,
      paymasterVerificationGasLimit:
        gas.paymasterVerificationGasLimit ??
        userOp.paymasterVerificationGasLimit,
      paymasterPostOpGasLimit:
        gas.paymasterPostOpGasLimit ?? userOp.paymasterPostOpGasLimit,
    };
  }

  /** Attach packed paymaster data returned from {@link paymasterSign} */
  static applyPaymasterAndData(
    userOp: UserOperationAvax,
    paymasterAndData: string
  ): UserOperationAvax {
    return {
      ...userOp,
      paymasterAndData,
      paymaster: undefined,
      paymasterData: undefined,
      paymasterVerificationGasLimit: undefined,
      paymasterPostOpGasLimit: undefined,
    };
  }

  async getChainId(): Promise<string> {
    return this.rpc<string>('eth_chainId', []);
  }

  async getSupportedEntryPoints(): Promise<string[]> {
    return this.rpc<string[]>('eth_supportedEntryPoints', []);
  }

  async estimateUserOperationGas(
    userOp: UserOperationAvax,
    entryPoint: string
  ): Promise<GasEstimateAvax> {
    return this.rpc<GasEstimateAvax>('eth_estimateUserOperationGas', [
      userOp,
      entryPoint,
    ]);
  }

  async sendUserOperation(
    userOp: UserOperationAvax,
    entryPoint: string
  ): Promise<string> {
    return this.rpc<string>('eth_sendUserOperation', [userOp, entryPoint]);
  }

  async getUserOperationReceipt(
    userOpHash: string
  ): Promise<UserOperationReceiptAvax | null> {
    return this.rpc<UserOperationReceiptAvax | null>(
      'eth_getUserOperationReceipt',
      [userOpHash]
    );
  }

  async waitForUserOperationReceipt(
    userOpHash: string,
    options?: { pollMs?: number; timeoutMs?: number }
  ): Promise<UserOperationReceiptAvax | null> {
    const pollMs = options?.pollMs ?? 2_000;
    const timeoutMs = options?.timeoutMs ?? 120_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const receipt = await this.getUserOperationReceipt(userOpHash);
      if (receipt) return receipt;
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return null;
  }

  async paymasterSign(
    body: PaymasterSignRequestAvax
  ): Promise<PaymasterSignResponseAvax> {
    const res = await this.http.post<PaymasterSignResponseAvax>(
      '/api/v1/bundler/paymaster/sign',
      body
    );
    if (!res.success || !res.data) {
      throw new Error('[SmoothSendAvaxSubmitter] paymasterSign failed');
    }
    const data = res.data;
    if (!data.success) {
      throw new Error(
        `[SmoothSendAvaxSubmitter] paymasterSign: ${data.error ?? 'unknown error'}`
      );
    }
    return data;
  }

  /**
   * Preflight fee estimate for `user-pays-erc20` mode.
   *
   * This performs:
   *  1) `eth_estimateUserOperationGas`
   *  2) `paymaster/sign` in `user-pays-erc20` mode
   * and returns `feePreview` when available.
   */
  async estimateUserPaysFee(
    opts: EstimateUserPaysFeeAvaxOptions
  ): Promise<{
    entryPoint: string;
    userOp: UserOperationAvax;
    gas: GasEstimateAvax;
    exchangeRate?: string;
    feePreview?: AvaxFeePreview;
  }> {
    const entryPoint =
      opts.entryPoint ?? (await this.getSupportedEntryPoints())[0];
    if (!entryPoint) {
      throw new Error('[SmoothSendAvaxSubmitter] no EntryPoint from bundler');
    }

    let userOp: UserOperationAvax = {
      ...opts.userOp,
      signature: opts.userOp.signature ?? '0x',
    };

    const gas = await this.estimateUserOperationGas(userOp, entryPoint);
    userOp = SmoothSendAvaxSubmitter.applyGasEstimate(userOp, gas);

    const signedPm = await this.paymasterSign({
      mode: 'user-pays-erc20',
      userOp,
      ...opts.paymaster,
    });

    return {
      entryPoint,
      userOp,
      gas,
      exchangeRate: signedPm.exchangeRate,
      feePreview: signedPm.feePreview,
    };
  }

  async getBundlerHealth(): Promise<unknown> {
    const res = await this.http.get('/api/v1/bundler/health');
    if (!res.success) throw new Error('[SmoothSendAvaxSubmitter] health failed');
    return res.data;
  }

  /** Fetch public AA addresses (Factory, Paymaster) from gateway. */
  async getPublicAaDefaults() {
    const { fetchAvaxAaPublicDefaults } = await import('./publicAaDefaults');
    return fetchAvaxAaPublicDefaults(this.config.gatewayUrl ?? DEFAULT_GATEWAY);
  }

  /**
   * One call: estimate gas → paymaster/sign → merge → your sign → send → (optional) wait for receipt.
   */
  async submitSponsoredUserOperation(
    opts: SubmitSponsoredAvaxUserOpOptions
  ): Promise<{
    userOpHash: string;
    receipt: UserOperationReceiptAvax | null;
  }> {
    const entryPoint =
      opts.entryPoint ?? (await this.getSupportedEntryPoints())[0];
    if (!entryPoint) {
      throw new Error('[SmoothSendAvaxSubmitter] no EntryPoint from bundler');
    }

    let userOp: UserOperationAvax = {
      ...opts.userOp,
      signature: opts.userOp.signature ?? '0x',
    };

    const gas = await this.estimateUserOperationGas(userOp, entryPoint);
    userOp = SmoothSendAvaxSubmitter.applyGasEstimate(userOp, gas);

    const signedPm = await this.paymasterSign({
      mode: opts.mode ?? 'developer-sponsored',
      userOp,
      ...opts.paymaster,
    });
    userOp = SmoothSendAvaxSubmitter.applyPaymasterAndData(
      userOp,
      signedPm.paymasterAndData
    );

    userOp = {
      ...userOp,
      signature: await opts.signUserOp(userOp),
    };

    const userOpHash = await this.sendUserOperation(userOp, entryPoint);

    if (opts.waitForReceipt === false) {
      return { userOpHash, receipt: null };
    }

    const receipt = await this.waitForUserOperationReceipt(
      userOpHash,
      opts.receiptPoll
    );
    return { userOpHash, receipt };
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const id = this.rpcId++;
    const envelope = await this.http.post<JsonRpcResponseAvax<T>>('/', {
      jsonrpc: '2.0',
      id,
      method,
      params,
    });

    if (!envelope.success || envelope.data == null) {
      throw new Error(`[SmoothSendAvaxSubmitter] ${method}: empty response`);
    }

    const body = envelope.data;
    if (body.error) {
      const msg = sanitizeAvaxBundlerRpcMessage(String(body.error.message ?? ''));
      throw new Error(`[SmoothSendAvaxSubmitter] ${method}: ${body.error.code} ${msg}`);
    }
    if (body.result === undefined) {
      throw new Error(`[SmoothSendAvaxSubmitter] ${method}: missing result`);
    }
    return body.result;
  }
}

/**
 * @alias {@link SmoothSendAvaxSubmitter}
 */
export const AvaxSubmitter = SmoothSendAvaxSubmitter;

export function createSmoothSendAvaxSubmitter(
  config: SmoothSendAvaxSubmitterConfig
): SmoothSendAvaxSubmitter {
  return new SmoothSendAvaxSubmitter(config);
}
