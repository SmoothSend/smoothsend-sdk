import {
  SmoothSendError,
  STELLAR_ERROR_CODES,
} from '../types';
import { HttpClient } from '../utils/http';

/**
 * C-Address (Soroban Smart Account) response types
 */
export interface CAddressCreateResult {
  cAddress: string;
  txHash: string;
  alreadyExisted: boolean;
  explorerUrl: string;
}

export interface CAddressLookupResult {
  ownerGAddress: string;
  cAddress: string | null;
  hasAccount: boolean;
}

export interface CAddressBalance {
  asset: string;
  balance: string;
  symbol: string;
}

export interface CAddressBalanceResult {
  cAddress: string;
  balances: CAddressBalance[];
}

export interface CAddressBuildTransferResult {
  unsignedXDR: string;
  networkPassphrase: string;
}

export interface CAddressSubmitResult {
  txHash: string;
  explorerUrl: string;
}

export interface CAddressTransaction {
  type: 'sent' | 'received';
  asset: string;
  amount: string;
  counterparty: string;
  txHash: string;
  timestamp: string;
  ledger: number;
}

export interface CAddressHistoryResult {
  cAddress: string;
  transactions: CAddressTransaction[];
  count: number;
}

export interface CAddressHealthResult {
  service: string;
  relayerPublicKey: string;
  factoryContractId: string;
  isReady: boolean;
  network: string;
}

/**
 * Stellar C-Address Adapter — SDK for Soroban Smart Account operations
 * 
 * Provides a clean interface for:
 * - Creating C-addresses (smart accounts) from G-addresses
 * - Looking up existing C-addresses by owner
 * - Querying token balances (XLM, USDC, EURC)
 * - Building bridge transfers (G→C)
 * - Building smart account transfers (C→G, C→C)
 * - Submitting user-signed transactions via fee-bump
 * - Getting transaction history
 * 
 * All transactions are gasless — the relayer covers fees via fee-bump.
 * 
 * @example
 * ```typescript
 * import { SmoothSendSDK } from '@smoothsend/sdk';
 * 
 * const sdk = new SmoothSendSDK({ apiKey: 'pk_nogas_xxx', network: 'testnet' });
 * 
 * // Create a C-address for a G-address owner
 * const { cAddress } = await sdk.stellar.cAddress.create('GABCD...');
 * 
 * // Get balances
 * const { balances } = await sdk.stellar.cAddress.getBalances(cAddress);
 * 
 * // Build a bridge transfer (G→C), user signs, relayer fee-bumps
 * const { unsignedXDR } = await sdk.stellar.cAddress.buildBridgeTransfer({
 *   from: 'GABCD...',
 *   destination: cAddress,
 *   asset: 'USDC',
 *   amount: '10.5',
 * });
 * // Sign with wallet (e.g., Freighter)
 * const signedXDR = await wallet.signTransaction(unsignedXDR);
 * // Submit — relayer wraps in fee-bump
 * const { txHash } = await sdk.stellar.cAddress.submitTransfer(signedXDR);
 * ```
 */
export class StellarCAddressAdapter {
  private httpClient: HttpClient;
  private basePath: string;

  constructor(
    httpClient: HttpClient,
    network: 'testnet' | 'mainnet' = 'testnet',
  ) {
    this.httpClient = httpClient;
    // Multi-chain compatible path: /api/v1/relayer/{chain}/c-address
    this.basePath = '/api/v1/relayer/stellar/c-address';
  }

  /**
   * Create a new C-address (Soroban Smart Account) for a G-address owner.
   * If the owner already has a C-address, returns the existing one.
   * 
   * The relayer pays all deployment fees — completely gasless for the user.
   * 
   * @param ownerGAddress - The G-address that will control this smart account
   * @returns The new C-address, tx hash, and whether it already existed
   */
  async create(ownerGAddress: string): Promise<CAddressCreateResult> {
    this.validateGAddress(ownerGAddress);

    try {
      const response = await this.httpClient.post(
        `${this.basePath}/create`,
        { ownerGAddress },
        { headers: { 'X-Chain': 'stellar' } },
      );

      const data = response.data as any;
      if (!data.success) {
        throw new SmoothSendError(data.error || 'Failed to create C-address', 'C_ADDRESS_CREATE_FAILED', 500);
      }

      return {
        cAddress: data.cAddress,
        txHash: data.txHash,
        alreadyExisted: data.alreadyExisted,
        explorerUrl: data.explorerUrl,
      };
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Failed to create C-address: ${error instanceof Error ? error.message : String(error)}`,
        'C_ADDRESS_CREATE_FAILED',
        500,
      );
    }
  }

  /**
   * Look up the C-address for a given G-address owner.
   * Returns null if no C-address exists for this owner.
   * 
   * @param ownerGAddress - The G-address to look up
   */
  async lookup(ownerGAddress: string): Promise<CAddressLookupResult> {
    this.validateGAddress(ownerGAddress);

    try {
      const response = await this.httpClient.get(
        `${this.basePath}/lookup/${ownerGAddress}`,
        { headers: { 'X-Chain': 'stellar' } },
      );

      const data = response.data as any;
      return {
        ownerGAddress: data.ownerGAddress,
        cAddress: data.cAddress || null,
        hasAccount: data.hasAccount,
      };
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Failed to lookup C-address: ${error instanceof Error ? error.message : String(error)}`,
        'C_ADDRESS_LOOKUP_FAILED',
        500,
      );
    }
  }

  /**
   * Get token balances for a C-address.
   * Returns balances for XLM, USDC, and EURC.
   * 
   * @param cAddress - The C-address to query
   */
  async getBalances(cAddress: string): Promise<CAddressBalanceResult> {
    this.validateCAddress(cAddress);

    try {
      const response = await this.httpClient.get(
        `${this.basePath}/balance/${cAddress}`,
        { headers: { 'X-Chain': 'stellar' } },
      );

      const data = response.data as any;
      return {
        cAddress: data.cAddress,
        balances: data.balances,
      };
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Failed to get balances: ${error instanceof Error ? error.message : String(error)}`,
        'C_ADDRESS_BALANCE_FAILED',
        500,
      );
    }
  }

  /**
   * Build a bridge transfer (G→C) using SAC.transfer.
   * Returns unsigned XDR for the user to sign with their wallet.
   * After signing, submit via submitTransfer().
   * 
   * @param params.from - Sender G-address (signs the tx)
   * @param params.destination - Recipient C-address (or G-address)
   * @param params.asset - Asset to transfer: 'XLM', 'USDC', or 'EURC'
   * @param params.amount - Human-readable amount (e.g., '10.5')
   */
  async buildBridgeTransfer(params: {
    from: string;
    destination: string;
    asset: string;
    amount: string;
  }): Promise<CAddressBuildTransferResult> {
    this.validateGAddress(params.from);

    try {
      const response = await this.httpClient.post(
        `${this.basePath}/bridge-transfer`,
        params,
        { headers: { 'X-Chain': 'stellar' } },
      );

      const data = response.data as any;
      if (!data.success) {
        throw new SmoothSendError(data.error || 'Bridge transfer failed', 'BRIDGE_TRANSFER_FAILED', 500);
      }

      return {
        unsignedXDR: data.unsignedXDR,
        networkPassphrase: data.networkPassphrase,
      };
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Bridge transfer failed: ${error instanceof Error ? error.message : String(error)}`,
        'BRIDGE_TRANSFER_FAILED',
        500,
      );
    }
  }

  /**
   * Build a transfer from a C-address (SmartAccount.send).
   * Returns unsigned XDR for the owner to sign.
   * After signing, submit via submitTransfer().
   * 
   * @param params.from - Owner G-address (signs auth)
   * @param params.cAddress - Source C-address (holds the funds)
   * @param params.destination - Recipient (G or C address)
   * @param params.asset - Asset: 'XLM', 'USDC', or 'EURC'
   * @param params.amount - Human-readable amount
   */
  async buildTransfer(params: {
    from: string;
    cAddress: string;
    destination: string;
    asset: string;
    amount: string;
  }): Promise<CAddressBuildTransferResult> {
    this.validateGAddress(params.from);
    this.validateCAddress(params.cAddress);

    try {
      const response = await this.httpClient.post(
        `${this.basePath}/build-transfer`,
        params,
        { headers: { 'X-Chain': 'stellar' } },
      );

      const data = response.data as any;
      if (!data.success) {
        throw new SmoothSendError(data.error || 'Build transfer failed', 'BUILD_TRANSFER_FAILED', 500);
      }

      return {
        unsignedXDR: data.unsignedXDR,
        networkPassphrase: data.networkPassphrase,
      };
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Build transfer failed: ${error instanceof Error ? error.message : String(error)}`,
        'BUILD_TRANSFER_FAILED',
        500,
      );
    }
  }

  /**
   * Submit a user-signed transaction.
   * The relayer wraps it in a fee-bump transaction and submits to the network.
   * The user pays zero fees — the relayer covers everything.
   * 
   * @param signedXDR - The user-signed transaction XDR (base64)
   */
  async submitTransfer(signedXDR: string): Promise<CAddressSubmitResult> {
    if (!signedXDR) {
      throw new SmoothSendError('signedXDR is required', 'MISSING_SIGNED_XDR', 400);
    }

    try {
      const response = await this.httpClient.post(
        `${this.basePath}/submit-transfer`,
        { signedXDR },
        { headers: { 'X-Chain': 'stellar' } },
      );

      const data = response.data as any;
      if (!data.success) {
        throw new SmoothSendError(data.error || 'Submit failed', 'SUBMIT_TRANSFER_FAILED', 500);
      }

      return {
        txHash: data.txHash,
        explorerUrl: data.explorerUrl,
      };
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Submit transfer failed: ${error instanceof Error ? error.message : String(error)}`,
        'SUBMIT_TRANSFER_FAILED',
        500,
      );
    }
  }

  /**
   * Get transaction history for a C-address.
   * Returns recent transfer events (sent/received) across all supported tokens.
   * 
   * @param cAddress - The C-address to query
   * @param limit - Maximum number of transactions to return (default: 20)
   */
  async getHistory(cAddress: string, limit: number = 20): Promise<CAddressHistoryResult> {
    this.validateCAddress(cAddress);

    try {
      const response = await this.httpClient.get(
        `${this.basePath}/history/${cAddress}?limit=${limit}`,
        { headers: { 'X-Chain': 'stellar' } },
      );

      const data = response.data as any;
      return {
        cAddress: data.cAddress,
        transactions: data.transactions || [],
        count: data.count || 0,
      };
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Failed to get history: ${error instanceof Error ? error.message : String(error)}`,
        'C_ADDRESS_HISTORY_FAILED',
        500,
      );
    }
  }

  /**
   * Health check for the C-address bridge service.
   */
  async health(): Promise<CAddressHealthResult> {
    try {
      const response = await this.httpClient.get(
        `${this.basePath}/health`,
        { headers: { 'X-Chain': 'stellar' } },
      );

      const data = response.data as any;
      return {
        service: data.service,
        relayerPublicKey: data.relayerPublicKey,
        factoryContractId: data.factoryContractId,
        isReady: data.isReady,
        network: data.network,
      };
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `C-Address health check failed: ${error instanceof Error ? error.message : String(error)}`,
        'C_ADDRESS_HEALTH_FAILED',
        500,
      );
    }
  }

  // ─────────────────────────────────────────────────────────
  // Validation helpers
  // ─────────────────────────────────────────────────────────

  validateGAddress(address: string): void {
    if (!address || !address.startsWith('G') || address.length !== 56) {
      throw new SmoothSendError(
        'Invalid G-address. Must start with G and be 56 characters.',
        'INVALID_G_ADDRESS',
        400,
      );
    }
  }

  validateCAddress(address: string): void {
    if (!address || !address.startsWith('C') || address.length !== 56) {
      throw new SmoothSendError(
        'Invalid C-address. Must start with C and be 56 characters.',
        'INVALID_C_ADDRESS',
        400,
      );
    }
  }

  validateAddress(address: string): boolean {
    return (
      typeof address === 'string' &&
      address.length === 56 &&
      (address.startsWith('G') || address.startsWith('C'))
    );
  }
}
