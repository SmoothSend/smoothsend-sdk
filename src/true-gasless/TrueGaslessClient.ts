/**
 * True Gasless Client
 *
 * Designed for server-side (backend) environments to securely build, sign,
 * and submit 100% sponsored gasless transactions using a Secret Key.
 *
 * @example
 * ```typescript
 * import { TrueGaslessClient } from '@smoothsend/sdk';
 * import { Account } from '@aptos-labs/ts-sdk';
 *
 * const backendWallet = Account.fromPrivateKey({ privateKey: '...' });
 * const client = new TrueGaslessClient({ apiKey: 'sk_nogas_...', network: 'mainnet' });
 *
 * const result = await client.execute({
 *   senderAccount: backendWallet,
 *   payload: {
 *     function: "0x123::my_module::mint_nft",
 *     functionArguments: []
 *   }
 * });
 *
 * console.log("Gasless NFT Minted!", result.txHash);
 * ```
 */

import { Aptos, AptosConfig, Account, InputGenerateTransactionPayloadData, Network } from '@aptos-labs/ts-sdk';
import { HttpClient } from '../utils/http';
import { SmoothSendError } from '../types/errors';

export interface TrueGaslessConfig {
  /** API key for authentication (must be sk_nogas_* for backend) */
  apiKey: string;
  /** Network to use: 'testnet' | 'mainnet' */
  network: 'testnet' | 'mainnet';
  /** Custom proxy URL (optional) */
  proxyUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface ExecuteGaslessParams {
  /** The backend sender wallet identity */
  senderAccount: Account;
  /** Raw transaction payload to execute */
  payload: InputGenerateTransactionPayloadData;
}

export interface ExecuteGaslessResult {
  success: boolean;
  requestId?: string;
  txHash?: string;
  gasUsed?: string;
  vmStatus?: string;
  sender?: string;
}

export class TrueGaslessClient {
  private httpClient: HttpClient;
  private config: Required<Omit<TrueGaslessConfig, 'proxyUrl'>> & { proxyUrl?: string };
  private aptos: Aptos;

  constructor(config: TrueGaslessConfig) {
    if (!config.apiKey) {
      throw new SmoothSendError('API key is required', 'MISSING_API_KEY', 400);
    }

    if (!config.apiKey.startsWith('sk_nogas_')) {
      console.warn(
        '⚠️ WARNING: TrueGaslessClient is intended for backend use with a Secret Key (sk_nogas_*).\n' +
        'Using a Public Key may result in CORS errors if ran in a browser environment.'
      );
    }

    if (!config.network) {
      throw new SmoothSendError('Network is required (testnet or mainnet)', 'MISSING_NETWORK', 400);
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
      includeOrigin: false, // Backend client should not send Origin header
      baseUrl: this.config.proxyUrl, // Use custom proxy URL if provided
    });

    const networkMap: Record<'testnet' | 'mainnet', Network> = {
      testnet: Network.TESTNET,
      mainnet: Network.MAINNET,
    };
    this.aptos = new Aptos(new AptosConfig({ network: networkMap[this.config.network] }));
  }

  private log(message: string, data?: any): void {
    if (this.config.debug) {
      console.log(`[TrueGaslessClient] ${message}`, data || '');
    }
  }

  /**
   * Builds, signs (as sender), and relays an arbitrary payload for complete sponsorship.
   */
  async execute(params: ExecuteGaslessParams): Promise<ExecuteGaslessResult> {
    this.log('Starting gasless execution', { sender: params.senderAccount.accountAddress.toString(), payload: params.payload });

    if (!params.senderAccount || !params.payload) {
      throw new SmoothSendError(
        'Missing required parameters: senderAccount and payload',
        'INVALID_PARAMETERS',
        400
      );
    }

    try {
      this.log('Building simple transaction with fee payer enabled');
      // Build the transaction and flag it requires a remote fee payer
      const transaction = await this.aptos.transaction.build.simple({
        sender: params.senderAccount.accountAddress,
        data: params.payload,
        withFeePayer: true,
      });

      this.log('Signing transaction locally with senderAccount');
      // Sign locally over the transaction hash
      const senderAuthenticator = this.aptos.transaction.sign({
        signer: params.senderAccount,
        transaction,
      });

      this.log('Serializing to bytes for relayer transmission');
      // Convert to BCS bytes expected by the proxy
      const transactionBytes = Array.from(transaction.bcsToBytes());
      const authenticatorBytes = Array.from(senderAuthenticator.bcsToBytes());

      this.log('Sending to relayer...');
      const response = await this.httpClient.post('/api/v1/relayer/gasless-transaction', {
        transactionBytes,
        authenticatorBytes,
        network: this.config.network,
        functionName: 'function' in params.payload ? params.payload.function : 'unknown',
      });

      this.log('Relayer submission successful', response.data);

      return {
        success: response.data.success ?? true,
        requestId: response.data.requestId,
        txHash: response.data.txnHash || response.data.txHash,
        gasUsed: response.data.gasUsed,
        vmStatus: response.data.vmStatus,
        sender: response.data.sender || params.senderAccount.accountAddress.toString(),
      };
    } catch (error: any) {
      this.log('Gasless execution failed', error);

      if (error instanceof SmoothSendError) {
        throw error;
      }

      throw new SmoothSendError(
        `Failed to execute gasless transaction: ${error.message}`,
        'EXECUTION_FAILED',
        500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Expose the core Aptos instance to allow backend developers to access chain state if needed
   */
  getAptosClient(): Aptos {
    return this.aptos;
  }
}

/**
 * Helper to initialize TrueGaslessClient
 */
export function createTrueGaslessClient(config: TrueGaslessConfig): TrueGaslessClient {
  return new TrueGaslessClient(config);
}
