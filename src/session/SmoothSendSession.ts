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

// ─── Pre-compiled Move script bytecode ───────────────────────────────────────
// Source: aptos-labs/aptos-ts-sdk tests/e2e/transaction/helper.ts
// This script calls permissioned_delegation::add_permissioned_handle, which is
// NOT an entry function and cannot be called directly — only via a Move script.
// Takes one argument: the session public key bytes (vector<u8>).
const ADD_PERMISSIONED_HANDLE_BYTECODE =
  'a11ceb0b0700000a0801001002101603262c04520405563d079301d70208ea034010aa041f0103010401060109010d010e011201140002080002080700030b0700040c0f0005100701000001050301010001020704050001030a05060001050f01080100010311090a000106130b01000107150b0100010002030702060c0a020001080001060c010a02010801010802010803010b0401090004060c08020b0401080303010c03060c060c03050802030b04010803060c0c083c53454c463e5f30046d61696e094170746f73436f696e0a6170746f735f636f696e04636f696e196d6967726174655f746f5f66756e6769626c655f73746f72650765643235353139256e65775f756e76616c6964617465645f7075626c69635f6b65795f66726f6d5f627974657314556e76616c6964617465645075626c69634b657917' +
  '7065726d697373696f6e65645f64656c65676174696f6e0f67656e5f656432353531395f6b65790d44656c65676174696f6e4b65790b526174654c696d697465720c726174655f6c696d69746572066f7074696f6e046e6f6e65064f7074696f6e176164645f7065726d697373696f6e65645f68616e646c65167072696d6172795f66756e6769626c655f73746f7265146772616e745f6170745f7065726d697373696f6e167472616e73616374696f6e5f76616c69646174696f6e146772616e745f6761735f7065726d697373696f6effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000000000000000000000000000000000000000000000000000000000000114636f6d70696c6174696f6e5f6d65746164617461090003322e3003322e3100000c170a0038000b01110111020c020a0038010c040b020b040600a0724e1809000011040c060a000e060600e1f5050000000011050b000e060600e1f50500000000110602';

// ─── helpers ────────────────────────────────────────────────────────────────

function parseDurationToSeconds(duration: string): number {
  const n = parseInt(duration, 10);
  if (isNaN(n)) throw new Error(`Invalid duration "${duration}". Use e.g. "2h", "24h", "7d".`);
  if (duration.endsWith('s')) return n;
  if (duration.endsWith('m')) return n * 60;
  if (duration.endsWith('h')) return n * 3600;
  if (duration.endsWith('d')) return n * 86400;
  throw new Error(`Unknown duration unit in "${duration}". Supported: s, m, h, d.`);
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
   * @example '2h' | '24h' | '7d'
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
 * @experimental
 * Session keys require ACCOUNT_ABSTRACTION (feature 85) and PERMISSIONED_SIGNER (feature 84)
 * to be enabled on the Aptos network. As of now these features are only live on devnet/local node.
 * This will be fully released when the features are activated on testnet and mainnet.
 *
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
