/**
 * SmoothSend Transaction Submitter
 * 
 * A TransactionSubmitter implementation that integrates with the Aptos Wallet Adapter
 * to enable gasless transactions via SmoothSend's relayer network.
 * 
 * @example
 * ```typescript
 * import { SmoothSendTransactionSubmitter } from '@smoothsend/sdk';
 * import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react';
 * 
 * // Create the transaction submitter
 * const transactionSubmitter = new SmoothSendTransactionSubmitter({
 *   apiKey: 'pk_nogas_your_api_key_here',
 *   network: 'testnet'
 * });
 * 
 * // Use in your wallet provider - that's it!
 * <AptosWalletAdapterProvider
 *   dappConfig={{
 *     network: Network.TESTNET,
 *     transactionSubmitter: transactionSubmitter
 *   }}
 * >
 *   <App />
 * </AptosWalletAdapterProvider>
 * ```
 */

import type {
  AptosConfig,
  PendingTransactionResponse,
  AnyRawTransaction,
  AccountAuthenticator,
} from '@aptos-labs/ts-sdk';
import {
  Aptos,
  AptosConfig as AptosConfigClass,
  Network,
  Account,
  Ed25519Account,
  AbstractedAccount,
  AccountAddress,
  MoveVector,
} from '@aptos-labs/ts-sdk';
import { ADD_PERMISSIONED_HANDLE_BYTECODE } from '../session/constants';

// Re-export types for convenience
export type { AptosConfig, PendingTransactionResponse, AnyRawTransaction, AccountAuthenticator };

interface SessionState {
  sessionAccount: Ed25519Account;
  abstractedAccount: AbstractedAccount;
  masterAddress: AccountAddress;
  expiresAtMs: number;
  aptosClient: Aptos;
}

/**
 * Configuration options for SmoothSendTransactionSubmitter
 */
export interface SmoothSendTransactionSubmitterConfig {
  /**
   * Your SmoothSend API key
   * - Use `pk_nogas_*` for frontend applications (CORS protected)
   * - Use `sk_nogas_*` for backend applications only
   */
  apiKey: string;

  /**
   * Network to use
   * @default 'testnet'
   */
  network?: 'testnet' | 'mainnet';

  /**
   * Gateway URL (usually you don't need to change this)
   * @default 'https://proxy.smoothsend.xyz'
   */
  gatewayUrl?: string;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * A function that returns a captcha token (e.g. from Cloudflare Turnstile or reCAPTCHA).
   * Called before each transaction if the project requires captcha verification.
   * Return null/undefined to skip captcha.
   */
  getCaptchaToken?: () => Promise<string | null | undefined>;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;

  /**
   * Enable session key mode — user signs once, all subsequent transactions
   * are signed silently by an in-memory session key. Zero wallet popups after setup.
   *
   * Uses Aptos AIP-103 Permissioned Signers — enforced on-chain, not by SmoothSend.
   * SmoothSend pays gas for the one-time session setup transaction too.
   *
   * @default false
   *
   * @example
   * ```typescript
   * const smoothSend = new SmoothSendTransactionSubmitter({
   *   apiKey: 'pk_nogas_xxx',
   *   network: 'mainnet',
   *   session: true,
   * });
   * ```
   */
  session?: boolean;

  /**
   * How long the session key stays valid.
   * Format: number + unit (s, m, h, d)
   * Use "never" for client-side indefinite session validity.
   * @default '24h'
   */
  sessionDuration?: string;
}

/**
 * Response from the SmoothSend relayer
 */
interface RelayerResponse {
  success: boolean;
  requestId?: string;
  txnHash?: string;
  gasUsed?: string;
  vmStatus?: string;
  sender?: string;
  error?: string;
  details?: string;
}

/**
 * TransactionSubmitter interface compatible with @aptos-labs/ts-sdk v2.x
 * This interface allows the SmoothSendTransactionSubmitter to work as a drop-in
 * replacement for the default transaction submitter in the Aptos Wallet Adapter.
 */
export interface TransactionSubmitter {
  submitTransaction(args: {
    aptosConfig: AptosConfig;
    transaction: AnyRawTransaction;
    senderAuthenticator: AccountAuthenticator;
    feePayerAuthenticator?: AccountAuthenticator;
    additionalSignersAuthenticators?: Array<AccountAuthenticator>;
    pluginParams?: Record<string, unknown>;
  }): Promise<PendingTransactionResponse>;
}

/**
 * SmoothSend Transaction Submitter
 * 
 * Implements the TransactionSubmitter interface to enable gasless transactions
 * through the Aptos Wallet Adapter. Simply pass this to your AptosWalletAdapterProvider
 * and all transactions will automatically be submitted as gasless through SmoothSend.
 */
export class SmoothSendTransactionSubmitter implements TransactionSubmitter {
  private readonly apiKey: string;
  private readonly network: 'testnet' | 'mainnet';
  private readonly gatewayUrl: string;
  private readonly timeout: number;
  private readonly getCaptchaToken?: () => Promise<string | null | undefined>;
  private readonly debug: boolean;
  readonly sessionEnabled: boolean;
  private readonly sessionDuration: string;
  private _session: SessionState | null = null;

  constructor(config: SmoothSendTransactionSubmitterConfig) {
    if (!config.apiKey) {
      throw new Error('SmoothSend API key is required. Get your key at dashboard.smoothsend.xyz');
    }

    // Validate API key format
    if (!config.apiKey.startsWith('pk_nogas_') &&
      !config.apiKey.startsWith('sk_nogas_') &&
      !config.apiKey.startsWith('no_gas_')) {
      throw new Error('Invalid API key format. Key must start with pk_nogas_, sk_nogas_, or no_gas_');
    }

    // Warn if using secret key in browser
    if (config.apiKey.startsWith('sk_nogas_') && typeof window !== 'undefined') {
      console.warn(
        '⚠️ WARNING: Secret key detected in browser environment.\n' +
        'Secret keys (sk_nogas_*) should only be used in server-side code.\n' +
        'Use public keys (pk_nogas_*) for frontend applications.'
      );
    }

    this.apiKey = config.apiKey;
    this.network = config.network || 'testnet';
    this.gatewayUrl = config.gatewayUrl || 'https://proxy.smoothsend.xyz';
    this.timeout = config.timeout || 30000;
    this.getCaptchaToken = config.getCaptchaToken;
    this.debug = config.debug || false;
    this.sessionEnabled = config.session || false;
    this.sessionDuration = config.sessionDuration || '24h';
  }

  // ─── Session key methods ────────────────────────────────────────────────────

  /**
   * Whether a valid session is currently active.
   */
  hasSession(): boolean {
    return this._session !== null && Date.now() < this._session.expiresAtMs;
  }

  /**
   * Create a session key for the given master account.
   * Called once by useSmoothSend when session: true and no session exists.
   * SmoothSend pays gas for the setup transaction.
   *
   * @param masterAccount - The user's wallet account (from wallet adapter)
   */
  async createSession(masterAccount: Account): Promise<void> {
    const network = this.network === 'mainnet' ? Network.MAINNET : Network.TESTNET;
    const aptosClient = new Aptos(new AptosConfigClass({ network }));

    // Generate fresh in-memory session keypair
    const sessionAccount = Account.generate() as Ed25519Account;

    const expiresAtMs = Date.now() + this._parseDuration(this.sessionDuration);

    // Step 1: Register session key on-chain via pre-compiled Move script
    const setupTx = await aptosClient.transaction.build.simple({
      sender: masterAccount.accountAddress,
      withFeePayer: true,
      data: {
        bytecode: ADD_PERMISSIONED_HANDLE_BYTECODE,
        functionArguments: [MoveVector.U8(sessionAccount.publicKey.toUint8Array())],
      },
      options: {
        replayProtectionNonce: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
      },
    });

    const senderAuth = await this.signSenderAuthenticator(
      masterAccount,
      setupTx as AnyRawTransaction,
      aptosClient,
    );

    const setupResult = await this.submitTransaction({
      aptosConfig: aptosClient.config,
      transaction: setupTx as AnyRawTransaction,
      senderAuthenticator: senderAuth as AccountAuthenticator,
    });
    await aptosClient.waitForTransaction({ transactionHash: setupResult.hash });

    if (this.debug) {
      console.log('[SmoothSend] Session key registered on-chain:', setupResult.hash);
    }

    // Step 2: Enable account abstraction (idempotent — skip if already on)
    const aaEnabled = await aptosClient.abstraction.isAccountAbstractionEnabled({
      accountAddress: masterAccount.accountAddress,
      authenticationFunction: '0x1::permissioned_delegation::authenticate',
    });

    if (!aaEnabled) {
      const aaTx = await aptosClient.transaction.build.simple({
        sender: masterAccount.accountAddress,
        withFeePayer: true,
        data: {
          function: '0x1::account_abstraction::add_authentication_function',
          functionArguments: [
            AccountAddress.fromString('0x1'),
            'permissioned_delegation',
            'authenticate',
          ],
        },
        options: {
          replayProtectionNonce: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
        },
      });
      const aaAuth = await this.signSenderAuthenticator(
        masterAccount,
        aaTx as AnyRawTransaction,
        aptosClient,
      );
      const aaResult = await this.submitTransaction({
        aptosConfig: aptosClient.config,
        transaction: aaTx as AnyRawTransaction,
        senderAuthenticator: aaAuth as AccountAuthenticator,
      });
      await aptosClient.waitForTransaction({ transactionHash: aaResult.hash });

      if (this.debug) {
        console.log('[SmoothSend] Account abstraction enabled:', aaResult.hash);
      }
    }

    // Build AbstractedAccount — signs future txs with session key,
    // sender on-chain = master address, chain validates via permissioned_delegation
    const abstractedAccount = AbstractedAccount.fromPermissionedSigner({
      signer: sessionAccount,
      accountAddress: masterAccount.accountAddress,
    });

    this._session = {
      sessionAccount,
      abstractedAccount,
      masterAddress: masterAccount.accountAddress,
      expiresAtMs,
      aptosClient,
    };
  }

  private async signSenderAuthenticator(
    signer: Account,
    transaction: AnyRawTransaction,
    aptosClient: Aptos,
  ): Promise<AccountAuthenticator> {
    const walletLikeSigner = signer as any;

    // Wallet-adapter compatible path (returns { authenticator, rawTransaction } in v8)
    if (typeof walletLikeSigner?.signTransactionWithAuthenticator === 'function') {
      const result = await walletLikeSigner.signTransactionWithAuthenticator(transaction);
      return (result?.authenticator ?? result) as AccountAuthenticator;
    }

    // Native ts-sdk account path
    return aptosClient.transaction.sign({
      signer,
      transaction,
    }) as AccountAuthenticator;
  }

  /**
   * Submit a transaction using the active session key — no wallet popup.
   * Called by useSmoothSend after session is established.
   */
  async submitWithSession(functionName: `${string}::${string}::${string}`, functionArguments: any[] = [], typeArguments: string[] = []): Promise<PendingTransactionResponse> {
    if (!this._session || !this.hasSession()) {
      throw new Error('[SmoothSend] No active session. Call createSession() first.');
    }

    const { abstractedAccount, masterAddress, aptosClient } = this._session;

    const tx = await aptosClient.transaction.build.simple({
      sender: masterAddress,
      withFeePayer: true,
      data: {
        function: functionName,
        functionArguments,
        ...(typeArguments.length > 0 ? { typeArguments } : {}),
      },
      options: {
        replayProtectionNonce: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
      },
    });

    const senderAuth = aptosClient.transaction.sign({
      signer: abstractedAccount,
      transaction: tx,
    });

    return this.submitTransaction({
      aptosConfig: aptosClient.config,
      transaction: tx as AnyRawTransaction,
      senderAuthenticator: senderAuth as AccountAuthenticator,
    });
  }

  private _parseDuration(duration: string): number {
    if (duration === 'never') {
      // Client-side "never expires" mode; on-chain handle already uses u64::MAX.
      return Number.MAX_SAFE_INTEGER;
    }
    const n = parseInt(duration, 10);
    if (isNaN(n)) throw new Error(`Invalid sessionDuration "${duration}". Use e.g. "2h", "24h", "7d", or "never".`);
    if (duration.endsWith('s')) return n * 1000;
    if (duration.endsWith('m')) return n * 60 * 1000;
    if (duration.endsWith('h')) return n * 3600 * 1000;
    if (duration.endsWith('d')) return n * 86400 * 1000;
    throw new Error(`Unknown unit in "${duration}". Supported: s, m, h, d, or "never".`);
  }

  // ─── Transaction submission ──────────────────────────────────────────────────

  /**
   * Submit a transaction through SmoothSend's gasless relayer
   * 
   * This method is called automatically by the Aptos Wallet Adapter when
   * you use signAndSubmitTransaction. The transaction is submitted to
   * SmoothSend's relayer which sponsors the gas fees.
   */
  async submitTransaction(args: {
    aptosConfig: AptosConfig;
    transaction: AnyRawTransaction;
    senderAuthenticator: AccountAuthenticator;
    feePayerAuthenticator?: AccountAuthenticator;
    additionalSignersAuthenticators?: Array<AccountAuthenticator>;
    pluginParams?: Record<string, unknown>;
  }): Promise<PendingTransactionResponse> {
    const { aptosConfig, transaction, senderAuthenticator, pluginParams } = args;

    // Auto-detect network from aptosConfig (source of truth from wallet adapter)
    // Falls back to constructor value if aptosConfig doesn't have a recognized network
    const detectedNetwork = this.resolveNetwork(aptosConfig);

    if (this.debug) {
      console.log('[SmoothSend] Submitting gasless transaction:', {
        sender: transaction.rawTransaction?.sender?.toString(),
        configNetwork: this.network,
        detectedNetwork,
      });
    }

    if (detectedNetwork !== this.network && this.debug) {
      console.warn(
        `[SmoothSend] Network mismatch: constructor=${this.network}, aptosConfig=${detectedNetwork}. ` +
        `Using aptosConfig network (${detectedNetwork}).`
      );
    }

    try {
      // Serialize transaction and authenticator to bytes
      const transactionBytes = Array.from(transaction.bcsToBytes());
      const authenticatorBytes = Array.from(senderAuthenticator.bcsToBytes());

      // Prepare request payload — always use the detected network
      const payload = {
        transactionBytes,
        authenticatorBytes,
        network: detectedNetwork,
        functionName: pluginParams?.functionName || 'unknown',
      };

      // Make request to SmoothSend gateway
      const response = await this.makeRequest('/api/v1/relayer/gasless-transaction', payload, detectedNetwork);

      if (!response.success || !response.txnHash) {
        throw new Error(response.error || response.details || 'Transaction submission failed');
      }

      if (this.debug) {
        console.log('[SmoothSend] Transaction successful:', {
          hash: response.txnHash,
          gasUsed: response.gasUsed,
        });
      }

      // Return in the format expected by Aptos SDK
      return {
        hash: response.txnHash,
        sender: response.sender || transaction.rawTransaction?.sender?.toString() || '',
        sequence_number: transaction.rawTransaction?.sequence_number?.toString() || '0',
        max_gas_amount: transaction.rawTransaction?.max_gas_amount?.toString() || '0',
        gas_unit_price: transaction.rawTransaction?.gas_unit_price?.toString() || '0',
        expiration_timestamp_secs: transaction.rawTransaction?.expiration_timestamp_secs?.toString() || '0',
        payload: {},
        signature: undefined,
      } as PendingTransactionResponse;

    } catch (error: any) {
      if (this.debug) {
        console.error('[SmoothSend] Transaction failed:', error);
      }
      throw new Error(`SmoothSend gasless transaction failed: ${error.message}`);
    }
  }

  /**
   * Resolve the effective network from aptosConfig.
   * aptosConfig.network is the source of truth set by AptosWalletAdapterProvider.
   */
  private resolveNetwork(aptosConfig: AptosConfig): 'testnet' | 'mainnet' {
    try {
      const configNetwork = (aptosConfig as any)?.network;
      if (configNetwork === 'testnet' || configNetwork === 'mainnet') {
        return configNetwork;
      }
      if (typeof configNetwork === 'string') {
        const normalized = configNetwork.toLowerCase();
        if (normalized === 'testnet' || normalized === 'mainnet') {
          return normalized as 'testnet' | 'mainnet';
        }
      }
    } catch {
      // fall through
    }
    return this.network;
  }

  /**
   * Make an HTTP request to the SmoothSend gateway
   */
  private async makeRequest(endpoint: string, payload: Record<string, unknown>, network?: 'testnet' | 'mainnet', method: 'GET' | 'POST' = 'POST'): Promise<RelayerResponse> {
    const effectiveNetwork = network || this.network;
    const url = `${this.gatewayUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'X-Chain': `aptos-${effectiveNetwork}`,
    };

    // Add Origin header for public keys in browser
    if (this.apiKey.startsWith('pk_nogas_') && typeof window !== 'undefined') {
      headers['Origin'] = window.location.origin;
    }

    // Add captcha token if the project requires it
    if (this.getCaptchaToken) {
      try {
        const token = await this.getCaptchaToken();
        if (token) {
          headers['X-Captcha-Token'] = token;
        }
      } catch (e) {
        if (this.debug) {
          console.warn('[SmoothSend] Failed to get captcha token:', e);
        }
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: method === 'GET' ? undefined : JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw error;
    }
  }

  private sponsoredFunctionsCache: string[] | null = null;
  private sponsoredFunctionsCacheAt = 0;
  private readonly SPONSORED_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Fetch the list of sponsored functions for this API key's project.
   * Results are cached for 5 minutes. Returns ['*'] if all functions are sponsored.
   */
  async getSponsoredFunctions(): Promise<string[]> {
    const now = Date.now();
    if (this.sponsoredFunctionsCache !== null && now - this.sponsoredFunctionsCacheAt < this.SPONSORED_CACHE_TTL) {
      return this.sponsoredFunctionsCache;
    }
    try {
      const response = await this.makeRequest('/api/v1/sponsorship', {}, undefined, 'GET');
      const fns = (response as any).sponsoredFunctions;
      this.sponsoredFunctionsCache = Array.isArray(fns) ? fns : ['*'];
    } catch {
      this.sponsoredFunctionsCache = ['*']; // fail-open: assume all sponsored
    }
    this.sponsoredFunctionsCacheAt = now;
    return this.sponsoredFunctionsCache!;
  }

  /**
   * Check if a specific function is sponsored for gasless execution.
   * @param functionName - Full function identifier, e.g. "0x123::module::function"
   */
  async isSponsored(functionName: string): Promise<boolean> {
    const fns = await this.getSponsoredFunctions();
    if (fns.includes('*')) return true;
    const normalize = (id: string) => id.replace(/^(0x)0+([1-9a-f][0-9a-f]*)(::.+)$/i, '$1$2$3').toLowerCase();
    const normalized = normalize(functionName);
    return fns.some(f => normalize(f) === normalized);
  }

  /**
   */
  getConfig(): Readonly<SmoothSendTransactionSubmitterConfig> {
    return {
      apiKey: this.apiKey.substring(0, 15) + '...', // Don't expose full key
      network: this.network,
      gatewayUrl: this.gatewayUrl,
      timeout: this.timeout,
      debug: this.debug,
    };
  }
}

/**
 * Create a SmoothSend transaction submitter with minimal configuration
 * 
 * @example
 * ```typescript
 * const submitter = createSmoothSendSubmitter('pk_nogas_your_key');
 * ```
 */
export function createSmoothSendSubmitter(
  apiKey: string,
  options?: Partial<Omit<SmoothSendTransactionSubmitterConfig, 'apiKey'>>
): SmoothSendTransactionSubmitter {
  return new SmoothSendTransactionSubmitter({
    apiKey,
    ...options,
  });
}
