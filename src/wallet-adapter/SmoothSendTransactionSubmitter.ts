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

/**
 * Minimal type definitions for Aptos SDK compatibility
 * These match the @aptos-labs/ts-sdk types without requiring it as a dependency
 */

/** Represents an Aptos configuration object */
export interface AptosConfig {
  network?: string;
  fullnode?: string;
  [key: string]: unknown;
}

/** Represents a pending transaction response */
export interface PendingTransactionResponse {
  hash: string;
  sender: string;
  sequence_number: string;
  max_gas_amount: string;
  gas_unit_price: string;
  expiration_timestamp_secs: string;
  payload: unknown;
  signature?: unknown;
  type?: string;
}

/** Represents a serializable transaction */
export interface SerializableTransaction {
  bcsToBytes(): Uint8Array;
  rawTransaction?: {
    sender?: { toString(): string };
    sequence_number?: { toString(): string };
    max_gas_amount?: { toString(): string };
    gas_unit_price?: { toString(): string };
    expiration_timestamp_secs?: { toString(): string };
  };
}

/** Represents an account authenticator */
export interface SerializableAuthenticator {
  bcsToBytes(): Uint8Array;
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
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
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
 * TransactionSubmitter interface compatible with @aptos-labs/ts-sdk
 * This interface allows the SmoothSendTransactionSubmitter to work as a drop-in
 * replacement for the default transaction submitter in the Aptos Wallet Adapter.
 */
export interface TransactionSubmitter {
  submitTransaction(args: {
    aptosConfig: AptosConfig;
    transaction: SerializableTransaction;
    senderAuthenticator: SerializableAuthenticator;
    feePayerAuthenticator?: SerializableAuthenticator;
    additionalSignersAuthenticators?: Array<SerializableAuthenticator>;
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
  private readonly debug: boolean;

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
    this.debug = config.debug || false;
  }

  /**
   * Submit a transaction through SmoothSend's gasless relayer
   * 
   * This method is called automatically by the Aptos Wallet Adapter when
   * you use signAndSubmitTransaction. The transaction is submitted to
   * SmoothSend's relayer which sponsors the gas fees.
   */
  async submitTransaction(args: {
    aptosConfig: AptosConfig;
    transaction: SerializableTransaction;
    senderAuthenticator: SerializableAuthenticator;
    feePayerAuthenticator?: SerializableAuthenticator;
    additionalSignersAuthenticators?: Array<SerializableAuthenticator>;
    pluginParams?: Record<string, unknown>;
  }): Promise<PendingTransactionResponse> {
    const { transaction, senderAuthenticator, pluginParams } = args;

    if (this.debug) {
      console.log('[SmoothSend] Submitting gasless transaction:', {
        sender: transaction.rawTransaction?.sender?.toString(),
        network: this.network,
      });
    }

    try {
      // Serialize transaction and authenticator to bytes
      const transactionBytes = Array.from(transaction.bcsToBytes());
      const authenticatorBytes = Array.from(senderAuthenticator.bcsToBytes());

      // Prepare request payload
      const payload = {
        transactionBytes,
        authenticatorBytes,
        network: this.network,
        functionName: pluginParams?.functionName || 'unknown',
      };

      // Make request to SmoothSend gateway
      const response = await this.makeRequest('/aptos/gasless-transaction', payload);

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
   * Make an HTTP request to the SmoothSend gateway
   */
  private async makeRequest(endpoint: string, payload: Record<string, unknown>): Promise<RelayerResponse> {
    const url = `${this.gatewayUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'X-Chain': `aptos-${this.network}`,
    };

    // Add Origin header for public keys in browser
    if (this.apiKey.startsWith('pk_nogas_') && typeof window !== 'undefined') {
      headers['Origin'] = window.location.origin;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
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

  /**
   * Get the current configuration
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
