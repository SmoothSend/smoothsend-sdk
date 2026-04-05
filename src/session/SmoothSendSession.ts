import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519Account,
  AbstractedAccount,
  AccountAddress,
  MoveVector,
  type AnyRawTransaction,
} from '@aptos-labs/ts-sdk';
import type { SmoothSendTransactionSubmitter } from '../wallet-adapter/SmoothSendTransactionSubmitter';
import { ADD_PERMISSIONED_HANDLE_BYTECODE } from './constants';

// ─── helpers ────────────────────────────────────────────────────────────────

function parseDurationToSeconds(duration: string): number {
  if (duration === 'never') {
    // Client-side "never expires" mode; on-chain handle already uses u64::MAX.
    return Math.floor(Number.MAX_SAFE_INTEGER / 1000);
  }
  const n = parseInt(duration, 10);
  if (isNaN(n)) throw new Error(`Invalid duration "${duration}". Use e.g. "2h", "24h", "7d", or "never".`);
  if (duration.endsWith('s')) return n;
  if (duration.endsWith('m')) return n * 60;
  if (duration.endsWith('h')) return n * 3600;
  if (duration.endsWith('d')) return n * 86400;
  throw new Error(`Unknown duration unit in "${duration}". Supported: s, m, h, d, or "never".`);
}

// ─── types ───────────────────────────────────────────────────────────────────

export interface CreateSessionOptions {
  /**
   * The master account that owns the Aptos address.
   * Can be a KeylessAccount (Google/Apple login), Ed25519Account, or any Account
   * that implements the Aptos Account interface.
   *
   * @example keylessAccount from aptos.deriveKeylessAccount(...)
   * @example Account.fromPrivateKey({ privateKey })
   */
  signer: Account;

  /**
   * How long the session should stay valid.
   * Format: number + unit (s = seconds, m = minutes, h = hours, d = days)
   * @example '2h' | '24h' | '7d' | 'never'
   */
  expiresIn: string;

  /**
   * Network to use. Inferred from submitter if not provided.
   */
  network?: 'testnet' | 'mainnet';
}

export interface SessionInfo {
  /** The user's main account address — sender for all transactions */
  masterAddress: string;
  /** The temporary session key address (for debugging / display) */
  sessionKeyAddress: string;
  /** When this session expires (Unix timestamp in ms) */
  expiresAt: number;
  /** Network this session operates on */
  network: 'testnet' | 'mainnet';
}

export interface SubmitResult {
  hash: string;
}

// ─── SmoothSendSession ───────────────────────────────────────────────────────

/**
 * A session that lets your app submit transactions on behalf of a user
 * without any wallet popup after the initial one-time setup.
 *
 * Uses Aptos AIP-103 Permissioned Signers — authorization is enforced
 * on-chain by `0x1::permissioned_delegation`. No custom Move contract needed.
 *
 * @example
 * // 1. One-time setup (user signs once — can be keyless/Google login)
 * const session = await SmoothSendSession.create({
 *   signer: keylessAccount,
 *   expiresIn: '24h',
 * }, submitter)
 *
 * // 2. Every action after — zero popups, zero gas
 * await session.submit('0xgame::player::move', ['north'])
 * await session.submit('0xgame::player::attack', [enemyId])
 */
export class SmoothSendSession {
  private readonly sessionAccount: Ed25519Account;
  private readonly abstractedAccount: AbstractedAccount;
  private readonly masterAddress: AccountAddress;
  private readonly expiresAtMs: number;
  private readonly submitter: SmoothSendTransactionSubmitter;
  private readonly aptosClient: Aptos;
  private readonly _network: 'testnet' | 'mainnet';

  private constructor(args: {
    sessionAccount: Ed25519Account;
    abstractedAccount: AbstractedAccount;
    masterAddress: AccountAddress;
    expiresAtMs: number;
    submitter: SmoothSendTransactionSubmitter;
    aptosClient: Aptos;
    network: 'testnet' | 'mainnet';
  }) {
    this.sessionAccount = args.sessionAccount;
    this.abstractedAccount = args.abstractedAccount;
    this.masterAddress = args.masterAddress;
    this.expiresAtMs = args.expiresAtMs;
    this.submitter = args.submitter;
    this.aptosClient = args.aptosClient;
    this._network = args.network;
  }

  /**
   * Create a new session.
   *
   * Registers the session key on-chain via
   * `0x1::permissioned_delegation::add_permissioned_handle`.
   * SmoothSend pays the gas for this setup transaction too.
   *
   * After this returns, the user never needs to approve anything again
   * until the session expires or is revoked.
   */
  static async create(
    options: CreateSessionOptions,
    submitter: SmoothSendTransactionSubmitter,
  ): Promise<SmoothSendSession> {
    // Resolve network from options or submitter config
    const network: 'testnet' | 'mainnet' =
      options.network ?? (submitter.getConfig().network as 'testnet' | 'mainnet') ?? 'testnet';
    const aptosNetwork = network === 'mainnet' ? Network.MAINNET : Network.TESTNET;
    const aptosClient = new Aptos(new AptosConfig({ network: aptosNetwork }));

    const feature = await aptosClient.view({
      payload: {
        function: '0x1::features::is_permissioned_signer_enabled',
        functionArguments: [],
      },
    }).catch(() => [false]);
    if (!Array.isArray(feature) || feature[0] !== true) {
      throw new Error('[SmoothSend] Session keys unavailable on this network (permissioned signer feature disabled).');
    }

    // Generate a fresh Ed25519 session keypair (lives in memory, never persisted)
    const sessionAccount = Account.generate() as Ed25519Account;

    // Client-side expiry tracking (the bytecode script doesn't take an expiry arg)
    const nowSecs = Math.floor(Date.now() / 1000);
    const expirationTimeSecs = nowSecs + parseDurationToSeconds(options.expiresIn);

    // Step 1: Register the session key on-chain via a pre-compiled Move script.
    // add_permissioned_handle is NOT an entry function — only callable from a Move script.
    // Must happen BEFORE enabling account abstraction.
    const setupTx = await aptosClient.transaction.build.simple({
      sender: options.signer.accountAddress,
      withFeePayer: true,
      data: {
        bytecode: ADD_PERMISSIONED_HANDLE_BYTECODE,
        functionArguments: [MoveVector.U8(sessionAccount.publicKey.toUint8Array())],
      },
      options: {
        replayProtectionNonce: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
      },
    });

    const senderAuth = aptosClient.transaction.sign({
      signer: options.signer,
      transaction: setupTx,
    });

    const setupResult = await submitter.submitTransaction({
      aptosConfig: aptosClient.config,
      transaction: setupTx as AnyRawTransaction,
      senderAuthenticator: senderAuth,
    });
    await aptosClient.waitForTransaction({ transactionHash: setupResult.hash });

    // Step 2: Enable account abstraction — tells the chain to use
    // 0x1::permissioned_delegation::authenticate for this account.
    // Idempotent — skip if already enabled.
    const aaEnabled = await aptosClient.abstraction.isAccountAbstractionEnabled({
      accountAddress: options.signer.accountAddress,
      authenticationFunction: '0x1::permissioned_delegation::authenticate',
    });

    if (!aaEnabled) {
      const aaTx = await aptosClient.transaction.build.simple({
        sender: options.signer.accountAddress,
        withFeePayer: true,
        data: {
          function: '0x1::account_abstraction::add_authentication_function',
          functionArguments: [
            AccountAddress.fromString('0x1'),
            'permissioned_delegation',
            'authenticate',
          ],
        },
      });
      const aaAuth = aptosClient.transaction.sign({ signer: options.signer, transaction: aaTx });
      const aaResult = await submitter.submitTransaction({
        aptosConfig: aptosClient.config,
        transaction: aaTx as AnyRawTransaction,
        senderAuthenticator: aaAuth,
      });
      await aptosClient.waitForTransaction({ transactionHash: aaResult.hash });
    }

    // Build AbstractedAccount — signs future txs with session key but
    // sender on-chain = master address. Chain validates via permissioned_delegation.
    const abstractedAccount = AbstractedAccount.fromPermissionedSigner({
      signer: sessionAccount,
      accountAddress: options.signer.accountAddress,
    });

    return new SmoothSendSession({
      sessionAccount,
      abstractedAccount,
      masterAddress: options.signer.accountAddress,
      expiresAtMs: expirationTimeSecs * 1000,
      submitter,
      aptosClient,
      network,
    });
  }

  /**
   * Submit a transaction silently — no wallet popup, zero gas.
   *
   * The transaction sender on-chain is still the user's main address.
   * The session key signs it, and `permissioned_delegation::authenticate`
   * validates the authorization at the VM level.
   *
   * @param functionName  Full Move function identifier e.g. '0xgame::player::move'
   * @param functionArguments  Arguments matching the Move function signature
   * @param typeArguments  Optional type arguments for generic functions
   *
   * @example
   * await session.submit('0xgame::player::move', ['north'])
   * await session.submit('0x1::coin::transfer', [recipientAddr, 1000000n])
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async submit(
    functionName: `${string}::${string}::${string}`,
    functionArguments: any[] = [],
    typeArguments: string[] = [],
  ): Promise<SubmitResult> {
    if (!this.isValid()) {
      throw new Error(
        `Session expired at ${new Date(this.expiresAtMs).toISOString()}. ` +
        `Call SmoothSendSession.create() to start a new session.`,
      );
    }

    // replayProtectionNonce: orderless transaction (AIP-123).
    // Lets users submit multiple session.submit() calls in parallel without
    // sequence number conflicts — critical for games, agents, rapid-fire actions.
    const tx = await this.aptosClient.transaction.build.simple({
      sender: this.masterAddress,
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

    // Session key signs on behalf of master address
    const senderAuth = this.aptosClient.transaction.sign({
      signer: this.abstractedAccount,
      transaction: tx,
    });

    const result = await this.submitter.submitTransaction({
      aptosConfig: this.aptosClient.config,
      transaction: tx as AnyRawTransaction,
      senderAuthenticator: senderAuth,
    });

    return { hash: result.hash };
  }

  /**
   * Whether this session is still valid (not yet expired).
   */
  isValid(): boolean {
    return Date.now() < this.expiresAtMs;
  }

  /**
   * Milliseconds until this session expires. Returns 0 if already expired.
   */
  expiresInMs(): number {
    return Math.max(0, this.expiresAtMs - Date.now());
  }

  /**
   * Session metadata — useful for display or debugging.
   */
  get info(): SessionInfo {
    return {
      masterAddress: this.masterAddress.toString(),
      sessionKeyAddress: this.sessionAccount.accountAddress.toString(),
      expiresAt: this.expiresAtMs,
      network: this._network,
    };
  }
}
