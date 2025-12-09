/**
 * Script Composer Client
 * 
 * Wrapper for Script Composer gasless transactions.
 * Use this for token transfers on mainnet with free tier (fee deducted from token).
 * 
 * @remarks
 * Script Composer builds a batched transaction that:
 * 1. Withdraws (amount + fee) from sender
 * 2. Deposits amount to recipient
 * 3. Deposits fee to treasury
 * 
 * This allows gasless transactions where the fee is paid in the token being transferred.
 * 
 * @example
 * ```typescript
 * import { ScriptComposerClient } from '@smoothsend/aptos-sdk';
 * 
 * const client = new ScriptComposerClient({
 *   apiKey: 'pk_nogas_xxx',
 *   network: 'mainnet'
 * });
 * 
 * // Step 1: Build transaction (fee calculated automatically)
 * const { transactionBytes, fee, totalAmount } = await client.buildTransfer({
 *   sender: wallet.address,
 *   recipient: '0x123...',
 *   amount: '1000000', // 1 USDC (6 decimals)
 *   assetType: '0x...::usdc::USDC',
 *   decimals: 6,
 *   symbol: 'USDC'
 * });
 * 
 * // Step 2: Sign with wallet
 * const signedTx = await wallet.signTransaction(transactionBytes);
 * 
 * // Step 3: Submit
 * const result = await client.submitSignedTransaction({
 *   transactionBytes: signedTx.transactionBytes,
 *   authenticatorBytes: signedTx.authenticatorBytes
 * });
 * 
 * console.log('Tx:', result.txHash);
 * ```
 */

import { HttpClient } from '../utils/http';
import { SmoothSendError, NetworkError } from '../types/errors';

/**
 * Configuration for Script Composer Client
 */
export interface ScriptComposerConfig {
  /** API key for authentication (pk_nogas_* or sk_nogas_*) */
  apiKey: string;
  /** Network to use: 'testnet' or 'mainnet' */
  network: 'testnet' | 'mainnet';
  /** Custom proxy URL (optional, defaults to proxy.smoothsend.xyz) */
  proxyUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Parameters for building a Script Composer transfer
 */
export interface BuildTransferParams {
  /** Sender's wallet address */
  sender: string;
  /** Recipient's wallet address */
  recipient: string;
  /** Amount in smallest units (e.g., 1000000 for 1 USDC) */
  amount: string;
  /** Full asset type address (e.g., '0x...::usdc::USDC') */
  assetType: string;
  /** Token decimals (e.g., 6 for USDC, 8 for APT) */
  decimals: number;
  /** Token symbol (e.g., 'USDC', 'APT') */
  symbol: string;
}

/**
 * Result from building a transfer
 */
export interface BuildTransferResult {
  /** Success status */
  success: boolean;
  /** Request ID for tracking */
  requestId: string;
  /** Serialized transaction bytes for wallet signing */
  transactionBytes: number[];
  /** Transaction details */
  transaction: {
    sender: string;
    recipient: string;
    amount: string;
    assetType: string;
    network: string;
  };
  /** Fee amount in smallest units */
  fee: string;
  /** Total amount (amount + fee) in smallest units */
  totalAmount: string;
  /** Fee breakdown with formatted values */
  feeBreakdown: {
    amount: string;
    fee: string;
    totalAmount: string;
    formatted: {
      amount: string;
      fee: string;
      totalAmount: string;
    };
    pricing: {
      tier: string;
      zeroFees: boolean;
      feeInUsd: number;
      tokenPrice: number | null;
      description: string;
    };
  };
}

/**
 * Parameters for submitting a signed transaction
 */
export interface SubmitSignedTransactionParams {
  /** Serialized transaction bytes (from wallet signing) */
  transactionBytes: number[];
  /** Serialized authenticator bytes (from wallet signing) */
  authenticatorBytes: number[];
}

/**
 * Result from submitting a transaction
 */
export interface SubmitTransactionResult {
  /** Success status */
  success: boolean;
  /** Request ID for tracking */
  requestId: string;
  /** Transaction hash */
  txHash: string;
  /** Gas used */
  gasUsed?: string;
  /** VM status */
  vmStatus?: string;
  /** Sender address */
  sender?: string;
}

/**
 * Fee estimation result
 */
export interface FeeEstimateResult {
  /** Success status */
  success: boolean;
  /** Request ID for tracking */
  requestId: string;
  /** Fee estimation details */
  estimation: {
    /** Amount in smallest units */
    amount: string;
    /** Fee in smallest units */
    fee: string;
    /** Total amount in smallest units */
    totalAmount: string;
    /** Formatted values for display */
    formatted: {
      amount: string;
      fee: string;
      totalAmount: string;
    };
    /** Pricing information */
    pricing: {
      tier: string;
      zeroFees: boolean;
      feeInUsd: number;
      tokenPrice: number | null;
      description: string;
    };
    /** Usage information */
    usage: {
      monthlyLimit: number;
      usedThisMonth: number;
      remaining: number;
    };
  };
}

/**
 * Script Composer Client
 * 
 * For gasless token transfers with fee deducted from the token.
 * Use this on mainnet with free tier, or anytime you want fee-in-token.
 */
export class ScriptComposerClient {
  private httpClient: HttpClient;
  private config: Required<Omit<ScriptComposerConfig, 'proxyUrl'>> & { proxyUrl?: string };

  constructor(config: ScriptComposerConfig) {
    if (!config.apiKey) {
      throw new SmoothSendError(
        'API key is required',
        'MISSING_API_KEY',
        400
      );
    }

    if (!config.network) {
      throw new SmoothSendError(
        'Network is required (testnet or mainnet)',
        'MISSING_NETWORK',
        400
      );
    }

    this.config = {
      apiKey: config.apiKey,
      network: config.network,
      proxyUrl: config.proxyUrl,
      timeout: config.timeout || 30000,
      debug: config.debug || false,
    };

    this.httpClient = new HttpClient({
      apiKey: this.config.apiKey,
      network: this.config.network,
      timeout: this.config.timeout,
      retries: 3,
      includeOrigin: this.isBrowser(),
    });
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof window.document !== 'undefined';
  }

  private log(message: string, data?: any): void {
    if (this.config.debug) {
      console.log(`[ScriptComposer] ${message}`, data || '');
    }
  }

  /**
   * Estimate fee for a transfer without building the transaction
   * 
   * @param params Transfer parameters
   * @returns Fee estimation with pricing details
   */
  async estimateFee(params: BuildTransferParams): Promise<FeeEstimateResult> {
    this.log('Estimating fee', params);

    try {
      const response = await this.httpClient.post('/api/v1/relayer/estimate-fee', {
        sender: params.sender,
        recipient: params.recipient,
        amount: params.amount,
        assetType: params.assetType,
        decimals: params.decimals,
        symbol: params.symbol,
        network: this.config.network,
        apiKey: this.config.apiKey,
      });

      this.log('Fee estimate received', response.data);
      return response.data as FeeEstimateResult;
    } catch (error: any) {
      this.log('Fee estimation failed', error);
      
      if (error instanceof SmoothSendError) {
        throw error;
      }

      throw new SmoothSendError(
        `Failed to estimate fee: ${error.message}`,
        'FEE_ESTIMATION_FAILED',
        500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Build a gasless transfer transaction
   * 
   * Returns unsigned transaction bytes that must be signed by the user's wallet.
   * The fee will be deducted from the token being transferred.
   * 
   * @param params Transfer parameters
   * @returns Transaction bytes for signing and fee details
   */
  async buildTransfer(params: BuildTransferParams): Promise<BuildTransferResult> {
    this.log('Building transfer', params);

    // Validate parameters
    if (!params.sender || !params.recipient || !params.amount) {
      throw new SmoothSendError(
        'Missing required parameters: sender, recipient, amount',
        'INVALID_PARAMETERS',
        400
      );
    }

    if (!params.assetType || params.decimals === undefined || !params.symbol) {
      throw new SmoothSendError(
        'Missing token parameters: assetType, decimals, symbol',
        'INVALID_PARAMETERS',
        400
      );
    }

    try {
      // Call the gasless-transaction endpoint in Script Composer mode
      const response = await this.httpClient.post('/api/v1/relayer/gasless-transaction', {
        sender: params.sender,
        recipient: params.recipient,
        amount: params.amount,
        assetType: params.assetType,
        decimals: params.decimals,
        symbol: params.symbol,
        network: this.config.network,
      });

      this.log('Transaction built', response.data);
      return response.data as BuildTransferResult;
    } catch (error: any) {
      this.log('Build transfer failed', error);

      if (error instanceof SmoothSendError) {
        throw error;
      }

      throw new SmoothSendError(
        `Failed to build transfer: ${error.message}`,
        'BUILD_TRANSFER_FAILED',
        500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Submit a signed transaction
   * 
   * After the user signs the transaction bytes returned by buildTransfer(),
   * use this method to submit the signed transaction.
   * 
   * @param params Signed transaction bytes
   * @returns Transaction result with hash
   */
  async submitSignedTransaction(params: SubmitSignedTransactionParams): Promise<SubmitTransactionResult> {
    this.log('Submitting signed transaction');

    if (!params.transactionBytes || !params.authenticatorBytes) {
      throw new SmoothSendError(
        'Missing required parameters: transactionBytes, authenticatorBytes',
        'INVALID_PARAMETERS',
        400
      );
    }

    try {
      // Call the gasless-transaction endpoint in Legacy mode (with signed tx)
      const response = await this.httpClient.post('/api/v1/relayer/gasless-transaction', {
        transactionBytes: params.transactionBytes,
        authenticatorBytes: params.authenticatorBytes,
        network: this.config.network,
      });

      this.log('Transaction submitted', response.data);

      return {
        success: response.data.success,
        requestId: response.data.requestId,
        txHash: response.data.txnHash || response.data.txHash,
        gasUsed: response.data.gasUsed,
        vmStatus: response.data.vmStatus,
        sender: response.data.sender,
      };
    } catch (error: any) {
      this.log('Submit transaction failed', error);

      if (error instanceof SmoothSendError) {
        throw error;
      }

      throw new SmoothSendError(
        `Failed to submit transaction: ${error.message}`,
        'SUBMIT_FAILED',
        500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Complete transfer flow: build, sign, and submit
   * 
   * Convenience method that handles the entire flow.
   * Requires a wallet that can sign transactions.
   * 
   * @param params Transfer parameters
   * @param wallet Wallet with signTransaction method
   * @returns Transaction result
   * 
   * @example
   * ```typescript
   * const result = await client.transfer({
   *   sender: wallet.address,
   *   recipient: '0x123...',
   *   amount: '1000000',
   *   assetType: USDC_ADDRESS,
   *   decimals: 6,
   *   symbol: 'USDC'
   * }, wallet);
   * ```
   */
  async transfer(
    params: BuildTransferParams,
    wallet: {
      signTransaction: (txBytes: number[]) => Promise<{
        transactionBytes: number[];
        authenticatorBytes: number[];
      }>;
    }
  ): Promise<SubmitTransactionResult> {
    this.log('Starting complete transfer flow');

    // Step 1: Build transaction
    const buildResult = await this.buildTransfer(params);

    this.log('Transaction built, fee:', buildResult.fee);

    // Step 2: Sign with wallet
    const signedTx = await wallet.signTransaction(buildResult.transactionBytes);

    this.log('Transaction signed');

    // Step 3: Submit
    const result = await this.submitSignedTransaction({
      transactionBytes: signedTx.transactionBytes,
      authenticatorBytes: signedTx.authenticatorBytes,
    });

    this.log('Transfer complete', result);
    return result;
  }

  /**
   * Get current network
   */
  getNetwork(): 'testnet' | 'mainnet' {
    return this.config.network;
  }

  /**
   * Set network
   */
  setNetwork(network: 'testnet' | 'mainnet'): void {
    this.config.network = network;
    this.httpClient.setNetwork(network);
  }
}

/**
 * Create a Script Composer client (convenience function)
 */
export function createScriptComposerClient(config: ScriptComposerConfig): ScriptComposerClient {
  return new ScriptComposerClient(config);
}
